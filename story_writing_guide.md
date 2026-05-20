# Hướng dẫn viết truyện để AI panel hóa tốt

## 1. Mỗi hành động = một đoạn riêng

**Nên:**

```
Trần Phong mở cửa bước vào phòng.
Hắn nhìn quanh một lượt.
"Lâm tiểu thư có nhà không?" hắn cất tiếng hỏi.
Từ phòng trong, giọng Lâm Vy Vy vọng ra: "Anh tới làm gì?"
```

**Không nên:**

```
Trần Phong mở cửa bước vào phòng, hắn nhìn quanh một lượt rồi cất tiếng hỏi "Lâm tiểu thư có nhà không?" thì từ phòng trong giọng Lâm Vy Vy vọng ra "Anh tới làm gì?"
```

## 2. Dialogue luôn format: Tên + dấu câu + "Nội dung"

**Nên:**

```
Lâm Vy Vy lạnh lùng nói: "Chúng ta không hợp."
Trần Phong nhếch mép cười: "Em nghĩ vậy thật sao?"
Vương Tử Hào chen vào: "Nghe rõ chưa? Cút đi."
```

**Không nên:**

```
"Chúng ta không hợp" Lâm Vy Vy lạnh lùng nói, Trần Phong nhếch mép cười hỏi lại "Em nghĩ vậy thật sao?" và Vương Tử Hào liền chen vào bảo cút đi.
```

## 3. Mô tả cảnh/hành động viết rõ ràng

**Nên:**

```
Hoàng hôn buông xuống, ánh nắng cuối ngày nhuộm đỏ cả góc trời.
Trần Phong đứng trên ban công, tay vịn lan can, mắt nhìn xa xăm.
Gió thổi nhẹ làm tà áo anh phần phật.
```

**Không nên:**

```
Một buổi chiều nào đó khá đẹp trời, Trần Phong cảm thấy tâm trạng lẫn lộn khi đứng ở ban công nhìn ra xa.
```

## 4. Dùng dấu câu dứt khoát

Dùng `.` `!` `?` rõ ràng. Hạn chế `...` vì model thường gộp không cắt được.

## 5. Mỗi đoạn hội thoại tối đa 2 lượt nói

**Nên:**

```
A nói: "Câu 1"
B đáp: "Câu 2"
[Thông báo hệ thống]
A nói tiếp: "Câu 3"
```

## 6. Dùng `[...]` cho âm thanh/thông báo/hiệu ứng

Mỗi `[...]` riêng lẻ. Không gộp `[A][B][C]` vào một dòng.

## 7. Scene transition rõ ràng

Khi đổi cảnh, ghi rõ để LLM biết đây là establishing shot:

```
===== Cảnh 2: Biệt thự Vương Tử Hào =====
```

## 8. Không gom quá nhiều ý vào một câu

**Nên:**

```
Hắn đứng dậy.
Hắn bước đến cửa sổ.
"Em đi đâu?" anh hỏi.
Nàng không trả lời.
```

**Không nên:**

```
Hắn đứng dậy bước đến cửa sổ hỏi "Em đi đâu?" nhưng nàng không trả lời.
```

## Tóm tắt

Viết ngắn, xuống dòng nhiều, ghi rõ ai nói, dùng dấu câu đầy đủ → AI cắt dễ, chất lượng panel tốt hơn.
