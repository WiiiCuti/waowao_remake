import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedObjectUrl } from '@/lib/storage'

const DEFAULT_EXPIRES_SECONDS = 3600

export const GET = apiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const expiresRaw = searchParams.get('expires')

  if (!key) {
    throw new ApiError('INVALID_PARAMS')
  }

  const expires = expiresRaw ? Number.parseInt(expiresRaw, 10) : DEFAULT_EXPIRES_SECONDS
  const ttl = Number.isFinite(expires) && expires > 0 ? expires : DEFAULT_EXPIRES_SECONDS

  // Generate a signed URL and proxy the file through the server
  const signedUrl = await getSignedObjectUrl(key, ttl)

  // Use fetch to get the file from MinIO and return it directly
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new ApiError('NOT_FOUND')
  }

  const buffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'application/octet-stream'

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  })
})
