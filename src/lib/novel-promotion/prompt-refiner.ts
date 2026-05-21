import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { safeParseJsonObject, safeParseJsonArray } from '@/lib/json-repair'
import { getArtStylePrompt } from '@/lib/constants'
import { parsePanelCharacterReferences, findCharacterByName } from '@/lib/workers/handlers/image-task-handler-shared'
import { parseLocationAvailableSlots } from '@/lib/location-available-slots'
import type { Locale } from '@/i18n/routing'
import fs from 'fs/promises'
import path from 'path'

const WINDOW_SIZE = 8

export type RefineResult = {
  panelId: string
  panelIndex: number
  panelNumber: number | null
  status: 'ok' | 'skipped' | 'error'
  imagePrompt?: string
  videoPrompt?: string
  error?: string
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

type CharDetail = {
  name: string
  appearance: string
  screen_position: string
  posture: string
  acting: string
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

function buildCharDetails(
  charRefs: Array<{ name: string; appearance?: string }>,
  photoRules: Record<string, unknown> | null,
  actingNotes: Record<string, unknown> | null,
): CharDetail[] {
  const photoChars = (photoRules?.characters as Array<Record<string, string>> | undefined) || []
  const actingRaw = Array.isArray(actingNotes) ? actingNotes : ((actingNotes as Record<string, unknown>)?.characters as Array<Record<string, string>> || [])
  return charRefs.map((ref) => {
    const photo = photoChars.find((c) => c.name?.toLowerCase() === ref.name.toLowerCase())
    const acting = actingRaw.find((c: Record<string, string>) => c.name?.toLowerCase() === ref.name.toLowerCase())
    return {
      name: ref.name,
      appearance: ref.appearance || '',
      screen_position: photo?.screen_position || '',
      posture: photo?.posture || '',
      acting: acting?.acting || '',
    }
  })
}

function buildCharacterResources(
  charRefs: Array<{ name: string; appearance?: string }>,
  characters: Array<{
    name: string
    appearances: Array<{
      changeReason: string
      description: string | null
      descriptions: string | null
      selectedIndex: number | null
    }>
  }>,
): Array<{ name: string; appearance: string | null; description: string }> {
  return charRefs.map((ref) => {
    const char = findCharacterByName(characters, ref.name)
    if (!char) return { name: ref.name, appearance: ref.appearance || null, description: '无角色数据' }
    const appearances = char.appearances || []
    const matchedAppearance = ref.appearance
      ? appearances.find((a: { changeReason: string }) => a.changeReason.toLowerCase() === ref.appearance!.toLowerCase())
      : null
    const appearance = matchedAppearance || appearances[0]
    const fullDesc = appearance ? pickAppearanceDescription(appearance) : '无角色外貌数据'
    return {
      name: char.name,
      appearance: appearance?.changeReason || null,
      description: fullDesc,
    }
  })
}

function buildLocationResource(
  panelLocation: string | null,
  locations: Array<{
    name: string
    images?: Array<{ description: string | null; isSelected: boolean; availableSlots?: string | null }>
  }>,
): Record<string, unknown> | null {
  if (!panelLocation) return null
  const loc = locations.find((l) => l.name.toLowerCase() === panelLocation.toLowerCase())
  if (!loc) return null
  const images = loc.images || []
  const selectedImage = images.find((img) => img.isSelected) || images[0]
  return {
    name: loc.name,
    description: selectedImage?.description || null,
    availableSlots: selectedImage?.availableSlots ? parseLocationAvailableSlots(selectedImage.availableSlots) : [],
  }
}

function parseJsonUnknown(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
}

async function writeDebugFile(episodeId: string, entries: DebugEntry[]) {
  const debugDir = path.join(process.cwd(), 'temp', 'prompt-debug')
  await fs.mkdir(debugDir, { recursive: true })
  const filePath = path.join(debugDir, `refine-${episodeId.slice(0, 8)}.json`)
  await fs.writeFile(filePath, JSON.stringify({
    savedAt: new Date().toISOString(),
    episodeId,
    totalPanels: entries.length,
    okCount: entries.filter((e) => e.status === 'ok').length,
    errorCount: entries.filter((e) => e.status === 'error').length,
    entries,
  }, null, 2), 'utf-8')
}

async function refineSinglePanel(
  userId: string,
  model: string,
  panel: PanelRecord,
  prevPanel: PanelRecord | null,
  prevCharDetails: CharDetail[] | null,
  characters: Array<{
    name: string
    appearances: Array<{
      changeReason: string
      description: string | null
      descriptions: string | null
      selectedIndex: number | null
    }>
  }>,
  locations: Array<{
    name: string
    images?: Array<{ description: string | null; isSelected: boolean; availableSlots?: string | null }>
  }>,
  styleText: string,
  locale: Locale,
  projectId?: string,
): Promise<{ imagePrompt: string; videoPrompt: string; charDetails: CharDetail[] }> {
  const charRefs = parsePanelCharacterReferences(panel.characters)
  const characterResources = buildCharacterResources(charRefs, characters)
  const locationResource = buildLocationResource(panel.location, locations)
  const photoRules = parseJsonUnknown(panel.photographyRules)
  const actingNotes = parseJsonUnknown(panel.actingNotes)
  const charDetails = buildCharDetails(charRefs, photoRules, actingNotes)

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
      lighting: (photoRules as Record<string, unknown>).lighting || null,
      depth_of_field: (photoRules as Record<string, unknown>).depth_of_field || null,
      color_tone: (photoRules as Record<string, unknown>).color_tone || null,
    } : null,
    existingVideoPrompt: panel.videoPrompt || '',
  })

  // Build previous panel data from prevPanel + prevCharDetails (or compute from prevPanel raw data)
  let previousPanelJson: string = 'null'
  if (prevPanel) {
    const prevCharData = prevCharDetails
      ?? buildCharDetails(
        parsePanelCharacterReferences(prevPanel.characters),
        parseJsonUnknown(prevPanel.photographyRules),
        parseJsonUnknown(prevPanel.actingNotes),
      )
    const prevPhotoRules = parseJsonUnknown(prevPanel.photographyRules)
    previousPanelJson = JSON.stringify({
      panelIndex: prevPanel.panelIndex,
      location: prevPanel.location || '',
      shotType: prevPanel.shotType || '',
      cameraMove: prevPanel.cameraMove || '',
      characters: prevCharData,
      duration: prevPanel.duration,
      photographyRules: prevPhotoRules ? {
        lighting: (prevPhotoRules as Record<string, unknown>).lighting || null,
        depth_of_field: (prevPhotoRules as Record<string, unknown>).depth_of_field || null,
        color_tone: (prevPhotoRules as Record<string, unknown>).color_tone || null,
      } : null,
      imagePrompt: prevPanel.imagePrompt || '',
      videoPrompt: prevPanel.videoPrompt || '',
    })
  }

  const batchEntry = {
    index: 0,
    current: JSON.parse(currentPanelJson),
    previous: previousPanelJson === 'null' ? null : JSON.parse(previousPanelJson),
    characters: characterResources,
    location: locationResource,
  }

  const fullPrompt = buildPrompt({
    promptId: PROMPT_IDS.NP_PROMPT_REFINER,
    locale,
    variables: {
      panels_batch_json: JSON.stringify({
        style: styleText,
        panels: [batchEntry],
      }),
    },
  })

  const result = await executeAiTextStep({
    userId,
    model,
    messages: [{ role: 'user', content: fullPrompt }],
    temperature: 0.7,
    reasoning: false,
    projectId,
    action: 'refine_panel_prompt_single',
    meta: {
      stepId: 'refine_prompt',
      stepTitle: `Refine panel ${panel.panelIndex + 1}`,
      stepIndex: 1,
      stepTotal: 1,
    },
  })

  // Try parse as array or single object (prompt format may vary)
  let parsed: Record<string, unknown> | null = null
  try {
    const arr = safeParseJsonArray(result.text) as Record<string, unknown>[]
    if (arr.length > 0) {
      parsed = arr[0] as Record<string, unknown>
    }
  } catch {
    try {
      parsed = safeParseJsonObject(result.text) as Record<string, unknown> | null
    } catch { /* ignore */ }
  }

  if (!parsed || !parsed.image_prompt) {
    throw new Error('Invalid LLM response: missing image_prompt')
  }

  const imagePrompt = typeof parsed.image_prompt === 'string'
    ? parsed.image_prompt.trim()
    : JSON.stringify(parsed.image_prompt)

  if (!imagePrompt) {
    throw new Error('Invalid LLM response: empty image_prompt')
  }

  return {
    imagePrompt,
    videoPrompt: typeof parsed.video_prompt === 'string' ? parsed.video_prompt.trim() : '',
    charDetails,
  }
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

  if (filteredPanels.length === 0) {
    return []
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
    images?: Array<{ description: string | null; isSelected: boolean; availableSlots?: string | null }>
  }>

  const results: RefineResult[] = []
  let windowCharDetails: CharDetail[] | null = null

  for (let w = 0; w < filteredPanels.length; w += WINDOW_SIZE) {
    const windowPanels = filteredPanels.slice(w, w + WINDOW_SIZE)
    const isFirstWindow = w === 0

    // Build batch input
    const batchPanels: Array<Record<string, unknown>> = []

    for (let i = 0; i < windowPanels.length; i++) {
      const panel = windowPanels[i]
      const prevPanel = isFirstWindow && i === 0 ? null : (
        i === 0 ? filteredPanels[w - 1] : windowPanels[i - 1]
      )

      const charRefs = parsePanelCharacterReferences(panel.characters)
      const characterResources = buildCharacterResources(charRefs, characters)
      const locationResource = buildLocationResource(panel.location, locations)
      const photoRules = parseJsonUnknown(panel.photographyRules)
      const prevPhotoRules = prevPanel ? parseJsonUnknown(prevPanel.photographyRules) : null

      batchPanels.push({
        index: i,
        current: {
          panelIndex: panel.panelIndex,
          panelNumber: panel.panelNumber,
          shotType: panel.shotType || '',
          cameraMove: panel.cameraMove || '',
          description: panel.description || '',
          location: panel.location || '',
          srtSegment: panel.srtSegment || '',
          duration: panel.duration,
          characters: buildCharDetails(charRefs, photoRules, parseJsonUnknown(panel.actingNotes)),
          photographyRules: photoRules ? {
            lighting: (photoRules as Record<string, unknown>).lighting || null,
            depth_of_field: (photoRules as Record<string, unknown>).depth_of_field || null,
            color_tone: (photoRules as Record<string, unknown>).color_tone || null,
          } : null,
          existingVideoPrompt: panel.videoPrompt || '',
        },
        previous: prevPanel ? {
          panelIndex: prevPanel.panelIndex,
          location: prevPanel.location || '',
          shotType: prevPanel.shotType || '',
          cameraMove: prevPanel.cameraMove || '',
          characters: (() => {
            const refs = parsePanelCharacterReferences(prevPanel.characters)
            const rules = parseJsonUnknown(prevPanel.photographyRules)
            return buildCharDetails(refs, rules, parseJsonUnknown(prevPanel.actingNotes))
          })(),
          duration: prevPanel.duration,
          photographyRules: prevPhotoRules ? {
            lighting: (prevPhotoRules as Record<string, unknown>).lighting || null,
            depth_of_field: (prevPhotoRules as Record<string, unknown>).depth_of_field || null,
            color_tone: (prevPhotoRules as Record<string, unknown>).color_tone || null,
          } : null,
          imagePrompt: prevPanel.imagePrompt || '',
          videoPrompt: prevPanel.videoPrompt || '',
        } : null,
        characters: characterResources,
        location: locationResource,
      })
    }

    const batchInput = {
      style: styleText,
      panels: batchPanels,
    }

    const batchPrompt = buildPrompt({
      promptId: PROMPT_IDS.NP_PROMPT_REFINER,
      locale,
      variables: {
        panels_batch_json: JSON.stringify(batchInput),
      },
    })

    const startMs = Date.now()

    try {
      // Notify start for all panels in window
      for (let i = 0; i < windowPanels.length; i++) {
        onPanelStart?.(windowPanels[i].id, w + i, filteredPanels.length)
      }

      const result = await executeAiTextStep({
        userId,
        model,
        messages: [{ role: 'user', content: batchPrompt }],
        temperature: 0.7,
        reasoning: false,
        projectId,
        action: 'refine_panel_prompt_batch',
        meta: {
          stepId: 'refine_prompt_batch',
          stepTitle: `Refine panels ${w + 1}-${Math.min(w + WINDOW_SIZE, filteredPanels.length)}`,
          stepIndex: Math.floor(w / WINDOW_SIZE) + 1,
          stepTotal: Math.ceil(filteredPanels.length / WINDOW_SIZE),
        },
      })

      const parsedArray = safeParseJsonArray(result.text) as Record<string, unknown>[]

      if (!Array.isArray(parsedArray) || parsedArray.length !== windowPanels.length) {
        throw new Error(`Batch result length mismatch: expected ${windowPanels.length}, got ${parsedArray?.length || 0}`)
      }

      // Update DB
      const updates = windowPanels.map((panel, i) => {
        const item = parsedArray[i]
        const rawImagePrompt = item?.image_prompt
        const imagePrompt = typeof rawImagePrompt === 'string'
          ? rawImagePrompt.trim()
          : rawImagePrompt ? JSON.stringify(rawImagePrompt) : ''
        const videoPrompt = typeof item?.video_prompt === 'string' ? item.video_prompt.trim() : ''

        if (!imagePrompt) {
          throw new Error(`Panel ${panel.panelIndex}: missing image_prompt in batch result`)
        }

        return {
          panel,
          imagePrompt,
          videoPrompt,
        }
      })

      await prisma.$transaction(
        updates.map(({ panel, imagePrompt, videoPrompt }) =>
          prisma.novelPromotionPanel.update({
            where: { id: panel.id },
            data: { imagePrompt, videoPrompt },
          })
        )
      )

      // Update tracking + build results
      for (let i = 0; i < windowPanels.length; i++) {
        const panel = windowPanels[i]
        const item = parsedArray[i]
        const rawImagePrompt = item?.image_prompt
        const imagePrompt = typeof rawImagePrompt === 'string'
          ? rawImagePrompt.trim()
          : rawImagePrompt ? JSON.stringify(rawImagePrompt) : ''
        const videoPrompt = typeof item?.video_prompt === 'string' ? item.video_prompt.trim() : ''

        windowPanels[i] = { ...panel, imagePrompt, videoPrompt }
        filteredPanels[w + i] = windowPanels[i]

        debugEntries.push({
          panelId: panel.id,
          panelIndex: panel.panelIndex,
          panelNumber: panel.panelNumber,
          status: 'ok',
          model,
          styleText,
          promptFilled: JSON.stringify(batchInput),
          promptFilledLength: batchPrompt.length,
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
      }

      // Update character details from last panel for cross-window continuity
      const lastPanel = windowPanels[windowPanels.length - 1]
      const refs = parsePanelCharacterReferences(lastPanel.characters)
      const rules = parseJsonUnknown(lastPanel.photographyRules)
      windowCharDetails = buildCharDetails(refs, rules, parseJsonUnknown(lastPanel.actingNotes))
    } catch (batchErr) {
      const errMsg = batchErr instanceof Error ? batchErr.message : String(batchErr)
      // Fallback: refine each panel individually
      for (let i = 0; i < windowPanels.length; i++) {
        const panel = windowPanels[i]
        const prevPanel = i > 0 ? windowPanels[i - 1] : (w > 0 ? filteredPanels[w - 1] : null)
        const attemptStartMs = Date.now()
        onPanelStart?.(panel.id, w + i, filteredPanels.length)

        try {
          const { imagePrompt, videoPrompt, charDetails } = await refineSinglePanel(
            userId, model, panel, prevPanel, i > 0 ? null : windowCharDetails,
            characters, locations, styleText, locale, projectId,
          )

          await prisma.novelPromotionPanel.update({
            where: { id: panel.id },
            data: { imagePrompt, videoPrompt },
          })

          windowPanels[i] = { ...panel, imagePrompt, videoPrompt }
          filteredPanels[w + i] = windowPanels[i]

          if (i === windowPanels.length - 1) {
            windowCharDetails = charDetails
          }

          debugEntries.push({
            panelId: panel.id,
            panelIndex: panel.panelIndex,
            panelNumber: panel.panelNumber,
            status: 'ok',
            model,
            styleText,
            promptFilled: '(fallback single)',
            promptFilledLength: 0,
            llmRawResponse: `[fallback after batch error]`,
            llmRawResponseLength: 0,
            parsedImagePrompt: imagePrompt,
            parsedVideoPrompt: videoPrompt,
            error: null,
            durationMs: Date.now() - attemptStartMs,
          })

          results.push({
            panelId: panel.id,
            panelIndex: panel.panelIndex,
            panelNumber: panel.panelNumber,
            status: 'ok',
            imagePrompt,
            videoPrompt,
          })
        } catch (singleErr) {
          const singleErrMsg = singleErr instanceof Error ? singleErr.message : String(singleErr)

          debugEntries.push({
            panelId: panel.id,
            panelIndex: panel.panelIndex,
            panelNumber: panel.panelNumber,
            status: 'error',
            model,
            styleText,
            promptFilled: '(fallback single)',
            promptFilledLength: 0,
            llmRawResponse: '',
            llmRawResponseLength: 0,
            parsedImagePrompt: '',
            parsedVideoPrompt: '',
            error: singleErrMsg,
            durationMs: Date.now() - attemptStartMs,
          })

          results.push({
            panelId: panel.id,
            panelIndex: panel.panelIndex,
            panelNumber: panel.panelNumber,
            status: 'error',
            error: singleErrMsg,
          })
        }
      }
    }
  }

  await writeDebugFile(episodeId, debugEntries)

  return results
}
