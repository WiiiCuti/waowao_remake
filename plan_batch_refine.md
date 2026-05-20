# Kế hoạch: Batch Refine

Mục tiêu: Giảm số lần gọi LLM từ N (mỗi panel 1 lần) xuống N/W (W = window size).

## Kiến trúc

```
Hiện tại: for each panel → buildPrompt → call LLM → parse → update DB
                    panel 0 ──→ LLM ──→ DB
                    panel 1 ──→ LLM ──→ DB
                    panel 2 ──→ LLM ──→ DB
                    ... N lần

Sau:      for each window → buildBatchPrompt → call LLM → parseArray → update DB
                    panel 0-9 ──→ LLM ──────→ DB (1 lần)
                    panel 10-19 ──→ LLM ──────→ DB (1 lần)
                    ... N/W lần
```

## Scope thay đổi

### 1. `src/lib/novel-promotion/prompt-refiner.ts` — logic chính

**Thay vòng lặp từng panel** (dòng 168-359) **thành vòng lặp window**:

```ts
const WINDOW_SIZE = 8

for (let w = 0; w < filteredPanels.length; w += WINDOW_SIZE) {
    const windowPanels = filteredPanels.slice(w, w + WINDOW_SIZE)
    
    // Build mảng panel data
    const panelsData = windowPanels.map((panel, i) => {
        const actualIndex = w + i
        const prevPanel = actualIndex > 0 ? filteredPanels[actualIndex - 1] : null
        return {
            panel_index: i,  // index trong window, dùng cho continuity
            actual_panel_index: panel.panelIndex,
            ...buildRefineInput(panel, prevPanel)
        }
    })
    
    // Build 1 prompt chứa mảng
    const batchPrompt = buildBatchPrompt(panelsData, styleText, locale)
    
    // Call LLM 1 lần
    const result = await executeAiTextStep({ ... })
    
    // Parse mảng kết quả
    const parsedArray = safeParseJsonArray(result.text)
    
    // Validate số lượng khớp
    if (parsedArray.length !== windowPanels.length) {
        throw new Error(...)
    }
    
    // Update DB 1 transaction
    await prisma.$transaction(
        parsedArray.map((item, i) => 
            prisma.novelPromotionPanel.update({
                where: { id: windowPanels[i].id },
                data: {
                    imagePrompt: item.image_prompt,
                    videoPrompt: item.video_prompt,
                }
            })
        )
    )
}
```

### 2. Prompt template — `lib/prompts/novel-promotion/prompt_refiner.zh.txt`

Sửa từ:

```
{current_panel_json}
{previous_panel_json}
{character_resources_json}
{location_resource_json}
{style}
【Output】{ "image_prompt": "...", "video_prompt": "..." }
```

Thành:

```
Đầu vào là mảng các panel. Output là mảng JSON tương ứng.

Panel thứ i trong input → phần tử thứ i trong output.
Số lượng output = số lượng input.

Input:
[
  {
    "index": 0,
    "panel": { ... panel hiện tại ... },
    "previous_panel": { ... panel trước hoặc null ... },
    "character_resources": [...],
    "location_resource": ... | null,
    "style": "..."
  },
  {
    "index": 1,
    ...
  }
]

Output:
[
  { "image_prompt": "...", "video_prompt": "..." },
  { "image_prompt": "...", "video_prompt": "..." }
]

⚠️ Output phải là JSON array. Số phần tử = số input panel.
```

### 3. Error handling

```ts
// Nếu batch fail
try {
    const result = await callLLM(batchPrompt)
    // parse + update
} catch (err) {
    // Fallback: refine từng panel riêng lẻ (code cũ)
    for (const panel of windowPanels) {
        await refineSinglePanel(panel)
    }
}
```

### 4. Debug — `prompt-refiner.ts`

Thay `promptFilled` từ string thành JSON dump của cả window.

### 5. Client — `PromptRefinerTab.tsx`

Progress mất realtime. Giải pháp:

```tsx
// Pre-set tất cả panels thành "refining" trước khi gọi
setPanelStatuses(allPanels.map(id => ({ [id]: 'refining' })))

// Sau khi nhận kết quả, set all thành "done"
setPanelStatuses(
    Object.fromEntries(results.map(r => [r.panelId, r.status === 'ok' ? 'done' : 'error']))
)
```

## Các câu hỏi cần quyết định

| Câu hỏi | Option |
|---------|--------|
| Window size? | 8 (dung hòa giữa độ dài prompt và số lần gọi) |
| Fallback khi batch fail? | Retry từng panel riêng (code cũ) |
| Continuity cross-window? | Lưu `previousEnrichedChars` giữa các window |
| Output format? | Mảng JSON, index 0 = panel đầu window |

## Timeline

| Bước | File | Thời gian |
|------|------|-----------|
| Sửa prompt template | `prompt_refiner.zh.txt` + `.en.txt` | 1 |
| Sửa logic chính | `prompt-refiner.ts` | 8 |
| Sửa progress client | `PromptRefinerTab.tsx` | 2 |
| Kiểm tra + fix bug | - | 2 |
| Tổng | | ~13 |
