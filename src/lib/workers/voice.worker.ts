import { Worker, type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { generateVoiceLine } from '@/lib/voice/generate-voice-line'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { handleVoiceDesignTask } from './handlers/voice-design'
import { calculatePanelVideoDuration } from '@/lib/duration/panel-duration'
import { refinePanelPrompts } from '@/lib/novel-promotion/prompt-refiner'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import { getProjectModelConfig } from '@/lib/config-service'

type AnyObj = Record<string, unknown>

/**
 * After TTS succeeds, recalculate the matched panel's duration using the
 * centralized duration logic so the video generator receives audio-accurate timing.
 */
async function updatePanelDurationAfterTTS(
  lineId: string,
  episodeId: string,
): Promise<{ panelId: string; allVoiceDone: boolean } | null> {
  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: lineId },
    select: {
      matchedPanelId: true,
      matchedPanelIndex: true,
      matchedStoryboardId: true,
      audioDuration: true,
      isNarration: true,
    },
  })
  if (!voiceLine) return null

  let panelId = voiceLine.matchedPanelId

  if (!panelId && voiceLine.matchedPanelIndex != null && voiceLine.matchedStoryboardId) {
    const resolved = await prisma.novelPromotionPanel.findFirst({
      where: {
        storyboardId: voiceLine.matchedStoryboardId,
        panelIndex: voiceLine.matchedPanelIndex,
      },
      select: { id: true },
    })
    if (resolved) {
      panelId = resolved.id
      await prisma.novelPromotionVoiceLine.update({
        where: { id: lineId },
        data: { matchedPanelId: panelId },
      })
    }
  }

  if (!panelId) return null

  // Fetch all voice lines matched to this panel
  const allPanelVoiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { matchedPanelId: panelId },
    select: { audioDuration: true, isNarration: true },
  })

  const allVoiceDone = allPanelVoiceLines.length > 0
    && allPanelVoiceLines.every((vl) => vl.audioDuration !== null)

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: {
      duration: true,
      lipSyncVideoUrl: true,
    },
  })
  if (!panel) return null

  const newDuration = calculatePanelVideoDuration({
    hasLipSync: !!panel.lipSyncVideoUrl,
    narratorEnabled: (await prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      select: { narratorEnabled: true },
    }))?.narratorEnabled ?? true,
    voiceLines: allPanelVoiceLines.map((vl) => ({
      audioDuration: vl.audioDuration,
      isNarration: vl.isNarration,
    })),
    storyboardDuration: panel.duration,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: { duration: newDuration },
  })

  return { panelId, allVoiceDone }
}

async function maybeAutoRefineAfterTTS(
  job: Job<TaskJobData>,
  episodeId: string,
  panelId: string,
) {
  try {
    // Do not auto-refine if the panel already has an imagePrompt (user refined manually)
    const panel = await prisma.novelPromotionPanel.findUnique({
      where: { id: panelId },
      select: { imagePrompt: true },
    })
    if (panel?.imagePrompt) return

    const { projectId, userId, locale } = job.data
    const modelConfig = await getProjectModelConfig(projectId, userId)
    const model = await resolveAnalysisModel({
      userId,
      inputModel: modelConfig.analysisModel ?? undefined,
      projectAnalysisModel: modelConfig.analysisModel ?? undefined,
    })

    await refinePanelPrompts({
      projectId,
      episodeId,
      userId,
      model,
      locale,
      artStyle: modelConfig.artStyle,
      panelIds: [panelId],
    })
  } catch {
    // Non-fatal: a failed auto-refine must never fail the voice task
  }
}

async function handleVoiceLineTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const lineId = typeof payload.lineId === 'string' ? payload.lineId : job.data.targetId
  const episodeId = typeof payload.episodeId === 'string' ? payload.episodeId : job.data.episodeId
  const audioModel = typeof payload.audioModel === 'string' && payload.audioModel.trim()
    ? payload.audioModel.trim()
    : undefined
  if (!lineId) {
    throw new Error('VOICE_LINE task missing lineId')
  }
  if (!episodeId) {
    throw new Error('VOICE_LINE task missing episodeId')
  }

  await reportTaskProgress(job, 20, { stage: 'generate_voice_submit', lineId })

  const generated = await generateVoiceLine({
    projectId: job.data.projectId,
    episodeId,
    lineId,
    userId: job.data.userId,
    audioModel,
  })

  // Update the matched panel's duration based on the freshly generated audio
  let durationResult: { panelId: string; allVoiceDone: boolean } | null = null
  try {
    durationResult = await updatePanelDurationAfterTTS(lineId, episodeId)
  } catch {
    // Non-fatal: panel duration update failure should not fail the voice task
  }

  // Auto-trigger prompt refinement when all TTS audio for the panel is ready
  if (durationResult?.allVoiceDone) {
    await maybeAutoRefineAfterTTS(job, episodeId, durationResult.panelId)
  }

  await reportTaskProgress(job, 95, { stage: 'generate_voice_persist', lineId })

  return generated
}

async function processVoiceTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VOICE_LINE:
      return await handleVoiceLineTask(job)
    case TASK_TYPE.VOICE_DESIGN:
    case TASK_TYPE.ASSET_HUB_VOICE_DESIGN:
      return await handleVoiceDesignTask(job)
    default:
      throw new Error(`Unsupported voice task type: ${job.data.type}`)
  }
}

export function createVoiceWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.VOICE,
    async (job) => await withTaskLifecycle(job, processVoiceTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VOICE || '10', 10) || 10,
    },
  )
}
