import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getSignedObjectUrl, toFetchableUrl } from '@/lib/storage'
import { createScopedLogger } from '@/lib/logging/core'
import type { PanelMergeInput, PanelMergeResult, ConcatResult, PanelVoiceLineInput } from './types'

const logger = createScopedLogger({ module: 'video-compositor' })

async function resolveUrl(keyOrUrl: string | null): Promise<string | null> {
  if (!keyOrUrl) return null
  if (keyOrUrl.startsWith('http') || keyOrUrl.startsWith('data:') || keyOrUrl.startsWith('/')) {
    return toFetchableUrl(keyOrUrl)
  }
  return toFetchableUrl(await getSignedObjectUrl(keyOrUrl, 7200))
}

export function ensureFfmpeg(): void {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    throw new Error('FFMPEG_NOT_FOUND: ffmpeg is required but not installed')
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VideoCompositor/1.0)' },
  })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
}

function runFfprobe(args: string[]): string {
  return execFileSync('ffprobe', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function runFfmpeg(args: string[], timeout: number): void {
  execFileSync('ffmpeg', args, {
    stdio: 'pipe',
    timeout,
  })
}

function getMediaDuration(filePath: string): number {
  try {
    const output = runFfprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    const duration = Number.parseFloat(output.trim())
    return Number.isFinite(duration) ? duration : 0
  } catch {
    return 0
  }
}

function getVideoCodec(filePath: string): string | null {
  try {
    const output = runFfprobe([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    return output.trim() || null
  } catch {
    return null
  }
}

function getAudioCodec(filePath: string): string | null {
  try {
    const output = runFfprobe([
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    return output.trim() || null
  } catch {
    return null
  }
}

function getFirstAudioLine(
  lines: PanelVoiceLineInput[],
  panelId: string,
  label: string,
): PanelVoiceLineInput {
  const line = lines[0]
  if (!line?.audioUrl) {
    throw new Error(`Panel ${panelId}: ${label} audio URL invalid`)
  }
  return line
}

export async function mergePanel(
  input: PanelMergeInput,
  narratorEnabled: boolean,
  tempDir: string,
): Promise<PanelMergeResult> {
  const videoUrl = await resolveUrl(input.videoUrl)
  if (!videoUrl) throw new Error(`Panel ${input.panelId}: videoUrl could not be resolved`)

  const videoPath = path.join(tempDir, `panel_${input.panelId}_video.mp4`)
  await downloadFile(videoUrl, videoPath)

  const dialogueLines = input.voiceLines.filter((voiceLine) => !voiceLine.isNarration && voiceLine.audioUrl)
  const narrationLines = input.voiceLines.filter((voiceLine) => voiceLine.isNarration && voiceLine.audioUrl)

  const useDialogue = dialogueLines.length > 0
  const useNarration = narratorEnabled && narrationLines.length > 0
  const outputPath = path.join(tempDir, `panel_${input.panelId}_merged.mp4`)

  if (useDialogue && useNarration) {
    const dialogueLine = getFirstAudioLine(dialogueLines, input.panelId, 'dialogue')
    const narrationLine = getFirstAudioLine(narrationLines, input.panelId, 'narration')
    const dialogueUrl = await resolveUrl(dialogueLine.audioUrl)
    const narrationUrl = await resolveUrl(narrationLine.audioUrl)
    if (!dialogueUrl || !narrationUrl) throw new Error(`Panel ${input.panelId}: audio URLs invalid`)

    const dialoguePath = path.join(tempDir, `panel_${input.panelId}_dialogue.wav`)
    const narrationPath = path.join(tempDir, `panel_${input.panelId}_narration.wav`)
    await downloadFile(dialogueUrl, dialoguePath)
    await downloadFile(narrationUrl, narrationPath)

    const voiceDurationMs = dialogueLine.audioDuration || Math.round(getMediaDuration(dialoguePath) * 1000)

    logger.info({
      message: `Merging panel ${input.panelId} with dialogue+narration`,
      details: { voiceDurationMs },
    })
    runFfmpeg([
      '-y',
      '-i', videoPath,
      '-i', dialoguePath,
      '-i', narrationPath,
      '-filter_complex',
      `[1:a]adelay=0|0[voice];[2:a]adelay=${voiceDurationMs}|${voiceDurationMs}[narr];[voice][narr]amix=inputs=2:duration=longest[out]`,
      '-map', '0:v',
      '-map', '[out]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ], 300_000)
  } else if (useDialogue) {
    const dialogueLine = getFirstAudioLine(dialogueLines, input.panelId, 'dialogue')
    const dialogueUrl = await resolveUrl(dialogueLine.audioUrl)
    if (!dialogueUrl) throw new Error(`Panel ${input.panelId}: dialogue audio URL invalid`)

    const dialoguePath = path.join(tempDir, `panel_${input.panelId}_dialogue.wav`)
    await downloadFile(dialogueUrl, dialoguePath)

    logger.info({ message: `Merging panel ${input.panelId} with dialogue only` })
    runFfmpeg([
      '-y',
      '-i', videoPath,
      '-i', dialoguePath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-map', '0:v',
      '-map', '1:a',
      '-shortest',
      outputPath,
    ], 300_000)
  } else if (useNarration) {
    const narrationLine = getFirstAudioLine(narrationLines, input.panelId, 'narration')
    const narrationUrl = await resolveUrl(narrationLine.audioUrl)
    if (!narrationUrl) throw new Error(`Panel ${input.panelId}: narration audio URL invalid`)

    const narrationPath = path.join(tempDir, `panel_${input.panelId}_narration.wav`)
    await downloadFile(narrationUrl, narrationPath)

    logger.info({ message: `Merging panel ${input.panelId} with narration only` })
    runFfmpeg([
      '-y',
      '-i', videoPath,
      '-i', narrationPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-map', '0:v',
      '-map', '1:a',
      '-shortest',
      outputPath,
    ], 300_000)
  } else {
    logger.info({ message: `Merging panel ${input.panelId} with silent audio` })
    runFfmpeg([
      '-y',
      '-i', videoPath,
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ], 300_000)
  }

  const durationS = getMediaDuration(outputPath)
  return { panelId: input.panelId, tempPath: outputPath, durationS }
}

export async function concatAll(panelPaths: string[], tempDir: string): Promise<ConcatResult> {
  if (panelPaths.length === 0) {
    throw new Error('No panel paths to concatenate')
  }

  if (panelPaths.length === 1) {
    return { tempPath: panelPaths[0], durationS: getMediaDuration(panelPaths[0]) }
  }

  const videoCodecs = panelPaths.map((panelPath) => getVideoCodec(panelPath))
  const audioCodecs = panelPaths.map((panelPath) => getAudioCodec(panelPath))
  const allVideoSame = videoCodecs.every((codec) => codec === videoCodecs[0])
  const allAudioSame = audioCodecs.every((codec) => codec === audioCodecs[0])
  const canCopy = allVideoSame && allAudioSame

  const listPath = path.join(tempDir, 'concat_list.txt')
  const listContent = panelPaths
    .map((panelPath) => `file '${path.resolve(panelPath).replace(/\\/g, '/')}'`)
    .join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  const outputPath = path.join(tempDir, 'final_video.mp4')

  try {
    if (canCopy) {
      logger.info({ message: 'Concat using -c copy (uniform codecs)' })
      runFfmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        outputPath,
      ], 600_000)
    } else {
      logger.info({ message: 'Concat with re-encode (mixed codecs)' })
      runFfmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputPath,
      ], 600_000)
    }
  } finally {
    try {
      fs.unlinkSync(listPath)
    } catch {
      // Ignore cleanup failures for temp metadata files.
    }
  }

  const durationS = getMediaDuration(outputPath)
  return { tempPath: outputPath, durationS }
}
