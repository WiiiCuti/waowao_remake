import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import {
  ComfyUIVideoGenerator,
  chunkPanels,
  sliceVideoByPanels,
} from '@/lib/generators/video'
import type { PanelForChunking } from '@/lib/generators/video'
import type { LTXDirectorSegment, LTXDirectorAudio } from '@/lib/generators/video'

interface TestLTXDirectorRequest {
  userId?: string
  segments: LTXDirectorSegment[]
  audioSegments?: LTXDirectorAudio[]
  fps?: number
  globalPrompt?: string
}

export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json() as TestLTXDirectorRequest

  if (!body.segments || !Array.isArray(body.segments) || body.segments.length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      field: 'segments',
      message: 'segments must be a non-empty array',
    })
  }

  const userId = body.userId || 'test-user'
  const fps = body.fps || 24

  const panels: PanelForChunking[] = body.segments.map((seg, i) => ({
    panelId: seg.prompt ? `panel_${String(i).padStart(3, '0')}` : `panel_${i}`,
    imageUrl: seg.imageUrl,
    prompt: seg.prompt,
    durationSeconds: seg.durationSeconds || 3,
    isBRoll: seg.prompt.startsWith('[') && seg.prompt.endsWith(']'),
  }))

  if (body.audioSegments) {
    for (const aud of body.audioSegments) {
      const startFrame = Math.round(aud.startSeconds * fps)
      for (let i = 0; i < panels.length; i++) {
        const panelStart = panels.slice(0, i).reduce((s, p) => s + p.durationSeconds, 0) * fps
        const panelEnd = panelStart + panels[i].durationSeconds * fps
        if (startFrame >= panelStart && startFrame < panelEnd) {
          panels[i].audioUrl = aud.audioUrl
          panels[i].audioDurationSeconds = aud.durationSeconds
          break
        }
      }
    }
  }

  const chunks = chunkPanels(panels)
  console.log(`[test-ltx-director] ${panels.length} panels → ${chunks.length} chunks`)

  const generator = new ComfyUIVideoGenerator('comfyui')
  const allSliceResults: { panelId: string; videoUrl: string }[] = []

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    console.log(`[test-ltx-director] chunk ${ci + 1}/${chunks.length}: ${chunk.panels.length} panels, ${chunk.totalDurationSeconds.toFixed(2)}s`)

    const segs = chunk.panels.map(p => ({
      imageUrl: p.imageUrl,
      prompt: p.prompt,
      durationSeconds: p.durationSeconds,
    }))

    const auds = chunk.panels
      .filter(p => p.audioUrl)
      .map(p => {
        const startSec = chunk.panels
          .slice(0, chunk.panels.indexOf(p))
          .reduce((s, pp) => s + pp.durationSeconds, 0)
        return {
          audioUrl: p.audioUrl!,
          startSeconds: startSec,
          durationSeconds: p.audioDurationSeconds || p.durationSeconds,
        }
      })

    const result = await generator.generateWithLTXDirector(userId, {
      segments: segs,
      audioSegments: auds.length > 0 ? auds : undefined,
      fps,
      globalPrompt: body.globalPrompt,
    })

    if (!result.success || !result.videoUrl) {
      throw new ApiError('GENERATION_FAILED', {
        message: `Chunk ${ci + 1} failed: ${result.error || 'unknown'}`,
      })
    }

    const slices = await sliceVideoByPanels(result.videoUrl, chunk.panels, {
      fps,
      storageKeyPrefix: `video/ltx/test_chunk_${ci}`,
    })
    allSliceResults.push(...slices)
  }

  const panelResults = Object.fromEntries(
    allSliceResults.map(s => [s.panelId, s.videoUrl])
  )

  return NextResponse.json({
    success: true,
    chunks: chunks.length,
    panels: panels.length,
    panelUrls: panelResults,
  })
})
