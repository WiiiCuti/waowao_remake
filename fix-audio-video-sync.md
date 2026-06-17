# Fix: Đồng Bộ Hóa Thời Lượng Âm Thanh & Video

## Mục Đích

Tài liệu này ghi nhận toàn bộ nguyên nhân gốc rễ gây ra lỗi **mất đồng bộ giữa âm thanh và video** trong hệ thống AI Video Studio (waoowaoo), cùng với phương án xử lý đã thống nhất.

---

## Vấn Đề

Khi render video cuối cùng, âm thanh và video **không khớp thời lượng** — dẫn đến:
- Video kết thúc trước, âm thanh vẫn chạy (tràn sang clip sau)
- Âm thanh kết thúc trước, video đơ hình
- Lip sync không khớp — nhân vật mấp máy nhưng không có tiếng
- Thời gian hiển thị trên timeline sai

---

## Nguyên Nhân Gốc (6 Lỗi)

| # | Lỗi | File | Mức độ |
|---|-----|------|--------|
| 1 | Đơn vị thời lượng không thống nhất (giây vs ms), dùng heuristic đoán mò | `video.worker.ts` | Nghiêm trọng |
| 2 | FPS không đồng nhất: Editor 30fps, Video Generator 24fps | `useEditorActions.ts`, `comfyui.ts` | Nghiêm trọng |
| 3 | `<Video>` và `<Audio>` trong Remotion không bị giới hạn bởi Sequence duration | `VideoComposition.tsx` | Nghiêm trọng |
| 4 | Fallback tính WAV duration sai công thức (giả định 128kbps) | `generate-voice-line.ts` | Cao |
| 5 | Lip sync pad audio tối thiểu 2s gây lệch | `preprocess.ts` | Trung bình |
| 6 | Không đo lại duration sau khi lip sync trả về video mới | `video.worker.ts` | Trung bình |

---

## Phương Án Xử Lý

### Nguyên Tắc Cốt Lõi

```
Audio duration = Single Source of Truth
         ↓
Video duration BẮT BUỘC = Audio duration (clamp 3s-10s)
         ↓
Toàn bộ hệ thống thống nhất FPS = 24
         ↓
durationInFrames = Math.round(audioDurationMs / 1000 * 24)
```

### Luồng Dữ Liệu Mới

```
1. Generate voice line → đo audioDurationMs (từ WAV header, CHÍNH XÁC)
         ↓
2. panel.duration = audioDurationMs / 1000  (clamp 3s-10s)
         ↓
3. Video generation dùng duration đã clamp → video khớp audio
         ↓
4. Editor: durationInFrames = Math.round(panel.duration * 24)
         ↓
5. Lip sync: audioDurationMs ≈ videoDurationMs → KHÔNG cần pad/trim
         ↓
6. Remotion: Video và Audio đều bị giới hạn theo durationInFrames
```

### 6 Thay Đổi Cụ Thể

| # | Thay đổi | File | Mô tả |
|---|----------|------|-------|
| 1 | Chuẩn hóa FPS = 24 | `time-utils.ts`, `useEditorActions.ts` | Đổi toàn bộ từ 30 → 24 |
| 2 | Audio Duration → Panel Duration (có clamp) | `voice.worker.ts` | Sau khi generate voice, cập nhật panel.duration = audioDurationSec (clamp 3-10s) |
| 3 | Xóa `toDurationMs` heuristic | `video.worker.ts` | Dùng trực tiếp `voiceLine.audioDuration`, không còn đoán |
| 4 | Giới hạn Video/Audio theo durationInFrames | `VideoComposition.tsx` | Thêm `endAt` cho Video, Audio cắt theo Sequence |
| 5 | Sửa WAV duration fallback | `generate-voice-line.ts` | Parse byteRate từ fmt chunk thay vì giả định 128kbps |
| 6 | Bỏ pad/trim khi audio ≈ video | `preprocess.ts` | Nếu sai số < 100ms → truyền thẳng |

---

## Bảng So Sánh Trước/Sau

| Yếu tố | TRƯỚC | SAU |
|---|---|---|
| FPS | Editor 30, Video 24 | Thống nhất **24** |
| Duration unit | Giây + ms lẫn lộn | **audioDurationMs** là gốc |
| `toDurationMs()` | Đoán mò >1000 | **Xóa**, dùng trực tiếp ms |
| Panel duration | Không rõ đơn vị | = audioDurationSec (**clamp 3-10s**) |
| Video trong Remotion | Phát hết file | Cắt tại `endAt` |
| Audio trong Remotion | Phát hết file | Cắt theo Sequence |
| Lip sync pad | Tối thiểu 2s | Bỏ khi audio ≈ video |
| WAV fallback | 128kbps (sai 3x) | Parse byteRate hoặc 48kHz |

---

## Rủi Ro & Giảm Thiểu

| Rủi ro | Mức độ | Cách giảm thiểu |
|---|---|---|
| Audio > 10s bị cắt | Cao | Clamp max 10s, thông báo user |
| Audio < 3s video quá ngắn | Trung bình | Clamp min 3s, thêm silence |
| Provider không hỗ trợ duration tùy ý | Trung bình | Dùng duration gần nhất có |
| Panel không có voice line | Thấp | Fallback panel.duration cũ |
| Breaking change data cũ | Thấp | Migration script chuẩn hóa |

---

## Tài Liệu Liên Quan

- `roadmap_mixed_audio_pipeline.md` — Kế hoạch mixed audio pipeline
- `src/lib/lipsync/preprocess.ts` — Lip sync preprocessing
- `src/features/video-editor/remotion/VideoComposition.tsx` — Remotion composition
- `src/lib/voice/generate-voice-line.ts` — Voice line generation
