# Roadmap: Nâng cấp luồng xử lý Âm thanh Hỗn hợp (Mixed Audio Pipeline)

## 1. Vấn đề hiện tại (Problem Statement)
Hiện tại, hệ thống lồng tiếng cho video AI đang hoạt động theo cơ chế **1 Phân cảnh (Panel) = 1 Dòng thoại (Voice Line)**. Điều này dẫn đến các hạn chế:
- **Tình huống "Vừa dẫn vừa thoại":** Trong một cảnh quay dài, có thể vừa có lời dẫn của người kể chuyện (Narrator), vừa có lời thoại ngắn của nhân vật (Dialogue). 
- **Lỗi Lip Sync:** Nếu trộn chung hai loại này vào một file audio, nhân vật sẽ bị "máy động mồm" theo cả lời dẫn truyện, gây mất tự nhiên.
- **Giật cục (Jump cuts):** Nếu tách thành 2 Panel riêng biệt cho những câu thoại cực ngắn (ví dụ: "Vâng", "Đúng"), video sẽ bị cắt cảnh quá nhanh, ảnh hưởng đến trải nghiệm thị giác.

## 2. Mục tiêu kỹ thuật (Technical Objectives)
Chuyển đổi từ cơ chế đơn lẻ sang cơ chế **Xếp hàng âm thanh (Sequential Audio Queue)** cho mỗi phân cảnh.

### Thay đổi cấu trúc dữ liệu (Schema Changes)
- **Editor Project Schema:** Cập nhật `VideoClip` để hỗ trợ mảng `audios` thay vì một object `audio` duy nhất.
- **Metadata:** Mỗi đoạn audio cần có thêm thông tin:
    - `isNarration`: Để biết có cần chạy Lip Sync không.
    - `startTimeOffset`: Thời điểm bắt đầu phát đoạn audio này trong clip.
    - `duration`: Độ dài đoạn audio.

### Quy trình xử lý đề xuất (Proposed Workflow)
1. **Phân tích (AI Analysis):** Cho phép AI trích xuất nhiều dòng thoại (bao gồm cả Narrator) cho cùng một `panelIndex`.
2. **Tổng hợp (Synthesis):** Sinh ra các file audio riêng biệt cho từng dòng.
3. **Ghép nối (Composition):**
    - Tự động nối các file audio thành một chuỗi: `[Audio Narrator] -> [Khoảng nghỉ 0.3s] -> [Audio Thoại]`.
    - Tính toán tổng thời lượng để làm thời lượng chuẩn cho Video Panel.
4. **Lip Sync thông minh:**
    - Chỉ kích hoạt Lip Sync dựa trên file audio của nhân vật.
    - Áp dụng Lip Sync vào video gốc tại đúng thời điểm (offset) mà nhân vật bắt đầu nói.

## 3. Các kịch bản xử lý (Use Cases)
- **Trường hợp thoại dài (> 2s):** Ưu tiên tách Panel để thay đổi góc máy, tạo sự sinh động.
- **Trường hợp thoại siêu ngắn (< 1s):** Gộp chung vào Panel của Narrator, thực hiện nối audio và có thể bỏ qua Lip Sync để giữ mạch video mượt mà.

## 4. Danh sách các file cần chỉnh sửa (Files to be updated)
- `src/features/video-editor/types/editor.types.ts`: Cấu trúc dữ liệu Editor.
- `src/features/video-editor/hooks/useEditorActions.ts`: Logic tạo Project từ Panels.
- `src/lib/workers/handlers/voice-analyze.ts`: Prompt AI để trích xuất đa luồng.
- `src/lib/novel-promotion/stages/video-stage-runtime-core.tsx`: Logic hiển thị và tính toán thời lượng Panel.

---
*Ghi chú: Tài liệu này được tạo ra để lưu trữ ý tưởng và sẽ được triển khai trong các phase tiếp theo của dự án.*
