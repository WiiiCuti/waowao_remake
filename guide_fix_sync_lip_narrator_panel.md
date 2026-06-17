# Guide: Fix Audio-Video Sync — Lip Sync & Narrator Panel Duration

## Mục Đích

Tài liệu này ghi nhận toàn bộ phân tích, quyết định và kế hoạch triển khai cho việc đồng bộ hóa thời lượng giữa audio (voice, narration) và video trong hệ thống AI Video Studio (waoowaoo).

Vấn đề gốc được ghi nhận trong `fix-audio-video-sync.md`. Tài liệu này mở rộng để xử lý các xung đột về luật ưu tiên giữa lip sync, voice dialogue, và narration.

---

## Vấn Đề

Khi render video cuối cùng, âm thanh và video không khớp thời lượng do:

1. **Không có luật ưu tiên rõ ràng** giữa lip sync, voice dialogue, narration
2. **Heuristic đoán đơn vị duration** (ms vs seconds) trong `toDurationMs()`
3. **FPS không đồng nhất**: Editor 30fps, Video Generator 24fps
4. **Remotion không giới hạn Video/Audio** theo Sequence duration
5. **Lip sync pad/trim cứng** (min 2s) gây lệch
6. **WAV duration fallback sai công thức** (giả định 128kbps)

---

## Luật Tính Duration Đã Thống Nhất

### Ma Trận Quyết Định

| # | Lip Sync | Voice (non-narration) | Narration | Narrator ON | Kết quả |
|---|----------|----------------------|-----------|-------------|---------|
| 1 | ✅ | ✅ | ✅ | Có/Không | **Voice + Narration** (concat) |
| 2 | ✅ | ✅ | ❌ | Có/Không | **Voice** |
| 3 | ❌ | ✅ | Có/Không | Có/Không | **Voice** |
| 4 | ❌ | ❌ | ✅ | ✅ | **Narration** |
| 5 | ❌ | ❌ | ✅ | ❌ | **Narration** |
| 6 | ❌ | ❌ | ❌ | Có/Không | **Storyboard duration** (fallback) |

### Luật Chi Tiết

```
Rule 1: Lip sync ON + có voice + có narration
  → voiceDur + narrationDur (concat, tương lai cắt thành 2 phân đoạn riêng)

Rule 2: Lip sync ON + có voice + không narration
  → voiceDur

Rule 3: Lip sync OFF + có voice (dù narration có hay không)
  → voiceDur (dialogue quyết định timing)

Rule 4: Lip sync OFF + không voice + có narration
  → narrationDur

Rule 5: Không voice + không narration
  → panel.duration từ storyboard (LLM guess) || 3s
```

### Giải Thích Xung Đột Đã Giải Quyết

| Xung đột | Giải pháp |
|----------|-----------|
| Lip sync ON + Narrator ON → dùng cái nào? | **Concat**: voice + narration thành 1 audio hoàn chỉnh |
| Lip sync OFF + Voice ✅ + Narrator ON → voice hay narration? | **Voice** thắng, dialogue có natural timing riêng |
| `narratorEnabled` flag có ảnh hưởng duration không? | **Không**. Flag chỉ quyết định có TẠO narration hay không, không ảnh hưởng duration sau khi đã có audio |
| Panel có nhiều voice lines? | Dùng `.find()` lấy cái đầu tiên (cần cải tiến sau: sum hoặc longest) |

---

## Kiến Trúc Xử Lý Concat (Lip Sync + Narration)

Khi lip sync ON và có narration, video sẽ là concat của 2 phân đoạn:

```
Phân đoạn 1: Lip sync video (nhân vật nói, khớp môi)
Phân đoạn 2: Video tĩnh hoặc tiếp diễn (narration đè lên)

Tổng duration = voiceDur + narrationDur
```

*Lưu ý: Implement concat chi tiết (cắt thành 2 phần riêng để gen) sẽ được xử lý trong tương lai. Hiện tại chỉ tính tổng duration.*

---

## Các File Ảnh Hưởng

### Core Logic — File Mới

| File | Mục đích |
|------|----------|
| `src/lib/duration/panel-duration.ts` | Hàm `calculatePanelVideoDuration()` centralize luật tính duration |

### Video Generation

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/lib/workers/video.worker.ts` | 28-31 | **Xóa** `toDurationMs()` | Loại bỏ heuristic đoán ms vs sec |
| `src/lib/workers/video.worker.ts` | ~153 | Gọi `calculatePanelVideoDuration()` | Video gen dùng audio duration, không từ storyboard |
| `src/lib/workers/video.worker.ts` | ~271 | `videoDurationMs` từ `calculatePanelVideoDuration() * 1000` | Lip sync dùng duration chính xác |

### Voice Worker

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/lib/workers/voice.worker.ts` | ~38 | Sau TTS thành công, cập nhật `panel.duration` | Audio duration → panel duration ngay sau khi gen voice |

### FPS Chuẩn Hóa (30 → 24)

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/features/video-editor/utils/time-utils.ts` | 11 | `DEFAULT_FPS = 30` → `24` | Thống nhất FPS toàn hệ thống |
| `src/features/video-editor/hooks/useEditorActions.ts` | 43 | `* 30` → `* 24` | Clip duration tại 24fps |
| `src/features/video-editor/hooks/useEditorActions.ts` | 57 | `durationInFrames: 15` → `12` | Transition 0.5s × 24 |
| `src/features/video-editor/remotion/transitions/index.tsx` | Nhiều | Hardcode 15 → 12 | Transition duration khớp 24fps |

### Editor Integration

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/features/video-editor/hooks/useEditorActions.ts` | ~30 | Check cả narration cho clip audio | Narration có clip audio để tính timeline đúng |

### Lip-Sync Preprocessing

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/lib/lipsync/preprocess.ts` | 7 | Giảm/bỏ `LIPSYNC_MIN_AUDIO_DURATION_MS` | Không pad cứng 2s nếu duration đã khớp |
| `src/lib/lipsync/preprocess.ts` | 150-184 | Chỉ pad khi audio < video | Bỏ pad không cần thiết |
| `src/lib/lipsync/preprocess.ts` | 186-218 | Chỉ trim khi audio > video > 100ms | Bỏ trim không cần thiết |
| `src/lib/lipsync/preprocess.ts` | ~383 | Nếu `|audioMs - videoMs| < 100` → bỏ pad/trim | Truyền thẳng khi gần khớp |

### Remotion Rendering

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/features/video-editor/remotion/VideoComposition.tsx` | ~27 | Thêm `endAt={clip.durationInFrames}` cho `<Video>` | Video không chạy quá duration |
| `src/features/video-editor/remotion/VideoComposition.tsx` | ~52 | Thêm `endAt` cho `<Audio>` BGM | Audio không chạy quá Sequence |
| `src/features/video-editor/remotion/VideoComposition.tsx` | ~82-85 | `endAt` cho attachment audio | Audio dialogue/narration cắt đúng |

### WAV Duration Fallback

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/lib/voice/generate-voice-line.ts` | 35-66 | Fallback parse `byteRate` từ `fmt ` chunk thay vì 128kbps | Loại bỏ sai số 3x |

### DB Schema

| File | Thay đổi | Mục đích |
|------|----------|----------|
| `prisma/schema.prisma` | **Không cần thay đổi** | Các field `duration`, `audioDuration`, `isNarration` đã có sẵn |

### UI State (Toggle Lip Sync)

| File | Dòng | Thay đổi | Mục đích |
|------|------|----------|----------|
| `src/lib/novel-promotion/stages/video-stage-runtime/useVideoStageUiState.ts` | ~14 | Khi toggle lip sync, gọi cập nhật `panel.duration` | Duration thay đổi khi bật/tắt lip sync |
| `src/lib/novel-promotion/stages/video-stage-runtime-core.tsx` | ~309 | Mutation cập nhật `panel.duration` trong `toggleLipSyncVideo` | Đồng bộ UI với duration mới |

### Tests

| File | Mục đích |
|------|----------|
| **Mới:** `tests/unit/duration/panel-duration.test.ts` | Test tất cả case của `calculatePanelVideoDuration()` |
| `tests/unit/worker/video-worker.test.ts` | Cập nhật expected behavior sau khi xóa `toDurationMs` |
| `tests/unit/lipsync-preprocess.test.ts` | Cập nhật expected behavior khi bỏ pad/trim cứng |
| `tests/unit/lipsync-bailian.test.ts` | Cập nhật videoDurationMs từ nguồn mới |
| `tests/unit/voice/generate-voice-line.test.ts` | Cập nhật expected WAV duration fallback |
| `tests/unit/providers/bailian-tts.test.ts` | Cập nhật expected audioDuration |
| `tests/system/voice-generate.system.test.ts` | Cập nhật kỳ vọng sau khi voice worker update panel.duration |
| `tests/integration/chain/video.chain.test.ts` | Cập nhật integration test |

---

## Dependency Graph

```
Phase 1 (Core Logic: panel-duration.ts)
  ├─→ Phase 2 (FPS 30→24) — độc lập
  ├─→ Phase 3 (Video Worker: xóa toDurationMs) — phụ thuộc Phase 1
  ├─→ Phase 4 (Voice Worker: update panel.duration) — phụ thuộc Phase 1
  ├─→ Phase 5 (Editor: useEditorActions) — phụ thuộc Phase 1 + 2
  ├─→ Phase 6 (Lip-sync Preprocess) — phụ thuộc Phase 1
  ├─→ Phase 7 (Remotion: endAt) — phụ thuộc Phase 2
  ├─→ Phase 8 (WAV Fallback) — độc lập
  ├─→ Phase 9 (UI Toggle Lip Sync) — phụ thuộc Phase 1
  ├─→ Phase 10 (Schema) — không cần
  └─→ Phase 11 (Tests) — phụ thuộc tất cả
```

## Flow Mới

```
Voice TTS (voice.worker.ts)
  → audioDuration từ WAV header (CHÍNH XÁC)
  → calculatePanelVideoDuration() → panel.duration (seconds)
  → Update DB

Video Gen (video.worker.ts)
  → Đọc panel.duration đã được voice worker cập nhật
  → Hoặc gọi calculatePanelVideoDuration() nếu chưa kịp update
  → Clamp vào provider durationOptions
  → Gen video với duration = audio duration

Lip Sync (video.worker.ts)
  → videoDurationMs = panel.duration * 1000 (CHÍNH XÁC, không heuristic)
  → Nếu audioMs ≈ videoMs (< 100ms sai số) → bỏ pad/trim

Editor (Remotion)
  → durationInFrames = Math.round(panel.duration * 24)
  → Sequence durationInFrames, Video endAt, Audio endAt đều khớp
```

---

## Narrator Toggle GUI

### Yêu Cầu

Người dùng có thể bật/tắt narrator (lưu vào DB, giữa nguyên khi quay lại dự án). Khi narrator OFF:
- Voice analysis không tạo narrator lines
- Speaker dropdown ẩn "Narrator" option
- Duration calculation bỏ qua narration audio (coi như không có)
- Narration lines hiện có bị ẩn (hoặc đánh dấu disabled)

### Vị Trí Đặt

**Khuyến nghị: Đặt ở cả 2 chỗ, primary ở Voice tab, indicator ở Video tab**

| Tab | Loại | Lý do |
|-----|------|-------|
| **Voice tab** (VoiceToolbar) | **Toggle switch** (primary) | Nơi gen voice, nơi narrator lines được tạo. Toggle ở đây cho user kiểm soát ngay tại điểm quyết định "có tạo narrator hay không" |
| **Video tab** (VideoToolbar/VideoStageLayout) | **Indicator + nút tắt** (secondary) | Nơi user thấy duration bị ảnh hưởng bởi narrator. Cho phép tắt nhanh mà không cần quay lại Voice tab |

**Chi tiết vị trí:**
- **VoiceToolbar.tsx** — Thêm toggle vào toolbar, cạnh nút "Voice Analysis" / "Generate All"
- **VideoStageLayout.tsx** — Thêm indicator nhỏ ở header, có thể click để toggle nhanh

### DB Schema

```prisma
model NovelPromotionEpisode {
  // ... existing fields ...
  narratorEnabled      Boolean               @default(true)
  // ...
}
```

File: `prisma/schema.prisma` ~ dòng 134

### Các File Ảnh Hưởng (Narrator Toggle)

| File | Thay đổi | Mục đích |
|------|----------|----------|
| `prisma/schema.prisma` | Thêm `narratorEnabled Boolean @default(true)` trên `NovelPromotionEpisode` | Lưu trạng thái narrator |
| `src/lib/novel-promotion/stages/voice-stage-runtime/types.ts` | Thêm `narratorEnabled` vào props | Truyền state xuống UI |
| `src/app/.../voice/VoiceToolbar.tsx` | Thêm toggle switch | UI tắt/bật narrator ở Voice tab |
| `src/app/.../voice-stage/VoiceControlPanel.tsx` | Nhận `narratorEnabled` + `onToggleNarrator` props | Pass toggle từ runtime xuống toolbar |
| `src/lib/novel-promotion/stages/voice-stage-runtime-core.tsx` | Mutation toggle `narratorEnabled` trong DB | Cập nhật DB khi user toggle |
| `src/lib/workers/handlers/voice-analyze.ts` | Kiểm tra `narratorEnabled` trước khi tạo narrator lines | Không tạo narrator lines khi OFF |
| `src/lib/novel-promotion/stages/voice-stage-runtime/useVoiceLineCrudActions.ts` | Ẩn Narrator khỏi speaker options khi OFF | User không thể thêm narrator line thủ công |
| `src/app/.../voice/VoiceLineCard.tsx` | Ẩn narrator cards khi OFF | UI gọn, không hiển thị line vô dụng |
| `src/app/.../video-stage/VideoStageLayout.tsx` | Thêm narrator indicator ở header | User thấy trạng thái narrator ở Video tab |
| `src/app/.../video/VideoToolbar.tsx` | Thêm toggle mini hoặc nút tắt nhanh | Cho phép toggle narrator ngay từ Video tab |
| `src/lib/duration/panel-duration.ts` | `calculatePanelVideoDuration` nhận `narratorEnabled` param | Bỏ narration khỏi concat khi narrator OFF |

### Logic `calculatePanelVideoDuration` — Cập Nhật

Khi `narratorEnabled = false`, narration audio bị coi như không tồn tại:

```
Rule 1: Lip sync ON + voice + narration → narratorEnabled?
  YES → voiceDur + narrationDur (concat)
  NO  → voiceDur (bỏ narration)

Rule 4: Lip sync OFF + không voice + narration → narratorEnabled?
  YES → narrationDur
  NO  → storyboard fallback (bỏ narration)
```

Input mới:
```typescript
function calculatePanelVideoDuration(params: {
  hasLipSync: boolean
  narratorEnabled: boolean      // ← THÊM
  voiceLines: VoiceLine[]
  storyboardDuration: number
  providerDurationOptions: number[]
}): number
```

### Pipeline Flow Với Narrator Toggle

```
User tắt narrator
  → DB: episode.narratorEnabled = false
  → UI Voice tab: ẩn narrator lines, ẩn Narrator khỏi speaker dropdown
  → UI Video tab: indicator "Narrator: OFF"
  → Voice analysis: không tạo narrator lines
  → calculatePanelVideoDuration: bỏ narration khỏi duration
  → panel.duration = voiceDur (hoặc storyboard nếu không có voice)
```

### Migration

```sql
ALTER TABLE novel_promotion_episodes 
ADD COLUMN narrator_enabled BOOLEAN NOT NULL DEFAULT true;
```

Hoặc dùng Prisma migration:
```bash
npx prisma migrate dev --name add_narrator_enabled
```

## Ghi Chép Rủi Ro

| Rủi ro | Mức | Giảm thiểu |
|---------|-----|------------|
| Video gen chạy trước voice TTS → duration chưa chính xác | Cao | Chấp nhận tạm, cần chuyển pipeline sau |
| Concat lip sync + narration chưa implement tách đoạn | TB | Tạm tính tổng duration, xử lý sau |
| Provider không hỗ trợ duration tùy ý | TB | Clamp vào durationOptions gần nhất |
| Panel.duration null → fallback 3s | Thấp | Chấp nhận, không có audio thì không đo được |
