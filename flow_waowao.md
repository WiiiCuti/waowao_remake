# Flow chi tiết — pipeline storyboard với truyện "Hôm nay trời bất chợt đổ mưa"

> Dùng chính xác truyện gốc, cột mốc từng step dựa trên code thật (`orchestrator.ts`, `mergePanelsWithRules`)

---

## Step 0: Đầu vào

```
Truyện gốc (để nguyên, không rewrite):

"Hôm nay trời bất chợt đổ mưa. Minh đứng dưới mái hiên quán cà phê,
 nhìn dòng người vội vã lao qua màn mưa trắng xóa.

[Những giọt mưa lớn xối xả đập xuống vũng nước trên mặt đường nhựa,
 bọt nước văng tung tóe]

Minh khẽ chép miệng, anh thầm nghĩ: "Lại quên ô rồi. Lần nào cũng vậy."

Linh bước vội vào mái hiên, mái tóc hơi ướt ở phần đuôi, tay chìa ra
 chiếc ô xanh nhạt còn chưa mở. Linh nhẹ nhàng hỏi: "Anh cần không?"

[Cận cảnh những ngón tay thon thả của Linh cầm chiếc ô màu xanh nhạt
 còn lấm tấm vài giọt nước mưa]

Minh quay lại nhìn cô một giây, Minh hỏi: "Của em à?"

[Linh mỉm cười, đôi mắt sáng lên một nét vui vẻ và ấm áp dưới màn mưa lạnh]

Linh tay chỉ vào chiếc balo, Linh nói: "Em có hai cái."

Cô ngập ngừng một chút, ánh mắt hơi né tránh, Linh hỏi thêm:
 "Hay... anh đi cùng hướng nào?"

[Bầu không khí giữa hai người hơi chùng xuống, chỉ còn tiếng lách tách
 của những hạt mưa rơi trên mái hiên]

Minh nhìn sang hướng cô gái chỉ. Trong đầu anh chạy qua một dòng suy nghĩ:
 "Thực ra mình không cần đi đâu gấp. Chỉ vừa uống xong ly cà phê và
  định ngồi thêm một lúc chờ tạnh mưa thôi."

Nhưng rồi, Minh quay sang nhìn Linh và thản nhiên nói:
 "Anh đi về phía công viên Thống Nhất."

[Góc máy từ phía sau, bóng hai người vội vã bước đi, cùng che chung một
 chiếc ô xanh nhạt hòa vào màn mưa trắng xóa]

Đi được một đoạn, Minh khẽ cười tự giễu trong lòng:
 "Đó là hướng ngược lại với chỗ mình ở cơ mà.""
```

- Asset Library: `Minh`, `Linh` (characters); `Coffee Shop Exterior`, `Street` (locations)
- ~220 từ, ~21 content elements → **1 clip** (≤ 20 elements → bắt buộc 1; 21-40 → max 2, nhưng "prefer longer segments")

---

## Step 1: Clip — `agent_clip.en.txt`

LLM cắt thành clip theo scene/plot boundaries. Dùng "content elements" counting:

| Loại element | Số lượng | Ghi chú |
|---|---|---|
| Action/scene description | ~7 | Mưa, Minh đứng, Linh bước vội... |
| Cinematic Insert `[...]` | 4 | B-roll bắt buộc panel riêng |
| Dialogue | ~4×2 = 8 | Mỗi dialogue = 2 elements (speaker + listener reaction) |
| Inner monologue | 3 | `thầm nghĩ`, `suy nghĩ`, `tự giễu` |
| **Total** | **~22** | Trên ngưỡng 20, có thể tách |

Vì location thay đổi (Coffee Shop Exterior → Street ở đoạn cuối), clip agent có thể cắt:

**Trường hợp 1 (1 clip):** LLM chọn giữ nguyên vì "prefer slightly longer segments"
```json
{
  "id": "clip_1",
  "location": "Coffee Shop Exterior, Street",
  "characters": ["Minh", "Linh"],
  "content": "<toàn bộ truyện gốc>"
}
```

**Trường hợp 2 (2 clips):** Cắt tại scene change (khi họ bắt đầu đi chung ô)
```json
[
  {
    "id": "clip_1",
    "start": "Hôm nay trời bất chợt đổ mưa.",
    "end": "「Anh đi về phía công viên Thống Nhất.」",
    "location": "Coffee Shop Exterior",
    "characters": ["Minh", "Linh"],
    "summary": "Minh and Linh meet under awning, dialogue, Minh lies about direction"
  },
  {
    "id": "clip_2",
    "start": "[Góc máy từ phía sau...]",
    "end": "「Đó là hướng ngược lại với chỗ mình ở cơ mà.」",
    "location": "Street",
    "characters": ["Minh", "Linh"],
    "summary": "They walk away sharing umbrella, Minh's self-mocking realization"
  }
]
```

> Nếu 2 clips và cùng location "Coffee Shop Exterior" → `partitionClipsByConsecutiveLocation` gộp lại xử lý continuity qua `previous_clip_end_state`.
> Nếu khác location (Coffee Shop Exterior → Street) → mỗi clip chạy độc lập, không cần carry-over.

---

## Step 2: Phase 1 — Storyboard Plan (`agent_storyboard_plan.en.txt`)

LLM nhận clip content + asset library + **previous_clip_end_state** (None nếu clip đầu).

Phase 1 output — panels với `source_text` GIỮ NGUYÊN truyện gốc (≤24 từ/panel):

```json
[
  {
    "panel_number": 1,
    "description": "Wide shot: Rain pours... Minh stands under coffee shop awning...",
    "characters": [{"name": "Minh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Hôm nay trời bất chợt đổ mưa. Minh đứng dưới mái hiên quán cà phê, nhìn dòng người vội vã lao qua màn mưa trắng xóa."
  },
  {
    "panel_number": 2,
    "description": "[Cinematic Insert] Raindrops hitting puddle...",
    "characters": [],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "[Những giọt mưa lớn xối xả đập xuống vũng nước trên mặt đường nhựa, bọt nước văng tung tóe]"
  },
  {
    "panel_number": 3,
    "description": "Medium shot: Minh... hands in pockets...",
    "characters": [{"name": "Minh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Minh khẽ chép miệng, anh thầm nghĩ: 「Lại quên ô rồi. Lần nào cũng vậy.」"
  },
  {
    "panel_number": 4,
    "description": "Medium shot: Linh approaches awning, extends umbrella...",
    "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Linh bước vội vào mái hiên, mái tóc hơi ướt ở phần đuôi, tay chìa ra chiếc ô xanh nhạt còn chưa mở. Linh nhẹ nhàng hỏi: 「Anh cần không?」"
  },
  {
    "panel_number": 5,
    "description": "[CU] Close-up of Linh's fingers holding umbrella...",
    "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "[Cận cảnh những ngón tay thon thả của Linh cầm chiếc ô màu xanh nhạt còn lấm tấm vài giọt nước mưa]"
  },
  {
    "panel_number": 6,
    "description": "Medium two-shot: Minh turns, asks...",
    "characters": [
      {"name": "Minh", "appearance": "Default Appearance"},
      {"name": "Linh", "appearance": "Default Appearance"}
    ],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Minh quay lại nhìn cô một giây, Minh hỏi: 「Của em à?」"
  },
  {
    "panel_number": 7,
    "description": "[Insert] Linh smiles warmly in rain...",
    "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "[Linh mỉm cười, đôi mắt sáng lên một nét vui vẻ và ấm áp dưới màn mưa lạnh]"
  },
  {
    "panel_number": 8,
    "description": "Medium shot: Linh points at bag, says she has two...",
    "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Linh tay chỉ vào chiếc balo, Linh nói: 「Em có hai cái.」"
  },
  {
    "panel_number": 9,
    "description": "Medium close-up: Linh hesitates, asks direction...",
    "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Cô ngập ngừng một chút, ánh mắt hơi né tránh, Linh hỏi thêm: 「Hay... anh đi cùng hướng nào?」"
  },
  {
    "panel_number": 10,
    "description": "[Insert] Atmosphere shot: rain dripping from awning...",
    "characters": [],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "[Bầu không khí giữa hai người hơi chùng xuống, chỉ còn tiếng lách tách của những hạt mưa rơi trên mái hiên]"
  },
  {
    "panel_number": 11,
    "description": "Medium shot: Minh's internal monologue...",
    "characters": [{"name": "Minh", "appearance": "Default Appearance"}],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Minh nhìn sang hướng cô gái chỉ. Trong đầu anh chạy qua một dòng suy nghĩ: 「Thực ra mình không cần đi đâu gấp. Chỉ vừa uống xong ly cà phê và định ngồi thêm một lúc chờ tạnh mưa thôi.」"
  },
  {
    "panel_number": 12,
    "description": "Medium two-shot: Minh turns to Linh, lies about direction...",
    "characters": [
      {"name": "Minh", "appearance": "Default Appearance"},
      {"name": "Linh", "appearance": "Default Appearance"}
    ],
    "location": "Coffee Shop Exterior",
    "scene_type": "daily",
    "source_text": "Nhưng rồi, Minh quay sang nhìn Linh và thản nhiên nói: 「Anh đi về phía công viên Thống Nhất.」"
  },
  {
    "panel_number": 13,
    "description": "[Insert] Over-the-shoulder: two figures walking under umbrella into rain...",
    "characters": [
      {"name": "Minh", "appearance": "Default Appearance"},
      {"name": "Linh", "appearance": "Default Appearance"}
    ],
    "location": "Street",
    "scene_type": "daily",
    "source_text": "[Góc máy từ phía sau, bóng hai người vội vã bước đi, cùng che chung một chiếc ô xanh nhạt hòa vào màn mưa trắng xóa]"
  },
  {
    "panel_number": 14,
    "description": "Medium shot: Minh walks, self-mocking smile...",
    "characters": [{"name": "Minh", "appearance": "Default Appearance"}],
    "location": "Street",
    "scene_type": "daily",
    "source_text": "Đi được một đoạn, Minh khẽ cười tự giễu trong lòng: 「Đó là hướng ngược lại với chỗ mình ở cơ mà.」"
  }
]
```

### ⚠️ JSON safety: source_text dùng 「」, không dùng ""

Phase 1 prompt yêu cầu **tất cả** dấu ngoặc kép trong JSON phải là `「」`:
```
Original: Minh hỏi: "Của em à?"
source_text: "Minh quay lại nhìn cô một giây, Minh hỏi: 「Của em à?」"
```

Phase 3 prompt cũng yêu cầu tương tự. Voice Analysis trích nội dung trong `「」` để lấy dialogue.

### Dialogue trong Phase 1

- Các đoạn `[...]` là Cinematic Insert / B-roll — bắt buộc tạo panel riêng, KHÔNG merge
- Internal monologue (`thầm nghĩ:`, `suy nghĩ:`, `tự giễu:`) cũng nằm trong `「」`
- Speaker attribution: LLM phải giữ tên nhân vật trong source_text (e.g. `Minh hỏi: 「...」`)

---

## Step 3: Phase 2a — Cinematography (`agent_cinematographer.en.txt`)

Chạy **song song** với Phase 2b. Input: Phase 1 panels. Output:

```json
[
  {
    "panel_number": 1,
    "scene_summary": "Coffee shop exterior, rainy afternoon",
    "lighting": {"direction": "Overcast natural", "quality": "Soft, muted"},
    "characters": [{"name": "Minh", "screen_position": "center-left", "posture": "standing", "facing": "facing street"}],
    "depth_of_field": "Deep DOF (T8.0)",
    "color_tone": "Cool blue-gray",
    "composition": "rule of thirds, Minh on left third",
    "color_palette": "Cool desaturated",
    "atmosphere": "Rainy afternoon melancholy",
    "technical_notes": null
  },
  {
    "panel_number": 2,
    "scene_summary": "Coffee shop exterior, ground level",
    "lighting": {"direction": "Ambient overcast", "quality": "Soft diffused"},
    "characters": [],
    "depth_of_field": "Deep DOF (T8.0)",
    "color_tone": "Cool gray",
    "composition": "Low angle ground shot of splashing rain",
    "color_palette": "High contrast rain",
    "atmosphere": "Kinetic rain energy",
    "technical_notes": null
  }
  // ... panel 3..14
]
```

### Rule quan trọng về DOF cho thoại:

- **Shallow DOF (T2.8)** khi 1 nhân vật nói — mặt nói nét, nền mờ
- **Medium DOF (T4.0–T5.6)** khi 2+ nhân vật tương tác gần (nói chuyện trực diện) — cả 2 mặt nét
- **Đây là yêu cầu của cinematographer prompt, KHÔNG phải merge**

---

## Step 4: Phase 2b — Acting Direction (`agent_acting_direction.en.txt`)

Chạy song song với Phase 2a. Output:

```json
[
  {"panel_number": 1, "characters": [{"name": "Minh", "acting": "shoulders slightly hunched, eyes scanning crowd, blinks slowly"}]},
  {"panel_number": 2, "characters": []},
  {"panel_number": 3, "characters": [{"name": "Minh", "acting": "lip press, soft exhale through nose, gaze unfocused at rain"}]},
  {"panel_number": 4, "characters": [{"name": "Linh", "acting": "quick steps into frame, hair shakes lightly, extends umbrella with gentle smile"}]}
  // ...
]
```

---

## Step 5: Phase 3 — Storyboard Detail (`agent_storyboard_detail.en.txt`)

Input: Phase 1 panels **NHƯNG KHÔNG CÓ Phase 2a/2b**.

LLM thêm `shot_type`, `camera_move`, `video_prompt`, `duration`:

```json
[
  {
    "panel_number": 1,
    "shot_type": "Eye-Level Wide Shot",
    "camera_move": "Static",
    "duration": 4,
    "video_prompt": "A rainy street scene, Minh standing alone under a coffee shop awning watching the rain, crowd rushing past...",
    // ...các field khác giữ nguyên từ Phase 1
    "source_text": "Hôm nay trời bất chợt đổ mưa..."
  }
  // ...
]
```

### ⚠️ Vấn đề Phase 3:

- Phase 3 KHÔNG thấy cinematography rules → tự chọn shot_type, có thể không match với DOF yêu cầu
- Phase 3 KHÔNG thấy acting direction → không biết nhân vật đang làm gì trong acting
- `duration` rules: Wide/Long → 4, ECU B-roll → 2, emotion CU → 3, action Medium → 3, dialogue panels → **bỏ trống (để TTS tính)**

---

## Step 6: MERGE (`mergePanelsWithRules`)

**Đây là merge thật trong code** (`orchestrator.ts:178-210`):

```typescript
function mergePanelsWithRules({ finalPanels, photographyRules, actingDirections }) {
  return finalPanels.map((panel, index) => {
    const rules = photographyRules.find(r => r.panel_number === panel.panel_number)
    const acting = actingDirections.find(a => a.panel_number === panel.panel_number)
    // throws error nếu không match
    return {
      ...panel,                              // Phase 3: shot_type, camera_move, video_prompt, source_text
      photographyPlan: {                      // Phase 2a gắn vào
        composition: rules.composition,
        lighting: rules.lighting,
        color_tone: rules.color_tone,
        depth_of_field: rules.depth_of_field,
        characters: rules.characters,        // cinematographer's character positions
        scene_summary: rules.scene_summary,
        colorPalette: rules.color_palette,
        atmosphere: rules.atmosphere,
        technicalNotes: rules.technical_notes,
      },
      actingNotes: acting.characters,        // Phase 2b gắn vào
    }
  })
}
```

### Cách hoạt động:

1. **Match bằng `panel_number`** — Phase 1 → Phase 2a/2b → Phase 3 → merge đều dùng cùng panel_number
2. **`source_text` KHÔNG bị merge** — giữ nguyên từ Phase 1 qua Phase 3
3. **`photographyPlan`** — copy từ cinematographer rules
4. **`actingNotes`** — copy từ acting directions

### ⚠️ Khi merge FAIL:

Nếu Phase 3 output ra panel_number khác Phase 2a/2b (ví dụ LLM Phase 3 renumber từ 1), merge throws:
```
Error: Missing photography rule for panel_number=X at index=Y
```
Đây có thể là lý do "hệ thống không merge" — Phase 3 cần giữ đúng panel_number từ Phase 1.

### Kết quả merge (1 panel mẫu):

```json
{
  "panel_number": 4,
  "description": "Medium shot: Linh approaches awning...",
  "shot_type": "Eye-Level Medium Shot",
  "camera_move": "Static",
  "duration": null,
  "video_prompt": "hedgehog young woman hurries under the awning...",
  "source_text": "Linh bước vội vào mái hiên... hỏi: 「Anh cần không?」",
  "characters": [{"name": "Linh", "appearance": "Default Appearance"}],
  "location": "Coffee Shop Exterior",
  "scene_type": "daily",
  "photographyPlan": {
    "scene_summary": "Coffee shop exterior, rainy afternoon",
    "lighting": {"direction": "Overcast ambient", "quality": "Soft"},
    "characters": [{"name": "Linh", "screen_position": "center-right", "posture": "standing, arm extended", "facing": "facing left"}],
    "depth_of_field": "Shallow DOF (T2.8)",
    "color_tone": "Warm blue-gray",
    "composition": "rule of thirds",
    "colorPalette": null,
    "atmosphere": "Intimate rainy moment",
    "technicalNotes": null
  },
  "actingNotes": [{"name": "Linh", "acting": "quick steps, hair shakes, extends umbrella with gentle smile"}]
}
```

---

## Step 7: Voice Analysis (`voice_analysis.en.txt`)

Chạy SAU KHI merge xong TẤT CẢ clip. Input: merged panels + original text.

Output — trích xuất dialogue từ `source_text`:

```json
[
  {
    "lineIndex": 1,
    "speaker": "Minh",
    "content": "「Lại quên ô rồi. Lần nào cũng vậy.」",
    "isNarration": false,
    "emotionStrength": 0.15,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 3}
  },
  {
    "lineIndex": 2,
    "speaker": "Linh",
    "content": "「Anh cần không?」",
    "isNarration": false,
    "emotionStrength": 0.18,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 4}
  },
  {
    "lineIndex": 3,
    "speaker": "Minh",
    "content": "「Của em à?」",
    "isNarration": false,
    "emotionStrength": 0.2,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 6}
  },
  {
    "lineIndex": 4,
    "speaker": "Linh",
    "content": "「Em có hai cái.」",
    "isNarration": false,
    "emotionStrength": 0.15,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 8}
  },
  {
    "lineIndex": 5,
    "speaker": "Linh",
    "content": "「Hay... anh đi cùng hướng nào?」",
    "isNarration": false,
    "emotionStrength": 0.2,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 9}
  },
  {
    "lineIndex": 6,
    "speaker": "Minh",
    "content": "「Thực ra mình không cần đi đâu gấp. Chỉ vừa uống xong ly cà phê và định ngồi thêm một lúc chờ tạnh mưa thôi.」",
    "isNarration": false,
    "emotionStrength": 0.12,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 11}
  },
  {
    "lineIndex": 7,
    "speaker": "Minh",
    "content": "「Anh đi về phía công viên Thống Nhất.」",
    "isNarration": false,
    "emotionStrength": 0.2,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 12}
  },
  {
    "lineIndex": 8,
    "speaker": "Minh",
    "content": "「Đó là hướng ngược lại với chỗ mình ở cơ mà.」",
    "isNarration": false,
    "emotionStrength": 0.18,
    "matchedPanel": {"storyboardId": "clip_1", "panelIndex": 14}
  }
]
```

### Cách Voice Analysis hoạt động với truyện này:

| source_text gốc | Phân loại | Speaker | Giải thích |
|---|---|---|---|
| `Linh nhẹ nhàng hỏi: 「Anh cần không?」` | Dialogue | Linh | Trích nội dung trong 「」 |
| `Minh khẽ chép miệng, anh thầm nghĩ: 「Lại quên ô rồi.」` | Inner monologue | Minh | `thầm nghĩ:` = inner voice, vẫn gán speaker |
| `Trong đầu anh chạy qua một dòng suy nghĩ: 「...」` | Inner monologue | Minh | `suy nghĩ:` cũng là inner voice |
| `Minh quay lại nhìn cô một giây, Minh hỏi: 「Của em à?」` | Dialogue | Minh | `hỏi:` = dialogue |
| `[Những giọt mưa...]` | Cinematic Insert | — | BỎ QUA, không tạo voice record |

---

## Step 8: Prompt Refiner

Gom panel theo batch, giới hạn ~8 panel/batch. Với truyện này ~14 panel:

```
Batch 1: Panel 1 → 8
Batch 2: Panel 9 → 14
```

---

## Các vấn đề được phát hiện

### 1. Merge có thể không chạy — panel_number mismatch

Nếu Phase 3 output ra panel_number khác Phase 2a/2b (do LLM tự renumber), `mergePanelsWithRules` throw error:
```
Missing photography rule for panel_number=... at index=...
```

**Cách fix hiện tại:** Phase 3 prompt yêu cầu "panel_number, characters, location, scene_type remain unchanged", nhưng không ép buộc đủ mạnh.

### 2. Dialogue KHÔNG được xử lý trong merge

Merge chỉ gắn `photographyPlan` + `actingNotes`. Dialogue nằm yên trong `source_text`. Voice Analysis là bước RIÊNG sau merge.

### 3. Cinematic Insert `[...]` thành panel riêng

Cả 4 đoạn `[...]` trong truyện đều tạo panel riêng (bắt buộc). Panel này không có dialogue, không có voice record.

### 4. Inner monologue dễ bị nhầm

`thầm nghĩ:`, `trong đầu... suy nghĩ:` — Voice Analysis phải map đúng speaker (Minh) dù không có dấu hiệu dialogue rõ. Prompt voice_analysis có rule xử lý "Inner Monologue / Thoughts".

### 5. Cross-clip continuity khi có nhiều clip

Nếu clip agent cắt thành 2 clip (Coffee Shop Exterior → Street), mỗi clip chạy độc lập vì khác location.
Nếu 2 clip cùng location, `partitionClipsByConsecutiveLocation` gộp chung, `previous_clip_end_state` carry-over continuity.

---

## Tóm tắt luồng dữ liệu

```
Truyện gốc
    │
    ▼
agent_clip ─────► 1-2 clips (tuỳ element count)
    │
    ▼
agent_storyboard_plan ──► Phase 1: panel[] (với source_text)
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  │
agent_cine     agent_acting              │
Phase 2a       Phase 2b                  │
photography    acting                    │
Rule[]         Direction[]               │
    │                  │                  │
    └────────┬─────────┘                  │
             │                            │ (CÙNG DỮ LIỆU ĐẦU VÀO: planPanels)
             ▼                            ▼
      [chờ 2a+2b xong] ────►  agent_storyboard_detail
                               Phase 3: thêm shot_type/camera_move/video_prompt
                                        │
                                        ▼
                               mergePanelsWithRules
                               gán photographyPlan + actingNotes theo panel_number
                                        │
                                        ▼
                               Panel merged hoàn chỉnh
                                        │
                                        ▼
                               voice_analysis
                               trích dialogue từ 「」trong source_text
```

### Merge chỉ làm 1 việc:
```javascript
panel.photographyPlan = photographyRules.find(r => r.panel_number === panel.panel_number)
panel.actingNotes = actingDirections.find(a => a.panel_number === panel.panel_number)
```

### Dialogue xuyên suốt các phase:
```
Phase 1 source_text: "Linh... hỏi: 「Anh cần không?」"
Phase 3 source_text: giữ nguyên (prompt yêu cầu)
Merge:              source_text không đụng tới
Voice Analysis:     content: "「Anh cần không?」", speaker: "Linh"
```
