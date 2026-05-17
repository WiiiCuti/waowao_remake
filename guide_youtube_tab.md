# Guide: YouTube Stage — Merge Video + Upload

## Mục Đích

Xây stage "YouTube" mới (top-level stage, cùng hàng với Story / Script / Storyboard / VideoAI / Editor / Voice — đứng cuối).

Khi vào stage này, user thấy:
- Danh sách panel + voice lines của episode hiện tại
- Nút "Merge & Export": merge từng panel (videoUrl + voice/narration) → concat → 1 file MP4
- (Sprint 2) Nút "Upload YouTube": upload MP4 lên YouTube Shorts

## Luồng Xử Lý

```
Panel X:
  videoUrl ───┐  (COS key → signed URL trước khi FFmpeg download)
              ├── merge → panel_X_merged.mp4
  voice audio ┘  (dialogue + narration theo narrator toggle)

Panel 1 → Panel 2 → ... → Panel N
         ↓ concat (FFmpeg concat demuxer, fallback re-encode)
    final_video.mp4
         ↓ upload COS (uploadObject từ buffer)
    cosKey lưu DB
         ↓ (Sprint 2: YouTube Data API v3)
    YouTube Shorts
```

## Xử Lý Audio Per Panel

| narratorEnabled | Có voice dialogue | Có narration | Output audio |
|:---------------:|:-----------------:|:------------:|-------------|
| ON | ✅ | ✅ | voice dialogue + narration concat |
| ON | ❌ | ✅ | narration |
| ON | ✅ | ❌ | voice dialogue |
| OFF | ✅ | ✅ | **chỉ** voice dialogue |
| OFF | ❌ | ✅ | silent (video giữ nguyên — thay audio = silent track) |
| OFF | ✅ | ❌ | voice dialogue |

Lưu ý: **silent** = video gốc có thể có audio AI riêng (ambient, nhạc nền tuỳ model sinh video), ta thay bằng silent track để giữ đúng timeline.

**Duration** mỗi panel đã được `calculatePanelVideoDuration` tính đúng.

**Narrator ON** (concat dialogue + narration): Hai audio có duration khác nhau. Dùng FFmpeg `adelay` để đặt narration sau khi dialogue kết thúc, rồi `amix` thành 1 track:

```bash
# voiceDurMs = dialogue audioDuration, narrationDurMs = narration audioDuration
# QUAN TRỌNG: dùng duration=longest, không phải first
# duration=first cắt output ngay khi dialogue kết thúc → narration không được nghe
# Không dùng -c:v copy vì video có thể ngắn hơn audio đã delay → re-encode
ffmpeg -i video.mp4 -i dialogue.wav -i narration.wav \
  -filter_complex \
    "[1:a]adelay=0|0[voice];
     [2:a]adelay=VoiceDurMs|VoiceDurMs[narr];
     [voice][narr]amix=inputs=2:duration=longest[out]" \
  -map 0:v -map "[out]" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  panel_out.mp4
```

**Cẩn thận**: `adelay` cần 2 giá trị (L channel | R channel) cho stereo, hoặc `adelay=VoiceDurMs` cho mono.

---

## Tổng Quan File Tác Động

### FILE MỚI (9)

| File | Sprint | Vai trò |
|------|--------|---------|
| `src/lib/video-compositor/types.ts` | 1 | Interface dữ liệu |
| `src/lib/video-compositor/compositor.ts` | 1 | Core FFmpeg merge + concat |
| `src/lib/video-compositor/index.ts` | 1 | Public API export |
| `src/app/api/novel-promotion/[projectId]/youtube/merge/route.ts` | 1 | POST start merge task |
| `src/app/api/novel-promotion/[projectId]/youtube/merge/[taskId]/status/route.ts` | 1 | GET poll progress |
| `src/app/api/novel-promotion/[projectId]/youtube/upload/route.ts` | 2 | POST upload YouTube |
| `src/app/api/auth/youtube/route.ts` | 2 | Redirect Google OAuth |
| `src/app/api/auth/youtube/callback/route.ts` | 2 | OAuth callback, save token |
| `src/features/novel-promotion/youtube/YouTubeStage.tsx` | 1 | UI stage chính |

### FILE SỬA (5)

| File | Sửa | Sprint |
|------|-----|--------|
| `src/lib/task/types.ts` | +1 dòng `MERGE_VIDEO` | 1 |
| `src/lib/task/queues.ts` | +1 dòng vào VIDEO_TYPES | 1 |
| `src/lib/workers/video.worker.ts` | +handler + case trong switch | 1 |
| `src/app/[...]/components/WorkspaceStageContent.tsx` | +1 dòng `{youtube && <YouTubeStage/>}` | 1 |
| `src/app/[...]/hooks/useWorkspaceStageNavigation.ts` | +3 dòng nav item | 1 |

Các file sửa nằm tại:
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts`

### DB SCHEMA (Sprint 2)

Cần thêm model lưu YouTube token:

```prisma
model AccountYoutubeToken {
  id           String   @id @default(uuid())
  userId       String   @unique
  refreshToken String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt

  @@map("account_youtube_tokens")
}
```

Sau khi thêm, chạy:
```bash
npx prisma db push
```

---

## Hướng Dẫn Tạo Từng File

### 1. `src/lib/video-compositor/types.ts`

```typescript
export interface PanelVoiceLineInput {
  audioUrl: string | null
  audioDuration: number | null  // ms
  isNarration: boolean
}

export interface PanelMergeInput {
  panelId: string
  videoUrl: string            // COS key — compositor sẽ gọi toSignedUrlIfCos()
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
```

### 2. `src/lib/video-compositor/compositor.ts` — Core FFmpeg

```typescript
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getSignedUrl } from '@/lib/storage'

/**
 * Convert COS key sang signed URL có thể fetch được.
 * Không dùng toSignedUrlIfCos() vì hàm đó chỉ nhận prefix images/|voice/|video/,
 * nhưng key video thực tế dạng "panel-video-xxx/yyy.mp4" không match prefix nào.
 */
function resolveUrl(keyOrUrl: string | null): string | null {
  if (!keyOrUrl) return null
  if (keyOrUrl.startsWith('http')) return keyOrUrl
  return getSignedUrl(keyOrUrl, 7200)
}

function ensureFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' })
  } catch {
    throw new Error('FFMPEG_NOT_FOUND: ffmpeg is required but not installed')
  }
}
```

**mergePanel(input: PanelMergeInput, narratorEnabled: boolean, tempDir: string): Promise\<PanelMergeResult\>**

1. Convert COS keys → signed URLs: `resolveUrl(input.videoUrl)` và `resolveUrl(vl.audioUrl)` cho mỗi voice line
2. Download video từ signed URL → temp file: `fetch(url)` → `fs.writeFileSync`
3. Download voice audio files → temp (dùng `resolveUrl` để lấy signed URL trước khi fetch)
4. Xây command FFmpeg:
   - **narrator OFF + có dialogue**: `ffmpeg -i video.mp4 -i dialogue.wav -c:v copy -c:a aac -map 0:v -map 1:a out.mp4`
   - **narrator OFF + không dialogue**: tạo silent audio track cùng duration → `ffmpeg -i video.mp4 -f lavfi -i anullsrc=r=44100:cl=stereo -c:v copy -c:a aac -shortest out.mp4`
   - **narrator ON + dialogue + narration**: dùng filter_complex `adelay` + `amix`
   - **narrator ON + chỉ narration**: `ffmpeg -i video.mp4 -i narration.wav -c:v copy -c:a aac -map 0:v -map 1:a out.mp4`
   - **narrator ON + chỉ dialogue**: `ffmpeg -i video.mp4 -i dialogue.wav -c:v copy -c:a aac -map 0:v -map 1:a out.mp4`
5. Trả về `PanelMergeResult`

**concatAll(panelPaths: string[], tempDir: string): Promise\<ConcatResult\>**

1. Nếu `panelPaths.length === 1` → return luôn (không cần concat):
   ```typescript
   if (panelPaths.length === 1) {
     return { tempPath: panelPaths[0], durationS: 0 }
   }
   ```
2. Kiểm tra codec đồng nhất (dùng `ffprobe`):
```typescript
function getVideoCodec(filePath: string): string | null {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return output.trim() || null
  } catch {
    return null
  }
}

function getAudioCodec(filePath: string): string | null {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return output.trim() || null
  } catch {
    return null
  }
}
```
   - Nếu tất cả panel có codec giống nhau → concat demuxer `-c copy` (nhanh)
   - Nếu khác → re-encode `-c:v libx264 -c:a aac` (chậm nhưng an toàn)
3. Tạo file concat list (dùng `path.resolve` để cross-platform Windows/Linux):
   ```
   file 'C:\temp\panel_1.mp4'
   file 'C:\temp\panel_2.mp4'
   ```
4. Chạy FFmpeg concat
5. Xoá concat list file
6. Trả về `ConcatResult` (không upload — upload ở worker)

### 3. `src/lib/video-compositor/index.ts`

```typescript
export { mergePanel, concatAll, ensureFfmpeg } from './compositor'
export type {
  PanelMergeInput, PanelMergeResult, PanelVoiceLineInput,
  ConcatResult, CompositorProgress,
} from './types'
```

### 4. `src/app/api/novel-promotion/[projectId]/youtube/merge/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const { episodeId, narratorEnabled } = body

  if (!episodeId || typeof episodeId !== 'string') {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }
  if (typeof narratorEnabled !== 'boolean') {
    throw new ApiError('INVALID_PARAMS', { message: 'narratorEnabled must be a boolean' })
  }

  const locale = resolveRequiredTaskLocale(request, body)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId,
    type: TASK_TYPE.MERGE_VIDEO,
    targetType: 'NovelPromotionEpisode',
    targetId: episodeId,
    payload: { narratorEnabled },
  })

  return NextResponse.json(result)
})
```

### 5. `src/app/api/novel-promotion/[projectId]/youtube/merge/[taskId]/status/route.ts`

- `GET` params: `taskId`
- Pattern: `apiHandler` + `requireProjectAuthLight`
- Query task status từ DB: `getTaskById(taskId)` từ `@/lib/task/service`
- Trả về:
```json
{
  "status": "queued" | "processing" | "completed" | "failed",
  "progress": { "percent": 45, "stage": "merge_panel", "currentPanel": 3, "totalPanels": 8 },
  "result": { "cosUrl": "..." }  // chỉ khi completed — là signed URL
}
```

### 6. `src/app/api/novel-promotion/[projectId]/youtube/upload/route.ts` (Sprint 2)

- `POST` body: `{ episodeId, title, description, tags, privacyStatus }`
- Lấy `refresh_token` từ `AccountYoutubeToken` theo userId
- `googleapis` → `youtube.videos.insert({ media, requestBody })`
- Trả về `{ youtubeVideoId, youtubeUrl }`

### 7. `src/app/api/auth/youtube/route.ts` (Sprint 2)

- `GET` redirect đến Google OAuth
- Dùng `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` từ env
- Redirect URI dùng `process.env.INTERNAL_APP_URL || 'http://localhost:3000'` + `/api/auth/youtube/callback`
- Scope: `https://www.googleapis.com/auth/youtube.upload`

### 8. `src/app/api/auth/youtube/callback/route.ts` (Sprint 2)

- `GET` nhận `code` từ query
- Exchange code lấy `access_token` + `refresh_token`
- Lưu vào `AccountYoutubeToken` (upsert theo userId)
- Redirect về `?stage=youtube`

### 9. `src/features/novel-promotion/youtube/YouTubeStage.tsx`

- Khi mount: fetch episode panels + voice lines từ API (dùng `useEpisodeData`)
- Hiển thị danh sách panel: index, description, video status (có `videoUrl` không), voice status (có voice lines không)
- **Nút "Merge & Export"**:
  - Gọi `POST /youtube/merge` với `{ episodeId, narratorEnabled }` → nhận `taskId`
  - Poll `GET /youtube/merge/{taskId}/status` mỗi 2s
  - Progress bar: "Merging panel 3/8...", "Concatenating...", "Uploading..."
  - Khi xong: hiển thị signed URL để preview / download
  - Khi lỗi: hiển thị error message + nút retry
- **(Sprint 2)** YouTube login button + upload form
- Layout theo style glass-surface của dự án

### 10-14. Các file sửa

**`src/lib/task/types.ts`**:
```typescript
MERGE_VIDEO: 'merge_video',
```

**`src/lib/task/queues.ts`**:
```typescript
const VIDEO_TYPES = new Set<TaskType>([
  TASK_TYPE.VIDEO_PANEL,
  TASK_TYPE.LIP_SYNC,
  TASK_TYPE.MERGE_VIDEO,
])
```

**`src/lib/workers/video.worker.ts`**:

Thêm import:
```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'
import { mergePanel, concatAll, ensureFfmpeg } from '@/lib/video-compositor'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
```

Handler:
```typescript
async function handleMergeVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const episodeId = job.data.episodeId
  if (!episodeId) throw new Error('MERGE_VIDEO task missing episodeId')

  const narratorEnabled = payload.narratorEnabled as boolean
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waoowaoo-merge-'))

  try {
    ensureFfmpeg()
    await reportTaskProgress(job, 5, { stage: 'merge_start', episodeId })

    // Lấy tất cả panel của episode, sắp xếp theo storyboard → panelIndex
    const panels = await prisma.novelPromotionPanel.findMany({
      where: { storyboard: { episodeId } },
      orderBy: [{ storyboard: { createdAt: 'asc' } }, { panelIndex: 'asc' }],
      include: {
        matchedVoiceLines: {
          select: { audioUrl: true, audioDuration: true, isNarration: true },
          orderBy: { lineIndex: 'asc' },
        },
      },
    })

    if (panels.length === 0) throw new Error('No panels found for episode')

    // Merge từng panel — skip panel không có videoUrl
    const mergedPaths: string[] = []
    let skippedCount = 0

    for (let i = 0; i < panels.length; i++) {
      const p = panels[i]
      if (!p.videoUrl) {
        skippedCount++
        continue
      }

      await reportTaskProgress(job, 10 + Math.round(((i - skippedCount) / (panels.length - skippedCount || 1)) * 80), {
        stage: 'merge_panel',
        current: i + 1 - skippedCount,
        total: panels.length - skippedCount,
        panelId: p.id,
      })

      // Compositor sẽ tự resolve COS key → signed URL qua resolveUrl()
      // Worker chỉ truyền raw COS key, không cần toSignedUrlIfCos ở đây
      const result = await mergePanel(
        {
          panelId: p.id,
          videoUrl: p.videoUrl,
          voiceLines: p.matchedVoiceLines.map(vl => ({
            audioUrl: vl.audioUrl,
            audioDuration: vl.audioDuration,
            isNarration: vl.isNarration,
          })),
        },
        narratorEnabled,
        tempDir,
      )

      mergedPaths.push(result.tempPath)
    }

    if (mergedPaths.length === 0) {
      throw new Error('No panels with videoUrl to merge')
    }

    // Concat tất cả
    await reportTaskProgress(job, 92, { stage: 'concat' })
    const final = await concatAll(mergedPaths, tempDir)

    // Upload lên COS — dùng uploadObject(buffer) vì local path không fetch được
    await reportTaskProgress(job, 96, { stage: 'uploading' })
    const buffer = fs.readFileSync(final.tempPath)
    const key = generateUniqueKey(`youtube-merge-${episodeId}`, 'mp4')
    const cosKey = await uploadObject(buffer, key, 1, 'video/mp4')

    await reportTaskProgress(job, 100, { stage: 'complete' })
    return { cosKey, videoUrl: cosKey }
  } finally {
    // Cleanup: xóa toàn bộ temp files kể cả khi crash
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
```

Thêm case trong `processVideoTask`:
```typescript
case TASK_TYPE.MERGE_VIDEO:
  return await handleMergeVideoTask(job)
```

**`WorkspaceStageContent.tsx`**:
```tsx
import YouTubeStage from '@/features/novel-promotion/youtube/YouTubeStage'

// Thêm sau voice stage (có thể trong cùng file bạn đã có VoiceStageRoute)
{currentStage === 'youtube' && <YouTubeStage />}
```

**`useWorkspaceStageNavigation.ts`**:
```typescript
// Thêm vào getStageStatus:
case 'youtube':
  return stageArtifacts.hasVideo ? 'ready' : 'empty'

// Thêm vào return array (đứng cuối, sau editor):
{ id: 'youtube', icon: 'Y', label: 'YouTube', status: getStageStatus('youtube') },
```

---

## Sprint 1 — YouTube Stage + Merge

```bash
npm install fluent-ffmpeg
npm install -D @types/fluent-ffmpeg
```

Các bước:
1. Tạo `src/lib/video-compositor/types.ts`
2. Tạo `src/lib/video-compositor/compositor.ts` — mergePanel() + concatAll() + ensureFfmpeg()
3. Tạo `src/lib/video-compositor/index.ts`
4. Sửa `types.ts` + `queues.ts` + `video.worker.ts`
5. Tạo API `/youtube/merge` + `/youtube/merge/{taskId}/status`
6. Tạo `YouTubeStage.tsx`
7. Sửa `WorkspaceStageContent.tsx` + `useWorkspaceStageNavigation.ts`
8. Test: mở stage YouTube → click Merge → xem progress → download

## Sprint 2 — YouTube Upload

```bash
npm install googleapis
```

1. Google Cloud Console → OAuth Client ID (Web application)
2. Thêm `.env`:
   ```
   GOOGLE_CLIENT_ID=xxx
   GOOGLE_CLIENT_SECRET=xxx
   ```
3. Thêm model `AccountYoutubeToken` vào schema → `npx prisma db push`
4. Tạo `src/lib/youtube/` — auth.ts + upload.ts + types.ts
5. Tạo API auth routes (redirect + callback)
6. Thêm YouTube login button + upload form vào `YouTubeStage.tsx`
7. Test upload video Shorts

## Sprint 3 — Polish

1. Lịch sử upload trong tab
2. Error handling (quota, network, auth expired, FFmpeg crash)
3. Transition giữa panel (optional, dùng FFmpeg xfade)

## Phụ Thuộc

```bash
npm install fluent-ffmpeg googleapis
npm install -D @types/fluent-ffmpeg
```

FFmpeg binary:
- Windows: `scoop install ffmpeg` hoặc `winget install ffmpeg`
- Docker: `apk add ffmpeg`

## Rủi Ro & Mitigation

| Rủi ro | Giải pháp |
|--------|-----------|
| YouTube quota (~6 video/ngày free) | Cảnh báo UI trước upload |
| OAuth token hết hạn | Refresh token tự động |
| Merge lâu (>10 panel) | Worker async + progress polling 2s |
| FFmpeg chưa cài | `ensureFfmpeg()` kiểm tra đầu, báo lỗi rõ |
| Codec MP4 không đồng nhất | concat thử `-c copy`, fallback re-encode |
| Audio sync lệch | `adelay` + `amix` giữ đúng timeline |
| Worker crash giữa chừng | `try/finally` + `fs.rmSync(tempDir, { force: true })` |
| Panel không audio | Thêm silent audio track |
| Panel không videoUrl | Bỏ qua panel, báo warning UI |
| COS key không fetch được | `resolveUrl()` trong compositor dùng `getSignedUrl` generic |
| `uploadVideoSourceToCos` với local path | Dùng `uploadObject(buffer)` thay thế |
