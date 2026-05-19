# Fix prompt image — analysis & plan

## Vấn đề

Template `single_panel_image.{zh,en}.txt` format hiện tại là **instruction prompt cho LLM** (69 dòng: "mày là họa sĩ phân cảnh", "không được vẽ chữ", rules, JSON lồng nhau), gửi lên image model (Flux/Seedream/Gemini) → model bị loãng, không biết đâu là nội dung cần vẽ.

## Data có sẵn — xác nhận từ code

| Field | Type | Null? | File:Line | Agent tạo |
|---|---|---|---|---|
| `panel.description` | `string \| null` | ✅ | `project.ts:172` | storyboard_detail |
| `panel.characters[].name` | `string` | ❌ | `image-task-handler-shared.ts:55` | storyboard_plan |
| `panel.characters[].slot` | `string` (optional) | ✅ vắng | `image-task-handler-shared.ts:57` | storyboard_plan |
| `panel.characters[].appearance` | `string` (optional) | ✅ vắng | `image-task-handler-shared.ts:56` | storyboard_plan |
| `characterAppearance.descriptions[]` | `string[] \| null` | ✅ | `project.ts:39` | character_visual (3 variants) |
| `characterAppearance.changeReason` | `string` | ❌ **có** | `project.ts:37` | character_visual |
| `panel.photographyRules` | `string` (JSON) \| null | ✅ | `project.ts:193` | cinematographer |
| `→ lighting.direction` | `string` | trong JSON | `AIDataModal.types.ts:19-20` | cinematographer |
| `→ lighting.quality` | `string` | trong JSON | `AIDataModal.types.ts:19-20` | cinematographer |
| `→ characters[].screen_position` | `string` | trong JSON | `AIDataModal.types.ts:11` | cinematographer |
| `→ characters[].posture` | `string` | trong JSON | `AIDataModal.types.ts:12` | cinematographer |
| `→ characters[].facing` | `string` | trong JSON | `AIDataModal.types.ts:13` | cinematographer |
| `→ depth_of_field` | `string` | trong JSON | `AIDataModal.types.ts:23` | cinematographer |
| `→ color_tone` | `string` | trong JSON | `AIDataModal.types.ts:24` | cinematographer |
| `panel.actingNotes` | `string` (JSON) \| null | ✅ | `project.ts:194` | acting_direction |
| `→ characters[].name` | `string` | trong JSON | `AIDataModal.types.ts:30` | acting_direction |
| `→ characters[].acting` | `string` | trong JSON | `AIDataModal.types.ts:31` | acting_direction |
| `panel.shotType` | `string \| null` | ✅ | `project.ts:167` | storyboard_detail |
| `panel.cameraMove` | `string \| null` | ✅ | `project.ts:168` | storyboard_detail |
| `panel.location` | `string \| null` | ✅ | `project.ts:169` | storyboard_detail |
| `locationImage.description` | `string \| null` | ✅ | `project.ts:83` | location_create |
| `panel.srtSegment` | `string \| null` | ✅ | `project.ts:173` | storyboard_plan (source_text) |
| `panel.imagePrompt` | `string \| null` | ✅ **luôn null** | `project.ts:177` | **không có agent nào ghi** |
| `artStyle` | user config | ❌ có default | `constants.ts:140-166` | user chọn |
| `referenceImages` | `string[]` (runtime) | ✅ có thể rỗng | `image-task-handler-shared.ts:225` | collected từ assets |

**Lưu ý nullable:**
- `photographyRules` và `actingNotes` có thể `null` khi generation chưa xong hoặc panel mới insert
- `slot` chỉ có khi character "đứng yên trong scene" — character di chuyển có thể không có
- `descriptions[]` có thể `null` nếu chưa gen character visual
- `imagePrompt` **luôn null** vì không agent nào ghi — chỉ user edit mới có

## Vấn đề cụ thể

1. **Template sai format** — instruction 69 dòng + JSON lồng nhau, không phải descriptive prompt
2. **`panel.imagePrompt` chưa bao giờ được ghi** — DB có field nhưng luôn null
3. **Art style quá ngắn** — default `american-comic` → `"日式动漫风格"` (6 chữ)
4. **Không có mapping reference ảnh** — `image_urls` array flat
5. **3 nguồn dữ liệu chưa được join** — `character_appearances[]`, `photographyRules.characters[]`, `actingNotes.characters[]` là 3 mảng riêng, cần merge theo `name` để ghép description + screen_position + posture + acting

## Cách fix

**Không sửa template.** Bỏ template `single_panel_image.{zh,en}.txt` hoàn toàn.

### Chỉ sửa 1 file: `src/lib/workers/handlers/panel-image-task-handler.ts`

Sửa `buildPanelPrompt`:
1. **Build string prompt trực tiếp trong code** — join 3 mảng character + photography + acting theo `name`
2. **$promt.value trong ComfyUI nhận JSON gốc** — không cần sửa ComfyUI workflow
3. **Prompt format:**

```
{character_line_1}
{character_line_2}

Shot: {shotType} | Camera: {cameraMove}
Scene: {location} — {description}
Lighting: {lighting}
Depth of field: {depth_of_field}
Color tone: {color_tone}
Style: {style}
```

Trong đó `{character_line_n}`:
```
{name}：{description} — vị trí：{screen_position}，{posture}，{acting}
```

Nếu thiếu field nào thì bỏ phần đó.

### Không sửa

- ComfyUI workflow (${promt.value})
- Provider generators (FAL/ARK/Google)
- Template file `.txt`
- Cách collect reference images
- DB schema
- Worker khác

## Prompt mẫu cuối cùng

**Input data join từ 3 nguồn:**

| Tên | description (từ characterAppearance) | screen_position + posture (từ photographyRules) | acting (từ actingNotes) |
|---|---|---|---|
| 顾娘子 | "女性，约二十五岁，鹅蛋脸肤质细腻..." | 左 + 站立 + 面向镜头 | "神色慌张，手中紧握丝帕" |
| 沈公子 | "男性，约二十七岁，面容清俊儒雅..." | 右 + 站立 + 侧身 | "面色凝重，眉头紧锁" |

**Output prompt gửi lên model:**

```
顾娘子：女性，约二十五岁，鹅蛋脸肤质细腻，柳叶眉细长弯弯，杏眼明亮有神。长发乌黑及腰，身穿浅青色对襟襦裙，外罩月白色轻纱褙子 — vị trí：左，站立，面向镜头，神色慌张，手中紧握丝帕
沈公子：男性，约二十七岁，面容清俊儒雅，眉目温润如玉，鼻梁高挺。墨色长发以玉冠束起，身穿月白色圆领长袍，外罩玄色鹤氅 — vị trí：右，站立，侧身，面色凝重，眉头紧锁

Shot: 中景 | Camera: 固定
Scene: 林间小屋白天 — 沈公子站在窗边，顾娘子站在门侧，两人对峙
Lighting: 左侧光，柔光
Depth of field: 浅景深
Color tone: 暖黄调
Style: 日式动漫风格
```

## Ghi chú

- Tất cả field trong prompt đều có sẵn trong context JSON hiện tại, chỉ cần code extract + join
- Prompt bằng tiếng Trung (giữ nguyên description từ DB) + tiếng Việt cho description/hành động (từ panel.description viết bằng tiếng Việt)
- Style field giữ nguyên tiếng Trung từ ART_STYLES
