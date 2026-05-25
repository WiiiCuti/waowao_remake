# Guide: Sync Character Style — Toàn bộ điểm tác động

Ngày: 2026-05-24 (cập nhật lần 2)

**Vấn đề gốc:** Pipeline có quá nhiều prompt, mỗi prompt tự suy diễn character type (species/style) khác nhau. Lúc thì "young man", lúc thì "penguin young man", lúc thì "anthropomorphic penguin character". Gây lẫn lộn khiến model gen ảnh/video ngáo ngơ — lúc ra người, lúc ra thú.

**Nguyên nhân sâu xa:** Mỗi nhân vật ĐÃ có species trong `character.description` (DB) và được inject vào prompt qua `{characters_full_description}` / `{characters_age_gender}`. Nhưng các rule cứng "age+gender", "no need to add clothing or age"... override dữ liệu đó, bảo model tự infer "young man" → mất species.

**Giải pháp (quyết định sau phân tích):** Không cần DB field mới, không UI, không API. Chỉ sửa prompt — xóa các rule đang cấm species, thay bằng instruction "luôn dùng species từ character data".

---

## REPORT TOÀN BỘ PIPELINE — ĐIỂM TÁC ĐỘNG CHARACTER SPECIES / STYLE

### PHASE — CHARACTER ANALYSIS (Tạo thông tin nhân vật)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_character_profile.en.txt` | toàn file | Phân tích profile char — species lẫn trong `introduction` text | ⚠️ Species không structured |
| `agent_character_visual.en.txt` | 11-24 | **CÓ** instruction `non-human character`, example `Anthropomorphic animal → Fox spirit...` | ✅ |
| `agent_character_visual.en.txt` | 26-28 | S-Tier/A-Tier/B-Tier là costume complexity | — |
| `agent_character_visual.zh.txt` | tương tự | Bản zh | ✅ |

### PHASE — CHARACTER ASSET IMAGE CREATION

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `character_create.en.txt` | 17-25 | **CÓ** `non-human character not restricted` | ✅ |
| `character_create.zh.txt` | tương tự | ✅ |
| `character_modify.en.txt` | toàn file | Không có species rule riêng | ⚠️ Implicit |
| `character_description_update.en.txt` | toàn file | — | ⚠️ Implicit |
| `character_regenerate.en.txt` | toàn file | — | ⚠️ Implicit |

### PHASE 1 — STORYBOARD PLAN (Sinh panel + mô tả cảnh)

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_plan.en.txt` | 33 | Output: `characters: [{name, appearance}]` — **thiếu species** | ❌ Cần fix |
| `agent_storyboard_plan.en.txt` | 164 | Asset selection — **thiếu species** | ❌ Cần fix |
| `agent_storyboard_plan.en.txt` | 188-191 | **"No need to add clothing or age"** — **CẤM species** | ❌ Cần fix |
| `agent_storyboard_plan.en.txt` | 302-306 | Input có species, output format không có | ⚠️ |
| `agent_storyboard_plan.en.txt` | 323 | `characters must be [{name, appearance}]` | ❌ Cần fix |
| `agent_storyboard_plan.zh.txt` | tương tự | Bản zh | ❌ |

### PHASE 2 — CINEMATOGRAPHER + ACTING DIRECTION

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_cinematographer.en.txt` | toàn file | Lighting, DOF, color — **không liên quan species** | — |
| `agent_acting_direction.en.txt` | toàn file | Expressions, body language — **không liên quan species** | — |

### PHASE 3 — STORYBOARD DETAIL

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_detail.en.txt` | 6, 78-79, 175 | **Đã fix:** species instruction | ✅ |
| `agent_storyboard_detail.en.txt` | 101-134, 150 | **Examples vẫn "young woman"** | ❌ Cần fix |
| `agent_storyboard_detail.zh.txt` | 117 | **VẪN `年龄段分类`** | ❌ Cần fix |
| `agent_storyboard_detail.zh.txt` | 151 | OK | — |

### PHASE — PROMPT REFINER

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `prompt_refiner.en.txt` | 42, 54, 89, 104, 110-115 | **Đã fix:** species từ character.description, format `[角色]`, example có species | ✅ |
| `prompt_refiner.zh.txt` | tương tự | ✅ |

### PHASE — STORYBOARD INSERT

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_storyboard_insert.en.txt` | 63 | **"Use age group + gender instead of character names"** | ❌ Cần fix |
| `agent_storyboard_insert.en.txt` | 74 | **"Must use age group + gender"** | ❌ Cần fix |
| `agent_storyboard_insert.zh.txt` | 63, 74 | Bản zh | ❌ |

### PHASE — SHOT VARIANT ANALYSIS

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_shot_variant_analysis.en.txt` | 61 | `"describing characters by age+gender"` | ❌ Cần fix |
| `agent_shot_variant_analysis.en.txt` | 73 | `"must use age+gender"` | ❌ Cần fix |
| `agent_shot_variant_analysis.en.txt` | 138 | `"must use age range + gender"` | ❌ Cần fix |
| `agent_shot_variant_analysis.en.txt` | 80, 100, 109, 127 | Examples "young woman" | ❌ Cần fix |
| `agent_shot_variant_analysis.zh.txt` | 138 | `"用年龄段+性别"` | ❌ Cần fix |

### PHASE — SHOT VARIANT GENERATE + STORYBOARD EDIT + SCREENPLAY CONVERSION

| File | Dòng | Nội dung | Status |
|------|------|----------|--------|
| `agent_shot_variant_generate.en.txt` | 52-66 | Dùng ảnh reference, maintain consistency | ✅ |
| `storyboard_edit.en.txt` | 1-5 | Image edit — không liên quan | — |
| `screenplay_conversion.en.txt` | toàn file | Chuyển text→screenplay, không có species rule | ⚠️ Implicit |

---

## 📊 TỔNG KẾT

| Trạng thái | Số lượng |
|------------|----------|
| ✅ Đã có species instruction | 9 chỗ |
| ❌ Rule "age+gender" cứng / cấm species | **12 chỗ** (6 prompt × 2 ngôn ngữ) |
| ❌ Example sai (dùng "young woman") | **3 file** |
| ⚠️ Species ở input nhưng output format thiếu | 2 chỗ |
| ⚠️ Placeholder `{characters_age_gender}` tên misleading | 1 chỗ |
| — Code injection không cần sửa (character.description đã đủ) | 0 |

---

## KẾ HOẠCH CHỐT — Chỉ sửa rule đang cản species

### Vấn đề
Species ĐÃ có trong `character.description` (DB), được inject vào prompt. Nhưng các rule cứng bảo model override dữ liệu đó.

### Fix — 4 file (8 bản en+zh)

**File 1 — `agent_storyboard_plan` (en + zh)**
- Line 188-191: Xóa rule `"No need to add clothing or age"` + example cấm species
- Thay = `"Describe characters with their full visual attributes (species, age, clothing as given in character data)"`

**File 2 — `agent_storyboard_insert` (en + zh)**
- Line 63: `"Use age group + gender"` → `"Use species + age + gender from character data"`
- Line 74: `"Using character names → Must use age group + gender"` → `"Using character names → Must use species + age + gender"`

**File 3 — `agent_shot_variant_analysis` (en + zh)**
- Line 61: `"age+gender"` → `"species + age + gender"`
- Line 73: `"must use age+gender"` → `"must use species + age + gender"`
- Line 138: `"must use age range + gender"` → `"must use species + age + gender"`
- Examples: `"young woman"` → `"penguin young woman"`

**File 4 — `agent_storyboard_detail` (en + zh)**
- Examples + output: `"young woman/man"` → `"penguin young woman/man"`, `"hedgehog youth boy"`

### Không đụng đến
- ✗ constants.ts / schema.prisma / API / UI / code
- ✗ Output format (không thêm field species — description đã chứa sẵn)
- ✗ Code injection (character.description đã đúng)

**Tổng: 8 file prompt, ~12 edits. Code 0 changes.**
