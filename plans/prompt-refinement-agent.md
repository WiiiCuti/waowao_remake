# Prompt Refinement Agent

## Objective

Build an LLM agent that refines `imagePrompt` + `videoPrompt` for all storyboard panels, replacing the current code-based `buildPanelPrompt` and `buildVideoPrompt` functions. This ensures prompt quality is handled by an LLM with full context (previous panels, character appearances, continuity) instead of string joining logic.

## Architecture

```
storyboard_detail agent
  → panels[] (description, characters, shotType, cameraMove,
              photographyRules, actingNotes, location, srtSegment)
     ↓
Prompt Refinement Agent (LLM, 1 call/panel, sequential)
  Input per panel:
    - panel hiện tại: description, shotType, cameraMove,
      characters + appearance, location, photographyRules,
      actingNotes, srtSegment
    - panel trước: imagePrompt, videoPrompt (đã refine)
    - character resources: descriptions[] từ characterAppearance
    - location description + available_slots
    - art style
  Output:
    - imagePrompt: descriptive prompt cho FLUX (có character full desc + vị trí + acting)
    - videoPrompt: motion prompt cho LTX-2.3 (acting + camera, không lặp ảnh)
     ↓
DB save → panel.imagePrompt, panel.videoPrompt
     ↓
image handler: đọc panel.imagePrompt → gửi FLUX (bỏ buildPanelPrompt)
video handler: đọc panel.videoPrompt → gửi LTX-2.3 (bỏ buildVideoPrompt)
```

## Data Flow

### Input cho mỗi panel (build context object giống buildPanelPromptContext nhưng gọn hơn)

```typescript
interface RefineInput {
  // Panel hiện tại
  panel: {
    panelIndex: number
    shotType: string
    cameraMove: string
    description: string
    location: string | null
    characters: Array<{
      name: string
      appearance: string  // changeReason
      slot?: string
    }>
    photographyRules: {
      lighting: { direction: string; quality: string }
      characters: Array<{ name: string; screen_position: string; posture: string; facing: string }>
      depth_of_field: string
      color_tone: string
    } | null
    actingNotes: Array<{ name: string; acting: string }> | null
    srtSegment: string | null
  }
  // Panel trước (đã refine) — null nếu là panel đầu
  previousPanel: {
    imagePrompt: string
    videoPrompt: string
  } | null
  // Tài nguyên
  characterResources: Array<{
    name: string
    appearance: string  // changeReason
    description: string  // từ pickAppearanceDescription
  }>
  locationResource: {
    name: string
    description: string | null
    availableSlots: string[]
  } | null
  artStyle: string
}
```

### Output format

```typescript
interface RefineOutput {
  imagePrompt: string
  videoPrompt: string
}
```

## Implementation Steps

### Step 1: Agent prompt template

File mới: `lib/prompts/novel-promotion/prompt_refiner.zh.txt`

Template nhận:
- `current_panel_json`: panel hiện tại (JSON)
- `previous_prompt_json`: prompt panel trước (JSON, hoặc null)
- `character_resources_json`: mô tả ngoại hình nhân vật (JSON)
- `location_resource_json`: mô tả địa điểm (JSON, hoặc null)
- `style`: art style text

Instruction:
- imagePrompt: là structured descriptive prompt, Tiếng Trung (character desc) + Tiếng Việt (scene desc)
- videoPrompt: focus motion + acting, KHÔNG mô tả lại scene có trong ảnh
- Đảm bảo nhất quán với panel trước (vị trí nhân vật, trang phục, cảnh)
- output JSON: `{ "image_prompt": "...", "video_prompt": "..." }`

### Step 2: Refinement handler

File mới hoặc thêm vào existing handler:
`src/lib/workers/handlers/prompt-refiner.ts`

- Hàm `refinePanelPrompts(panels, projectData, artStyle, onProgress)`:
  - Map panels sequentially
  - Với mỗi panel: build context object → call LLM → parse result
  - Giữ `previousPrompt` cho panel tiếp theo
- Cần retry + fallback (nếu LLM fail → giữ nguyên prompt cũ từ agent)

### Step 3: Chèn vào workflow

Trong `script-to-storyboard-helpers.ts` hoặc `orchestrator.ts`:

- Sau khi persist panels vào DB
- Gọi `refinePanelPrompts` cho tất cả panels
- Update từng panel: `prisma.novelPromotionPanel.update({ where: { id }, data: { imagePrompt, videoPrompt } })`

Alternatively: thêm step mới trong workflow engine `refine_prompts` chạy sau `screenplay`.

### Step 4: Xoá code cũ

Sau khi refinement agent chạy ổn định:
- Xoá `buildPanelPrompt` trong `panel-image-task-handler.ts`
- Xoá `buildVideoPrompt` trong `video.worker.ts`
- Image handler đọc `panel.imagePrompt || panel.description`
- Video handler đọc `panel.videoPrompt || panel.description`
- Xoá file debug `temp/prompt-debug/`
- Xoá template `single_panel_image.{zh,en}.txt` (nếu chưa xoá)

### Step 5: Cleanup guide

Update `guide_fix_prompt_image.md`: thông báo đã thay thế bằng refinement agent.

## Edge Cases

| Case | Xử lý |
|---|---|
| LLM call fail | Giữ nguyên prompt từ agent cũ (no-op) |
| Panel không có actingNotes | videoPrompt chỉ có camera move |
| Panel không có photographyRules | imagePrompt không có lighting/depth/color |
| artStyle rỗng | fallback "Japanese anime style" |
| characterResources rỗng | imagePrompt dùng description từ panel |
| Panel đầu tiên | previousPrompt = null |

## Rollback

- `panel.imagePrompt` và `panel.videoPrompt` là field riêng, không ảnh hưởng dữ liệu cũ
- Nếu refinement fail, handler fallback về `description` (cách cũ)
- Có thể tắt refinement bằng feature flag
