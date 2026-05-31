# Phân Tích: Tại Sao AI Đọc Cả Stage Direction Vào Lời Thoại?

---

## 1. Tóm tắt vấn đề

Khi dùng văn bản đã được tách từ YouTube (có định dạng script với các header kiểu `[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]` và `Bối cảnh: ...`), hệ thống **đưa toàn bộ chuỗi đó vào TTS** — bao gồm cả tên cảnh và mô tả bối cảnh — khiến AI đọc những thứ không phải lời thoại.

---

## 2. Luồng dữ liệu — Toàn bộ pipeline

```
Input (story_v2.txt)
  │
  ▼
[agent_clip] — Chia đoạn/cảnh
  │  └─ output: {start, end, summary, location, characters}
  │
  ▼
[screenplay_conversion] — Chuyển thành script JSON
  │  └─ output: {scenes[{heading, description, content[action/dialogue/voiceover]}]}
  │
  ▼
[agent_storyboard_plan] — Phase 1: Lập kế hoạch shot
  │  └─ output: panels[{panel_number, description, characters, location, source_text, ...}]
  │
  ▼
[agent_acting_direction + agent_cinematographer] — Phase 2
  │  └─ output: panels[] với thêm acting notes
  │
  ▼
[agent_storyboard_detail] — Phase 3: Chi tiết hóa
  │  └─ output: panels[] với thêm {shot_type, camera_move, video_prompt}
  │
  ▼
[voice_analysis] — Phân tích thoại
  │  └─ input: storyboard_json + input (original text)
  │  └─ output: [{speaker, content, isNarration, matchedPanel}]
  │
  ▼
[generate-voice-line] — TTS
     └─ input: content từ voice_analysis
```

---

## 3. Phân tích căn nguyên — Tại sao stage direction bị nuốt vào TTS?

### 3.1 Gốc rễ: `source_text` và `input` chứa header thô

Trong `agent_storyboard_plan.en.txt`, dòng quan trọng nhất:

```
source_text: Corresponding original text fragment ⚠️ Required, must not be empty
Copy the original text directly from the input content
```

→ LLM ở Phase 1 **copy y chang văn bản gốc** vào `source_text`. Nếu văn bản gốc là:

```
[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]
Bối cảnh: Ngọn lửa đỏ rực bùng lên dữ dội từ căn phòng ngủ phía trên tầng hai của biệt thự.
```

Thì `source_text` của panel đó cũng sẽ là toàn bộ đoạn trên.

---

### 3.2 Điểm thứ 2: `voice_analysis` nhận cả `{input}` gốc

Trong `voice_analysis.en.txt`, dòng cuối:

```
Storyboard data as follows:
{storyboard_json}

Original text as follows:
{input}
```

Và rule tại dòng 27-30:
```
For panels with no character dialogue at all, you MUST generate one narration record:
- "speaker" must be set to "Narrator"
- "content" set to the panel's text_segment (the original novel text)
- "isNarration" must be set to true
```

→ Prompt chỉ gọi trường đó là `text_segment`. Nhưng trong storyboard JSON thực tế, trường đó là **`source_text`**, và `source_text` đang chứa:

```
[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]\nBối cảnh: Ngọn lửa đỏ rực...
```

→ Vì prompt nói "set content = panel's text_segment", LLM lấy **toàn bộ source_text** kể cả header và đưa vào field `content` → TTS đọc tất.

---

### 3.3 Tại sao LLM không lọc ra?

LLM không lọc vì **không có instruction nào dạy nó phân biệt**:

| Loại nội dung | Ví dụ | Có được dạy phân biệt không? |
|---|---|---|
| Lời thoại nhân vật | `"Anh yêu em"` | ✅ Có (rule 1) |
| Inner monologue | `Tôi nghĩ: "..."` | ✅ Có (rule 1) |
| Header cảnh | `[CẢNH 8: ...]` | ❌ Không có rule nào |
| Background desc | `Bối cảnh: Ngọn lửa...` | ❌ Không có rule nào |
| Chỉ dẫn diễn xuất | `(giọng run rẩy)` | ❌ Không có rule nào |

Không có rule → LLM mặc định coi bất kỳ text nào không có dấu thoại là **narration** → `isNarration: true` → đưa nguyên vào `content`.

---

### 3.4 Bản chất vấn đề: Script format khác Novel format

Pipeline này được thiết kế ưu tiên xử lý **2 loại input**:
1. **Novel text thuần** (không có header): OK vì source_text = đoạn văn xuôi bình thường
2. **Script JSON** (đã convert qua screenplay_conversion): OK vì `heading`, `description`, `action`, `dialogue` được phân biệt rõ ràng

**Nhưng** `story_v2.txt` của bạn là dạng **thứ 3**: semi-structured script (có header `[CẢNH X]`, có `Bối cảnh:`, nhưng vẫn là plain text, không phải JSON script). Pipeline không có "vùng xử lý" nào cho dạng này.

Cụ thể ở `screenplay_conversion.en.txt`:
- `heading` → riêng (không vào narration)  
- `description` (scene description) → riêng (hướng dẫn hình ảnh, không vào thoại)
- `content[type=action]` → hành động nhân vật
- `content[type=dialogue]` → lời thoại
- `content[type=voiceover]` → kể chuyện

→ Nếu truyện được convert đúng qua `screenplay_conversion` trước, thì `Bối cảnh: ...` phải rơi vào `description` (scene description) — **không phải vào content narration**. Nhưng nếu truyện được dùng nguyên dạng plain text, thì bước này bị bỏ qua, và Phase 1 nhận text thô.

---

### 3.5 Bệnh lan: Phase 3 "bảo tồn" source_text

Trong `agent_storyboard_detail.en.txt` dòng 189:

```
⚠️ The source_text field from input panels must be preserved and output verbatim; do not omit or modify
```

→ Phase 3 được dạy **KHÔNG ĐƯỢC sửa** source_text. Nên dù Phase 3 có "thấy" rằng source_text chứa header, nó cũng không làm sạch — vì đó là luật. Stage direction bám theo suốt từ Phase 1 đến Phase 3.

---

### 3.6 voice_analysis không có khái niệm "stage direction"

Trong `voice_analysis.en.txt`, rule 1 chỉ dạy phân biệt:
- Dialogue (có dấu ngoặc kép hoặc "He said:")
- Narration (không có dialogue) → lấy `text_segment` nguyên

Không có rule nào nói:
> "Nếu text_segment bắt đầu bằng `[`, `Bối cảnh:`, `Scene:`, hoặc tương tự → đây là metadata cảnh, **KHÔNG đưa vào `content` TTS**"

---

## 4. Sơ đồ nhiễm độc (Contamination Path)

```
story_v2.txt (plain text với [CẢNH X] headers)
                │
                │ (Phase 0: agent_clip chia đoạn thô)
                ▼
   Chunk: "[CẢNH 8: PHÒNG NGỦ...]\nBối cảnh: Ngọn lửa..."
                │
                │ (Phase 1: agent_storyboard_plan)
                │ ── copy y chang vào source_text
                ▼
   panel.source_text = "[CẢNH 8: PHÒNG NGỦ...]\nBối cảnh: Ngọn lửa..."
                │
                │ (Phase 2,3: Các agent bảo tồn source_text verbatim)
                ▼
   panel.source_text vẫn = "[CẢNH 8: PHÒNG NGỦ...]\nBối cảnh: Ngọn lửa..."
                │
                │ (voice_analysis nhận storyboard_json)
                │ ── panel không có dialogue → tạo narration record
                │ ── content = panel.source_text (toàn bộ)
                ▼
   voice record: { isNarration: true, content: "[CẢNH 8: PHÒNG NGỦ...]\nBối cảnh: Ngọn lửa..." }
                │
                │ (generate-voice-line → OmniVoice TTS)
                ▼
   🔊 AI đọc: "[CẢNH 8 PHÒNG NGỦ BIỆT THỰ HỌ TRANG NỬA ĐÊM]
               Bối cảnh Ngọn lửa đỏ rực bùng lên dữ dội..."
```

---

## 5. Điểm mấu chốt: Ai chịu trách nhiệm lọc?

| Agent | Nhiệm vụ | Có lọc header không? | Lý do không lọc |
|---|---|---|---|
| `agent_clip` | Chia đoạn | ❌ | Không được dạy nhận diện loại input |
| `screenplay_conversion` | Convert sang script JSON | ✅ Có thể | Nhưng chỉ dùng khi đã có screenplay-format input, không dùng cho plain text |
| `agent_storyboard_plan` | Lập shot từ text thô | ❌ | Được dạy copy source_text nguyên |
| `agent_storyboard_detail` | Chi tiết hóa shot | ❌ | Bắt buộc bảo tồn source_text verbatim |
| `voice_analysis` | Phân tích thoại | ❌ | Không có rule phân biệt stage direction vs narration |

**Vấn đề mang tính hệ thống**: Không một agent nào được giao nhiệm vụ "làm sạch" stage directions ra khỏi narration stream.

---

## 6. Giải pháp (Prompt Engineering Only — Không sửa source code)

### 6.1 Phương án A: Thêm rule vào `voice_analysis` (Nơi ảnh hưởng ít nhất)

Thêm một rule mới vào `voice_analysis.en.txt` section "Analysis Rules":

```
8. [Stage Direction Stripping - CRITICAL]
   Before setting "content" for any narration record, you MUST strip all stage direction metadata from the text_segment:
   
   ✅ Strip the following patterns completely:
   - Scene headers: [CẢNH X: ...], [SCENE X: ...], [INT. ...], [EXT. ...]
   - Background descriptions: Lines beginning with "Bối cảnh:", "Background:", "Scene:", "Setting:"
   - Stage directions in brackets: [nhân vật làm gì đó], [character does something]
   - Director notes: (VO), (V.O.), (O.S.), (O.C.)
   
   ❌ Do NOT include any of the above patterns in the "content" field.
   
   ✅ Only include actual narration prose or dialogue in "content".
   
   Example:
   Input text_segment: "[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]\nBối cảnh: Ngọn lửa đỏ rực bùng lên dữ dội từ căn phòng ngủ phía trên tầng hai của biệt thự.\nTiếng la hét vang lên từ bên trong."
   
   Correct content: "Ngọn lửa đỏ rực bùng lên dữ dội từ căn phòng ngủ phía trên tầng hai của biệt thự. Tiếng la hét vang lên từ bên trong."
   Wrong content: "[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]\nBối cảnh: Ngọn lửa đỏ rực bùng lên dữ dội từ căn phòng ngủ phía trên tầng hai của biệt thự.\nTiếng la hét vang lên từ bên trong."
```

### 6.2 Phương án B: Thêm rule vào `agent_storyboard_plan` — Làm sạch source_text khi copy

Thêm vào phần "source_text Rules":

```
⚠️ source_text Cleaning Rule:
When copying source_text from the input, strip the following non-speech metadata before storing:
- Scene headers enclosed in square brackets: [CẢNH X: ...], [SCENE X: ...]  
- Lines that begin with stage direction keywords: "Bối cảnh:", "Background:", "Setting:", "Scene Description:"
- Performance direction notes in parentheses that describe camera/crew: (camera pans), (fade to black)
Only the actual narrative prose, inner monologue, and dialogue should be stored in source_text.
```

> [!WARNING]
> Phương án B có rủi ro hơn vì nó thay đổi cách Phase 1 xây dựng source_text — có thể ảnh hưởng đến độ chính xác khi voice_analysis match panel với đoạn văn gốc.

### 6.3 Phương án C: Thêm bước pre-processing trong guide (Cho user)

Khuyến nghị user convert truyện sang screenplay JSON trước khi đưa vào hệ thống. Tức là chạy `screenplay_conversion` thủ công, vì prompt đó đã biết:
- `heading` (scene header) → không đưa vào narration
- `description` (Bối cảnh) → không đưa vào narration  
- `voiceover` → mới đưa vào TTS

### 6.4 Phương án D: Thêm rule vào guide_genres.md

Chỉ dẫn người viết truyện **không dùng định dạng semi-structured** (tức là không dùng `[CẢNH X]` headers, `Bối cảnh:` labels trong plain text input):

```
❌ Tránh định dạng semi-script trong input plain text:
[CẢNH 8: PHÒNG NGỦ BIỆT THỰ HỌ TRANG - NỬA ĐÊM]
Bối cảnh: Ngọn lửa...

✅ Thay bằng văn xuôi thuần:
Đêm khuya, ngọn lửa đỏ rực bùng lên dữ dội từ căn phòng ngủ phía trên tầng hai của biệt thự họ Trang.
```

---

## 7. Khuyến nghị

| Phương án | Rủi ro | Hiệu quả | Khuyến nghị |
|---|---|---|---|
| A — Rule trong voice_analysis | Thấp (lọc ở bước cuối) | Cao (chặn đúng chỗ vào TTS) | ⭐⭐⭐ Ưu tiên nhất |
| B — Rule trong storyboard_plan | Trung bình | Cao (sạch từ đầu) | ⭐⭐ Kết hợp với A |
| C — Pre-process screenplay_conversion | Không có | Rất cao | ⭐⭐⭐ Nếu có thể |
| D — Hướng dẫn viết truyện | Không có | Cao (phòng ngừa) | ⭐⭐ Dài hạn |

**Kết hợp tốt nhất (không sửa source code)**: A + D

- **A** chặn lỗi ngay tại `voice_analysis` (phòng thủ cuối cùng trước TTS)
- **D** hướng dẫn viết input đúng định dạng từ đầu (phòng ngừa)
