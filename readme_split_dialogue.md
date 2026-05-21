# Kỹ thuật Split Dialogue (Shot / Reverse-shot)

## Nguyên tắc

Khi nhân vật nói 1 câu thoại, AI tạo ra **2 panel**:

1. **Speaker panel** — focus vào người nói
2. **Listener panel** — focus vào người nghe phản ứng

Cả 2 panel có chung `source_text` (cùng câu thoại).

## Ví dụ

Câu thoại: `Sonic hét lớn: "Bám chắc vào, Kopo!"`

```
Panel 39: Sonic nói (Close-up)
  source_text: "Sonic hét lớn: 「Bám chắc vào, Kopo!」"
  description: Close-up Sonic đang hét, mắt nhìn về phía Kopo
  characters: [Sonic]

Panel 40: Kopo phản ứng (Medium shot)
  source_text: "Sonic hét lớn: 「Bám chắc vào, Kopo!」"
  description: Kopo nhìn lên, mắt mở to, tay bám chặt ván trượt
  characters: [Kopo]
```

## Lý do

Đây là kỹ thuật dựng phim cơ bản (shot/reverse-shot):
- Mắt người xem cần thấy **ai nói + người nghe phản ứng thế nào**
- Nếu chỉ 1 panel sẽ mất cảm xúc của người nghe
- Source_text giống nhau vì đó là câu nói duy nhất trong khoảnh khắc đó

## Khi nào áp dụng

- Mỗi câu thoại chính → 2 panel
- Câu thoại phụ/hành động nhanh → gộp 1 panel
- Nhấn mạnh cảm xúc → 2 panel (người nói + người nghe)

## Không phải bug

Đây là **tính năng, không phải lỗi.** Prompt Phase 1 Plan có rule:

```
每段对话 → 2个镜头（说话者+听者反应）
```

Nếu thấy 2 panel chung source_text là đang hoạt động đúng.
