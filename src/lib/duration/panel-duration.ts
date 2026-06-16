/**
 * Centralized panel video duration calculation.
 *
 * Decision matrix:
 *   Rule 1: Lip sync ON + voice + narration → voiceDur + narrationDur (concat)
 *   Rule 2: Lip sync ON + voice + no narration → voiceDur
 *   Rule 3: Lip sync OFF + voice → voiceDur
 *   Rule 4: Lip sync OFF + no voice + narration → narrationDur
 *   Rule 5: No voice + no narration → storyboard fallback
 *
 * When narratorEnabled === false, narration audio is treated as non-existent.
 */

const DEFAULT_FALLBACK_DURATION_S = 3

interface VoiceLine {
  audioDuration: number | null  // milliseconds from DB
  isNarration: boolean
}

export interface CalculatePanelDurationParams {
  hasLipSync: boolean
  narratorEnabled: boolean
  voiceLines: VoiceLine[]
  storyboardDuration: number | null  // seconds from panel.duration
}

/**
 * Calculate the effective video duration for a panel in **seconds**.
 *
 * The returned value is always > 0 and can be used directly
 * for video generation and editor timeline calculations.
 */
export function calculatePanelVideoDuration(params: CalculatePanelDurationParams): number {
  const {
    hasLipSync,
    narratorEnabled,
    voiceLines,
    storyboardDuration,
  } = params

  // Separate voice lines into dialogue and narration
  const dialogueLines = voiceLines.filter(
    (line) => !line.isNarration && typeof line.audioDuration === 'number' && line.audioDuration > 0,
  )
  const narrationLines = narratorEnabled
    ? voiceLines.filter(
        (line) => line.isNarration && typeof line.audioDuration === 'number' && line.audioDuration > 0,
      )
    : []

  const hasVoice = dialogueLines.length > 0
  const hasNarration = narrationLines.length > 0

  // Take the first (primary) voice/narration duration in seconds
  const voiceDurS = hasVoice ? (dialogueLines[0].audioDuration! / 1000) : 0
  const narrationDurS = hasNarration ? (narrationLines[0].audioDuration! / 1000) : 0

  let calculatedDuration = DEFAULT_FALLBACK_DURATION_S

  // Rule 1: Lip sync ON + voice + narration → concat
  if (hasLipSync && hasVoice && hasNarration) {
    calculatedDuration = voiceDurS + narrationDurS
  }
  // Rule 2: Lip sync ON + voice + no narration → voiceDur
  else if (hasLipSync && hasVoice) {
    calculatedDuration = voiceDurS
  }
  // Rule 3: Lip sync OFF + voice → voiceDur
  else if (hasVoice) {
    calculatedDuration = voiceDurS
  }
  // Rule 4: Lip sync OFF + no voice + narration → narrationDur
  else if (hasNarration) {
    calculatedDuration = narrationDurS
  }
  // Rule 5: Fallback to storyboard duration
  else if (typeof storyboardDuration === 'number' && storyboardDuration > 0) {
    calculatedDuration = storyboardDuration
  }

  // Ensure minimum duration for better pacing and video generation quality
  return Math.max(calculatedDuration, DEFAULT_FALLBACK_DURATION_S)
}
