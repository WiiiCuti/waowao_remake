# Phân tích Sâu & Đề xuất Tái cấu trúc Toàn diện Hệ thống Storyboard Pipeline

Tài liệu này phân tích chi tiết các vấn đề hiện tại trong pipeline sinh Storyboard và Prompt, phân loại các lỗi từ mức độ code cho đến lỗi thiết kế kiến trúc, đồng thời đề xuất lộ trình sửa lỗi và tái cấu trúc.

---

## 1. TL;DR — Đánh giá Kiến trúc Hiện tại

| Thành phần | Đánh giá | Lý do |
| :--- | :--- | :--- |
| **Phân tách Phase (1 → 2a/2b → 3) trong 1 Clip** | ✅ Tốt | Tách vai trò LLM rõ ràng, cơ chế retry/merge độc lập linh hoạt. |
| **`mergePanelsWithRules` — map photographyPlan** | ✅ Đúng | `color_tone`, `depth_of_field`, `characters`, `scene_summary` đều đã được map đúng (dòng 199–202). Các key thừa (`colorPalette`, `atmosphere`, `technicalNotes`) map thêm nhưng `undefined` → `JSON.stringify` bỏ qua, không gây mất dữ liệu. |
| **`buildCharDetails` — actingNotes** | ✅ Đúng | `acting.characters` là array → `JSON.stringify` → `Array.isArray` bắt đúng khi parse lại. Dữ liệu chảy thông suốt. |
| **Xử lý song song tất cả clips (`mapWithConcurrency`)** | ❌ Lỗi kiến trúc | Không có cơ chế pass state từ clip N−1 sang clip N → cross-clip continuity bị phá vỡ. |
| **Batch Refiner cơ học (`WINDOW_SIZE=8`)** | ❌ Lỗi kiến trúc | Cắt 8 panels bất kỳ, bất kể ranh giới clip hay bối cảnh → LLM bị nhiễu ngữ cảnh. |
| **Character naming (Asset Library ưu tiên)** | ⚠️ Mâu thuẫn narrative | LLM buộc dùng tên từ Asset Library ngay từ đầu, phá vỡ hiệu ứng kể chuyện "gradual reveal" của tác giả. |
| **Internal monologue trong voice analysis** | ⚠️ Phân loại sai | Text không có dấu ngoặc kép rõ ràng có thể bị phân loại sai thành dialogue thay vì narration/inner voice. |
| **Vị trí Prompt Refiner (sau voice-analyze)** | ✅ Bắt buộc | Cần `duration` và `srtSegment` từ voice để xác định số Shot blocks và đặt dialogue khớp môi. Không thể chuyển vào orchestrator. |

---

## 2. Bugs Cứng trong Code (P0 — Sửa ngay)

### 🟡 Bug C: Hardcode tiếng Trung làm giá trị mặc định

**File**: [script-to-storyboard-helpers.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/script-to-storyboard-helpers.ts)

Có **2 nơi** trong cùng file đều dùng fallback tiếng Trung:

| Dòng | Hàm | Code sai |
| :--- | :--- | :--- |
| L192–193 | `persistStoryboardsAndPanels` | `shotType: panel.shot_type \|\| '中景'` / `cameraMove: panel.camera_move \|\| '固定'` |
| L309–310 | `persistStoryboardOutputs` | Tương tự |

```typescript
// Hiện tại — SAI ở cả 2 hàm
shotType: panel.shot_type || '中景',    // '中景' = Medium Shot (tiếng Trung)
cameraMove: panel.camera_move || '固定', // '固定' = Static (tiếng Trung)

// Sửa thành
shotType: panel.shot_type || 'Medium Shot',
cameraMove: panel.camera_move || 'Static',
```

**Hậu quả**: Khi Phase 3 không trả về `shot_type`/`camera_move`, output bị lẫn tiếng Trung dù toàn bộ hệ thống đã chuyển sang EN.

---

### 🔴 Bug D: `buildCharactersInfo` bỏ qua mô tả ngoại hình nhân vật

**File**: [panel-variant-task-handler.ts:L71-90](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-variant-task-handler.ts#L71-L90)

```typescript
// Hiện tại — THIẾU appearance description
function buildCharactersInfo(panel, projectData, locale) {
  return panelCharacters.map(item => {
    const character = findCharacterByName(projectData.characters || [], item.name)
    const intro = character?.introduction || ''          // ← chỉ lấy giới thiệu vai trò
    const appearance = item.appearance || 'Default appearance'
    // ← THIẾU: character.appearances[].description (mô tả ngoại hình thực tế)
    return `- ${item.name} (${appearance}): ${intro}`
  }).join('\n')
}
```

**Hậu quả**: LLM sinh ảnh biến thể không biết nhân vật trông như thế nào → tự bịa ngoại hình → character inconsistency.

**Giải pháp**:
```typescript
// Thêm: tìm appearance phù hợp và trích description
const appearances = character?.appearances || []
const matchedApp = item.appearance
  ? appearances.find(a => (a.changeReason || '').toLowerCase() === item.appearance!.toLowerCase())
  : appearances[0]
const appearanceDesc = matchedApp?.description?.trim() || ''

return `- ${item.name} (${appearance}): ${intro}${appearanceDesc ? `. Visual: ${appearanceDesc}` : ''}`
```

---

## 3. Vấn đề Kiến trúc — Case Study: Truyện "Khoảng Cách Một Chiếc Ô"

Phân tích thủ công toàn bộ pipeline với truyện ~350 từ, 4 clips, ~15 panels. Làm lộ rõ 4 vấn đề cụ thể với ví dụ thực tế.

### 3.1 Cấu trúc Episode sau clips-build

```
Clip 1 — Coffee Shop Exterior (establishing + gặp gỡ)
  characters: [Minh, Linh] | ~4 panels

Clip 2 — Coffee Shop Exterior  ← CÙNG location với Clip 1
  characters: [Minh, Linh]   | ~4 panels

Clip 3 — Street               ← ĐỔI location
  characters: [Minh, Linh]   | ~5 panels

Clip 4 — Park Gate            ← ĐỔI location
  characters: [Minh, Linh]   | ~4-6 panels (tuỳ split)
```

---

### 3.2 Vấn đề A: Cross-clip continuity (Clip 1 → Clip 2, cùng location)

Clip 1 và Clip 2 đều ở "Coffee Shop Exterior" nhưng **chạy hoàn toàn song song và độc lập**.

**Kết quả Phase 2a của Clip 1 (panel cuối):**
```
Panel 1.3 (Medium Two-Shot):
  Minh: screen_position: "left side of frame", facing: "facing right toward the girl"
  Linh: screen_position: "right side of frame", facing: "facing left toward Minh"
```

**Clip 2 Phase 1 bắt đầu độc lập — LLM tự quyết lại vị trí:**
```
Panel 2.1 (Medium Two-Shot — Minh hỏi, Linh trả lời):
  Minh: screen_position: "right side of frame"  ← ĐẢO so với Clip 1
  Linh: screen_position: "left side of frame"   ← ĐẢO so với Clip 1
```

| Khía cạnh | Clip 1 panel cuối | Clip 2 panel đầu | Kết quả |
| :--- | :--- | :--- | :--- |
| Outfit Minh | Default Appearance | Default Appearance | ✅ OK (đều default) |
| Outfit Linh | Default Appearance | Default Appearance | ✅ OK |
| Vị trí Minh | left side of frame | LLM tự quyết (có thể right) | ⚠️ Có thể bị đảo |
| Vị trí Linh | right side of frame | LLM tự quyết (có thể left) | ⚠️ Có thể bị đảo |
| Camera transition | Close-up (panel 1.4) | Medium Two-Shot | ⚠️ Không smooth |

**Biểu hiện lỗi video**: Nhân vật "nhảy" sang phải/trái không tự nhiên giữa Clip 1 và 2, dù cùng một cảnh liên tục.

---

### 3.3 Vấn đề B: Character Naming Mismatch — "Gradual Reveal" bị phá vỡ (VẤN ĐỀ MỚI)

**Cách tác giả kể chuyện:**
- Clip 1–2: Nhân vật nữ chỉ được gọi là "cô gái" — người đọc chưa biết tên
- Clip 3: Lần đầu tiên tên "Linh" xuất hiện khi cô nghe điện thoại và người kia gọi tên cô
- Đây là hiệu ứng narrative có chủ đích: sự tiết lộ tên tạo ra khoảnh khắc kết nối giữa Minh và người đọc

**Cách pipeline xử lý:**
```
Asset Library: characters: [{ name: "Linh", ... }]

Phase 1 Clip 1 input:
  {characters_appearance_list}: "Linh: [Default Appearance]"
  ↓
LLM PHẢI gọi nhân vật là "Linh" từ Panel 1.1 để map đúng với Asset Library:
  Panel 1.3: characters: [{name:"Linh", appearance:"Default Appearance"}]
```

**Hậu quả:**
1. Panel ở Clip 3 mô tả "Linh nghe điện thoại, người kia gọi tên cô" trở thành **vô nghĩa** — LLM đã gọi "Linh" từ đầu, không có gì để "tiết lộ"
2. Prompt sinh ra có thể viết `"Linh answers her phone"` thay vì `"The girl answers her phone, the caller says her name for the first time"`
3. Khoảnh khắc cảm xúc của narrative bị xóa hoàn toàn

**Đây là xung đột kiến trúc cơ bản:** Pipeline yêu cầu nhận diện nhân vật sớm (để lookup Asset Library), nhưng narrative yêu cầu nhận diện muộn (để tạo hiệu ứng kể chuyện).

**Giải pháp khả thi (chưa implement):**
- Thêm trường `story_alias` trong Asset Library: `{ name: "Linh", story_alias: ["cô gái", "người con gái"] }`
- Phase 1 prompt nhận thêm `{character_aliases}` để biết "cô gái" trong text map sang "Linh" trong asset — nhưng khi sinh description thì dùng alias thay vì tên thật, cho đến khi source_text tự tiết lộ tên

---

### 3.4 Vấn đề C: Internal Monologue không được phân loại đúng (VẤN ĐỀ MỚI)

**Từ text gốc Clip 2:**
> *"Thực ra Minh không cần đi đâu gấp. Không có cuộc hẹn nào, không có việc gì quan trọng đang chờ. Nhưng anh nhìn sang hướng cô gái chỉ và nói: 'Anh đi về phía công viên Thống Nhất.'"*

Đoạn *"Thực ra Minh không cần đi đâu gấp..."* là **internal monologue** (độc thoại nội tâm):
- Không có dấu ngoặc kép `"..."`
- Không có động từ nói như "anh nghĩ", "anh tự nhủ"
- Về mặt ngữ pháp trông giống narration bình thường

**Vấn đề trong Voice Analysis** (`voice_analysis.en.txt`):

Voice Analysis nhìn toàn bộ storyboard và cố gắng match dialogue → panel. Nếu phân loại sai đoạn này là narration thông thường → không gán speaker → không có voice line → mất đi chiều sâu nội tâm nhân vật trong output audio.

Nếu phân loại đúng là inner voice → gán speaker "Minh" + `voiceType: "inner_monologue"` → có thể xử lý riêng (ví dụ: thoại thì thầm, reverb nhẹ).

**Cách phân biệt (cần thêm rule vào prompt):**
| Loại | Dấu hiệu | Xử lý |
| :--- | :--- | :--- |
| Dialogue | Có `"..."`, có động từ nói | speaker = nhân vật nói |
| Inner monologue | Không có `"..."`, nhưng mô tả suy nghĩ/cảm xúc nhân vật cụ thể | speaker = nhân vật đó, voiceType = "inner_monologue" |
| Narration | Mô tả hành động, cảnh vật từ góc nhìn thứ 3 | speaker = null |

---

### 3.5 Vấn đề D: Refiner Batch trộn lẫn bối cảnh

**Tổng 15 panels, WINDOW_SIZE=8:**

```
Batch 1: Panel 1.1→1.4 (Coffee Shop) + Panel 2.1→2.4 (Coffee Shop)
         → ✅ Cùng location, không bị nhiễu

Batch 2: Panel 3.1→3.6 (Street) + Panel 4.1→4.2 (Park Gate)
         → ❌ KHÁC location, ánh sáng/màu sắc chéo nhau
```

LLM Refiner nhận batch 2 không thể biết P3.1–P3.6 là đường phố (ánh sáng xám, mưa nhẹ) và P4.1–P4.2 là cổng công viên (ánh sáng vàng chiều, ngừng mưa). Có nguy cơ áp màu sắc sai sang nhau.

---

## 4. Ràng buộc Nghiêm ngặt (KHÔNG ĐƯỢC THAY ĐỔI)

| Component | Lý do không được đụng |
| :--- | :--- |
| `prompt_refiner.en.txt` | Prompt production-grade cho LTX Video 2.3 + IC-LoRA, logic phức tạp đã ổn định. Chỉ sửa code data pipeline xung quanh, không sửa nội dung prompt. |
| Vị trí Refiner (sau voice-analyze) | Cứng — cần `duration` (quyết định số Shot blocks) và `srtSegment` (lip-sync). Không thể chuyển vào orchestrator. |
| Core logic Phase 1–3 prompts | Đúng và chi tiết. Chỉ thêm biến trạng thái nếu cần, không sửa logic gốc. |

---

## 5. Lộ trình Sửa lỗi và Tái cấu trúc

### P0 — Sửa ngay (bugs code đơn giản, ~2 giờ)

| # | Bug | File | Thay đổi |
| --- | --- | --- | --- |
| C | Chinese fallback — 2 nơi | [script-to-storyboard-helpers.ts:L192](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/script-to-storyboard-helpers.ts#L192) và [L309](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/script-to-storyboard-helpers.ts#L309) | `'中景'` → `'Medium Shot'`, `'固定'` → `'Static'` |
| D | `buildCharactersInfo` thiếu appearance | [panel-variant-task-handler.ts:L79](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-variant-task-handler.ts#L79) | Thêm lookup `appearances[].description` |

### P2 — Refiner batch theo Clip (thay đổi vừa, ~1 ngày)

Đổi vòng lặp `WINDOW_SIZE=8` sang **batch theo từng storyboard** (1 clip = 1 batch).

**File cần sửa**: [prompt-refiner.ts:L411](file:///run/media/thqui/_data/waoowaoo/src/lib/novel-promotion/prompt-refiner.ts#L411)

Panels trong cùng 1 clip đảm bảo cùng `location` → LLM không bị nhiễu bối cảnh. Nếu clip có > 10 panels, split sub-batch nhưng vẫn trong cùng clip.

### P1 — Sequential-within-Scene + ClipEndState (tái cấu trúc lớn, ~2 ngày)

Chuyển từ "tất cả clip song song" sang "Scene song song, clips trong Scene tuần tự":

```typescript
const scenes = groupClipsByLocation(clips)
// Song song giữa các Scene khác nhau:
await mapWithConcurrency(scenes, concurrency, async (scene) => {
  let prevEndState: ClipEndState | null = null
  for (const clip of scene.clips) {
    const result = await processSingleClip(clip, prevEndState)
    prevEndState = extractClipEndState(result.lastPanel)
  }
})

type ClipEndState = {
  characters: Array<{ name: string; appearance: string }>
  screenPositions: Array<{ name: string; screen_position: string }>
  location: string | null
}
```

**Bổ sung vào Phase 1 prompt** ([agent_storyboard_plan.en.txt](file:///run/media/thqui/_data/waoowaoo/lib/prompts/novel-promotion/agent_storyboard_plan.en.txt)):
```
[Previous Clip End State]
{previous_clip_end_state_json}

If provided: First panel of this clip MUST maintain:
- Same appearance (outfit) for each character listed above
- Same screen-side positioning (character on left stays left, right stays right)
  UNLESS the source text explicitly describes movement or repositioning.
```

### P3 — Character Alias + Internal Monologue (thiết kế mới, cần research)

Đây là 2 vấn đề mới phát hiện qua case study. Cần thiết kế riêng trước khi implement:

**Character Alias** — Thêm trường `story_alias` vào Character schema:
```typescript
// Đề xuất schema thêm:
character: {
  name: "Linh",
  story_alias: ["cô gái", "người con gái", "cô"]  // tên dùng trong text trước khi reveal
}
```
Phase 1 prompt nhận `{character_aliases}` → biết map "cô gái" → asset "Linh" — nhưng description panel dùng alias đến khi source_text tự tiết lộ tên thật.

**Internal Monologue** — Bổ sung rule phân loại vào `voice_analysis.en.txt`:
```
- Dialogue: has "..." quotes + speech verb → speaker = character
- Inner monologue: no quotes, describes specific character's thoughts/feelings
  → speaker = that character, voiceType = "inner_monologue"
- Narration: third-person description of scene/action → speaker = null
```

---

## 6. Sơ đồ Data Flow đề xuất sau tái cấu trúc

```
Novel Text
    │
    ▼
clips-build (LLM)
    │
    ▼
groupClipsIntoScenes()
  Scene A (Coffee Shop): [Clip1, Clip2]   Scene B (Street): [Clip3]   Scene C (Park): [Clip4]
    │ (song song)                               │ (song song)                │ (song song)
    ▼                                           ▼                            ▼
  Clip1 → ClipEndState1                       Clip3 → ClipEndState3         Clip4
    │ (tuần tự)
  Clip2 (nhận ClipEndState1) ← giữ vị trí/outfit từ Clip1
    │
    ▼
voice-analyze  ← nhận toàn bộ panels (phân loại: dialogue / inner_monologue / narration)
    │
    ▼
Prompt Refiner  ← batch theo storyboard (1 clip = 1 batch, không trộn location)
    │
    ▼
DB / Output
```
