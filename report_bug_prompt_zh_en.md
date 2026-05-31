# Bug Report: Chinese Prompt Leaks in Novel-Promotion Pipeline

> **Ngày tạo:** 2026-05-26  
> **Ngày hoàn tất fix:** 2026-05-26  
> **Trạng thái:** ✅ Tất cả 15 bugs đã được fix  
> **Mức độ ảnh hưởng:** Toàn bộ dự án có `locale = 'en'` bị nhiễm tiếng Trung trong prompt gửi lên LLM  
> **Pipeline bị ảnh hưởng:** `story_to_script` → `script_to_storyboard` → `panel_image` → `panel_variant` → `insert_panel` → `analyze_novel` → `analyze_global` → `asset_hub_image`

---

## Tổng Quan

Hệ thống sử dụng `job.data.locale` để chọn **file prompt template** (`.zh.txt` hoặc `.en.txt`). Tuy nhiên, **nội dung biến số (variables)** được truyền vào template đó lại bị hardcode bằng tiếng Trung bất kể locale là gì.

Khi một dự án `locale = 'en'` chạy:
- Template prompt → tiếng Anh ✅
- Biến số `characters_lib_name`, `locations_lib_name`, fallback strings, labels... → tiếng Trung ❌

Hậu quả: LLM tiếng Anh nhận được prompt lai (English-Chinese hybrid), gây ra **Language Drift**, **hallucination giới tính**, **output không nhất quán**.

---

## BUG #1 — Fatal Logic Bug: Panel Filter chỉ kiểm tra tiếng Trung

**Severity: 🔴 CRITICAL**

### Mô tả
Sau khi Phase 3 sinh ra danh sách panels, hệ thống lọc bỏ các panels trống/không hợp lệ bằng cách so sánh với chuỗi `'无'`. Khi `locale = 'en'`, LLM tiếng Anh trả về `"None"`, `"none"`, `"empty"` — **không bị lọc** → panels lỗi lọt vào DB và hiển thị trên UI.

### Vị trí

**File:** `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts` — Line 466
```typescript
const filtered = panels.filter(
  (panel) => panel.description && panel.description !== '无' && panel.location !== '无',
)
```

**File:** `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts` — Line 507
```typescript
const filtered = parsed.filter(
  (panel) => panel.description && panel.description !== '无' && panel.location !== '无',
)
```

### Fix đề xuất
```typescript
function isNullishValue(val: string | null | undefined): boolean {
  if (!val) return true
  const clean = val.trim().toLowerCase()
  return clean === '无' || clean === 'none' || clean === 'null' || clean === 'empty' || clean === 'n/a'
}

const filtered = panels.filter(
  (panel) => !isNullishValue(panel.description) && !isNullishValue(panel.location),
)
```

---

## BUG #2 — Hardcoded Chinese Fallback: `'无'` cho biến prompt

**Severity: 🟠 HIGH**

### Mô tả
Các biến template `characters_lib_name`, `locations_lib_name`, `props_lib_name` fallback về `'无'` khi danh sách rỗng, bất kể locale.

### Vị trí

| File | Line | Code |
|------|------|------|
| `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts` | 302-303 | `\|\| '无'` |
| `src/lib/novel-promotion/story-to-script/orchestrator.ts` | 266-268, 411-413, 539-541 | `\|\| '无'` |
| `src/lib/workers/handlers/analyze-novel.ts` | 108, 116, 124 | `\|\| '无'` |
| `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts` | 413-414 | `\|\| '无'` |
| `src/lib/workers/handlers/story-to-script.ts` | 289-291 | `\|\| '无'` |
| `src/lib/workers/handlers/analyze-global-prompt.ts` | 31, 34 | `\|\| '无'` |

```typescript
// Hiện tại (sai):
const charactersLibName = characters.map(c => c.name).join(', ') || '无'

// Đề xuất:
const t_none = locale === 'en' ? 'None' : '无'
const t_no_intro = locale === 'en' ? 'No character introductions available' : '暂无角色介绍'
const charactersLibName = characters.map(c => c.name).join(', ') || t_none
```

---

## BUG #3 — Hardcoded Chinese Fallback: `'暂无角色介绍'`

**Severity: 🟠 HIGH**

### Mô tả
Hàm `buildCharactersIntroduction()` trong `constants.ts` luôn trả về tiếng Trung khi không có intro. Hàm này được gọi ở **11 nơi** trong toàn bộ codebase và không nhận tham số locale.

### Vị trí chính

**File:** `src/lib/constants.ts` — Lines 306, 312
```typescript
export function buildCharactersIntroduction(characters: ...): string {
  if (!characters || characters.length === 0) return '暂无角色介绍'  // ❌
  // ...
  if (introductions.length === 0) return '暂无角色介绍'  // ❌
  return introductions.join('\n')
}
```

**Callsites bị ảnh hưởng (11 nơi):**
- `src/lib/assets/services/asset-prompt-context.ts`
- `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`
- `src/lib/novel-promotion/story-to-script/orchestrator.ts`
- `src/lib/storyboard-phases.ts`
- `src/lib/workers/handlers/clips-build.ts`
- `src/lib/workers/handlers/screenplay-convert.ts`
- `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts`
- `src/lib/workers/handlers/script-to-storyboard.ts`
- `src/lib/workers/handlers/voice-analyze.ts`

### Fix đề xuất
```typescript
export function buildCharactersIntroduction(
  characters: Array<{ name: string; introduction?: string | null }>,
  locale: 'zh' | 'en' = 'zh',  // thêm param locale
): string {
  const fallback = locale === 'en' ? 'No character introductions available' : '暂无角色介绍'
  if (!characters || characters.length === 0) return fallback
  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}: ${c.introduction}`)
  if (introductions.length === 0) return fallback
  return introductions.join('\n')
}
```

---

## BUG #4 — Hardcoded Chinese Fallback: Labels mô tả nhân vật / ngoại hình

**Severity: 🟠 HIGH**

### Mô tả
Các label/fallback như `'无角色数据'`, `'无角色外貌数据'`, `'无描述'`, `'初始形象'` được hardcode tiếng Trung và truyền trực tiếp vào prompt gửi LLM.

### Vị trí

| File | Line | Chuỗi hardcode |
|------|------|----------------|
| `src/lib/assets/services/asset-prompt-context.ts` | 103 | `'无描述'` |
| `src/lib/assets/services/asset-prompt-context.ts` | 118 | `["初始形象"]` |
| `src/lib/assets/services/asset-prompt-context.ts` | 120 | `\|\| '初始形象'` |
| `src/lib/assets/services/asset-prompt-context.ts` | 129 | `'无形象描述'` |
| `src/lib/assets/services/asset-prompt-context.ts` | 132 | `\|\| '初始形象'` |
| `src/lib/assets/services/asset-prompt-context.ts` | 135 | `\|\| '无描述'` |
| `src/lib/novel-promotion/prompt-refiner.ts` | 88 | `'无描述'` |
| `src/lib/novel-promotion/prompt-refiner.ts` | 126 | `'无角色数据'` |
| `src/lib/novel-promotion/prompt-refiner.ts` | 132 | `'无角色外貌数据'` |
| `src/lib/workers/handlers/panel-image-task-handler.ts` | 61 | `'无描述'` |
| `src/lib/workers/handlers/panel-image-task-handler.ts` | 87, 100 | `'无角色外貌数据'` |
| `src/lib/workers/text.worker.ts` | 514 | `'无形象信息'` |
| `src/lib/workers/text.worker.ts` | 526 | `'无描述'` |

---

## BUG #5 — Hardcoded Chinese: `CHARACTER_PROMPT_SUFFIX` và `PROP_PROMPT_SUFFIX`

**Severity: 🟠 HIGH**

### Mô tả
Các hậu tố prompt (layout instruction cho AI vẽ ảnh) bị hardcode hoàn toàn bằng tiếng Trung. Khi user tiếng Anh tạo ảnh nhân vật/đạo cụ, mô hình sẽ nhận một đoạn prompt lai **English description + Chinese layout instruction**, gây giảm chất lượng ảnh đầu ra.

### Vị trí

**File:** `src/lib/constants.ts` — Lines 234, 237
```typescript
// ❌ Cả 2 hằng số này chỉ có tiếng Trung:
export const CHARACTER_PROMPT_SUFFIX = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写...'
export const PROP_PROMPT_SUFFIX = '道具设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是道具主体的主视图特写...'
```

Các function `addCharacterPromptSuffix()` và `addPropPromptSuffix()` dùng trực tiếp constants này mà không nhận locale parameter.

### Fix đề xuất
```typescript
export const CHARACTER_PROMPT_SUFFIX_ZH = '角色设定图，画面分为左右两个区域：...'
export const CHARACTER_PROMPT_SUFFIX_EN = 'Character design sheet, divided into two areas: [Left area] ~1/3 width, front-view close-up of the character (full face for humans, most recognizable form for animals/creatures); [Right area] ~2/3 width, three-view orthographic layout (front full-body, side full-body, back full-body) arranged horizontally with equal heights. Pure white background, no other elements.'

export function getCharacterPromptSuffix(locale: 'zh' | 'en' = 'zh'): string {
  return locale === 'en' ? CHARACTER_PROMPT_SUFFIX_EN : CHARACTER_PROMPT_SUFFIX_ZH
}

export function addCharacterPromptSuffix(prompt: string, locale: 'zh' | 'en' = 'zh'): string {
  const suffix = getCharacterPromptSuffix(locale)
  const sep = locale === 'en' ? ', ' : '，'
  if (!prompt) return suffix
  const cleanPrompt = prompt.replace(CHARACTER_PROMPT_SUFFIX_ZH, '').replace(CHARACTER_PROMPT_SUFFIX_EN, '').trim()
  return `${cleanPrompt}${cleanPrompt ? sep : ''}${suffix}`
}
```

---

## BUG #6 — Style Fallback bằng tiếng Trung khi artStyle rỗng

**Severity: 🟡 MEDIUM**

### Mô tả
Khi không tìm thấy artStyle cho một project, hệ thống fallback về chuỗi tiếng Trung `'与参考图风格一致'` (nghĩa: "Consistent with reference image style"). Chuỗi này được nhúng vào prompt tạo ảnh gửi lên AI.

### Vị trí

| File | Line | Code |
|------|------|------|
| `src/lib/workers/handlers/panel-image-task-handler.ts` | 260 | `styleText: artStyle \|\| '与参考图风格一致'` |
| `src/lib/workers/handlers/panel-variant-task-handler.ts` | 265 | `style: artStyle \|\| '与参考图风格一致'` |

### Fix đề xuất
```typescript
const styleDefault = job.data.locale === 'en'
  ? 'Match the style of the reference image'
  : '与参考图风格一致'
styleText: artStyle || styleDefault,
```

---

## BUG #7 — Character Asset Description dùng dấu ngoặc tiếng Trung `（）` và `：` với locale EN

**Severity: 🟡 MEDIUM**

### Mô tả
Hàm `buildCharactersInfo()` trong `panel-variant-task-handler.ts` dùng ngoặc đơn kiểu Trung Quốc `（）` và dấu hai chấm toàn chiều rộng `：` để format chuỗi, bất kể locale là gì. Chuỗi này được truyền vào biến `characters_info` của prompt.

### Vị trí

**File:** `src/lib/workers/handlers/panel-variant-task-handler.ts` — Lines 82-83, 96, 98
```typescript
// ❌ Dùng ký tự Trung Quốc bất kể locale:
return `- ${item.name}（${appearance}${slotText}）${intro ? `：${intro}` : ''}`
// ...
if (!character) return `- ${item.name}：无参考图`  // ❌
return `- ${item.name}：${hasAppearance ? '已提供参考图' : '无参考图'}`  // ❌
```

### Fix đề xuất
```typescript
function buildCharactersInfo(panel, projectData, locale: 'zh' | 'en' = 'zh'): string {
  if (panelCharacters.length === 0) return locale === 'en' ? 'No characters' : '无角色'
  return panelCharacters.map(item => {
    const character = findCharacterByName(projectData.characters || [], item.name)
    const intro = character?.introduction || ''
    const appearance = item.appearance || (locale === 'en' ? 'Default' : '默认形象')
    const slotText = item.slot
      ? (locale === 'en' ? `, fixed position: ${item.slot}` : `，固定位置：${item.slot}`)
      : ''
    const separator = locale === 'en' ? ': ' : '：'
    const open = locale === 'en' ? ' (' : '（'
    const close = locale === 'en' ? ')' : '）'
    return `- ${item.name}${open}${appearance}${slotText}${close}${intro ? `${separator}${intro}` : ''}`
  }).join('\n')
}
```

---

## BUG #8 — `buildCharactersLibInfo()` không nhận locale (analyze-global pipeline)

**Severity: 🟡 MEDIUM**

### Mô tả
Hàm `buildCharactersLibInfo()` trong `analyze-global-parse.ts` tạo chuỗi mô tả thư viện nhân vật gửi vào LLM. Toàn bộ labels và separators đều hardcode tiếng Trung.

### Vị trí

**File:** `src/lib/workers/handlers/analyze-global-parse.ts` — Lines 67-76
```typescript
export function buildCharactersLibInfo(characters: CharacterBrief[]): string {
  if (characters.length === 0) return '暂无已有角色'  // ❌
  return characters.map((c, i) => {
    const aliasStr = c.aliases.length > 0 ? `别名：${c.aliases.join('、')}` : '别名：无'  // ❌
    const introStr = c.introduction ? `介绍：${c.introduction}` : '介绍：暂无'  // ❌
    return `${i + 1}. ${c.name}\n   ${aliasStr}\n   ${introStr}`
  }).join('\n\n')
}
```

---

## BUG #9 — `insert_panel` task: fallback tiếng Trung + stepTitle hardcode

**Severity: 🟡 MEDIUM**

### Mô tả
Trong task `handleInsertPanelTask()`, nhiều chuỗi được hardcode tiếng Trung không phụ thuộc locale.

### Vị trí

**File:** `src/lib/workers/text.worker.ts`

| Line | Code |
|------|------|
| 504 | `nextPanelJson = '无'` (khi không có panel tiếp theo) |
| 514 | `return \`${character.name}: 无形象信息\`` |
| 526 | `\|\| '无描述'` |
| 527 | `\|\| '默认': ${selectedDescription}` |
| 532 | `\|\| '无'` |
| 541 | `prop.summary \|\| '无描述'` |
| 542 | `\|\| '无'` |
| 573 | `stepTitle: '插入分镜'` (tiêu đề step hardcode tiếng Trung) |

---

## BUG #10 — `insert-panel-prompt-context.ts`: fallback `'无'` và `'无描述'` không locale-aware

**Severity: 🟡 MEDIUM**

### Vị trí

**File:** `src/lib/novel-promotion/insert-panel-prompt-context.ts` — Lines 29, 35
```typescript
if (filteredLocations.length === 0) {
  return '无'  // ❌ Không kiểm tra locale
}
// ...
const description = selectedImage?.description || '无描述'  // ❌
```

Hàm này đã nhận tham số `locale: Locale = 'zh'` nhưng **không dùng nó** để điều chỉnh các fallback strings.

---

## BUG #11 — `vị trí：` hardcode tiếng Việt trong prompt tạo ảnh (Extra Bug!)

**Severity: 🟡 MEDIUM — Unexpected Language Leak**

### Mô tả
Trong hàm `buildPanelPrompt()` dùng để build prompt tạo ảnh cho panel, có một chuỗi tiếng **Việt** bị hardcode thay vì tiếng Anh/Trung.

### Vị trí

**File:** `src/lib/workers/handlers/panel-image-task-handler.ts` — Line 166
```typescript
// ❌ "vị trí" là tiếng VIỆT — không phải tiếng Anh hay tiếng Trung!
if (photo?.screen_position) details.push(`vị trí：${photo.screen_position}`)
```

### Fix đề xuất
```typescript
const posLabel = params.locale === 'en' ? 'position' : '位置'
if (photo?.screen_position) details.push(`${posLabel}: ${photo.screen_position}`)
```

---

## BUG #12 — `story-to-script/orchestrator.ts`: `'暂无已有角色'` hardcode

**Severity: 🟡 MEDIUM**

### Vị trí

**File:** `src/lib/novel-promotion/story-to-script/orchestrator.ts` — Line 271
```typescript
const baseCharacterInfo = baseCharacterIntroductions.length > 0
  ? baseCharacterIntroductions.map((item, index) => `${index + 1}. ${item.name}`).join('\n')
  : '暂无已有角色'  // ❌ hardcode tiếng Trung
```

---

## BUG #13 — Separator dùng dấu `、` (tiếng Trung) thay vì `,` khi locale EN

**Severity: 🟡 MEDIUM**

### Mô tả
Dấu liệt kê `、` là dấu phân tách đặc trưng của tiếng Trung và Nhật. Khi locale là `en`, LLM tiếng Anh nhận được danh sách dùng ký tự `、`, gây nhầm lẫn về ngữ cảnh.

### Vị trí

| File | Line | Code |
|------|------|------|
| `src/lib/novel-promotion/story-to-script/orchestrator.ts` | 266-268 | `.join('、')` |
| `src/lib/workers/handlers/analyze-global-parse.ts` | 71 | `.join('、')` |

---

## BUG #14 — `voice_analyze` retry message hardcode tiếng Trung

**Severity: 🟢 LOW**

### Vị trí

**File:** `src/lib/workers/handlers/script-to-storyboard.ts` — Line 513
```typescript
// ❌ Message hiển thị trên UI tiếng Anh nhưng lại là tiếng Trung:
message: `台词分析失败，准备重试 (${voiceAttempt + 1}/${MAX_VOICE_ANALYZE_ATTEMPTS})`,
```

---

## BUG #15 — `asset-label.ts`: `'初始形象'` hardcode không locale

**Severity: 🟢 LOW**

### Vị trí

**File:** `src/lib/assets/services/asset-label.ts` — Line 21
```typescript
return `${input.assetName} - ${input.variantLabel || '初始形象'}`  // ❌
```

---

## Tóm Tắt Toàn Bộ Lỗi

| # | Severity | File chính bị ảnh hưởng | Chuỗi/Pattern sai | Tác động |
|---|----------|------------------------|--------------------|----------|
| 1 | 🔴 CRITICAL | `orchestrator.ts` (×2) | Filter `!== '无'` | Panels lỗi lọt vào DB với locale EN |
| 2 | 🟠 HIGH | 6 file handler | `\|\| '无'` | Biến prompt truyền sai ngôn ngữ |
| 3 | 🟠 HIGH | `constants.ts` (11 callsite) | `buildCharactersIntroduction()` | Intro nhân vật luôn tiếng Trung |
| 4 | 🟠 HIGH | 6 file | `'无角色数据'`, `'初始形象'`... | Mô tả nhân vật sai ngôn ngữ |
| 5 | 🟠 HIGH | `constants.ts` | `CHARACTER_PROMPT_SUFFIX`, `PROP_PROMPT_SUFFIX` | Prompt ảnh nhân vật lai zh-en |
| 6 | 🟡 MEDIUM | `panel-image-task-handler.ts`, `panel-variant-task-handler.ts` | `'与参考图风格一致'` | Style fallback tiếng Trung |
| 7 | 🟡 MEDIUM | `panel-variant-task-handler.ts` | `（）`, `：`, `无参考图` | Format chuỗi ký tự Trung |
| 8 | 🟡 MEDIUM | `analyze-global-parse.ts` | `buildCharactersLibInfo()` | Toàn bộ lib info tiếng Trung |
| 9 | 🟡 MEDIUM | `text.worker.ts` | `'无'`, `'默认'`, `'插入分镜'` | insert_panel task |
| 10 | 🟡 MEDIUM | `insert-panel-prompt-context.ts` | `'无'`, `'无描述'` | Không dùng locale param |
| 11 | 🟡 MEDIUM | `panel-image-task-handler.ts` | `vị trí：` | **Tiếng VIỆT** trong prompt! |
| 12 | 🟡 MEDIUM | `story-to-script/orchestrator.ts` | `'暂无已有角色'` | Character lib info tiếng Trung |
| 13 | 🟡 MEDIUM | `story-to-script/orchestrator.ts`, `analyze-global-parse.ts` | `.join('、')` | Separator sai khi locale EN |
| 14 | 🟢 LOW | `script-to-storyboard.ts` | `'台词分析失败...'` | UI message tiếng Trung |
| 15 | 🟢 LOW | `asset-label.ts` | `'初始形象'` | Asset label tiếng Trung |

---

## Giải Pháp Tổng Thể Đề Xuất

### 1. Tạo Translation Map tập trung
```typescript
// src/lib/i18n/prompt-strings.ts
export type PromptLocale = 'zh' | 'en'

export const PROMPT_STRINGS = {
  none:                { zh: '无',          en: 'None' },
  no_description:      { zh: '无描述',       en: 'No description' },
  no_char_data:        { zh: '无角色数据',    en: 'No character data' },
  no_appearance_data:  { zh: '无角色外貌数据', en: 'No character appearance data' },
  no_appearance_info:  { zh: '无形象信息',    en: 'No appearance info' },
  no_appearance_desc:  { zh: '无形象描述',    en: 'No appearance description' },
  initial_appearance:  { zh: '初始形象',      en: 'Initial appearance' },
  default_appearance:  { zh: '默认形象',      en: 'Default appearance' },
  default:             { zh: '默认',          en: 'Default' },
  no_char_intro:       { zh: '暂无角色介绍',  en: 'No character introductions' },
  no_existing_chars:   { zh: '暂无已有角色',  en: 'No existing characters' },
  no_intro:            { zh: '暂无',          en: 'None' },
  alias:               { zh: '别名',          en: 'Aliases' },
  intro:               { zh: '介绍',          en: 'Introduction' },
  no_ref_image:        { zh: '无参考图',      en: 'No reference image' },
  has_ref_image:       { zh: '已提供参考图',  en: 'Reference image provided' },
  style_match_ref:     { zh: '与参考图风格一致', en: 'Match the style of the reference image' },
  position:            { zh: '位置',          en: 'position' },
} as const

export function t(key: keyof typeof PROMPT_STRINGS, locale: PromptLocale = 'zh'): string {
  return PROMPT_STRINGS[key][locale]
}
```

### 2. Sửa Filter Bug ngay lập tức (Bug #1)
```typescript
// Thêm vào src/lib/utils/prompt-validation.ts
export function isNullishPromptValue(val: string | null | undefined): boolean {
  if (!val) return true
  const clean = val.trim().toLowerCase()
  return ['无', 'none', 'null', 'empty', 'n/a', ''].includes(clean)
}
```

### 3. Thêm `locale` param vào `buildCharactersIntroduction()` và `addCharacterPromptSuffix()` (Bug #3, #5)

### 4. Priority Fix Order
1. 🔴 Bug #1 — Filter panels (ảnh hưởng data integrity)
2. 🟠 Bug #5 — CHARACTER/PROP_PROMPT_SUFFIX (ảnh hưởng chất lượng ảnh)
3. 🟠 Bug #3 — `buildCharactersIntroduction()` (ảnh hưởng 11 callsite)
4. 🟠 Bug #2 — Fallback `'无'` trong biến prompt (ảnh hưởng LLM context)
5. 🟡 Bug #11 — `vị trí：` (tiếng Việt) — fix ngay vì dễ
6. Còn lại: Medium/Low priority có thể batch trong một sprint

---

*Report được tạo bởi automated audit vào 2026-05-26. Tổng số bugs tìm thấy: **15 điểm** trải đều trên **13 file** trong pipeline `src/lib/`.*
