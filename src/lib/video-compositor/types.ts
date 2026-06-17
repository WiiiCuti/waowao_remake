export interface PanelVoiceLineInput {
  audioUrl: string | null
  audioDuration: number | null  // ms
  isNarration: boolean
}

export interface PanelMergeInput {
  panelId: string
  videoUrl: string
  voiceLines: PanelVoiceLineInput[]
}

export interface PanelMergeResult {
  panelId: string
  tempPath: string
  durationS: number
}

export interface ConcatResult {
  tempPath: string
  durationS: number
}

export interface CompositorProgress {
  stage: 'merge_start' | 'downloading' | 'merge_panel' | 'concat' | 'uploading' | 'complete'
  currentPanel?: number
  totalPanels?: number
  percent?: number
  message?: string
}
