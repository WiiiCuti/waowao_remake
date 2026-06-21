# Nâng cấp Tư duy Điện ảnh — Ứng dụng kỹ thuật từ Drama Director Skill

> **Nguyên tắc:** Không ép số panel (không 3×3 cố định). Phase 1 tự quyết định số panel dựa trên nội dung.  
> Các kỹ thuật từ drama-director-skill (Archetype Router, Double Contrast Editing, Physical Micro-expressions, No Joint Mechanics, Insert Shots, Engine Hard Constraints) được áp dụng **trên số panel mà Phase 1 chọn**, không áp dụng grid cứng.

---

## Tổng quan các kỹ thuật sẽ áp dụng

| # | Kỹ thuật | Áp dụng vào | Mức độ ưu tiên |
|---|----------|-------------|----------------|
| 1 | **Scene Archetype Router** (9 mode) | Phase 1 + Phase 2a (cinematographer) | 🔴 Cao |
| 2 | **Double Contrast Editing** | Phase 2a (cinematographer) | 🔴 Cao |
| 3 | **Physical Micro-expressions** | Prompt Refiner | 🟡 Trung bình |
| 4 | **No Joint Mechanics** | Prompt Refiner | 🟢 Thấp (dễ) |
| 5 | **Insert Shots with causal motivation** | Phase 1 | 🟡 Trung bình |
| 6 | **Engine Hard Constraints** (LTX-specific) | Prompt Refiner | 🟡 Trung bình |
| 7 | **Three-section video_prompt** (Style & Mood → Dynamic → Static) | Prompt Refiner | 🟡 Trung bình |

---

## 🔴 1. Scene Archetype Router

### Mục tiêu
Phase 1 chọn archetype cho từng scene/clip, thay thế `scene_type` hiện tại (`daily/emotion/action/epic/suspense`) bằng 9 archetype điện ảnh. Archetype quyết định: số lượng panel, pacing, framing, camera movement.

### 9 Archetypes

| Archetype | Loại scene | Framing rule | Camera focus | Spatial dynamic |
|-----------|-----------|-------------|-------------|-----------------|
| **Impact** | Hành động | Single decisive moment; establishing (Wide) → decisive (Medium) → aftermath (CU) | Điểm va chạm ở center frame | Slow → fast → slow |
| **Duel** | Đối đầu qua lại | Thay đổi low-angle cho người lợi thế; không ai giữ advantage quá 1 shot liên tiếp | Người đang chiếm ưu thế | 2 bên đổi chỗ liên tục |
| **Pursuit** | Rượt đuổi | Wide (khoảng cách xa) → Medium (khoảng cách gần) | Khoảng cách đang thu hẹp/mở rộng | Path thay đổi độ rộng |
| **Journey** | Di chuyển / khám phá | Tracking, aerial, follow | Nhân vật di chuyển qua không gian | Character xuyên suốt space |
| **Atmosphere** | Không khí / cảm xúc | Slow push hoặc static; minimal movement | Vi biểu cảm, thay đổi rất nhỏ | Gần như tĩnh, micro changes là drama |
| **Reveal** | Tiết lộ / bất ngờ | Hidden → visible (mở cửa, tan sương, lật góc) | Camera kiểm soát thời điểm lộ | Hẹp → rộng, tối → sáng |
| **Confrontation** | Đối thoại căng thẳng | OTS chật, power shift thì cross 180° axis | Không gian giữa 2 người | 2 bên đẩy qua đẩy lại |
| **Interrogation** | Tra hỏi / không cân xứng | Low-angle người hỏi, high-angle người bị hỏi; silent thì push-in CU | Người hỏi (dominant) | 1 chiều, bất đối xứng |
| **Negotiation** | Đàm phán / bình đẳng | Symmetrical, matched shot sizes, Medium Two-Shot | Cả 2, không ai dominant | 2 bên đều có không gian |

### Cách triển khai

**Phase 1 (`agent_storyboard_plan.en.txt`):**
- Thêm `[Scene Archetype Selection]` section trước `[Shot Breakdown Rules]`
- LLM đọc toàn bộ clip_content → xác định archetype phù hợp
- `scene_type` field trong panel output dùng archetype name thay vì `daily/emotion/action`
- Archetype ảnh hưởng đến:
  - **Panel count**: Impact = 3-5 panel (setup → decisive → aftermath) vs Atmosphere = 1-3 panel (slow, ít cut)
  - **Shot type sequence**: Duel bắt buộc alternating POV, Reveal bắt buộc wide → medium → close-up
  - **Pacing**: Impact có nhịp slow → fast → slow, Pursuit có nhịp accelerating

**Phase 2a (`agent_cinematographer.en.txt`):**
- Nhận `scene_type` là archetype từ Phase 1
- Thêm rules tương ứng cho từng archetype (ví dụ: Duel → không ai chiếm advantage 2 shot liên tiếp, Interrogation → low-angle cho người hỏi)

**Phase 3 (`agent_storyboard_detail.en.txt`):**
- Giữ nguyên archetype trong `scene_type`
- `shot_type` chọn phải phù hợp với archetype (VD: Atmosphere → ưu tiên static + slow push)

**Prompt Refiner (`prompt_refiner.en.txt`):**
- Tham khảo `scene_type` (archetype) để quyết định video_prompt pacing
- Archetype ảnh hưởng đến số shot blocks trong video_prompt và camera characteristic

### Vấn đề cần kiểm tra
- Backend có hardcode `scene_type` ở đâu không? Các file như `storyboard-phases.ts`, `panel-duration.ts`, `useVideoPanelsProjection.ts` cần kiểm tra
- `scene_type` hiện tại được lưu trong DB → migration dữ liệu cũ

---

## 🔴 2. Double Contrast Editing

### Mục tiêu
Mỗi cut giữa 2 panel adjacent phải đổi **cả 2** dimension: shot scale + camera characteristic, tránh cảnh liên tiếp giống nhau.

### Dimension 1: Shot Scale
```
Extreme Wide → Wide / Full Shot → Medium → Medium Close-Up → Close-Up → Extreme Close-Up
```
Không được lặp lại scale ở 2 panel liên tiếp (trừ khi cố ý, VD: Atmosphere cần consistent framing).

### Dimension 2: Camera Characteristic
```
Handheld / Static / Stabilized Tracking / Crane / Aerial
```
Không được lặp lại camera characteristic ở 2 panel liên tiếp.

### Ví dụ
**Sai ❌:**
```
Panel 1: Eye-Level Medium Shot (Static)
Panel 2: Eye-Level Medium Shot (Static)
→ Cả scale lẫn camera đều giống → nhàm
```

**Đúng ✅:**
```
Panel 1: Eye-Level Wide Shot (Static)
Panel 2: Eye-Level Medium Close-Up (Handheld)
Panel 3: Low-Angle Close-Up (Static)
→ Scale đổi: Wide → MCU → CU
→ Camera đổi: Static → Handheld → Static
```

### Cách triển khai

**Phase 2a (`agent_cinematographer.en.txt`):**
- Thêm `[Double Contrast Editing Rule]`: Khi nhìn toàn bộ sequence panels trong 1 clip, ensure không có 2 panel adjacent cùng shot scale + camera characteristic
- Ngoại lệ: Atmosphere archetype có thể repeat static scale nếu intentional
- Ngoại lệ: Dialogue sequence (Confrontation/Negotiation) có thể repeat Medium Two-Shot nếu alternating OTS

**Phase 3 (`agent_storyboard_detail.en.txt`):**
- `shot_type` phải respect scale progression từ cinematographer
- Nếu cinematographer không set camera_move, Phase 3 tự quyết định dùng rule Double Contrast

**Prompt Refiner (`prompt_refiner.en.txt`):**
- Khi gen video_prompt cho 1 panel, tham khảo `cameraMove` và `shotType` của panel trước để đảm bảo contrast

---

## 🟡 3. Physical Micro-expressions

### Mục tiêu
Không dùng emotion labels (tức giận, buồn bã, ngạc nhiên). Thay bằng mô tả vật lý những gì camera thấy được.

### Thay thế

| Emotion Label ❌ | Physical Description ✅ |
|-----------------|----------------------|
| "Tức giận" | "Nghiến chặt hàm, lỗ mũi phập phồng, gân xanh nổi trên trán" |
| "Buồn bã" | "Ánh mắt chùng xuống, khóe môi rũ nhẹ, vai trùng" |
| "Ngạc nhiên" | "Lông mày giật lên, đồng tử mở rộng, miệng hé mở" |
| "Lo lắng" | "Ngón tay bấu vào lòng bàn tay, mắt liếc nhanh sang trái, nhịp thở gấp" |
| "Vui vẻ" | "Khóe mắt nhăn nhẹ, môi kéo lên, vai thả lỏng" |

### Cách triển khai

**Phase 2b (`agent_acting_direction.en.txt`):**
- `acting` field phải dùng physical descriptions, không dùng emotion labels
- Thêm rule: "Describe ONLY what can be seen on camera. No abstract emotions."

**Prompt Refiner (`prompt_refiner.en.txt`):**
- `video_prompt` Action lines: bắt buộc dùng physical micro-expressions
- `image_prompt`: khi mô tả biểu cảm nhân vật, dùng physical details

---

## 🟢 4. No Joint Mechanics

### Mục tiêu
Không mô tả góc khớp xương máy móc. Dùng mô tả theo mục đích hoặc sức nặng.

### Thay thế

| Joint Mechanics ❌ | Intent-based ✅ |
|-------------------|----------------|
| "Xoay cẳng tay 45 độ" | "Giáng một đòn mạnh" |
| "Gập khuỷu tay 90 độ" | "Kéo mạnh cánh cửa về phía mình" |
| "Xoay cổ 30 độ sang trái" | "Từ từ quay đầu nhìn sang trái" |
| "Nâng chân lên 60 độ" | "Bước lên một bước dài" |
| "Siết cơ vai" | "Vai căng cứng, cả người như sẵn sàng lao tới" |

### Cách triển khai

**Prompt Refiner (`prompt_refiner.en.txt`):**
- Thêm rule ở `video_prompt` section: "Forbidden: joint angle descriptions (rotate forearm 45°, bend elbow 90°). Use intent-based or weight-based descriptions (throws a heavy punch, pulls the door open, slowly turns head)."

---

## 🟡 5. Insert Shots with Causal Motivation

### Mục tiêu
Nâng cấp xử lý B-roll `[...]` và Insert Shots: mỗi insert phải có **causal motivation** (lý do tại sao camera chuyển sang insert đó).

### Hiện tại
`[...]` = mandatory panel riêng. Nhưng không có rule về motivation.

### Thêm
Khi LLM quyết định thêm Insert Shot (không phải `[...]` từ gốc, mà tự thêm để tăng cảm xúc):
- Insert phải có **cause**: "HERO bị đánh ngã → CUT vào tay hắn bám mép bàn" chứ không phải "tay nắm mép bàn" random
- Insert shot **luôn là kết quả** của action trước đó, không đứng độc lập
- Thời lượng insert: 0.3-0.5s (đối với video gen)

### Cách triển khai

**Phase 1 (`agent_storyboard_plan.en.txt`):**
- Thêm `[Insert Shot Rules]`: LLM có thể thêm insert panel KHÔNG có trong text gốc, nhưng phải có causal motivation
- Insert panel có `scene_type = "insert"` (archetype mới)
- Panel này sẽ có duration = 2s (giống ECU B-roll)

---

## 🟡 6. Engine Hard Constraints (cho LTX 2.3)

### Mục tiêu
Đảm bảo video_prompt không chứa mô tả mà LTX 2.3 không render được.

### Constraints từ drama-director (đã được adapted)

| Constraint | drama-director (Seedance) | WaooWaoo (LTX 2.3) |
|-----------|--------------------------|-------------------|
| Joint mechanics | ❌ Cấm | ❌ Cấm (No Joint Mechanics) |
| Destruction sequence | ❌ Cấm mô tả phá hủy | ✅ Cho phép nhưng ít detail |
| Mirror/water reflection | ❌ Cấm | ❌ Cấm |
| Exit + re-entry (1 shot) | ❌ Cấm | ❌ Cấm (1 shot = 1 panel, camera static) |
| Off-screen events | ❌ Cấm | ❌ Cấm |
| ≤3 tracking characters | ✅ | ✅ |
| Restate positions after cut | ✅ | ✅ |

### Cách triển khai

**Prompt Refiner (`prompt_refiner.en.txt`):**
- Thêm `[LTX 2.3 Engine Constraints]` section:
  - No mirror/water/glass reflections
  - All actions must be visible in frame (no off-screen)
  - Re-state character positions after each cut
  - Track ≤ 3 characters per scene

---

## 🟡 7. Three-Section video_prompt Structure

### Mục tiêu
Thay đổi cấu trúc `video_prompt` từ per-shot blocks sang cấu trúc 3 phần (Style & Mood → Dynamic → Static) xuyên suốt cả batch.

### Hiện tại
Mỗi panel có video_prompt riêng với `[Scene]`, `[Characters]`, `Shot N` blocks.

### Mới (cho Prompt Refiner)
Khi refiner gen video_prompt cho 1 batch panels, thay vì mỗi panel 1 prompt riêng, gen **1 video_prompt mô tả flow**:

```
[Style & Mood] <bảng màu, lighting, lens, atmosphere cho toàn bộ scene>

[Dynamic Description]
Panel 1 (Wide, 4s): Static camera. <action>
Hard cut to
Panel 2 (Medium CU, 3s): Handheld. <action>
Hard cut to
Panel 3 (Close-Up, 3s): Static. <action>

[Static Description] <location, props, environment details>
```

Sau đó tách ra thành video_prompt cho từng panel riêng lẻ (để lưu DB + gen video), nhưng nội dung đã được viết trong context của toàn bộ sequence.

### Cách triển khai
- `WINDOW_SIZE` trong `prompt-refiner.ts` tăng từ 8 lên 20 (cả clip)
- Refiner gen 1 output cho cả batch, parse thành per-panel prompts
- Thêm `[Three-Section video_prompt]` vào `prompt_refiner.en.txt`

---

## Tổng hợp: Pipeline mới

```
agent_clip ───► clips[]
    │
    ▼
Phase 1 (Storyboard Plan)
  ├── Chọn Archetype (Impact/Duel/Journey...)
  ├── Xác định panel theo scene logic (không ép số)
  ├── Insert Shots nếu cần (có causal motivation)
  └── scene_type = archetype name
    │
    ▼
Phase 2a (Cinematographer)
  ├── Nhận archetype từ Phase 1
  ├── Double Contrast Editing: không 2 panel liên tiếp cùng scale + camera
  └── Framing theo rule của archetype
    │
    ▼
Phase 2b (Acting Direction)
  └── Physical Micro-expressions (không emotion labels)
    │
    ▼
Phase 3 (Detail)
  └── Giữ nguyên archetype, chọn shot_type phù hợp
    │
    ▼
MergePanelsWithRules
    │
    ▼
Prompt Refiner (WINDOW_SIZE = 20)
  ├── Physical Micro-expressions
  ├── No Joint Mechanics
  ├── LTX 2.3 Hard Constraints
  ├── 3-section video_prompt (Style & Mood → Dynamic → Static)
  └── image_prompt + video_prompt per panel (nhưng đã biết context toàn clip)
    │
    ▼
Image gen → Video gen → Merge
```

---

## Lộ trình triển khai

| Giai đoạn | Nội dung | File cần sửa | Thời gian |
|-----------|----------|-------------|-----------|
| **1** | Replace agent_storyboard_plan (fix split bug + archetype) | `agent_storyboard_plan.en.txt` | 1 ngày |
| **2** | Thêm Double Contrast + Archetype rules vào cinematographer | `agent_cinematographer.en.txt` | 1 ngày |
| **3** | Physical Micro-expressions vào acting direction | `agent_acting_direction.en.txt` | 0.5 ngày |
| **4** | Cập nhật refiner: 3-section, physical micro, no joint, hard constraints | `prompt_refiner.en.txt` | 1 ngày |
| **5** | Tăng WINDOW_SIZE + parse 3-section output | `prompt-refiner.ts` | 0.5 ngày |
| **6** | Kiểm tra backend hardcode scene_type | Nhiều file | 0.5 ngày |

---

## Câu hỏi cần trả lời trước khi triển khai

1. Backend có chỗ nào hardcode `scene_type = "daily"` không? (check `storyboard-phases.ts`, `useVideoPanelsProjection.ts`, AI data modal types)
2. `WINDOW_SIZE = 20` có impact đến token cost / rate limit không?
3. 3-section video_prompt có parse được để lưu vào DB per-panel không? (cần thiết kế output format)
4. Các panel cũ có `scene_type` cũ → migration hay bỏ qua?
