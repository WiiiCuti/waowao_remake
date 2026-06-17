# Multi-Module Img2Img Architecture

## Concept

Mỗi reference image là 1 module gồm 4 node:

```
LoadImage → ImageScaleBy → VAEEncode → ReferenceLatent
   ↑            ↑              ↑            ↑
  ảnh ref     scale 0.5x    encode latent  gộp cond + latent
```

Các module được chain nối tiếp qua node `ReferenceLatent`:

```
Module 1:  Load[1] → Scale[1] → VAE[1] → Ref[1] ──┐
Module 2:  Load[2] → Scale[2] → VAE[2] → Ref[2] ──┤
Module 3:  Load[3] → Scale[3] → VAE[3] → Ref[3] ──┤──→ Guider → Sampler
...                                                  │
Module N:  Load[N] → Scale[N] → VAE[N] → Ref[N] ──┘
```

## Module chaining rules

| Vị trí | `conditioning` của RefLat đến từ | `latent` của RefLat đến từ |
|--------|----------------------------------|---------------------------|
| Module 1 | CLIPTextEncode (node 6) | VAE module 1 |
| Module 2..N | RefLat module trước đó | VAE module hiện tại |
| Module cuối | → Guider (node 278) | - |

## Khi số ảnh thay đổi

Code tự động:

1. **Giữ** module 1..N (N = số ảnh đầu vào)
2. **Xóa** module N+1..20 khỏi workflow
3. **Chain** RefLat đúng thứ tự
4. **Trỏ** Guider vào RefLat cuối cùng

### Ví dụ

| Số ảnh | Module giữ | Module xóa | Chain |
|--------|------------|------------|-------|
| 1 | 1 | 2-20 | CLIP → Ref1 → Guider |
| 3 | 1-3 | 4-20 | CLIP → Ref1 → Ref2 → Ref3 → Guider |
| 7 | 1-7 | 8-20 | CLIP → Ref1 → ... → Ref7 → Guider |
| 20 | 1-20 | (không) | CLIP → Ref1 → ... → Ref20 → Guider |

## Cấu trúc JSON workflow

File: `src/lib/generators/image/flux_img2img_multi.json`

- 20 module (ID node 198-341), mỗi module 4 node
- Base nodes: CLIP, Guider, Sampler, VAE, UNET, ...
- Code tham chiếu module qua mảng `MODULES` trong `comfyui.ts`

## Thêm module mới

1. Thêm 4 node vào JSON (LoadImage, ImageScaleBy, VAEEncode, ReferenceLatent)
2. Thêm 1 dòng vào mảng `MODULES` trong `comfyui.ts`
3. Xong — không cần sửa logic khác
