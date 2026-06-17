import { getProviderConfig } from '@/lib/api-config'
import { normalizeToOriginalMediaUrl } from '@/lib/media/outbound-image'
import { toFetchableUrl } from '@/lib/storage/utils'
import { uploadObject, getSignedUrl } from '@/lib/storage'
import type { LipSyncParams, LipSyncResult, LipSyncSubmitContext } from '@/lib/lipsync/types'

export async function submitComfyUILipSync(
  params: LipSyncParams,
  context: LipSyncSubmitContext,
): Promise<LipSyncResult> {
  const { baseUrl } = await getProviderConfig(context.userId, context.providerId)
  const endpoint = (baseUrl || 'http://localhost:8188').replace(/\/v1\/?$/, '')

  const { videoUrl } = params
  if (!videoUrl) {
    throw new Error('LIPSYNC_VIDEO_REQUIRED')
  }

  const storageKey = `lipsync/comfyui/${Date.now()}.mp4`

  const normalizedVideoUrl = await normalizeToOriginalMediaUrl(videoUrl)
  const fetchUrl = toFetchableUrl(normalizedVideoUrl)
  const response = await fetch(fetchUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await uploadObject(buffer, storageKey, 1, 'video/mp4')

  return {
    requestId: `COMFYUI-LIPSYNC-FAKE-${Date.now()}`,
    videoUrl: getSignedUrl(storageKey, 7200),
    externalId: '',
    async: false,
  }
}