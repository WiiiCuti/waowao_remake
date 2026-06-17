import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const { episodeId, narratorEnabled } = body

  if (!episodeId || typeof episodeId !== 'string') {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }
  if (typeof narratorEnabled !== 'boolean') {
    throw new ApiError('INVALID_PARAMS', { message: 'narratorEnabled must be a boolean' })
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProject: { projectId },
    },
    select: { id: true },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  const locale = resolveRequiredTaskLocale(request, body)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId,
    type: TASK_TYPE.MERGE_VIDEO,
    targetType: 'NovelPromotionEpisode',
    targetId: episodeId,
    payload: { narratorEnabled },
  })

  return NextResponse.json(result)
})
