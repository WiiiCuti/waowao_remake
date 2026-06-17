# Prompt Refinement Agent

## Objective

Build an LLM agent that refines `imagePrompt` + `videoPrompt` for all storyboard panels, replacing the current code-based `buildPanelPrompt` and `buildVideoPrompt` functions.

## Architecture

```
storyboard_detail agent (phase 3)
  → panels persisted to DB (shotType, cameraMove, description, characters,
    photographyRules, actingNotes, location, srtSegment, duration)
     ↓
Prompt Refinement Agent (1 LLM call/panel, sequential)
  Input per panel:
    - current_panel_json: full panel data của panel hiện tại
    - previous_panel_json: full panel data của panel trước + imagePrompt/videoPrompt đã refine
      → LLM tự detect: cùng location? → continuity (giữ vị trí, tư thế, hành động đồng nhất)
      → khác location? → scene change → fresh start
    - character_resources_json: mô tả ngoại hình nhân vật
    - location_resource_json: mô tả địa điểm
    - style: art style
  Output:
    - imagePrompt → save DB → image handler reads directly
    - videoPrompt → save DB → video handler reads directly
     ↓
Image gen (reads panel.imagePrompt)
Video gen (reads panel.videoPrompt)
```

## Implementation Steps

### Step 1: Register new prompt ID

**File: `src/lib/prompt-i18n/prompt-ids.ts`**

Add:
```typescript
NP_PROMPT_REFINER: 'np_prompt_refiner',
```

**File: `src/lib/prompt-i18n/catalog.ts`**

Add entry:
```typescript
[PROMPT_IDS.NP_PROMPT_REFINER]: {
  pathStem: 'novel-promotion/prompt_refiner',
  variableKeys: [
    'current_panel_json',
    'previous_panel_json',   // full panel data + prompts đã refine (để detect continuity)
    'character_resources_json',
    'location_resource_json',
    'style',
  ],
},
```

### Step 2: Create prompt template

**File: `lib/prompts/novel-promotion/prompt_refiner.zh.txt`**

Template nhận 5 variables (JSON strings):
- `{current_panel_json}`: panel hiện tại (JSON)
- `{previous_prompt_json}`: prompt panel trước (JSON hoặc null)
- `{character_resources_json}`: character descriptions array (JSON)
- `{location_resource_json}`: location data (JSON hoặc null)
- `{style}`: art style string

Template instruction:
- imagePrompt: structured descriptive prompt, Tiếng Trung (character desc) + Tiếng Việt (scene desc)
- videoPrompt: focus motion + acting, KHÔNG mô tả lại scene có trong ảnh
- ⚠️ Motion intensity phải khớp với `panel.duration`:
  - `duration ≤ 2s` hoặc có `srtSegment` (narrator đọc): chỉ micro-motion (chớp mắt, thở nhẹ, tay run, môi mấp máy) — KHÔNG quay đầu, bước đi
  - `duration 3-5s`: subtle motion (quay đầu chậm, đặt đồ, camera push nhẹ)
  - `duration ≥ 6s`: moderate motion (bước đi, thay đổi tư thế, camera dolly)
- Đảm bảo nhất quán với panel trước (vị trí nhân vật, trang phục, cảnh)
- Output JSON: `{ "image_prompt": "...", "video_prompt": "..." }`

### Step 3: Create refinement handler

**File: `src/lib/workers/handlers/prompt-refiner.ts`**

- Hàm `refinePanelPrompts(params)`:
  ```typescript
  async function refinePanelPrompts(params: {
    panels: NovelPromotionPanel[]  // sorted by panelIndex
    projectData: NovelProjectData
    artStyle: string
    modelKey: string
    userId: string
    projectId: string
  }): Promise<{ panelId: string; imagePrompt: string | null; videoPrompt: string | null }[]>
  ```

Logic:
1. Lấy `projectData` từ `resolveNovelData(projectId)` hoặc nhận từ caller
2. Map panels sequential:
   - Build `current_panel_json` từ dòng DB hiện tại (full JSON: shotType, cameraMove, description, characters[], location, photographyRules, actingNotes, srtSegment, duration)
   - Build `previous_panel_json` từ dòng DB trước đó (full panel data + imagePrompt/videoPrompt đã lưu — nếu có refinement trước đó)
     → LLM tự detect continuity: so sánh location, character positions, actingNotes để quyết định
   - Gọi `buildPrompt` để render template
   - Gọi `executeAiTextStep` (từ `@/lib/ai-runtime`) với modelKey
   - Parse JSON output: `{ image_prompt, video_prompt }`
   - Nếu parse fail → `imagePrompt = null`
   - Lưu `previousPanelData` cho panel tiếp theo (luôn lưu, kể cả refinement fail — để continuity vẫn hoạt động)
3. Return mảng kết quả

**⚠️ Fallback quan trọng**: Handler KHÔNG ghi vào DB. Nó chỉ return kết quả. Workflow caller quyết định có update DB hay không. Nếu refinement fail → DB vẫn giữ `null` → image/video handler fallback về code build như cũ.

### Step 4: Wire into script-to-storyboard workflow

**File: `src/lib/workers/handlers/script-to-storyboard.ts`**

After `persistStoryboardOutputs`, before submit image tasks:
- Lấy tất cả panels từ `prisma.novelPromotionPanel.findMany` bằng storyboard IDs
- Gọi `refinePanelPrompts`
- **Chỉ update DB nếu refine succeeds** (result có imagePrompt/videoPrompt non-null):
  ```typescript
  for (const r of results) {
    if (r.imagePrompt || r.videoPrompt) {
      await prisma.novelPromotionPanel.update({
        where: { id: r.panelId },
        data: {
          ...(r.imagePrompt ? { imagePrompt: r.imagePrompt } : {}),
          ...(r.videoPrompt ? { videoPrompt: r.videoPrompt } : {}),
        },
      })
    }
  }
  ```
- Nếu refinement fail → DB không đổi (imagePrompt/videoPrompt vẫn null) → image/video handler fallback về code build

Điểm chèn cụ thể: sau dòng `persistStoryboardOutputs()` và trước vòng lặp submit image tasks (tìm trong hàm `handleScriptToStoryboardTask`).

### Step 5: Update image handler to read DB prompt

**File: `src/lib/workers/handlers/panel-image-task-handler.ts`**

Trong `handlePanelImageTask`:
- Kiểm tra: nếu `panel.imagePrompt` không null/empty → dùng thẳng `panel.imagePrompt` làm prompt
- Nếu không → fallback về `buildPanelPrompt` (code cũ)
- Bỏ ghi debug file nếu dùng DB prompt (hoặc vẫn ghi để debug)

### Step 6: Update video handler to read DB prompt first

**File: `src/lib/workers/video.worker.ts`**

Dòng 141 hiện tại:
```typescript
const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || buildVideoPrompt(panel) || panel.videoPrompt || panel.description
```

Chuyển `panel.videoPrompt` lên trước `buildVideoPrompt`:
```typescript
const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || buildVideoPrompt(panel) || panel.description
```

(Khi refinement agent chạy, `panel.videoPrompt` đã được ghi → buildVideoPrompt không cần chạy)

### ⛔ Step 7: Cleanup (chỉ sau khi stable — KHÔNG làm ngay)

Duy trì code build + DB đọc song song ít nhất 1-2 tuần. Khi chắc chắn refinement agent chạy ổn định:
- Switch image handler: `panel.imagePrompt || buildPanelPrompt(...)` → `panel.imagePrompt || panel.description`
- Switch video handler: `panel.videoPrompt || buildVideoPrompt(panel)` → `panel.videoPrompt || panel.description`
- Xoá `buildPanelPrompt` + `buildVideoPrompt` function
- Xoá file debug `temp/prompt-debug/`
- Xoá template `single_panel_image.{zh,en}.txt`
- Update `guide_fix_prompt_image.md`

## Edge Cases

| Case | Xử lý |
|---|---|
| LLM call fail (network/rate limit) | `imagePrompt = null` → DB không update → image handler fallback về code build |
| LLM trả JSON sai format | Parse fail → `imagePrompt = null` → fallback về code build |
| LLM trả thiếu field (chỉ image_prompt, ko có video_prompt) | Chỉ update field nào có, field kia giữ null |
| Panel không có actingNotes/characters | imagePrompt bình thường, videoPrompt = null → video handler fallback về `panel.description` |
| Panel không có photographyRules | imagePrompt chỉ có description + shot + style |
| characterResources trống | imagePrompt dùng `panel.characters[].appearance` làm fallback |
| Panel đầu tiên | `previousPrompt = null`, instruction bỏ qua continuity check |
| `panel.duration` null | Mặc định subtle motion (3-5s) |
| modelKey rỗng | Skip refinement hoàn toàn, không gọi LLM, không throw error |
| Tất cả panel đều fail | Refinement không ảnh hưởng gì, pipeline chạy y như cũ |

## Rollback (zero-risk)

- `panel.imagePrompt` / `panel.videoPrompt` là field riêng, ban đầu luôn `null`
- Refinement success → ghi vào DB → handler ưu tiên đọc DB prompt
- Refinement fail/skip → DB vẫn `null` → handler dùng code build như hiện tại
- **Không xoá code build cho đến khi cleanup step được approve riêng**
- Có thể tắt refinement = comment 1 dòng trong workflow

## Priorities (thứ tự làm)

1. **Step 1 + 2**: Register prompt ID + tạo template → xong trước
2. **Step 3**: Handler code → logic core
3. **Step 4**: Wire vào workflow → refinement tự động chạy
4. **Step 5 + 6**: Update image/video handler đọc từ DB → bắt đầu dùng prompt refine
5. **Step 7**: Cleanup (sau 1-2 tuần stable)

## Tự động hoá thời lượng panel (optional enhancement)

- `panel.duration` đã được `agent_storyboard_detail` ghi khi persist (xem `script-to-storyboard-helpers.ts:201`)
- Nếu duration = null và có srtSegment: ước lượng `srtSegment.length * 0.12s ≈ giây` (tốc độ đọc VNmese ~ 8-10 ký tự/giây → 0.1-0.125s/ký tự)
- Gán duration ước lượng này trong refinement handler trước khi gọi LLM
