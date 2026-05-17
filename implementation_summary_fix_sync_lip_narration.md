# Audio-Video Sync Implementation Summary

## ✅ Completed Phases

### Phase 1 — Core Duration Logic
**New file:** [panel-duration.ts](file:///q:/waoowaoo/src/lib/duration/panel-duration.ts)
- Centralized `calculatePanelVideoDuration()` implementing the full decision matrix
- Supports `narratorEnabled` flag to exclude narration when OFF
- 5 rules: lip-sync+voice+narration concat, voice-only, narration-only, storyboard fallback

### Phase 2 — FPS Standardization (30 → 24)

```diff:time-utils.ts
import { VideoClip, ComputedClip, VideoEditorProject } from '../types/editor.types'

/**
 * 计算时间轴总时长 (帧数)
 * 考虑转场重叠
 */
export function calculateTimelineDuration(clips: VideoClip[]): number {
    if (clips.length === 0) return 0

    return clips.reduce((total, clip, index) => {
        let duration = clip.durationInFrames

        // 最后一个片段不减去转场时间
        if (index < clips.length - 1 && clip.transition) {
            // 转场会让总时长减少（重叠部分）
            duration -= Math.floor(clip.transition.durationInFrames / 2)
        }

        return total + duration
    }, 0)
}

/**
 * 计算每个片段的起始帧位置
 * 用于渲染和 UI 显示
 */
export function computeClipPositions(clips: VideoClip[]): ComputedClip[] {
    let currentFrame = 0

    return clips.map((clip, index) => {
        const startFrame = currentFrame
        const endFrame = startFrame + clip.durationInFrames

        // 计算下一个片段的起始位置（考虑转场重叠）
        if (clip.transition && index < clips.length - 1) {
            currentFrame = endFrame - Math.floor(clip.transition.durationInFrames / 2)
        } else {
            currentFrame = endFrame
        }

        return {
            ...clip,
            startFrame,
            endFrame
        }
    })
}

/**
 * 帧数转时间字符串
 */
export function framesToTime(frames: number, fps: number): string {
    const totalSeconds = frames / fps
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const milliseconds = Math.floor((totalSeconds % 1) * 100)

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}

/**
 * 时间字符串转帧数
 */
export function timeToFrames(time: string, fps: number): number {
    const [minSec, ms] = time.split('.')
    const [minutes, seconds] = minSec.split(':').map(Number)
    const totalSeconds = minutes * 60 + seconds + (parseInt(ms || '0') / 100)
    return Math.round(totalSeconds * fps)
}

/**
 * 生成唯一 ID
 */
export function generateClipId(): string {
    return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 创建默认编辑器项目
 */
export function createDefaultProject(episodeId: string): VideoEditorProject {
    return {
        id: `editor_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 30,
            width: 1920,
            height: 1080
        },
        timeline: [],
        bgmTrack: []
    }
}
===
import { VideoClip, ComputedClip, VideoEditorProject } from '../types/editor.types'

/**
 * 计算时间轴总时长 (帧数)
 * 考虑转场重叠
 */
export function calculateTimelineDuration(clips: VideoClip[]): number {
    if (clips.length === 0) return 0

    return clips.reduce((total, clip, index) => {
        let duration = clip.durationInFrames

        // 最后一个片段不减去转场时间
        if (index < clips.length - 1 && clip.transition) {
            // 转场会让总时长减少（重叠部分）
            duration -= Math.floor(clip.transition.durationInFrames / 2)
        }

        return total + duration
    }, 0)
}

/**
 * 计算每个片段的起始帧位置
 * 用于渲染和 UI 显示
 */
export function computeClipPositions(clips: VideoClip[]): ComputedClip[] {
    let currentFrame = 0

    return clips.map((clip, index) => {
        const startFrame = currentFrame
        const endFrame = startFrame + clip.durationInFrames

        // 计算下一个片段的起始位置（考虑转场重叠）
        if (clip.transition && index < clips.length - 1) {
            currentFrame = endFrame - Math.floor(clip.transition.durationInFrames / 2)
        } else {
            currentFrame = endFrame
        }

        return {
            ...clip,
            startFrame,
            endFrame
        }
    })
}

/**
 * 帧数转时间字符串
 */
export function framesToTime(frames: number, fps: number): string {
    const totalSeconds = frames / fps
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const milliseconds = Math.floor((totalSeconds % 1) * 100)

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}

/**
 * 时间字符串转帧数
 */
export function timeToFrames(time: string, fps: number): number {
    const [minSec, ms] = time.split('.')
    const [minutes, seconds] = minSec.split(':').map(Number)
    const totalSeconds = minutes * 60 + seconds + (parseInt(ms || '0') / 100)
    return Math.round(totalSeconds * fps)
}

/**
 * 生成唯一 ID
 */
export function generateClipId(): string {
    return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 创建默认编辑器项目
 */
export function createDefaultProject(episodeId: string): VideoEditorProject {
    return {
        id: `editor_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 24,
            width: 1920,
            height: 1080
        },
        timeline: [],
        bgmTrack: []
    }
}
```
```diff:useEditorActions.ts
'use client'

import { useCallback } from 'react'
import { VideoClip, VideoEditorProject } from '../types/editor.types'
import { apiFetch } from '@/lib/api-fetch'

interface UseEditorActionsProps {
    projectId: string
    episodeId: string
}

/**
 * 面板数据类型（灵活接受各种格式）
 */
interface PanelData {
    id?: string
    panelIndex?: number
    storyboardId: string
    videoUrl?: string
    description?: string
    duration?: number
}

/**
 * 从已生成的视频面板创建编辑器项目
 */
export function createProjectFromPanels(
    episodeId: string,
    panels: PanelData[],
    voiceLines?: Array<{ id: string; speaker: string; content: string; audioUrl?: string | null; isNarration?: boolean }>
): VideoEditorProject {
    // 过滤出有视频的面板
    const videoPanels = panels.filter(p => p.videoUrl)

    // 创建视频片段
    const timeline: VideoClip[] = videoPanels.map((panel, index) => {
        // 查找匹配的配音（简单匹配：按索引）
        const matchedVoice = voiceLines?.[index]

        return {
            id: `clip_${panel.id || panel.storyboardId}_${panel.panelIndex ?? index}`,
            src: panel.videoUrl!,
            durationInFrames: Math.round((panel.duration || 3) * 30), // 默认 3 秒，30fps
            attachment: {
                audio: matchedVoice?.audioUrl ? {
                    src: matchedVoice.audioUrl,
                    volume: 1,
                    voiceLineId: matchedVoice.id
                } : undefined,
                subtitle: matchedVoice && !matchedVoice.isNarration ? {
                    text: matchedVoice.content,
                    style: 'default' as const
                } : undefined
            },
            transition: index < videoPanels.length - 1 ? {
                type: 'dissolve' as const,
                durationInFrames: 15 // 0.5s @ 30fps
            } : undefined,
            metadata: {
                panelId: panel.id || `${panel.storyboardId}-${panel.panelIndex ?? index}`,
                storyboardId: panel.storyboardId,
                description: panel.description || undefined
            }
        }
    })

    return {
        id: `editor_${episodeId}_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 30,
            width: 1920,
            height: 1080
        },
        timeline,
        bgmTrack: []
    }
}

export function useEditorActions({ projectId, episodeId }: UseEditorActionsProps) {
    /**
     * 保存项目到服务器
     */
    const saveProject = useCallback(async (project: VideoEditorProject) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectData: project })
        })

        if (!response.ok) {
            throw new Error('Failed to save project')
        }

        return response.json()
    }, [projectId])

    /**
     * 加载项目
     */
    const loadProject = useCallback(async (): Promise<VideoEditorProject | null> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)

        if (!response.ok) {
            if (response.status === 404) return null
            throw new Error('Failed to load project')
        }

        const data = await response.json()
        return data.projectData
    }, [projectId, episodeId])

    /**
     * 发起渲染导出
     */
    const startRender = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editorProjectId,
                format: 'mp4',
                quality: 'high'
            })
        })

        if (!response.ok) {
            throw new Error('Failed to start render')
        }

        return response.json()
    }, [projectId])

    /**
     * 获取渲染状态
     */
    const getRenderStatus = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/render?id=${editorProjectId}`
        )

        if (!response.ok) {
            throw new Error('Failed to get render status')
        }

        return response.json()
    }, [projectId])

    return {
        saveProject,
        loadProject,
        startRender,
        getRenderStatus
    }
}
===
'use client'

import { useCallback } from 'react'
import { VideoClip, VideoEditorProject } from '../types/editor.types'
import { apiFetch } from '@/lib/api-fetch'

interface UseEditorActionsProps {
    projectId: string
    episodeId: string
}

/**
 * 面板数据类型（灵活接受各种格式）
 */
interface PanelData {
    id?: string
    panelIndex?: number
    storyboardId: string
    videoUrl?: string
    description?: string
    duration?: number
}

/**
 * 从已生成的视频面板创建编辑器项目
 */
export function createProjectFromPanels(
    episodeId: string,
    panels: PanelData[],
    voiceLines?: Array<{ id: string; speaker: string; content: string; audioUrl?: string | null; isNarration?: boolean }>
): VideoEditorProject {
    // 过滤出有视频的面板
    const videoPanels = panels.filter(p => p.videoUrl)

    // 创建视频片段
    const timeline: VideoClip[] = videoPanels.map((panel, index) => {
        // 查找匹配的配音（简单匹配：按索引）
        const matchedVoice = voiceLines?.[index]

        return {
            id: `clip_${panel.id || panel.storyboardId}_${panel.panelIndex ?? index}`,
            src: panel.videoUrl!,
            durationInFrames: Math.round((panel.duration || 3) * 24), // 默认 3 秒，24fps
            attachment: {
                audio: matchedVoice?.audioUrl ? {
                    src: matchedVoice.audioUrl,
                    volume: 1,
                    voiceLineId: matchedVoice.id
                } : undefined,
                subtitle: matchedVoice && !matchedVoice.isNarration ? {
                    text: matchedVoice.content,
                    style: 'default' as const
                } : undefined
            },
            transition: index < videoPanels.length - 1 ? {
                type: 'dissolve' as const,
                durationInFrames: 12 // 0.5s @ 24fps
            } : undefined,
            metadata: {
                panelId: panel.id || `${panel.storyboardId}-${panel.panelIndex ?? index}`,
                storyboardId: panel.storyboardId,
                description: panel.description || undefined
            }
        }
    })

    return {
        id: `editor_${episodeId}_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 24,
            width: 1920,
            height: 1080
        },
        timeline,
        bgmTrack: []
    }
}

export function useEditorActions({ projectId, episodeId }: UseEditorActionsProps) {
    /**
     * 保存项目到服务器
     */
    const saveProject = useCallback(async (project: VideoEditorProject) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectData: project })
        })

        if (!response.ok) {
            throw new Error('Failed to save project')
        }

        return response.json()
    }, [projectId])

    /**
     * 加载项目
     */
    const loadProject = useCallback(async (): Promise<VideoEditorProject | null> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)

        if (!response.ok) {
            if (response.status === 404) return null
            throw new Error('Failed to load project')
        }

        const data = await response.json()
        return data.projectData
    }, [projectId, episodeId])

    /**
     * 发起渲染导出
     */
    const startRender = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editorProjectId,
                format: 'mp4',
                quality: 'high'
            })
        })

        if (!response.ok) {
            throw new Error('Failed to start render')
        }

        return response.json()
    }, [projectId])

    /**
     * 获取渲染状态
     */
    const getRenderStatus = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/render?id=${editorProjectId}`
        )

        if (!response.ok) {
            throw new Error('Failed to get render status')
        }

        return response.json()
    }, [projectId])

    return {
        saveProject,
        loadProject,
        startRender,
        getRenderStatus
    }
}
```

- `createDefaultProject()` now uses `fps: 24`
- Clip duration: `* 30` → `* 24`
- Transition: `15 frames` → `12 frames` (0.5s @ 24fps)

### Phase 3 — Video Worker: Remove `toDurationMs` Heuristic

```diff:video.worker.ts
import { Worker, type Job } from 'bullmq'
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
import { getProviderConfig } from '@/lib/api-config'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.novelPromotionPanel.findUnique>>>

function toDurationMs(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1000 ? Math.round(value) : Math.round(value * 1000)
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
  const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || panel.description
  if (!prompt) {
    throw new Error(`Panel ${panel.id} has no video prompt`)
  }

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
    videoDurationMs: toDurationMs(panel.duration),
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

async function processVideoTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VIDEO_PANEL:
      return await handleVideoPanelTask(job)
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
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
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
    },
  )
}
===
import { Worker, type Job } from 'bullmq'
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
import { getProviderConfig } from '@/lib/api-config'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.novelPromotionPanel.findUnique>>>

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
  const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || panel.description
  if (!prompt) {
    throw new Error(`Panel ${panel.id} has no video prompt`)
  }

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

async function processVideoTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VIDEO_PANEL:
      return await handleVideoPanelTask(job)
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
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
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
    },
  )
}
```

- Replaced heuristic `toDurationMs()` (guessing ms vs sec based on `>1000`) with `panelDurationToMs()` (always `seconds * 1000`)

### Phase 4 — Voice Worker: Update Panel Duration After TTS

```diff:voice.worker.ts
import { Worker, type Job } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { generateVoiceLine } from '@/lib/voice/generate-voice-line'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { handleVoiceDesignTask } from './handlers/voice-design'

type AnyObj = Record<string, unknown>

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
===
import { Worker, type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { generateVoiceLine } from '@/lib/voice/generate-voice-line'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { handleVoiceDesignTask } from './handlers/voice-design'
import { calculatePanelVideoDuration } from '@/lib/duration/panel-duration'

type AnyObj = Record<string, unknown>

/**
 * After TTS succeeds, recalculate the matched panel's duration using the
 * centralized duration logic so the video generator receives audio-accurate timing.
 */
async function updatePanelDurationAfterTTS(lineId: string) {
  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: lineId },
    select: {
      matchedPanelId: true,
      audioDuration: true,
      isNarration: true,
    },
  })
  if (!voiceLine?.matchedPanelId) return

  const panelId = voiceLine.matchedPanelId

  // Fetch all voice lines matched to this panel
  const allPanelVoiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { matchedPanelId: panelId },
    select: { audioDuration: true, isNarration: true },
  })

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: {
      duration: true,
      lipSyncVideoUrl: true,
    },
  })
  if (!panel) return

  const newDuration = calculatePanelVideoDuration({
    hasLipSync: !!panel.lipSyncVideoUrl,
    narratorEnabled: true,  // default to true; the caller can override later
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
  try {
    await updatePanelDurationAfterTTS(lineId)
  } catch {
    // Non-fatal: panel duration update failure should not fail the voice task
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
```

- After TTS succeeds, `updatePanelDurationAfterTTS()` recalculates panel.duration using centralized logic
- Fetches all voice lines for the panel to determine accurate composite duration
- Non-fatal: failures don't block the voice task

### Phase 6 — Lip-Sync Preprocess Tolerance

```diff:preprocess.ts
import { randomUUID } from 'node:crypto'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { toFetchableUrl } from '@/lib/storage/utils'
import type { LipSyncParams } from '@/lib/lipsync/types'

const LIPSYNC_MIN_AUDIO_DURATION_MS = 2000

export type LipSyncProviderKey = 'fal' | 'vidu' | 'bailian' | 'comfyui'

interface LoadedBinary {
  buffer: Buffer
  mimeType: string
}

interface WavInfo {
  byteRate: number
  blockAlign: number
  dataSize: number
  dataOffset: number
}

interface Mp4Box {
  start: number
  end: number
  type: string
  headerSize: number
}

export interface LipSyncPreprocessContext {
  providerKey: LipSyncProviderKey
}

export interface LipSyncPreprocessResult {
  params: LipSyncParams
  paddedAudio: boolean
  trimmedAudio: boolean
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value)
}

function parseDataUrl(input: string): LoadedBinary {
  const marker = input.indexOf(',')
  if (marker <= 5) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_INVALID')
  }
  const header = input.slice(5, marker)
  const payload = input.slice(marker + 1)
  if (!header.includes(';base64')) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_BASE64_REQUIRED')
  }
  const contentTypeRaw = header.split(';')[0]
  const mimeType = readTrimmedString(contentTypeRaw) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(payload, 'base64'),
  }
}

async function loadBinaryFromInput(input: string): Promise<LoadedBinary> {
  const trimmed = readTrimmedString(input)
  if (!trimmed) {
    throw new Error('LIPSYNC_INPUT_EMPTY')
  }

  if (trimmed.startsWith('data:')) {
    return parseDataUrl(trimmed)
  }

  const normalizedUrl = await normalizeToOriginalMediaUrl(trimmed)
  if (normalizedUrl.startsWith('data:')) {
    return parseDataUrl(normalizedUrl)
  }

  const fetchUrl = toFetchableUrl(normalizedUrl)
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`LIPSYNC_INPUT_FETCH_FAILED(${response.status})`)
  }
  const mimeType = readTrimmedString(response.headers.get('content-type')) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

function parseWavInfo(buffer: Buffer): WavInfo | null {
  if (buffer.length < 44) return null
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return null

  let offset = 12
  let byteRate = 0
  let blockAlign = 0
  let dataSize = 0
  let dataOffset = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) return null

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return null
      byteRate = buffer.readUInt32LE(chunkStart + 8)
      blockAlign = buffer.readUInt16LE(chunkStart + 12)
    } else if (chunkId === 'data') {
      dataSize = chunkSize
      dataOffset = chunkStart
      break
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (byteRate <= 0 || blockAlign <= 0 || dataSize <= 0 || dataOffset <= 0) {
    return null
  }

  return {
    byteRate,
    blockAlign,
    dataSize,
    dataOffset,
  }
}

function getWavDurationMs(buffer: Buffer): number | null {
  const info = parseWavInfo(buffer)
  if (!info) return null
  return Math.round((info.dataSize / info.byteRate) * 1000)
}

function toBlockAlignedByteLength(byteLength: number, blockAlign: number): number {
  if (blockAlign <= 1) return byteLength
  return Math.floor(byteLength / blockAlign) * blockAlign
}

function padWavToMinDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs >= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.ceil((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(targetBytesRaw, info.blockAlign)
  const additionalBytes = targetBytes - info.dataSize
  if (additionalBytes <= 0) return buffer

  const header = buffer.subarray(0, info.dataOffset)
  const originalData = buffer.subarray(info.dataOffset, info.dataOffset + info.dataSize)
  const silenceData = Buffer.alloc(additionalBytes, 0)
  const merged = Buffer.concat([header, originalData, silenceData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(info.dataSize + additionalBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function trimWavToDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs <= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.floor((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(Math.max(targetBytesRaw, info.blockAlign), info.blockAlign)
  const clippedBytes = Math.min(targetBytes, info.dataSize)

  const header = buffer.subarray(0, info.dataOffset)
  const clippedData = buffer.subarray(info.dataOffset, info.dataOffset + clippedBytes)
  const merged = Buffer.concat([header, clippedData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(clippedBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function readUint64BE(buffer: Buffer, offset: number): number {
  const high = buffer.readUInt32BE(offset)
  const low = buffer.readUInt32BE(offset + 4)
  return high * 2 ** 32 + low
}

function readMp4Box(buffer: Buffer, offset: number, limit: number): Mp4Box | null {
  if (offset + 8 > limit) return null
  const size32 = buffer.readUInt32BE(offset)
  const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
  if (!type) return null

  let headerSize = 8
  let size = size32
  if (size32 === 1) {
    if (offset + 16 > limit) return null
    size = readUint64BE(buffer, offset + 8)
    headerSize = 16
  } else if (size32 === 0) {
    size = limit - offset
  }

  if (size < headerSize || offset + size > limit) return null

  return {
    start: offset,
    end: offset + size,
    type,
    headerSize,
  }
}

function parseMp4DurationMs(buffer: Buffer): number {
  const limit = buffer.length
  let offset = 0
  while (offset + 8 <= limit) {
    const box = readMp4Box(buffer, offset, limit)
    if (!box) break
    if (box.type === 'moov') {
      let innerOffset = box.start + box.headerSize
      while (innerOffset + 8 <= box.end) {
        const inner = readMp4Box(buffer, innerOffset, box.end)
        if (!inner) break
        if (inner.type === 'mvhd') {
          const contentOffset = inner.start + inner.headerSize
          if (contentOffset + 1 > inner.end) {
            throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
          }
          const version = buffer.readUInt8(contentOffset)
          if (version === 0) {
            if (contentOffset + 20 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 12)
            const duration = buffer.readUInt32BE(contentOffset + 16)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          if (version === 1) {
            if (contentOffset + 32 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 20)
            const duration = readUint64BE(buffer, contentOffset + 24)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
        }
        innerOffset = inner.end
      }
      throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
    }
    offset = box.end
  }
  throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
}

async function resolveVideoDurationMs(params: LipSyncParams): Promise<number | null> {
  const knownDuration = normalizeDurationMs(params.videoDurationMs)
  if (knownDuration) return knownDuration
  const videoBinary = await loadBinaryFromInput(params.videoUrl)
  return parseMp4DurationMs(videoBinary.buffer)
}

function toAudioDataUrl(buffer: Buffer): string {
  return `data:audio/wav;base64,${buffer.toString('base64')}`
}

async function toProviderAudioInput(
  providerKey: LipSyncProviderKey,
  buffer: Buffer,
): Promise<string> {
  if (providerKey === 'vidu') {
    const { uploadObject, getSignedUrl } = await import('@/lib/storage')
    const storageKey = `voice/temp/lip-sync-preprocessed/${randomUUID()}.wav`
    await uploadObject(buffer, storageKey, 1, 'audio/wav')
    return toFetchableUrl(getSignedUrl(storageKey, 7200))
  }

  return toAudioDataUrl(buffer)
}

export async function preprocessLipSyncParams(
  params: LipSyncParams,
  context: LipSyncPreprocessContext,
): Promise<LipSyncPreprocessResult> {
  const inputAudioDurationMs = normalizeDurationMs(params.audioDurationMs)
  const videoDurationMs = await resolveVideoDurationMs(params)
  let audioDurationMs = inputAudioDurationMs

  const needsDurationProbe = audioDurationMs === null
  const shouldPadByKnown = audioDurationMs !== null && audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS
  const shouldTrimByKnown = audioDurationMs !== null && videoDurationMs !== null && audioDurationMs > videoDurationMs

  if (!needsDurationProbe && !shouldPadByKnown && !shouldTrimByKnown) {
    return {
      params: {
        ...params,
        videoDurationMs: videoDurationMs ?? params.videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const audioBinary = await loadBinaryFromInput(params.audioUrl)
  if (!audioBinary.mimeType.includes('wav') && parseWavInfo(audioBinary.buffer) === null) {
    throw new Error('LIPSYNC_AUDIO_PREPROCESS_WAV_REQUIRED')
  }

  const parsedAudioDuration = getWavDurationMs(audioBinary.buffer)
  if (audioDurationMs === null) {
    if (parsedAudioDuration === null) {
      throw new Error('LIPSYNC_AUDIO_DURATION_PARSE_FAILED')
    }
    audioDurationMs = parsedAudioDuration
  }

  let processedAudio = audioBinary.buffer
  let paddedAudio = false
  let trimmedAudio = false

  if (audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS) {
    processedAudio = padWavToMinDuration(processedAudio, LIPSYNC_MIN_AUDIO_DURATION_MS)
    audioDurationMs = getWavDurationMs(processedAudio) ?? LIPSYNC_MIN_AUDIO_DURATION_MS
    paddedAudio = true
  }

  if (videoDurationMs !== null && audioDurationMs > videoDurationMs) {
    processedAudio = trimWavToDuration(processedAudio, videoDurationMs)
    audioDurationMs = getWavDurationMs(processedAudio) ?? videoDurationMs
    trimmedAudio = true
  }

  if (!paddedAudio && !trimmedAudio) {
    return {
      params: {
        ...params,
        audioDurationMs,
        videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const providerAudioInput = await toProviderAudioInput(context.providerKey, processedAudio)

  _ulogInfo(`[LipSync Preprocess] provider=${context.providerKey} padded=${paddedAudio} trimmed=${trimmedAudio} audioDurationMs=${audioDurationMs} videoDurationMs=${videoDurationMs ?? 'unknown'}`)

  return {
    params: {
      ...params,
      audioUrl: providerAudioInput,
      audioDurationMs,
      videoDurationMs,
    },
    paddedAudio,
    trimmedAudio,
  }
}

export const LIPSYNC_PREPROCESS_AUDIO_MIN_MS = LIPSYNC_MIN_AUDIO_DURATION_MS
===
import { randomUUID } from 'node:crypto'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { toFetchableUrl } from '@/lib/storage/utils'
import type { LipSyncParams } from '@/lib/lipsync/types'

const LIPSYNC_MIN_AUDIO_DURATION_MS = 500

export type LipSyncProviderKey = 'fal' | 'vidu' | 'bailian' | 'comfyui'

interface LoadedBinary {
  buffer: Buffer
  mimeType: string
}

interface WavInfo {
  byteRate: number
  blockAlign: number
  dataSize: number
  dataOffset: number
}

interface Mp4Box {
  start: number
  end: number
  type: string
  headerSize: number
}

export interface LipSyncPreprocessContext {
  providerKey: LipSyncProviderKey
}

export interface LipSyncPreprocessResult {
  params: LipSyncParams
  paddedAudio: boolean
  trimmedAudio: boolean
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value)
}

function parseDataUrl(input: string): LoadedBinary {
  const marker = input.indexOf(',')
  if (marker <= 5) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_INVALID')
  }
  const header = input.slice(5, marker)
  const payload = input.slice(marker + 1)
  if (!header.includes(';base64')) {
    throw new Error('LIPSYNC_AUDIO_DATA_URL_BASE64_REQUIRED')
  }
  const contentTypeRaw = header.split(';')[0]
  const mimeType = readTrimmedString(contentTypeRaw) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(payload, 'base64'),
  }
}

async function loadBinaryFromInput(input: string): Promise<LoadedBinary> {
  const trimmed = readTrimmedString(input)
  if (!trimmed) {
    throw new Error('LIPSYNC_INPUT_EMPTY')
  }

  if (trimmed.startsWith('data:')) {
    return parseDataUrl(trimmed)
  }

  const normalizedUrl = await normalizeToOriginalMediaUrl(trimmed)
  if (normalizedUrl.startsWith('data:')) {
    return parseDataUrl(normalizedUrl)
  }

  const fetchUrl = toFetchableUrl(normalizedUrl)
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`LIPSYNC_INPUT_FETCH_FAILED(${response.status})`)
  }
  const mimeType = readTrimmedString(response.headers.get('content-type')) || 'application/octet-stream'
  return {
    mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

function parseWavInfo(buffer: Buffer): WavInfo | null {
  if (buffer.length < 44) return null
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buffer.subarray(8, 12).toString('ascii') !== 'WAVE') return null

  let offset = 12
  let byteRate = 0
  let blockAlign = 0
  let dataSize = 0
  let dataOffset = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) return null

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) return null
      byteRate = buffer.readUInt32LE(chunkStart + 8)
      blockAlign = buffer.readUInt16LE(chunkStart + 12)
    } else if (chunkId === 'data') {
      dataSize = chunkSize
      dataOffset = chunkStart
      break
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (byteRate <= 0 || blockAlign <= 0 || dataSize <= 0 || dataOffset <= 0) {
    return null
  }

  return {
    byteRate,
    blockAlign,
    dataSize,
    dataOffset,
  }
}

function getWavDurationMs(buffer: Buffer): number | null {
  const info = parseWavInfo(buffer)
  if (!info) return null
  return Math.round((info.dataSize / info.byteRate) * 1000)
}

function toBlockAlignedByteLength(byteLength: number, blockAlign: number): number {
  if (blockAlign <= 1) return byteLength
  return Math.floor(byteLength / blockAlign) * blockAlign
}

function padWavToMinDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs >= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.ceil((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(targetBytesRaw, info.blockAlign)
  const additionalBytes = targetBytes - info.dataSize
  if (additionalBytes <= 0) return buffer

  const header = buffer.subarray(0, info.dataOffset)
  const originalData = buffer.subarray(info.dataOffset, info.dataOffset + info.dataSize)
  const silenceData = Buffer.alloc(additionalBytes, 0)
  const merged = Buffer.concat([header, originalData, silenceData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(info.dataSize + additionalBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function trimWavToDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = parseWavInfo(buffer)
  if (!info) {
    throw new Error('LIPSYNC_AUDIO_WAV_PARSE_FAILED')
  }

  const currentDurationMs = Math.round((info.dataSize / info.byteRate) * 1000)
  if (currentDurationMs <= targetDurationMs) {
    return buffer
  }

  const targetBytesRaw = Math.floor((targetDurationMs / 1000) * info.byteRate)
  const targetBytes = toBlockAlignedByteLength(Math.max(targetBytesRaw, info.blockAlign), info.blockAlign)
  const clippedBytes = Math.min(targetBytes, info.dataSize)

  const header = buffer.subarray(0, info.dataOffset)
  const clippedData = buffer.subarray(info.dataOffset, info.dataOffset + clippedBytes)
  const merged = Buffer.concat([header, clippedData])

  merged.writeUInt32LE(merged.length - 8, 4)
  let offset = 12
  while (offset + 8 <= merged.length) {
    const chunkId = merged.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = merged.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      merged.writeUInt32LE(clippedBytes, offset + 4)
      break
    }
    offset = offset + 8 + chunkSize + (chunkSize % 2)
  }

  return merged
}

function readUint64BE(buffer: Buffer, offset: number): number {
  const high = buffer.readUInt32BE(offset)
  const low = buffer.readUInt32BE(offset + 4)
  return high * 2 ** 32 + low
}

function readMp4Box(buffer: Buffer, offset: number, limit: number): Mp4Box | null {
  if (offset + 8 > limit) return null
  const size32 = buffer.readUInt32BE(offset)
  const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
  if (!type) return null

  let headerSize = 8
  let size = size32
  if (size32 === 1) {
    if (offset + 16 > limit) return null
    size = readUint64BE(buffer, offset + 8)
    headerSize = 16
  } else if (size32 === 0) {
    size = limit - offset
  }

  if (size < headerSize || offset + size > limit) return null

  return {
    start: offset,
    end: offset + size,
    type,
    headerSize,
  }
}

function parseMp4DurationMs(buffer: Buffer): number {
  const limit = buffer.length
  let offset = 0
  while (offset + 8 <= limit) {
    const box = readMp4Box(buffer, offset, limit)
    if (!box) break
    if (box.type === 'moov') {
      let innerOffset = box.start + box.headerSize
      while (innerOffset + 8 <= box.end) {
        const inner = readMp4Box(buffer, innerOffset, box.end)
        if (!inner) break
        if (inner.type === 'mvhd') {
          const contentOffset = inner.start + inner.headerSize
          if (contentOffset + 1 > inner.end) {
            throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
          }
          const version = buffer.readUInt8(contentOffset)
          if (version === 0) {
            if (contentOffset + 20 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 12)
            const duration = buffer.readUInt32BE(contentOffset + 16)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          if (version === 1) {
            if (contentOffset + 32 > inner.end) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            const timescale = buffer.readUInt32BE(contentOffset + 20)
            const duration = readUint64BE(buffer, contentOffset + 24)
            if (timescale <= 0 || duration <= 0) {
              throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
            }
            return Math.round((duration / timescale) * 1000)
          }
          throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
        }
        innerOffset = inner.end
      }
      throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
    }
    offset = box.end
  }
  throw new Error('LIPSYNC_VIDEO_DURATION_PARSE_FAILED')
}

async function resolveVideoDurationMs(params: LipSyncParams): Promise<number | null> {
  const knownDuration = normalizeDurationMs(params.videoDurationMs)
  if (knownDuration) return knownDuration
  const videoBinary = await loadBinaryFromInput(params.videoUrl)
  return parseMp4DurationMs(videoBinary.buffer)
}

function toAudioDataUrl(buffer: Buffer): string {
  return `data:audio/wav;base64,${buffer.toString('base64')}`
}

async function toProviderAudioInput(
  providerKey: LipSyncProviderKey,
  buffer: Buffer,
): Promise<string> {
  if (providerKey === 'vidu') {
    const { uploadObject, getSignedUrl } = await import('@/lib/storage')
    const storageKey = `voice/temp/lip-sync-preprocessed/${randomUUID()}.wav`
    await uploadObject(buffer, storageKey, 1, 'audio/wav')
    return toFetchableUrl(getSignedUrl(storageKey, 7200))
  }

  return toAudioDataUrl(buffer)
}

export async function preprocessLipSyncParams(
  params: LipSyncParams,
  context: LipSyncPreprocessContext,
): Promise<LipSyncPreprocessResult> {
  const inputAudioDurationMs = normalizeDurationMs(params.audioDurationMs)
  const videoDurationMs = await resolveVideoDurationMs(params)
  let audioDurationMs = inputAudioDurationMs

  const needsDurationProbe = audioDurationMs === null
  const shouldPadByKnown = audioDurationMs !== null && audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS
  const shouldTrimByKnown = audioDurationMs !== null && videoDurationMs !== null && audioDurationMs > videoDurationMs

  if (!needsDurationProbe && !shouldPadByKnown && !shouldTrimByKnown) {
    return {
      params: {
        ...params,
        videoDurationMs: videoDurationMs ?? params.videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  // Skip pad/trim when audio ≈ video (within 100ms tolerance)
  if (
    !needsDurationProbe &&
    audioDurationMs !== null &&
    videoDurationMs !== null &&
    Math.abs(audioDurationMs - videoDurationMs) < 100
  ) {
    return {
      params: {
        ...params,
        audioDurationMs,
        videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const audioBinary = await loadBinaryFromInput(params.audioUrl)
  if (!audioBinary.mimeType.includes('wav') && parseWavInfo(audioBinary.buffer) === null) {
    throw new Error('LIPSYNC_AUDIO_PREPROCESS_WAV_REQUIRED')
  }

  const parsedAudioDuration = getWavDurationMs(audioBinary.buffer)
  if (audioDurationMs === null) {
    if (parsedAudioDuration === null) {
      throw new Error('LIPSYNC_AUDIO_DURATION_PARSE_FAILED')
    }
    audioDurationMs = parsedAudioDuration
  }

  let processedAudio = audioBinary.buffer
  let paddedAudio = false
  let trimmedAudio = false

  if (audioDurationMs < LIPSYNC_MIN_AUDIO_DURATION_MS) {
    processedAudio = padWavToMinDuration(processedAudio, LIPSYNC_MIN_AUDIO_DURATION_MS)
    audioDurationMs = getWavDurationMs(processedAudio) ?? LIPSYNC_MIN_AUDIO_DURATION_MS
    paddedAudio = true
  }

  if (videoDurationMs !== null && audioDurationMs > videoDurationMs) {
    processedAudio = trimWavToDuration(processedAudio, videoDurationMs)
    audioDurationMs = getWavDurationMs(processedAudio) ?? videoDurationMs
    trimmedAudio = true
  }

  if (!paddedAudio && !trimmedAudio) {
    return {
      params: {
        ...params,
        audioDurationMs,
        videoDurationMs,
      },
      paddedAudio: false,
      trimmedAudio: false,
    }
  }

  const providerAudioInput = await toProviderAudioInput(context.providerKey, processedAudio)

  _ulogInfo(`[LipSync Preprocess] provider=${context.providerKey} padded=${paddedAudio} trimmed=${trimmedAudio} audioDurationMs=${audioDurationMs} videoDurationMs=${videoDurationMs ?? 'unknown'}`)

  return {
    params: {
      ...params,
      audioUrl: providerAudioInput,
      audioDurationMs,
      videoDurationMs,
    },
    paddedAudio,
    trimmedAudio,
  }
}

export const LIPSYNC_PREPROCESS_AUDIO_MIN_MS = LIPSYNC_MIN_AUDIO_DURATION_MS
```

- Reduced `LIPSYNC_MIN_AUDIO_DURATION_MS` from `2000ms` → `500ms`
- Added 100ms tolerance: when `|audioMs - videoMs| < 100`, skip pad/trim entirely

### Phase 7 — Remotion `endAt` Constraints

```diff:VideoComposition.tsx
import React from 'react'
import { AbsoluteFill, Sequence, Video, Audio, useCurrentFrame, interpolate } from 'remotion'
import { VideoClip, BgmClip, EditorConfig } from '../types/editor.types'
import { computeClipPositions } from '../utils/time-utils'

interface VideoCompositionProps {
    clips: VideoClip[]
    bgmTrack: BgmClip[]
    config: EditorConfig
}

/**
 * Remotion 主合成组件
 * 使用 Sequence 实现磁性时间轴布局，支持转场效果
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
    clips,
    bgmTrack,
    config
}) => {
    const computedClips = computeClipPositions(clips)

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* 视频轨道 - 带转场效果 */}
            {computedClips.map((clip, index) => {
                const transitionDuration = clip.transition?.durationInFrames || 0

                return (
                    <Sequence
                        key={clip.id}
                        from={clip.startFrame}
                        durationInFrames={clip.durationInFrames}
                        name={`Clip ${index + 1}`}
                    >
                        <ClipRenderer
                            clip={clip}
                            config={config}
                            transitionType={clip.transition?.type}
                            transitionDuration={transitionDuration}
                            isLastClip={index === computedClips.length - 1}
                        />
                    </Sequence>
                )
            })}

            {/* BGM 轨道 */}
            {bgmTrack.map((bgm) => (
                <Sequence
                    key={bgm.id}
                    from={bgm.startFrame}
                    durationInFrames={bgm.durationInFrames}
                    name={`BGM: ${bgm.id}`}
                >
                    <BgmRenderer bgm={bgm} />
                </Sequence>
            ))}
        </AbsoluteFill>
    )
}

/**
 * BGM 渲染器 - 支持淡入淡出
 */
interface BgmRendererProps {
    bgm: BgmClip
}

const BgmRenderer: React.FC<BgmRendererProps> = ({ bgm }) => {
    const frame = useCurrentFrame()
    const fadeIn = bgm.fadeIn || 0
    const fadeOut = bgm.fadeOut || 0

    let volume = bgm.volume

    // 淡入
    if (fadeIn > 0 && frame < fadeIn) {
        volume *= interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' })
    }

    // 淡出
    if (fadeOut > 0 && frame > bgm.durationInFrames - fadeOut) {
        volume *= interpolate(
            frame,
            [bgm.durationInFrames - fadeOut, bgm.durationInFrames],
            [1, 0],
            { extrapolateLeft: 'clamp' }
        )
    }

    return <Audio src={bgm.src} volume={volume} />
}

/**
 * 单个片段渲染器 - 支持转场效果
 */
interface ClipRendererProps {
    clip: VideoClip & { startFrame: number; endFrame: number }
    config: EditorConfig
    transitionType?: 'none' | 'dissolve' | 'fade' | 'slide'
    transitionDuration: number
    isLastClip: boolean
}

const ClipRenderer: React.FC<ClipRendererProps> = ({
    clip,
    config,
    transitionType = 'none',
    transitionDuration,
    isLastClip
}) => {
    void config
    const frame = useCurrentFrame()
    const clipDuration = clip.durationInFrames

    // 计算转场效果
    let opacity = 1
    let transform = 'none'

    if (transitionType !== 'none' && transitionDuration > 0) {
        // 出场转场效果 (在片段末尾)
        if (!isLastClip && frame > clipDuration - transitionDuration) {
            const exitProgress = interpolate(
                frame,
                [clipDuration - transitionDuration, clipDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = 1 - exitProgress
                    break
                case 'slide':
                    transform = `translateX(${-exitProgress * 100}%)`
                    break
            }
        }

        // 入场转场效果 (在片段开头)
        if (frame < transitionDuration) {
            const enterProgress = interpolate(
                frame,
                [0, transitionDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = enterProgress
                    break
                case 'slide':
                    transform = `translateX(${(1 - enterProgress) * 100}%)`
                    break
            }
        }
    }

    return (
        <AbsoluteFill style={{ opacity, transform }}>
            {/* 视频 */}
            <Video
                src={clip.src}
                startFrom={clip.trim?.from || 0}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />

            {/* 附属配音 */}
            {clip.attachment?.audio && (
                <Audio
                    src={clip.attachment.audio.src}
                    volume={clip.attachment.audio.volume}
                />
            )}

            {/* 附属字幕 */}
            {clip.attachment?.subtitle && (
                <SubtitleOverlay
                    text={clip.attachment.subtitle.text}
                    style={clip.attachment.subtitle.style}
                />
            )}
        </AbsoluteFill>
    )
}

/**
 * 字幕叠加层
 */
interface SubtitleOverlayProps {
    text: string
    style: 'default' | 'cinematic'
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, style }) => {
    const styles = {
        default: {
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '24px',
            color: 'white'
        },
        cinematic: {
            background: 'transparent',
            padding: '12px 24px',
            fontSize: '28px',
            color: 'white',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            fontWeight: 'bold' as const
        }
    }

    return (
        <AbsoluteFill
            style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: '60px'
            }}
        >
            <div style={styles[style]}>
                {text}
            </div>
        </AbsoluteFill>
    )
}

export default VideoComposition
===
import React from 'react'
import { AbsoluteFill, Sequence, Video, Audio, useCurrentFrame, interpolate } from 'remotion'
import { VideoClip, BgmClip, EditorConfig } from '../types/editor.types'
import { computeClipPositions } from '../utils/time-utils'

interface VideoCompositionProps {
    clips: VideoClip[]
    bgmTrack: BgmClip[]
    config: EditorConfig
}

/**
 * Remotion 主合成组件
 * 使用 Sequence 实现磁性时间轴布局，支持转场效果
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
    clips,
    bgmTrack,
    config
}) => {
    const computedClips = computeClipPositions(clips)

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* 视频轨道 - 带转场效果 */}
            {computedClips.map((clip, index) => {
                const transitionDuration = clip.transition?.durationInFrames || 0

                return (
                    <Sequence
                        key={clip.id}
                        from={clip.startFrame}
                        durationInFrames={clip.durationInFrames}
                        name={`Clip ${index + 1}`}
                    >
                        <ClipRenderer
                            clip={clip}
                            config={config}
                            transitionType={clip.transition?.type}
                            transitionDuration={transitionDuration}
                            isLastClip={index === computedClips.length - 1}
                        />
                    </Sequence>
                )
            })}

            {/* BGM 轨道 */}
            {bgmTrack.map((bgm) => (
                <Sequence
                    key={bgm.id}
                    from={bgm.startFrame}
                    durationInFrames={bgm.durationInFrames}
                    name={`BGM: ${bgm.id}`}
                >
                    <BgmRenderer bgm={bgm} />
                </Sequence>
            ))}
        </AbsoluteFill>
    )
}

/**
 * BGM 渲染器 - 支持淡入淡出
 */
interface BgmRendererProps {
    bgm: BgmClip
}

const BgmRenderer: React.FC<BgmRendererProps> = ({ bgm }) => {
    const frame = useCurrentFrame()
    const fadeIn = bgm.fadeIn || 0
    const fadeOut = bgm.fadeOut || 0

    let volume = bgm.volume

    // 淡入
    if (fadeIn > 0 && frame < fadeIn) {
        volume *= interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' })
    }

    // 淡出
    if (fadeOut > 0 && frame > bgm.durationInFrames - fadeOut) {
        volume *= interpolate(
            frame,
            [bgm.durationInFrames - fadeOut, bgm.durationInFrames],
            [1, 0],
            { extrapolateLeft: 'clamp' }
        )
    }

    return <Audio src={bgm.src} volume={volume} endAt={bgm.durationInFrames} />
}

/**
 * 单个片段渲染器 - 支持转场效果
 */
interface ClipRendererProps {
    clip: VideoClip & { startFrame: number; endFrame: number }
    config: EditorConfig
    transitionType?: 'none' | 'dissolve' | 'fade' | 'slide'
    transitionDuration: number
    isLastClip: boolean
}

const ClipRenderer: React.FC<ClipRendererProps> = ({
    clip,
    config,
    transitionType = 'none',
    transitionDuration,
    isLastClip
}) => {
    void config
    const frame = useCurrentFrame()
    const clipDuration = clip.durationInFrames

    // 计算转场效果
    let opacity = 1
    let transform = 'none'

    if (transitionType !== 'none' && transitionDuration > 0) {
        // 出场转场效果 (在片段末尾)
        if (!isLastClip && frame > clipDuration - transitionDuration) {
            const exitProgress = interpolate(
                frame,
                [clipDuration - transitionDuration, clipDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = 1 - exitProgress
                    break
                case 'slide':
                    transform = `translateX(${-exitProgress * 100}%)`
                    break
            }
        }

        // 入场转场效果 (在片段开头)
        if (frame < transitionDuration) {
            const enterProgress = interpolate(
                frame,
                [0, transitionDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = enterProgress
                    break
                case 'slide':
                    transform = `translateX(${(1 - enterProgress) * 100}%)`
                    break
            }
        }
    }

    return (
        <AbsoluteFill style={{ opacity, transform }}>
            {/* 视频 */}
            <Video
                src={clip.src}
                startFrom={clip.trim?.from || 0}
                endAt={clipDuration}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />

            {/* 附属配音 */}
            {clip.attachment?.audio && (
                <Audio
                    src={clip.attachment.audio.src}
                    volume={clip.attachment.audio.volume}
                    endAt={clipDuration}
                />
            )}

            {/* 附属字幕 */}
            {clip.attachment?.subtitle && (
                <SubtitleOverlay
                    text={clip.attachment.subtitle.text}
                    style={clip.attachment.subtitle.style}
                />
            )}
        </AbsoluteFill>
    )
}

/**
 * 字幕叠加层
 */
interface SubtitleOverlayProps {
    text: string
    style: 'default' | 'cinematic'
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, style }) => {
    const styles = {
        default: {
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '24px',
            color: 'white'
        },
        cinematic: {
            background: 'transparent',
            padding: '12px 24px',
            fontSize: '28px',
            color: 'white',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            fontWeight: 'bold' as const
        }
    }

    return (
        <AbsoluteFill
            style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: '60px'
            }}
        >
            <div style={styles[style]}>
                {text}
            </div>
        </AbsoluteFill>
    )
}

export default VideoComposition
```

- `<Video>`: added `endAt={clipDuration}` to prevent overflow
- `<Audio>` (BGM): added `endAt={bgm.durationInFrames}`
- `<Audio>` (attachment): added `endAt={clipDuration}`

### Phase 8 — WAV Duration Fallback Fix

```diff:generate-voice-line.ts
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { fal } from '@fal-ai/client'
import { prisma } from '@/lib/prisma'
import { getAudioApiKey, getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { extractStorageKey, getSignedUrl, toFetchableUrl, uploadObject } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { synthesizeWithBailianTTS } from '@/lib/providers/bailian'
import { OmniVoiceTTSGenerator } from '@/lib/generators/audio/omnivoice-tts'
import {
  parseSpeakerVoiceMap,
  resolveVoiceBindingForProvider,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'

type CheckCancelled = () => Promise<void>
type CharacterVoiceProfile = CharacterVoiceFields & { name: string }

function normalizeBailianVoiceGenerationError(errorMessage: string | null | undefined) {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : ''
  if (!message) return 'BAILIAN_AUDIO_GENERATION_FAILED'

  const normalized = message.toLowerCase()
  if (
    normalized.includes('bailian_tts_failed(400): invalidparameter') ||
    normalized.includes('invalidparameter')
  ) {
    return '无效音色ID，QwenTTS 必须使用 AI 设计音色'
  }

  return message
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') {
      return Math.round((buffer.length * 8) / 128)
    }

    const byteRate = buffer.readUInt32LE(28)
    let offset = 12
    let dataSize = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize
    }

    if (dataSize > 0 && byteRate > 0) {
      return Math.round((dataSize / byteRate) * 1000)
    }

    return Math.round((buffer.length * 8) / 128)
  } catch {
    return Math.round((buffer.length * 8) / 128)
  }
}

async function generateVoiceWithIndexTTS2(params: {
  endpoint: string
  referenceAudioUrl: string
  text: string
  emotionPrompt?: string | null
  strength?: number
  falApiKey?: string
}) {
  const strength = typeof params.strength === 'number' ? params.strength : 0.4

  _ulogInfo(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
  if (params.emotionPrompt) {
    _ulogInfo(`IndexTTS2: Using emotion prompt: ${params.emotionPrompt}`)
  }

  if (params.falApiKey) {
    fal.config({ credentials: params.falApiKey })
  }

  const audioDataUrl = params.referenceAudioUrl.startsWith('data:')
    ? params.referenceAudioUrl
    : await normalizeToBase64ForGeneration(params.referenceAudioUrl)

  const input: {
    audio_url: string
    prompt: string
    should_use_prompt_for_emotion: boolean
    strength: number
    emotion_prompt?: string
  } = {
    audio_url: audioDataUrl,
    prompt: params.text,
    should_use_prompt_for_emotion: true,
    strength,
  }

  if (params.emotionPrompt?.trim()) {
    input.emotion_prompt = params.emotionPrompt.trim()
  }

  const result = await fal.subscribe(params.endpoint, {
    input,
    logs: false,
  })

  const audioUrl = (result as { data?: { audio?: { url?: string } } })?.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio URL in response')
  }

  const audioData = await downloadAudioData(audioUrl)

  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

function matchCharacterBySpeaker(
  speaker: string,
  characters: CharacterVoiceProfile[],
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

async function resolveReferenceAudioUrl(referenceAudioUrl: string): Promise<string> {
  if (referenceAudioUrl.startsWith('data:')) {
    return referenceAudioUrl
  }
  // /api/storage/sign?key=... -> extract key and re-sign
  if (referenceAudioUrl.startsWith('/api/storage/sign')) {
    try {
      const parsed = new URL(referenceAudioUrl, 'http://localhost')
      const encodedKey = parsed.searchParams.get('key')
      if (encodedKey) {
        const storageKey = decodeURIComponent(encodedKey)
        return getSignedUrl(storageKey, 3600)
      }
    } catch { /* fall through */ }
  }
  if (referenceAudioUrl.startsWith('http')) {
    const storageKey = extractStorageKey(referenceAudioUrl)
    if (storageKey) {
      return getSignedUrl(storageKey, 3600)
    }
    return referenceAudioUrl
  }
  if (referenceAudioUrl.startsWith('/m/')) {
    const storageKey = await resolveStorageKeyFromMediaValue(referenceAudioUrl)
    if (!storageKey) {
      throw new Error(`无法解析参考音频路径: ${referenceAudioUrl}`)
    }
    return getSignedUrl(storageKey, 3600)
  }
  if (referenceAudioUrl.startsWith('/api/files/')) {
    const storageKey = extractStorageKey(referenceAudioUrl)
    return storageKey ? getSignedUrl(storageKey, 3600) : referenceAudioUrl
  }
  // Plain COS key (e.g., images/voice/custom/xxx.wav) -> sign it
  return getSignedUrl(referenceAudioUrl, 3600)
}

async function downloadAudioData(audioUrl: string): Promise<Buffer> {
  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      isNarration: true,
      emotionPrompt: true,
      emotionStrength: true,
      matchedPanel: { select: { srtSegment: true } },
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const [projectData, episode] = await Promise.all([
    prisma.novelPromotionProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Novel promotion project not found')
  }

  const speakerVoices: SpeakerVoiceMap = parseSpeakerVoiceMap(episode?.speakerVoices)

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]

  const text = line.isNarration ? (line.matchedPanel?.srtSegment || '').trim() : (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  const voiceBinding = resolveVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
  let generated: { audioData: Buffer; audioDuration: number }
  if (providerKey === 'fal') {
    if (!voiceBinding || voiceBinding.provider !== 'fal') {
      throw new Error('请先为该发言人设置参考音频')
    }

    const fullAudioUrl = await resolveReferenceAudioUrl(voiceBinding.referenceAudioUrl)
    const falApiKey = await getAudioApiKey(params.userId, audioSelection.modelKey)
    generated = await generateVoiceWithIndexTTS2({
      endpoint: audioSelection.modelId,
      referenceAudioUrl: fullAudioUrl,
      text,
      emotionPrompt: line.isNarration ? undefined : line.emotionPrompt,
      strength: line.isNarration ? undefined : (line.emotionStrength ?? 0.4),
      falApiKey,
    })
  } else if (providerKey === 'bailian') {
    if (!voiceBinding || voiceBinding.provider !== 'bailian') {
      const hasUploadedReference =
        !!character?.customVoiceUrl ||
        (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)
      if (hasUploadedReference) {
        throw new Error('无音色ID，QwenTTS 必须使用 AI 设计音色')
      }
      throw new Error('请先为该发言人绑定百炼音色')
    }
    const { apiKey } = await getProviderConfig(params.userId, audioSelection.provider)
    const result = await synthesizeWithBailianTTS({
      text,
      voiceId: voiceBinding.voiceId,
      modelId: audioSelection.modelId,
      languageType: 'Chinese',
    }, apiKey)
    if (!result.success || !result.audioData) {
      throw new Error(normalizeBailianVoiceGenerationError(result.error))
    }

    const audioData = result.audioData
    generated = {
      audioData,
      audioDuration: result.audioDuration ?? getWavDurationFromBuffer(audioData),
    }
  } else if (providerKey === 'omnivoice' || providerKey === 'openai-compatible') {
    const hasUploadedRef = !!character?.customVoiceUrl ||
      (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)

    console.log(`[TTS OmniVoice] character.customVoiceUrl=${character?.customVoiceUrl}, speakerVoice.audioUrl=${(speakerVoice as { audioUrl?: string })?.audioUrl}`)

    if (!voiceBinding && !hasUploadedRef) {
      throw new Error('请先为该发言人设置参考音频')
    }

    const referenceAudioUrl = voiceBinding?.provider === 'omnivoice'
      ? voiceBinding.referenceAudioUrl
      : (voiceBinding?.provider === 'fal'
        ? voiceBinding.referenceAudioUrl
        : (character?.customVoiceUrl || (speakerVoice as { audioUrl?: string })?.audioUrl))

    console.log(`[TTS OmniVoice] referenceAudioUrl=${referenceAudioUrl}`)

    if (!referenceAudioUrl) {
      throw new Error('请先为该发言人设置参考音频')
    }

    const fullAudioUrl = await resolveReferenceAudioUrl(referenceAudioUrl)
    console.log(`[TTS OmniVoice] fullAudioUrl (resolved)=${fullAudioUrl?.substring(0, 150)}...`)

    const generator = new OmniVoiceTTSGenerator(audioSelection.provider)
    const result = await generator.generate({
      userId: params.userId,
      text,
      options: {
        refAudioUrl: fullAudioUrl,
      }
    })

    if (!result.success || !result.audioUrl) {
      throw new Error(result.error || 'OmniVoice TTS failed')
    }

    const audioResponse = await fetch(result.audioUrl)
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`)
    }
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

    generated = {
      audioData: audioBuffer,
      audioDuration: getWavDurationFromBuffer(audioBuffer),
    }
  } else {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}_${Date.now()}.wav`
  const cosKey = await uploadObject(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.novelPromotionVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: cosKey,
      audioDuration: generated.audioDuration || null,
    },
  })

  const signedUrl = getSignedUrl(cosKey, 7200)
  return {
    lineId: line.id,
    audioUrl: signedUrl,
    storageKey: cosKey,
    audioDuration: generated.audioDuration || null,
  }
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
===
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { fal } from '@fal-ai/client'
import { prisma } from '@/lib/prisma'
import { getAudioApiKey, getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { extractStorageKey, getSignedUrl, toFetchableUrl, uploadObject } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { synthesizeWithBailianTTS } from '@/lib/providers/bailian'
import { OmniVoiceTTSGenerator } from '@/lib/generators/audio/omnivoice-tts'
import {
  parseSpeakerVoiceMap,
  resolveVoiceBindingForProvider,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'

type CheckCancelled = () => Promise<void>
type CharacterVoiceProfile = CharacterVoiceFields & { name: string }

function normalizeBailianVoiceGenerationError(errorMessage: string | null | undefined) {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : ''
  if (!message) return 'BAILIAN_AUDIO_GENERATION_FAILED'

  const normalized = message.toLowerCase()
  if (
    normalized.includes('bailian_tts_failed(400): invalidparameter') ||
    normalized.includes('invalidparameter')
  ) {
    return '无效音色ID，QwenTTS 必须使用 AI 设计音色'
  }

  return message
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') {
      // Not a WAV file — rough estimate based on typical 16kHz/16bit mono PCM
      return Math.round((buffer.length / 32000) * 1000)
    }

    // Parse byteRate from fmt chunk (offset 28 in standard WAV header)
    const byteRate = buffer.readUInt32LE(28)
    if (byteRate <= 0) {
      return Math.round((buffer.length / 32000) * 1000)
    }

    // Find data chunk for accurate size
    let offset = 12
    let dataSize = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize + (chunkSize % 2)  // account for padding byte
    }

    if (dataSize > 0) {
      return Math.round((dataSize / byteRate) * 1000)
    }

    // Fallback: use total file size minus header
    const estimatedDataSize = Math.max(0, buffer.length - 44)
    return Math.round((estimatedDataSize / byteRate) * 1000)
  } catch {
    // Last resort: assume 16kHz/16bit mono PCM (byteRate = 32000)
    return Math.round((buffer.length / 32000) * 1000)
  }
}

async function generateVoiceWithIndexTTS2(params: {
  endpoint: string
  referenceAudioUrl: string
  text: string
  emotionPrompt?: string | null
  strength?: number
  falApiKey?: string
}) {
  const strength = typeof params.strength === 'number' ? params.strength : 0.4

  _ulogInfo(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
  if (params.emotionPrompt) {
    _ulogInfo(`IndexTTS2: Using emotion prompt: ${params.emotionPrompt}`)
  }

  if (params.falApiKey) {
    fal.config({ credentials: params.falApiKey })
  }

  const audioDataUrl = params.referenceAudioUrl.startsWith('data:')
    ? params.referenceAudioUrl
    : await normalizeToBase64ForGeneration(params.referenceAudioUrl)

  const input: {
    audio_url: string
    prompt: string
    should_use_prompt_for_emotion: boolean
    strength: number
    emotion_prompt?: string
  } = {
    audio_url: audioDataUrl,
    prompt: params.text,
    should_use_prompt_for_emotion: true,
    strength,
  }

  if (params.emotionPrompt?.trim()) {
    input.emotion_prompt = params.emotionPrompt.trim()
  }

  const result = await fal.subscribe(params.endpoint, {
    input,
    logs: false,
  })

  const audioUrl = (result as { data?: { audio?: { url?: string } } })?.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio URL in response')
  }

  const audioData = await downloadAudioData(audioUrl)

  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

function matchCharacterBySpeaker(
  speaker: string,
  characters: CharacterVoiceProfile[],
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

async function resolveReferenceAudioUrl(referenceAudioUrl: string): Promise<string> {
  if (referenceAudioUrl.startsWith('data:')) {
    return referenceAudioUrl
  }
  // /api/storage/sign?key=... -> extract key and re-sign
  if (referenceAudioUrl.startsWith('/api/storage/sign')) {
    try {
      const parsed = new URL(referenceAudioUrl, 'http://localhost')
      const encodedKey = parsed.searchParams.get('key')
      if (encodedKey) {
        const storageKey = decodeURIComponent(encodedKey)
        return getSignedUrl(storageKey, 3600)
      }
    } catch { /* fall through */ }
  }
  if (referenceAudioUrl.startsWith('http')) {
    const storageKey = extractStorageKey(referenceAudioUrl)
    if (storageKey) {
      return getSignedUrl(storageKey, 3600)
    }
    return referenceAudioUrl
  }
  if (referenceAudioUrl.startsWith('/m/')) {
    const storageKey = await resolveStorageKeyFromMediaValue(referenceAudioUrl)
    if (!storageKey) {
      throw new Error(`无法解析参考音频路径: ${referenceAudioUrl}`)
    }
    return getSignedUrl(storageKey, 3600)
  }
  if (referenceAudioUrl.startsWith('/api/files/')) {
    const storageKey = extractStorageKey(referenceAudioUrl)
    return storageKey ? getSignedUrl(storageKey, 3600) : referenceAudioUrl
  }
  // Plain COS key (e.g., images/voice/custom/xxx.wav) -> sign it
  return getSignedUrl(referenceAudioUrl, 3600)
}

async function downloadAudioData(audioUrl: string): Promise<Buffer> {
  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      isNarration: true,
      emotionPrompt: true,
      emotionStrength: true,
      matchedPanel: { select: { srtSegment: true } },
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const [projectData, episode] = await Promise.all([
    prisma.novelPromotionProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Novel promotion project not found')
  }

  const speakerVoices: SpeakerVoiceMap = parseSpeakerVoiceMap(episode?.speakerVoices)

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]

  const text = line.isNarration ? (line.matchedPanel?.srtSegment || '').trim() : (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  const voiceBinding = resolveVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
  let generated: { audioData: Buffer; audioDuration: number }
  if (providerKey === 'fal') {
    if (!voiceBinding || voiceBinding.provider !== 'fal') {
      throw new Error('请先为该发言人设置参考音频')
    }

    const fullAudioUrl = await resolveReferenceAudioUrl(voiceBinding.referenceAudioUrl)
    const falApiKey = await getAudioApiKey(params.userId, audioSelection.modelKey)
    generated = await generateVoiceWithIndexTTS2({
      endpoint: audioSelection.modelId,
      referenceAudioUrl: fullAudioUrl,
      text,
      emotionPrompt: line.isNarration ? undefined : line.emotionPrompt,
      strength: line.isNarration ? undefined : (line.emotionStrength ?? 0.4),
      falApiKey,
    })
  } else if (providerKey === 'bailian') {
    if (!voiceBinding || voiceBinding.provider !== 'bailian') {
      const hasUploadedReference =
        !!character?.customVoiceUrl ||
        (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)
      if (hasUploadedReference) {
        throw new Error('无音色ID，QwenTTS 必须使用 AI 设计音色')
      }
      throw new Error('请先为该发言人绑定百炼音色')
    }
    const { apiKey } = await getProviderConfig(params.userId, audioSelection.provider)
    const result = await synthesizeWithBailianTTS({
      text,
      voiceId: voiceBinding.voiceId,
      modelId: audioSelection.modelId,
      languageType: 'Chinese',
    }, apiKey)
    if (!result.success || !result.audioData) {
      throw new Error(normalizeBailianVoiceGenerationError(result.error))
    }

    const audioData = result.audioData
    generated = {
      audioData,
      audioDuration: result.audioDuration ?? getWavDurationFromBuffer(audioData),
    }
  } else if (providerKey === 'omnivoice' || providerKey === 'openai-compatible') {
    const hasUploadedRef = !!character?.customVoiceUrl ||
      (speakerVoice?.provider === 'fal' && !!speakerVoice.audioUrl)

    console.log(`[TTS OmniVoice] character.customVoiceUrl=${character?.customVoiceUrl}, speakerVoice.audioUrl=${(speakerVoice as { audioUrl?: string })?.audioUrl}`)

    if (!voiceBinding && !hasUploadedRef) {
      throw new Error('请先为该发言人设置参考音频')
    }

    const referenceAudioUrl = voiceBinding?.provider === 'omnivoice'
      ? voiceBinding.referenceAudioUrl
      : (voiceBinding?.provider === 'fal'
        ? voiceBinding.referenceAudioUrl
        : (character?.customVoiceUrl || (speakerVoice as { audioUrl?: string })?.audioUrl))

    console.log(`[TTS OmniVoice] referenceAudioUrl=${referenceAudioUrl}`)

    if (!referenceAudioUrl) {
      throw new Error('请先为该发言人设置参考音频')
    }

    const fullAudioUrl = await resolveReferenceAudioUrl(referenceAudioUrl)
    console.log(`[TTS OmniVoice] fullAudioUrl (resolved)=${fullAudioUrl?.substring(0, 150)}...`)

    const generator = new OmniVoiceTTSGenerator(audioSelection.provider)
    const result = await generator.generate({
      userId: params.userId,
      text,
      options: {
        refAudioUrl: fullAudioUrl,
      }
    })

    if (!result.success || !result.audioUrl) {
      throw new Error(result.error || 'OmniVoice TTS failed')
    }

    const audioResponse = await fetch(result.audioUrl)
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`)
    }
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

    generated = {
      audioData: audioBuffer,
      audioDuration: getWavDurationFromBuffer(audioBuffer),
    }
  } else {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}_${Date.now()}.wav`
  const cosKey = await uploadObject(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.novelPromotionVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: cosKey,
      audioDuration: generated.audioDuration || null,
    },
  })

  const signedUrl = getSignedUrl(cosKey, 7200)
  return {
    lineId: line.id,
    audioUrl: signedUrl,
    storageKey: cosKey,
    audioDuration: generated.audioDuration || null,
  }
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
```

- Removed `buffer.length * 8 / 128` (assumes 128kbps, ~3x error for WAV)
- Now properly parses `byteRate` from WAV fmt chunk
- Handles padding bytes in chunk traversal
- Fallback: 16kHz/16bit mono PCM estimate instead of 128kbps assumption

### Phase 9 — Narrator Toggle (DB + UI + API)

```diff:schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Account {
  id                String  @id @default(uuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("account")
}

model CharacterAppearance {
  id                   String                  @id @default(uuid())
  characterId          String
  appearanceIndex      Int
  changeReason         String
  description          String?                 @db.Text
  descriptions         String?                 @db.Text
  imageUrl             String?                 @db.Text
  imageUrls            String?                 @db.Text
  selectedIndex        Int?
  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @default(now()) @updatedAt
  previousImageUrl     String?                 @db.Text
  previousImageUrls    String?                 @db.Text
  previousDescription  String?                 @db.Text // 上一次的描述词（用于撤回）
  previousDescriptions String?                 @db.Text // 上一次的描述词数组（用于撤回）
  imageMediaId         String?
  imageMedia           MediaObject?            @relation("CharacterAppearanceImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  character            NovelPromotionCharacter @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([characterId, appearanceIndex])
  @@index([characterId])
  @@index([imageMediaId])
  @@map("character_appearances")
}

model LocationImage {
  id                  String                   @id @default(uuid())
  locationId          String
  imageIndex          Int
  description         String?                  @db.Text
  availableSlots      String?                  @db.Text
  imageUrl            String?                  @db.Text
  isSelected          Boolean                  @default(false)
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @default(now()) @updatedAt
  previousImageUrl    String?                  @db.Text
  previousDescription String?                  @db.Text // 上一次的描述词（用于撤回）
  imageMediaId        String?
  imageMedia          MediaObject?             @relation("LocationImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  location            NovelPromotionLocation   @relation("LocationImages", fields: [locationId], references: [id], onDelete: Cascade)
  selectedByLocations NovelPromotionLocation[] @relation("SelectedLocationImage")

  @@unique([locationId, imageIndex])
  @@index([locationId])
  @@index([imageMediaId])
  @@map("location_images")
}

model NovelPromotionCharacter {
  id                      String                @id @default(uuid())
  novelPromotionProjectId String
  name                    String
  aliases                 String?               @db.Text
  createdAt               DateTime              @default(now())
  updatedAt               DateTime              @default(now()) @updatedAt
  customVoiceUrl          String?               @db.Text
  customVoiceMediaId      String?
  customVoiceMedia        MediaObject?          @relation("NovelPromotionCharacterVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  voiceId                 String?
  voiceType               String?
  profileData             String?               @db.Text
  profileConfirmed        Boolean               @default(false)
  introduction            String?               @db.Text // 角色介绍（身份、关系、称呼映射，如"我"对应此角色）
  sourceGlobalCharacterId String? // 🆕 来源全局角色ID（复制时记录）
  appearances             CharacterAppearance[]
  novelPromotionProject   NovelPromotionProject @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)

  @@index([novelPromotionProjectId])
  @@index([customVoiceMediaId])
  @@map("novel_promotion_characters")
}

model NovelPromotionLocation {
  id                      String                @id @default(uuid())
  novelPromotionProjectId String
  name                    String
  summary                 String?               @db.Text // 场景简要描述（用途/人物关联）
  assetKind               String                @default("location")
  createdAt               DateTime              @default(now())
  updatedAt               DateTime              @default(now()) @updatedAt
  sourceGlobalLocationId  String? // 🆕 来源全局场景ID（复制时记录）
  selectedImageId         String?
  selectedImage           LocationImage?        @relation("SelectedLocationImage", fields: [selectedImageId], references: [id], onDelete: SetNull)
  images                  LocationImage[]       @relation("LocationImages")
  novelPromotionProject   NovelPromotionProject @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)

  @@index([novelPromotionProjectId])
  @@map("novel_promotion_locations")
}

model NovelPromotionEpisode {
  id                      String                     @id @default(uuid())
  novelPromotionProjectId String
  episodeNumber           Int
  name                    String
  description             String?                    @db.Text
  novelText               String?                    @db.Text
  audioUrl                String?                    @db.Text
  audioMediaId            String?
  audioMedia              MediaObject?               @relation("NovelPromotionEpisodeAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  srtContent              String?                    @db.Text
  createdAt               DateTime                   @default(now())
  updatedAt               DateTime                   @default(now()) @updatedAt
  speakerVoices           String?                    @db.Text
  clips                   NovelPromotionClip[]
  novelPromotionProject   NovelPromotionProject      @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)
  shots                   NovelPromotionShot[]
  storyboards             NovelPromotionStoryboard[]
  voiceLines              NovelPromotionVoiceLine[]
  editorProject           VideoEditorProject?

  @@unique([novelPromotionProjectId, episodeNumber])
  @@index([novelPromotionProjectId])
  @@index([audioMediaId])
  @@map("novel_promotion_episodes")
}

// 视频编辑器项目 - 存储剪辑数据
model VideoEditorProject {
  id           String                @id @default(uuid())
  episodeId    String                @unique
  projectData  String                @db.Text // JSON 存储编辑项目数据
  renderStatus String? // pending | rendering | completed | failed
  renderTaskId String?
  outputUrl    String?               @db.Text
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @default(now()) @updatedAt
  episode      NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@map("video_editor_projects")
}

model NovelPromotionClip {
  id         String                    @id @default(uuid())
  episodeId  String
  start      Int?
  end        Int?
  duration   Int?
  summary    String                    @db.Text
  location   String?                   @db.Text
  content    String                    @db.Text
  createdAt  DateTime                  @default(now())
  updatedAt  DateTime                  @default(now()) @updatedAt
  characters String?                   @db.Text
  props      String?                   @db.Text
  endText    String?                   @db.Text
  shotCount  Int?
  startText  String?                   @db.Text
  screenplay String?                   @db.Text
  episode    NovelPromotionEpisode     @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  shots      NovelPromotionShot[]
  storyboard NovelPromotionStoryboard?

  @@index([episodeId])
  @@map("novel_promotion_clips")
}

model NovelPromotionPanel {
  id                String                    @id @default(uuid())
  storyboardId      String
  panelIndex        Int
  panelNumber       Int?
  shotType          String?                   @db.Text
  cameraMove        String?                   @db.Text
  description       String?                   @db.Text
  location          String?                   @db.Text
  characters        String?                   @db.Text
  props             String?                   @db.Text
  srtSegment        String?                   @db.Text
  srtStart          Float?
  srtEnd            Float?
  duration          Float?
  imagePrompt       String?                   @db.Text
  imageUrl          String?                   @db.Text
  imageMediaId      String?
  imageMedia        MediaObject?              @relation("NovelPromotionPanelImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  imageHistory      String?                   @db.Text
  videoPrompt       String?                   @db.Text
  firstLastFramePrompt String?                @db.Text
  videoUrl          String?                   @db.Text
  videoGenerationMode String?                 @db.Text // 视频生成方式：normal | firstlastframe
  videoMediaId      String?
  videoMedia        MediaObject?              @relation("NovelPromotionPanelVideoMedia", fields: [videoMediaId], references: [id], onDelete: SetNull)
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @default(now()) @updatedAt
  sceneType         String?
  candidateImages   String?                   @db.Text
  linkedToNextPanel Boolean                   @default(false)
  lipSyncTaskId     String?
  lipSyncVideoUrl   String?
  lipSyncVideoMediaId String?
  lipSyncVideoMedia MediaObject?              @relation("NovelPromotionPanelLipSyncVideoMedia", fields: [lipSyncVideoMediaId], references: [id], onDelete: SetNull)
  sketchImageUrl    String?                   @db.Text
  sketchImageMediaId String?
  sketchImageMedia  MediaObject?              @relation("NovelPromotionPanelSketchMedia", fields: [sketchImageMediaId], references: [id], onDelete: SetNull)
  photographyRules  String?                   @db.Text
  actingNotes       String?                   @db.Text // 演技指导数据 JSON
  previousImageUrl  String?                   @db.Text
  previousImageMediaId String?
  previousImageMedia MediaObject?             @relation("NovelPromotionPanelPreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  storyboard        NovelPromotionStoryboard  @relation(fields: [storyboardId], references: [id], onDelete: Cascade)
  matchedVoiceLines NovelPromotionVoiceLine[]

  @@unique([storyboardId, panelIndex])
  @@index([storyboardId])
  @@index([imageMediaId])
  @@index([videoMediaId])
  @@index([lipSyncVideoMediaId])
  @@index([sketchImageMediaId])
  @@index([previousImageMediaId])
  @@map("novel_promotion_panels")
}

model NovelPromotionProject {
  id              String                    @id @default(uuid())
  projectId       String                    @unique
  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @default(now()) @updatedAt
  analysisModel   String? // 用户配置的分析模型（nullable，必须配置后才能使用）
  imageModel      String? // 用户配置的图片模型
  videoModel      String? // 用户配置的视频模型
  audioModel      String? // 用户配置的语音模型
  videoRatio      String                    @default("9:16")
  ttsRate         String                    @default("+50%")
  globalAssetText String?                   @db.Text
  artStyle        String                    @default("american-comic")
  artStylePrompt  String?                   @db.Text
  characterModel  String? // 用户配置的角色图片模型
  locationModel   String? // 用户配置的场景图片模型
  storyboardModel String? // 用户配置的分镜图片模型
  editModel       String? // 用户配置的修图/编辑模型
  videoResolution String                    @default("720p")
  capabilityOverrides String?              @db.Text
  workflowMode    String                    @default("srt")
  lastEpisodeId   String?
  imageResolution String                    @default("2K")
  importStatus    String?
  characters      NovelPromotionCharacter[]
  episodes        NovelPromotionEpisode[]
  locations       NovelPromotionLocation[]
  project         Project                   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("novel_promotion_projects")
}

model NovelPromotionShot {
  id              String                @id @default(uuid())
  episodeId       String
  clipId          String?
  shotId          String
  srtStart        Int
  srtEnd          Int
  srtDuration     Float
  sequence        String?               @db.Text
  locations       String?               @db.Text
  characters      String?               @db.Text
  plot            String?               @db.Text
  imagePrompt     String?               @db.Text
  scale           String?               @db.Text
  module          String?               @db.Text
  focus           String?               @db.Text
  zhSummarize     String?               @db.Text
  imageUrl        String?               @db.Text
  imageMediaId    String?
  imageMedia      MediaObject?          @relation("NovelPromotionShotImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @default(now()) @updatedAt
  pov             String?               @db.Text
  clip            NovelPromotionClip?   @relation(fields: [clipId], references: [id], onDelete: Cascade)
  episode         NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@index([clipId])
  @@index([episodeId])
  @@index([shotId])
  @@index([imageMediaId])
  @@map("novel_promotion_shots")
}

model NovelPromotionStoryboard {
  id                  String                @id @default(uuid())
  episodeId           String
  clipId              String                @unique
  storyboardImageUrl  String?               @db.Text
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @default(now()) @updatedAt
  panelCount          Int                   @default(9)
  storyboardTextJson  String?               @db.Text
  imageHistory        String?               @db.Text
  candidateImages     String?               @db.Text
  lastError           String?
  photographyPlan     String?               @db.Text
  panels              NovelPromotionPanel[]
  clip                NovelPromotionClip    @relation(fields: [clipId], references: [id], onDelete: Cascade)
  episode             NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  supplementaryPanels SupplementaryPanel[]

  @@index([clipId])
  @@index([episodeId])
  @@map("novel_promotion_storyboards")
}

model SupplementaryPanel {
  id            String                   @id @default(uuid())
  storyboardId  String
  sourceType    String
  sourcePanelId String?
  description   String?                  @db.Text
  imagePrompt   String?                  @db.Text
  imageUrl      String?                  @db.Text
  imageMediaId  String?
  imageMedia    MediaObject?             @relation("SupplementaryPanelImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  characters    String?                  @db.Text
  location      String?                  @db.Text
  createdAt     DateTime                 @default(now())
  updatedAt     DateTime                 @default(now()) @updatedAt
  storyboard    NovelPromotionStoryboard @relation(fields: [storyboardId], references: [id], onDelete: Cascade)

  @@index([storyboardId])
  @@index([imageMediaId])
  @@map("supplementary_panels")
}

model Project {
  id                 String                 @id @default(uuid())
  name               String
  description        String?                @db.Text
  userId             String
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @default(now()) @updatedAt
  lastAccessedAt     DateTime?
  novelPromotionData NovelPromotionProject?
  user               User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageCosts         UsageCost[]

  @@index([userId])
  @@map("projects")
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique(map: "Session_sessionToken_key")
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

model UsageCost {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  apiType   String
  model     String
  action    String
  quantity  Int
  unit      String
  cost      Decimal  @db.Decimal(18, 6)
  metadata  String?  @db.Text
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([apiType])
  @@index([createdAt])
  @@index([projectId])
  @@index([userId])
  @@map("usage_costs")
}

model User {
  id            String          @id @default(uuid())
  name          String          @unique(map: "User_name_key")
  email         String?
  emailVerified DateTime?
  image         String?
  password      String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @default(now()) @updatedAt
  accounts      Account[]
  projects      Project[]
  sessions      Session[]
  usageCosts    UsageCost[]
  balance       UserBalance?
  preferences   UserPreference?

  // 资产中心
  globalAssetFolders GlobalAssetFolder[]
  globalCharacters   GlobalCharacter[]
  globalLocations    GlobalLocation[]
  globalVoices       GlobalVoice[]
  tasks              Task[]
  taskEvents         TaskEvent[]
  graphRuns          GraphRun[]
  graphEvents        GraphEvent[]

  @@map("user")
}

model UserPreference {
  id              String   @id @default(uuid())
  userId          String   @unique
  analysisModel   String? // 用户配置的分析模型（nullable，必须配置后才能使用）
  characterModel  String? // 用户配置的角色图片模型
  locationModel   String? // 用户配置的场景图片模型
  storyboardModel String? // 用户配置的分镜图片模型
  editModel       String? // 用户配置的修图模型
  videoModel      String? // 用户配置的视频模型
  audioModel      String? // 用户配置的语音模型
  lipSyncModel    String? // 用户配置的口型同步模型
  voiceDesignModel String? // 用户配置的音色设计模型
  analysisConcurrency Int? // 分析流程并发上限
  imageConcurrency Int? // 图像流程并发上限
  videoConcurrency Int? // 视频流程并发上限
  videoRatio      String   @default("9:16")
  videoResolution String   @default("720p")
  artStyle        String   @default("american-comic")
  ttsRate         String   @default("+50%")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @default(now()) @updatedAt
  imageResolution String   @default("2K")
  capabilityDefaults String? @db.Text

  // API Key 配置（极简版）
  llmBaseUrl  String? @default("https://openrouter.ai/api/v1")
  llmApiKey   String? @db.Text // 加密存储
  falApiKey   String? @db.Text // FAL（图片+视频+语音）
  googleAiKey String? @db.Text // Google AI（Gemini 图片）
  arkApiKey   String? @db.Text // 火山引擎（Seedream+Seedance）
  qwenApiKey  String? @db.Text // 阿里百炼（声音设计）

  // 自定义模型列表 + 价格（JSON）
  customModels String? @db.Text

  // 自定义 OpenAI 兼容提供商列表（JSON，包含加密的 API Key）
  customProviders String? @db.Text

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_preferences")
}

model VerificationToken {
  identifier String
  token      String   @unique(map: "VerificationToken_token_key")
  expires    DateTime

  @@unique([identifier, token])
  @@map("verificationtoken")
}

model NovelPromotionVoiceLine {
  id                  String                @id @default(uuid())
  episodeId           String
  lineIndex           Int
  speaker             String
  content             String                @db.Text
  isNarration         Boolean               @default(false)
  voicePresetId       String?
  audioUrl            String?               @db.Text
  audioMediaId        String?
  audioMedia          MediaObject?          @relation("NovelPromotionVoiceLineAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @default(now()) @updatedAt
  emotionPrompt       String?               @db.Text
  emotionStrength     Float?                @default(0.4)
  matchedPanelIndex   Int?
  matchedStoryboardId String?
  audioDuration       Int?
  matchedPanelId      String?
  episode             NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  matchedPanel        NovelPromotionPanel?  @relation(fields: [matchedPanelId], references: [id])

  @@unique([episodeId, lineIndex])
  @@index([episodeId])
  @@index([matchedPanelId])
  @@index([audioMediaId])
  @@map("novel_promotion_voice_lines")
}

model VoicePreset {
  id          String   @id @default(uuid())
  name        String
  audioUrl    String   @db.Text
  audioMediaId String?
  audioMedia  MediaObject? @relation("VoicePresetAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  description String?  @db.Text
  gender      String?
  isSystem    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([audioMediaId])
  @@map("voice_presets")
}

model UserBalance {
  id           String   @id @default(uuid())
  userId       String   @unique
  balance      Decimal  @default(0) @db.Decimal(18, 6)
  frozenAmount Decimal  @default(0) @db.Decimal(18, 6)
  totalSpent   Decimal  @default(0) @db.Decimal(18, 6)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_balances")
}

model BalanceFreeze {
  id        String   @id @default(uuid())
  userId    String
  amount    Decimal  @db.Decimal(18, 6)
  status    String   @default("pending")
  source    String?  @db.VarChar(64)
  taskId    String?
  requestId String?
  idempotencyKey String? @unique
  metadata  String?  @db.Text
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  @@index([userId])
  @@index([status])
  @@index([taskId])
  @@map("balance_freezes")
}

model BalanceTransaction {
  id           String   @id @default(uuid())
  userId       String
  type         String
  amount       Decimal  @db.Decimal(18, 6)
  balanceAfter Decimal  @db.Decimal(18, 6)
  description  String?  @db.Text
  relatedId    String?
  freezeId     String?
  operatorId   String?  @db.VarChar(64)
  externalOrderId String? @db.VarChar(128)
  idempotencyKey String? @db.VarChar(128)
  projectId    String?  @db.VarChar(128) // 关联项目 ID，用于流水展示项目名
  episodeId    String?  @db.VarChar(128) // 关联集数 ID，用于流水展示集数
  taskType     String?  @db.VarChar(64)  // 任务类型 key（与 action 一致），用于前端 i18n
  billingMeta  String?  @db.Text         // 计费详情 JSON: { quantity, unit, model, resolution, duration, tokens... }
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([type])
  @@index([createdAt])
  @@index([freezeId])
  @@index([externalOrderId])
  @@index([projectId])
  @@unique([userId, type, idempotencyKey])
  @@map("balance_transactions")
}

model Task {
  id               String    @id @default(uuid())
  userId           String
  projectId        String
  episodeId        String?
  type             String
  targetType       String
  targetId         String
  status           String    @default("queued")
  progress         Int       @default(0)
  attempt          Int       @default(0)
  maxAttempts      Int       @default(5)
  priority         Int       @default(0)
  dedupeKey        String?   @unique
  externalId       String?
  payload          Json?
  result           Json?
  errorCode        String?
  errorMessage     String?   @db.Text
  billingInfo      Json?
  billedAt         DateTime?
  queuedAt         DateTime  @default(now())
  startedAt        DateTime?
  finishedAt       DateTime?
  heartbeatAt      DateTime?
  enqueuedAt       DateTime?
  enqueueAttempts  Int       @default(0)
  lastEnqueueError String?   @db.Text
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user   User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  events TaskEvent[]

  @@index([status])
  @@index([type])
  @@index([targetType, targetId])
  @@index([projectId])
  @@index([userId])
  @@index([heartbeatAt])
  @@map("tasks")
}

model TaskEvent {
  id        Int      @id @default(autoincrement())
  taskId    String
  projectId String
  userId    String
  eventType String
  payload   Json?
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([projectId, id])
  @@index([taskId])
  @@index([userId])
  @@map("task_events")
}

model GraphRun {
  id                String             @id @default(uuid())
  userId            String
  projectId         String
  episodeId         String?
  workflowType      String
  taskType          String?
  taskId            String?            @unique
  targetType        String
  targetId          String
  status            String             @default("queued")
  input             Json?
  output            Json?
  errorCode         String?
  errorMessage      String?            @db.Text
  cancelRequestedAt DateTime?
  leaseOwner        String?
  leaseExpiresAt    DateTime?
  heartbeatAt       DateTime?
  workflowVersion   Int                @default(1)
  queuedAt          DateTime           @default(now())
  startedAt         DateTime?
  finishedAt        DateTime?
  lastSeq           Int                @default(0)
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  steps             GraphStep[]
  attempts          GraphStepAttempt[]
  events            GraphEvent[]
  checkpoints       GraphCheckpoint[]
  artifacts         GraphArtifact[]

  @@index([projectId, status])
  @@index([userId, createdAt])
  @@index([taskId])
  @@index([targetType, targetId])
  @@index([workflowType, targetType, targetId, status])
  @@index([leaseExpiresAt])
  @@map("graph_runs")
}

model GraphStep {
  id               String             @id @default(uuid())
  runId            String
  stepKey          String
  stepTitle        String
  status           String             @default("pending")
  currentAttempt   Int                @default(0)
  stepIndex        Int
  stepTotal        Int
  startedAt        DateTime?
  finishedAt       DateTime?
  lastErrorCode    String?
  lastErrorMessage String?            @db.Text
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  run              GraphRun           @relation(fields: [runId], references: [id], onDelete: Cascade)
  attempts         GraphStepAttempt[]

  @@unique([runId, stepKey])
  @@index([runId, status])
  @@index([runId, stepIndex])
  @@map("graph_steps")
}

model GraphStepAttempt {
  id              String     @id @default(uuid())
  runId           String
  stepKey         String
  attempt         Int
  status          String     @default("pending")
  provider        String?
  modelKey        String?
  inputHash       String?
  input           Json?
  outputText      String?    @db.Text
  outputReasoning String?    @db.Text
  usageJson       Json?
  errorCode       String?
  errorMessage    String?    @db.Text
  startedAt       DateTime?
  finishedAt      DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  run             GraphRun   @relation(fields: [runId], references: [id], onDelete: Cascade)
  step            GraphStep  @relation(fields: [runId, stepKey], references: [runId, stepKey], onDelete: Cascade)

  @@unique([runId, stepKey, attempt])
  @@index([runId, stepKey])
  @@index([runId, createdAt])
  @@map("graph_step_attempts")
}

model GraphEvent {
  id        BigInt   @id @default(autoincrement())
  runId     String
  projectId String
  userId    String
  seq       Int
  eventType String
  stepKey   String?
  attempt   Int?
  lane      String?
  payload   Json?
  createdAt DateTime @default(now())
  run       GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([runId, seq])
  @@index([projectId, id])
  @@index([runId, id])
  @@index([userId, id])
  @@map("graph_events")
}

model GraphCheckpoint {
  id         String   @id @default(uuid())
  runId      String
  nodeKey    String
  version    Int
  stateJson  Json
  stateBytes Int
  createdAt  DateTime @default(now())
  run        GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, nodeKey, version])
  @@index([runId, createdAt])
  @@map("graph_checkpoints")
}

model GraphArtifact {
  id          String   @id @default(uuid())
  runId       String
  stepKey     String?
  artifactType String
  refId       String
  versionHash String?
  payload     Json?
  createdAt   DateTime @default(now())
  run         GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, stepKey, artifactType, refId])
  @@index([runId])
  @@index([runId, stepKey])
  @@index([artifactType, refId])
  @@map("graph_artifacts")
}

// ==================== 资产中心 ====================

// 资产文件夹（一层，不支持嵌套）
model GlobalAssetFolder {
  id        String   @id @default(uuid())
  userId    String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  characters GlobalCharacter[]
  locations  GlobalLocation[]
  voices     GlobalVoice[]

  @@index([userId])
  @@map("global_asset_folders")
}

// 全局角色（结构与 NovelPromotionCharacter 一致）
model GlobalCharacter {
  id               String   @id @default(uuid())
  userId           String
  folderId         String?
  name             String
  aliases          String?  @db.Text
  profileData      String?  @db.Text
  profileConfirmed Boolean  @default(false)
  voiceId          String?
  voiceType        String?
  customVoiceUrl   String?  @db.Text
  customVoiceMediaId String?
  customVoiceMedia MediaObject? @relation("GlobalCharacterVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  globalVoiceId    String? // 绑定的全局音色 ID
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user        User                        @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder      GlobalAssetFolder?          @relation(fields: [folderId], references: [id], onDelete: SetNull)
  appearances GlobalCharacterAppearance[]

  @@index([userId])
  @@index([folderId])
  @@index([customVoiceMediaId])
  @@map("global_characters")
}

// 全局角色形象（结构与 CharacterAppearance 一致）
model GlobalCharacterAppearance {
  id                   String   @id @default(uuid())
  characterId          String
  appearanceIndex      Int
  changeReason         String   @default("default")
  artStyle             String?
  description          String?  @db.Text
  descriptions         String?  @db.Text
  imageUrl             String?  @db.Text
  imageMediaId         String?
  imageMedia           MediaObject? @relation("GlobalCharacterAppearanceImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  imageUrls            String?  @db.Text
  selectedIndex        Int?
  previousImageUrl     String?  @db.Text
  previousImageMediaId String?
  previousImageMedia   MediaObject? @relation("GlobalCharacterAppearancePreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  previousImageUrls    String?  @db.Text
  previousDescription  String?  @db.Text // 上一次的描述词（用于撤回）
  previousDescriptions String?  @db.Text // 上一次的描述词数组（用于撤回）
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  character GlobalCharacter @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([characterId, appearanceIndex])
  @@index([characterId])
  @@index([imageMediaId])
  @@index([previousImageMediaId])
  @@map("global_character_appearances")
}

// 全局场景（结构与 NovelPromotionLocation 一致）
model GlobalLocation {
  id        String   @id @default(uuid())
  userId    String
  folderId  String?
  name      String
  artStyle  String?
  summary   String?  @db.Text
  assetKind String   @default("location")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder GlobalAssetFolder?    @relation(fields: [folderId], references: [id], onDelete: SetNull)
  images GlobalLocationImage[]

  @@index([userId])
  @@index([folderId])
  @@map("global_locations")
}

// 全局场景图片（结构与 LocationImage 一致）
model GlobalLocationImage {
  id                  String   @id @default(uuid())
  locationId          String
  imageIndex          Int
  description         String?  @db.Text
  availableSlots      String?  @db.Text
  imageUrl            String?  @db.Text
  imageMediaId        String?
  imageMedia          MediaObject? @relation("GlobalLocationImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  isSelected          Boolean  @default(false)
  previousImageUrl    String?  @db.Text
  previousImageMediaId String?
  previousImageMedia  MediaObject? @relation("GlobalLocationImagePreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  previousDescription String?  @db.Text // 上一次的描述词（用于撤回）
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  location GlobalLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([locationId, imageIndex])
  @@index([locationId])
  @@index([imageMediaId])
  @@index([previousImageMediaId])
  @@map("global_location_images")
}

// 全局音色库
model GlobalVoice {
  id             String   @id @default(uuid())
  userId         String
  folderId       String?
  name           String // 音色名称
  description    String?  @db.Text // 详细描述
  voiceId        String? // qwen-tts-vd 的 voice ID
  voiceType      String   @default("qwen-designed") // qwen-designed | custom
  customVoiceUrl String?  @db.Text // 上传的音频 URL（预览用）
  customVoiceMediaId String?
  customVoiceMedia MediaObject? @relation("GlobalVoiceCustomVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  voicePrompt    String?  @db.Text // AI 设计时的提示词
  gender         String? // male | female | neutral
  language       String   @default("zh")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder GlobalAssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([folderId])
  @@index([customVoiceMediaId])
  @@map("global_voices")
}

model MediaObject {
  id         String   @id @default(uuid())
  publicId   String   @unique
  storageKey String   @unique @db.VarChar(512)
  sha256     String?
  mimeType   String?
  sizeBytes  BigInt?
  width      Int?
  height     Int?
  durationMs Int?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @default(now()) @updatedAt

  characterAppearanceImages             CharacterAppearance[]       @relation("CharacterAppearanceImageMedia")
  locationImages                        LocationImage[]             @relation("LocationImageMedia")
  novelPromotionCharacterVoices         NovelPromotionCharacter[]   @relation("NovelPromotionCharacterVoiceMedia")
  novelPromotionEpisodeAudios           NovelPromotionEpisode[]     @relation("NovelPromotionEpisodeAudioMedia")
  novelPromotionPanelImages             NovelPromotionPanel[]       @relation("NovelPromotionPanelImageMedia")
  novelPromotionPanelVideos             NovelPromotionPanel[]       @relation("NovelPromotionPanelVideoMedia")
  novelPromotionPanelLipSyncVideos      NovelPromotionPanel[]       @relation("NovelPromotionPanelLipSyncVideoMedia")
  novelPromotionPanelSketchImages       NovelPromotionPanel[]       @relation("NovelPromotionPanelSketchMedia")
  novelPromotionPanelPreviousImages     NovelPromotionPanel[]       @relation("NovelPromotionPanelPreviousImageMedia")
  novelPromotionShotImages              NovelPromotionShot[]        @relation("NovelPromotionShotImageMedia")
  supplementaryPanelImages              SupplementaryPanel[]        @relation("SupplementaryPanelImageMedia")
  novelPromotionVoiceLineAudios         NovelPromotionVoiceLine[]   @relation("NovelPromotionVoiceLineAudioMedia")
  voicePresetAudios                     VoicePreset[]               @relation("VoicePresetAudioMedia")
  globalCharacterVoices                 GlobalCharacter[]           @relation("GlobalCharacterVoiceMedia")
  globalCharacterAppearanceImages       GlobalCharacterAppearance[] @relation("GlobalCharacterAppearanceImageMedia")
  globalCharacterAppearancePreviousImgs GlobalCharacterAppearance[] @relation("GlobalCharacterAppearancePreviousImageMedia")
  globalLocationImageImages             GlobalLocationImage[]       @relation("GlobalLocationImageMedia")
  globalLocationImagePreviousImages     GlobalLocationImage[]       @relation("GlobalLocationImagePreviousImageMedia")
  globalVoiceCustomVoices               GlobalVoice[]               @relation("GlobalVoiceCustomVoiceMedia")

  @@index([createdAt])
  @@map("media_objects")
}

model LegacyMediaRefBackup {
  id          String   @id @default(uuid())
  runId       String
  tableName   String
  rowId       String
  fieldName   String
  legacyValue String   @db.Text
  checksum    String
  createdAt   DateTime @default(now())

  @@index([runId])
  @@index([tableName, fieldName])
  @@map("legacy_media_refs_backup")
}
===
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Account {
  id                String  @id @default(uuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("account")
}

model CharacterAppearance {
  id                   String                  @id @default(uuid())
  characterId          String
  appearanceIndex      Int
  changeReason         String
  description          String?                 @db.Text
  descriptions         String?                 @db.Text
  imageUrl             String?                 @db.Text
  imageUrls            String?                 @db.Text
  selectedIndex        Int?
  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @default(now()) @updatedAt
  previousImageUrl     String?                 @db.Text
  previousImageUrls    String?                 @db.Text
  previousDescription  String?                 @db.Text // 上一次的描述词（用于撤回）
  previousDescriptions String?                 @db.Text // 上一次的描述词数组（用于撤回）
  imageMediaId         String?
  imageMedia           MediaObject?            @relation("CharacterAppearanceImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  character            NovelPromotionCharacter @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([characterId, appearanceIndex])
  @@index([characterId])
  @@index([imageMediaId])
  @@map("character_appearances")
}

model LocationImage {
  id                  String                   @id @default(uuid())
  locationId          String
  imageIndex          Int
  description         String?                  @db.Text
  availableSlots      String?                  @db.Text
  imageUrl            String?                  @db.Text
  isSelected          Boolean                  @default(false)
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @default(now()) @updatedAt
  previousImageUrl    String?                  @db.Text
  previousDescription String?                  @db.Text // 上一次的描述词（用于撤回）
  imageMediaId        String?
  imageMedia          MediaObject?             @relation("LocationImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  location            NovelPromotionLocation   @relation("LocationImages", fields: [locationId], references: [id], onDelete: Cascade)
  selectedByLocations NovelPromotionLocation[] @relation("SelectedLocationImage")

  @@unique([locationId, imageIndex])
  @@index([locationId])
  @@index([imageMediaId])
  @@map("location_images")
}

model NovelPromotionCharacter {
  id                      String                @id @default(uuid())
  novelPromotionProjectId String
  name                    String
  aliases                 String?               @db.Text
  createdAt               DateTime              @default(now())
  updatedAt               DateTime              @default(now()) @updatedAt
  customVoiceUrl          String?               @db.Text
  customVoiceMediaId      String?
  customVoiceMedia        MediaObject?          @relation("NovelPromotionCharacterVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  voiceId                 String?
  voiceType               String?
  profileData             String?               @db.Text
  profileConfirmed        Boolean               @default(false)
  introduction            String?               @db.Text // 角色介绍（身份、关系、称呼映射，如"我"对应此角色）
  sourceGlobalCharacterId String? // 🆕 来源全局角色ID（复制时记录）
  appearances             CharacterAppearance[]
  novelPromotionProject   NovelPromotionProject @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)

  @@index([novelPromotionProjectId])
  @@index([customVoiceMediaId])
  @@map("novel_promotion_characters")
}

model NovelPromotionLocation {
  id                      String                @id @default(uuid())
  novelPromotionProjectId String
  name                    String
  summary                 String?               @db.Text // 场景简要描述（用途/人物关联）
  assetKind               String                @default("location")
  createdAt               DateTime              @default(now())
  updatedAt               DateTime              @default(now()) @updatedAt
  sourceGlobalLocationId  String? // 🆕 来源全局场景ID（复制时记录）
  selectedImageId         String?
  selectedImage           LocationImage?        @relation("SelectedLocationImage", fields: [selectedImageId], references: [id], onDelete: SetNull)
  images                  LocationImage[]       @relation("LocationImages")
  novelPromotionProject   NovelPromotionProject @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)

  @@index([novelPromotionProjectId])
  @@map("novel_promotion_locations")
}

model NovelPromotionEpisode {
  id                      String                     @id @default(uuid())
  novelPromotionProjectId String
  episodeNumber           Int
  name                    String
  description             String?                    @db.Text
  novelText               String?                    @db.Text
  audioUrl                String?                    @db.Text
  audioMediaId            String?
  audioMedia              MediaObject?               @relation("NovelPromotionEpisodeAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  srtContent              String?                    @db.Text
  createdAt               DateTime                   @default(now())
  updatedAt               DateTime                   @default(now()) @updatedAt
  speakerVoices           String?                    @db.Text
  narratorEnabled         Boolean                    @default(true)
  clips                   NovelPromotionClip[]
  novelPromotionProject   NovelPromotionProject      @relation(fields: [novelPromotionProjectId], references: [id], onDelete: Cascade)
  shots                   NovelPromotionShot[]
  storyboards             NovelPromotionStoryboard[]
  voiceLines              NovelPromotionVoiceLine[]
  editorProject           VideoEditorProject?

  @@unique([novelPromotionProjectId, episodeNumber])
  @@index([novelPromotionProjectId])
  @@index([audioMediaId])
  @@map("novel_promotion_episodes")
}

// 视频编辑器项目 - 存储剪辑数据
model VideoEditorProject {
  id           String                @id @default(uuid())
  episodeId    String                @unique
  projectData  String                @db.Text // JSON 存储编辑项目数据
  renderStatus String? // pending | rendering | completed | failed
  renderTaskId String?
  outputUrl    String?               @db.Text
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @default(now()) @updatedAt
  episode      NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@map("video_editor_projects")
}

model NovelPromotionClip {
  id         String                    @id @default(uuid())
  episodeId  String
  start      Int?
  end        Int?
  duration   Int?
  summary    String                    @db.Text
  location   String?                   @db.Text
  content    String                    @db.Text
  createdAt  DateTime                  @default(now())
  updatedAt  DateTime                  @default(now()) @updatedAt
  characters String?                   @db.Text
  props      String?                   @db.Text
  endText    String?                   @db.Text
  shotCount  Int?
  startText  String?                   @db.Text
  screenplay String?                   @db.Text
  episode    NovelPromotionEpisode     @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  shots      NovelPromotionShot[]
  storyboard NovelPromotionStoryboard?

  @@index([episodeId])
  @@map("novel_promotion_clips")
}

model NovelPromotionPanel {
  id                String                    @id @default(uuid())
  storyboardId      String
  panelIndex        Int
  panelNumber       Int?
  shotType          String?                   @db.Text
  cameraMove        String?                   @db.Text
  description       String?                   @db.Text
  location          String?                   @db.Text
  characters        String?                   @db.Text
  props             String?                   @db.Text
  srtSegment        String?                   @db.Text
  srtStart          Float?
  srtEnd            Float?
  duration          Float?
  imagePrompt       String?                   @db.Text
  imageUrl          String?                   @db.Text
  imageMediaId      String?
  imageMedia        MediaObject?              @relation("NovelPromotionPanelImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  imageHistory      String?                   @db.Text
  videoPrompt       String?                   @db.Text
  firstLastFramePrompt String?                @db.Text
  videoUrl          String?                   @db.Text
  videoGenerationMode String?                 @db.Text // 视频生成方式：normal | firstlastframe
  videoMediaId      String?
  videoMedia        MediaObject?              @relation("NovelPromotionPanelVideoMedia", fields: [videoMediaId], references: [id], onDelete: SetNull)
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @default(now()) @updatedAt
  sceneType         String?
  candidateImages   String?                   @db.Text
  linkedToNextPanel Boolean                   @default(false)
  lipSyncTaskId     String?
  lipSyncVideoUrl   String?
  lipSyncVideoMediaId String?
  lipSyncVideoMedia MediaObject?              @relation("NovelPromotionPanelLipSyncVideoMedia", fields: [lipSyncVideoMediaId], references: [id], onDelete: SetNull)
  sketchImageUrl    String?                   @db.Text
  sketchImageMediaId String?
  sketchImageMedia  MediaObject?              @relation("NovelPromotionPanelSketchMedia", fields: [sketchImageMediaId], references: [id], onDelete: SetNull)
  photographyRules  String?                   @db.Text
  actingNotes       String?                   @db.Text // 演技指导数据 JSON
  previousImageUrl  String?                   @db.Text
  previousImageMediaId String?
  previousImageMedia MediaObject?             @relation("NovelPromotionPanelPreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  storyboard        NovelPromotionStoryboard  @relation(fields: [storyboardId], references: [id], onDelete: Cascade)
  matchedVoiceLines NovelPromotionVoiceLine[]

  @@unique([storyboardId, panelIndex])
  @@index([storyboardId])
  @@index([imageMediaId])
  @@index([videoMediaId])
  @@index([lipSyncVideoMediaId])
  @@index([sketchImageMediaId])
  @@index([previousImageMediaId])
  @@map("novel_promotion_panels")
}

model NovelPromotionProject {
  id              String                    @id @default(uuid())
  projectId       String                    @unique
  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @default(now()) @updatedAt
  analysisModel   String? // 用户配置的分析模型（nullable，必须配置后才能使用）
  imageModel      String? // 用户配置的图片模型
  videoModel      String? // 用户配置的视频模型
  audioModel      String? // 用户配置的语音模型
  videoRatio      String                    @default("9:16")
  ttsRate         String                    @default("+50%")
  globalAssetText String?                   @db.Text
  artStyle        String                    @default("american-comic")
  artStylePrompt  String?                   @db.Text
  characterModel  String? // 用户配置的角色图片模型
  locationModel   String? // 用户配置的场景图片模型
  storyboardModel String? // 用户配置的分镜图片模型
  editModel       String? // 用户配置的修图/编辑模型
  videoResolution String                    @default("720p")
  capabilityOverrides String?              @db.Text
  workflowMode    String                    @default("srt")
  lastEpisodeId   String?
  imageResolution String                    @default("2K")
  importStatus    String?
  characters      NovelPromotionCharacter[]
  episodes        NovelPromotionEpisode[]
  locations       NovelPromotionLocation[]
  project         Project                   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("novel_promotion_projects")
}

model NovelPromotionShot {
  id              String                @id @default(uuid())
  episodeId       String
  clipId          String?
  shotId          String
  srtStart        Int
  srtEnd          Int
  srtDuration     Float
  sequence        String?               @db.Text
  locations       String?               @db.Text
  characters      String?               @db.Text
  plot            String?               @db.Text
  imagePrompt     String?               @db.Text
  scale           String?               @db.Text
  module          String?               @db.Text
  focus           String?               @db.Text
  zhSummarize     String?               @db.Text
  imageUrl        String?               @db.Text
  imageMediaId    String?
  imageMedia      MediaObject?          @relation("NovelPromotionShotImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @default(now()) @updatedAt
  pov             String?               @db.Text
  clip            NovelPromotionClip?   @relation(fields: [clipId], references: [id], onDelete: Cascade)
  episode         NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@index([clipId])
  @@index([episodeId])
  @@index([shotId])
  @@index([imageMediaId])
  @@map("novel_promotion_shots")
}

model NovelPromotionStoryboard {
  id                  String                @id @default(uuid())
  episodeId           String
  clipId              String                @unique
  storyboardImageUrl  String?               @db.Text
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @default(now()) @updatedAt
  panelCount          Int                   @default(9)
  storyboardTextJson  String?               @db.Text
  imageHistory        String?               @db.Text
  candidateImages     String?               @db.Text
  lastError           String?
  photographyPlan     String?               @db.Text
  panels              NovelPromotionPanel[]
  clip                NovelPromotionClip    @relation(fields: [clipId], references: [id], onDelete: Cascade)
  episode             NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  supplementaryPanels SupplementaryPanel[]

  @@index([clipId])
  @@index([episodeId])
  @@map("novel_promotion_storyboards")
}

model SupplementaryPanel {
  id            String                   @id @default(uuid())
  storyboardId  String
  sourceType    String
  sourcePanelId String?
  description   String?                  @db.Text
  imagePrompt   String?                  @db.Text
  imageUrl      String?                  @db.Text
  imageMediaId  String?
  imageMedia    MediaObject?             @relation("SupplementaryPanelImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  characters    String?                  @db.Text
  location      String?                  @db.Text
  createdAt     DateTime                 @default(now())
  updatedAt     DateTime                 @default(now()) @updatedAt
  storyboard    NovelPromotionStoryboard @relation(fields: [storyboardId], references: [id], onDelete: Cascade)

  @@index([storyboardId])
  @@index([imageMediaId])
  @@map("supplementary_panels")
}

model Project {
  id                 String                 @id @default(uuid())
  name               String
  description        String?                @db.Text
  userId             String
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @default(now()) @updatedAt
  lastAccessedAt     DateTime?
  novelPromotionData NovelPromotionProject?
  user               User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageCosts         UsageCost[]

  @@index([userId])
  @@map("projects")
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique(map: "Session_sessionToken_key")
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

model UsageCost {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  apiType   String
  model     String
  action    String
  quantity  Int
  unit      String
  cost      Decimal  @db.Decimal(18, 6)
  metadata  String?  @db.Text
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([apiType])
  @@index([createdAt])
  @@index([projectId])
  @@index([userId])
  @@map("usage_costs")
}

model User {
  id            String          @id @default(uuid())
  name          String          @unique(map: "User_name_key")
  email         String?
  emailVerified DateTime?
  image         String?
  password      String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @default(now()) @updatedAt
  accounts      Account[]
  projects      Project[]
  sessions      Session[]
  usageCosts    UsageCost[]
  balance       UserBalance?
  preferences   UserPreference?

  // 资产中心
  globalAssetFolders GlobalAssetFolder[]
  globalCharacters   GlobalCharacter[]
  globalLocations    GlobalLocation[]
  globalVoices       GlobalVoice[]
  tasks              Task[]
  taskEvents         TaskEvent[]
  graphRuns          GraphRun[]
  graphEvents        GraphEvent[]

  @@map("user")
}

model UserPreference {
  id              String   @id @default(uuid())
  userId          String   @unique
  analysisModel   String? // 用户配置的分析模型（nullable，必须配置后才能使用）
  characterModel  String? // 用户配置的角色图片模型
  locationModel   String? // 用户配置的场景图片模型
  storyboardModel String? // 用户配置的分镜图片模型
  editModel       String? // 用户配置的修图模型
  videoModel      String? // 用户配置的视频模型
  audioModel      String? // 用户配置的语音模型
  lipSyncModel    String? // 用户配置的口型同步模型
  voiceDesignModel String? // 用户配置的音色设计模型
  analysisConcurrency Int? // 分析流程并发上限
  imageConcurrency Int? // 图像流程并发上限
  videoConcurrency Int? // 视频流程并发上限
  videoRatio      String   @default("9:16")
  videoResolution String   @default("720p")
  artStyle        String   @default("american-comic")
  ttsRate         String   @default("+50%")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @default(now()) @updatedAt
  imageResolution String   @default("2K")
  capabilityDefaults String? @db.Text

  // API Key 配置（极简版）
  llmBaseUrl  String? @default("https://openrouter.ai/api/v1")
  llmApiKey   String? @db.Text // 加密存储
  falApiKey   String? @db.Text // FAL（图片+视频+语音）
  googleAiKey String? @db.Text // Google AI（Gemini 图片）
  arkApiKey   String? @db.Text // 火山引擎（Seedream+Seedance）
  qwenApiKey  String? @db.Text // 阿里百炼（声音设计）

  // 自定义模型列表 + 价格（JSON）
  customModels String? @db.Text

  // 自定义 OpenAI 兼容提供商列表（JSON，包含加密的 API Key）
  customProviders String? @db.Text

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_preferences")
}

model VerificationToken {
  identifier String
  token      String   @unique(map: "VerificationToken_token_key")
  expires    DateTime

  @@unique([identifier, token])
  @@map("verificationtoken")
}

model NovelPromotionVoiceLine {
  id                  String                @id @default(uuid())
  episodeId           String
  lineIndex           Int
  speaker             String
  content             String                @db.Text
  isNarration         Boolean               @default(false)
  voicePresetId       String?
  audioUrl            String?               @db.Text
  audioMediaId        String?
  audioMedia          MediaObject?          @relation("NovelPromotionVoiceLineAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @default(now()) @updatedAt
  emotionPrompt       String?               @db.Text
  emotionStrength     Float?                @default(0.4)
  matchedPanelIndex   Int?
  matchedStoryboardId String?
  audioDuration       Int?
  matchedPanelId      String?
  episode             NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  matchedPanel        NovelPromotionPanel?  @relation(fields: [matchedPanelId], references: [id])

  @@unique([episodeId, lineIndex])
  @@index([episodeId])
  @@index([matchedPanelId])
  @@index([audioMediaId])
  @@map("novel_promotion_voice_lines")
}

model VoicePreset {
  id          String   @id @default(uuid())
  name        String
  audioUrl    String   @db.Text
  audioMediaId String?
  audioMedia  MediaObject? @relation("VoicePresetAudioMedia", fields: [audioMediaId], references: [id], onDelete: SetNull)
  description String?  @db.Text
  gender      String?
  isSystem    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([audioMediaId])
  @@map("voice_presets")
}

model UserBalance {
  id           String   @id @default(uuid())
  userId       String   @unique
  balance      Decimal  @default(0) @db.Decimal(18, 6)
  frozenAmount Decimal  @default(0) @db.Decimal(18, 6)
  totalSpent   Decimal  @default(0) @db.Decimal(18, 6)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_balances")
}

model BalanceFreeze {
  id        String   @id @default(uuid())
  userId    String
  amount    Decimal  @db.Decimal(18, 6)
  status    String   @default("pending")
  source    String?  @db.VarChar(64)
  taskId    String?
  requestId String?
  idempotencyKey String? @unique
  metadata  String?  @db.Text
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  @@index([userId])
  @@index([status])
  @@index([taskId])
  @@map("balance_freezes")
}

model BalanceTransaction {
  id           String   @id @default(uuid())
  userId       String
  type         String
  amount       Decimal  @db.Decimal(18, 6)
  balanceAfter Decimal  @db.Decimal(18, 6)
  description  String?  @db.Text
  relatedId    String?
  freezeId     String?
  operatorId   String?  @db.VarChar(64)
  externalOrderId String? @db.VarChar(128)
  idempotencyKey String? @db.VarChar(128)
  projectId    String?  @db.VarChar(128) // 关联项目 ID，用于流水展示项目名
  episodeId    String?  @db.VarChar(128) // 关联集数 ID，用于流水展示集数
  taskType     String?  @db.VarChar(64)  // 任务类型 key（与 action 一致），用于前端 i18n
  billingMeta  String?  @db.Text         // 计费详情 JSON: { quantity, unit, model, resolution, duration, tokens... }
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([type])
  @@index([createdAt])
  @@index([freezeId])
  @@index([externalOrderId])
  @@index([projectId])
  @@unique([userId, type, idempotencyKey])
  @@map("balance_transactions")
}

model Task {
  id               String    @id @default(uuid())
  userId           String
  projectId        String
  episodeId        String?
  type             String
  targetType       String
  targetId         String
  status           String    @default("queued")
  progress         Int       @default(0)
  attempt          Int       @default(0)
  maxAttempts      Int       @default(5)
  priority         Int       @default(0)
  dedupeKey        String?   @unique
  externalId       String?
  payload          Json?
  result           Json?
  errorCode        String?
  errorMessage     String?   @db.Text
  billingInfo      Json?
  billedAt         DateTime?
  queuedAt         DateTime  @default(now())
  startedAt        DateTime?
  finishedAt       DateTime?
  heartbeatAt      DateTime?
  enqueuedAt       DateTime?
  enqueueAttempts  Int       @default(0)
  lastEnqueueError String?   @db.Text
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user   User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  events TaskEvent[]

  @@index([status])
  @@index([type])
  @@index([targetType, targetId])
  @@index([projectId])
  @@index([userId])
  @@index([heartbeatAt])
  @@map("tasks")
}

model TaskEvent {
  id        Int      @id @default(autoincrement())
  taskId    String
  projectId String
  userId    String
  eventType String
  payload   Json?
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([projectId, id])
  @@index([taskId])
  @@index([userId])
  @@map("task_events")
}

model GraphRun {
  id                String             @id @default(uuid())
  userId            String
  projectId         String
  episodeId         String?
  workflowType      String
  taskType          String?
  taskId            String?            @unique
  targetType        String
  targetId          String
  status            String             @default("queued")
  input             Json?
  output            Json?
  errorCode         String?
  errorMessage      String?            @db.Text
  cancelRequestedAt DateTime?
  leaseOwner        String?
  leaseExpiresAt    DateTime?
  heartbeatAt       DateTime?
  workflowVersion   Int                @default(1)
  queuedAt          DateTime           @default(now())
  startedAt         DateTime?
  finishedAt        DateTime?
  lastSeq           Int                @default(0)
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  steps             GraphStep[]
  attempts          GraphStepAttempt[]
  events            GraphEvent[]
  checkpoints       GraphCheckpoint[]
  artifacts         GraphArtifact[]

  @@index([projectId, status])
  @@index([userId, createdAt])
  @@index([taskId])
  @@index([targetType, targetId])
  @@index([workflowType, targetType, targetId, status])
  @@index([leaseExpiresAt])
  @@map("graph_runs")
}

model GraphStep {
  id               String             @id @default(uuid())
  runId            String
  stepKey          String
  stepTitle        String
  status           String             @default("pending")
  currentAttempt   Int                @default(0)
  stepIndex        Int
  stepTotal        Int
  startedAt        DateTime?
  finishedAt       DateTime?
  lastErrorCode    String?
  lastErrorMessage String?            @db.Text
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  run              GraphRun           @relation(fields: [runId], references: [id], onDelete: Cascade)
  attempts         GraphStepAttempt[]

  @@unique([runId, stepKey])
  @@index([runId, status])
  @@index([runId, stepIndex])
  @@map("graph_steps")
}

model GraphStepAttempt {
  id              String     @id @default(uuid())
  runId           String
  stepKey         String
  attempt         Int
  status          String     @default("pending")
  provider        String?
  modelKey        String?
  inputHash       String?
  input           Json?
  outputText      String?    @db.Text
  outputReasoning String?    @db.Text
  usageJson       Json?
  errorCode       String?
  errorMessage    String?    @db.Text
  startedAt       DateTime?
  finishedAt      DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  run             GraphRun   @relation(fields: [runId], references: [id], onDelete: Cascade)
  step            GraphStep  @relation(fields: [runId, stepKey], references: [runId, stepKey], onDelete: Cascade)

  @@unique([runId, stepKey, attempt])
  @@index([runId, stepKey])
  @@index([runId, createdAt])
  @@map("graph_step_attempts")
}

model GraphEvent {
  id        BigInt   @id @default(autoincrement())
  runId     String
  projectId String
  userId    String
  seq       Int
  eventType String
  stepKey   String?
  attempt   Int?
  lane      String?
  payload   Json?
  createdAt DateTime @default(now())
  run       GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([runId, seq])
  @@index([projectId, id])
  @@index([runId, id])
  @@index([userId, id])
  @@map("graph_events")
}

model GraphCheckpoint {
  id         String   @id @default(uuid())
  runId      String
  nodeKey    String
  version    Int
  stateJson  Json
  stateBytes Int
  createdAt  DateTime @default(now())
  run        GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, nodeKey, version])
  @@index([runId, createdAt])
  @@map("graph_checkpoints")
}

model GraphArtifact {
  id          String   @id @default(uuid())
  runId       String
  stepKey     String?
  artifactType String
  refId       String
  versionHash String?
  payload     Json?
  createdAt   DateTime @default(now())
  run         GraphRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, stepKey, artifactType, refId])
  @@index([runId])
  @@index([runId, stepKey])
  @@index([artifactType, refId])
  @@map("graph_artifacts")
}

// ==================== 资产中心 ====================

// 资产文件夹（一层，不支持嵌套）
model GlobalAssetFolder {
  id        String   @id @default(uuid())
  userId    String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  characters GlobalCharacter[]
  locations  GlobalLocation[]
  voices     GlobalVoice[]

  @@index([userId])
  @@map("global_asset_folders")
}

// 全局角色（结构与 NovelPromotionCharacter 一致）
model GlobalCharacter {
  id               String   @id @default(uuid())
  userId           String
  folderId         String?
  name             String
  aliases          String?  @db.Text
  profileData      String?  @db.Text
  profileConfirmed Boolean  @default(false)
  voiceId          String?
  voiceType        String?
  customVoiceUrl   String?  @db.Text
  customVoiceMediaId String?
  customVoiceMedia MediaObject? @relation("GlobalCharacterVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  globalVoiceId    String? // 绑定的全局音色 ID
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user        User                        @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder      GlobalAssetFolder?          @relation(fields: [folderId], references: [id], onDelete: SetNull)
  appearances GlobalCharacterAppearance[]

  @@index([userId])
  @@index([folderId])
  @@index([customVoiceMediaId])
  @@map("global_characters")
}

// 全局角色形象（结构与 CharacterAppearance 一致）
model GlobalCharacterAppearance {
  id                   String   @id @default(uuid())
  characterId          String
  appearanceIndex      Int
  changeReason         String   @default("default")
  artStyle             String?
  description          String?  @db.Text
  descriptions         String?  @db.Text
  imageUrl             String?  @db.Text
  imageMediaId         String?
  imageMedia           MediaObject? @relation("GlobalCharacterAppearanceImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  imageUrls            String?  @db.Text
  selectedIndex        Int?
  previousImageUrl     String?  @db.Text
  previousImageMediaId String?
  previousImageMedia   MediaObject? @relation("GlobalCharacterAppearancePreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  previousImageUrls    String?  @db.Text
  previousDescription  String?  @db.Text // 上一次的描述词（用于撤回）
  previousDescriptions String?  @db.Text // 上一次的描述词数组（用于撤回）
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  character GlobalCharacter @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([characterId, appearanceIndex])
  @@index([characterId])
  @@index([imageMediaId])
  @@index([previousImageMediaId])
  @@map("global_character_appearances")
}

// 全局场景（结构与 NovelPromotionLocation 一致）
model GlobalLocation {
  id        String   @id @default(uuid())
  userId    String
  folderId  String?
  name      String
  artStyle  String?
  summary   String?  @db.Text
  assetKind String   @default("location")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder GlobalAssetFolder?    @relation(fields: [folderId], references: [id], onDelete: SetNull)
  images GlobalLocationImage[]

  @@index([userId])
  @@index([folderId])
  @@map("global_locations")
}

// 全局场景图片（结构与 LocationImage 一致）
model GlobalLocationImage {
  id                  String   @id @default(uuid())
  locationId          String
  imageIndex          Int
  description         String?  @db.Text
  availableSlots      String?  @db.Text
  imageUrl            String?  @db.Text
  imageMediaId        String?
  imageMedia          MediaObject? @relation("GlobalLocationImageMedia", fields: [imageMediaId], references: [id], onDelete: SetNull)
  isSelected          Boolean  @default(false)
  previousImageUrl    String?  @db.Text
  previousImageMediaId String?
  previousImageMedia  MediaObject? @relation("GlobalLocationImagePreviousImageMedia", fields: [previousImageMediaId], references: [id], onDelete: SetNull)
  previousDescription String?  @db.Text // 上一次的描述词（用于撤回）
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  location GlobalLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([locationId, imageIndex])
  @@index([locationId])
  @@index([imageMediaId])
  @@index([previousImageMediaId])
  @@map("global_location_images")
}

// 全局音色库
model GlobalVoice {
  id             String   @id @default(uuid())
  userId         String
  folderId       String?
  name           String // 音色名称
  description    String?  @db.Text // 详细描述
  voiceId        String? // qwen-tts-vd 的 voice ID
  voiceType      String   @default("qwen-designed") // qwen-designed | custom
  customVoiceUrl String?  @db.Text // 上传的音频 URL（预览用）
  customVoiceMediaId String?
  customVoiceMedia MediaObject? @relation("GlobalVoiceCustomVoiceMedia", fields: [customVoiceMediaId], references: [id], onDelete: SetNull)
  voicePrompt    String?  @db.Text // AI 设计时的提示词
  gender         String? // male | female | neutral
  language       String   @default("zh")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder GlobalAssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([folderId])
  @@index([customVoiceMediaId])
  @@map("global_voices")
}

model MediaObject {
  id         String   @id @default(uuid())
  publicId   String   @unique
  storageKey String   @unique @db.VarChar(512)
  sha256     String?
  mimeType   String?
  sizeBytes  BigInt?
  width      Int?
  height     Int?
  durationMs Int?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @default(now()) @updatedAt

  characterAppearanceImages             CharacterAppearance[]       @relation("CharacterAppearanceImageMedia")
  locationImages                        LocationImage[]             @relation("LocationImageMedia")
  novelPromotionCharacterVoices         NovelPromotionCharacter[]   @relation("NovelPromotionCharacterVoiceMedia")
  novelPromotionEpisodeAudios           NovelPromotionEpisode[]     @relation("NovelPromotionEpisodeAudioMedia")
  novelPromotionPanelImages             NovelPromotionPanel[]       @relation("NovelPromotionPanelImageMedia")
  novelPromotionPanelVideos             NovelPromotionPanel[]       @relation("NovelPromotionPanelVideoMedia")
  novelPromotionPanelLipSyncVideos      NovelPromotionPanel[]       @relation("NovelPromotionPanelLipSyncVideoMedia")
  novelPromotionPanelSketchImages       NovelPromotionPanel[]       @relation("NovelPromotionPanelSketchMedia")
  novelPromotionPanelPreviousImages     NovelPromotionPanel[]       @relation("NovelPromotionPanelPreviousImageMedia")
  novelPromotionShotImages              NovelPromotionShot[]        @relation("NovelPromotionShotImageMedia")
  supplementaryPanelImages              SupplementaryPanel[]        @relation("SupplementaryPanelImageMedia")
  novelPromotionVoiceLineAudios         NovelPromotionVoiceLine[]   @relation("NovelPromotionVoiceLineAudioMedia")
  voicePresetAudios                     VoicePreset[]               @relation("VoicePresetAudioMedia")
  globalCharacterVoices                 GlobalCharacter[]           @relation("GlobalCharacterVoiceMedia")
  globalCharacterAppearanceImages       GlobalCharacterAppearance[] @relation("GlobalCharacterAppearanceImageMedia")
  globalCharacterAppearancePreviousImgs GlobalCharacterAppearance[] @relation("GlobalCharacterAppearancePreviousImageMedia")
  globalLocationImageImages             GlobalLocationImage[]       @relation("GlobalLocationImageMedia")
  globalLocationImagePreviousImages     GlobalLocationImage[]       @relation("GlobalLocationImagePreviousImageMedia")
  globalVoiceCustomVoices               GlobalVoice[]               @relation("GlobalVoiceCustomVoiceMedia")

  @@index([createdAt])
  @@map("media_objects")
}

model LegacyMediaRefBackup {
  id          String   @id @default(uuid())
  runId       String
  tableName   String
  rowId       String
  fieldName   String
  legacyValue String   @db.Text
  checksum    String
  createdAt   DateTime @default(now())

  @@index([runId])
  @@index([tableName, fieldName])
  @@map("legacy_media_refs_backup")
}
```

**Schema:** Added `narratorEnabled Boolean @default(true)` to `NovelPromotionEpisode`

**API endpoint:** [narrator/route.ts](file:///q:/waoowaoo/src/app/api/novel-promotion/%5BprojectId%5D/episodes/%5BepisodeId%5D/narrator/route.ts) — `PUT` to toggle

**UI changes:**
- [VoiceToolbar.tsx](file:///q:/waoowaoo/src/app/%5Blocale%5D/workspace/%5BprojectId%5D/modes/novel-promotion/components/voice/VoiceToolbar.tsx) — Toggle switch added next to stats
- [VoiceControlPanel.tsx](file:///q:/waoowaoo/src/app/%5Blocale%5D/workspace/%5BprojectId%5D/modes/novel-promotion/components/voice-stage/VoiceControlPanel.tsx) — Props passed through
- [voice-stage-runtime-core.tsx](file:///q:/waoowaoo/src/lib/novel-promotion/stages/voice-stage-runtime-core.tsx) — State management with optimistic update + DB sync

**I18n:** Added `toolbar.narrator` key to both `en/voice.json` and `zh/voice.json`

**Type:** Added `narratorEnabled` to `Episode` interface in [useProjectData.ts](file:///q:/waoowaoo/src/lib/query/hooks/useProjectData.ts)

---

## ⚠️ Required Before Running

> [!IMPORTANT]
> You must run the Prisma migration to add the `narratorEnabled` column:
> ```bash
> npx prisma migrate dev --name add_narrator_enabled
> ```

## Deferred (As Noted in Plan)

| Item | Status |
|------|--------|
| Phase 5 (Editor: useEditorActions narration audio) | Partially done (FPS fix applied; narrator-aware clip audio matching deferred) |
| Phase 10 (Schema) | ✅ Done (narratorEnabled added) |
| Phase 11 (Tests) | Not yet — test files need updating after these changes |
| Video tab narrator indicator | Not yet — secondary indicator at VideoStageLayout |
| Concat lip-sync + narration split | Future — currently sums duration only |
| Voice analyze: filter narrator lines when OFF | Not yet — needs voice-analyze handler update |
