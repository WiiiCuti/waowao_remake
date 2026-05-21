# Prompt Refinement Agent (v2)

## Data Pipeline Bugs — PHẢI FIX TRƯỚC

Có 2 bug trong data pipeline làm refine LLM nhận data rỗng ở các field quan trọng.

### Bug 1: `mergePanelsWithRules` mất 3 field từ cinematographer

**Source**: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:190` và `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts:299`

Cinematographer LLM (Phase 2a) output:
```json
{
  "lighting": {"direction": "侧光...", "quality": "柔和..."},
  "depth_of_field": "浅景深（T2.8）",
  "color_tone": "暖色调",
  "characters": [{"name":"X","screen_position":"left","posture":"standing","facing":"right"}],
  "scene_summary": "太子妃寝殿，白天"
}
```

`mergePanelsWithRules` đọc với key SAI:
```
composition   ← rules.composition       → undefined (LLM ko output)
lighting      ← rules.lighting          → {direction,quality} ✅
colorPalette  ← rules.color_palette     → undefined (LLM dùng "color_tone")
atmosphere    ← rules.atmosphere        → undefined (LLM dùng "scene_summary")
technicalNotes← rules.technical_notes   → undefined (LLM ko output)
```

**DB chỉ có**: `{"lighting":{"direction":"...","quality":"..."}}`
→ `depth_of_field`, `color_tone`, `characters` array — **bị mất**.

### Bug 2: `buildCharDetails` đọc sai format actingNotes

**Source**: `src/lib/novel-promotion/prompt-refiner.ts:99`

DB lưu actingNotes là **array** (từ Phase 2b Acting Direction):
```json
[{"name":"X","acting":"嘴角微扬眼神柔和..."}]
```

`buildCharDetails` đọc:
```typescript
const acting = (actingNotes?.characters as Array<...>)?.find(...)
```

Nhưng **array không có `.characters`** → luôn `undefined`.

Tương tự `photoRules?.characters` — DB chỉ có `{lighting:{...}}`, ko có `characters` array.

**Kết quả** — dữ liệu gửi cho refine LLM bị rỗng ở các field quan trọng:

| Field | Trong code | Thực tế | Lý do |
|---|---|---|---|
| `lighting` | ✅ object {direction, quality} | ✅ Có | Merge đọc đúng key "lighting" |
| `depth_of_field` | ✅ in plan | ❌ null | Merge ko capture |
| `color_tone` | ✅ in plan | ❌ null | Merge đọc key "color_palette" (sai) |
| `characters[].screen_position` | ✅ in plan | ❌ "" | photoRules.characters ko tồn tại |
| `characters[].posture` | ✅ in plan | ❌ "" | photoRules.characters ko tồn tại |
| `characters[].acting` | ✅ in plan | ❌ "" | actingNotes là array, code đọc `.characters` |
| `characters[].name` | ✅ | ✅ | Từ panel.characters string |
| `characters[].appearance` | ✅ | ✅ | changeReason từ character refs |
| `characterResources[].description` | ✅ | ✅ | Full text từ asset library |
| `locationResource.*` | ✅ | ✅ | Từ location DB |

---

## Solution

### Phase 0: Fix data pipeline bugs (ưu tiên cao nhất)

| # | Bug | Fix |
|---|---|---|
| 0a | `mergePanelsWithRules` mất `depth_of_field`, `color_tone`, `characters`, `scene_summary` | Sửa `photographyPlan` mapping trong **2 file** (orchestrator.ts + atomic-retry.ts) |
| 0b | `buildCharDetails` đọc sai `actingNotes.characters` | Sửa thành `(actingNotes as Array).find(...)` vì actingNotes là array |
| 0c | `buildCharDetails` đọc `photoRules.characters` | Sau fix 0a, photoRules.characters đã có → code tự chạy đúng |

#### Fix 0a: Sửa mergePanelsWithRules (2 file)

**File**: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:190`

```typescript
photographyPlan: {
  composition: rules.composition,
  lighting: rules.lighting,
  color_tone: rules.color_tone,            // ← sửa từ colorPalette, key đúng
  depth_of_field: rules.depth_of_field,     // ← thêm
  characters: rules.characters,            // ← thêm
  scene_summary: rules.scene_summary,       // ← thêm (dùng làm mood/atmosphere)
  atmosphere: rules.atmosphere,
  color_palette: rules.color_palette,       // giữ nếu có
  technical_notes: rules.technical_notes,
},
```

**File**: `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts:299` — same change.

#### Fix 0b: Sửa buildCharDetails

**File**: `src/lib/novel-promotion/prompt-refiner.ts:91-109`

```typescript
function buildCharDetails(
  charRefs: Array<{ name: string; appearance?: string }>,
  photoRules: Record<string, unknown> | null,
  actingNotes: Record<string, unknown> | null,  // thực tế là array
): CharDetail[] {
  const actingList = Array.isArray(actingNotes) ? actingNotes : ((actingNotes as Record<string, unknown>)?.characters as Array<Record<string, string>> || [])
  const photoChars = (photoRules?.characters as Array<Record<string, string>> | undefined) || []
  return charRefs.map((ref) => {
    const photo = photoChars.find((c) => c.name?.toLowerCase() === ref.name.toLowerCase())
    const acting = actingList.find((c: Record<string, string>) => c.name?.toLowerCase() === ref.name.toLowerCase())
    return {
      name: ref.name,
      appearance: ref.appearance || '',
      screen_position: photo?.screen_position || '',
      posture: photo?.posture || '',
      acting: acting?.acting || '',
    }
  })
}
```

#### Fix 0c: Auto-fix (consequence của 0a)

Sau fix 0a, `photoRules.characters` có dữ liệu → code hiện tại `(photoRules?.characters...)?.find(...)` tự chạy đúng. Không cần sửa.

### Phase 1: Rewrite prompt template

**File**: `lib/prompts/novel-promotion/prompt_refiner.zh.txt`

```
Bạn là chuyên gia tinh chỉnh prompt storyboard.

Mảng panel cần refine:
{panels_batch_json}

Mỗi input element gồm:
- current: panel hiện tại
- previous: panel trước hoặc null
- characters: tài nguyên nhân vật ({name, appearance, description})
- location: tài nguyên bối cảnh ({name, description, availableSlots})
- style: art style ở top level

current chứa:
  panelIndex: số thứ tự
  panelNumber: số panel
  shotType: loại shot
  cameraMove: chuyển động camera
  description: mô tả nội dung cảnh
  location: địa điểm
  srtSegment: lời thoại/narration
  duration: thời lượng (giây)
  characters[]: {name, appearance, screen_position, posture, acting}
  photographyRules: {lighting: {direction, quality}, color_tone, depth_of_field}
  existingVideoPrompt: video_prompt có sẵn từ Phase 3 (hoặc rỗng)

previous chứa:
  panelIndex, location, shotType, cameraMove
  characters[]: {name, appearance, screen_position, posture, acting}
  photographyRules: {lighting, color_tone, depth_of_field}
  imagePrompt, videoPrompt

---

【image_prompt】

Viết MỘT đoạn văn tiếng Việt mô tả chi tiết khung hình, dùng làm prompt cho AI tạo ảnh.

Không phải JSON. Không có field:value. Là đoạn văn liên tục.

Nội dung bắt buộc (từ input hiện tại):
- Bối cảnh + không gian (location mô tả, time of day)
- Từng nhân vật: mô tả CHI TIẾT ngoại hình/tóc/trang phục (từ character.description),
  vị trí trong khung hình (screen_position), tư thế (posture), hành động (acting)
- Camera: shot_type + camera_move
- Ánh sáng: hướng + chất lượng (photographyRules.lighting)
- Màu sắc chủ đạo (photographyRules.color_tone) — NẾU CÓ
- Độ sâu trường ảnh (photographyRules.depth_of_field) — NẾU CÓ
- Không khí / mood

Yêu cầu:
- Càng chi tiết càng tốt, KHÔNG giới hạn độ dài
- Dùng hết dữ liệu từ characters (description, screen_position, posture, acting)
- Dùng hết dữ liệu từ photographyRules (lighting, color_tone, depth_of_field)
- Nếu field nào thiếu → tự suy luận hợp lý, KHÔNG BỎ TRỐNG

---

【Cross-panel Continuity — BẮT BUỘC】

{panels_batch_json} chứa dãy panel LIÊN TIẾP. Visual consistency GIỮA CÁC PANEL là bắt buộc.

Panel LIỀN KỀ + CÙNG location:
  ✓ Giữ NGUYÊN: lighting direction & quality, color_tone, depth_of_field
  ✓ Camera angle: tiến tự nhiên (wide → medium → close-up hoặc ngược lại)
  ✓ Nhân vật bên trái frame trước → bên trái frame sau
  ✓ Ngoại hình/tóc/trang phục: GIỐNG HỆT panel trước
  ✓ Mood: chuyển tiếp mượt
  ✓ Hành động: logic tiếp nối từ previous.acting

Panel KHÁC location (scene change):
  - Reset lighting / color / camera
  - Nhưng ngoại hình nhân vật GIỮ NGUYÊN

Panel ĐẦU TIÊN (previous = null):
  - Khởi tạo mới

---

【video_prompt】

Mỗi panel có existingVideoPrompt (từ Phase 3 hoặc rỗng).
ENRICH (làm giàu), KHÔNG viết lại từ đầu.

Nếu existingVideoPrompt KHÔNG rỗng:
1. GIỮ nội dung chính
2. Bổ sung: camera movement, hành động nhân vật cụ thể hơn
3. Dùng tuổi + giới tính thay tên
4. Luôn có yếu tố "động"
5. KHÔNG mô tả lại scene đã có trong image_prompt

Nếu existingVideoPrompt RỖNG → tự generate:
- duration ≤2s: micro (chớp mắt, thở nhẹ, môi mấp máy)
- 3-5s: subtle (quay đầu chậm, camera push nhẹ)
- ≥6s: moderate (bước đi, camera dolly)
- null: subtle
- Camera movement phù hợp shot_type + camera_move

---

【Output】

Mảng JSON. Phần tử i tương ứng panel i trong input:
{ "image_prompt": "<đoạn văn tiếng Việt>", "video_prompt": "<mô tả chuyển động>" }

Chỉ trả về JSON array, không markdown, không comment.
```

**File**: `lib/prompts/novel-promotion/prompt_refiner.en.txt` — same structure in English.

### Phase 2: Fix continuity data pass in `prompt-refiner.ts`

#### 2a. Batch path `current` — thêm `existingVideoPrompt`

```typescript
current: {
  // ... existing fields
  existingVideoPrompt: panel.videoPrompt || '',
},
```

#### 2b. Batch path `previous` — thêm shotType, cameraMove, photographyRules

```typescript
const prevPhotoRules = parseJsonUnknown(prevPanel.photographyRules)
previous: prevPanel ? {
  panelIndex: prevPanel.panelIndex,
  location: prevPanel.location || '',
  shotType: prevPanel.shotType || '',            // NEW
  cameraMove: prevPanel.cameraMove || '',         // NEW
  characters: (() => {
    const refs = parsePanelCharacterReferences(prevPanel.characters)
    const rules = parseJsonUnknown(prevPanel.photographyRules)
    return buildCharDetails(refs, rules, parseJsonUnknown(prevPanel.actingNotes))
  })(),
  duration: prevPanel.duration,
  photographyRules: prevPhotoRules ? {            // NEW block
    lighting: (prevPhotoRules as Record<string, unknown>).lighting || null,
    color_tone: (prevPhotoRules as Record<string, unknown>).color_tone || null,
    depth_of_field: (prevPhotoRules as Record<string, unknown>).depth_of_field || null,
  } : null,
  imagePrompt: prevPanel.imagePrompt || '',
  videoPrompt: prevPanel.videoPrompt || '',
} : null,
```

#### 2c. `refineSinglePanel` current — thêm `existingVideoPrompt`

Same as 2a.

#### 2d. `refineSinglePanel` previous — thêm shotType, cameraMove, photographyRules

Same as 2b.

### Phase 3: Add mood/atmosphere hint from character resources

`characterResources` contains `description` (full character appearance text from asset library).
This already goes into the LLM input.

For mood: không có field `mood` hay `atmosphere` trong DB hiện tại.
→ Prompt yêu cầu LLM tự suy luận mood từ `description` + `acting` + `srtSegment`.
→ Sau fix merge (0a), `scene_summary` có thể dùng.

### Phase 4: Update output parsing (đã có sẵn safety net)

```typescript
const imagePrompt = typeof parsed.image_prompt === 'string'
  ? parsed.image_prompt.trim()
  : JSON.stringify(parsed.image_prompt)
```

### Phase 5: Cleanup dead code

In `prompt-refiner.ts`, sau fix 0b:
- `actingNotes?.characters` → thay bằng kiểm tra `Array.isArray`
- Xoá `parseJsonUnknown` cast không cần thiết

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:190` | Fix mergePanelsWithRules: thêm `color_tone`, `depth_of_field`, `characters`, `scene_summary` |
| `src/lib/workers/handlers/script-to-storyboard-atomic-retry.ts:299` | Same fix as above |
| `src/lib/novel-promotion/prompt-refiner.ts:91-109` | Fix buildCharDetails: handle actingNotes as array |
| `src/lib/novel-promotion/prompt-refiner.ts` | Pass shotType/cameraMove/photoRules in `previous`, +existingVideoPrompt in `current` (4 locations) |
| `lib/prompts/novel-promotion/prompt_refiner.zh.txt` | Rewrite: NL image, continuity, video enrich |
| `lib/prompts/novel-promotion/prompt_refiner.en.txt` | Same in English |

## Edge Cases (sau fix)

| Case | Xử lý |
|---|---|
| actingNotes là array (format cũ) | Fix 0b handle cả 2 format |
| actingNotes là object {characters: [...]} (format mới) | Fix 0b handle |
| photographyRules.characters chưa có (DB cũ chưa update) | photoChars empty → screen_position/posture rỗng → LLM tự suy luận |
| photographyRules có `color_tone` (sau fix merge) | ✅ sẽ có |
| photographyRules ko có `color_tone` (DB cũ) | LLM tự suy luận |
| existingVideoPrompt rỗng | Generate mới |
| Panel không có previous | Fresh start |
| Scene change | Reset lighting/color/camera |

## Rollback

- Fix merge: revert code, chạy lại pipeline để update DB
- Fix buildCharDetails: revert code
- Prompt template: revert file
- `imagePrompt` NL text trong DB vẫn valid — image gen đọc được
