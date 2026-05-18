import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64, resolveComfyDimensions } from '@/lib/cos'
import videoNormalTemplate from './video_LTXV-normal.json'
import videoFlTemplate from './video_LTXV-firstlastframe.json'

const NORMAL_TEMPLATE = videoNormalTemplate as Record<string, unknown>
const FL_TEMPLATE = videoFlTemplate as Record<string, unknown>

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

      // Choose workflow template: normal vs first/last frame
      const useFlWorkflow = !!uploadedLastFrameName
      const template = useFlWorkflow ? FL_TEMPLATE : NORMAL_TEMPLATE
      const mode = useFlWorkflow ? 'firstlastframe' : 'normal'

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

    // duration_frame: seconds * 24 → round up to nearest 8n+1
    const targetFrames = Math.ceil(durationS * 24)
    const durationFrames = Math.ceil((targetFrames - 1) / 8) * 8 + 1

    console.log(`[ComfyUI Video] buildWorkflow: duration=${durationS}s -> frames=${durationFrames}`)

    for (const nodeId in workflow) {
      const node = workflow[nodeId]
      const meta = node._meta
      if (!meta?.title) continue

      switch (meta.title) {
        case '$prompt.value!':
          node.inputs.value = prompt || 'video generation'
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
}
