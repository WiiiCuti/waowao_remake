import { processMediaResult } from '@/lib/media-process'
import { toFetchableUrl } from '@/lib/storage'

export async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(toFetchableUrl(imageUrl))
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || 'image/png'
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

export async function uploadBase64ToCos(base64: string, format: string): Promise<string> {
  const type = format === 'mp4' ? 'video' : format === 'mp3' ? 'audio' : 'image'
  return await processMediaResult({
    source: base64,
    type,
    keyPrefix: 'comfyui',
    targetId: Date.now().toString(),
  })
}

type AspectRatio = '16:9' | '9:16' | '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '5:4' | '4:5' | '21:9'

const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 704 },
  '9:16': { width: 704, height: 1280 },
  '1:1': { width: 1024, height: 1024 },
  '3:2': { width: 1200, height: 800 },
  '2:3': { width: 800, height: 1200 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '5:4': { width: 1000, height: 800 },
  '4:5': { width: 800, height: 1000 },
  '21:9': { width: 1344, height: 576 },
}

export function resolveComfyDimensions(options: Record<string, unknown>): { width: number; height: number } {
  const explicitWidth = options.width as number | undefined
  const explicitHeight = options.height as number | undefined
  const aspectRatio = (options.aspectRatio as string) || (options.resolution as string)

  if (explicitWidth && explicitHeight) {
    return { width: explicitWidth, height: explicitHeight }
  }

  if (aspectRatio && ASPECT_RATIO_DIMENSIONS[aspectRatio]) {
    return { ...ASPECT_RATIO_DIMENSIONS[aspectRatio] }
  }

  return { width: 1024, height: 1024 }
}
