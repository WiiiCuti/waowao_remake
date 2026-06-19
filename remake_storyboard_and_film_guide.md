# Panel Transition Rules — Quy tắc nối Panel Câm ↔ Panel Thoại

> Tài liệu này có 2 phần: **Phần A** để người đọc hiểu bản chất (kèm ví dụ),
> **Phần B** là rule chuẩn hoá để chèn vào file hệ thống cho model áp dụng.

---

# PHẦN A — HỌC ĐỂ HIỂU

## A.0. Câu hỏi gốc cần tự hỏi trước mọi transition

> **KHÔNG hỏi**: "Panel này câm hay có thoại?"
> **HÃY hỏi**: "Cảm xúc / mục đích của panel SAU cần khán giả đang ở trạng thái nào khi bước vào nó?"

4 kỹ thuật nối tồn tại để trả lời 4 kiểu trạng thái khác nhau:

| Kỹ thuật | Trạng thái khán giả cần có khi bước vào panel sau |
|---|---|
| **Hard Cut** | Bị ngắt đột ngột — để chú ý dồn lại, hoặc hiểu ngay có thay đổi lớn (thời gian/không gian) |
| **Match Cut** | Mượt mà vì có "điểm neo" chung (hình ảnh hoặc âm thanh) — không nhận ra đang chuyển panel |
| **Sound Bridge** | Được âm thanh "dẫn đường" trước khi mắt thấy hình — tạo cảm giác liên tục về suy nghĩ/lời nói |
| **J-cut / L-cut** | Biến thể của sound bridge — âm đến trước hình (J) hoặc âm kéo dài sau khi hình đã đổi (L) |

---

## A.1. HARD CUT — khi nào dùng

**Định nghĩa**: Cắt dứt khoát, không có gì "bắc cầu" giữa 2 panel — cả hình và âm đều đổi cùng lúc.

**Dùng khi:**
- Panel sau cần đứng một mình để khán giả "đọng" cảm xúc (không bị audio panel trước làm loãng)
- Có thay đổi lớn về thời gian, không gian, hoặc trạng thái nhận thức (flashback, mộng, twist)
- Muốn tạo cảm giác giật, bất ngờ có chủ đích

### Ví dụ 1 — Hard cut để giữ cảm xúc (panel 6 → 7 trong truyện mẫu)

```
Panel 6 (Medium CU, có thoại): Minh hỏi "Của em à?" — câu dứt, KHÔNG để âm vang kéo dài
Panel 7 (CU, câm): Linh mỉm cười, mắt sáng lên

→ HARD CUT, audio drop hoàn toàn.
Lý do: nếu để câu "Của em à?" vang/echo sang panel 7, khán giả vẫn còn
"nghe" Minh trong đầu → làm loãng khoảnh khắc cười của Linh.
Cắt dứt khoát giúp 100% chú ý dồn vào nét cười.
```

### Ví dụ 2 — Hard cut vì đổi thời gian/không gian (flashback)

```
Panel X (câm, hiện tại): Minh nhìn mưa, mắt thất thần, 3s
Panel Y (flashback — cảnh nắng, ký ức cũ): bất kể câm hay có thoại

→ HARD CUT TUYỆT ĐỐI.
Lý do: nối êm (match cut/sound bridge) sẽ khiến khán giả nhầm
đây vẫn là hiện tại. Hard cut báo hiệu ngay "đây là chỗ khác/lúc khác".
```

### Ví dụ 3 — Hard cut để tạo cú giật chủ đích (jump scare / twist nhẹ)

```
Panel A (câm, êm): nhân vật đi bộ trong hành lang tối, nhạc nhẹ
Panel B (có thoại, đột ngột): ai đó bật đèn, hét lên "Bùm!"

→ HARD CUT, không bridge, đổi cả ánh sáng + âm lượng cùng lúc.
Lý do: chính SỰ ĐỘT NGỘT là hiệu ứng mong muốn.
```

---

## A.2. MATCH CUT — khi nào dùng

**Định nghĩa**: Hai panel có điểm neo chung (hình ảnh giống nhau về hình dạng/chuyển động, hoặc âm thanh nền liên tục không đổi) → chuyển tiếp mượt mà vì mắt/tai khán giả "bắt" được điểm nối.

**Dùng khi:**
- Hai panel câm liên tiếp cùng chủ đề (tránh cảm giác lặp khô khan)
- Có vật thể/hành động lặp giữa 2 khung hình (cửa mở → cửa ở cảnh khác mở ra)
- Âm thanh nền (mưa, nhạc, tiếng ồn phố) xuyên suốt không đổi qua 2 panel

### Ví dụ 1 — Match cut qua âm thanh liên tục (panel 1 → 2 trong truyện mẫu)

```
Panel 1 (Wide, câm): Minh đứng dưới mái hiên, mưa rơi — kết thúc, tiếng mưa to dần
Panel 2 (ECU, câm): Giọt mưa rơi xuống vũng nước — bắt đầu, cùng âm lượng mưa, không đổi

→ MATCH CUT qua "audio liên tục", không phải hình ảnh.
Đây gọi là Audio Match Cut — rất hay bị bỏ qua khi mọi người
chỉ nghĩ match cut là "hình nối hình".
```

### Ví dụ 2 — Match cut qua hình ảnh (kinh điển trong điện ảnh)

```
Panel A: Cận cảnh bánh xe đạp đang quay tròn
Panel B: Cận cảnh đồng hồ treo tường, kim giây quay tròn

→ MATCH CUT vì hai hình tròn xoay có cùng "nhịp chuyển động" —
mắt khán giả nối liền 2 hình dù nội dung khác hẳn.
```

### Ví dụ 3 — Lỗi SAI nếu không dùng match cut

```
Panel A (câm): Minh đứng nhìn mưa, 4s
Panel B (câm): Cận giọt mưa rơi, 2s
transition: HARD CUT (không có gì neo lại)

→ SAI. Hai panel câm nối hard cut với nhau dễ tạo cảm giác
"phim tài liệu lặp lại", vì không có gì dẫn mắt khán giả từ A sang B.
Sửa: dùng match cut qua tiếng mưa liên tục.
```

---

## A.3. SOUND BRIDGE — khi nào dùng

**Định nghĩa**: Audio của panel SAU (lời thoại, voiceover, tiếng động báo hiệu) bắt đầu vang lên TRƯỚC khi hình ảnh cắt sang panel đó — đè lên 0.3–1s cuối của panel trước.

**Dùng khi:**
- Panel câm trước đó là establish character / atmosphere / B-roll, và panel sau có lời thoại hoặc voiceover
- Panel câm kéo dài (>5s) — nếu cắt cứng sẽ bị giật vì khán giả chưa "thoát" khỏi sự im lặng
- Cần dẫn dắt cảm xúc đi trước hình ảnh (ví dụ: suy nghĩ "len vào" tự nhiên)

### Ví dụ 1 — Sound bridge dẫn vào inner voice (panel 2 → 3 trong truyện mẫu)

```
Panel 2 (ECU mưa, câm, 2s): giọt mưa đập xuống vũng nước
Panel 3 (Medium, voiceover): Minh chép miệng, VO "Lại quên ô rồi..."

→ SOUND BRIDGE: VO bắt đầu vang lên 0.5s TRƯỚC khi hình cắt hẳn
sang panel 3, đè lên 0.5s cuối của panel 2.
Lý do: tạo cảm giác suy nghĩ "len vào" đầu khán giả một cách tự nhiên,
như chính khán giả cũng vừa nghĩ ra điều đó.
```

### Ví dụ 2 — Sound bridge bắt buộc vì panel câm quá dài

```
Panel 10 (Two-Shot, câm, 6s — kéo dài hơn bản gốc 4s để nhấn ngại ngùng):
  Hai người nhìn nhau không nói, mưa tí tách
Panel 11 (Medium CU, voiceover): Minh suy nghĩ

→ SOUND BRIDGE bắt buộc.
Lý do: 6s im lặng là RẤT dài với khán giả. Nếu cắt cứng,
cảm giác "đứng hình". Cần tiếng mưa TĂNG DẦN volume ở 1–1.5s cuối
panel 10, rồi voiceover "len" vào nhẹ trước khi hình đổi hẳn.
Quy tắc: panel câm CÀNG DÀI thì CÀNG CẦN sound bridge, không phải hard cut.
```

### Ví dụ 3 — Sound bridge khi establish nhân vật mới (panel 4a → 4b)

```
Panel 4a (Medium, câm): Linh chạy vào mái hiên, tóc ướt, dừng lại thở nhẹ
Panel 4b (Medium Two-Shot, có thoại): Linh đưa ô, hỏi "Anh cần không?"

→ SOUND BRIDGE / J-CUT: lời "Anh cần không?" bắt đầu vang lên
0.3–0.5s trước khi cắt hẳn sang frame 4b, đè lên cuối 4a.
Lý do: tạo cảm giác "vừa thấy vừa nghe" liền mạch — đúng với
trải nghiệm tự nhiên khi một người vừa xuất hiện vừa nói.
```

---

## A.4. J-CUT và L-CUT — phân biệt 2 biến thể

**J-cut**: Âm thanh của shot B bắt đầu TRƯỚC khi hình ảnh chuyển sang shot B (âm đi trước hình). Hình chữ "J" — phần đuôi kéo dài bên trái (audio bắt đầu sớm).

**L-cut**: Âm thanh của shot A tiếp tục vang sau khi hình ảnh đã chuyển sang shot B (âm kéo dài sau khi hình đổi). Hình chữ "L" — phần đáy kéo dài bên phải (audio kết thúc muộn).

### Ví dụ phân biệt

```
J-CUT — nghe trước, thấy sau:
  [Panel A: hình ảnh phòng họp im lặng]
  [Âm thanh tiếng gõ cửa bắt đầu — TRONG KHI vẫn đang xem panel A]
  [Panel B: hình ảnh cửa mở, người bước vào]
  → Khán giả NGHE tiếng gõ cửa trước khi THẤY cửa mở.

L-CUT — thấy trước, nghe vẫn còn:
  [Panel A: Minh đang nói "Anh đi về phía công viên..."]
  [Panel B: hình ảnh đã chuyển sang cảnh hai người đi bộ]
  [Âm thanh câu nói của Minh ở Panel A vẫn còn vang vài từ cuối]
  → Khán giả THẤY cảnh mới trước khi câu nói cũ kết thúc hẳn.
```

→ Trong truyện mẫu, panel 13 (kết — "sound bridge nội tại") thực chất là
dạng **L-cut mở rộng trong cùng 1 panel**: hình ảnh (bóng 2 người đi)
giữ nguyên, nhưng audio chuyển lớp từ "tiếng mưa" sang "voiceover Minh".

---

## A.5. Bảng quyết định nhanh (tổng hợp)

| Yếu tố thay đổi giữa 2 panel | Kỹ thuật nối | Vì sao |
|---|---|---|
| Cùng nhân vật, cùng không gian, sắp có thoại/VO | Sound bridge / J-cut | Dẫn cảm xúc đi trước hình |
| Cùng chủ đề hình ảnh hoặc âm thanh nền liên tục | Match cut | Có điểm neo, tránh giật |
| Cần khán giả "đọng" cảm xúc sau câu thoại/biểu cảm quan trọng | Hard cut (không bridge) | Tránh audio cũ làm loãng cảm xúc mới |
| Đổi thời gian/không gian/nhận thức (flashback, mộng, twist) | Hard cut tuyệt đối | Báo hiệu rõ "đây là chỗ khác" |
| Panel câm rất dài (>5s) trước panel thoại | Sound bridge bắt buộc | Tránh giật vì khán giả chưa thoát khỏi im lặng |
| Lời thoại cũ cần "đuôi" sang cảnh mới | L-cut | Tạo cảm giác cảnh mới đến nhanh hơn câu nói |

---

# PHẦN B — RULE CHUẨN HOÁ CHO MODEL

> Chèn block này vào `agent_storyboard_detail.en.txt` (chỗ quyết định duration/transition).
> Field mới cần thêm cho MỌI panel: `transition_out`.

```yaml
# ============================================
# PANEL TRANSITION RULES (transition_out field)
# ============================================
# Mỗi panel PHẢI có field transition_out, chọn 1 trong 5 giá trị:
#   - hard_cut
#   - hard_cut_absolute      (dùng riêng cho đổi thời gian/không gian/nhận thức)
#   - match_cut_visual
#   - match_cut_audio
#   - sound_bridge
#   - j_cut
#   - l_cut

RULE 1 — Default panel câm → panel câm (cùng chủ đề hình/âm):
  IF panel_current.audio_type == "silent_ambient"
     AND panel_next.audio_type == "silent_ambient"
     AND (cùng background sound HOẶC cùng motif hình ảnh):
    transition_out = match_cut_audio (hoặc match_cut_visual nếu có vật thể neo)
  ELSE:
    transition_out = hard_cut  # tránh 2 panel câm rời rạc dùng hard cut trừ khi có lý do (xem RULE 4)

RULE 2 — Panel câm (establish/atmosphere/B-roll) → panel có dialogue hoặc inner_voice:
  IF panel_current.purpose IN ["establish_character", "atmosphere", "b_roll"]
     AND panel_next.audio_type IN ["dialogue", "inner_voice"]:
    transition_out = sound_bridge
    # Audio của panel_next bắt đầu vang sớm 0.3–0.8s trước cut.
    # Annotate panel_current với: "tail_audio_cue: [mô tả audio sắp tới]"

RULE 3 — Panel có dialogue quan trọng / panel có emotion_beat → panel câm kế tiếp:
  IF panel_current.purpose == "key_dialogue_line"
     AND panel_next.purpose == "emotion_reaction"
     AND panel_next.audio_type == "silent_ambient":
    transition_out = hard_cut
    # KHÔNG bridge. Audio của panel_current PHẢI dừng dứt khoát,
    # không để vang/echo sang panel sau — tránh làm loãng cảm xúc mới.

RULE 4 — Thay đổi thời gian / không gian / trạng thái nhận thức:
  IF panel_next.scene_type IN ["flashback", "dream", "twist", "time_skip", "location_change_abrupt"]:
    transition_out = hard_cut_absolute
    # Override mọi rule khác. Không bao giờ dùng match cut/sound bridge ở đây.

RULE 5 — Panel câm có duration > 5s, panel sau có dialogue/inner_voice:
  IF panel_current.duration_seconds > 5
     AND panel_current.audio_type == "silent_ambient"
     AND panel_next.audio_type IN ["dialogue", "inner_voice"]:
    transition_out = sound_bridge  # BẮT BUỘC, override default hard_cut
    # Annotate: ambient audio (rain, music, noise) tăng dần volume
    # ở 1–1.5s cuối panel_current trước khi audio panel_next chồng vào.

RULE 6 — Dialogue cần "đuôi" sang cảnh tiếp theo (L-cut):
  IF panel_current.audio_type == "dialogue"
     AND panel_next.visual đã chuyển hẳn (đổi không gian/góc máy lớn)
     AND ý nghĩa câu nói cần "nối" cảm xúc sang cảnh mới:
    transition_out = l_cut
    # Vài từ cuối câu thoại của panel_current tiếp tục vang
    # sau khi hình đã cắt sang panel_next.

RULE 7 — Sound bridge nội tại trong 1 panel (không cắt cảnh nhưng đổi lớp audio):
  IF panel.visual không đổi (giữ nguyên khung hình/hành động)
     AND audio chuyển từ ambient sang inner_voice/dialogue trong cùng panel:
    transition_out = sound_bridge  (gắn cờ "internal: true")
    # Ghi rõ trong video_prompt: "audio layer shifts from [ambient] to [VO/dialogue]
    # while visual continues uninterrupted."
```

### Output mẫu cho 1 panel (để model điền đúng format)

```yaml
panel_id: 2
shot_type: ECU Insert
purpose: b_roll
duration_seconds: 2
audio_type: silent_ambient
audio_desc: "rain impact on puddle"
transition_out: match_cut_audio
transition_note: "tiếng mưa giữ nguyên âm lượng nối sang panel 1, không đổi"
```

```yaml
panel_id: 3
shot_type: Medium Shot
purpose: action_plus_inner_voice
duration_seconds: 4
audio_type: inner_voice
audio_desc: "VO: Lại quên ô rồi. Lần nào cũng vậy."
transition_in: sound_bridge   # ghi nhận transition ĐẾN panel này từ panel trước
transition_out: hard_cut
transition_note: "VO bắt đầu 0.5s trước cut từ panel 2 (sound bridge); 
  panel 3 kết thúc dứt khoát trước khi cắt sang panel 4a (nhân vật mới)"
```

---

## Tóm tắt 1 dòng để nhớ

> **Panel câm KHÔNG PHẢI "khoảng trống chờ"** — nó luôn cần một lý do điện ảnh để tồn tại,
> và lý do đó quyết định nó nối với panel sau bằng **hard cut** (ngắt cảm xúc),
> **match cut** (có điểm neo chung), hay **sound bridge/J-cut/L-cut** (âm dẫn hình).