import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { safeParseJsonObject } from '@/lib/json-repair'
import { getArtStylePrompt } from '@/lib/constants'
import { parsePanelCharacterReferences, findCharacterByName } from '@/lib/workers/handlers/image-task-handler-shared'
import { parseLocationAvailableSlots } from '@/lib/location-available-slots'
import type { Locale } from '@/i18n/routing'
import fs from 'fs/promises'
import path from 'path'

export type RefineResult = {
  panelId: string
  panelIndex: number
  panelNumber: number | null
  status: 'ok' | 'skipped' | 'error'
  imagePrompt?: string
  videoPrompt?: string
  error?: string
}

function pickAppearanceDescription(appearance: {
  descriptions?: string | null
  description?: string | null
  selectedIndex?: number | null
}): string {
  const descriptions = (() => {
    if (!appearance.descriptions) return []
    try {
      const parsed = JSON.parse(appearance.descriptions)
      return Array.isArray(parsed) ? parsed.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0) : []
    } catch {
      return []
    }
  })()
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    const selected = descriptions[selectedIndex] || descriptions[0]
    if (selected && selected.trim()) return selected.trim()
  }
  if (typeof appearance.description === 'string' && appearance.description.trim()) {
    return appearance.description.trim()
  }
  return '无描述'
}

type PanelRecord = {
  id: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string | null
  srtSegment: string | null
  duration: number | null
  photographyRules: string | null
  actingNotes: string | null
  imagePrompt: string | null
  videoPrompt: string | null
}

type DebugEntry = {
  panelId: string
  panelIndex: number
  panelNumber: number | null
  status: 'ok' | 'skipped' | 'error'
  model: string
  styleText: string
  promptFilled: string
  promptFilledLength: number
  llmRawResponse: string
  llmRawResponseLength: number
  parsedImagePrompt: string
  parsedVideoPrompt: string
  error: string | null
  durationMs: number
}

async function writeDebugFile(episodeId: string, entries: DebugEntry[]) {
  const debugDir = path.join(process.cwd(), 'temp', 'prompt-debug')
  await fs.mkdir(debugDir, { recursive: true })
  const filePath = path.join(debugDir, `refine-${episodeId.slice(0, 8)}.json`)
  const payload = {
    savedAt: new Date().toISOString(),
    episodeId,
    totalPanels: entries.length,
    okCount: entries.filter((e) => e.status === 'ok').length,
    errorCount: entries.filter((e) => e.status === 'error').length,
    entries,
  }
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
}

export async function refinePanelPrompts(params: {
  projectId: string
  episodeId: string
  userId: string
  model: string
  locale: Locale
  artStyle: string | null | undefined
  panelIds?: string[]
  onPanelStart?: (panelId: string, index: number, total: number) => void
}): Promise<RefineResult[]> {
  const { projectId, episodeId, userId, model, locale, artStyle, panelIds, onPanelStart } = params

  const styleText = getArtStylePrompt(artStyle, locale === 'zh' ? 'zh' : 'en') || 'Japanese anime style'

  const debugEntries: DebugEntry[] = []

  const storyboards = await prisma.novelPromotionStoryboard.findMany({
    where: { episodeId },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const allPanels: PanelRecord[] = []
  for (const sb of storyboards) {
    for (const p of sb.panels) {
      allPanels.push(p)
    }
  }

  let filteredPanels = allPanels
  if (panelIds && panelIds.length > 0) {
    const idSet = new Set(panelIds)
    filteredPanels = allPanels.filter((p) => idSet.has(p.id))
  }

  const projectData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })

  const characters = (projectData?.characters || []) as Array<{
    name: string
    appearances: Array<{
      changeReason: string
      description: string | null
      descriptions: string | null
      selectedIndex: number | null
    }>
  }>
  const locations = (projectData?.locations || []) as Array<{
    name: string
    images?: Array<{
      description: string | null
      isSelected: boolean
      availableSlots?: string | null
    }>
  }>

  const results: RefineResult[] = []
  let previousEnrichedChars: Array<{
    name: string
    appearance: string
    screen_position: string
    posture: string
    acting: string
  }> | null = null

  for (let i = 0; i < filteredPanels.length; i++) {
    const panel = filteredPanels[i]
    const total = filteredPanels.length
    const startMs = Date.now()
    onPanelStart?.(panel.id, i, total)

    try {
      const charRefs = parsePanelCharacterReferences(panel.characters)

      const characterResources = charRefs.map((ref) => {
        const char = findCharacterByName(characters, ref.name)
        if (!char) return { name: ref.name, appearance: ref.appearance || null, description: '无角色数据' }
        const appearances = char.appearances || []
        const matchedAppearance =
          ref.appearance
            ? appearances.find((a) => a.changeReason.toLowerCase() === ref.appearance!.toLowerCase())
            : null
        const appearance = matchedAppearance || appearances[0]
        return {
          name: char.name,
          appearance: appearance?.changeReason || null,
          description: appearance ? pickAppearanceDescription(appearance) : '无角色外貌数据',
        }
      })

      const locationResource = (() => {
        if (!panel.location) return null
        const loc = locations.find((l) => l.name.toLowerCase() === panel.location!.toLowerCase())
        if (!loc) return null
        const images = loc.images || []
        const selectedImage = images.find((img) => img.isSelected) || images[0]
        return {
          name: loc.name,
          description: selectedImage?.description || null,
          availableSlots: selectedImage?.availableSlots ? parseLocationAvailableSlots(selectedImage.availableSlots) : [],
        }
      })()

      const photoRules = (() => {
        if (!panel.photographyRules) return null
        try { return JSON.parse(panel.photographyRules) } catch { return null }
      })()

      const actingNotes = (() => {
        if (!panel.actingNotes) return null
        try { return JSON.parse(panel.actingNotes) } catch { return null }
      })()

      const charDetails = charRefs.map((ref) => {
        const photo = photoRules?.characters?.find((c: Record<string, string>) =>
          c.name?.toLowerCase() === ref.name.toLowerCase())
        const acting = actingNotes?.characters?.find((c: Record<string, string>) =>
          c.name?.toLowerCase() === ref.name.toLowerCase())
        return {
          name: ref.name,
          appearance: ref.appearance || '',
          screen_position: photo?.screen_position || '',
          posture: photo?.posture || '',
          acting: acting?.acting || '',
        }
      })

      const currentPanelJson = JSON.stringify({
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        shotType: panel.shotType || '',
        cameraMove: panel.cameraMove || '',
        description: panel.description || '',
        location: panel.location || '',
        srtSegment: panel.srtSegment || '',
        duration: panel.duration,
        characters: charDetails,
        photographyRules: photoRules ? {
          lighting: photoRules.lighting || null,
          depth_of_field: photoRules.depth_of_field || null,
          color_tone: photoRules.color_tone || null,
        } : null,
      })

      const previousPanelJson = i > 0 && filteredPanels[i - 1]
        ? JSON.stringify({
            panelIndex: filteredPanels[i - 1].panelIndex,
            location: filteredPanels[i - 1].location || '',
            characters: previousEnrichedChars || [],
            duration: filteredPanels[i - 1].duration,
            imagePrompt: filteredPanels[i - 1].imagePrompt || '',
            videoPrompt: filteredPanels[i - 1].videoPrompt || '',
          })
        : 'null'

      const characterResourcesJson = JSON.stringify(characterResources)
      const locationResourceJson = locationResource ? JSON.stringify(locationResource) : 'null'

      const fullPrompt = buildPrompt({
        promptId: PROMPT_IDS.NP_PROMPT_REFINER,
        locale,
        variables: {
          current_panel_json: currentPanelJson,
          previous_panel_json: previousPanelJson,
          character_resources_json: characterResourcesJson,
          location_resource_json: locationResourceJson,
          style: styleText,
        },
      })

      const result = await executeAiTextStep({
        userId,
        model,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.7,
        projectId,
        action: 'refine_panel_prompt',
        meta: {
          stepId: 'refine_prompt',
          stepTitle: `Refine panel ${panel.panelIndex + 1}`,
          stepIndex: i + 1,
          stepTotal: total,
        },
      })

      const parsed = safeParseJsonObject(result.text) as Record<string, unknown> | null
      if (!parsed || typeof parsed.image_prompt !== 'string' || !parsed.image_prompt.trim()) {
        throw new Error('Invalid LLM response: missing image_prompt')
      }

      const imagePrompt = parsed.image_prompt.trim()
      const videoPrompt = typeof parsed.video_prompt === 'string' ? parsed.video_prompt.trim() : ''

      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: {
          imagePrompt,
          videoPrompt,
        },
      })

      filteredPanels[i] = { ...panel, imagePrompt, videoPrompt }
      previousEnrichedChars = charDetails

      debugEntries.push({
        panelId: panel.id,
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        status: 'ok',
        model,
        styleText,
        promptFilled: fullPrompt,
        promptFilledLength: fullPrompt.length,
        llmRawResponse: result.text,
        llmRawResponseLength: result.text.length,
        parsedImagePrompt: imagePrompt,
        parsedVideoPrompt: videoPrompt,
        error: null,
        durationMs: Date.now() - startMs,
      })

      results.push({
        panelId: panel.id,
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        status: 'ok',
        imagePrompt,
        videoPrompt,
      })
    } catch (err) {
      debugEntries.push({
        panelId: panel.id,
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        status: 'error',
        model,
        styleText,
        promptFilled: '',
        promptFilledLength: 0,
        llmRawResponse: '',
        llmRawResponseLength: 0,
        parsedImagePrompt: '',
        parsedVideoPrompt: '',
        error: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - startMs,
      })

      results.push({
        panelId: panel.id,
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  await writeDebugFile(episodeId, debugEntries)

  return results
}
