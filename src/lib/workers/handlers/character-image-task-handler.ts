import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { CHARACTER_ASSET_IMAGE_RATIO, addCharacterPromptSuffix, getArtStylePrompt, isArtStyleValue, PRIMARY_APPEARANCE_INDEX, type ArtStyleValue } from '@/lib/constants'
import { type TaskJobData } from '@/lib/task/types'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  toSignedUrlIfCos,
} from '../utils'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  generateProjectLabeledImageToStorage,
  parseImageUrls,
  parseJsonStringArray,
  pickFirstString,
} from './image-task-handler-shared'

function resolvePayloadArtStyle(payload: AnyObj): ArtStyleValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'artStyle')) return undefined
  const parsedArtStyle = typeof payload.artStyle === 'string' ? payload.artStyle.trim() : ''
  if (!isArtStyleValue(parsedArtStyle)) {
    throw new Error('Invalid artStyle in IMAGE_CHARACTER payload')
  }
  return parsedArtStyle
}

interface CharacterAppearanceRecord {
  id: string
  characterId: string
  appearanceIndex: number
  descriptions: string | null
  description: string | null
  imageUrls: string | null
  selectedIndex: number | null
  imageUrl: string | null
  changeReason: string | null
}

interface CharacterAppearanceWithCharacter extends CharacterAppearanceRecord {
  character: {
    name: string
  }
}

interface CharacterRecord {
  id: string
  name: string
  appearances: CharacterAppearanceRecord[]
}

interface PrimaryAppearanceRecord {
  imageUrl: string | null
  imageUrls: string | null
}

interface CharacterImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceWithCharacter | null>
    findFirst(args: Record<string, unknown>): Promise<PrimaryAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  novelPromotionCharacter: {
    findUnique(args: Record<string, unknown>): Promise<CharacterRecord | null>
  }
}

async function autoGenSubAppearances(
  job: Job<TaskJobData>,
  mainAppearance: CharacterAppearanceRecord,
) {
  if (!mainAppearance.characterId) return

  const models = await getProjectModels(job.data.projectId, job.data.userId)
  const imageModel = models.characterModel || null

  const subAppearances = await prisma.characterAppearance.findMany({
    where: {
      characterId: mainAppearance.characterId,
      appearanceIndex: { gt: PRIMARY_APPEARANCE_INDEX },
      imageUrl: null,
    },
    orderBy: { appearanceIndex: 'asc' },
  })

  if (subAppearances.length === 0) return

  for (const sub of subAppearances) {
    try {
      await submitTask({
        userId: job.data.userId,
        locale: job.data.locale,
        projectId: job.data.projectId,
        type: TASK_TYPE.IMAGE_CHARACTER,
        targetType: 'CharacterAppearance',
        targetId: sub.id,
        payload: {
          appearanceId: sub.id,
          id: mainAppearance.characterId,
          imageIndex: 0,
          count: 1,
          imageModel,
          meta: { autoGen: true, subOf: mainAppearance.id },
        },
        dedupeKey: `auto_gen_character:${sub.id}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[auto-gen] sub-appearance task submit failed: ${sub.id} - ${message}`)
    }
  }
}

export async function handleCharacterImageTask(job: Job<TaskJobData>) {
  const db = prisma as unknown as CharacterImageDb
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const models = await getProjectModels(projectId, userId)
  const modelId = models.characterModel
  if (!modelId) throw new Error('Character model not configured')

  const appearanceId = pickFirstString(job.data.targetId, payload.appearanceId)
  let appearance: CharacterAppearanceRecord | null = null
  let characterName = '角色'

  if (appearanceId) {
    const appearanceWithCharacter = await db.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (appearanceWithCharacter) {
      appearance = appearanceWithCharacter
      characterName = appearanceWithCharacter.character.name
    }
  }

  const characterId = typeof payload.id === 'string' ? payload.id : null
  if (!appearance && characterId) {
    const character = await db.novelPromotionCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    appearance = character?.appearances?.[0] || null
    if (character && appearance) {
      characterName = character.name
    }
  }

  if (!appearance) throw new Error('Character appearance not found')

  const payloadArtStyle = resolvePayloadArtStyle(payload)
  const artStyle = getArtStylePrompt(payloadArtStyle ?? models.artStyle, job.data.locale)
  const descriptions = parseJsonStringArray(appearance.descriptions)
  const baseDescriptions = descriptions.length > 0 ? descriptions : [appearance.description || '']

  const primaryReferenceInputs: string[] = []
  if (appearance.appearanceIndex > PRIMARY_APPEARANCE_INDEX) {
    const primaryAppearance = await db.characterAppearance.findFirst({
      where: {
        characterId: appearance.characterId,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
      },
      select: { imageUrl: true, imageUrls: true },
    })
    if (primaryAppearance) {
      const primaryMainUrl = primaryAppearance.imageUrl
        ? toSignedUrlIfCos(primaryAppearance.imageUrl, 3600)
        : null
      if (primaryMainUrl) {
        primaryReferenceInputs.push(primaryMainUrl)
      }
    }
  } else {
    const ownImageUrl = appearance.imageUrl
      ? toSignedUrlIfCos(appearance.imageUrl, 3600)
      : null
    if (ownImageUrl) {
      primaryReferenceInputs.push(ownImageUrl)
    }
  }
  const primaryReferenceImages = await normalizeReferenceImagesForGeneration(primaryReferenceInputs)

  const singleIndex = payload.imageIndex ?? payload.descriptionIndex
  const count = normalizeImageGenerationCount('character', payload.count)
  const indexes = singleIndex !== undefined
    ? [Number(singleIndex)]
    : Array.from({ length: count }, (_value, index) => index)

  const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
  const nextImageUrls = [...imageUrls]
  const label = `${characterName} - ${appearance.changeReason || '形象'}`

  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    const raw = baseDescriptions[index] || baseDescriptions[0]
    const charPrompt = addCharacterPromptSuffix(raw, job.data.locale)
    const prompt = artStyle
      ? `${charPrompt}${job.data.locale === 'en' ? ', ' : '，'}${artStyle}`
      : charPrompt

    await reportTaskProgress(job, 15 + Math.floor((i / Math.max(indexes.length, 1)) * 55), {
      stage: 'generate_character_image',
      index,
    })

    const imageKey = await generateProjectLabeledImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      label,
      targetId: `${appearance.id}-${index}`,
      keyPrefix: 'character',
      options: {
        referenceImages: primaryReferenceImages.length > 0 ? primaryReferenceImages : undefined,
        aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
      },
    })

    while (nextImageUrls.length <= index) {
      nextImageUrls.push('')
    }
    nextImageUrls[index] = imageKey
  }

  const selectedIndex = appearance.selectedIndex
  const fallbackMain = nextImageUrls.find((url) => typeof url === 'string' && url) || appearance.imageUrl
  const mainImage = selectedIndex !== null && selectedIndex !== undefined && nextImageUrls[selectedIndex]
    ? nextImageUrls[selectedIndex]
    : fallbackMain

  await assertTaskActive(job, 'persist_character_image')
  await db.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      imageUrls: encodeImageUrls(nextImageUrls),
      imageUrl: mainImage || null,
    },
  })

  const shouldCascadeSubs =
    appearance.appearanceIndex === PRIMARY_APPEARANCE_INDEX
    && ((job.data.payload as Record<string, unknown>)?.meta as Record<string, unknown>)?.autoGen === true
  if (shouldCascadeSubs) {
    await autoGenSubAppearances(job, appearance)
  }

  return {
    appearanceId: appearance.id,
    imageCount: nextImageUrls.filter(Boolean).length,
    imageUrl: mainImage || null,
  }
}
