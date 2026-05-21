'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '@/lib/query/keys'
import { GlassButton, GlassChip } from '@/components/ui/primitives'
import { AppIcon } from '@/components/ui/icons'
import type { NovelPromotionStoryboard, NovelPromotionClip } from '@/types/project'

interface PromptRefinerTabProps {
  projectId: string
  episodeId: string
  storyboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  getClipInfo?: (clipId: string) => NovelPromotionClip | undefined
  formatClipTitle?: (clip: NovelPromotionClip | undefined) => string
}

type PanelStatus = 'idle' | 'refining' | 'done' | 'error'

export default function PromptRefinerTab({
  projectId,
  episodeId,
  storyboards,
  clips,
  getClipInfo: resolveClip,
  formatClipTitle,
}: PromptRefinerTabProps) {
  const queryClient = useQueryClient()
  const [panelStatuses, setPanelStatuses] = useState<Record<string, PanelStatus>>({})
  const [panelErrors, setPanelErrors] = useState<Record<string, string>>({})
  const [panelPrompts, setPanelPrompts] = useState<Record<string, { imagePrompt: string; videoPrompt: string }>>({})

  const clipCache = useMemo(() => {
    const map = new Map<string, NovelPromotionClip | undefined>()
    if (resolveClip) {
      for (const sb of storyboards) {
        if (!map.has(sb.clipId)) map.set(sb.clipId, resolveClip(sb.clipId))
      }
    } else {
      for (const clip of clips) map.set(clip.id, clip)
    }
    return map
  }, [storyboards, clips, resolveClip])

  const allPanels = useMemo(() => {
    const result: Array<{ id: string; panelIndex: number; panelNumber: number | null }> = []
    for (const sb of storyboards) {
      for (const p of sb.panels || []) {
        result.push({ id: p.id, panelIndex: p.panelIndex, panelNumber: p.panelNumber })
      }
    }
    return result
  }, [storyboards])

  const unrefinedPanels = useMemo(() => {
    const ids = new Set<string>()
    for (const sb of storyboards) {
      for (const p of sb.panels || []) {
        if (!p.imagePrompt) ids.add(p.id)
      }
    }
    return ids
  }, [storyboards])

  const doneCount = useMemo(() => {
    let count = 0
    for (const sb of storyboards) {
      for (const p of sb.panels || []) {
        const status = panelStatuses[p.id]
        if (status === 'done' || (status === undefined && p.imagePrompt)) count++
      }
    }
    return count
  }, [storyboards, panelStatuses])

  const totalCount = useMemo(() =>
    storyboards.reduce((acc, sb) => acc + (sb.panels || []).length, 0),
    [storyboards],
  )

  const refineMutation = useMutation({
    mutationFn: async (target: { panelId?: string }) => {
      const body: Record<string, unknown> = { episodeId }
      if (target.panelId) {
        body.panelIds = [target.panelId]
      } else {
        const unrefined = Array.from(unrefinedPanels)
        if (unrefined.length === 0) return { results: [] }
        body.panelIds = unrefined
      }
      const res = await apiFetch(`/api/novel-promotion/${projectId}/refine-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || `Refine failed (${res.status})`)
      }
      return res.json() as Promise<{ results: Array<{
        panelId: string; status: string; imagePrompt?: string; videoPrompt?: string; error?: string
      }> }>
    },
    onMutate: (target) => {
      setPanelErrors((prev) => {
        if (target.panelId) { const { [target.panelId]: _, ...rest } = prev; return rest }
        return {}
      })
      setPanelPrompts((prev) => {
        if (target.panelId) { const { [target.panelId]: _, ...rest } = prev; return rest }
        return {}
      })
      setPanelStatuses((prev) => {
        const next = { ...prev }
        const ids = target.panelId ? [target.panelId] : Array.from(unrefinedPanels)
        for (const id of ids) next[id] = 'refining'
        return next
      })
    },
    onSuccess: (data) => {
      const newPrompts: Record<string, { imagePrompt: string; videoPrompt: string }> = {}
      setPanelStatuses((prev) => {
        const next = { ...prev }
        for (const r of data.results) {
          next[r.panelId] = r.status === 'ok' ? 'done' : 'error'
          if (r.error) setPanelErrors((e) => ({ ...e, [r.panelId]: r.error || '' }))
          if (r.imagePrompt || r.videoPrompt) {
            newPrompts[r.panelId] = { imagePrompt: r.imagePrompt || '', videoPrompt: r.videoPrompt || '' }
          }
        }
        return next
      })
      setPanelPrompts(newPrompts)
      queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
    },
    onError: (err: Error, target) => {
      setPanelStatuses((prev) => {
        const next = { ...prev }
        const ids = target.panelId ? [target.panelId] : allPanels.map((p) => p.id)
        for (const id of ids) {
          if (next[id] === 'refining') next[id] = 'error'
        }
        return next
      })
      setPanelErrors((prev) => {
        const next = { ...prev }
        const ids = target.panelId ? [target.panelId] : allPanels.map((p) => p.id)
        for (const id of ids) {
          if (!next[id]) next[id] = err.message
        }
        return next
      })
    },
  })

  const isRefining = Object.values(panelStatuses).some((s) => s === 'refining')
  const remainingCount = unrefinedPanels.size - (
    doneCount - (totalCount - unrefinedPanels.size)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-[var(--glass-bg-surface)] p-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">
            Refine Prompt
          </h2>
          <p className="text-sm text-[var(--glass-text-tertiary)]">
            {doneCount}/{totalCount} panels refined
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPanelStatuses({})
              setPanelErrors({})
              setPanelPrompts({})
              queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }}
            disabled={isRefining}
            className="px-3 py-2 rounded-lg border border-[var(--glass-stroke-base)] text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] disabled:opacity-30"
            title="Reload from database"
          >
            Reload
          </button>
          <GlassButton
            onClick={() => refineMutation.mutate({})}
            disabled={isRefining || unrefinedPanels.size === 0}
            className="flex items-center gap-2"
          >
            {isRefining ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Refining...
              </>
            ) : (
              <>
                <AppIcon name="sparklesAlt" className="h-4 w-4" />
                Refine All{unrefinedPanels.size > 0 ? ` (${unrefinedPanels.size})` : ''}
              </>
            )}
          </GlassButton>
        </div>
      </div>

      <div className="space-y-3">
        {storyboards.map((sb) => {
          const clip = clipCache.get(sb.clipId)
          const clipTitle = formatClipTitle ? formatClipTitle(clip) : clip?.summary || ''
          const sbPanels = sb.panels || []
          if (sbPanels.length === 0) return null

          return (
            <div key={sb.id} className="overflow-hidden rounded-xl bg-[var(--glass-bg-surface)]">
              <div className="border-b border-[var(--glass-border)] px-4 py-2.5">
                <p className="text-sm font-medium text-[var(--glass-text-primary)]">
                  {clipTitle || `Group ${sb.panelCount}`}
                </p>
                <p className="text-xs text-[var(--glass-text-tertiary)]">{sbPanels.length} panels</p>
              </div>

              <div className="divide-y divide-[var(--glass-border)]">
                {sbPanels.map((panel) => {
                  const status = panelStatuses[panel.id] || (
                    panel.imagePrompt ? 'done' : 'idle'
                  )
                  const errorMsg = panelErrors[panel.id]

                  return (
                    <div key={panel.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-bg-surface-strong)] text-xs font-medium text-[var(--glass-text-secondary)]">
                          {panel.panelNumber || panel.panelIndex + 1}
                        </span>
                        <GlassChip tone="neutral" className="text-xs">
                          {panel.shotType || 'no shot'}
                        </GlassChip>
                        {status === 'done' && (
                          <GlassChip tone="success" className="text-xs">Refined</GlassChip>
                        )}
                        {status === 'refining' && (
                          <GlassChip tone="info" className="text-xs">Refining...</GlassChip>
                        )}
                        {status === 'error' && (
                          <GlassChip tone="danger" className="text-xs">Error</GlassChip>
                        )}
                        {status === 'idle' && (
                          <GlassChip tone="neutral" className="text-xs">Not refined</GlassChip>
                        )}
                        {status !== 'refining' && (
                          <button
                            onClick={() => refineMutation.mutate({ panelId: panel.id })}
                            disabled={isRefining}
                            className="ml-auto text-xs text-[var(--glass-accent-from)] hover:underline disabled:opacity-30"
                          >
                            {status === 'done' ? 'Re-refine' : 'Refine'}
                          </button>
                        )}
                      </div>

                      {errorMsg && (
                        <p className="text-xs text-[var(--glass-tone-danger-fg)]">{errorMsg}</p>
                      )}

                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <div className="rounded-lg bg-[var(--glass-bg-surface-strong)] p-2.5">
                          <p className="mb-1 text-xs font-medium text-[var(--glass-text-tertiary)]">Image Prompt</p>
                          <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-[var(--glass-text-secondary)]">
                            {(() => {
                              const livePrompt = panelPrompts[panel.id]
                              const prompt = livePrompt?.imagePrompt || panel.imagePrompt
                              if (prompt) return prompt
                              if (status === 'done' || status === 'refining') return <span className="italic opacity-50">Refined prompt appears here...</span>
                              return <span className="italic opacity-50">Click Refine to generate</span>
                            })()}
                          </pre>
                        </div>
                        <div className="rounded-lg bg-[var(--glass-bg-surface-strong)] p-2.5">
                          <p className="mb-1 text-xs font-medium text-[var(--glass-text-tertiary)]">Video Prompt</p>
                          <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-[var(--glass-text-secondary)]">
                            {(() => {
                              const livePrompt = panelPrompts[panel.id]
                              const prompt = livePrompt?.videoPrompt || panel.videoPrompt
                              if (prompt) return prompt
                              if (status === 'done' || status === 'refining') return <span className="italic opacity-50">Refined prompt appears here...</span>
                              return <span className="italic opacity-50">Click Refine to generate</span>
                            })()}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
