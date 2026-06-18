# Tối ưu hóa Luồng Kịch bản (Storyboard) theo Hướng Gộp Cảnh (Merge Context + Dialogue)

Mục tiêu: Đảm bảo người xem luôn hiểu được bối cảnh xung quanh bằng cách gộp trực tiếp phần "Miêu tả hành động/bối cảnh" vào chung một Frame (Panel) với phần "Thoại" của nhân vật.

## 1. Phát hiện gốc rễ vấn đề
Trong file `agent_storyboard_plan.en.txt` hiện tại, hệ thống đang bị ép phải **TÁCH** Hành động và Thoại ra làm nhiều cảnh nhỏ.
Cụ thể ở dòng 79 của file cấu hình cũ:
> `a) "Action + Dialogue" → 3-4 shots`
> `(Ví dụ: Nhìn xung quanh (1) + Mở miệng nói (1) + Người khác phản ứng (1))`

Chính luật này làm cho lúc nhân vật mấp máy môi nói, khung hình chỉ đưa camera dí sát vào mặt (Close-up) mà bỏ quên hoàn toàn chuyện họ đang đứng dưới mưa hay cầm cái ô!

## 2. Giải pháp: Hợp nhất (Merge) Hành động và Câu nói

Đúng như ý tưởng cực hay của bạn, chúng ta sẽ sửa lại luật chia Panel để hệ thống gộp chúng lại làm một:

- **Panel 1 (Minh):** Gộp đoạn *"[Bối cảnh] Trong cơn mưa tầm tã tôi lại không mang dù, trong lúc tức giận tôi thốt lên: [Thoại] Ông trời ơi, sao làm khổ con..."* thành **MỘT PANEL DUY NHẤT**. 
  → AI Video sẽ sinh ra cảnh: Mưa tầm tã, Minh đứng ướt sũng, ngẩng mặt lên trời gào thét. (Trùng khớp lúc audio đang phát câu gào thét).
  
- **Panel 2 (Linh):** Gộp đoạn *"[Bối cảnh] Mỹ Linh đi ra từ cửa hàng: [Thoại] Anh không mang áo mưa à..."* thành **MỘT PANEL DUY NHẤT**.
  → AI Video sẽ sinh ra cảnh: Cửa hàng phía sau, Linh bước ra đưa áo mưa, miệng đang nói. (Trùng khớp lúc audio giọng Linh phát lên).

## 3. Các thay đổi cụ thể trên file `agent_storyboard_plan.en.txt`

1. **Xoá luật cấm gộp và luật chia vụn:**
   Xoá bỏ quy tắc chia "Action + Dialogue" thành 3-4 shots.
   
2. **Thêm luật gộp (Action-Dialogue Merging Rule):**
   Thêm hướng dẫn: 
   > "⚠️ Action-Dialogue Merging (CRITICAL): When a character performs an action or is in a specific environment AND immediately speaks, you MUST MERGE the action description and the dialogue into a SINGLE PANEL (as long as the total word count is ≤ 24 words).
   > Example: 'In the heavy rain, Minh angrily yelled: Why me?!' -> Generate exactly 1 panel containing both the rain context and the yelling dialogue. This ensures the generated video prompt includes the surrounding environment while the character speaks."

3. **Cập nhật ví dụ (Examples):**
   Thay đổi các ví dụ mẫu trong Prompt để LLM học theo phong cách gộp 1 Panel (1 shot bao trọn cả bối cảnh + hành động + lời nói).

## User Review Required
> [!IMPORTANT]
> Cách giải quyết này của bạn đi đúng vào bản chất của AI Video (Prompt 1 câu mô tả cả cảnh vật lẫn mồm mấp máy)! Nếu bạn đồng ý với kế hoạch gộp cảnh (Merge) này, tôi sẽ tiến hành sửa file Prompt `agent_storyboard_plan.en.txt` ngay bây giờ để áp dụng luật mới!
