/**
 * Smart Chunking — gom các Panel thành Chunk 7-10s để render qua LTX Director.
 *
 * Mỗi Chunk là 1 lần gọi ComfyUI. Video đầu ra của mỗi Chunk được cắt
 * ngược (reverse slicing) về từng panel riêng để UI hiển thị bình thường.
 */

export interface PanelForChunking {
  panelId: string
  imageUrl: string
  prompt: string
  /** Thời lượng panel — từ TTS (thoại) hoặc mặc định (câm = 3s, B-roll = 2.5s) */
  durationSeconds: number
  /** URL file TTS nếu panel có thoại */
  audioUrl?: string
  audioDurationSeconds?: number
  /** true nếu đây là panel B-roll dạng [...] — ưu tiên dùng làm điểm cắt chunk */
  isBRoll?: boolean
}

export interface Chunk {
  panels: PanelForChunking[]
  totalDurationSeconds: number
}

const CHUNK_MAX_DURATION = 10

export function chunkPanels(
  panels: PanelForChunking[],
  maxChunkDuration: number = CHUNK_MAX_DURATION
): Chunk[] {
  const chunks: Chunk[] = []
  let currentPanels: PanelForChunking[] = []
  let currentDuration = 0

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    const panelDuration = panel.durationSeconds

    if (currentDuration + panelDuration > maxChunkDuration && currentPanels.length > 0) {
      const cutIdx = findBestCutPoint(currentPanels)
      if (cutIdx > 0) {
        const rolledBack: PanelForChunking[] = []
        for (let j = cutIdx; j < currentPanels.length; j++) {
          rolledBack.push(currentPanels[j])
          currentDuration -= currentPanels[j].durationSeconds
        }
        const kept = currentPanels.slice(0, cutIdx)
        chunks.push({
          panels: kept,
          totalDurationSeconds: kept.reduce((s, p) => s + p.durationSeconds, 0),
        })
        currentPanels = [panel, ...rolledBack]
        currentDuration = panel.durationSeconds + rolledBack.reduce((s, p) => s + p.durationSeconds, 0)
      } else {
        chunks.push({
          panels: currentPanels,
          totalDurationSeconds: currentDuration,
        })
        currentPanels = [panel]
        currentDuration = panelDuration
      }
    } else {
      currentPanels.push(panel)
      currentDuration += panelDuration
    }
  }

  if (currentPanels.length > 0) {
    chunks.push({
      panels: currentPanels,
      totalDurationSeconds: currentDuration,
    })
  }

  return chunks
}

/**
 * Tìm điểm cắt tốt nhất trong currentPanels: ưu tiên cắt tại B-roll [...].
 * Nếu không có B-roll, cắt sau panel có audio (panel thoại) gần nhất với maxDuration.
 * Fallback: cắt ở panel [0] (tức giữ nguyên chunk cũ, không rollback).
 */
function findBestCutPoint(panels: PanelForChunking[]): number {
  for (let i = panels.length - 1; i >= 0; i--) {
    if (panels[i].isBRoll) {
      return i + 1
    }
  }

  for (let i = panels.length - 1; i >= 1; i--) {
    if (panels[i].audioUrl) {
      return i + 1
    }
  }

  return 0
}
