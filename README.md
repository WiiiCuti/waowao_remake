# waoowaoo AI Studio

Công cụ sản xuất video phim ngắn/truyện tranh dựa trên AI, tự động tạo phân cảnh, nhân vật, bối cảnh từ tiểu thuyết và ghép thành video hoàn chỉnh.

> [!IMPORTANT]
> ⚠️ **Bản beta**: Dự án hiện ở giai đoạn đầu thử nghiệm, do một người phát triển nên còn một số lỗi và chưa hoàn thiện. Chúng tôi đang cập nhật nhanh chóng.

---

## ✨ Tính năng

- 🎬 **Phân tích kịch bản AI** — Tự động phân tích tiểu thuyết, trích xuất nhân vật, bối cảnh, cốt truyện
- 🎨 **Tạo nhân vật & bối cảnh** — AI tạo hình ảnh nhân vật và bối cảnh nhất quán
- 📽️ **Sản xuất video phân cảnh** — Tự động sinh phân cảnh và ghép video
- 🎙️ **Lồng tiếng AI** — Tổng hợp giọng nói đa nhân vật
- 🌐 **Đa ngôn ngữ** — Giao diện Tiếng Việt / English, chuyển đổi một chạm

---

## 🚀 Bắt đầu nhanh

**Yêu cầu**: Cài [Docker Desktop](https://docs.docker.com/get-docker/)

### Docker Compose

```bash
docker compose up -d
```

> ⚠️ Bản beta không tương thích database giữa các phiên bản. Khi nâng cấp hãy xoá dữ liệu cũ:
> ```bash
> docker compose down -v
> docker compose up -d
> ```

### Local dev (cho developer)

```bash
# Copy file env
cp .env.example .env
# ⚠️ Sửa .env, nhập AI API Key của bạn

npm install

# Chạy hạ tầng
docker compose up mysql redis minio -d

# Khởi tạo database (bắt buộc lần đầu)
npx prisma db push

# Chạy dev server
npm run dev
```

> [!WARNING]
> Bỏ qua `npx prisma db push` sẽ gây lỗi `The table 'tasks' does not exist`. Chạy lệnh này trước khi start dev server.

---

Truy cập [http://localhost:13000](http://localhost:13000) để bắt đầu!

---

## 🔧 Cấu hình API

Sau khi khởi động vào **Settings** để cấu hình API Key cho AI. Có hướng dẫn tích hợp sẵn.

---

## 📦 Công nghệ

- **Framework**: Next.js 15 + React 19
- **Database**: MySQL + Prisma ORM
- **Queue**: Redis + BullMQ
- **Style**: Tailwind CSS v4
- **Auth**: NextAuth.js

---

## 🧠 Phân tích LLM Reasoning

Tổng quan các nơi gọi LLM trong dự án, phân loại mức độ cần thinking/reasoning.

### Call chain

```
Callers (worker handlers, storyboard phases, etc.)
  → executeAiTextStep / executeAiVisionStep  (src/lib/ai-runtime/client.ts)
    → runModelGatewayTextCompletion          (src/lib/model-gateway/llm.ts)
      → chatCompletion / chatCompletionStream (src/lib/llm/)
```

`reasoning` và `reasoningEffort` được truyền xuyên suốt. Default: `reasoning = true`, `reasoningEffort = 'high'`.

### ✅ KHÔNG CẦN THINK (fill-form / map data)

| File | Action | Trạng thái |
|------|--------|-----------|
| `src/lib/workers/handlers/character-profile.ts` | Confirm → sinh mô tả ngoại hình | ✅ Đã tắt |
| `src/lib/novel-promotion/prompt-refiner.ts` | Tinh chỉnh panel prompt | ✅ Đã tắt |
| `src/lib/workers/handlers/voice-analyze.ts` | Phân tích voice lines | ❌ Chưa tắt |
| `src/lib/workers/handlers/clips-build.ts` | Tách clip | ❌ Chưa tắt |
| `src/lib/workers/handlers/asset-hub-ai-modify.ts` | Sửa mô tả asset | ❌ Chưa tắt |
| `src/lib/workers/handlers/modify-description-sync.ts` | Đồng bộ mô tả sau edit ảnh | ❌ Chưa tắt |
| `src/lib/workers/handlers/reference-to-character.ts` | Trích mô tả từ ảnh tham khảo | ❌ Chưa tắt |

### 🤔 BORDERLINE (có thể tắt)

| File | Action | Lý do |
|------|--------|-------|
| `src/lib/storyboard-phases.ts` (phase 2 cinematography) | Xác định lighting, composition, camera angle | Rule rõ ràng, fill JSON |
| `src/lib/storyboard-phases.ts` (phase 2 acting) | Xác định diễn xuất | Rule rõ ràng |
| `src/lib/storyboard-phases.ts` (phase 3 detail) | Refine panel detail + video prompt | Gần giống prompt-refiner |
| `src/lib/workers/handlers/shot-ai-variants.ts` | Vision phân tích biến thể shot | Output có cấu trúc |
| `src/lib/workers/handlers/shot-ai-prompt-runtime.ts` | Sinh action động cho shot | Template-driven |
| `src/lib/workers/text.worker.ts` | Insert panel generate text | Template fill |
| `src/lib/asset-utils/ai-design.ts` | AI design nhân vật/location | Sáng tạo nhưng có template |

### 🔥 CẦN THINK (nên giữ)

| File | Action | Lý do |
|------|--------|-------|
| `src/lib/storyboard-phases.ts` (phase 1 plan) | Chia source text → panel, quyết định cut | Cần hiểu narrative |
| `src/lib/workers/handlers/script-to-storyboard.ts` | Orchestrator script→storyboard | Cần continuity |
| `src/lib/workers/handlers/episode-split.ts` | Tách episode thông minh | Cần hiểu cốt truyện |
| `src/lib/workers/handlers/screenplay-convert.ts` | Convert novel → screenplay | Cần chuyển thể |
| `src/lib/workers/handlers/analyze-novel.ts` | Phân tích truyện | Cần extract thông tin |
| `src/lib/workers/handlers/analyze-global.ts` | Global analyze assets | Cần extract thông tin |
| `src/lib/workers/handlers/ai-story-expand.ts` | Mở rộng nội dung truyện | Creative writing |
| `src/lib/workers/handlers/story-to-script.ts` | Story → script pipeline | Tổng hợp nhiều bước |

---
