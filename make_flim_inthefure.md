# Ý tưởng chuyển đổi định dạng: Từ Sách Nói (Audiobook) sang Phim Điện Ảnh (Cinematic Movie)

Tài liệu này lưu trữ ý tưởng chuyển đổi tư duy làm video từ dạng "truyện tranh động có người dẫn truyện" sang dạng "phim điện ảnh thực thụ" cho các hệ thống tạo video AI trong tương lai.

## 1. Vấn đề của hệ thống hiện tại (Tư duy Sách nói)
- **Có Narrator (Người dẫn truyện):** Bất kể trên màn hình đang chiếu cảnh gì, hệ thống luôn ép buộc phải có một giọng đọc vang lên để mô tả lại y hệt văn bản gốc (VD: *"Triệu Đông Kỳ đứng đối diện, khí thế ngút trời"*).
- **Thiếu tính điện ảnh:** Khi xem phim thực tế, khán giả cảm nhận hành động và không gian qua **thị giác** và **âm thanh môi trường (SFX/BGM)**, chứ không phải qua một người đứng ngoài miêu tả lại hành động đó.

## 2. Giải pháp: Tư duy Làm Phim (Cinematic Movie Mode)

Để làm cho video giống phim điện ảnh thật sự, hệ thống cần thay đổi cơ chế phân tích giọng nói (Voice Analysis) và phân cảnh (Storyboard Plan) như sau:

### A. Loại bỏ hoàn toàn Người dẫn truyện (No Narrator)
- Các phân cảnh (panel) chỉ chứa hành động, mô tả cảnh vật, hoặc các khung hình B-roll/Cinematic Insert (các đoạn text nằm trong ngoặc vuông `[...]` hoặc text mô tả thông thường không có thoại) sẽ **KHÔNG tạo ra bất kỳ record giọng đọc nào**.
- **Hiệu ứng:** Trên phim, những cảnh này sẽ chỉ có hình ảnh chuyển động kết hợp với âm thanh môi trường và nhạc nền, tạo không gian lặng mang tính điện ảnh.

### B. Trích xuất chỉ lời thoại tinh khiết (Pure Dialogue)
- Đối với các phân cảnh có nhân vật nói chuyện, hệ thống bóc tách âm thanh (Voice Analysis) phải thông minh vứt bỏ phần "dẫn truyện" (VD: *Vị tướng quân lạnh giọng nói:*).
- Chỉ giữ lại **đúng phần nội dung nằm trong ngoặc kép `""`** để đưa vào bộ đọc TTS (Text-to-Speech).
- **Hiệu ứng:** Trên phim, nhân vật sẽ trực tiếp cất giọng nói câu thoại đó, khớp với khẩu hình miệng (lip-sync), không bị dư thừa từ ngữ miêu tả.

### C. Độc thoại nội tâm (Inner Monologue / Voice-over)
- Những đoạn suy nghĩ trong đầu (VD: *Anh ta thầm nghĩ: "Mình thế mà lại..."*) sẽ được đọc bởi chính giọng của nhân vật đó.
- **Hiệu ứng:** Hình ảnh có thể chiếu cảnh nhân vật đang ngẩn người hoặc suy tư (miệng không mấp máy), nhưng âm thanh vang lên giọng nói suy nghĩ của họ (có thể thêm hiệu ứng echo/reverb nhẹ để phân biệt với thoại trực tiếp).

---

## 3. Ví dụ áp dụng

**Văn bản gốc:**
> Triệu Đông Kỳ đứng đối diện, khí thế ngút trời.
> [Hai bóng người đối đỉnh giữa khoảng trống, gió thổi vạt áo bay phần phật]
> Vị tướng quân của Đại Thanh bước lên một bước, vị tướng quân lạnh giọng nói: "Triệu Đông Kỳ, ngươi và ta thực lực ngang nhau, cứ phải đấu một trận sống mái sao?"

**Xử lý trên phim:**
1. Khung hình 1 (Triệu Đông Kỳ đứng đối diện...): **[Không có tiếng thoại]** (Chỉ chiếu hình + nhạc nền căng thẳng).
2. Khung hình 2 (Cinematic Insert `[...]`): **[Không có tiếng thoại]** (Đặc tả áo bay phần phật + tiếng gió rít).
3. Khung hình 3 (Tướng quân nói): **[Giọng Tướng quân cất lên]**: *"Triệu Đông Kỳ, ngươi và ta thực lực ngang nhau, cứ phải đấu một trận sống mái sao?"* (Không đọc phần "Vị tướng quân lạnh giọng nói").

---
*Ghi chú: Tài liệu này lưu lại ý tưởng để phát triển các rules cho Agent (voice_analysis, storyboard_plan) trong tương lai khi có nhu cầu nâng cấp.*
