'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface VoiceToolbarProps {
    onBack?: () => void
    onAddLine: () => void
    onAnalyze: () => void
    onGenerateAll: () => void
    onDownloadAll: () => void
    analyzing: boolean
    isBatchSubmitting: boolean
    runningCount: number
    isDownloading: boolean
    allSpeakersHaveVoice: boolean
    totalLines: number
    linesWithVoice: number
    linesWithAudio: number
    narratorEnabled: boolean
    onToggleNarrator: (enabled: boolean) => void
}

export default function VoiceToolbar({
    onBack,
    onAddLine,
    onAnalyze,
    onGenerateAll,
    onDownloadAll,
    analyzing,
    isBatchSubmitting,
    runningCount,
    isDownloading,
    allSpeakersHaveVoice,
    totalLines,
    linesWithVoice,
    linesWithAudio,
    narratorEnabled,
    onToggleNarrator
}: VoiceToolbarProps) {
    const t = useTranslations('voice')
    const voiceTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null
    const voiceDownloadRunningState = isDownloading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null

    return (
        <div className="glass-surface-elevated p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] font-medium rounded-xl border border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-tone-info-fg)] transition-all"
                    >
                        {t("toolbar.back")}
                    </button>
                    <button
                        onClick={onAnalyze}
                        disabled={analyzing}
                        className="glass-btn-base glass-btn-primary flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {analyzing ? t("assets.stage.analyzing") : t("toolbar.analyzeLines")}
                    </button>
                    <button
                        onClick={onAddLine}
                        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-5 py-2.5 font-medium border border-[var(--glass-stroke-base)]"
                    >
                        {t("toolbar.addLine")}
                    </button>
                    <button
                        onClick={onGenerateAll}
                        disabled={isBatchSubmitting || !allSpeakersHaveVoice || totalLines === 0}
                        className="glass-btn-base glass-btn-tone-success flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!allSpeakersHaveVoice ? t("toolbar.uploadReferenceHint") : ''}
                    >
                        {isBatchSubmitting ? (
                            <>
                                <TaskStatusInline state={voiceTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                <span className="text-xs text-white/90">({runningCount})</span>
                            </>
                        ) : t("toolbar.generateAll")}
                    </button>
                    <button
                        onClick={onDownloadAll}
                        disabled={linesWithAudio === 0 || isDownloading}
                        className="glass-btn-base glass-btn-tone-info flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={linesWithAudio === 0 ? t("toolbar.noDownload") : t("toolbar.downloadCount", { count: linesWithAudio })}
                    >
                        {isDownloading ? (
                            <TaskStatusInline state={voiceDownloadRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : t("toolbar.downloadAll")}
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-sm text-[var(--glass-text-secondary)]">
                            {t("toolbar.narrator")}
                            <span className={`ml-1.5 font-semibold ${narratorEnabled ? 'text-[var(--glass-tone-success)]' : 'text-[var(--glass-text-tertiary)]'}`}>
                                {narratorEnabled ? 'ON' : 'OFF'}
                            </span>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={narratorEnabled}
                            onClick={() => onToggleNarrator(!narratorEnabled)}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                narratorEnabled
                                    ? 'bg-[var(--glass-tone-success)]'
                                    : 'bg-[var(--glass-bg-muted)]'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
                                    narratorEnabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </label>
                    <div className="text-sm text-[var(--glass-text-tertiary)]">
                        {t("toolbar.stats", { total: totalLines, withVoice: linesWithVoice, withAudio: linesWithAudio })}
                    </div>
                </div>
            </div>
        </div>
    )
}
