# Bug Report: I2V Pipeline — Storyboard → Refiner

## Tổng quan

Toàn bộ pipeline Phase 1 → Phase 2 → Phase 3 → Refiner → Image → Video có 5 bug cấu trúc, gây ra: outpainting, style mismatch, nhân vật bị mờ, hướng mặt sai, và rò rỉ camera movement.

---

## Bug 1: Camera Movement (Phase 3 ↔ Refiner)

### Mô tả

Phase 3 **bắt buộc** camera movement cho tất cả scene types. Refiner **cấm tất cả** camera movement. Kết quả: Refiner phải vá từng video_prompt, nếu vá không kín → LTX outpainting ở viền frame → style mismatch.

### File liên quan

| File | Dòng | Rule |
|------|------|------|
| `agent_storyboard_detail.en.txt` | 28-34 | Camera Movement library: Static, Push-in/Pull-out, Tracking, Zoom, Orbit/Crane, Handheld |
| `agent_storyboard_detail.en.txt` | 41 | daily: `✅ Prioritize slow push-in / slow pull-out / slight tracking, avoid purely static shots` |
| `agent_storyboard_detail.en.txt` | 48 | emotion: `✅ Prioritize slow push-in, orbiting camera, avoid purely static shots` |
| `agent_storyboard_detail.en.txt` | 55 | action: `Snap zoom in/out, tracking, handheld shake` |
| `agent_storyboard_detail.en.txt` | 62 | epic: `slowly crane up, rapidly dive down, orbit` |
| `agent_storyboard_detail.en.txt` | 66 | suspense: `Slow push-in to create pressure` |
| `agent_storyboard_detail.en.txt` | 95-98 | Camera Movement Word Bank: `prioritize these; avoid "static"` |
| `agent_storyboard_detail.en.txt` | 100-109 | `Forbid Purely Static Descriptions` — cấm static camera + static character |
| `prompt_refiner.en.txt` | 114 | `CONSTRAIN camera and background to static` |
| `prompt_refiner.en.txt` | 122,142 | Shot format: `Static camera` mandatory |
| `prompt_refiner.en.txt` | 168 | `NEVER use push, dolly, track, pan, zoom` |
| `prompt_refiner.en.txt` | 216 | LTX guidance: `Camera: MUST remain static (NO push, dolly, track, pan, zoom)` |

### Root cause

`agent_storyboard_detail.en.txt` viết theo triết lý **cinematography live-action** ("phim không được cứng"), trong khi LTX Video 2.3 là **I2V model** không có khả năng invent pixel ngoài frame gốc.

### Fix đề xuất

Sửa `agent_storyboard_detail.en.txt`:
- Xóa `Forbid Purely Static Descriptions` (dòng 100-109)
- Xóa `Camera Movement Word Bank` (dòng 95-98)
- Sửa tất cả scene type: từ `"avoid static"` → `"static camera mandatory"`
- Giữ ngoại lệ cho Extreme Close-Up (đã có dòng 125-129)
- Thay `"keep the frame alive"` bằng _micro-actions trong frame thay vì camera move_

---

## Bug 2: Body Action ngoài Visible Frame (Phase 3 ↔ Refiner)

### Mô tả

Phase 3 có **Character Action Word Bank** (dòng 89-93) bắt buộc dùng 15+ body actions (walk, turn around, stand up, raise hand, etc.) mà **không kèm điều kiện visibility**. Refiner có **Visibility Constraint** (dòng 152-160) giới hạn action theo body parts visible trong image_prompt. Nếu Refiner bỏ sót → LTX phải invent body parts không có trong ảnh gốc → outpainting → style mismatch.

### File liên quan

| File | Dòng | Rule |
|------|------|------|
| `agent_storyboard_detail.en.txt` | 89-93 | Character Action Word Bank (must use): 4 nhóm — Head, Hands, Body, Expression |
| `agent_storyboard_detail.en.txt` | 43 | daily: `add subtle movements (nod, turn head, gesture, walk)` |
| `agent_storyboard_detail.en.txt` | 50 | emotion: `raise head, turn around, lower head, raise hand to wipe tears, walk toward window` |
| `agent_storyboard_detail.en.txt` | 107-109 | `Even dialogue scenes must have motion` — gesturing + nodding + camera push |
| `prompt_refiner.en.txt` | 152-160 | Visibility Constraint: action giới hạn theo body parts visible |
| `prompt_refiner.en.txt` | 159 | `Full face visible → facial expressions, eyes, lips, head movement` |
| `prompt_refiner.en.txt` | 158 | `Full body visible → full body movements, posture changes, walking` |

### Các case nguy hiểm (Phase 3 tạo, Refiner phải vá)

| Shot type | Body actions visible trong frame | Phase 3 có thể thêm | Nguy hiểm |
|-----------|----------------------------------|---------------------|-----------|
| Close-Up mặt | Chỉ mặt, cổ | `"gesturing with both hands"` (dòng 109) | ❌ Tay không visible → LTX invent |
| Extreme Close-Up mắt | Chỉ mắt | `"turn head, raise hand"` | ❌ Không có trong frame |
| Over-the-Shoulder (OTS) | Vai + lưng người foreground | `"turn to face camera"` | ❌ Mặt chưa có → LTX invent mặt |
| Half-body | Nửa thân trên | `"walk, stand up"` | ❌ Chân không visible |
| Full body | Toàn thân | Bất kỳ action nào | ✅ An toàn |

### Root cause

Phase 3 viết body actions như thể đạo diễn chỉ đạo diễn viên, không biết Frame 0 sẽ crop đến đâu. LLM không thấy ảnh.

### Fix đề xuất

Đưa Visibility Constraint **lên Phase 3** — mỗi shot size → giới hạn action tương ứng:
- Close-Up: chỉ expression + head tilt
- OTS: chỉ shoulder/breathing
- Half-body: chỉ upper body gestures
- Full body: toàn bộ actions

---

## Bug 3: Shallow DOF + Close-Up cho cảnh 2 người tương tác (Phase 1 + 2 + 3)

### Mô tả

Cảnh 2 nhân vật tương tác trực tiếp (trách móc, cãi nhau, tâm sự, tỏ tình, ...), Phase 1+2+3 phối hợp tạo ra: Close-Up + shallow DOF → 1 người nét, 1 người mờ. Kết quả: người bị tương tác không thấy được mặt → hỏng story.

### Trace qua 4 phase

#### Phase 1 — `agent_storyboard_plan.en.txt`

```
Dòng 25:   Each dialogue segment → 2 shots (speaker + listener reaction)
Dòng 73-85: Dialogue Shot Mandatory Rule:
  - Speaker must have face-focused independent shot
  - Multiple characters speaking in same shot → FORBIDDEN
  - Others may appear in background, but MUST be BLURRED (DOF treatment)
```

→ Phase 1 luôn tách dialogue thành 2 panel riêng: speaker close-up + listener reaction.

#### Phase 2 — `agent_cinematographer.en.txt`

```
Dòng 28:   Close-Up: Shallow DOF (T2.8), slight background blur
Dòng 32-38: ⚠️ Dialogue Shot DOF Rules — Lip Sync Requirements:
  - Shot where character is speaking + multiple faces → MUST shallow DOF (T2.8 or smaller)
  - Speaking character's face: SHARP FOCUS. Other characters: BLURRED
  - Purpose: avoid multiple clear faces → prevent lip-sync recognition errors
```

→ Phase 2 áp shallow DOF **bắt buộc** cho mọi panel speaker có mặt người khác.

#### Phase 3 — `agent_storyboard_detail.en.txt`

```
Dòng 16:   Close-Up: emotions, reactions
Dòng 39:   daily: Primarily Medium Shot and Close-Up
```

→ Phase 3 thấy nhân vật giận (emotion) → chọn Close-Up để capture emotion. Không check "có nhân vật thứ 2 đang bị tương tác không?"

#### Refiner — `prompt_refiner.en.txt`

```
Dòng 55:   Apply photographyRules (depth_of_field) to image_prompt
```

→ Refiner **pass-through nguyên vẹn** shallow DOF từ Phase 2 vào image_prompt. Không override.

### Chuỗi bug đầy đủ

```
Phase 1: "Bạch Dương trách Tiểu Hy" → Panel A: speaker CU + Panel B: listener reaction
    ↓
Phase 2: Panel A → shallow DOF (T2.8) BẮT BUỘC (lip-sync + Close-Up + multiple faces)
    ↓
Phase 3: Bạch Dương giận → shot_type = "Eye-Level Close-Up"  (emotion trigger)
    ↓
Refiner: image_prompt = "Close-up, Bạch Dương in sharp focus, Tiểu Hy in blurred background"
    ↓
Video: Bạch Dương nét, Tiểu Hy MỜ → người xem không thấy được người bị trách
```

### 2 mục tiêu mâu thuẫn

| Mục tiêu | Phase | Rule |
|----------|-------|------|
| Lip-sync chính xác | Phase 1+2 | Chỉ 1 mặt nét duy nhất (shallow DOF) |
| Story clarity | Người xem | Cần thấy cả 2 người trong tương tác 2 chiều |

> Phase 1+2 **hy sinh story clarity** cho lip-sync. Đúng với dialogue 1 chiều, **sai** với tương tác 2 chiều (trách, cãi, tâm sự, tỏ tình).

### Fix đề xuất

**Phase 1**: Phân biệt dialogue 1 chiều và tương tác 2 chiều:
- `"X says to Y: Hello"` (nói 1 chiều) → tách 2 panel (speaker CU + listener CU) → OK
- `"X scolds Y"`, `"X confesses to Y"`, `"X and Y argue"` (tương tác 2 chiều) → gộp 1 panel Medium Shot cả 2

**Phase 2**: Exception cho tương tác 2 chiều:
- Khi panel có 2+ characters interacting → **medium DOF (T4.0)** thay vì shallow
- Hoặc: ghi chú `"both characters sharp"`

---

## Bug 4: Facing Direction Sai (Phase 2)

### Mô tả

Cảnh 2 người trong cùng panel, nhân vật đang tương tác với người kia nhưng **quay mặt ra camera** thay vì quay về phía người kia.

### Trace

```
Panel: Bạch Dương đang trách Tiểu Hy (Tiểu Hy trong frame, dù bị mờ)
    ↓
Phase 2 (dòng 61): ví dụ output `facing: "facing camera"`  — LLM bắt chước
Phase 3: Không có rule nào nói "facing toward interaction target"
    ↓
Refiner: image_prompt = "Bạch Dương... center of frame, facing viewer, sharp focus..."
    ↓
Kết quả: Bạch Dương trách khán giả, không phải Tiểu Hy
```

### Root cause

Cinematography convention: Close-Up mặt → face camera. Convention này **chỉ đúng khi 1 nhân vật trong shot**. Khi 2+ người cùng panel, mặt phải hướng về người kia. Phase 2 không có rule này.

### Fix đề xuất

Phase 2 (`agent_cinematographer.en.txt`): Thêm rule:
> "If multiple characters exist in the same panel, facing direction MUST be toward the interaction target, NEVER toward camera. Only use `facing camera` when character is alone in frame."

---

## Bug 5: Tự mâu thuẫn trong Refiner

### Mô tả

`prompt_refiner.en.txt` có 2 cặp rule mâu thuẫn — tàn dư của prompt cũ chưa được dọn.

### Các cặp mâu thuẫn

| # | Dòng | Rule | Dòng | Rule mâu thuẫn với |
|---|------|------|------|---------------------|
| 5a | 177 | `Always have a "motion" element — no static descriptions` | 114, 216 | `CONSTRAIN camera to static` / `Camera: MUST remain static` |
| 5b | 175 | `ENRICH: complete camera movement, specific actions` | 168 | `NEVER use push, dolly, track, pan, zoom` |

### Hệ quả

LLM bị confusion: "không được static description" (dòng 177) nhưng "không được camera move" (dòng 168) → không còn đường nào. Có thể dẫn đến:
- Rò rỉ camera movement (nếu LLM theo dòng 177)
- Video_prompt rỗng (nếu LLM không biết viết gì)
- Inconsistency giữa các panel

### Fix đề xuất

Xóa dòng 175 và 177 — chúng là tàn dư của version cũ, mâu thuẫn với toàn bộ philosophy mới (static camera, visibility constraint).

---

## Tổng kết

| Bug | Phase gốc | File cần sửa | Mức độ |
|-----|-----------|-------------|--------|
| 1. Camera movement | Phase 3 | `agent_storyboard_detail.en.txt` | CRITICAL |
| 2. Body action invisible | Phase 3 | `agent_storyboard_detail.en.txt` | HIGH |
| 3. Shallow DOF + Close-Up cho interaction | Phase 1+2 | `agent_storyboard_plan.en.txt` + `agent_cinematographer.en.txt` | HIGH |
| 4. Facing direction sai | Phase 2 | `agent_cinematographer.en.txt` | HIGH |
| 5. Refiner tự mâu thuẫn | Refiner | `prompt_refiner.en.txt` | MEDIUM |

### Nguyên lý chung

> **Phase 1-3 viết theo triết lý cinematography live-action. Refiner viết theo triết lý I2V (Image-to-Video). Hai triết lý mâu thuẫn → Refiner trở thành "vá lỗi" cho Phase 1-3 → nếu vá không kín → hỏng video.**

Fix triệt để: đồng bộ toàn bộ Phase 1-3 về triết lý I2V-compatible.
