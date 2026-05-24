# Guide: Sync Character Style — Toàn bộ điểm tác động

Ngày: 2026-05-24

**Vấn đề gốc:** Pipeline có quá nhiều prompt, mỗi prompt tự suy diễn character type (species/style) khác nhau. Lúc thì "young man", lúc thì "penguin young man", lúc thì "anthropomorphic penguin character". Gây lẫn lộn khiến model gen ảnh/video ngáo ngơ — lúc ra người, lúc ra thú.

**Giải pháp:** Cần 1 `character_type` global (human / anthropomorphic / furry / animal / creature), inject vào tất cả prompt qua `{character_type}` placeholder. Set 1 lần ở project → toàn pipeline dùng chung.

---

## REPORT TOÀN BỘ PIPELINE — ĐIỂM TÁC ĐỘNG CHARACTER SPECIES / STYLE

### PHASE — CHARACTER ANALYSIS (Tạo thông tin nhân vật)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_character_profile.en.txt` | toàn file | Phân tích profile char — không có field `species` riêng, species lẫn trong `introduction` text | ⚠️ Species không structured |
| `agent_character_visual.en.txt` | 11-24 | **CÓ** instruction `non-human character`, có example `Anthropomorphic animal → Fox spirit, retaining fox features...` | ✅ Đã có |
| `agent_character_visual.en.txt` | 26-28 | S-Tier/A-Tier/B-Tier là costume complexity — không liên quan species | — |
| `agent_character_visual.zh.txt` | tương tự | Bản zh | ✅ |

### PHASE — CHARACTER ASSET IMAGE CREATION (Tạo ảnh tham chiếu nhân vật)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `character_create.en.txt` | 17-25 | **CÓ** `non-human character not restricted by human template`, example `Sun Wukong`, `Pikachu`, `snail` | ✅ |
| `character_create.zh.txt` | tương tự | Bản zh | ✅ |
| `character_modify.en.txt` | toàn file | Sửa character description — không có species rule riêng | ⚠️ Implicit |
| `character_description_update.en.txt` | toàn file | Update description — không có species rule riêng | ⚠️ Implicit |
| `character_regenerate.en.txt` | toàn file | Regen character — không có species rule riêng | ⚠️ Implicit |

### PHASE 1 — STORYBOARD PLAN (Sinh panel + mô tả cảnh)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_plan.en.txt` | 33 | Output format: `characters: [{name, appearance}]` — **KHÔNG có species field** | ❌ |
| `agent_storyboard_plan.en.txt` | 164 | Asset selection: `characters: [{name, appearance}]` — **KHÔNG có species** | ❌ |
| `agent_storyboard_plan.en.txt` | 188-191 | **"No need to add clothing or age descriptions. ❌ Wrong: 'The young man Zhang San in a white T-shirt'. ✅ Correct: 'Zhang San'"** | ❌ CẤM species |
| `agent_storyboard_plan.en.txt` | 302-306 | `{characters_appearance_list}` + `{characters_full_description}` — có species trong input nhưng output k dùng | ⚠️ Input có, output mất |
| `agent_storyboard_plan.en.txt` | 323 | `characters must be [{name, appearance}]` | ❌ Không species |
| `agent_storyboard_plan.zh.txt` | tương tự | Bản zh | ❌ |

### PHASE 2 — CINEMATOGRAPHER (Photography rules)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_cinematographer.en.txt` | 1-10 | Lighting, character positions, DOF, color — **không động đến species/style** | — / N/A |
| `agent_cinematographer.zh.txt` | tương tự | Bản zh | — |

### PHASE 3 — ACTING DIRECTION

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_acting_direction.en.txt` | 1-30 | Expressions, body language, micro-movements — **không động đến species** | — / N/A |
| `agent_acting_direction.zh.txt` | tương tự | Bản zh | — |

### PHASE 3 — STORYBOARD DETAIL (Sinh video_prompt + shot_type)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_detail.en.txt` | 6 | **Đã fix:** `describe characters by visual attributes including species` | ✅ |
| `agent_storyboard_detail.en.txt` | 78-79 | **Đã fix:** `species + appearance + action + camera` + example `penguin young man` | ✅ |
| `agent_storyboard_detail.en.txt` | 175 | **Đã fix:** `must use visual attributes including species` | ✅ |
| `agent_storyboard_detail.en.txt` | 101-134 | **Examples vẫn dùng `"young woman"`, `"young man"`** — không có example species | ❌ Example sai |
| `agent_storyboard_detail.en.txt` | 150 | Output example: `"young man stands at the table..."` | ❌ Example sai |
| `agent_storyboard_detail.en.txt` | 164 | `{characters_age_gender}` — **placeholder name misleading** "age_gender" nhưng thực tế được inject `filteredFullDescription` | ⚠️ Misleading name |
| `agent_storyboard_detail.zh.txt` | 117 | **VẪN CÒN `年龄段分类（只使用这些词汇）`** — list age+gender cứng | ❌ Chưa fix zh |
| `agent_storyboard_detail.zh.txt` | 151 | Output example name+appearance (OK vì detail giữ nguyên) | — |

### PHASE — PROMPT REFINER (Enrich image_prompt + video_prompt)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `prompt_refiner.en.txt` | 42 | `image_prompt`: "Each character: DETAILED description of appearance/hair/clothing from character.description" — **có species qua character.description** | ✅ |
| `prompt_refiner.en.txt` | 54 | Cấm audio/dialogue trong image_prompt | ✅ |
| `prompt_refiner.en.txt` | 89 | Format `[角色] name: species + age + gender + appearance/clothing` | ✅ |
| `prompt_refiner.en.txt` | 104 | Example có `penguin young man`, `hedgehog youth boy` | ✅ |
| `prompt_refiner.en.txt` | 110-115 | Key rules: FULL species from character.description, chỉ dùng tên sau khi define | ✅ |
| `prompt_refiner.zh.txt` | tương tự | Bản zh | ✅ |

### PHASE — STORYBOARD INSERT (Chèn thêm panel)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_insert.en.txt` | 63 | **VẪN `"Use age group + gender instead of character names"`** + age categories | ❌ Chưa fix |
| `agent_storyboard_insert.en.txt` | 74 | **VẪN `"Must use age group + gender"`** | ❌ Chưa fix |
| `agent_storyboard_insert.zh.txt` | 63, 74 | Bản zh — cùng vấn đề | ❌ Chưa fix |

### PHASE — SHOT VARIANT ANALYSIS (Phân tích biến thể shot)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_shot_variant_analysis.en.txt` | 61 | `"describing characters by age+gender"` | ❌ Chưa fix |
| `agent_shot_variant_analysis.en.txt` | 73 | `"must use age+gender instead of character names"` | ❌ Chưa fix |
| `agent_shot_variant_analysis.en.txt` | 80, 100, 109, 127 | **Examples toàn `"young woman"`** | ❌ Example sai |
| `agent_shot_variant_analysis.en.txt` | 138 | `"must use age range + gender"` | ❌ Chưa fix |
| `agent_shot_variant_analysis.zh.txt` | 138 | **VẪN `"用年龄段+性别"`** | ❌ Chưa fix |

### PHASE — SHOT VARIANT GENERATE (Gen ảnh cho variant)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_shot_variant_generate.en.txt` | 52-54 | `{character_assets}` — dùng ảnh reference nhân vật để giữ consistency | ✅ Dùng ảnh |
| `agent_shot_variant_generate.en.txt` | 65-66 | "Maintain character appearance consistency" — giữ nguyên appearance từ ref ảnh | ✅ |
| `agent_shot_variant_generate.zh.txt` | tương tự | Bản zh | ✅ |

### PHASE — STORYBOARD EDIT (Sửa panel)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `storyboard_edit.en.txt` | 1-5 | Image edit — **không có character rule**, chỉ chỉnh sửa theo input user | — / N/A |

### PHASE — SCREENPLAY CONVERSION

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `screenplay_conversion.en.txt` | toàn file | Chuyển text → screenplay JSON. Characters = name từ character list. Không có species instruction riêng. | ⚠️ Implicit |

---

## 🔧 CODE LEVEL — NƠI INJECT STYLE / COMPILE CHARACTER DATA

| File | Dòng | Cơ chế | Thiếu |
|------|------|--------|-------|
| `src/lib/constants.ts` | 137-194 | `ART_STYLES` với `promptEn`/`promptZh` — set **art style** (cách vẽ: chibi, comic, realistic) | **Không có `character_type` (người/thú/furry)** |
| `src/lib/constants.ts` | 209-217 | `getArtStylePrompt()` — inject style text vào prompt | **Chưa inject character_type** |
| `src/lib/storyboard-phases.ts` | 164-172 | `getFilteredFullDescription()` — compile character description từ DB | **Chưa prepend character_type** |
| `src/lib/storyboard-phases.ts` | 157-163 | `getFilteredAppearanceList()` — compile appearance list cho `{characters_appearance_list}` | **Không có species/type prefix** |
| `src/lib/storyboard-phases.ts` | 617 | `{characters_age_gender}` → `filteredFullDescription` | **Placeholder gây confused** |
| `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts` | 354-357 | Inject `{characters_appearance_list}`, `{characters_full_description}`, `{original_text}` | **Không inject character_type** |
| `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts` | 444 | Inject `{characters_age_gender}` → detail prompt | **Chưa inject character_type** |
| `src/lib/novel-promotion/prompt-refiner.ts` | 332 | `styleText = getArtStylePrompt(artStyle)` → inject vào refine | **styleText chỉ có art style, không có character_type** |
| `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts` | 495 | Tương tự inject `{characters_age_gender}` | **Chưa inject character_type** |

---

## 📊 TỔNG KẾT

| Trạng thái | Số lượng |
|------------|----------|
| ✅ Đã có species instruction | 9 chỗ |
| ❌ Còn "age+gender" cứng, cấm species | **12 chỗ** (6 prompt x 2 ngôn ngữ) |
| ❌ Example sai (dùng "young woman") | **3 file** |
| ⚠️ Có species ở input nhưng output thiếu | 2 chỗ |
| ⚠️ Placeholder misleading name | 1 chỗ |
| 🔧 Code chưa inject global `character_type` | **8 chỗ inject** |

---

## Cần 1 `character_type` global

Thêm vào config project/novel:

```typescript
type CharacterType = 'human' | 'anthropomorphic' | 'furry' | 'animal' | 'creature'
// → "human"         → mô tả như người: "young man"
// → "anthropomorphic" → thú nhân hóa: "anthropomorphic penguin character"  
// → "furry"          → thú hóa: "furry penguin with blue scarf"
// → "animal"         → động vật thuần: "penguin with orange goggles"
// → "creature"       → sinh vật hư cấu: "dragon, snake body with scales"
```

Inject qua `{character_type}` placeholder vào:
1. `agent_storyboard_plan` — character description
2. `agent_storyboard_detail` — video_prompt
3. `prompt_refiner` — image_prompt + video_prompt
4. `agent_storyboard_insert` — video_prompt
5. `agent_shot_variant_analysis` — video_prompt
6. `screenplay_conversion` — character references
