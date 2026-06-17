# Kế Hoạch: Tích Hợp LTX Director Vào Backend

> **Nhánh làm việc:** `ltx_director`
> **Mục tiêu Phase 1:** Sửa lại backend video generation để sử dụng `LTX_Director.json` workflow — hỗ trợ nạp **nhiều ảnh + nhiều audio + nhiều prompt** trong 1 lần gọi ComfyUI, thay vì chỉ 1 ảnh/1 prompt như hiện tại.

---

## 1. Hiện Trạng Hệ Thống (As-Is)

### Kiến trúc Video Generator hiện tại:
```
factory.ts (createVideoGenerator)
  ↓ case 'comfyui'
  → ComfyUIVideoGenerator (video/comfyui.ts)
      ↓ doGenerate()
      → uploadImageToComfyUI() — upload 1 ảnh (First Frame)
      → buildWorkflow() — chọn 1 trong 3 template JSON:
          • video_LTXV-normal.json (Text-to-Video)
          • video_LTXV-firstlastframe.json (First/Last Frame)
          • video_LTXV-normal-promptrelay.json (Prompt Relay cũ)
      → pollForResult() — chờ kết quả qua HTTP polling
```

### Vấn đề của hệ thống cũ:
- **1 Panel = 1 lần gọi API** → Nhân vật bị biến dạng/đổi quần áo giữa các Panel.
- Chỉ hỗ trợ **1 ảnh mồi (First Frame)** hoặc 2 ảnh (First + Last).
- Prompt chỉ có 1 chuỗi text duy nhất, không hỗ trợ Timeline.
- Không có cơ chế nạp Audio vào video.

---

## 2. Kiến Trúc Mới Với LTX Director (To-Be)

### Nguyên tắc cốt lõi:
- **Nhiều Panel = 1 lần gọi ComfyUI** (Chunking).
- Mỗi Panel vẫn viết prompt **bình thường** (không cần format `|`), vì mỗi Panel đã có ảnh tĩnh riêng.
- Node.js tự động tính `start` frame, `length` frame, ghép vào `timeline_data`.
- Audio TTS được upload riêng và nhét vào `audioSegments`.

### Cấu trúc `timeline_data` của LTX Director (từ file JSON thực tế):
```json
{
  "segments": [
    {
      "id": "unique_id",
      "start": 0,           // Frame bắt đầu
      "length": 48,          // Số frame
      "prompt": "Mô tả hành động cho segment này",
      "type": "image",
      "imageFile": "uploaded_image_name.webp"  // Ảnh đã upload lên ComfyUI
    },
    {
      "id": "unique_id_2",
      "start": 48,
      "length": 73,
      "prompt": "Mô tả hành động tiếp theo...",
      "type": "image",
      "imageFile": "another_image.webp"
    }
  ],
  "audioSegments": [
    {
      "id": "audio_id",
      "type": "audio",
      "start": 0,            // Frame bắt đầu phát audio
      "length": 109,          // Số frame của audio
      "trimStart": 0,
      "audioDurationFrames": 109,
      "audioFile": "tts_voice.wav",  // File TTS đã upload
      "fileName": "tts_voice.wav",
      "waveformPeaks": [...]  // Dữ liệu sóng âm (có thể để mảng rỗng)
    }
  ]
}
```

### Các trường quan trọng khác trong Node `LTXDirector` (Node 46):
```
global_prompt: ""                    // Prompt toàn cục (có thể để trống)
local_prompts: "prompt1 | prompt2"   // Tự động sinh bởi Node từ segments
segment_lengths: "48,73"             // Tự động sinh bởi Node từ segments
duration_frames: 241                 // Tổng số frame
duration_seconds: 10.042
frame_rate: 24
use_custom_audio: true               // Bật audio
```

---

## 3. Kế Hoạch Thực Thi Chi Tiết

### Bước 1: Tạo interface `LTXDirectorParams`
**File:** `src/lib/generators/video/comfyui.ts`

Thêm interface mới mô tả dữ liệu đầu vào cho LTX Director mode:
```typescript
interface LTXDirectorSegment {
  imageUrl: string        // URL ảnh tĩnh của panel
  prompt: string          // Mô tả hành động
  durationSeconds: number // Thời lượng (tính từ TTS hoặc mặc định)
}

interface LTXDirectorAudio {
  audioUrl: string        // URL file TTS (.wav)
  startSeconds: number    // Thời điểm bắt đầu phát (giây)
  durationSeconds: number // Độ dài audio (giây)
}

interface LTXDirectorParams {
  segments: LTXDirectorSegment[]
  audioSegments?: LTXDirectorAudio[]
  fps?: number            // Mặc định 24
  globalPrompt?: string
}
```

### Bước 2: Viết hàm `buildLTXDirectorWorkflow()`
**File:** `src/lib/generators/video/comfyui.ts`

Hàm này sẽ:
1. Nhận vào `LTXDirectorParams`.
2. Deep-clone template `LTX_Director.json`.
3. Với mỗi segment: upload ảnh lên ComfyUI → lấy `imageFile` name.
4. Với mỗi audio: upload file wav lên ComfyUI → lấy `audioFile` name.
5. Tính toán `start` frame và `length` frame cho từng segment dựa trên `durationSeconds * fps`.
6. Build chuỗi `timeline_data` JSON (mỗi segment chứa prompt + imageFile riêng).
7. Tính `duration_frames` tổng = tổng frame tất cả segments (làm tròn lên `8n+1`).
8. Gán `timeline_data` và `duration_frames`/`duration_seconds` vào Node 46 (`LTXDirector`).
9. **Không cần build `local_prompts` hay `segment_lengths`** — Node LTX Director tự sinh ra từ `timeline_data`.

### Bước 3: Thêm method `generateWithLTXDirector()`
**File:** `src/lib/generators/video/comfyui.ts`

Method mới trong class `ComfyUIVideoGenerator`:
```typescript
async generateWithLTXDirector(
  userId: string,
  params: LTXDirectorParams
): Promise<GenerateResult>
```

Luồng xử lý:
1. Gọi `buildLTXDirectorWorkflow()` để build JSON workflow.
2. POST tới `/prompt` của ComfyUI.
3. Gọi `pollForResult()` (tái sử dụng hàm cũ).
4. Trả về video URL.

### Bước 4: Tạo hàm Chunking (Smart Chunking)
**File mới:** `src/lib/generators/video/chunking.ts`

```typescript
interface PanelForChunking {
  panelId: string
  imageUrl: string
  prompt: string
  durationSeconds: number  // Từ TTS hoặc mặc định (câm=3s, B-roll=2.5s)
  audioUrl?: string        // URL file TTS (nếu có)
  audioDurationSeconds?: number
}

interface Chunk {
  panels: PanelForChunking[]
  totalDurationSeconds: number
}

function chunkPanels(
  panels: PanelForChunking[],
  maxChunkDuration: number = 10
): Chunk[]
```

Thuật toán:
- Duyệt qua từng panel, cộng dồn thời lượng.
- Nếu vượt `maxChunkDuration` → chốt Chunk hiện tại, bắt đầu Chunk mới.
- Ưu tiên cắt tại panel B-roll (panel câm không có audio).

### Bước 5: Tạo API endpoint test
**File mới:** `src/app/api/test-ltx-director/route.ts`

Endpoint đơn giản để test thủ công:
- Nhận vào mảng panels (imageUrl + prompt + duration).
- Gọi chunking → gọi `generateWithLTXDirector()` cho từng Chunk.
- Trả về video URLs.

### Bước 6: Reverse Slicing (FFmpeg)
**File mới:** `src/lib/generators/video/slicer.ts`

Sau khi nhận được video dài từ ComfyUI:
- Dùng FFmpeg để cắt video ra thành các đoạn nhỏ theo đúng mốc thời gian của từng Panel.
- Upload từng đoạn nhỏ lên storage.
- Trả về mảng URL cho từng panel → UI vẫn hoạt động bình thường (1 panel = 1 video).

---

## 4. Sơ Đồ Luồng Xử Lý Mới

```
[API Request: Generate Video cho Scene X]
    ↓
[chunking.ts] chunkPanels()
    → Input:  Panel[] (mỗi panel có imageUrl, prompt, duration, audioUrl)
    → Output: Chunk[] (mỗi Chunk chứa 2-5 panels, tổng 5-10s)
    ↓
[Với mỗi Chunk]
    ↓
[comfyui.ts] generateWithLTXDirector()
    → Upload tất cả ảnh của Chunk lên ComfyUI
    → Upload tất cả audio TTS của Chunk lên ComfyUI
    → Build timeline_data JSON (segments + audioSegments)
    → Build LTX_Director.json workflow
    → POST /prompt → poll → nhận video dài 5-10s
    ↓
[slicer.ts] sliceVideoByPanels()
    → FFmpeg cắt video dài thành N video nhỏ
    → Upload từng video nhỏ lên storage
    → Trả về: { panelId: videoUrl }[]
    ↓
[Lưu Database]
    → Mỗi Panel nhận đúng video URL tương ứng
    → UI hiển thị bình thường (1 panel = 1 video)
```

---

## 5. Danh Sách File Cần Tạo/Sửa

| Action | File | Mô tả |
|---|---|---|
| **MODIFY** | `src/lib/generators/video/comfyui.ts` | Thêm `buildLTXDirectorWorkflow()` và `generateWithLTXDirector()` |
| **NEW** | `src/lib/generators/video/chunking.ts` | Thuật toán gom Panel thành Chunk |
| **NEW** | `src/lib/generators/video/slicer.ts` | FFmpeg cắt ngược video thành từng Panel |
| **NEW** | `src/app/api/test-ltx-director/route.ts` | API endpoint test thủ công |
| **KEEP** | `src/lib/generators/video/LTX_Director.json` | Template workflow (không sửa) |
| **KEEP** | `src/lib/generators/base.ts` | Interface gốc (không sửa) |
| **KEEP** | `src/lib/generators/factory.ts` | Factory (chưa sửa ở Phase 1, sẽ hook vào ở Phase 2) |

---

## 6. Lộ Trình

| Thứ tự | Công việc | Độ khó |
|---|---|---|
| 1 | Interface `LTXDirectorParams` + `buildLTXDirectorWorkflow()` | ⭐⭐ |
| 2 | `generateWithLTXDirector()` (upload + build + submit + poll) | ⭐⭐⭐ |
| 3 | `chunking.ts` (thuật toán gom panel) | ⭐⭐ |
| 4 | `slicer.ts` (FFmpeg reverse slicing) | ⭐⭐⭐ |
| 5 | API endpoint test | ⭐ |
| 6 | Test end-to-end trên ComfyUI Local | ⭐⭐ |

---

## 7. Ghi Chú Kỹ Thuật

### Về Prompt:
- AI vẫn viết prompt **bình thường** cho từng panel.
- **Không cần ghép `|`**. Mỗi segment trong `timeline_data` đã chứa prompt riêng + ảnh riêng.
- Node LTX Director sẽ tự động đọc `timeline_data.segments` và xử lý nội bộ.
- Mỗi panel có ảnh riêng trong `segments` → LTX Director sẽ morph giữa các ảnh, nên AI không cần tuân thủ quy tắc "Delta" của Prompt Relay gốc.

### Về Audio:
- `waveformPeaks` trong `audioSegments` có thể để mảng rỗng `[]` khi gọi qua API. Nó chỉ cần khi hiển thị UI trên ComfyUI.
- `audioDurationFrames` = `Math.round(audioDurationSeconds * fps)`.

### Về VRAM:
- Mỗi Chunk tối đa **10 giây** (240 frames @ 24fps).
- Nếu quá dài → GPU tràn bộ nhớ (OOM). Thuật toán chunking sẽ tự động ngắt.

### Về Reverse Slicing:
- FFmpeg cắt video mà **không encode lại** (`-c copy`) → cực nhanh, không mất chất lượng.
- Nếu cần cắt chính xác tới mili-giây → dùng `-ss` trước `-i` kết hợp `-c:v libx264`.
