import { Worker, type Job } from 'bullmq'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { getUserWorkflowConcurrencyConfig } from '@/lib/config-service'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { withUserConcurrencyGate } from './user-concurrency-gate'
import {
  assertTaskActive,
  getProjectModels,
  resolveLipSyncVideoSource,
  resolveVideoSourceFromGeneration,
  toSignedUrlIfCos,
  uploadVideoSourceToCos,
} from './utils'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { mergePanel, concatAll, ensureFfmpeg } from '@/lib/video-compositor'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import { getProviderConfig } from '@/lib/api-config'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.novelPromotionPanel.findUnique>>>

function parseJsonField<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

function buildVideoPrompt(panel: PanelRecord): string | null {
  const actingNotes = parseJsonField<{ characters: Array<{ name: string; acting: string }> }>(panel.actingNotes)
  const photoRules = parseJsonField<{ characters: Array<{ name: string; screen_position: string }> }>(panel.photographyRules)
  const panelChars = parseJsonField<Array<{ name: string }>>(panel.characters)

  if (!actingNotes?.characters?.length) return null

  const photoMap = new Map<string, string>()
  for (const c of photoRules?.characters || []) {
    photoMap.set(c.name.toLowerCase(), c.screen_position)
  }

  const charOrder = (panelChars || []).map(c => c.name.toLowerCase())
  const sorted = [...actingNotes.characters].sort((a, b) => {
    const ai = charOrder.indexOf(a.name.toLowerCase())
    const bi = charOrder.indexOf(b.name.toLowerCase())
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  const lines = sorted.map(c => {
    const pos = photoMap.get(c.name.toLowerCase())
    return `${c.name}${pos ? `（${pos}）` : ''}：${c.acting}`
  })

  if (panel.cameraMove && panel.cameraMove !== '固定') {
    lines.push(`Camera: ${panel.cameraMove}`)
  }

  return lines.join('\n')
}

/** Convert panel duration (seconds) to milliseconds precisely. No heuristic. */
function panelDurationToMs(durationSeconds: number | null | undefined): number | undefined {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined
  return Math.round(durationSeconds * 1000)
}

function extractGenerationOptions(payload: AnyObj): VideoOptionMap {
  const fromEnvelope = payload.generationOptions
  if (!fromEnvelope || typeof fromEnvelope !== 'object' || Array.isArray(fromEnvelope)) {
    return {}
  }

  const next: VideoOptionMap = {}
  for (const [key, value] of Object.entries(fromEnvelope as Record<string, unknown>)) {
    if (key === 'aspectRatio') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value
    }
  }
  return next
}

async function fetchPanelByStoryboardIndex(storyboardId: string, panelIndex: number) {
  return await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex,
    },
  })
}

async function getPanelForVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj

  // 优先使用 targetType=NovelPromotionPanel 直接定位
  if (job.data.targetType === 'NovelPromotionPanel') {
    const panel = await prisma.novelPromotionPanel.findUnique({ where: { id: job.data.targetId } })
    if (!panel) throw new Error('Panel not found')
    return panel
  }

  // 兜底：通过 storyboardId + panelIndex 定位
  const storyboardId = payload.storyboardId
  const panelIndex = payload.panelIndex
  if (typeof storyboardId !== 'string' || !storyboardId || panelIndex === undefined || panelIndex === null) {
    throw new Error('Missing storyboardId/panelIndex for video task')
  }

  const panel = await fetchPanelByStoryboardIndex(storyboardId, Number(panelIndex))
  if (!panel) throw new Error('Panel not found by storyboardId/panelIndex')
  return panel
}

async function generateVideoForPanel(
  job: Job<TaskJobData>,
  panel: PanelRecord,
  payload: AnyObj,
  modelId: string,
  projectVideoRatio: string | null | undefined,
  generationOptions: VideoOptionMap,
): Promise<{ cosKey: string; generationMode: VideoGenerationMode; actualVideoTokens?: number }> {
  if (!panel.imageUrl) {
    throw new Error(`Panel ${panel.id} has no imageUrl`)
  }

  const firstLastFramePayload =
    typeof payload.firstLastFrame === 'object' && payload.firstLastFrame !== null
      ? (payload.firstLastFrame as AnyObj)
      : null
  const firstLastCustomPrompt = typeof firstLastFramePayload?.customPrompt === 'string' ? firstLastFramePayload.customPrompt : null
  const persistedFirstLastPrompt = firstLastFramePayload ? panel.firstLastFramePrompt : null
  const customPrompt = typeof payload.customPrompt === 'string' ? payload.customPrompt : null
  const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || buildVideoPrompt(panel) || panel.description
  if (!prompt) {
    throw new Error(`Panel ${panel.id} has no video prompt`)
  }

  const fs = await import('fs/promises')
  const pathMod = await import('path')
  const debugDir = 'temp/prompt-debug'
  await fs.mkdir(debugDir, { recursive: true })
  await fs.writeFile(pathMod.join(debugDir, `video-prompt-${panel.id}.txt`), prompt, 'utf-8')

  const sourceImageUrl = toSignedUrlIfCos(panel.imageUrl, 3600)
  if (!sourceImageUrl) {
    throw new Error(`Panel ${panel.id} image url invalid`)
  }
  const sourceImageBase64 = await normalizeToBase64ForGeneration(sourceImageUrl)

  let lastFrameImageBase64: string | undefined
  const generationMode: VideoGenerationMode = firstLastFramePayload ? 'firstlastframe' : 'normal'
  const requestedGenerateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : undefined
  let model = modelId

  if (firstLastFramePayload) {
    model =
      typeof firstLastFramePayload.flModel === 'string' && firstLastFramePayload.flModel
        ? firstLastFramePayload.flModel
        : modelId
    const firstLastFrameCapabilities = resolveBuiltinCapabilitiesByModelKey('video', model)
    // Only check for models with built-in capabilities; skip for custom providers
    if (firstLastFrameCapabilities && firstLastFrameCapabilities?.video?.firstlastframe !== true) {
      throw new Error(`VIDEO_FIRSTLASTFRAME_MODEL_UNSUPPORTED: ${model}`)
    }
    if (
      typeof firstLastFramePayload.lastFrameStoryboardId === 'string' &&
      firstLastFramePayload.lastFrameStoryboardId &&
      firstLastFramePayload.lastFramePanelIndex !== undefined
    ) {
      const lastPanel = await fetchPanelByStoryboardIndex(
        firstLastFramePayload.lastFrameStoryboardId,
        Number(firstLastFramePayload.lastFramePanelIndex),
      )
      if (lastPanel?.imageUrl) {
        const lastFrameUrl = toSignedUrlIfCos(lastPanel.imageUrl, 3600)
        if (lastFrameUrl) {
          lastFrameImageBase64 = await normalizeToBase64ForGeneration(lastFrameUrl)
        }
      }
    }
  }

  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: model,
    imageUrl: sourceImageBase64,
    options: {
      prompt,
      ...(projectVideoRatio ? { aspectRatio: projectVideoRatio } : {}),
      ...generationOptions,
      ...(typeof generationOptions.duration === 'number' ? {} : typeof panel.duration === 'number' ? { duration: panel.duration } : {}),
      generationMode,
      ...(typeof requestedGenerateAudio === 'boolean' ? { generateAudio: requestedGenerateAudio } : {}),
      ...(lastFrameImageBase64 ? { lastFrameImageUrl: lastFrameImageBase64 } : {}),
    },
  })

  let downloadHeaders: Record<string, string> | undefined
  const videoSource = generatedVideo.url
  if (generatedVideo.downloadHeaders) {
    downloadHeaders = generatedVideo.downloadHeaders
  } else if (typeof videoSource === 'string') {
    const parsedModel = parseModelKeyStrict(model)
    const isGoogleDownloadUrl = videoSource.includes('generativelanguage.googleapis.com/')
      && videoSource.includes('/files/')
      && videoSource.includes(':download')
    if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
      const { apiKey } = await getProviderConfig(job.data.userId, 'google')
      downloadHeaders = { 'x-goog-api-key': apiKey }
    }
  }

  const cosKey = await uploadVideoSourceToCos(videoSource, 'panel-video', panel.id, downloadHeaders)
  return {
    cosKey,
    generationMode,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}

async function handleVideoPanelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectModels = await getProjectModels(job.data.projectId, job.data.userId)

  const modelId = typeof payload.videoModel === 'string' ? payload.videoModel.trim() : ''
  if (!modelId) throw new Error('VIDEO_MODEL_REQUIRED: payload.videoModel is required')

  const panel = await getPanelForVideoTask(job)

  const generationOptions = extractGenerationOptions(payload)

  await reportTaskProgress(job, 10, {
    stage: 'generate_panel_video',
    panelId: panel.id,
  })

  const { cosKey, generationMode, actualVideoTokens } = await generateVideoForPanel(
    job,
    panel,
    payload,
    modelId,
    projectModels.videoRatio,
    generationOptions,
  )

  await assertTaskActive(job, 'persist_panel_video')
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      videoUrl: cosKey,
      videoGenerationMode: generationMode,
    },
  })

  return {
    panelId: panel.id,
    videoUrl: cosKey,
    ...(typeof actualVideoTokens === 'number' ? { actualVideoTokens } : {}),
  }
}

async function handleLipSyncTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const lipSyncModel = typeof payload.lipSyncModel === 'string' && payload.lipSyncModel.trim()
    ? payload.lipSyncModel.trim()
    : undefined

  let panel: PanelRecord | null = null
  if (job.data.targetType === 'NovelPromotionPanel') {
    panel = await prisma.novelPromotionPanel.findUnique({ where: { id: job.data.targetId } })
  }

  if (
    !panel &&
    typeof payload.storyboardId === 'string' &&
    payload.storyboardId &&
    payload.panelIndex !== undefined
  ) {
    panel = await fetchPanelByStoryboardIndex(payload.storyboardId, Number(payload.panelIndex))
  }

  if (!panel) throw new Error('Lip-sync panel not found')
  if (!panel.videoUrl) throw new Error('Panel has no base video')

  const voiceLineId = typeof payload.voiceLineId === 'string' ? payload.voiceLineId : null
  if (!voiceLineId) throw new Error('Lip-sync task missing voiceLineId')

  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({ where: { id: voiceLineId } })
  if (!voiceLine || !voiceLine.audioUrl) {
    throw new Error('Voice line or audioUrl not found')
  }

  const signedVideoUrl = toSignedUrlIfCos(panel.videoUrl, 7200)
  const signedAudioUrl = toSignedUrlIfCos(voiceLine.audioUrl, 7200)

  if (!signedVideoUrl || !signedAudioUrl) {
    throw new Error('Lip-sync input media url invalid')
  }

  await reportTaskProgress(job, 25, { stage: 'submit_lip_sync' })

  const source = await resolveLipSyncVideoSource(job, {
    userId: job.data.userId,
    videoUrl: signedVideoUrl,
    audioUrl: signedAudioUrl,
    audioDurationMs: typeof voiceLine.audioDuration === 'number' ? voiceLine.audioDuration : undefined,
    videoDurationMs: panelDurationToMs(panel.duration),
    modelKey: lipSyncModel,
  })

  await reportTaskProgress(job, 93, { stage: 'persist_lip_sync' })

  const cosKey = await uploadVideoSourceToCos(source, 'lip-sync', panel.id)

  await assertTaskActive(job, 'persist_lip_sync_video')
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      lipSyncVideoUrl: cosKey,
      lipSyncTaskId: null,
    },
  })

  return {
    panelId: panel.id,
    voiceLineId,
    lipSyncVideoUrl: cosKey,
  }
}

async function handleMergeVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const episodeId = job.data.episodeId
  if (!episodeId) throw new Error('MERGE_VIDEO task missing episodeId')

  const narratorEnabled = payload.narratorEnabled as boolean
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waoowaoo-merge-'))

  try {
    ensureFfmpeg()
    await reportTaskProgress(job, 5, { stage: 'merge_start', episodeId })

    // Fetch the episode panels in storyboard order.
    const panels = await prisma.novelPromotionPanel.findMany({
      where: {
        storyboard: {
          episodeId,
          episode: { novelPromotionProject: { projectId: job.data.projectId } },
        },
      },
      orderBy: [{ storyboard: { createdAt: 'asc' } }, { panelIndex: 'asc' }],
      include: {
        matchedVoiceLines: {
          select: { audioUrl: true, audioDuration: true, isNarration: true },
          orderBy: { lineIndex: 'asc' },
        },
      },
    })

    if (panels.length === 0) throw new Error('No panels found for episode')

    // Merge each panel with source video and skip storyboard placeholders.
    type MergePanelRow = (typeof panels)[number] & { videoUrl: string }
    const panelsWithVideo = panels.filter((panel): panel is MergePanelRow => !!panel.videoUrl)
    const skippedCount = panels.length - panelsWithVideo.length
    if (panelsWithVideo.length === 0) {
      throw new Error('No panels with videoUrl to merge')
    }

    await reportTaskProgress(job, 8, {
      stage: 'merge_start',
      episodeId,
      total: panelsWithVideo.length,
      skippedCount,
    })

    const mergedPaths: string[] = []

    for (let i = 0; i < panelsWithVideo.length; i++) {
      const p = panelsWithVideo[i]

      await reportTaskProgress(job, 10 + Math.round((i / panelsWithVideo.length) * 80), {
        stage: 'merge_panel',
        current: i + 1,
        total: panelsWithVideo.length,
        panelId: p.id,
        skippedCount,
      })

      // The compositor resolves COS keys to signed URLs, so pass stored keys unchanged.
      const result = await mergePanel(
        {
          panelId: p.id,
          videoUrl: p.videoUrl,
          voiceLines: p.matchedVoiceLines.map(vl => ({
            audioUrl: vl.audioUrl,
            audioDuration: vl.audioDuration,
            isNarration: vl.isNarration,
          })),
        },
        narratorEnabled,
        tempDir,
      )

      mergedPaths.push(result.tempPath)
    }

    // Concatenate the panel renders into the final export.
    await reportTaskProgress(job, 92, { stage: 'concat', total: mergedPaths.length, skippedCount })
    const final = await concatAll(mergedPaths, tempDir)

    // Upload the local render buffer because local temp paths are not fetchable.
    await reportTaskProgress(job, 96, { stage: 'uploading' })
    const buffer = fs.readFileSync(final.tempPath)
    const key = generateUniqueKey(`youtube-merge-${episodeId}`, 'mp4')
    const cosKey = await uploadObject(buffer, key, 1, 'video/mp4')

    await reportTaskProgress(job, 100, { stage: 'complete' })
    return { cosKey, videoUrl: cosKey }
  } finally {
    // Clean up temp files even if rendering fails.
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function processVideoTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VIDEO_PANEL:
      return await handleVideoPanelTask(job)
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
    case TASK_TYPE.MERGE_VIDEO:
    case 'merge_video':
      return await handleMergeVideoTask(job)
    default:
      throw new Error(`Unsupported video task type: ${job.data.type}`)
  }
}

export function createVideoWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.VIDEO,
    async (job) => await withTaskLifecycle(job, async (taskJob) => {
      const workflowConcurrency = await getUserWorkflowConcurrencyConfig(taskJob.data.userId)
      return await withUserConcurrencyGate({
        scope: 'video',
        userId: taskJob.data.userId,
        limit: workflowConcurrency.video,
        run: async () => await processVideoTask(taskJob),
      })
    }),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '1', 10) || 1,
    },
  )
}
