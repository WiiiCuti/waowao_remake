# Phân tích thủ công toàn bộ pipeline với truyện "Khoảng Cách Một Chiếc Ô"

---

## Step 0: Đầu vào

- ~350 từ → **1 Episode** (không cần split, dưới ngưỡng ~650 từ)
- Cần pre-register 2 nhân vật trong Asset Library: **Minh**, **Linh**
- Cần pre-register 3 location: **Coffee Shop Exterior**, **Street**, **Park Gate**

---

## Step 1: Clips Build — LLM cắt thành 4 clip

Pipeline gọi `agent_clip.en.txt`, LLM phân tích text và cắt theo ranh giới bối cảnh + plot:

```
Clip 1 — Mái hiên quán cà phê (establishing + gặp gỡ)
  location: Coffee Shop Exterior
  characters: [Minh, Linh]  ← LLM phải tự map "cô gái" → "Linh" từ asset library
  content:
    "Hôm nay trời bất chợt đổ mưa.
     Minh đứng dưới mái hiên quán cà phê, nhìn dòng người vội vã lao qua màn mưa trắng xóa.
     Anh không mang ô. Lại quên. Lần nào cũng vậy.
     'Anh cần không?'
     Anh quay lại. Một cô gái đứng cạnh, tay chìa ra chiếc ô xanh nhạt còn chưa mở.
     Mái tóc cô hơi ướt ở phần đuôi, chắc vừa chạy vào kịp."

Clip 2 — Mái hiên quán cà phê (đối thoại + Minh nói dối)
  location: Coffee Shop Exterior  ← CÙNG location với Clip 1
  characters: [Minh, Linh]
  content:
    "'Của em à?' Minh hỏi.
     'Em có hai cái.' Cô mỉm cười... 'Hay... anh đi cùng hướng nào?'
     Thực ra Minh không cần đi đâu gấp... Nhưng anh nhìn sang hướng cô gái chỉ và nói:
     'Anh đi về phía công viên Thống Nhất.'
     Đó là hướng ngược lại với chỗ anh ở."

Clip 3 — Đường phố (đi chung ô, biết tên Linh)
  location: Street  ← ĐỔI location
  characters: [Minh, Linh]
  content:
    "Họ đi dưới một chiếc ô. Cô gái tên Linh — anh biết khi cô nghe điện thoại...
     Chiếc ô hơi nhỏ, vai áo anh vẫn bị mưa tạt vào...
     Linh lại nhích lại gần hơn.
     'Anh cứ đi xa ra vậy thì ướt hết,' cô nói...
     ...nhưng Minh nhớ từng câu."

Clip 4 — Cổng công viên (chia tay, đổi ô)
  location: Park Gate  ← ĐỔI location
  characters: [Minh, Linh]
  content:
    "Trước cổng công viên, Linh dừng lại... [đến hết]"
```

---

## Step 2: Phase 1 cho Clip 1 — Cắt thành Panel

LLM dùng `agent_storyboard_plan.en.txt`, cắt text theo rule ≤24 từ/panel:

```
Clip 1 input ~80 từ → Phase 1 output 4 panel:

Panel 1.1 — Wide Shot: Mưa đổ, phố đông, Minh đứng dưới mái hiên
  description: "Wide shot: Rain pours on busy street, people rush past. Minh stands
               alone under coffee shop awning, watching the crowd pass through the rain."
  characters: [{name:"Minh", appearance:"Default Appearance"}]
  location: "Coffee Shop Exterior"
  scene_type: "daily"
  source_text: "Hôm nay trời bất chợt đổ mưa. Minh đứng dưới mái hiên quán cà phê,
                nhìn dòng người vội vã lao qua màn mưa trắng xóa."

Panel 1.2 — Medium Shot: Minh, biểu cảm bất lực
  description: "Medium shot: Minh stands under awning, hands in pockets,
               expression slightly resigned. Rain blurs street behind him."
  characters: [{name:"Minh", appearance:"Default Appearance"}]
  location: "Coffee Shop Exterior"
  scene_type: "daily"
  source_text: "Anh không mang ô. Lại quên. Lần nào cũng vậy."

Panel 1.3 — Medium Two-Shot: Cô gái xuất hiện, chìa ô
  description: "Medium shot: Minh turns his head to the right. A young woman
               stands beside him, arm extended offering a light green umbrella.
               Her hair ends are slightly damp from rain."
  characters: [{name:"Minh", appearance:"Default Appearance"},
               {name:"Linh", appearance:"Default Appearance"}]
  location: "Coffee Shop Exterior"
  scene_type: "daily"
  source_text: "Anh quay lại. Một cô gái đứng cạnh, tay chìa ra chiếc ô xanh nhạt
                còn chưa mở. Mái tóc cô hơi ướt ở phần đuôi, chắc vừa chạy vào kịp."

Panel 1.4 — Close-up: Bàn tay cầm ô + khuôn mặt Linh
  description: "Close-up: The light green umbrella in the girl's hand, still folded.
               Behind it, her face with a gentle expression, rain streaks on window behind."
  characters: [{name:"Linh", appearance:"Default Appearance"}]
  location: "Coffee Shop Exterior"
  scene_type: "daily"
  source_text: "Anh cần không?"
```

---

## Step 3: Phase 2a (Cine) + 2b (Acting) cho Clip 1

### 2a — Cinematography (`agent_cinematographer.en.txt`):

```
Panel 1.1:
  scene_summary: "Coffee shop exterior, overcast rainy afternoon"
  lighting: {direction:"Overcast natural, diffused through rain",
             quality:"Soft, muted, cool temperature"}
  characters: [{name:"Minh", screen_position:"center-left of frame",
                posture:"standing still, hands in pockets",
                facing:"facing right toward street"}]
  depth_of_field: "Deep DOF (T8.0), street and crowd clearly visible"
  color_tone: "Cool blue-gray, rainy afternoon atmosphere"

Panel 1.2:
  scene_summary: "Coffee shop exterior, under awning"
  lighting: {direction:"Ambient overcast from above",
             quality:"Soft, mild shadow under awning"}
  characters: [{name:"Minh", screen_position:"center of frame",
                posture:"hands in pockets, shoulders slightly hunched",
                facing:"facing forward, gaze distant"}]
  depth_of_field: "Medium DOF (T4.0), background rain slightly blurred"
  color_tone: "Cool blue-gray with hint of warm interior light from shop window"

Panel 1.3:
  scene_summary: "Coffee shop exterior, two people under awning"
  lighting: {direction:"Overcast ambient, subtle rim from shop window",
             quality:"Soft, even illumination"}
  characters: [
    {name:"Minh", screen_position:"left side of frame", posture:"turning to face right",
     facing:"facing right toward the girl"},
    {name:"Linh", screen_position:"right side of frame", posture:"standing, arm extended with umbrella",
     facing:"facing left toward Minh"}]
  depth_of_field: "Medium DOF (T4.0), both characters sharp, street behind blurred"
  color_tone: "Warm blue-gray, intimate under-awning mood"

Panel 1.4:
  scene_summary: "Coffee shop exterior, close-up"
  lighting: {direction:"Soft overhead, diffused by awning",
             quality:"Gentle, slight shadow under brow"}
  characters: [{name:"Linh", screen_position:"center of frame",
                posture:"facial close-up, slight tilt",
                facing:"facing slightly left toward Minh (offscreen)"}]
  depth_of_field: "Shallow DOF (T2.8), face sharp, background blurred"
  color_tone: "Warm tone on face, cool rain in distant background"
```

### 2b — Acting (`agent_acting_direction.en.txt`):

```
Panel 1.1: [{name:"Minh", acting:"shoulders slightly hunched, eyes scanning the
            rushing crowd with mild resignation, blinks slowly"}]
Panel 1.2: [{name:"Minh", acting:"lips pressed thin in self-annoyance, exhales
            softly through nose, gaze drifts unfocused at rain"}]
Panel 1.3: [{name:"Minh", acting:"head turns toward voice, eyebrows lift slightly
            in surprise, body shifts weight toward the girl"},
            {name:"Linh", acting:"corners of mouth lift in gentle smile, eyes soft
            and inviting, blinks once as a raindrop clings to her eyelash"}]
Panel 1.4: [{name:"Linh", acting:"gentle smile widens slightly, eyes crinkle at
            corners, slight head tilt, fingers lightly grip the umbrella handle"}]
```

---

## Step 4: Phase 3 — Detail (`agent_storyboard_detail.en.txt`)

Nhận lại output Phase 1, thêm shot_type + camera_move + video_prompt:

```
Panel 1.1:
  shot_type: "Eye-Level Wide Shot"
  camera_move: "Static"
  video_prompt: "A rainy street scene, Minh standing alone under a coffee shop
                awning watching the rain, crowd rushing past with umbrellas in
                the background, overcast sky, wet pavement reflecting city lights"

Panel 1.2:
  shot_type: "Chest-Level Medium Shot"
  camera_move: "Static"
  video_prompt: "Minh under the awning, hands in pockets, slight slouch, light
                rain blurs behind him, warm light from coffee shop window behind"

Panel 1.3:
  shot_type: "Eye-Level Medium Two-Shot"
  camera_move: "Static"
  video_prompt: "Minh and Linh under coffee shop awning during rain, she extends
                a light green umbrella toward him, damp hair ends, rain falls
                behind them, intimate under-awning atmosphere"

Panel 1.4:
  shot_type: "Close-Up"
  camera_move: "Static"
  video_prompt: "Close-up of Linh's gentle face under coffee shop awning, light
                green umbrella visible at bottom of frame, raindrops streak on
                background window, warm expression in her eyes"
```

---

## Step 5: Merge — Gộp Phase 2 + Phase 3

`mergePanelsWithRules` gộp 4 panel của Clip 1:

```javascript
{
  panel_number: 1,
  description: "Wide shot: Rain pours on busy street...",
  characters: [{name:"Minh", appearance:"Default Appearance"}],
  shot_type: "Eye-Level Wide Shot",
  camera_move: "Static",
  video_prompt: "A rainy street scene...",
  photographyPlan: {
    composition: rules.composition,
    lighting: rules.lighting,
    color_tone: "Cool blue-gray...",
    depth_of_field: "Deep DOF (T8.0)...",
    characters: [...],    // from cinematographer
    scene_summary: "...",
  },
  actingNotes: [{name:"Minh", acting:"shoulders slightly hunched..."}]
}
// ...4 panel tương tự
```

---

## Step 6: Clip 2 — Chạy SONG SONG với Clip 1 (đây là vấn đề)

Cùng location "Coffee Shop Exterior", cùng characters [Minh, Linh]. **Nhưng chạy hoàn toàn độc lập.**

**Phase 1 Clip 2 — input prompt KHÔNG hề biết Clip 1 đã làm gì:**

```
Panel 2.1 — Medium Two-Shot: Minh hỏi, Linh trả lời
  characters: [{name:"Minh", appearance:"Default Appearance"},  ← RESET
               {name:"Linh", appearance:"Default Appearance"}]   ← RESET

Panel 2.2 — Medium Shot: Linh cười, chỉ balo
Panel 2.3 — Close-up: Minh, mặt suy nghĩ (internal monologue)
Panel 2.4 — Medium Two-Shot: Minh nói dối hướng đi
```

**Vấn đề cụ thể với Clip 2:**

| Khía cạnh | Clip 1 output (panel cuối) | Clip 2 Phase 1 (panel đầu) | Kết quả |
|-----------|---------------------------|---------------------------|---------|
| Outfit Minh | Default Appearance | Default Appearance | ✅ OK (cùng default) |
| Outfit Linh | Default Appearance | Default Appearance | ✅ OK |
| Vị trí Minh | Screen position: "left side of frame" | LLM tự quyết | ⚠️ Có thể bị đảo |
| Vị trí Linh | Screen position: "right side of frame" | LLM tự quyết | ⚠️ Có thể bị đảo |
| Camera angle | Close-up (panel cuối) | Medium Two-Shot | ⚠️ Không smooth transition |
| Tư thế Minh | "turning to face right" | LLM tự quyết | ⚠️ Có thể đứng thẳng, khác |

**Nếu Clip 1 panel cuối Minh facing right, Clip 2 panel đầu Minh facing camera → giật hình.**

---

## Step 7: Clip 3 & Clip 4 — Chạy song song tiếp

Không có vấn đề continuity với Clip 2 vì đổi location (Street → Park Gate). Mỗi clip location mới → reset là hợp lý.

**Nhưng có vấn đề về câu chuyện:**

Clip 3 dòng *"Cô gái tên Linh — anh biết khi cô nghe điện thoại và người kia gọi tên cô"*:
- LLM Phase 1 có thể tạo 1 panel: Close-up Linh nghe điện thoại, màn hình hiện tên "Linh"
- Nhưng **LLM đã gọi cô là "Linh" từ Clip 1** (vì asset library). Vậy panel "tiết lộ tên" này bị thừa về mặt logic.

Đây là **mâu thuẫn giữa cách kể chuyện (gradual reveal) và cách pipeline hoạt động (phải biết tên từ đầu).**

---

## Step 8: Voice Analysis

Chạy **sau khi TẤT CẢ clip xong**, nhìn toàn bộ ~15 panel. Output:

```
lineIndex 1: speaker:"Linh", content:"Anh cần không?",
             matchedPanel:{storyboardId:"clip_1", panelIndex:3}
lineIndex 2: speaker:"Minh", content:"Của em à?",
             matchedPanel:{storyboardId:"clip_2", panelIndex:1}
lineIndex 3: speaker:"Linh", content:"Em có hai cái.",
             matchedPanel:{storyboardId:"clip_2", panelIndex:1}
lineIndex 4: speaker:"Linh", content:"Hay... anh đi cùng hướng nào?",
             matchedPanel:{storyboardId:"clip_2", panelIndex:2}
...
lineIndex N: speaker:null, isNarration:true, content:"Chỉ có mưa — và cái cảm
             giác lạ lẫm của một buổi chiều đi lạc đúng hướng.",
             matchedPanel:{storyboardId:"clip_4", panelIndex:12}
```

**Vấn đề:** Những dòng như *"Thực ra Minh không cần đi đâu gấp..."* là internal monologue — không có speaker, không có dấu ngoặc kép rõ ràng. Voice Analysis phải phân loại đúng là narration (không gán giọng) hoặc inner voice (có thể gán giọng Minh).

---

## Step 9: Prompt Refiner — Batch cơ học 8 panels

Giả sử tổng 15 panel:

```
Batch 1: Panel 1.1→1.4 + 2.1→2.4 (8 panel)
  → Clip 1 (coffee shop) + Clip 2 (coffee shop)
  → ✅ Cùng location, không bị nhiễu

Batch 2: Panel 3.1→3.6 + 4.1→4.2 (8 panel, nếu có)
  → Clip 3 (street) + Clip 4 (park gate)
  → ❌ KHÁC location, ánh sáng/màu sắc bị trộn!
```

---

## Tổng kết: 3 vấn đề cụ thể qua truyện này

| # | Vấn đề | Biểu hiện cụ thể |
|---|--------|-----------------|
| 1 | **Cross-clip continuity** | Clip 1→Clip 2 cùng location "Coffee Shop", nhưng vị trí/tư thế nhân vật có thể bị đảo ngược vì LLM tự quyết lại từ đầu |
| 2 | **Character naming mismatch** | Truyện dùng "cô gái" → "Linh" (gradual reveal). LLM buộc phải gọi "Linh" từ Clip 1 vì asset library → mất hiệu ứng kể chuyện, panel "tiết lộ tên" ở Clip 3 thành vô nghĩa |
| 3 | **Internal monologue classification** | "Thực ra Minh không cần đi đâu gấp..." — không có dấu ngoặc kép, không có speaker rõ ràng. Voice Analysis có thể phân loại sai thành dialogue |
| 4 | **Refiner batch trộn location** | Batch 2 có thể chứa panel từ Street + Park Gate → nhiễu ánh sáng, màu sắc chéo |
