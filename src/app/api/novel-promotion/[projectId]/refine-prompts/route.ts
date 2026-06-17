import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { refinePanelPrompts } from '@/lib/novel-promotion/prompt-refiner'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { getProjectModelConfig } from '@/lib/config-service'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId.trim() : ''
  if (!episodeId) throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })

  const panelIds = Array.isArray(body.panelIds)
    ? body.panelIds.filter((id): id is string => typeof id === 'string').map((s) => s.trim()).filter(Boolean)
    : undefined

  const locale = resolveRequiredTaskLocale(request, body)
  const model = await resolveAnalysisModel({
    userId: session.user.id,
    inputModel: body.model,
    projectAnalysisModel: (await getProjectModelConfig(projectId, session.user.id)).analysisModel,
  })

  const modelConfig = await getProjectModelConfig(projectId, session.user.id)
  const artStyle = modelConfig.artStyle

  const results = await refinePanelPrompts({
    projectId,
    episodeId,
    userId: session.user.id,
    model,
    locale,
    artStyle,
    panelIds,
  })

  return Response.json({ results })
})
