# Props — Vấn đề và cách sửa

## Hiện trạng

Props được phát hiện từ analyze, tồn tại trong asset library, nhưng **không được dùng khi gen ảnh panel**.

## Luồng hiện tại

```
Analyze truyện → phát hiện props → lưu DB ✅
    ↓
Storyboard plan → {props_description} → LLM biết có props ✅
    ↓
Panel image gen → buildPanelPromptContext → chỉ có character + location ❌
    ↓
Image prompt → không có props → ảnh ra thiếu props ❌
```

## Cần sửa

**1. Query props trong `resolveNovelData`**

File: `src/lib/workers/handlers/image-task-handler-shared.ts:159`

```ts
// Hiện tại:
include: {
  characters: { include: { appearances: ... } },
  locations: { include: { images: ... } },
}
// Thiếu props
```

Thêm props vào query:

```ts
include: {
  characters: { include: { appearances: ... } },
  locations: { include: { images: ... } },
  props: true,  // THÊM DÒNG NÀY
}
```

Prisma model `NovelPromotionProject` cần có relation `props`.
Nếu chưa có, model prop chắc là `NovelPromotionProp` hoặc nằm trong `LocationAsset`.

**2. Xử lý props trong `buildPanelPromptContext`**

File: `src/lib/workers/handlers/panel-image-task-handler.ts:64`

Thêm logic:

```ts
// Sau khi build characterContexts + locationContext
const propsContext = (() => {
  // Parse props từ location/panel nếu có
  // Hoặc query từ projectData.props
  return []
})()

// Thêm vào return:
return {
  panel: { ... },
  context: {
    character_appearances: characterContexts,
    location_reference: locationContext,
    props: propsContext,  // THÊM
  },
}
```

**3. Build props description vào image prompt**

File: `src/lib/workers/handlers/panel-image-task-handler.ts:140` (`buildPanelPrompt`)

Thêm `{props_description}` vào template prompt tương tự như `{styleText}`.

## Phân loại

```
Mức độ ưu tiên: Thấp
Ảnh hưởng:       Thiếu props trong ảnh panel
Khắc phục tạm:   Model phase 3 tự viết props vào description nếu nhớ
Fix chính thức:  3 điểm chỉnh sửa như trên
```
