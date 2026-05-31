# Bug Report: agent_storyboard_detail & prompt_refiner

> Dữ liệu tham khảo: `refine-09567f43.json` (2026-05-30T15:53Z, 12 panels, 100% ok)  
> Mục tiêu pipeline: FLUX sinh ảnh → LTX Video 2.3 + IC-LoRA sinh video từ ảnh đó làm Frame 0

---

## Tóm tắt

| | Phase 3 (agent_storyboard_detail) | Refiner (prompt_refiner) |
|---|---|---|
| **Nhiệm vụ** | Sinh video_prompt thô từ description | Override Phase 3, sinh image_prompt + video_prompt cuối |
| **Input** | description, characters, location | existingVideoPrompt (Phase 3), imagePrompt = null |
| **Output** | video_prompt thô (không có image_prompt) | image_prompt + video_prompt final |

---

## Bug 1 — Phase 3: Camera movement luôn được sinh ra

### Bằng chứng từ data thực

**11/12 panels** trong debug file đều có camera movement trong existingVideoPrompt:

| Panel | Camera keyword trong existingVideoPrompt |
|---|---|
| 0 | `camera gently pans and tracks` |
| 1 | `camera gently tracks backward` |
| 2 | `camera slowly pushes in` |
| 3 | `camera gently orbits around him` |
| 8 | `camera slowly pushes in on his face` |
| 9 | `camera slowly pushes in from over his shoulder` |
| 10 | `camera slowly pushes in on her sulking face` |
| 11 | `camera sways gently following her teasing movement` |
| 12 | `camera pushes forward slightly` |
| 13 | `camera slowly pushes in on his sharp expression` |
| 14 | `camera slowly pushes in on his resolute face` |

→ **Tỷ lệ: 100% (11/12 panels có existingVideoPrompt)**

### Nguyên nhân trong prompt Phase 3

**Line 41** (daily scene rule):
```
✅ Prioritize slow push-in / slow pull-out / slight tracking, avoid purely static shots
```

**Line 95-98** (Camera Movement Word Bank — "must use"):
```
Common: slowly push in, gently track, slight sway, orbit shot
Dynamic: handheld tracking, slight shake, slow orbit, crane up shot
```

**Line 100-109** (Forbid Purely Static — training examples):
```
❌ Wrong: "penguin middle-aged man stands at the door, stern expression"
✅ Right: "penguin middle-aged man pushes the door open and walks in, handheld camera follows"
```

**Line 41** cho `emotion` scene:
```
✅ Prioritize slow push-in, orbiting camera
```

Phase 3 được viết với **triết lý ngược hoàn toàn với LTX**: "phải có camera movement". LTX thì: "camera movement = outpainting = artifact".

---

## Bug 2 — Phase 3: video_prompt copy nguyên action từ description

### Bằng chứng

```
Panel 0:
  description:  "Tiểu Hy stands up from the sofa, mutters, walks toward hallway door"
  existingVideo: "young woman stands up from the sofa, muttering, walks toward hall door"
  → copy 100%

Panel 1:
  description:  "Tiểu Hy walks toward her room, looks back over shoulder"
  existingVideo: "young woman walks toward the room, looks back over her shoulder"
  → copy 100%

Panel 3:
  description:  "eyebrows draw together, exhales slowly through nose, eyes drop to floor"
  existingVideo: "furrows brows, exhales slowly through nose, lowers gaze to floor"
  → paraphrase nhưng cùng action
```

### Nguyên nhân trong prompt Phase 3

**Line 79**:
```
Format: species + appearance + action + camera movement + environment
```

**Line 81**:
```
Do not include content not present in the storyboard panel
```

Phase 3 không có khái niệm **"image = Frame 0"**. Với Phase 3, `description` là mô tả cảnh cần thể hiện → đưa thẳng vào video_prompt. Không có bộ lọc "action này đã hiển thị trong ảnh rồi, không được lặp lại".

---

## Bug 3 — Refiner: Nhận input sai nhưng không có bước Strip cứng

### Vấn đề cấu trúc

Refiner nhận `existingVideoPrompt` từ Phase 3 với:
- Camera movement keywords (push/track/orbit/sway)  
- Action copy từ description

Refiner hiện tại xử lý theo thứ tự:
```
1. COMPARE Action lines against image_prompt → remove duplicates
2. RE-VERIFY Shot block count
3. Preserve narrative meaning...
4. RESTRUCTURE format
5. ENRICH
```

**Thiếu bước 0: STRIP camera movements**. Refiner không có rule nào cấm rõ ràng `push/track/orbit/sway` trong `existingVideoPrompt` trước khi xử lý.

### Bằng chứng: 1 panel camera move sót qua refiner

```
Panel 1:
  existingVideo:  "camera gently tracks backward alongside her"
  parsedVideoPrompt: "...camera sways gently..."   ← camera move sót
```

Refiner đã loại được `tracks backward` nhưng để lọt `sways gently`. Reason: `sway` không bị cấm tường minh.

### Vấn đề thứ 2: COMPARE against image_prompt hoạt động được không?

Khi refiner chạy với 1 LLM call, nó sinh **image_prompt và video_prompt cùng lúc**. Model tự biết image_prompt của mình là gì, nên về lý thuyết có thể COMPARE.

Tuy nhiên:
- `existingVideoPrompt` từ Phase 3 **mang action language rất mạnh** (pushes, walks, shouts)
- Rule "Preserve narrative meaning" có xu hướng giữ lại action language gốc
- Model cần được dặn **strip camera + reframe action** như một bước riêng biệt, không chỉ "compare and remove duplicates"

---

## Bug 4 — Phase 3 & Refiner: Sự ảnh hưởng tiêu cực của `description` kịch bản

### Bản chất vấn đề và rò rỉ ngữ cảnh (Context Bleed)
Refiner tuy không nhận `image_prompt` đầu vào (vì chính nó là khâu tạo ra `image_prompt` và `video_prompt` đồng thời), nhưng nó nhận `description` (mô tả phân cảnh kịch bản từ Phase 1). 

Vì kịch bản chứa các **hành động động rất mạnh** (dynamic action verbs như *pushes open the door, stands up and walks*), và mô tả cả hai đầu ra trong cùng một lượt gọi LLM, Refiner dễ bị cuốn theo ngữ cảnh này và rò rỉ vào cả hai:

1. **Rò rỉ vào `image_prompt` (Action Bleed):** Cố nhét từ chuyển động vào ảnh tĩnh làm Flux sinh ảnh bị nhòe chuyển động hoặc lỗi bộ phận cơ thể.
2. **Rò rỉ vào `video_prompt` (Double Motion):** Replay lại nguyên văn hành động động đó từ đầu, thay vì mô tả hành động tiếp nối tiếp theo.

### Pattern phổ biến nhất

```
description:    "pushes the door and steps into the living room"
image_prompt:   "stands in the doorway, body paused mid-step"  ← frame giữa chừng
existingVideo:  "pushes open the door and steps in"            ← copy toàn bộ action
parsedVideo:    "takes a step further into the room"           ← tiếp tục action
```

Chuỗi này buộc LTX phải **animate nhân vật đi tiếp vào phòng** từ Frame 0 là "đang đứng ở cửa" → LTX phải outpaint pixels phần phòng chưa hiển thị → artifact.

---

## Bug 5 — Phase 3: Shot block format không khớp với Refiner

Phase 3 sinh video_prompt dạng **free text**:
```
"young man leans forward and speaks firmly, gesturing... camera slowly pushes in"
```

Refiner expect format **[Scene] + [Characters] + Shot blocks**:
```
[Scene] ...
[Characters] ...
Shot 1 (Close-Up, 2s): Static camera
Action: ...
```

Khi existingVideoPrompt là free text, refiner phải RESTRUCTURE toàn bộ — trong quá trình đó, dễ carry over camera language từ Phase 3 vào Shot block header hoặc Action line.

---

## Tổng kết nguyên nhân gốc rễ

```
Phase 3 được thiết kế cho pipeline khác (non-LTX)
│
├── Bug 1: Actively teaches camera movement (push/track/orbit)
│   → Xuất hiện trong 11/12 panels (100%)
│
├── Bug 2: Copies action from description verbatim
│   → Không có khái niệm "image = Frame 0"
│
└── Bug 4: Không phân biệt "dynamic action" vs "static state"
    → LTX nhận video_prompt "tiếp tục action" → outpaint

Refiner thiếu:
├── Bug 3a: Không có bước STRIP camera movement cứng
│   → 1 panel trong 12 còn sót camera move
│
└── Bug 3b: "Preserve narrative meaning" giữ lại action language Phase 3
    → Không đủ aggressive để reframe từ "action đang xảy ra" thành "state sau action"
```

---

## Hướng sửa đề xuất

### Phương án A — Chỉ sửa Refiner (ít rủi ro hơn)

Thêm vào `existingVideoPrompt is NOT empty`, **trước bước 1**:

```
0. STRIP: Remove all camera movement language from existingVideoPrompt before any other step.
   Camera move keywords to strip: push in, pull out, track, pan, orbit, zoom, sway, handheld, crane, dolly.
   Replace camera move phrases with "static camera".
   This is mandatory — Phase 3 always generates camera movements that are incompatible with LTX.
```

Và thêm rule tường minh vào phần Action:
```
Action lines MUST NOT contain: push, track, orbit, pan, sway, handheld, zoom, crane.
If existingVideoPrompt contains these, replace the entire Action with what follows AFTER the state in image_prompt.
```

### Phương án B — Sửa Phase 3 align với LTX (rủi ro cao hơn, lợi ích lớn hơn)

Thay thế toàn bộ triết lý "camera movement mandatory" trong Phase 3:
- Xóa Camera Movement Word Bank cho `daily` và `emotion` scenes
- Xóa rule "Forbid Purely Static Descriptions"
- Thêm rule: "For LTX pipeline: camera MUST be static. Character actions only."

> [!WARNING]
> Phương án B thay đổi Phase 3 ảnh hưởng toàn bộ pipeline, không chỉ video_prompt. Test kỹ trước khi apply.

---

*Report generated: 2026-05-31 | Data source: refine-09567f43.json (episode 09567f43)*

---

## Phân tích File 2 — refine-32b0d4e6.json

> Episode: `32b0d4e6` | Saved: 2026-05-29T20:27Z | 22 panels | 100% ok

### Điểm khác biệt so với File 1

| | File 1 (09567f43) | File 2 (32b0d4e6) |
|---|---|---|
| Số panels | 12 | 22 |
| Camera move trong existingVideo | 11/12 (92%) | 21/22 (95%) |
| Camera move sót trong output | 1/12 (8%) | 3/22 (14%) |
| image→video action duplicate | Chưa đo | **3/22 (14%)** |

---

### Bug mới — B7: image_prompt và video_prompt dùng cùng action verb (double-motion)

**3 panels bị lỗi này:**

**Panel 1** — `pushes`, `steps` xuất hiện trong cả image lẫn video:
```
[image_prompt]:  "pushes the door open and steps into the room, eyes scanning..."
[video Action]:  "pushes the door open and steps into the room, eyes smoothly scanning..."
```
LTX nhận Frame 0 là "đang push door" → video tiếp tục "push door" → **toàn bộ motion bị loop/freeze**.

**Panel 18** — `shakes` (head) duplicate:
```
[image_prompt]:  "slowly shakes his head with a long exhale"
[video Action]:  "slowly shakes his head with a long exhale"
```
→ LTX không biết phải animate gì khác → micro-jitter trên chỗ head shake.

**Panel 21** — `stands` duplicate (ít nguy hiểm hơn vì stands là trạng thái tĩnh):
```
[image_prompt]:  "a young man stands alone in the center"
[video Action]:  "bạch dương stands erect yet slightly bowed"
```

**Nguyên nhân:** Panel 1 là case nguy hiểm nhất — `description` chứa action động (`pushes door, steps into room`), image_prompt capture đúng giữa action đó, video_prompt không nhận ra đây là Frame 0 đã render mà tiếp tục action từ đầu.

Đây xác nhận **Bug 4** đã phân tích ở File 1: description dynamic action → image giữa chừng → video replay từ đầu.

---

### 3 Panels camera move sót qua refiner

**Panel 1:**
```
existingVideo: "camera gently tracks backward accompanying his entrance"
output Shot 1: (không thấy "tracks" nhưng context của action vẫn implied movement)
→ Refiner loại được camera language nhưng giữ nguyên action "pushes door + steps in"
```

**Panel 11:**
```
existingVideo: "camera slowly pushes in towards her face"
image_prompt:  "slow push-in framing" ← MODEL COPY camera language vào image_prompt!
output video:  không còn "push" tường minh nhưng image_prompt đã sai
```
> ⚠️ Đây là lỗi mới: refiner copy camera movement keyword từ existingVideoPrompt vào **image_prompt** ("slow push-in framing" xuất hiện ở Close-up shot description). FLUX không bị ảnh hưởng nhưng mô tả sai framing.

**Panel 17:**
```
existingVideo: "camera gently tracks alongside her"
output Action: "rises from the stool... walks away towards the hallway"
→ Camera keyword bị loại, nhưng action "walks towards hallway" = character đi ra khỏi frame → outpaint risk
```

---

### Tổng hợp cross-file

| Bug | File 1 | File 2 | Kết luận |
|---|---|---|---|
| Camera move trong existingVideo | 92% | 95% | **Constant — Phase 3 luôn sinh** |
| Camera move sót qua refiner | 8% | 14% | Tăng — refiner chưa strip đủ |
| image→video action duplicate | Chưa đo | 14% | **Bug nghiêm trọng, xác nhận lý thuyết (ảnh hưởng bởi `description` kịch bản)** |
| Camera language leak vào image_prompt | 0% | 4.5% | Bug mới, ít gặp |

---

### Phát hiện bổ sung — Panel 11: camera keyword leak vào image_prompt

Đây là bug chưa được document trước đó. Khi `existingVideoPrompt` chứa `"camera slowly pushes in towards her face"`, refiner sinh image_prompt với mô tả:
```
"Close-up, eye-level angle, slow push-in framing."
```
`slow push-in framing` là camera movement language không nên có trong image_prompt (FLUX sẽ bỏ qua nhưng gây nhầm lẫn về framing). Root cause: model lấy camera movement từ existingVideoPrompt làm context để describe shot type trong image_prompt.

**Fix cần thiết:** Thêm rule trong `【image_prompt】` section:
```
Do NOT include camera movement language (push-in, track, orbit, zoom, pan)
in the Shot type description. Use only: static frame, fixed frame, eye-level, etc.
```

---

*File 2 analysis added: 2026-05-31 | Data source: refine-32b0d4e6.json (episode 32b0d4e6)*

