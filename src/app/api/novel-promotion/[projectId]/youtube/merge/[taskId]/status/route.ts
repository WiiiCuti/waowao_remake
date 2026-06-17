import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getTaskById } from '@/lib/task/service'
import { getSignedObjectUrl } from '@/lib/storage'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; taskId: string }> },
) => {
  const { projectId, taskId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const task = await getTaskById(taskId)
  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const payload = (task.payload || {}) as Record<string, unknown>
  const result = (task.result || {}) as Record<string, unknown>

  // Build progress info from payload
  const progress: Record<string, unknown> = {
    percent: task.progress ?? 0,
  }
  if (payload.stage) progress.stage = payload.stage
  if (typeof payload.current === 'number') progress.currentPanel = payload.current
  if (typeof payload.total === 'number') progress.totalPanels = payload.total

  const response: Record<string, unknown> = {
    status: task.status,
    progress,
  }

  // When completed, return signed URL for the result
  if (task.status === 'completed' && result.cosKey) {
    const cosUrl = await getSignedObjectUrl(result.cosKey as string, 3600)
    response.result = { cosUrl, cosKey: result.cosKey }
  }

  // When failed, return error info
  if (task.status === 'failed') {
    response.error = {
      code: task.errorCode,
      message: task.errorMessage,
    }
  }

  return NextResponse.json(response)
})
