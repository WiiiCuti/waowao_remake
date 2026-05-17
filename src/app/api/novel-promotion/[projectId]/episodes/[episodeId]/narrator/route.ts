import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * PUT - Toggle narrator enabled state for an episode
 */
export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { narratorEnabled } = body

  if (typeof narratorEnabled !== 'boolean') {
    throw new ApiError('INVALID_PARAMS', { message: 'narratorEnabled must be a boolean' })
  }

  await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: { narratorEnabled } as Record<string, unknown>,
  })

  return NextResponse.json({ success: true, narratorEnabled })
})

