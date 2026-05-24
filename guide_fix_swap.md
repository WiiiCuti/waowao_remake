# Guide: Fix các lỗi pipeline Storyboard

## Tổng quan 16 lỗi được tìm thấy

Phân tích codebase ngày 2026-05-23, dựa trên đối chiếu dữ liệu thực tế giữa novel text, clip, screenplay, storyboard panels.

---

## Nhóm A — Clip Order & Persistence

### A1. Sequential matcher không validate thứ tự chronological

**File:** `src/lib/novel-promotion/story-to-script/orchestrator.ts:458-476`

```typescript
searchFrom = match.endIndex  // Chỉ tin tưởng AI, không kiểm tra
```

Matcher xử lý clip theo thứ tự array AI trả về. Nếu AI trả sai thứ tự (clip 2 trước clip 3 trong khi trong novel clip 3 ở trước), matcher vẫn chạy và fail. Retry cũng không có feedback gì cho AI về lỗi.

**Dấu hiệu:** Segment 2 và 3 bị đảo ngược so với cốt truyện gốc.

**Fix:** Thêm validation chronological order sau khi match xong — kiểm tra `startIndex` của clip N phải > `startIndex` của clip N-1.

---

### A2. persistClips match clip bằng INDEX, không bằng ID

**File:** `src/lib/workers/handlers/story-to-script-helpers.ts:224-226`

```typescript
const target = existing[index]  // ← match bằng vị trí array, ko phải clip uuid
```

Khi `handleStoryToScriptTask` chạy lại (retry), clipList mới có thể khác thứ tự so với existing clips trong DB. Hàm này update `existing[index]` bằng data mới, không quan tâm clipId. Hậu quả: clip DB #2 giữ UUID cũ nhưng content mới → swap dữ liệu.

**Dấu hiệu:** Clip 2 và 3 có content đúng với startText của chúng, nhưng thứ tự createdAt sai so với novel.

**Fix:** Match bằng clip key (clip_1, clip_2...) hoặc dùng upsert với unique constraint, không match bằng index.

---

### A3. clips-build.ts cùng lỗi index-based persistence

**File:** `src/lib/workers/handlers/clips-build.ts:225-227`

Copy-paste từ A2, cùng pattern:

```typescript
const existing = existingClips[i]
if (existing) { update } else { create }
```

**Fix:** Như A2.

---

### A4. Retry gửi prompt y hệt, không feedback

**File:** `src/lib/novel-promotion/story-to-script/orchestrator.ts:420-508`

```typescript
for (let attempt = 1; attempt <= MAX_SPLIT_BOUNDARY_ATTEMPTS; attempt += 1) {
    // Gọi AI với prompt Y HỆT mỗi lần
    const { output, parsed: rawClipList } = await runStepWithRetry(runStep, splitMeta, splitPrompt, ...)
```

Retry lần 2 cũng gửi `splitPrompt` giống hệt lần 1, không hề nói cho AI biết clip nào fail vì lý do gì → AI thường trả kết quả tương tự → wasted LLM call.

**Fix:** Truyền error message vào prompt ở lần retry, yêu cầu AI sửa clip bị fail.

---

## Nhóm B — Screenplay Leak vào source_text

### B5. Khi có screenplay, {clip_content} = full screenplay JSON

**File:** `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:359-364`

```typescript
const screenplay = parseScreenplay(clip.screenplay)
if (screenplay) {
  phase1Prompt = phase1Prompt.replace('{clip_content}',
    `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}`)
}
```

Screenplay có `scenes[].description` do AI tạo ra (thường bằng tiếng Anh). Storyboard AI thấy description này trong input và copy nó vào `source_text` cho establishing shot → source_text tiếng Anh dù novel gốc tiếng Việt.

**Dấu hiệu:** Panel đầu tiên của segment 3 (panel 30) có source_text = `"Snow Island Amusement Park central plaza..."` — không có trong novel.

**Fix:** Thêm `{original_text}` placeholder (bằng clipContent / novel text gốc) vào prompt. Sửa instruction: `source_text` phải copy từ `{original_text}`, không được copy từ `description` của `{clip_content}`.

---

### B6. clipJson.content = raw text, clip_content = screenplay → contradictory

**File:** `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:338-364`

```typescript
// clipJson: content luôn là raw novel text
const clipJson = JSON.stringify({ id: clip.id, content: clipContent, ... })

// clip_content: khi có screenplay thì là screenplay JSON
phase1Prompt = phase1Prompt.replace('{clip_content}', `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}`)
```

AI thấy 2 nguồn text khác nhau: `clip_json` claim "Clip information" với raw text, `clip_content` claim "Content input" với screenplay. Prompt bảo "copy original text từ input content" — không rõ cái nào mới là "original".

**Fix:** Thêm `{original_text}` placeholder với novel text gốc. Prompt instruction nói rõ `source_text` copy từ `{original_text}` → giải quyết mâu thuẫn.

---

### B7. Voice analysis: input vs storyboard_json mismatch

**File:** `src/lib/workers/handlers/script-to-storyboard.ts:468-478`

```typescript
variables: {
  input: episode.novelText,  // raw novel text
  storyboard_json: buildStoryboardJsonFromClipPanels(orchestratorResult.clipPanels),
  // ↑ text_segment = panel.source_text (có thể từ screenplay)
}
```

Voice analysis AI nhận `{input}` là novel gốc, nhưng `{storyboard_json}` chứa text_segment từ screenplay. Khi match dialogue với panel, "exact match" fail → fallback về semantic match → dễ sai → voice line gán sai panel.

**Status: ✅ Resolved bởi B5+B6.** `source_text` giờ lấy từ `{original_text}` (novel gốc) → `text_segment` = novel text → exact match với `{input}` pass.

---

### B8. Phase 2/3 không có access vào clip content gốc

**File:** `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:429-445`

```typescript
const phase2Prompt = template
  .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
  // → Chỉ thấy Phase 1 panels, không thấy clip content gốc
```

Cinematography, Acting, Detail phases chỉ nhìn thấy Phase 1 output. Nếu Phase 1 sai source_text, Phase 2/3 không thể phát hiện hay sửa.

**Fix:** Thêm `{clip_content}` hoặc `{original_text}` vào Phase 2/3 prompts để AI có context kiểm tra.

---

## Nhóm C — Character/Species Loss

### C9. Database không có species field

**File:** `prisma/schema.prisma:79-101`

```prisma
model NovelPromotionCharacter {
  name         String
  introduction String?    // identity, relationship — not species
  profileData  String?    // JSON { gender, age_range } — KHÔNG có species
}
```

Species (penguin, hedgehog, v.v.) không được lưu là field riêng biệt. Chỉ tồn tại dưới dạng prose trong `appearance.description` hoặc `character.introduction`. Dễ mất ở bất kỳ bước nào AI quyết định "tóm lược".

**Fix:** Thêm `species` field vào model (nullable string). Khi tạo character, AI phải extract species riêng.

---

### C10. Storyboard detail prompt bảo thay name bằng age+gender, không preserve species

**File:** `lib/prompts/novel-promotion/agent_storyboard_detail.en.txt:76-83,117-121`

```
Video models do not recognize names; must use age group + gender instead:
- Young Man / Young Woman: approximately 17-30 years old
- Youth Boy / Youth Girl: approximately 10-16 years old
```

Prompt chỉ định nghĩa human-centric age+gender categories. Không có instruction nào bảo AI keep species info khi sinh `video_prompt`. AI tự quyết định, thường bỏ.

**Dấu hiệu:** Kopo (chim cánh cụt) → "young man", Sonic (nhím) → "youth boy".

**Fix:** Thêm instruction: "If character is non-human (animal, mythical creature, etc.), ALWAYS include species name in video_prompt (e.g. 'penguin young man', 'hedgehog youth boy')."

---

### C11. Phase 1 plan prompt không có instruction preserve species

**File:** `lib/prompts/novel-promotion/agent_storyboard_plan.en.txt`

Prompt sinh `characters` array và `description`. Không có rule nào bảo AI giữ species info trong description hay characters.

**Fix:** Thêm: "If a character is non-human (animal, mythical creature), their species must be explicitly stated in the description and in the characters array as a visual feature."

---

### C12. Prompt refiner cũng strip species

**File:** `lib/prompts/novel-promotion/prompt_refiner.en.txt:79-89`

```
Use age + gender instead of character names (e.g. "young woman", "middle-aged man")
```

Không có hướng dẫn preserve species. Lần thứ 2 species bị mất.

**Fix:** Như C10 — thêm instruction preserve species.

---

## Nhóm D — Locale/Language

### D13. getFilteredLocationsDescription default 'zh'

**File:** `src/lib/storyboard-phases.ts:179`

```typescript
export function getFilteredLocationsDescription(locations, clipLocation, locale: Locale = 'zh') {
```

Trong legacy code path, locale mặc định `'zh'` dù locale của user là `'en'`.

**Fix:** Remove default, bắt buộc pass locale từ caller.

---

### D14. buildPanelPrompt nhận locale param nhưng không dùng

**File:** `src/lib/workers/handlers/panel-image-task-handler.ts:140-191`

```typescript
function buildPanelPrompt(panel, ..., locale) {
  // locale parameter không được dùng trong function body
  // Prompt image luôn tiếng Anh
}
```

**Fix:** Sử dụng locale để chọn ngôn ngữ prompt hoặc ít nhất document rằng locale bị ignore.

---

## Nhóm E — Merge/Validation

### E15. mergePanelsWithRules panic khi thiếu rule

**File:** `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:178-185`

```typescript
if (!rules) {
  throw new Error(`Missing photography rule for panel_number=${...}`)
}
if (!acting) {
  throw new Error(`Missing acting direction for panel_number=${...}`)
}
```

Nếu Phase 2 cinematography/acting không cover hết panel numbers → crash cả clip. Không có graceful fallback.

**Fix:** Thêm fallback: nếu không có rule thì merge với giá trị mặc định thay vì throw.

---

### E16. L3 match query min 8 chars vs prompt min 5 chars

**File:** `src/lib/novel-promotion/story-to-script/clip-matching.ts:320`

```typescript
function findApproximateMatch(normalized, query, fromIndex) {
  if (query.length < 8) return null  // ← hardcoded 8
}
```

Prompt AI yêu cầu "at least five characters", nhưng L3 silently bỏ qua query 5-7 ký tự → match fail.

**Fix:** Giảm threshold xuống 5 để match prompt, hoặc tăng prompt requirement lên 8.

---

## Tác động chain

```
AI clip sai thứ tự (A1)
  → persistClips index-based (A2) swap clip 2 & 3
    → Segment 2, 3 đảo ngược trên UI

Screenplay description leak (B5)
  → Panel 0 source_text tiếng Anh
  → Voice analysis mismatch (B7)

Species loss (C10)
  → video_prompt "young man" thay vì "penguin"
```

---

## Ưu tiên fix

| Nhóm | Mức độ | Lý do |
|------|--------|-------|
| **A1+A2** | Critical | Clip order sai → story phi logic |
| **B5** | Critical | Source_text sai language, copy từ screenplay |
| **C10** | High | Mất thông tin nhân vật trong video_prompt |
| **B7** | High | Voice line gán sai panel |
| **A4** | Medium | Wasted LLM calls |
| **E15** | Medium | Crash khi thiếu rule |
| **C9** | Low | Cần schema migration |
| **D13/D14** | Low | Minor locale inconsistency |
