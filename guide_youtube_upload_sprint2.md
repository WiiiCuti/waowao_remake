# Sprint 2: YouTube Upload

## Đã có sẵn (Sprint 1)
- YouTube stage UI (`YouTubeStage.tsx`) — có Merge button, progress bar, preview
- Merge API + worker — merge panel → concat → upload COS
- Nav item youtube ở cuối

## Cần làm

### 1. Google Cloud Console
- Tạo OAuth Client ID (Web application)
- Thêm redirect URI: `http://localhost:3000/api/auth/youtube/callback`
- Copy `.env`:
  ```
  GOOGLE_CLIENT_ID=xxx
  GOOGLE_CLIENT_SECRET=xxx
  ```

### 2. DB Schema
Thêm model vào `prisma/schema.prisma`:
```prisma
model AccountYoutubeToken {
  id           String   @id @default(uuid())
  userId       String   @unique
  refreshToken String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt
  @@map("account_youtube_tokens")
}
```
Chạy: `npx prisma db push`

### 3. File cần tạo (Sprint 2)

| File | Vai trò |
|------|---------|
| `src/lib/youtube/types.ts` | Types cho YouTube API |
| `src/lib/youtube/auth.ts` | Refresh token logic |
| `src/lib/youtube/upload.ts` | Upload video lên YouTube Shorts |
| `src/app/api/auth/youtube/route.ts` | Redirect Google OAuth |
| `src/app/api/auth/youtube/callback/route.ts` | OAuth callback, lưu token |
| `src/app/api/novel-promotion/[projectId]/youtube/upload/route.ts` | POST upload YouTube |

### 4. File cần sửa

| File | Sửa |
|------|-----|
| `src/features/novel-promotion/youtube/YouTubeStage.tsx` | Thêm YouTube login button + upload form |

### 5. Cài đặt
```bash
npm install googleapis
```

### 6. Luồng OAuth
```
User click "Login YouTube"
  → /api/auth/youtube (redirect Google OAuth)
  → User chọn account + approve
  → Google redirect về /api/auth/youtube/callback?code=xxx
  → Exchange code → refresh_token
  → Lưu AccountYoutubeToken (upsert userId)
  → Redirect về ?stage=youtube
```

### 7. Upload flow
```
User fill title/description/tags
  → POST /youtube/upload { episodeId, title, description, tags, privacyStatus }
  → Lấy refresh_token từ DB
  → googleapis.youtube.videos.insert({ media: fs.createReadStream(cosKey), requestBody })
  → Trả về { youtubeVideoId, youtubeUrl }
```

### Lưu ý
- YouTube Shorts: `categoryId=22`, video <60s, vertical (9:16)
- Quota free: ~6 video/ngày — cảnh báo UI trước upload
- Token hết hạn → refresh tự động dùng `refresh_token`
- COS key cần `getSignedUrl` hoặc download local trước upload
