import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64, resolveComfyDimensions } from '@/lib/cos'
import { toFetchableUrl } from '@/lib/storage'
import videoNormalTemplate from './video_LTXV-normal.json'
import videoFlTemplate from './video_LTXV-firstlastframe.json'
import videoPromptRelayTemplate from './video_LTXV-normal-promptrelay.json'
import ltxDirectorTemplate from './LTX_Director.json'

const NORMAL_TEMPLATE = videoNormalTemplate as Record<string, unknown>
const FL_TEMPLATE = videoFlTemplate as Record<string, unknown>
const PROMPTRELAY_TEMPLATE = videoPromptRelayTemplate as Record<string, unknown>
const LTX_DIRECTOR_TEMPLATE = ltxDirectorTemplate as Record<string, unknown> & {
  [key: string]: { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }
}

export interface LTXDirectorSegment {
  imageUrl: string
  prompt: string
  durationSeconds: number
}

export interface LTXDirectorAudio {
  audioUrl: string
  startSeconds: number
  durationSeconds: number
}

export interface LTXDirectorParams {
  segments: LTXDirectorSegment[]
  audioSegments?: LTXDirectorAudio[]
  fps?: number
  globalPrompt?: string
}

export interface LTXDirectorResult {
  success: boolean
  videoUrl?: string       // raw ComfyUI output URL (not base64)
  error?: string
}

export class ComfyUIVideoGenerator extends BaseVideoGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params

    const { baseUrl } = await getProviderConfig(userId, this.providerId || 'comfyui')
    const endpoint = (baseUrl || 'http://localhost:8188').replace(/\/v1\/?$/, '')

    try {
      // Upload first frame image to ComfyUI
      let uploadedImageName: string | undefined
      if (imageUrl) {
        uploadedImageName = await this.uploadImageToComfyUI(endpoint, imageUrl)
      }

      // Upload last frame image to ComfyUI (optional, for first/last frame mode)
      let uploadedLastFrameName: string | undefined
      const lastFrameImageUrl = options.lastFrameImageUrl as string | undefined
      if (lastFrameImageUrl) {
        uploadedLastFrameName = await this.uploadImageToComfyUI(endpoint, lastFrameImageUrl)
      }

      // Choose workflow template: normal vs first/last frame vs promptrelay
      const useFlWorkflow = !!uploadedLastFrameName
      const usePromptRelay = !useFlWorkflow // hardcode promptrelay, fix model selection later
      const template = useFlWorkflow ? FL_TEMPLATE
        : usePromptRelay ? PROMPTRELAY_TEMPLATE
        : NORMAL_TEMPLATE
      const mode = useFlWorkflow ? 'firstlastframe' : usePromptRelay ? 'promptrelay' : 'normal'

      console.log(`[ComfyUI Video] using ${mode} workflow, firstFrame: ${uploadedImageName || 'none'}, lastFrame: ${uploadedLastFrameName || 'none'}`)

      const workflow = this.buildWorkflow(template, prompt, uploadedImageName, uploadedLastFrameName, options)

      const res = await fetch(`${endpoint}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow })
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.log(`[ComfyUI Video] submit failed: ${res.status} - ${errBody}`)
        throw new Error(`ComfyUI submit failed: ${res.status}`)
      }

      const { prompt_id } = await res.json()
      console.log(`[ComfyUI Video] submitted OK, prompt_id: ${prompt_id}`)
      const videoUrl = await this.pollForResult(endpoint, prompt_id)

      return { success: true, videoUrl }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ComfyUI error'
      }
    }
  }

  private async uploadImageToComfyUI(endpoint: string, imageUrl: string): Promise<string> {
    let buffer: Buffer
    if (imageUrl.startsWith('data:')) {
      const base64Start = imageUrl.indexOf(';base64,')
      if (base64Start === -1) throw new Error('Invalid data URL')
      buffer = Buffer.from(imageUrl.slice(base64Start + 8), 'base64')
    } else {
      const response = await fetch(imageUrl)
      buffer = Buffer.from(await response.arrayBuffer())
    }

    const boundary = `----ComfyUIUpload${Date.now()}`
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference.png"\r\nContent-Type: image/png\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)

    const body = Buffer.concat([header, buffer, footer])

    const uploadRes = await fetch(`${endpoint}/upload/image`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })

    if (!uploadRes.ok) {
      throw new Error(`ComfyUI image upload failed: ${uploadRes.status}`)
    }

    const result = await uploadRes.json() as { name?: string }
    if (!result.name) throw new Error('ComfyUI upload returned no filename')

    return result.name
  }

  private splitPromptRelay(fullPrompt: string): { global: string; local: string } {
    const shotIdx = fullPrompt.search(/^Shot\s+\d+/m)
    if (shotIdx === -1) return { global: fullPrompt, local: '' }
    return {
      global: fullPrompt.slice(0, shotIdx).trim(),
      local: fullPrompt.slice(shotIdx).trim(),
    }
  }

  private buildWorkflow(
    template: Record<string, unknown>,
    prompt: string,
    refImageName: string | undefined,
    refLastFrameName: string | undefined,
    options: Record<string, unknown>
  ) {
    const workflow = JSON.parse(JSON.stringify(template))

    const fps = 24
    const durationS = (options.duration as number) || 10
    const dims = resolveComfyDimensions(options)

    // duration_frame: seconds * fps → round up to nearest 8n+1
    const targetFrames = Math.ceil(durationS * fps)
    const durationFrames = Math.ceil((targetFrames - 1) / 8) * 8 + 1

    console.log(`[ComfyUI Video] buildWorkflow: duration=${durationS}s -> frames=${durationFrames}`)

    for (const nodeId in workflow) {
      const node = workflow[nodeId]
      const meta = node._meta
      if (!meta?.title) continue

      const isPromptRelay = true // hardcode promptrelay, fix model selection later

      switch (meta.title) {
        case '$prompt.value!':
          if (isPromptRelay) {
            node.inputs.value = this.splitPromptRelay(prompt).local || 'video generation'
          } else {
            node.inputs.value = prompt || 'video generation'
          }
          break
        case '$prompt_global.value!':
          node.inputs.value = this.splitPromptRelay(prompt).global || 'video generation'
          break
        case '$width.value':
          node.inputs.value = dims.width
          break
        case '$height.value':
          node.inputs.value = dims.height
          break
        case '$duration_frame.value':
          node.inputs.value = durationFrames
          break
        case '$fps.value':
          node.inputs.value = fps
          break
        case '$image.value!':
          if (refImageName) node.inputs.image = refImageName
          break
        case '$lastFrame.value!':
          if (refLastFrameName) node.inputs.image = refLastFrameName
          break
      }
    }

    return workflow
  }

  private async pollForResult(endpoint: string, promptId: string): Promise<string> {
    const maxAttempts = 600
    const interval = 1000
    const pollLogger = (msg: string) => console.log(`[ComfyUI Video] ${msg} (prompt: ${promptId})`)

    pollLogger(`waiting for result`)

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const historyRes = await fetch(`${endpoint}/history/${promptId}`)
        const history = await historyRes.json()
        const outputs = history[promptId]?.outputs

        if (outputs) {
          const nodeKeys = Object.keys(outputs)
          if (i === 0 || (i > 0 && i % 30 === 0)) {
            for (const nid of nodeKeys) {
              const node = outputs[nid]
              const keys = Object.keys(node)
              pollLogger(`output node[${nid}] has keys: ${keys.join(', ')}${node.videos ? ', videos.length=' + node.videos.length : ''}${node.images ? ', images.length=' + node.images.length : ''}`)
            }
          }
          for (const nodeId in outputs) {
            const node = outputs[nodeId]
            if (node?.videos?.length > 0) {
              const videoName = node.videos[0].filename
              pollLogger(`video ready: ${videoName}`)
              const videoUrl = `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
              return await imageUrlToBase64(videoUrl)
            }
            if (node?.video?.filename) {
              const videoName = node.video.filename
              pollLogger(`video (singular) ready: ${videoName}`)
              const videoUrl = `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
              return await imageUrlToBase64(videoUrl)
            }
            if (node?.gifs?.length > 0) {
              const videoName = node.gifs[0].filename
              pollLogger(`gif fallback ready: ${videoName}`)
              const videoUrl = `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
              return await imageUrlToBase64(videoUrl)
            }
            if (node?.images?.length > 0) {
              pollLogger(`found ${node.images.length} images in node[${nodeId}]`)
            }
          }
        }

        if (i > 0 && i % 60 === 0) {
          pollLogger(`still waiting (${i}s elapsed, outputs: ${outputs ? 'found' : 'none'})`)
        }
      } catch (e) {
        if (i > 0 && i % 60 === 0) {
          pollLogger(`poll error: ${(e as Error).message}`)
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('ComfyUI video generation timeout')
  }

  async generateWithLTXDirector(
    userId: string,
    params: LTXDirectorParams
  ): Promise<LTXDirectorResult> {
    const { baseUrl } = await getProviderConfig(userId, this.providerId || 'comfyui')
    const endpoint = (baseUrl || 'http://localhost:8188').replace(/\/v1\/?$/, '')

    try {
      const workflow = await this.buildLTXDirectorWorkflow(endpoint, params)
      const res = await fetch(`${endpoint}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow })
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.log(`[LTX Director] submit failed: ${res.status} - ${errBody}`)
        throw new Error(`ComfyUI submit failed: ${res.status}`)
      }

      const { prompt_id } = await res.json()
      console.log(`[LTX Director] submitted OK, prompt_id: ${prompt_id}`)
      const videoUrl = await this.pollForRawResult(endpoint, prompt_id)

      return { success: true, videoUrl }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ComfyUI error'
      }
    }
  }

  private async buildLTXDirectorWorkflow(
    endpoint: string,
    params: LTXDirectorParams
  ): Promise<Record<string, unknown>> {
    const workflow = JSON.parse(JSON.stringify(LTX_DIRECTOR_TEMPLATE))
    const fps = params.fps || 24

    const uploadedImageNames: string[] = []
    for (const seg of params.segments) {
      const name = await this.uploadFileToComfyUI(endpoint, seg.imageUrl, 'image', 'webp')
      uploadedImageNames.push(name)
    }

    const uploadedAudioNames: string[] = []
    if (params.audioSegments) {
      for (const aud of params.audioSegments) {
        const name = await this.uploadFileToComfyUI(endpoint, aud.audioUrl, 'audio', 'wav')
        uploadedAudioNames.push(name)
      }
    }

    const segments = params.segments.map((seg, i) => ({
      startFrame: 0,
      lengthFrame: Math.max(1, Math.round((seg.durationSeconds || 3) * fps)),
      prompt: seg.prompt,
      imageFile: uploadedImageNames[i] ?? '',
    }))

    let cursorFrame = 0
    for (const seg of segments) {
      seg.startFrame = cursorFrame
      cursorFrame += seg.lengthFrame
    }

    const totalFrames = cursorFrame
    const totalSeconds = totalFrames / fps

    const timelineSegments = segments.map((seg, i) => ({
      id: `seg_${String(i).padStart(3, '0')}`,
      start: seg.startFrame,
      length: seg.lengthFrame,
      prompt: seg.prompt,
      type: 'image' as const,
      imageFile: seg.imageFile,
    }))

    const audioSegments = params.audioSegments
      ? params.audioSegments.map((aud, i) => ({
          id: `audio_${String(i).padStart(3, '0')}`,
          type: 'audio' as const,
          start: Math.round(aud.startSeconds * fps),
          length: Math.round(aud.durationSeconds * fps),
          trimStart: 0,
          audioDurationFrames: Math.round(aud.durationSeconds * fps),
          audioFile: uploadedAudioNames[i] ?? '',
          fileName: uploadedAudioNames[i] ?? '',
          waveformPeaks: [] as number[],
        }))
      : []

    const timelineData = JSON.stringify({
      segments: timelineSegments,
      audioSegments,
    })

    const localPrompts = timelineSegments.map(s => s.prompt).join(' | ')
    const segmentLengths = timelineSegments.map(s => String(s.length)).join(',')
    const guideStrength = timelineSegments.map(() => '1.00').join(',')

    const node46 = workflow['46'] as { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }
    if (!node46 || node46.class_type !== 'LTXDirector') {
      throw new Error('LTX_Director.json does not contain LTXDirector node at key "46"')
    }

    node46.inputs.timeline_data = timelineData
    node46.inputs.local_prompts = localPrompts
    node46.inputs.segment_lengths = segmentLengths
    node46.inputs.guide_strength = guideStrength
    node46.inputs.duration_frames = totalFrames
    node46.inputs.duration_seconds = parseFloat(totalSeconds.toFixed(3))
    node46.inputs.frame_rate = fps
    node46.inputs.use_custom_audio = audioSegments.length > 0
    node46.inputs.global_prompt = params.globalPrompt || ''
    node46.inputs.epsilon = 0.001
    node46.inputs.display_mode = 'seconds'
    node46.inputs.custom_width = 0
    node46.inputs.custom_height = 0
    node46.inputs.resize_method = 'maintain aspect ratio'
    node46.inputs.divisible_by = 32
    node46.inputs.img_compression = 18

    console.log(`[LTX Director] built workflow: ${timelineSegments.length} segments, ${audioSegments.length} audio, ${totalFrames} frames (${totalSeconds.toFixed(2)}s)`)
    return workflow
  }

  private async uploadFileToComfyUI(
    endpoint: string,
    url: string,
    type: 'image' | 'audio',
    defaultExt: string
  ): Promise<string> {
    let buffer: Buffer
    let filename: string

    if (url.startsWith('data:')) {
      const mimeEnd = url.indexOf(';')
      const base64Start = url.indexOf(';base64,')
      if (base64Start === -1) throw new Error('Invalid data URL')

      const mime = url.slice(5, mimeEnd)
      const ext = mime.split('/')[1] || defaultExt
      buffer = Buffer.from(url.slice(base64Start + 8), 'base64')
      filename = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    } else {
      const fetchableUrl = toFetchableUrl(url)
      const response = await fetch(fetchableUrl)
      buffer = Buffer.from(await response.arrayBuffer())

      const urlObj = new URL(fetchableUrl)
      const pathName = urlObj.pathname
      const ext = pathName.split('.').pop() || defaultExt
      filename = pathName.split('/').pop() || `download_${Date.now()}.${ext}`
    }

    const boundary = `----ComfyUIUpload${Date.now()}`
    const contentType = type === 'image' ? 'image/webp' : 'audio/wav'
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, buffer, footer])

    const uploadRes = await fetch(`${endpoint}/upload/image`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })

    if (!uploadRes.ok) {
      throw new Error(`ComfyUI file upload failed: ${uploadRes.status}`)
    }

    const result = await uploadRes.json() as { name?: string }
    if (!result.name) throw new Error('ComfyUI upload returned no filename')
    return result.name
  }

  private async pollForRawResult(endpoint: string, promptId: string): Promise<string> {
    const maxAttempts = 600
    const interval = 1000
    const pollLogger = (msg: string) => console.log(`[LTX Director] ${msg} (prompt: ${promptId})`)

    pollLogger(`waiting for result`)

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const historyRes = await fetch(`${endpoint}/history/${promptId}`)
        const history = await historyRes.json()
        const outputs = history[promptId]?.outputs

        if (outputs) {
          for (const nodeId in outputs) {
            const node = outputs[nodeId]
            if (node?.videos?.length > 0) {
              const videoName = node.videos[0].filename
              pollLogger(`video ready: ${videoName}`)
              return `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
            }
            if (node?.video?.filename) {
              const videoName = node.video.filename
              pollLogger(`video (singular) ready: ${videoName}`)
              return `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
            }
            if (node?.gifs?.length > 0) {
              const videoName = node.gifs[0].filename
              pollLogger(`gif fallback ready: ${videoName}`)
              return `${endpoint}/view?filename=${encodeURIComponent(videoName)}&type=output`
            }
          }
        }

        if (i > 0 && i % 60 === 0) {
          pollLogger(`still waiting (${i}s elapsed)`)
        }
      } catch (e) {
        if (i > 0 && i % 60 === 0) {
          pollLogger(`poll error: ${(e as Error).message}`)
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('ComfyUI video generation timeout')
  }
}
