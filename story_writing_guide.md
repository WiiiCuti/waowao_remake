# Hướng dẫn viết truyện thân thiện với AI Panel hóa

Tài liệu này không ép bạn phải viết truyện theo kiểu robot. Chỉ là các mẹo nhỏ giúp AI phân tách panel chuẩn xác, không bị trùng góc máy, mất continuity hoặc dựt dựt.

---

## 1. Xác định rõ chủ ngữ nói (Speaker Explicit)

Đừng bắt AI đoán ai đang nói dựa vào ngữ cảnh — dễ sai, dễ gộp nhầm panel.

**Nên tránh:**
```
"Chúng ta không hợp." Giọng nói lạnh lùng vang lên.
"Em nghĩ vậy thật sao?" Một tiếng cười nhạt đáp lại.
```

**Nên viết:**
```
Lâm Vy Vy lạnh lùng nói: "Chúng ta không hợp."
Trần Phong cười nhạt: "Em nghĩ vậy thật sao?"
```

---

## 2. Ngắt đoạn theo nhịp hành động

Không nhồi quá nhiều hành động của nhiều nhân vật vào một câu. Xuống dòng khi đổi trọng tâm hoặc đổi góc máy.

**Nên tránh:**
```
Trần Phong đứng dậy khỏi ghế bước đến bên cửa sổ khi ánh hoàng hôn hắt lên gương mặt hắn và hắn hỏi "Nó sẽ tới chứ?" trong khi mắt vẫn nhìn ra xa còn Vương Tử Hào ngồi phía sau tay xoay ly rượu nói "Nó mà không tới thì đã không gọi điện."
```

**Nên viết:**
```
Trần Phong đứng dậy khỏi ghế, bước đến bên cửa sổ. Ánh hoàng hôn hắt lên gương mặt hắn. "Nó sẽ tới chứ?" hắn hỏi, mắt vẫn nhìn ra xa.

Vương Tử Hào ngồi phía sau, tay xoay xoay ly rượu: "Nó mà không tới thì đã không gọi điện."
```

---

## 3. Đan xen hành động vào đoạn tả cảnh/nội tâm

Một trang toàn tả cảnh + cảm xúc nội tâm → AI tạo panel na ná nhau.

Thêm vài hành động nhỏ (thở dài, bật quẹt lửa, nhìn đồng hồ) hoặc câu thoại ngắn giữa đoạn tả cảnh để AI có điểm bám mà cắt panel.

---

## 4. Đánh dấu chuyển cảnh rõ ràng

Khi đổi không gian hoặc thời gian, dùng ký hiệu phân tách để AI hiểu đây là Establishing Shot.

```
---
Bên kia thành phố, tại biệt thự của Vương Tử Hào.
```

---

## 5. Chia nhỏ lời thoại dài

Nếu nhân vật nói một tràng dài nhiều ý, AI sẽ nhét vào một khung hình hoặc cắt sai.

Nếu muốn nhấn mạnh từng cột mốc, tách thoại:
```
"Ta cho con ba ngày."
"Ba ngày để thu xếp mọi chuyện."
"Sau đó, con phải rời khỏi đây."
```

Không cần tách nếu bạn muốn giữ nhịp — AI vẫn xử lý được câu liền, chỉ có điều nó sẽ gộp vào 1 panel.

---

## 6. Duy trì tính đồng nhất thị giác

Khi nhân vật thay đổi trạng thái ngoại hình, vị trí hoặc hành động, hãy mô tả ngắn gọn bằng tính từ trực quan để prompt sinh ảnh không bị lệch (morphing).

**Thay vì:** `Piko lao đi.`
**Nên:** `Piko nằm sấp bụng, lao vút đi trên tuyết.`

---

## Nguyên tắc cốt lõi

Viết tự nhiên nhất có thể. Viết xong toàn bộ câu chuyện rồi mới quay lại tinh chỉnh nhẹ theo các mục trên. Đừng để kỹ thuật làm mất đi cái "hồn" của tác phẩm.
