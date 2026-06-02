# Bug Report: Pipeline Storyboard (Phase 1–3 + Refiner)

> Dữ liệu tham khảo: `refine-09567f43.json` (2026-05-30T15:53Z, 12 panels) + `refine-32b0d4e6.json` (2026-05-29T20:27Z, 22 panels)  
> Mục tiêu: FLUX sinh ảnh tĩnh → LTX Video 2.3 + IC-LoRA sinh video từ ảnh đó làm Frame 0

---

## Pipeline thực tế

```
Tab "Story" nút "Create"
    → Story → Script (chuyển raw text → structured clips)

Script → Storyboard (auto):
    Phase 1: agent_storyboard_plan       → chia panel, scene_type, description, source_text
    Phase 2a: agent_cinematographer      → DOF, lighting, color_tone, screen_position, facing  ─┐
    Phase 2b: agent_acting_direction     → acting, body language, expressions                    ─┘ song song (Promise.all)
    Phase 3: agent_storyboard_detail     → shot_type, camera_move, video_prompt
    → mergePanelsWithRules()

[Sau khi có TTS duration]
    Refiner: prompt_refiner              → image_prompt + video_prompt refined

Code: src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:295
```

### Phân công trách nhiệm từng phase

| Phase | File | Đầu ra |
|-------|------|--------|
| Phase 1 | `agent_storyboard_plan.en.txt` | Chia panel, scene_type, location, description, source_text, gợi ý shot size |
| Phase 2a | `agent_cinematographer.en.txt` | DOF, lighting, color_tone, screen_position, posture, facing |
| Phase 2b | `agent_acting_direction.en.txt` | acting (expression + body language + micro-movements + eye line) |
| Phase 3 | `agent_storyboard_detail.en.txt` | shot_type chính thức, camera_move, video_prompt |
| Refiner | `prompt_refiner.en.txt` | image_prompt + video_prompt final |

---

## Gốc rễ chung

> **Phase 1–3 viết theo triết lý cinematography live-action ("phim phải động"). Refiner viết theo triết lý I2V ("ảnh tĩnh + animate pixel có sẵn"). Hai triết lý mâu thuẫn → Refiner trở thành công cụ vá lỗi → vá không kín → hỏng video.**

---

## Bug 1: Camera Movement (Phase 3 → Refiner)

**File gốc**: `agent_storyboard_detail.en.txt`

### Bằng chứng từ data thực

**11/12 panels (09567f43)** và **21/22 panels (32b0d4e6)** đều có camera movement trong existingVideoPrompt:

| Panel | Camera keyword |
|-------|---------------|
| 0 | `camera gently pans and tracks` |
| 1 | `camera gently tracks backward` |
| 2 | `camera slowly pushes in` |
| 3 | `camera gently orbits around him` |
| 8 | `camera slowly pushes in on his face` |
| 10 | `camera slowly pushes in on her sulking face` |
| 11 | `camera sways gently following her teasing movement` |

→ **Tỷ lệ: ~95% panels có camera movement**

### Root cause — Phase 3 rules

| Dòng | Rule |
|------|------|
| 41 | `✅ Prioritize slow push-in / slow pull-out / slight tracking, avoid purely static shots` (daily) |
| 48 | `✅ Prioritize slow push-in, orbiting camera, avoid purely static shots` (emotion) |
| 55 | `Snap zoom in/out, tracking, handheld shake` (action) |
| 62 | `slowly crane up, rapidly dive down, orbit` (epic) |
| 66 | `Slow push-in to create pressure` (suspense) |
| **95-98** | Camera Movement Word Bank: `"prioritize these; avoid static"` |
| **100-109** | `"Forbid Purely Static Descriptions"` — cấm static camera rõ ràng |

Phase 3 được viết với triết lý **ngược hoàn toàn với I2V**.

### Refiner cấm nhưng vá không kín

| Refiner rule | Dòng |
|-------------|------|
| `Camera: MUST remain static (NO push, dolly, track, pan, zoom)` | 216 |
| `NEVER use push, dolly, track, pan, zoom` | 168 |
| `Static camera` mandatory trong mỗi Shot block | 122 |

→ Refiner loại được ~86-92% camera keywords nhưng vẫn sót 8-14% (Panel 1 file 2: `sways`).

**Fix**: Sửa Phase 3 — xoá `Forbid Purely Static Descriptions` (dòng 100-109), thay toàn bộ scene type rules "avoid static" → "static camera mandatory". Giữ ngoại lệ cho Extreme Close-Up (dòng 125-129 đã có).

---

## Bug 2: Body Action ngoài Visible Frame (Phase 2b + Phase 3 → Refiner)

**File gốc**: `agent_acting_direction.en.txt` + `agent_storyboard_detail.en.txt`

### Root cause

Phase 2b và Phase 3 mô tả body actions **trước khi biết ảnh sẽ crop đến đâu** (Phase 3 chạy sau, image gen chưa chạy). Refiner phải lọc bằng Visibility Constraint (dòng 152-160), nhưng LLM không thấy ảnh thật → đoán → sót.

| Phase | Ví dụ action | Nếu ảnh là Close-Up mặt → |
|-------|-------------|---------------------------|
| Acting dòng 66 | `"hands clench the hem of clothing"` | Tay không visible → LTX invent |
| Acting dòng 26 | `"turn back to face away"` | Invent toàn bộ mặt sau nhân vật |
| Phase 3 dòng 91-92 | `"walk, turn around, stand up, gesture"` | Cần full body visible |
| Phase 3 dòng 109 | `"gesturing with both hands"` | Close-Up mặt → tay không có |

### Case nguy hiểm nhất — "turn back to face away"

Nếu ảnh chụp mặt trước nhân vật, action "quay lưng lại" buộc LTX invent **toàn bộ phần lưng + tóc sau + quần áo sau** trong style mặc định → mismatch rõ nhất.

### Acting Direction — vấn đề riêng

`agent_acting_direction.en.txt` chạy **song song** với cinematographer (Phase 2b). Output `characters[].acting` bao gồm expression, body language, micro-movements, eye line. Acting không biết shot size (Phase 3 chưa chạy), nên body actions (`clench fists`, `step back`, `body leans forward`) có thể không phù hợp.

Ngoài ra, acting và cinematographer không sync eye line:
```
Cinematographer: facing = "facing camera"     (Phase 2a)
Acting:          "looks toward Jing Sheng"    (Phase 2b)  → MÂU THUẪN
```

**Fix**: Đưa Visibility Constraint lên Phase 3 + Acting direction — mỗi shot size giới hạn body actions tương ứng. Cấm `"turn back to face away"`, `"step back"` trong Acting Vocabulary Bank. Sau merge cần bước resolve conflict eye line giữa cinematographer và acting.

---

## Bug 3: Shallow DOF + Close-Up cho cảnh 2 người tương tác (Phase 1 + 2a + 3)

**File gốc**: `agent_storyboard_plan.en.txt` + `agent_cinematographer.en.txt` + `agent_storyboard_detail.en.txt`

### Trace đầy đủ

```
Cảnh: "Bạch Dương trách móc Tiểu Hy"

Phase 1 (dòng 25, 73-85): Dialogue Shot Mandatory Rule
  → "Mỗi đoạn hội thoại → 2 panel: speaker + listener reaction"
  → "Speaker must have face-focused independent shot"
  → "Others in background MUST be blurred (DOF treatment)"
  → Panel A: Bạch Dương CU (speaker) + Panel B: Tiểu Hy CU (listener)

Phase 2a (dòng 28, 32-38): Dialogue Shot DOF Rules
  → Close-Up → Shallow DOF (T2.8)
  → "If character is speaking + multiple faces → MUST shallow DOF"
  → "Speaking character's face SHARP, others BLURRED"
  → Purpose: lip-sync — chỉ 1 mặt nét để TTS khớp

Phase 3 (dòng 16, 39): Shot Type Selection
  → Close-Up = "emotions, reactions"
  → daily scene = "Primarily Medium Shot and Close-Up"
  → Bạch Dương giận → chọn "Eye-Level Close-Up"
  → KHÔNG check "có nhân vật thứ 2 đang bị tương tác không?"

Refiner: pass-through DOF từ photographyRules
  → image_prompt: "Bạch Dương sharp, Tiểu Hy in blurred background"
  → Video: Bạch Dương nét, Tiểu Hy mờ → người xem KHÔNG thấy người bị trách
```

### 2 mục tiêu mâu thuẫn trong thiết kế

| Mục tiêu | Phase | Rule |
|----------|-------|------|
| Lip-sync chính xác | Phase 1+2a | Chỉ 1 mặt nét duy nhất (shallow DOF) |
| Story clarity | Người xem | Phải thấy cả 2 người trong tương tác 2 chiều |

> Phase 1+2a **hy sinh story clarity** cho lip-sync. Đúng với dialogue 1 chiều (nói-nghe), **sai** với tương tác 2 chiều (trách móc, cãi nhau, tâm sự, tỏ tình).

### Fix đề xuất

**Phase 1**: Phân biệt dialogue 1 chiều vs tương tác 2 chiều:
- `"X nói với Y: chào"` → tách 2 panel (speaker CU + listener CU) — OK
- `"X trách Y"`, `"X tỏ tình với Y"`, `"X và Y cãi nhau"` → gộp 1 panel Medium Shot cả 2

**Phase 2a**: Exception DOF cho interaction:
- Panel có 2+ characters tương tác trực tiếp → **medium DOF (T4.0)** thay vì shallow
- Hoặc: ghi chú `"both characters sharp, focus on interaction"`

---

## Bug 4: Facing Direction Sai (Phase 2a)

**File gốc**: `agent_cinematographer.en.txt`

### Mô tả

Cảnh 2 người trong cùng panel, nhân vật đang tương tác với người kia nhưng **quay mặt ra camera** thay vì về phía người kia.

```
Bạch Dương trách Tiểu Hy (Tiểu Hy trong frame, dù mờ)
    ↓
Phase 2a (dòng 61): example output facing: "facing camera" — LLM bắt chước
Phase 3: Không có rule "facing toward interaction target"
    ↓
Refiner: image_prompt = "Bạch Dương... center of frame, facing viewer..."
    ↓
Kết quả: Bạch Dương trách khán giả, không phải Tiểu Hy
```

### Fix: ✅ ĐÃ SỬA

Thêm rule vào `agent_cinematographer.en.txt` dòng 132:
```
If 2+ characters in the same panel are directly interacting (speaking to,
scolding, arguing with, looking at, confronting), each character's facing
MUST point toward the character they are interacting with. NEVER use
"facing camera" for a character actively engaged in interaction.
```

---

## Bug 5: Refiner Tự Mâu Thuẫn

**File gốc**: `prompt_refiner.en.txt`

### 2 cặp mâu thuẫn

| Dòng | Rule | Dòng | Rule mâu thuẫn |
|------|------|------|---------------|
| 177 | `Always have a "motion" element — no static descriptions` | 114, 216 | `CONSTRAIN camera to static` / `Camera: MUST remain static` |
| 175 | `ENRICH: complete camera movement, specific actions` | 168 | `NEVER use push, dolly, track, pan, zoom` |

Đây là tàn dư của prompt cũ — LLM bị confusion: "không được static" nhưng "không được camera move" → không còn đường nào.

**Fix**: Xóa dòng 175 và 177.

---

## Bug 6: Image → Video Double Motion (Phase 3 + Refiner)

**File gốc**: `agent_storyboard_detail.en.txt` + `prompt_refiner.en.txt`

### Bằng chứng từ refine-32b0d4e6.json

**3/22 panels (14%)** bị trùng action verb giữa image_prompt và video Action:

```
Panel 1:
  image_prompt:  "pushes the door open and steps into the room, eyes scanning..."
  video Action:  "pushes the door open and steps into the room, eyes smoothly scanning..."

Panel 18:
  image_prompt:  "slowly shakes his head with a long exhale"
  video Action:  "slowly shakes his head with a long exhale"
```

### Root cause

Phase 3 copy action từ description → video_prompt. Refiner nhận video_prompt, nhưng description vẫn chứa action verbs mạnh. Model sinh image_prompt và video_prompt cùng lúc → bị cuốn theo description → rò rỉ action từ description vào cả image lẫn video.

LTX nhận Frame 0 đã là "đang push door" → video tiếp tục "push door" → motion loop/freeze hoặc jitter.

### Pattern nguy hiểm nhất

```
description:    "pushes the door and steps into the living room"  ← action mạnh
image_prompt:   "stands in the doorway, body paused mid-step"     ← frame giữa chừng
existingVideo:  "pushes open the door and steps in"               ← copy 100%
parsedVideo:    "takes a step further into the room"              ← tiếp tục action
```

→ LTX phải animate nhân vật đi tiếp vào phòng từ frame giữa chừng → outpaint pixel.

### Fix

Thêm rule trong `prompt_refiner.en.txt`: 
```
Description field contains dynamic action verbs (pushes, walks, stands up, turns).
These describe narrative ARC, not Frame 0 state. image_prompt MUST freeze ONE
static moment from the arc. video Action MUST animate what follows AFTER that moment.
Never replay the same action verb from image_prompt in video Action.
```

---

## Bug 7: Camera Language Leak vào image_prompt

**File gốc**: `prompt_refiner.en.txt`

### Bằng chứng — refine-32b0d4e6.json Panel 11

```
existingVideo: "camera slowly pushes in towards her face"
image_prompt:  "Close-up, eye-level angle, slow push-in framing."
                                         ^^^^^^^^^^^^^^^^
```

Refiner copy camera movement keyword từ existingVideoPrompt vào **image_prompt** shot description. FLUX bỏ qua nhưng mô tả sai framing logic.

**Fix**: Thêm rule trong `【image_prompt】` section:
```
Do NOT include camera movement language (push-in, track, orbit, zoom, pan)
in the Shot type description. Use only: static frame, fixed frame.
```

---

## Tổng hợp

| Bug | File gốc | Phase | Độ nặng | Trạng thái |
|-----|----------|-------|---------|------------|
| 1. Camera movement | `agent_storyboard_detail.en.txt` | Phase 3 | CRITICAL | Chưa sửa |
| 2. Body action ngoài frame | `agent_acting_direction.en.txt` + `agent_storyboard_detail.en.txt` | Phase 2b + 3 | HIGH | Chưa sửa |
| 3. DOF + Close-Up interaction | `agent_storyboard_plan.en.txt` + `agent_cinematographer.en.txt` | Phase 1 + 2a | HIGH | Chưa sửa |
| 4. Facing direction sai | `agent_cinematographer.en.txt` | Phase 2a | HIGH | ✅ FIXED (dòng 132) |
| 5. Refiner tự mâu thuẫn | `prompt_refiner.en.txt` | Refiner | MEDIUM | Chưa sửa |
| 6. Image → Video double motion | `agent_storyboard_detail.en.txt` + `prompt_refiner.en.txt` | Phase 3 + Refiner | HIGH | Chưa sửa |
| 7. Camera leak vào image_prompt | `prompt_refiner.en.txt` | Refiner | LOW | Chưa sửa |

### Cross-file data evidence

| Bug | File 1 (09567f43, 12 panels) | File 2 (32b0d4e6, 22 panels) |
|-----|------|------|
| Camera move trong existingVideo | 92% (11/12) | 95% (21/22) |
| Camera move sót qua refiner | 8% (1/12) | 14% (3/22) |
| Image → video action duplicate | Chưa đo | 14% (3/22) |
| Camera leak vào image_prompt | 0% | 4.5% (1/22) |

---

*Updated: 2026-06-01 | Data sources: refine-09567f43.json (09567f43) + refine-32b0d4e6.json (32b0d4e6)*
