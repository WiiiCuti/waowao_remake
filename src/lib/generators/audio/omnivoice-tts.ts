import { BaseAudioGenerator, AudioGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { toFetchableUrl } from '@/lib/storage/utils'

const DEFAULT_REF_TEXT = 'Đây là đoạn âm thanh mẫu để nhân bản giọng nói cho các mô hình chuyển văn bản thành giọng.'

export interface OmniVoiceTTSParams {
  userId: string
  text: string
  refAudioUrl: string
  refText?: string
  options?: {
    endpoint?: string
  }
}

export class OmniVoiceTTSGenerator extends BaseAudioGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: AudioGenerateParams): Promise<GenerateResult> {
    const { userId, text, options = {} } = params

    const { baseUrl } = await getProviderConfig(userId, this.providerId || 'omnivoice')
    const endpoint = ((options.endpoint as string | undefined) || baseUrl || 'http://localhost:8000').replace(/\/v1\/?$/, '')

    try {
      const refAudioUrl = options.refAudioUrl as string | undefined
      if (!refAudioUrl) {
        throw new Error('refAudioUrl is required for OmniVoice TTS voice cloning')
      }

      const refText = (options.refText as string | undefined) || DEFAULT_REF_TEXT

      const audioBuffer = await this.downloadAudio(refAudioUrl)
      const audioUrl = await this.callTTS(endpoint, text, audioBuffer, refText)

      return { success: true, audioUrl }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OmniVoice TTS error'
      }
    }
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(toFetchableUrl(url))
    if (!response.ok) {
      throw new Error(`Failed to download reference audio: ${response.status}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }

  private async callTTS(
    endpoint: string,
    text: string,
    audioBuffer: Buffer,
    refText: string,
  ): Promise<string> {
    const form = new FormData()
    form.append('text', text)
    form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' }), 'reference.wav')
    form.append('ref_text', refText)

    const res = await fetch(`${endpoint}/api/v1/tts`, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new Error(`OmniVoice TTS API failed: ${res.status} ${errorBody}`)
    }

    const data = await res.json() as { audio_url?: string }
    if (!data.audio_url) {
      throw new Error('OmniVoice TTS returned no audio_url')
    }

    const returnedUrl = data.audio_url
    try {
      const parsedUrl = new URL(returnedUrl)
      const endpointUrl = new URL(endpoint)
      parsedUrl.protocol = endpointUrl.protocol
      parsedUrl.host = endpointUrl.host
      return parsedUrl.toString()
    } catch {
      return returnedUrl
    }
  }
}

export async function generateWithOmniVoiceTTS(params: OmniVoiceTTSParams): Promise<GenerateResult> {
  const generator = new OmniVoiceTTSGenerator()
  return generator.generate({
    userId: params.userId,
    text: params.text,
    options: {
      refAudioUrl: params.refAudioUrl,
      refText: params.refText,
      endpoint: params.options?.endpoint,
    }
  })
}
