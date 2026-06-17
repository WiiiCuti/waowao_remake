# Fix Image Generation với ComfyUI Local

## Vấn đề

Khi dùng **OpenAI Compatible** provider với **Base URL `http://host.docker.internal:8188`** (ComfyUI local), image generation bị lỗi:

```
Generation Failed
当前视频接口格式暂不支持。 Template request failed with status 405: Method Not Allowed
```

**Nguyên nhân**: Code detect nhầm provider `openai-compatible` → route qua `openai-compat` gateway → gọi endpoint `/v1/images/generations` → ComfyUI không có endpoint này → **405 Error**

## Cách hoạt động (Trước fix)

```
generateImage("openai-compatible::stabilityai/sdxl", prompt, options)
  ↓
resolveModelSelection() → provider="openai-compatible"
  ↓
providerConfig.baseUrl = "http://host.docker.internal:8188" (ComfyUI port)
  ↓
gatewayRoute = "openai-compat" ❌ (nhầm sang openai-compat gateway)
  ↓
generateImageViaOpenAICompatTemplate()
  ↓
Gọi POST /v1/images/generations (OpenAI API format)
  ↓
ComfyUI trả về 405 Method Not Allowed ❌
```

## Cách hoạt động (Sau fix)

```
generateImage("openai-compatible::stabilityai/sdxl", prompt, options)
  ↓
resolveModelSelection() → provider="openai-compatible"
  ↓
providerConfig.baseUrl = "http://host.docker.internal:8188" (port 8188)
  ↓
isComfyUIEndpoint = true (detect port 8188)
  ↓
gatewayRoute = "official" ✅ (bypass openai-compat)
  ↓
createImageGenerator("openai-compatible")
  ↓
ComfyUIImageGenerator
  ↓
Gọi POST /prompt (ComfyUI native API) ✅
```

## Code đã sửa

### File: `src/lib/generator-api.ts`

#### 1. Image Generation (line 103-110)

```typescript
// ComfyUI uses its own /prompt API, bypass openai-compat gateway
// Check if baseUrl points to ComfyUI (port 8188 or contains 'comfyui')
const isComfyUIEndpoint = (providerConfig.baseUrl?.includes(':8188') || 
                          providerConfig.baseUrl?.includes('comfyui'))
if (providerKey === 'comfyui' || isComfyUIEndpoint) {
    gatewayRoute = 'official'
}
```

#### 2. Video Generation (line 237-242)

```typescript
// ComfyUI uses its own /prompt API, bypass openai-compat gateway
const isComfyUIEndpoint = (providerConfig.baseUrl?.includes(':8188') || 
                          providerConfig.baseUrl?.includes('comfyui'))
if (providerKey === 'comfyui' || isComfyUIEndpoint) {
    gatewayRoute = 'official'
}
```

## Logic detect ComfyUI endpoint

```typescript
const isComfyUIEndpoint = (
    providerConfig.baseUrl?.includes(':8188') ||     // Port 8188
    providerConfig.baseUrl?.includes('comfyui')       // URL contains 'comfyui'
)
```

**Các URL ComfyUI được detect:**
- `http://localhost:8188`
- `http://host.docker.internal:8188`
- `http://192.168.1.100:8188`
- `https://comfyui.example.com`

## ComfyUI Image Generator

### File: `src/lib/generators/image/comfyui.ts`

- Đọc workflow từ `flux_generator.json` (thay vì `image_flux.json`)
- Nhận `referenceImages[]` để support img2img
- Mapping placeholders: `$promt.value`, `$with.value`, `$height.value`, `$image.load`
- Gọi `POST /prompt` với workflow JSON
- Poll `/history/{prompt_id}` để lấy kết quả

### Workflow: `src/lib/generators/image/flux_generator.json`

Các placeholder nodes:
- `$promt.value` → Prompt text
- `$with.value` → Width
- `$height.value` → Height
- `$image.load` → Input image (base64)
- `@image.save` → Save output

## Flow đầy đủ

```
1. User chọn model → resolveModelSelection()
2. Lấy providerConfig → check baseUrl port
3. Nếu port 8188 (ComfyUI) → bypass openai-compat
4. Tạo ComfyUIImageGenerator
5. Build workflow với prompt, dimensions, images
6. POST /prompt → ComfyUI queue workflow
7. Poll /history/{prompt_id} → lấy image URL
8. Upload lên COS → trả về signed URL
```

## Lỗi có thể gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `405 Method Not Allowed` | Base URL sai hoặc ComfyUI chưa chạy | Check ComfyUI đang chạy ở port 8188 |
| `MODEL_NOT_FOUND` | Model key format sai | Format: `provider::modelId` |
| `ComfyUI timeout` | Workflow chạy quá lâu | Tăng `maxAttempts` trong pollForResult |
| `Character model not configured` | Chưa set character model | Vào Settings → Models → set Character Image Model |

## Test

```powershell
# Check ComfyUI logs
docker-compose logs -f app | Select-String -Pattern "ComfyUI|8188|prompt"

# Test ComfyUI API directly
curl http://localhost:8188/system_stats
curl -X POST http://localhost:8188/prompt -H "Content-Type: application/json" -d '{"prompt": {}}'
```

## Notes

- ComfyUI không support OpenAI image API format (`/v1/images/generations`)
- ComfyUI dùng native API: `POST /prompt` và `GET /history/{prompt_id}`
- Image-to-Image (img2img) được hỗ trợ khi có `referenceImages[0]`
- Denoise được tự động giảm xuống 0.65 khi dùng img2img