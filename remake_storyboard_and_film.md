# Phân tích Film nâng cao — Tích hợp Panel Purpose + Transition Rules

> Kết hợp: mỗi panel có **MỘT mục đích** (film.md) + mỗi transition có **MỘT kỹ thuật** nối (guide.md)

---

## 1. Phát hiện cốt lõi

### Vấn đề 1: Panel hiện tại không có "mục đích film"

Hệ thống cũ biết panel có `scene_type` (daily/emotion/action/epic/suspense) nhưng không biết **mục đích film của panel này là gì** trong luồng kể chuyện.

```
scene_type = "daily"         →  "cảnh hàng ngày"
purpose    = "establish"     →  "cho khán giả biết đang ở đâu"
purpose    = "char_enter"    →  "cho khán giả thấy nhân vật mới"
purpose    = "reaction"      →  "cho khán giả thấy cảm xúc"
```

2 panel khác nhau có thể có chung `scene_type: daily` nhưng purpose khác nhau → transition khác nhau.

### Vấn đề 2: Không biết audio đang làm gì

Hệ thống hiện tại chỉ có `srtSegment` (text) và suy ra audio từ đó. Nhưng không biết:

```
audio_type = "silent"        →  chỉ có ambient (mưa, gió)
audio_type = "dialogue"      →  nhân vật nói, môi mấp máy
audio_type = "inner_voice"   →  voiceover, môi KHÔNG mấp máy
audio_type = "narration"     →  giọng kể, không có nhân vật trên màn hình
```

Audio type quyết định transition. Silent → dialogue cần sound bridge. Dialogue → silent cần hard cut.

### Vấn đề 3: Không có transition field

Mỗi panel không biết nó nên kết thúc thế nào:
- `hard_cut`? `sound_bridge`? `match_cut`?
- Audio có cần kéo dài sang panel sau không? (L-cut)
- Audio có cần bắt đầu trước khi hình cắt không? (J-cut)

---

## 2. Film Analysis — Từng panel với đầy đủ Purpose + Audio + Transition

> Cấu trúc phân tích mới:
> - **Purpose**: mục đích film của panel
> - **Audio**: loại audio + nội dung
> - **Visual**: nội dung khung hình
> - **Duration**: thời gian
> - **Transition IN**: cách nối từ panel trước
> - **Transition OUT**: cách nối sang panel sau
> - **Film reason**: tại sao lại làm thế

---

### Panel 1 — "Hôm nay trời bất chợt đổ mưa. Minh đứng dưới mái hiên..."

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 1                                                         │
│                                                                 │
│ Purpose:     establish_scene                                    │
│ Shot:        Wide Shot                                          │
│ Duration:    4s                                                 │
│                                                                 │
│ Audio:       silent_ambient → "mưa rơi, xe cộ xa, không khí   │
│              ồn ào của phố"                                      │
│ Visual:      Phố mưa, người vội vã. Minh nhỏ bé dưới mái hiên   │
│                                                                 │
│ Transition IN:  (panel đầu, không có transition trước)          │
│ Transition OUT: match_cut_audio → panel 2 (tiếng mưa liên tục)  │
│                                                                 │
│ Film reason: Khán giả cần biết 2 điều ngay lập tức:             │
│   1. Đây là đâu? → phố mưa, mái hiên quán cà phê                │
│   2. Ai ở đây? → Minh, một mình, nhìn mưa                       │
│ Wide Shot trả lời cả 2 câu hỏi trong 1 frame.                   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 2 — "[Những giọt mưa lớn xối xả đập xuống vũng nước...]"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 2                                                         │
│                                                                 │
│ Purpose:     b_roll_poetic — nhấn mạnh cảm xúc qua thiên nhiên │
│ Shot:        ECU Insert                                         │
│ Duration:    2s                                                 │
│                                                                 │
│ Audio:       silent_ambient → "mưa đập mạnh xuống nước, bọt    │
│              văng" — GIỐNG HỆT âm thanh panel 1, không đổi      │
│ Visual:      Giọt mưa đập vũng nước, bọt tung tóe               │
│                                                                 │
│ Transition IN:  match_cut_audio — từ panel 1                    │
│                 Lý do: tiếng mưa KHÔNG ĐỔI giữa 2 panel.        │
│                 Nếu hard cut, khán giả cảm giác "bị ngắt"       │
│                 dù 2 panel liên quan đến nhau.                   │
│                                                                 │
│ Transition OUT: sound_bridge — sang panel 3                     │
│                 Lý do: panel 3 là inner_voice. Voice của Minh   │
│                 cần "len vào" tự nhiên, không đột ngột.         │
│                 VO bắt đầu 0.5s trước khi hết panel 2.          │
│                                                                 │
│ Film reason: B-roll poetic. Chuyển từ "không gian bên ngoài"   │
│ (Minh + phố) sang "cảm nhận chủ quan" (nước mưa = tâm trạng).  │
│ Audio match cut giữ cho transition mượt dù hình ảnh đổi hẳn.    │
└─────────────────────────────────────────────────────────────────┘
```

**Vấn đề với hệ thống cũ**: `[...]` insert = panel riêng, nhưng transition mặc định là hard cut → cảm giác "phim bị ngắt quãng". Cần match_cut_audio để nối mượt.

---

### Panel 3 — "Minh khẽ chép miệng, thầm nghĩ: 'Lại quên ô rồi...'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 3                                                         │
│                                                                 │
│ Purpose:     action_plus_inner_voice                            │
│ Shot:        Medium Shot                                        │
│ Duration:    4s                                                 │
│                                                                 │
│ Audio:       inner_voice → "Lại quên ô rồi. Lần nào cũng vậy."  │
│              Bắt đầu 0.5s trước khi hình cắt (sound bridge IN)  │
│              Kết thúc dứt khoát, không kéo dài (hard cut OUT)   │
│                                                                 │
│ Visual:      Minh chép miệng, mắt nhìn xa xăm ra màn mưa.       │
│              Vai hơi xệ, tay trong túi áo.                      │
│                                                                 │
│ Transition IN:  sound_bridge — từ panel 2                       │
│                 VO "Lại quên ô rồi" bắt đầu 0.5s cuối panel 2   │
│                 → tạo cảm giác suy nghĩ "len vào" tự nhiên.     │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 4a                        │
│                 Lý do: panel 4a là establish NHÂN VẬT MỚI       │
│                 (Linh). Cần cắt dứt khoát để báo hiệu           │
│                 "có người sắp vào". Nếu sound bridge,            │
│                 khán giả sẽ nghĩ Minh còn đang nghĩ tiếp         │
│                 khi Linh xuất hiện → confusion.                  │
│                                                                 │
│ Film reason: Inner monologue = khán giả nghe được suy nghĩ     │
│ của Minh. Môi không mấp máy. Sound bridge IN cho cảm giác       │
│ "ý nghĩ vừa chợt đến". Hard cut OUT để "khép" suy nghĩ lại     │
│ trước khi có nhân vật mới.                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 4a — "Linh bước vội vào mái hiên, mái tóc hơi ướt..."

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 4a                                                        │
│                                                                 │
│ Purpose:     establish_character — Linh ENTERS scene            │
│ Shot:        Medium Shot                                        │
│ Duration:    3s                                                 │
│                                                                 │
│ Audio:       silent_ambient → mưa (quay lại từ panel 3)        │
│              KHÔNG có nhạc, KHÔNG có thoại. Chỉ mưa.            │
│                                                                 │
│ Visual:      Linh chạy vào mái hiên. Tóc ướt đuôi.              │
│              Tay phải cầm ô xanh. Dừng lại, thở nhẹ.           │
│              Cô nhìn về phía Minh (off-screen).                  │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 3                           │
│                 Lý do: báo hiệu "có người mới" vào câu chuyện.  │
│                 Hard cut tạo sự chú ý.                          │
│                                                                 │
│ Transition OUT: sound_bridge (J-cut) — sang panel 4b            │
│                 Lời "Anh cần không?" bắt đầu 0.3s trước          │
│                 khi hình cắt sang panel 4b.                      │
│                 Lý do: tạo cảm giác "vừa thấy vừa nghe"          │
│                 — đúng với trải nghiệm thực tế: người vừa       │
│                 xuất hiện vừa nói.                               │
│                                                                 │
│ Film reason: Panel câm establish. Khán giả cần 3s để:           │
│   1. Nhận ra "có người mới"                                     │
│   2. Đọc trạng thái: tóc ướt → cô ấy vừa chạy dưới mưa         │
│   3. Thấy vật: ô xanh → đây là người có ô                       │
│ Không có thoại trong panel này để khán giả tập trung            │
│ QUAN SÁT, không bị phân tâm bởi lời nói.                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 4b — "...Linh nhẹ nhàng hỏi: 'Anh cần không?'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 4b                                                        │
│                                                                 │
│ Purpose:     action_plus_dialogue — Linh đưa ô + nói            │
│ Shot:        Medium Two-Shot                                    │
│ Duration:    4s                                                 │
│                                                                 │
│ Audio:       dialogue → "Anh cần không?"                        │
│              + ambient mưa nền (thấp)                           │
│                                                                 │
│ Visual:      Linh đưa ô về phía Minh. Minh (phải frame)        │
│              quay sang nhìn Linh. Cả hai dưới mái hiên,         │
│              mưa phía sau.                                      │
│                                                                 │
│ Transition IN:  sound_bridge (J-cut) — từ panel 4a              │
│                 "Anh cần" bắt đầu ở 0.3s cuối panel 4a,         │
│                 "không?" kết thúc ở panel 4b.                    │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 5 (B-roll tay + ô)        │
│                 Lý do: câu hỏi đã dứt. Cần hard cut để          │
│                 tách "lời nói" khỏi "chi tiết" (bàn tay cầm ô). │
│                 Nếu sound bridge, khán giả nghĩ Linh còn nói    │
│                 trong khi thấy insert tay → confusion.          │
│                                                                 │
│ Film reason: Action + dialogue merged trong 1 panel.            │
│ Medium Two-Shot cho thấy CẢ 2 người: Linh nói + Minh phản ứng  │
│ Tránh: close-up mất context, hoặc split thành 3 panel dư thừa.  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 5 — "[Cận cảnh những ngón tay thon thả của Linh cầm chiếc ô...]"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 5                                                         │
│                                                                 │
│ Purpose:     b_roll_detail — focus vào vật (ô)                 │
│ Shot:        ECU Insert                                        │
│ Duration:    2s                                                 │
│                                                                 │
│ Audio:       silent_ambient → mưa nhẹ, âm lượng thấp           │
│              (để chuẩn bị cho khán giả nghe Minh nói ở panel 6) │
│                                                                 │
│ Visual:      Tay Linh cầm ô xanh, vài giọt mưa trên vải.       │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 4b                          │
│                 Lý do: câu "Anh cần không?" đã dứt. Cần tách    │
│                 lời nói khỏi chi tiết vật thể.                   │
│                                                                 │
│ Transition OUT: sound_bridge — sang panel 6                     │
│                 "Của em à?" bắt đầu 0.3s trước khi hết panel 5  │
│                 (Minh hỏi, dù hình ảnh đang là tay + ô).         │
│                 Lý do: tạo cảm giác "Minh vừa nhìn thấy ô       │
│                 vừa hỏi" — tự nhiên.                             │
│                                                                 │
│ Film reason: Detail insert giữa 2 lời thoại. Cho khán giả      │
│ thấy RÕ chiếc ô — vật trung tâm của câu chuyện.                │
│ Sound bridge OUT cho phép Minh "đặt câu hỏi" khi khán giả      │
│ vẫn đang nhìn vào ô → liên kết "thấy" + "hỏi".                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 6 — "Minh quay lại nhìn cô một giây, Minh hỏi: 'Của em à?'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 6                                                         │
│                                                                 │
│ Purpose:     react_and_speak — Minh phản ứng + hỏi              │
│ Shot:        Medium Close-Up                                   │
│ Duration:    4s                                                 │
│                                                                 │
│ Audio:       dialogue → "Của em à?"                             │
│              + ambient mưa nền thấp                             │
│                                                                 │
│ Visual:      Minh quay lại nhìn Linh. Mắt hơi ngạc nhiên.      │
│              Chờ 1 giây (acting beat: "một giây" = surprise).  │
│              Rồi hỏi.                                          │
│                                                                 │
│ Transition IN:  sound_bridge (J-cut) — từ panel 5               │
│                 "Của em" bắt đầu 0.3s cuối panel 5.             │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 7 (CU Linh cười)          │
│                 Lý do: câu hỏi dứt. Cần hard cut để khán giả   │
│                 tập trung vào phản ứng CỦA LINH ở panel 7.     │
│                 Nếu bridge, cảm xúc của Minh "dính" sang Linh.  │
│                                                                 │
│ Film reason: "Một giây" trong truyện là acting BEAT.           │
│ Video 4s: quay (1s) + chờ + ngạc nhiên (1s) + hỏi (1.5s) + dư  │
│ Medium CU vì chỉ cần thấy mặt + vai Minh, không cần full body.  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 7 — "[Linh mỉm cười, đôi mắt sáng lên dưới màn mưa lạnh]"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 7                                                         │
│                                                                 │
│ Purpose:     emotion_reaction — Linh vui vì được hỏi           │
│ Shot:        Close-Up                                          │
│ Duration:    3s                                                 │
│                                                                 │
│ Audio:       silent_ambient → mưa nhẹ, âm lượng thấp hơn       │
│              (thu môi trường lại để focus vào cảm xúc)          │
│                                                                 │
│ Visual:      Linh mỉm cười, mắt sáng lên. Mưa mờ phía sau.     │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 6                           │
│                 Lý do: cần cách ly khỏi câu hỏi của Minh        │
│                 để khán giả tập trung vào nụ cười của Linh.     │
│                                                                 │
│ Transition OUT: match_cut_audio — sang panel 8                  │
│                 Tiếng mưa quay lại âm lượng bình thường.        │
│                 Lý do: panel 8 (Linh chỉ balo) cùng không gian  │
│                 cùng âm thanh nền → match cut audio tự nhiên.   │
│                                                                 │
│ Film reason: Close-up cảm xúc. Không thoại. Cho khán giả       │
│ thấy Linh HẠNH PHÚC khi được Minh hỏi. 3s đủ để cảm nhận.      │
│ Hard cut từ panel 6 để không bị "nhiễu" giọng Minh.             │
└─────────────────────────────────────────────────────────────────┘
```

**Lưu ý quan trọng**: Panel 7 (câm) nối với panel 6 (có thoại) cần HARD CUT — đây là rule 3 từ film guide. Nếu dùng sound bridge, audio của Minh làm loãng nụ cười của Linh.

---

### Panel 8 — "Linh tay chỉ vào chiếc balo, Linh nói: 'Em có hai cái.'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 8                                                         │
│                                                                 │
│ Purpose:     gesture_and_dialogue                              │
│ Shot:        Medium Shot                                        │
│ Duration:    3s                                                 │
│                                                                 │
│ Audio:       dialogue → "Em có hai cái." + mưa nền             │
│                                                                 │
│ Visual:      Linh chỉ vào balo. Mưa phía sau.                   │
│              (1 người, Medium Shot, không cần Two-Shot           │
│               vì Minh không phản ứng gì quan trọng ở đây)        │
│                                                                 │
│ Transition IN:  match_cut_audio — từ panel 7                    │
│                 Tiếng mưa liên tục (panel 7 câm → panel 8 có   │
│                 thoại). Lý do: tránh cảm giác "bị cắt" vì       │
│                 panel 7 là emotion CU, panel 8 đổi góc máy.     │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 9                         │
│                 Lý do: câu "Em có hai cái" dứt. Panel 9 là     │
│                 câu khác (ngập ngừng) + góc máy Medium CU.      │
│                 Hard cut tách 2 ý thoại khác nhau.              │
│                                                                 │
│ Film reason: Gesture + dialogue nhẹ, 1 panel đủ.               │
│ Chỉ balo là hành động nhỏ, không cần establish riêng.          │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 9 — "Cô ngập ngừng một chút, ánh mắt né tránh: 'Hay... anh đi cùng hướng nào?'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 9                                                         │
│                                                                 │
│ Purpose:     acting_plus_dialogue — ngập ngừng LÀ nội dung     │
│ Shot:        Medium Close-Up                                   │
│ Duration:    5s (dài hơn vì có ngập ngừng + "Hay...")          │
│                                                                 │
│ Audio:       dialogue → "Hay... anh đi cùng hướng nào?"        │
│              Có khoảng trống "..." giữa Hay và anh.             │
│              Mưa nền rất thấp (focus vào giọng nói).           │
│                                                                 │
│ Visual:      Linh nhìn xuống → đưa mắt đi → nhìn lên → hỏi.    │
│              3 acting beat trong 1 panel (4-5s).                │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 8                           │
│                 Lý do: "Em có hai cái" (dứt khoát, tự tin)      │
│                 → "Hay..." (ngập ngừng). Hard cut tạo contrast  │
│                 giữa 2 trạng thái cảm xúc của Linh.             │
│                 Nếu bridge, mất sự thay đổi tâm trạng.          │
│                                                                 │
│ Transition OUT: sound_bridge — sang panel 10 (atmosphere)       │
│                 Tiếng mưa TĂNG DẦN ở 1s cuối panel 9,           │
│                 kéo dài sang panel 10.                           │
│                 Lý do: panel 10 là khoảng lặng. Cần âm thanh    │
│                 dẫn dắt khán giả vào sự im lặng.                │
│                                                                 │
│ Film reason: Đây là panel quan trọng nhất về DIỄN XUẤT.        │
│ "Ngập ngừng" + "mắt né tránh" = Linh ngại ngùng, không phải   │
│ hành động độc lập. KHÔNG tách thành 3 panel, nhưng duration    │
│ phải dài hơn (5s) để acting có thời gian.                      │
└─────────────────────────────────────────────────────────────────┘
```

**Phát hiện**: "Ngập ngừng" không phải action (không cần tách panel), nhưng cũng không thể merge 100% vào dialogue nếu duration vẫn 3s. Cần **tăng duration** thay vì tách panel.

---

### Panel 10 — "[Bầu không khí giữa hai người hơi chùng xuống, chỉ còn tiếng mưa rơi trên mái hiên]"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 10                                                        │
│                                                                 │
│ Purpose:     atmosphere_beat — khoảng lặng cho không khí thở  │
│ Shot:        Medium Two-Shot                                    │
│ Duration:    4s                                                 │
│                                                                 │
│ Audio:       silent_ambient → mưa tí tách, âm lượng tăng dần  │
│              ở 1s cuối (dẫn vào sound bridge sang panel 11)     │
│                                                                 │
│ Visual:      Hai người đứng im lặng dưới mái hiên.             │
│              Linh nhìn xuống. Minh nhìn Linh.                    │
│              Mưa rơi giữa họ.                                    │
│                                                                 │
│ Transition IN:  sound_bridge — từ panel 9                       │
│                 Tiếng mưa tăng dần từ 1s cuối panel 9.          │
│                                                                 │
│ Transition OUT: sound_bridge — sang panel 11                    │
│                 VO "Thực ra mình không cần..." bắt đầu 0.5s     │
│                 cuối panel 10.                                   │
│                 Lý do: 4s im lặng là dài. Cần voice dẫn vào.    │
│                                                                 │
│ Film reason: Khoảng lặng CÓ CHỦ ĐÍCH. Không phải "chờ cho đủ  │
│ panel". Cho khán giả thời gian cảm nhận sự ngại ngùng giữa     │
│ 2 người sau câu hỏi của Linh.                                   │
│ Sound bridge OUT vì 4s im lặng → quá dài nếu hard cut.          │
└─────────────────────────────────────────────────────────────────┘
```

**Rule từ film guide dòng 146**: "Panel câm CÀNG DÀI thì CÀNG CẦN sound bridge, không phải hard cut." Panel 10 = 4s câm → sound bridge bắt buộc.

---

### Panel 11 — "Minh nhìn sang hướng cô gái chỉ. Trong đầu anh: 'Thực ra mình không cần đi đâu gấp...'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 11                                                        │
│                                                                 │
│ Purpose:     action_plus_inner_voice — inner monologue DÀI     │
│ Shot:        Medium Close-Up                                   │
│ Duration:    6s (voiceover dài ~20 từ ≈ 5-6s)                  │
│                                                                 │
│ Audio:       inner_voice → "Thực ra mình không cần đi đâu      │
│              gấp. Chỉ vừa uống xong ly cà phê và định ngồi     │
│              thêm một lúc chờ tạnh mưa thôi."                   │
│              Mưa nền rất thấp.                                   │
│                                                                 │
│ Visual:      Minh nhìn theo hướng Linh chỉ. Mắt moving nhẹ,    │
│              micro-expressions (suy nghĩ, do dự).               │
│              Môi KHÔNG mấp máy.                                 │
│                                                                 │
│ Transition IN:  sound_bridge — từ panel 10                      │
│                 VO bắt đầu 0.5s cuối panel 10.                  │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 12                        │
│                 Lý do: VO dài kết thúc. Panel 12 là spoken      │
│                 dialogue (Minh nói thật). Cần hard cut để       │
│                 phân biệt "nghĩ" (VO) và "nói" (dialogue).     │
│                 Nếu bridge, khán giả không biết đã chuyển từ    │
│                 voiceover sang lời thật.                        │
│                                                                 │
│ Film reason: Inner monologue dài. 6s = 1 câu văn dài.          │
│ Môi không mấp máy → video gen KHÔNG được tạo lip-sync.         │
│ Hard cut OUT = tín hiệu "hết nghĩ, bắt đầu nói".               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 12 — "Minh quay sang nhìn Linh và thản nhiên nói: 'Anh đi về phía Công viên Thống Nhất.'"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 12                                                        │
│                                                                 │
│ Purpose:     action_plus_dialogue — Minh nói dối "thản nhiên"  │
│ Shot:        Medium Two-Shot                                    │
│ Duration:    3s                                                 │
│                                                                 │
│ Audio:       dialogue → "Anh đi về phía công viên Thống Nhất." │
│              + mưa nền                                          │
│                                                                 │
│ Visual:      Minh quay sang Linh, mặt tỉnh bơ, nói.            │
│              Linh (phải frame) nhìn Minh.                       │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 11                          │
│                 Lý do: phân biệt inner voice → spoken dialogue.  │
│                                                                 │
│ Transition OUT: hard_cut — sang panel 13                        │
│                 Lý do: câu nói dứt, chuyển cảnh (bắt đầu đi).   │
│                 "Thản nhiên" = kết thúc dứt khoát.              │
│                                                                 │
│ Film reason: Hành động quay người là minor motion (Minh đã     │
│ trong scene) → merge với dialogue. "Thản nhiên" là acting      │
│ direction, không phải action riêng.                              │
└─────────────────────────────────────────────────────────────────┘
```

---

### Panel 13 — "[Góc máy từ phía sau, bóng hai người vội vã bước đi... Đi được một đoạn, Minh cười tự giễu: 'Đó là hướng ngược lại...']"

```
┌─────────────────────────────────────────────────────────────────┐
│ Panel 13                                                        │
│                                                                 │
│ Purpose:     closing_with_sound_bridge — kết phim              │
│ Shot:        Wide Shot                                          │
│ Duration:    6s                                                 │
│                                                                 │
│ Audio:       silent_ambient → mưa + bước chân (0-3s)           │
│              → CHUYỂN → inner_voice (3-6s): "Đó là hướng       │
│              ngược lại với chỗ mình ở cơ mà."                    │
│              Đây là sound bridge NỘI TẠI (internal sound bridge)│
│              — visual không đổi, audio chuyển lớp.              │
│                                                                 │
│ Visual:      (0-6s) Bóng 2 người đi chung ô xanh vào phố mưa.  │
│              Góc từ phía sau. Càng đi càng xa.                   │
│              (3s-6s) Minh có thể hơi cúi đầu, cười nhẹ.         │
│                                                                 │
│ Transition IN:  hard_cut — từ panel 12                          │
│                 Lý do: chuyển không gian (mái hiên → phố).      │
│                 Hard cut báo hiệu scene mới.                     │
│                                                                 │
│ Transition OUT: (panel cuối) — fade_to_black hoặc cut_to_black │
│                 Audio kéo dài thêm 1s sau khi hình tối.         │
│                                                                 │
│ Film reason: Kết phim kiểu poetic. Sound bridge nội tại:       │
│ 3s đầu: chỉ mưa + bước chân = khán giả thấy họ đi               │
│ 3s sau: voiceover "Đó là hướng ngược lại..." = punchline        │
│ Không cắt cảnh khi audio chuyển (internal sound bridge).        │
│                                                                 │
│ Giải thích sound bridge nội tại:                                │
│ visual ────────────────────────────────────── 6s                 │
│         [bóng 2 người đi trong mưa]                             │
│ audio  ┌──────────────┬──────────────────── 6s                  │
│         [tiếng mưa]   [VO: Hướng ngược lại...]                   │
│                       ↑ 3s                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Tổng hợp Film Analysis

### 3a. Bảng đầy đủ

| # | Purpose | Shot | Audio | Dur | Trans IN | Trans OUT |
|:-:|:--------|:----:|:-----:|:---:|:---------|:----------|
| 1 | establish_scene | Wide | ambient | 4s | — | match_cut_audio |
| 2 | b_roll_poetic | ECU | ambient | 2s | match_cut_audio | **sound_bridge** |
| 3 | action_plus_inner_voice | Medium | **inner_voice** | 4s | sound_bridge | **hard_cut** |
| 4a | **establish_character** | Medium | ambient | 3s | hard_cut | **sound_bridge (J-cut)** |
| 4b | action_plus_dialogue | Medium Two-Shot | **dialogue** | 4s | sound_bridge | hard_cut |
| 5 | b_roll_detail | ECU | ambient | 2s | hard_cut | **sound_bridge** |
| 6 | react_and_speak | Medium CU | **dialogue** | 4s | sound_bridge | hard_cut |
| 7 | **emotion_reaction** | CU | ambient | 3s | hard_cut | match_cut_audio |
| 8 | gesture_and_dialogue | Medium | **dialogue** | 3s | match_cut_audio | hard_cut |
| 9 | **acting_plus_dialogue** | Medium CU | **dialogue** | 5s | hard_cut | **sound_bridge** |
| 10 | **atmosphere_beat** | Medium Two-Shot | ambient | 4s | sound_bridge | **sound_bridge** |
| 11 | action_plus_inner_voice | Medium CU | **inner_voice** | 6s | sound_bridge | hard_cut |
| 12 | action_plus_dialogue | Medium Two-Shot | **dialogue** | 3s | hard_cut | hard_cut |
| 13 | **closing_sound_bridge** | Wide | ambient→**inner** | 6s | hard_cut | fade_out |

### 3b. Phát hiện chính

1. **Sound bridge xuất hiện 6/13 lần** — là kỹ thuật chủ đạo để nối panel có audio transition
2. **Hard cut = 8/13 lần** — dùng để: đổi nhân vật, đổi không gian, phân biệt inner↔spoken, tách cảm xúc
3. **Match cut = 3/13 lần** — chỉ dùng khi audio nền liên tục (cùng tiếng mưa)
4. **6 panel câm** (establish, B-roll, emotion, atmosphere) — tất cả đều cần transition khác nhau: không có "mặc định hard cut"
5. **Không có panel nào dùng L-cut** — thể loại slice-of-life không cần kỹ thuật này

### 3c. 3 film rules mới từ phân tích này

```
RULE A — Silent → Dialogue luôn cần sound bridge (J-cut), không hard cut.
          Ngoại lệ: khi silent panel là establish_character (4a) → hard cut để báo "người mới".

RULE B — Inner Voice → Spoken Dialogue luôn cần hard cut.
          Khán giả cần biết rõ "đang nghĩ" khác với "đang nói".

RULE C — Panel câm > 3s (atmosphere, emotion) cần sound bridge cả 2 đầu.
          Quá dài để hard cut, quá quan trọng để match cut.
```

### 3d. Files cần thay đổi (mở rộng từ bản trước)

| File | Thay đổi |
|------|:---------|
| `agent_storyboard_plan.en.txt` | Thêm `purpose` + `transition_out` vào mỗi panel. Xoá rule 3-4 shots cũ. Thêm film rules A/B/C và 4-nhịp rule |
| `agent_storyboard_detail.en.txt` | Dùng `purpose` + `transition_out` để quyết định shot_type, duration, video_prompt (đặc biệt là audio layering) |
| `agents/agent_acting_direction.en.txt` | acting phải tương thích với `purpose` (acting_plus_dialogue khác gesture_and_dialogue về diễn xuất) |
| `voice_analysis.en.txt` | Không cần (vì audio_type được xác định trước ở Phase 1) |
| `prompt_refiner.en.txt` | Dùng `transition_out` để quyết định video_prompt có sound bridge hay không |
| **Source code** | **Cần thêm** `purpose` + `transition_out` + `audio_type` vào type StoryboardPanel + database + persistence |
