# Kiến Trúc Hoàn Chỉnh: Sản Xuất Phim AI Tự Động Với LTX Director

> Tài liệu này là kết quả của một buổi brainstorming chuyên sâu. Nó phác thảo toàn bộ triết lý thiết kế, kiến trúc kỹ thuật, và lộ trình xây dựng hệ thống sản xuất phim AI bằng ComfyUI, lấy **LTX Director** làm trái tim.

---

## 1. Tầm Nhìn (The Vision)

**Mục tiêu:** Một hệ thống Node.js nhận vào một đoạn truyện (nguyên bản hoặc đã chỉnh sửa theo Golden Format), và tự động xuất ra một video điện ảnh hoàn chỉnh — có cảnh quay mượt mà, lời thoại khớp môi, âm thanh môi trường, và nhịp phim như một bộ phim ngắn thực thụ.

**Triết lý cốt lõi:**
- ❌ Không còn kiểu **"Audiobook"**: Đọc to toàn bộ nội dung mô tả, nhân vật nhép miệng giả tạo, cảnh quay giật cục.
- ✅ Chuyển sang **"Cinematic Movie Mode"**: Chỉ nhân vật mới có tiếng nói. Cảnh vật và hành động sẽ *được nhìn thấy*, không *được đọc lên*. Video nội suy mượt mà trong cùng một Inference Session.

---

## 2. Hai Cuộc Cách Mạng Song Song

Hệ thống cần hai thay đổi kiến trúc đồng thời — một ở tầng AI Prompt và một ở tầng Engine sinh video.

### Cuộc Cách Mạng 1: Cinematic Movie Mode (Tầng AI Prompt)
Xem chi tiết trong tài liệu `make_flim_inthefure.md`. Tóm tắt:
- **Tắt hoàn toàn Narrator**: Văn bản mô tả, hành động, bối cảnh → chỉ sinh hình ảnh, không đọc âm thanh.
- **Chỉ trích xuất thoại thuần (Pure Dialogue)**: Lọc bỏ cụm dẫn truyện như "Anh lạnh lùng nói:". Chỉ lấy chữ trong `""`.
- **Thẻ `[...]` là cú Đặc tả (Cinematic Insert)**: Mọi nội dung trong `[...]` bị ép thành một shot hình B-roll độc lập, hoàn toàn vô thanh, tạo nhịp điệu (pacing) điện ảnh.
- **Độc thoại nội tâm (Inner Monologue)**: Suy nghĩ nhân vật được bọc trong `""` đi kèm từ khoá "thầm nghĩ/tự nhủ" → Voice-over không nhép môi.

### Cuộc Cách Mạng 2: Multi-Panel Chunking (Tầng Engine LTX Director)
Đây là trọng tâm của tài liệu này. Thay vì sinh từng video lẻ, hệ thống sẽ **gom nhóm nhiều panel thành một Chunk** và render chúng thành **1 video liền mạch duy nhất** qua LTX Director.

---

## 3. Giải Phẫu Một Đoạn Truyện (Anatomy of a Story Segment)

Lấy ví dụ đoạn truyện đã được chuẩn hoá theo Golden Format:

```
[1] Hôm nay trời bất chợt đổ mưa. Minh đứng dưới mái hiên quán cà phê,
    nhìn dòng người vội vã lao qua màn mưa trắng xóa.

[2] [Những giọt mưa lớn xối xả đập xuống vũng nước trên mặt đường nhựa, bọt nước văng tung tóe]

[3] Minh khẽ chép miệng, anh thầm nghĩ: "Lại quên ô rồi. Lần nào cũng vậy."

[4] Linh bước vội vào mái hiên, mái tóc hơi ướt ở phần đuôi, tay chìa ra
    chiếc ô xanh nhạt còn chưa mở. Linh nhẹ nhàng hỏi: "Anh cần không?"

[5] [Cận cảnh những ngón tay thon thả của Linh cầm chiếc ô màu xanh nhạt còn lấm tấm vài giọt nước mưa]

[6] Minh quay lại nhìn cô một giây, Minh hỏi: "Của em à?"

[7] [Linh mỉm cười, đôi mắt sáng lên một nét vui vẻ và ấm áp dưới màn mưa lạnh]

[8] Linh tay chỉ vào chiếc balo, Linh nói: "Em có hai cái."
    Cô ngập ngừng một chút, ánh mắt hơi né tránh, Linh hỏi thêm: "Hay... anh đi cùng hướng nào?"

[9] [Bầu không khí giữa hai người hơi chùng xuống, chỉ còn tiếng lách tách của những hạt mưa rơi trên mái hiên]

[10] Minh nhìn sang hướng cô gái chỉ. Trong đầu anh chạy qua một dòng suy nghĩ:
     "Thực ra mình không cần đi đâu gấp. Chỉ vừa uống xong ly cà phê thôi."

[11] Nhưng rồi, Minh quay sang nhìn Linh và thản nhiên nói: "Anh đi về phía công viên Thống Nhất."

[12] [Góc máy từ phía sau, bóng hai người vội vã bước đi, cùng che chung một chiếc ô xanh nhạt hòa vào màn mưa trắng xóa]

[13] Đi được một đoạn, Minh khẽ cười tự giễu trong lòng: "Đó là hướng ngược lại với chỗ mình ở cơ mà."
```

Các panel trên chia thành 2 loại:
- **🔇 Panel Câm (Silent Panel):** [1], [2], [5], [7], [9], [12] — Không có thoại. Thời lượng do system quyết định (mặc định 3s).
- **🔊 Panel Có Tiếng (Voice Panel):** [3], [4], [6], [8], [10], [11], [13] — Thời lượng được neo vào độ dài file TTS.

---

## 4. Thuật Toán Gom Nhóm (Smart Chunking Algorithm)

Đây là phần kỹ thuật quan trọng nhất. Node.js sẽ không hỏi "Có bao nhiêu panel?" mà hỏi **"Cụm panel này cộng lại được bao nhiêu giây?"**

### Bảng Thời Lượng Ước Tính

| Loại Panel | Cách Tính Thời Lượng | Ghi chú |
|---|---|---|
| Panel Câm (Mô tả/Hành động) | **Mặc định: 3s** | Đây là thời gian "thở" điện ảnh tối thiểu |
| Panel B-roll `[...]` (Insert) | **Mặc định: 2.5-3s** | Ngắn hơn để tạo cảm giác chớp nhoáng |
| Panel Thoại | **= Độ dài TTS file + 0.3s padding** | Neo chính xác theo giọng đọc |
| Panel Inner Monologue | **= Độ dài TTS file + 0.5s padding** | Cần thêm thời gian "thấm" tâm lý |

### Luật Gom Nhóm

```
CHUNK_MAX_DURATION = 10s (ngưỡng an toàn cho VRAM 16GB)
CHUNK_IDEAL_DURATION = 7-8s (điểm ngọt nhất)

Thuật toán:
  current_chunk = []
  current_duration = 0

  for each panel in panels:
    panel_duration = estimateDuration(panel)
    
    if current_duration + panel_duration > CHUNK_MAX_DURATION:
      // Ngưỡng bị vượt. Đóng Chunk hiện tại.
      // Ưu tiên điểm cắt: Cắt TẠI hoặc TRƯỚC panel [...]
      finalizeChunk(current_chunk)
      current_chunk = [panel]
      current_duration = panel_duration
    else:
      current_chunk.push(panel)
      current_duration += panel_duration

  finalizeChunk(current_chunk) // Chunk cuối cùng
```

### Ví dụ Phân Chia Chunk Đoạn Truyện Trên

Áp dụng thuật toán vào 13 panel:

| Chunk | Panel | Thời lượng | Tổng |
|---|---|---|---|
| **Chunk A** | [1] Minh nhìn mưa (câm) | 3s | 3s |
| | [2] B-roll mưa đường nhựa | 2.5s | 5.5s |
| | [3] Thầm nghĩ: "Lại quên ô..." | ~3.2s TTS | 8.7s ✅ |
| **Chunk B** | [4] Linh bước vào + hỏi: "Anh cần không?" | ~2.5s TTS | 2.5s |
| | [5] B-roll ngón tay cầm ô | 2.5s | 5s |
| | [6] Minh hỏi: "Của em à?" | ~1.5s TTS | 6.5s |
| | [7] B-roll mắt Linh mỉm cười | 2.5s | 9s ✅ |
| **Chunk C** | [8] "Em có hai cái... hướng nào?" | ~4s TTS | 4s |
| | [9] B-roll không khí chùng xuống | 3s | 7s |
| | [10] "Thực ra mình không cần..." | ~3.5s TTS | 10.5s — Hơi dài, cắt đây! |
| **Chunk D** | [11] "Anh đi về phía công viên..." | ~2.5s TTS | 2.5s |
| | [12] B-roll hai người bước đi | 3s | 5.5s |
| | [13] "Đó là hướng ngược lại..." | ~2.5s TTS | 8s ✅ |

**Kết quả:** 13 panel → 4 video mượt mà, mỗi cái 7-10 giây.

---

## 5. Luồng Xử Lý Đầy Đủ (Full Pipeline)

```
[Truyện đầu vào] 
    ↓ Agent: Storyboard Plan (Phase 1)
    → Danh sách Panels với source_text, description, scene_type
    
    ↓ Agent: Voice Analysis
    → Với mỗi Panel có thoại: trích xuất lời thoại thuần
    → Với Panel câm/B-roll: trả về mảng rỗng []

    ↓ TTS Generation (chạy song song)
    → Sinh file audio (.wav) cho từng lượt thoại
    → Đo chính xác độ dài mỗi file
    
    ↓ Node.js: Smart Chunking Algorithm
    → Gom Panels thành các Chunk 7-10s
    → Ưu tiên cắt Chunk tại các B-roll [...]
    
    ↓ Node.js: Keyframe Timeline Builder
    → Với mỗi Chunk: tính toán Frame# cho từng Panel
      (Ví dụ: Panel 1 @Frame0, Panel 2 @Frame72, Panel 3 @Frame132)
    → Build JSON Workflow cho ComfyUI (LTX Director format)
    → Ghép Audio TTS của Chunk thành 1 track .wav (có padding giữa các câu)
    
    ↓ ComfyUI API Request (qua HTTP + WebSocket)
    → Upload audio track + JSON Workflow
    → Lắng nghe tiến trình qua WebSocket
    → Download video Chunk khi hoàn tất
    
    ↓ Video Compositor (Final Assembly)
    → Ghép Chunk A + B + C + D lại với nhau
    → Nhúng nhạc nền (BGM) + SFX tiếng mưa
    → Xuất video cuối cùng (.mp4)
```

---

## 6. Thay Đổi Cần Thiết Ở Hệ Thống Prompt

Chuyển sang LTX Director đòi hỏi sửa lại cách AI viết video_prompt trong `agent_storyboard_detail.en.txt`:

| Quy tắc cũ (Từng panel lẻ) | Quy tắc mới (LTX Director Chunk) |
|---|---|
| ❌ "Static camera" — Cấm camera di chuyển | ✅ Cho phép camera movement (Pan, Tilt, Dolly) để chuyển cảnh mượt |
| ❌ Mỗi panel mô tả lại đầy đủ bối cảnh | ✅ Panel đầu của Chunk mô tả đầy đủ. Các panel sau chỉ mô tả **sự thay đổi** (Action Delta) |
| ❌ 1 panel = 1 hành động cứng nhắc | ✅ Mô tả hành động **tiếp nối** (Action Chaining): "After X, camera drifts to reveal Y" |

**Thêm trường mới trong JSON Panel:**
```json
{
  "panel_number": 2,
  "ltx_keyframe_note": "Camera drifts downward from face to hands, then to rainwater puddle below",
  "is_silent": true,
  "estimated_duration_s": 2.5
}
```

---

## 7. Kỹ Thuật Nối Chunk (Cross-Chunk Continuity)

Khi Chunk A kết thúc và Chunk B bắt đầu:

1. **First/Last Frame Bridge**: Lấy frame cuối cùng của video Chunk A → đưa vào làm `init_image` (First Frame) khi render Chunk B. LTX Director đảm bảo Chunk B bắt đầu y hệt nơi Chunk A kết thúc.

2. **Ưu tiên cắt tại B-roll**: Thuật toán ưu tiên kết thúc một Chunk tại panel `[...]`. Khi Chunk A kết thúc bằng một shot B-roll (ví dụ: cận cảnh vũng nước mưa), Chunk B có thể bắt đầu tại một shot khác hoàn toàn (ví dụ: mặt Linh bước vào) mà khán giả không nhận ra sự gián đoạn vì đây là một Cutaway bình thường trong điện ảnh.

---

## 8. Lộ Trình Triển Khai (3 Giai Đoạn)

### Phase 1: Nền Tảng Prompt (Tuần 1-2)
- Sửa `agent_storyboard_detail.en.txt`: Thêm trường `is_silent`, `estimated_duration_s`, `ltx_keyframe_note`. Dạy AI tư duy theo chuỗi hành động tiếp nối thay vì panel rời rạc.
- Sửa `panel-duration.ts`: Thêm Rule 6 (Silent Panel = DEFAULT 3s, B-roll = 2.5s) khi `is_silent === true`, không phụ thuộc TTS.
- Viết hàm `chunkPanels(panels[])` để gom panel theo Duration-based Chunking.
- **Test thủ công**: Xuất JSON Keyframe Timeline → kéo thả vào ComfyUI Local → chạy tay, xem video đầu ra có mượt không.

### Phase 2: Tự Động Hoá (Tuần 3-4)
- Viết `src/lib/generators/comfyui/client.ts`: ComfyUI WebSocket Client để upload Workflow + lắng nghe tiến trình + download video.
- Viết `src/lib/generators/comfyui/workflow-builder.ts`: Build JSON Workflow LTX Director từ `ChunkedPanels[]`.
- Viết `src/lib/generators/comfyui/audio-merger.ts`: Ghép các file TTS rời rạc thành 1 track `.wav` cho mỗi Chunk (dùng FFmpeg).
- **Test end-to-end**: Gửi đoạn truyện → hệ thống tự render video bằng ComfyUI.

### Phase 3: Hoàn Thiện & Mở Rộng (Tuần 5+)
- Tích hợp First/Last Frame Bridge: Node.js tự động lấy frame cuối của Chunk N làm Init Image cho Chunk N+1.
- Tích hợp Final Assembly: Ghép các Chunk, thêm BGM và SFX tự động.
- Giao diện người dùng: Nút "Export to ComfyUI" và màn hình theo dõi tiến trình render theo thời gian thực.

---

## 9. Giải Quyết Nút Thắt Giao Diện (The UI/UX Mapping Problem)

Một vấn đề cực kỳ hóc búa được đặt ra: **Giao diện hiện tại (Frontend) được thiết kế theo tỷ lệ 1:1 (1 Panel = 1 Video). Nếu chúng ta gom 3 Panel thành 1 Chunk Video 10 giây, làm sao để hiển thị trên giao diện? Chẳng lẽ đập đi xây lại toàn bộ UI?**

Tuyệt đối không cần đập giao diện! Giải pháp hoàn hảo nhất là **"Video Slicing" (Cắt ngược video bằng FFmpeg)** ở tầng Backend.

### Luồng Hoạt Động Cắt Ngược (Reverse Slicing):
1. **Gom (Chunking):** Node.js gom Panel 1 (3s), Panel 2 (2.5s), Panel 3 (4.5s) thành 1 Chunk gửi lên ComfyUI.
2. **Render (LTX Director):** ComfyUI trả về 1 video MP4 liền mạch dài 10 giây.
3. **Cắt ngược (Slicing):** Ngay khi tải video 10s về máy chủ, Node.js dùng công cụ **FFmpeg** để cắt video đó ra làm 3 file MP4 nhỏ dựa trên chính mốc thời gian nó đã tính ở bước 1:
   - `video_panel_1.mp4`: cắt từ giây 0.0 đến 3.0
   - `video_panel_2.mp4`: cắt từ giây 3.0 đến 5.5
   - `video_panel_3.mp4`: cắt từ giây 5.5 đến 10.0
4. **Lưu Database:** Cập nhật 3 URL video nhỏ này vào 3 Panel tương ứng trên Database.

### Kết Quả Kép Tuyệt Vời:
- **Đối với Giao Diện (Frontend):** UI không hề biết chuyện gì đã xảy ra. Nó vẫn nhận được 1 video cho 1 panel như bình thường. Chức năng Preview từng panel trên web vẫn hoạt động hoàn hảo 100%. Mọi thứ y như cũ.
- **Đối với Khán Giả:** Khi Video Compositor ghép các video này lại để xuất file cuối cùng, vì 3 video này được cắt ra từ **cùng một video gốc của LTX Director**, nên khi nối lại, chúng vẫn sẽ mượt mà, khớp nhau đến từng pixel, không hề có độ trễ hay sai lệch bối cảnh!

Bằng giải pháp FFmpeg Slicing này, chúng ta "đánh lừa" được UI, giữ nguyên toàn bộ kiến trúc Frontend, nhưng lại lén "cấy" được sức mạnh điện ảnh của LTX Director vào Backend!

---

## 10. Lời Kết

Bằng cách kết hợp **Cinematic Movie Mode** (từ bỏ Narrator, chỉ dùng thoại thuần và B-roll) với **LTX Director Multi-Panel Chunking** (gom nhóm panel theo thời lượng để sinh video mượt mà liền mạch), chúng ta sẽ xây dựng một hệ thống sản xuất phim AI không giống bất kỳ thứ gì đang tồn tại trên thị trường.

Đây không còn là "AI viết phụ đề rồi sinh ảnh", mà là **Công xưởng Điện Ảnh AI** — nơi một đoạn văn được biến thành một tác phẩm điện ảnh hoàn chỉnh một cách hoàn toàn tự động.
