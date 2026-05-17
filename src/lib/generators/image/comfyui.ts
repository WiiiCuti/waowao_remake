import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64, resolveComfyDimensions } from '@/lib/cos'
import fluxTxt2ImgTemplate from './flux_txt2img.json'
import fluxImg2ImgTemplate from './flux_img2img_multi.json'

const TXT2IMG_TEMPLATE = fluxTxt2ImgTemplate as Record<string, unknown>
const IMG2IMG_TEMPLATE = fluxImg2ImgTemplate as Record<string, unknown>

const MODULES = [
  { load: '198', scale: '270', vae: '206', ref: '204' },
  { load: '229', scale: '272', vae: '262', ref: '257' },
  { load: '233', scale: '273', vae: '263', ref: '258' },
  { load: '236', scale: '274', vae: '264', ref: '259' },
  { load: '239', scale: '275', vae: '265', ref: '260' },
  { load: '282', scale: '283', vae: '284', ref: '285' },
  { load: '286', scale: '287', vae: '288', ref: '289' },
  { load: '290', scale: '291', vae: '292', ref: '293' },
  { load: '294', scale: '295', vae: '296', ref: '297' },
  { load: '298', scale: '299', vae: '300', ref: '301' },
  { load: '302', scale: '303', vae: '304', ref: '305' },
  { load: '306', scale: '307', vae: '308', ref: '309' },
  { load: '310', scale: '311', vae: '312', ref: '313' },
  { load: '314', scale: '315', vae: '316', ref: '317' },
  { load: '318', scale: '319', vae: '320', ref: '321' },
  { load: '322', scale: '323', vae: '324', ref: '325' },
  { load: '326', scale: '327', vae: '328', ref: '329' },
  { load: '330', scale: '331', vae: '332', ref: '333' },
  { load: '334', scale: '335', vae: '336', ref: '337' },
  { load: '338', scale: '339', vae: '340', ref: '341' },
]
const CLIP_NODE = '6'
const GUIDER_NODE = '278'

export class ComfyUIImageGenerator extends BaseImageGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params

    const { baseUrl } = await getProviderConfig(userId, this.providerId || 'comfyui')
    const endpoint = (baseUrl || 'http://localhost:8188').replace(/\/v1\/?$/, '')

    try {
      const count = referenceImages.length
      const useImg2Img = count > 0

      if (useImg2Img) {
        const maxModules = Math.min(count, MODULES.length)
        const uploadedNames = await Promise.all(
          referenceImages.slice(0, maxModules).map((url) => this.uploadImageToComfyUI(endpoint, url)),
        )
        const workflow = this.buildWorkflow(prompt, uploadedNames, options)
        const res = await fetch(`${endpoint}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow })
        })
        if (!res.ok) throw new Error(`ComfyUI submit failed: ${res.status}`)
        const { prompt_id } = await res.json()
        const imageUrl = await this.pollForResult(endpoint, prompt_id)
        return { success: true, imageUrl }
      }

      const workflow = this.buildWorkflow(prompt, [], options)
      const res = await fetch(`${endpoint}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow })
      })
      if (!res.ok) throw new Error(`ComfyUI submit failed: ${res.status}`)
      const { prompt_id } = await res.json()
      const imageUrl = await this.pollForResult(endpoint, prompt_id)
      return { success: true, imageUrl }

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
    if (!uploadRes.ok) throw new Error(`ComfyUI image upload failed: ${uploadRes.status}`)
    const result = await uploadRes.json() as { name?: string }
    if (!result.name) throw new Error('ComfyUI upload returned no filename')
    return result.name
  }

  private buildWorkflow(
    prompt: string,
    refImageNames: string[],
    options: Record<string, unknown>,
  ) {
    const useImg2Img = refImageNames.length > 0
    const template = useImg2Img ? IMG2IMG_TEMPLATE : TXT2IMG_TEMPLATE
    const workflow = JSON.parse(JSON.stringify(template))
    const dims = resolveComfyDimensions(options)

    if (useImg2Img) {
      const count = Math.min(refImageNames.length, MODULES.length)

      // Set images and chain RefLats
      for (let i = 0; i < MODULES.length; i++) {
        const mod = MODULES[i]
        if (i < count) {
          // Set image filename
          workflow[mod.load].inputs.image = refImageNames[i]

          // Chain conditioning: first RefLat gets CLIP, rest get previous RefLat
          if (i === 0) {
            workflow[mod.ref].inputs.conditioning = [CLIP_NODE, 0]
          } else {
            const prevRef = MODULES[i - 1].ref
            workflow[mod.ref].inputs.conditioning = [prevRef, 0]
          }
        } else {
          // Delete unused module nodes
          delete workflow[mod.load]
          delete workflow[mod.scale]
          delete workflow[mod.vae]
          delete workflow[mod.ref]
        }
      }

      // Last RefLat feeds into Guider
      const lastRef = MODULES[count - 1].ref
      if (workflow[GUIDER_NODE]) {
        workflow[GUIDER_NODE].inputs.positive = [lastRef, 0]
      }

      // Reduce denoise
      if (workflow['276']) {
        workflow['276'].inputs.denoise = 0.65
      }
    }

    // Fill prompt and dimensions
    for (const nodeId in workflow) {
      const node = workflow[nodeId]
      const meta = node._meta
      if (!meta?.title) continue

      switch (meta.title) {
        case '$promt.value':
        case '$promt.value!':
        case '$prompt.value':
        case '$prompt.value!':
          node.inputs.value = prompt || ''
          break
        case '$with.value':
        case '$with.value!':
        case '$width.value':
        case '$width.value!':
          node.inputs.value = dims.width
          break
        case '$height.value':
        case '$height.value!':
          node.inputs.value = dims.height
          break
      }
    }

    return workflow
  }

  private async pollForResult(endpoint: string, promptId: string): Promise<string> {
    const maxAttempts = 120
    const interval = 1000

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const historyRes = await fetch(`${endpoint}/history/${promptId}`)
        const history = await historyRes.json()
        const outputs = history[promptId]?.outputs

        if (outputs) {
          for (const nodeId in outputs) {
            const node = outputs[nodeId]
            if (node.images) {
              const imageName = node.images[0].filename
              const imageUrl = `${endpoint}/view?filename=${imageName}&type=output`
              return await imageUrlToBase64(imageUrl)
            }
          }
        }
      } catch (e) {
        // Continue polling
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('ComfyUI timeout')
  }
}
