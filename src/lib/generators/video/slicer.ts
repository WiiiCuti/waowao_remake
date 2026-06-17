/**
 * Reverse Slicing — Cắt ngược video chunk thành từng panel video nhỏ.
 *
 * Sau khi LTX Director render xong 1 Chunk (video 7-10s liền mạch),
 * dùng FFmpeg để cắt ngược thành N video nhỏ, mỗi video tương ứng với 1 panel.
 * Upload từng video nhỏ lên storage và trả về URL mapping.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { uploadObject } from '@/lib/storage'
import { PanelForChunking } from './chunking'

export interface SliceResult {
  panelId: string
  videoUrl: string
}

const SLICE_TAG = '[LTX Slicer]'

function ensureFfmpeg(): void {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    throw new Error(`${SLICE_TAG} ffmpeg is required but not installed`)
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LTXSlicer/1.0)' },
  })
  if (!response.ok) {
    throw new Error(`${SLICE_TAG} Failed to download ${url}: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
  console.log(`${SLICE_TAG} downloaded ${Math.round(buffer.length / 1024)} KB to ${destPath}`)
}

export async function sliceVideoByPanels(
  chunkVideoUrl: string,
  panels: PanelForChunking[],
  options?: {
    fps?: number
    /** Prefix for storage keys, e.g. "video/ltx/scene_1" */
    storageKeyPrefix?: string
  }
): Promise<SliceResult[]> {
  ensureFfmpeg()

  const fps = options?.fps || 24
  const prefix = options?.storageKeyPrefix || 'video/ltx/sliced'
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltx-slice-'))
  const chunkFile = path.join(tempDir, 'chunk.mp4')

  try {
    await downloadFile(chunkVideoUrl, chunkFile)
    console.log(`${SLICE_TAG} slicing ${panels.length} panels from chunk, fps=${fps}`)

    const results: SliceResult[] = []

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]
      const startSec = i === 0
        ? 0
        : panels.slice(0, i).reduce((s, p) => s + p.durationSeconds, 0)
      const durationSec = panel.durationSeconds
      const sliceFile = path.join(tempDir, `panel_${panel.panelId}.mp4`)
      const storageKey = `${prefix}/${panel.panelId}_${Date.now()}.mp4`

      try {
        execFileSync('ffmpeg', [
          '-ss', startSec.toFixed(3),
          '-i', chunkFile,
          '-t', durationSec.toFixed(3),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-y',
          sliceFile,
        ], {
          stdio: 'pipe',
          timeout: 30_000,
        })
      } catch {
        console.log(`${SLICE_TAG} -c copy failed for panel ${panel.panelId}, falling back to re-encode`)
        execFileSync('ffmpeg', [
          '-ss', startSec.toFixed(3),
          '-i', chunkFile,
          '-t', durationSec.toFixed(3),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '18',
          '-c:a', 'aac',
          '-y',
          sliceFile,
        ], {
          stdio: 'pipe',
          timeout: 60_000,
        })
      }

      const sliceBuffer = fs.readFileSync(sliceFile)
      const storageUrl = await uploadObject(sliceBuffer, storageKey, 3, 'video/mp4')

      console.log(`${SLICE_TAG} panel ${panel.panelId}: ${startSec.toFixed(2)}s + ${durationSec.toFixed(2)}s → ${storageKey} (${Math.round(sliceBuffer.length / 1024)} KB)`)

      results.push({
        panelId: panel.panelId,
        videoUrl: storageUrl,
      })

      fs.unlinkSync(sliceFile)
    }

    return results
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
