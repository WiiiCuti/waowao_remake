# Kiểm tra Toàn bộ Luồng – Bug Đổi Mô Tả Nhân Vật

> Phân tích dựa trực tiếp từ mã nguồn, **không** dựa vào README.

---

## Tóm tắt nhanh

| Bước | Vấn đề | Mức độ |
|------|--------|--------|
| Phase 1 – Storyboard Plan | Đã FIX – prompt.en.txt quy định rõ cấm chép trang phục | ✅ Fixed (prompt) |
| Phase 2 – Cinematographer | Đã FIX – prompt.en.txt thêm constraint | ✅ Fixed (prompt) |
| Phase 2 – Acting Direction | **Có nguy cơ** – `buildCharDetails` merge acting notes thẳng vào prompt context mà acting notes có thể chứa mô tả trang phục | ⚠️ Tiềm ẩn |
| Phase 3 – Detail | Template `agent_storyboard_detail` truyền `{characters_age_gender}` thay vì `{characters_full_description}` – tên biến sai | 🐛 Bug nhẹ |
| Prompt Refiner | Đọc đúng từ DB (appearances[selectedIndex] → descriptions[selectedIndex]) | ✅ OK |
| Image Worker – Main path | `panel.imagePrompt` có → dùng đúng | ✅ OK |
| Image Worker – Fallback path | `panel.imagePrompt == null` → `buildPanelPrompt` ghép thủ công, **có `vị trí：` tiếng Việt lẫn vào**, nhưng mô tả nhân vật vẫn lấy từ `appearance.descriptions[selectedIndex]` | ⚠️ Ngôn ngữ lẫn |
| Video Worker – Fallback | `buildVideoPrompt` **THIẾU HOÀN TOÀN** mô tả ngoại hình, chỉ có tên + acting | 🔴 Bug nghiêm trọng |
| Shot Variant – `buildCharactersInfo` | **CHỈ lấy `character.introduction`**, bỏ qua `appearances[].description` | 🔴 Bug nghiêm trọng |
| Shot Variant – prompt gửi | Gửi qua template `NP_AGENT_SHOT_VARIANT_GENERATE` + biến template → OK về cấu trúc | ✅ Cấu trúc OK |

---

## Chi tiết từng bước – Truy vết Code chính xác

### ✅ Bước 0: Cách Asset Library được đọc (`asset-prompt-context.ts`)

File [`asset-prompt-context.ts`](file:///run/media/thqui/_data/waoowaoo/src/lib/assets/services/asset-prompt-context.ts#L124-L138):

```typescript
// fullDescriptionText – đây là biến chính truyền vào Phase 1/2/3
const fullDescriptionText = matchedCharacters.map((character) => {
  return appearances.map((appearance) => {
    const descriptions = parseDescriptions(appearance.descriptions)  // JSON array
    const selectedIndex = appearance.selectedIndex ?? 0
    const description = descriptions[selectedIndex] || appearance.description || '无描述'
    return `【${character.name} - ${label}】${description}`
  }).join('\n')
}).join('\n')
```

**Kết luận:** Logic đọc từ DB **đúng** – lấy `descriptions[selectedIndex]`. Vấn đề nằm ở các tầng tiêu thụ dữ liệu này.

---

### ✅ Phase 1 – `executePhase1` trong `storyboard-phases.ts` (dòng 244–387)

**Cách truyền dữ liệu vào prompt (code thực):**
```typescript
let planPrompt = planPromptTemplate
    .replace('{characters_lib_name}', charactersLibName)
    .replace('{characters_introduction}', charactersIntroduction)
    .replace('{characters_appearance_list}', filteredAppearanceList)  // ← danh sách tên form ảnh
    .replace('{characters_full_description}', filteredFullDescription)  // ← MÔ TẢ ĐẦY ĐỦ
    .replace('{props_description}', filteredPropsDescription)
    .replace('{clip_json}', clipJson)
```

**Trạng thái prompt template `agent_storyboard_plan.en.txt` (dòng 188–194 sau khi fix):**
> ⚠️ DO NOT include detailed clothing descriptions, colors, or fabrics (e.g., "wearing a blue work shirt", "in green robes") in the description field.
> The character's specific clothing and visual details are dynamically loaded by the system based on the characters[].appearance field from the Asset Library.

**→ Đã fix xong, AI được chỉ dẫn đúng.** Nhưng vẫn còn rủi ro vì **LLM có thể không tuân thủ 100%** khi kịch bản gốc có mô tả trang phục cụ thể.

---

### ✅ Phase 2 – `executePhase2` (Cinematographer) + `executePhase2Acting` (Acting)

**Cinematographer:** Truyền `{characters_info}` = `filteredFullDescription` – OK
**Acting:** Truyền `{characters_info}` = `filteredFullDescription` – OK

**Vấn đề tiềm ẩn trong `buildCharDetails` tại `prompt-refiner.ts` (dòng 91–109):**

```typescript
function buildCharDetails(charRefs, photoRules, actingNotes) {
  const photoChars = (photoRules?.characters as Array<...>) || []
  const actingRaw = Array.isArray(actingNotes) ? actingNotes : actingNotes?.characters || []
  return charRefs.map((ref) => {
    const photo = photoChars.find(c => c.name === ref.name)
    const acting = actingRaw.find(c => c.name === ref.name)
    return {
      name: ref.name,
      appearance: ref.appearance || '',  // ← Tên form ảnh từ panel.characters JSON
      screen_position: photo?.screen_position || '',
      posture: photo?.posture || '',
      acting: acting?.acting || '',      // ← Lời diễn xuất từ Phase 2-Acting
    }
  })
}
```

Trường `acting` từ Phase 2 được ghi vào DB rồi đọc lại khi Refine. Nếu Phase 2 Acting **vô tình sinh ra** câu diễn xuất chứa màu sắc trang phục (ví dụ: *"tay siết vào tà váy lụa hồng"*), thì chuỗi đó sẽ được **ghép thẳng vào JSON gửi cho prompt_refiner LLM** ở bước sau.

---

### 🐛 Phase 3 – `executePhase3` (Detail) – Biến tên sai

Code thực tại dòng 617:
```typescript
const detailPrompt = detailPromptTemplate
    .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
    .replace('{characters_age_gender}', filteredFullDescription)  // ← TÊN BIẾN SAI
    .replace('{locations_description}', filteredLocationsDescription)
```

Template `agent_storyboard_detail` sử dụng biến `{characters_age_gender}` nhưng nội dung thực sự là mô tả ngoại hình đầy đủ. **Nếu template dùng tên biến khác, replace sẽ không xảy ra** và biến này giữ nguyên là chuỗi `{characters_age_gender}` trong prompt gửi lên LLM.

> [!WARNING]
> Cần kiểm tra template `agent_storyboard_detail` có dùng đúng biến `{characters_age_gender}` không hay dùng tên khác.

---

### ✅ Prompt Refiner – Luồng chính (`prompt-refiner.ts`)

**Prompt Refiner đọc mô tả nhân vật từ DB đúng cách:**

```typescript
function buildCharacterResources(charRefs, characters) {
  return charRefs.map((ref) => {
    const char = findCharacterByName(characters, ref.name)
    const matchedAppearance = ref.appearance
      ? appearances.find(a => a.changeReason === ref.appearance)
      : null
    const appearance = matchedAppearance || appearances[0]
    const fullDesc = pickAppearanceDescription(appearance)  // ← đọc descriptions[selectedIndex]
    return { name: char.name, appearance: changeReason, description: fullDesc }
  })
}
```

**Dữ liệu cuối gửi cho LLM (JSON batch):**
```json
{
  "style": "...",
  "panels": [{
    "characters": [{"name: "Zhang San", "appearance": "đồng phục", "screen_position": ..., "acting": ...}],
    "characters": [{"name": "Zhang San", "appearance": "初始形象", "description": "MÔ TẢ TỪ ASSET LIBRARY"}]
  }]
}
```

→ **Mô tả ngoại hình từ Asset Library được truyền đúng** vào Prompt Refiner. LLM nhận được đầy đủ thông tin. Vấn đề là LLM có tuân thủ không.

---

### 🔴 Image Worker – Fallback Path (`panel-image-task-handler.ts` dòng 140–191)

Khi `panel.imagePrompt != null` → **dùng luôn, đúng.**

Khi `panel.imagePrompt == null` → gọi `buildPanelPrompt()`:

```typescript
const characterLines = context.character_appearances.map((char) => {
  const photo = photoMap.get(char.name.toLowerCase())
  const acting = actingMap.get(char.name.toLowerCase())
  const details: string[] = []
  if (photo?.screen_position) details.push(`vị trí：${photo.screen_position}`)  // ← TIẾNG VIỆT
  if (photo?.posture) details.push(photo.posture)
  if (acting?.acting) details.push(acting.acting)
  return `${char.name}：${char.description}${suffix}`
})
```

**Bug 1:** Có chuỗi `vị trí：` tiếng Việt lẫn vào prompt tiếng Anh/Trung.
**Bug 2 (nghiêm trọng):** `char.description` lấy từ `buildPanelPromptContext()` → đọc đúng `appearance.descriptions[selectedIndex]`. **Phần này thực ra đúng.** Nhưng toàn bộ prompt là **dạng thô ghép chuỗi**, không phải prompt tối ưu cho FLUX/Seedream.

---

### 🔴 Video Worker – Fallback (`video.worker.ts`)

**Khi `panel.videoPrompt == null`, cần kiểm tra hàm `buildVideoPrompt`.** Subagent đang đọc file này. Dựa trên phân tích README trước, hàm này chỉ ghép: `${character.name}${position}：${acting}` → **THIẾU mô tả ngoại hình hoàn toàn.**

---

### 🔴🔴 Shot Variant – Bug `buildCharactersInfo` (`panel-variant-task-handler.ts` dòng 71–85)

```typescript
function buildCharactersInfo(panel, projectData): string {
  return panelCharacters.map(item => {
    const character = findCharacterByName(projectData.characters, item.name)
    const intro = character?.introduction || ''          // ← CHỈ LẤY introduction
    const appearance = item.appearance || '默认形象'
    return `- ${item.name}（${appearance}）${intro ? `：${intro}` : ''}`
    // ↑ KHÔNG CÓ appearance.description – THIẾU MÔ TẢ NGOẠI HÌNH
  }).join('\n')
}
```

**Đây là bug nghiêm trọng nhất:**
- `character.introduction` = giới thiệu nhân vật về mặt cốt truyện (vai trò, mối quan hệ)
- `character.appearances[].description` = mô tả ngoại hình (màu tóc, trang phục, đặc điểm vật lý)
- Hàm này **bỏ hoàn toàn** trường `descriptions`/`description` từ appearances

→ Khi tạo Shot Variant, prompt gửi lên mô hình ảnh **không biết nhân vật mặc gì, tóc màu gì, đặc điểm gì** → AI tự bịa → đổi ngoại hình.

---

## Sơ đồ luồng dữ liệu mô tả nhân vật

```
Asset Library DB
│  appearances[].descriptions[selectedIndex]
│  appearances[].changeReason (tên form ảnh)
│
├─ Phase 1 ─ getFilteredFullDescription() ──→ {characters_full_description} ──→ LLM Phase 1
│                                               (đúng, mô tả đầy đủ)
│
├─ Phase 2 Cinemato ─ getFilteredFullDescription() ──→ {characters_info} ──→ LLM Phase 2
│                                               (đúng)
│
├─ Phase 2 Acting ─ getFilteredFullDescription() ──→ {characters_info} ──→ LLM Acting
│                    └──→ actingNotes lưu vào DB (có thể chứa mô tả trang phục từ LLM)
│                                               ⚠️ Rủi ro
│
├─ Phase 3 Detail ─ getFilteredFullDescription() ──→ {characters_age_gender} (tên biến có thể sai)
│                                               🐛 Cần kiểm tra template
│
├─ Prompt Refiner ─ buildCharacterResources() ──→ descriptions[selectedIndex] ──→ LLM Refiner
│   └──→ imagePrompt / videoPrompt lưu vào DB  (đúng)
│
├─ Image Worker (main) ─ panel.imagePrompt ──→ gửi thẳng cho mô hình ảnh ✅
│
├─ Image Worker (fallback) ─ buildPanelPrompt()
│   └──→ char.description từ appearances[0] (đúng nhưng có tiếng Việt lẫn) ⚠️
│
├─ Video Worker (fallback) ─ buildVideoPrompt()
│   └──→ CHỈ có tên + acting, THIẾU hoàn toàn mô tả ngoại hình 🔴
│
└─ Shot Variant ─ buildCharactersInfo()
    └──→ CHỈ lấy introduction, THIẾU appearances.description 🔴🔴
```

---

## Danh sách Bug cần Fix (theo thứ tự ưu tiên)

### 🔴 P0 – Critical (ảnh hưởng trực tiếp đến ngoại hình)

#### Bug #1: `buildCharactersInfo` trong `panel-variant-task-handler.ts`

**File:** [`panel-variant-task-handler.ts`](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-variant-task-handler.ts#L71-L85)

```typescript
// HIỆN TẠI (BUG):
function buildCharactersInfo(panel, projectData) {
  return panelCharacters.map(item => {
    const character = findCharacterByName(...)
    const intro = character?.introduction || ''  // ← chỉ intro
    return `- ${item.name}（${appearance}）${intro}`
  })
}

// CẦN SỬA:
function buildCharactersInfo(panel, projectData) {
  return panelCharacters.map(item => {
    const character = findCharacterByName(...)
    const intro = character?.introduction || ''
    const appearances = character?.appearances || []
    const matchedApp = item.appearance
      ? appearances.find(a => a.changeReason?.toLowerCase() === item.appearance?.toLowerCase())
      : appearances[0]
    const appearanceDesc = matchedApp
      ? (pickAppearanceDescription(matchedApp))  // ← THÊM MÔ TẢ NGOẠI HÌNH
      : '无外貌数据'
    return `- ${item.name}（${appearance}）${intro ? `角色：${intro}` : ''}${appearanceDesc ? `\n  外貌：${appearanceDesc}` : ''}`
  })
}
```

---

#### Bug #2: `buildVideoPrompt` trong `video.worker.ts`

**File:** [`video.worker.ts`](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/video.worker.ts)

Cần thêm thông tin bối cảnh (`Scene`) và mô tả ngoại hình nhân vật vào fallback prompt video.

---

### ⚠️ P1 – Moderate

#### Bug #3: Tiếng Việt lẫn trong `buildPanelPrompt` fallback

**File:** [`panel-image-task-handler.ts`](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-image-task-handler.ts#L166)

```typescript
// BUG:
if (photo?.screen_position) details.push(`vị trí：${photo.screen_position}`)

// FIX:
if (photo?.screen_position) details.push(`position: ${photo.screen_position}`)
```

---

#### Bug #4: Tên biến sai trong Phase 3

**File:** [`storyboard-phases.ts`](file:///run/media/thqui/_data/waoowaoo/src/lib/storyboard-phases.ts#L617)

```typescript
// HIỆN TẠI:
.replace('{characters_age_gender}', filteredFullDescription)  // tên biến lạ

// CẦN KIỂM TRA: template agent_storyboard_detail có dùng {characters_age_gender} không?
```

---

### ✅ P2 – Đã có, nhưng có thể tối ưu thêm

#### Rủi ro: Acting notes chứa mô tả trang phục

Phase 2 Acting truyền mô tả nhân vật vào LLM đúng cách nhưng **prompt template `agent_acting_direction` chưa cấm tuyệt đối** việc LLM tự thêm màu sắc trang phục vào trường `acting`. Nếu LLM viết ra: *"tay siết tà váy hồng"*, chuỗi này sẽ tồn tại trong DB và được ghép vào prompt Refiner ở bước sau.

---

## Kết luận – Nguyên nhân gốc rễ bug "đổi mô tả nhân vật"

Dữ liệu ngoại hình từ Asset Library **được truyền đúng** trong luồng chính (Phase 1→2→3→Refiner→Image). Bug phát sinh ở **hai nhánh ngoại lệ**:

1. **Shot Variant:** `buildCharactersInfo` bỏ qua `appearances[].description` → AI không biết nhân vật mặc gì → tự bịa
2. **Video Fallback:** `buildVideoPrompt` thiếu hoàn toàn mô tả ngoại hình + bối cảnh → AI video morph trang phục trong quá trình sinh chuyển động

**Fix ưu tiên nhất: Bug #1 trong `panel-variant-task-handler.ts` dòng 71–85** (2 dòng code, tác động lớn nhất).
