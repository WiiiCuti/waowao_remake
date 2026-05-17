'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { useEpisodeData, useMatchedVoiceLines, type MatchedVoiceLine } from '@/lib/query/hooks'
import type { NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'

interface YouTubeStageProps {
  projectId: string
  episodeId: string
  onBack?: () => void
}

type MergeStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'canceled' | 'dismissed'

interface MergeProgress {
  stage?: string
  currentPanel?: number
  totalPanels?: number
  percent?: number
  message?: string
}

interface MergeSubmitResponse {
  async?: boolean
  taskId?: string
  status?: MergeStatus
}

interface MergeStatusResponse {
  status?: MergeStatus
  progress?: MergeProgress
  result?: {
    cosUrl?: string
    cosKey?: string
  }
  error?: {
    code?: string | null
    message?: string | null
  }
}

type EpisodeWithStoryboardData = {
  narratorEnabled?: boolean
  storyboards?: NovelPromotionStoryboard[]
}

interface PanelRow {
  panel: NovelPromotionPanel
  displayIndex: number
  storyboardOrder: number
  voiceLines: MatchedVoiceLine[]
}

function panelKey(storyboardId: string, panelIndex: number) {
  return `${storyboardId}:${panelIndex}`
}

function formatDuration(seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '--'
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`
}

function formatAudioDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`
}

function getProgressLabel(progress: MergeProgress, status: MergeStatus) {
  if (status === 'queued') return 'Queued'
  if (status === 'completed') return 'Export complete'
  if (status === 'failed') return 'Export failed'
  if (status === 'canceled' || status === 'dismissed') return 'Export stopped'

  switch (progress.stage) {
    case 'merge_start':
      return 'Preparing media'
    case 'downloading':
      return 'Downloading source media'
    case 'merge_panel':
      if (progress.currentPanel && progress.totalPanels) {
        return `Merging panel ${progress.currentPanel}/${progress.totalPanels}`
      }
      return 'Merging panels'
    case 'concat':
      return 'Concatenating panels'
    case 'uploading':
      return 'Uploading export'
    case 'complete':
      return 'Export complete'
    default:
      return progress.message || 'Processing'
  }
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as
    | { error?: { message?: string }; message?: string }
    | null
  return payload?.error?.message || payload?.message || fallback
}

export default function YouTubeStage({
  projectId,
  episodeId,
  onBack,
}: YouTubeStageProps) {
  const locale = useLocale()
  const episodeQuery = useEpisodeData(projectId, episodeId)
  const voiceLinesQuery = useMatchedVoiceLines(projectId, episodeId)
  const episode = episodeQuery.data as EpisodeWithStoryboardData | undefined

  const [narratorEnabled, setNarratorEnabled] = useState(true)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>('idle')
  const [progress, setProgress] = useState<MergeProgress>({ percent: 0 })
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof episode?.narratorEnabled === 'boolean') {
      setNarratorEnabled(episode.narratorEnabled)
    }
  }, [episode?.narratorEnabled])

  const voiceLinesByPanel = useMemo(() => {
    const map = new Map<string, MatchedVoiceLine[]>()
    for (const line of voiceLinesQuery.data?.voiceLines || []) {
      if (!line.matchedStoryboardId || typeof line.matchedPanelIndex !== 'number') continue
      const key = panelKey(line.matchedStoryboardId, line.matchedPanelIndex)
      const existing = map.get(key) || []
      existing.push(line)
      map.set(key, existing)
    }
    return map
  }, [voiceLinesQuery.data?.voiceLines])

  const panels = useMemo<PanelRow[]>(() => {
    const storyboards = episode?.storyboards || []
    return storyboards.flatMap((storyboard, storyboardIndex) => (
      (storyboard.panels || []).map((panel, panelIndex) => ({
        panel,
        displayIndex: panelIndex + 1,
        storyboardOrder: storyboardIndex + 1,
        voiceLines: voiceLinesByPanel.get(panelKey(panel.storyboardId, panel.panelIndex)) || [],
      }))
    ))
  }, [episode?.storyboards, voiceLinesByPanel])

  const stats = useMemo(() => {
    const withVideo = panels.filter(({ panel }) => !!panel.videoUrl).length
    const allVoiceLines = panels.flatMap((row) => row.voiceLines)
    const generatedVoiceLines = allVoiceLines.filter((line) => !!line.audioUrl).length
    const narrationLines = allVoiceLines.filter((line) => line.isNarration).length

    return {
      totalPanels: panels.length,
      withVideo,
      missingVideo: Math.max(0, panels.length - withVideo),
      totalVoiceLines: allVoiceLines.length,
      generatedVoiceLines,
      narrationLines,
    }
  }, [panels])

  const isBusy = mergeStatus === 'queued' || mergeStatus === 'processing'
  const canMerge = !isBusy && stats.withVideo > 0
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent ?? (isBusy ? 5 : 0))))

  const startMerge = useCallback(async () => {
    if (!canMerge) return

    setErrorMessage(null)
    setResultUrl(null)
    setTaskId(null)
    setProgress({ percent: 0, stage: 'merge_start' })
    setMergeStatus('queued')

    try {
      const response = await apiFetch(`/api/novel-promotion/${projectId}/youtube/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          narratorEnabled,
          meta: { locale },
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to start export'))
      }

      const payload = await response.json() as MergeSubmitResponse
      if (!payload.taskId) {
        throw new Error('Merge task was not created')
      }

      setTaskId(payload.taskId)
      setMergeStatus(payload.status === 'processing' ? 'processing' : 'queued')
    } catch (error) {
      setMergeStatus('failed')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start export')
    }
  }, [canMerge, episodeId, locale, narratorEnabled, projectId])

  useEffect(() => {
    if (!taskId) return

    let cancelled = false
    let intervalId: number | null = null

    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const poll = async () => {
      try {
        const response = await apiFetch(
          `/api/novel-promotion/${projectId}/youtube/merge/${taskId}/status`,
          { method: 'GET', cache: 'no-store' },
        )

        if (!response.ok) {
          throw new Error(await readApiError(response, 'Failed to read merge status'))
        }

        const payload = await response.json() as MergeStatusResponse
        if (cancelled) return

        const nextStatus = payload.status || 'processing'
        setMergeStatus(nextStatus)
        setProgress(payload.progress || {})

        if (nextStatus === 'completed') {
          setResultUrl(payload.result?.cosUrl || null)
          setTaskId(null)
          stopPolling()
          return
        }

        if (nextStatus === 'failed' || nextStatus === 'canceled' || nextStatus === 'dismissed') {
          setErrorMessage(payload.error?.message || 'Export failed')
          setTaskId(null)
          stopPolling()
        }
      } catch (error) {
        if (cancelled) return
        setMergeStatus('failed')
        setErrorMessage(error instanceof Error ? error.message : 'Failed to read merge status')
        setTaskId(null)
        stopPolling()
      }
    }

    void poll()
    intervalId = window.setInterval(() => { void poll() }, 2000)

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [projectId, taskId])

  if (episodeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--glass-text-tertiary)]">Loading YouTube export...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="glass-surface p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="glass-btn-base glass-btn-secondary flex h-10 w-10 items-center justify-center"
                aria-label="Back"
              >
                <AppIcon name="chevronLeft" className="h-5 w-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--glass-text-tertiary)]">
                <AppIcon name="clapperboard" className="h-4 w-4" />
                <span>YouTube</span>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">
                YouTube Export
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="glass-surface-soft flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--glass-text-secondary)]">
              <span className="font-medium">Narration</span>
              <button
                type="button"
                onClick={() => setNarratorEnabled((value) => !value)}
                disabled={isBusy}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  narratorEnabled
                    ? 'bg-[var(--glass-accent-from)]'
                    : 'bg-[var(--glass-stroke-strong)]'
                }`}
                aria-pressed={narratorEnabled}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    narratorEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            <button
              type="button"
              onClick={() => { void startMerge() }}
              disabled={!canMerge}
              className="glass-btn-base glass-btn-primary flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? (
                <AppIcon name="loader" className="h-4 w-4 animate-spin" />
              ) : (
                <AppIcon name="film" className="h-4 w-4" />
              )}
              <span>{isBusy ? 'Merging' : 'Merge & Export'}</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Panels" value={stats.totalPanels} />
          <StatTile label="Videos" value={`${stats.withVideo}/${stats.totalPanels}`} />
          <StatTile label="Missing Video" value={stats.missingVideo} tone={stats.missingVideo > 0 ? 'warn' : 'normal'} />
          <StatTile label="Voice Audio" value={`${stats.generatedVoiceLines}/${stats.totalVoiceLines}`} />
          <StatTile label="Narration" value={narratorEnabled ? stats.narrationLines : 'Off'} />
        </div>
      </div>

      {(isBusy || mergeStatus === 'completed' || mergeStatus === 'failed' || errorMessage || resultUrl) && (
        <div className="glass-surface p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                {isBusy && <AppIcon name="loader" className="h-4 w-4 animate-spin text-[var(--glass-tone-info-fg)]" />}
                {mergeStatus === 'completed' && <AppIcon name="check" className="h-4 w-4 text-[var(--glass-tone-success-fg)]" />}
                {mergeStatus === 'failed' && <AppIcon name="alert" className="h-4 w-4 text-[var(--glass-tone-danger-fg)]" />}
                <span>{getProgressLabel(progress, mergeStatus)}</span>
              </div>
              {errorMessage && (
                <p className="mt-1 text-sm text-[var(--glass-tone-danger-fg)]">{errorMessage}</p>
              )}
            </div>

            {resultUrl && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-btn-base glass-btn-secondary flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-medium"
                >
                  <AppIcon name="externalLink" className="h-4 w-4" />
                  <span>Open</span>
                </a>
                <a
                  href={resultUrl}
                  download
                  className="glass-btn-base glass-btn-primary flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-medium"
                >
                  <AppIcon name="download" className="h-4 w-4" />
                  <span>Download</span>
                </a>
              </div>
            )}
          </div>

          {isBusy && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--glass-bg-muted)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}

          {resultUrl && (
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--glass-stroke-base)] bg-black">
              <video src={resultUrl} controls className="max-h-[70vh] w-full bg-black" />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">Panel Checklist</h3>
          {voiceLinesQuery.isFetching && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--glass-text-tertiary)]">
              <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" />
              Refreshing
            </span>
          )}
        </div>

        {panels.length === 0 ? (
          <div className="glass-surface p-8 text-center text-sm text-[var(--glass-text-tertiary)]">
            No storyboard panels found.
          </div>
        ) : (
          <div className="grid gap-3">
            {panels.map((row, index) => (
              <PanelChecklistRow
                key={row.panel.id}
                row={row}
                sequence={index + 1}
                narratorEnabled={narratorEnabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone = 'normal',
}: {
  label: string
  value: number | string
  tone?: 'normal' | 'warn'
}) {
  return (
    <div className="glass-surface-soft rounded-xl px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-normal text-[var(--glass-text-tertiary)]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${
        tone === 'warn' ? 'text-[var(--glass-tone-warning-fg)]' : 'text-[var(--glass-text-primary)]'
      }`}>
        {value}
      </div>
    </div>
  )
}

function PanelChecklistRow({
  row,
  sequence,
  narratorEnabled,
}: {
  row: PanelRow
  sequence: number
  narratorEnabled: boolean
}) {
  const dialogueLines = row.voiceLines.filter((line) => !line.isNarration)
  const narrationLines = row.voiceLines.filter((line) => line.isNarration)
  const audibleLines = narratorEnabled ? row.voiceLines : dialogueLines
  const generatedAudioCount = audibleLines.filter((line) => !!line.audioUrl).length
  const silent = audibleLines.length === 0 || generatedAudioCount === 0

  return (
    <div className="glass-surface-elevated overflow-hidden">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--glass-bg-muted)] px-2 text-xs font-bold text-[var(--glass-text-secondary)]">
              {sequence}
            </span>
            <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
              Storyboard {row.storyboardOrder} / Panel {row.displayIndex}
            </span>
            <StatusPill ok={!!row.panel.videoUrl} okLabel="Video" emptyLabel="No video" />
            <StatusPill ok={!silent} okLabel="Audio" emptyLabel="Silent" />
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--glass-text-secondary)]">
            {row.panel.description || row.panel.videoPrompt || 'No panel description'}
          </p>

          {row.voiceLines.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.voiceLines.map((line) => {
                const disabledByNarrator = line.isNarration && !narratorEnabled
                const duration = formatAudioDuration(line.audioDuration)
                return (
                  <span
                    key={line.id}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                      disabledByNarrator
                        ? 'border-[var(--glass-stroke-base)] text-[var(--glass-text-tertiary)] opacity-60'
                        : line.audioUrl
                          ? 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                          : 'border-[var(--glass-stroke-warning)] bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
                    }`}
                  >
                    <span className="font-medium">{line.isNarration ? 'Narration' : line.speaker}</span>
                    <span className="truncate">{line.content}</span>
                    {duration && <span className="shrink-0 text-[var(--glass-text-tertiary)]">{duration}</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs lg:grid-cols-1 lg:text-left">
          <Metric label="Duration" value={formatDuration(row.panel.duration)} />
          <Metric label="Dialogue" value={dialogueLines.length} />
          <Metric label="Narration" value={narratorEnabled ? narrationLines.length : 'Off'} />
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  ok,
  okLabel,
  emptyLabel,
}: {
  ok: boolean
  okLabel: string
  emptyLabel: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      ok
        ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
        : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
    }`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ok ? okLabel : emptyLabel}
    </span>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-lg bg-[var(--glass-bg-muted)] px-3 py-2">
      <div className="text-[var(--glass-text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-semibold text-[var(--glass-text-primary)]">{value}</div>
    </div>
  )
}
