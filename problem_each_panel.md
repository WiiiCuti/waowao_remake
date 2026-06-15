# Phân tích pipeline sinh storyboard

## Tổng quan pipeline

```
┌─────────────────────┐
│  1. clips-build      │  LLM cắt toàn bộ tiểu thuyết thành các clip
│  (full novel text)   │  Mỗi clip = 1 đoạn text + location + characters[]
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. orchestrator      │  mapWithConcurrency: mỗi clip xử lý SONG SONG
│                      │
│  Clip 1 ─ Phase 1 (Plan) → Phase 2 (Cine+Acting) → Phase 3 (Detail) → Merge
│  Clip 2 ─ Phase 1 (Plan) → Phase 2 (Cine+Acting) → Phase 3 (Detail) → Merge
│  Clip 3 ─ ...
│
│  ⛔ KHÔNG CÓ DỮ LIỆU NÀO CHẠY TỪ CLIP N-1 SANG CLIP N
│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. voice-analyze     │  LLM phân tích toàn bộ storyboard → voice lines
│  (toàn bộ clip)      │  ⚠️ ĐÂY LÀ BƯỚC DUY NHẤT THẤY TOÀN BỘ CLIP
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. persist           │  Lưu panel vào DB
│                      │  - panelIndex đánh lại từ 0 mỗi clip
│                      │  - syncPanelCharacters: validate + bổ sung missing
└─────────────────────┘
```

---

## Chi tiết mỗi clip được xử lý thế nào

### File: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`

```typescript
const clipPanels = await mapWithConcurrency(clips, concurrency, async (clip, index) => {
```

Mỗi clip nhận các biến sau (dòng 358-373):

| Biến | Nội dung | Phạm vi |
|------|---------|---------|
| `{clip_content}` | Text gốc của clip (hoặc screenplay format) | **Chỉ clip này** |
| `{original_text}` | = clipContent | **Chỉ clip này** |
| `{clip_json}` | JSON object: id, content, characters[], location, props | **Chỉ clip này** |
| `{characters_lib_name}` | Danh sách TÊN tất cả nhân vật trong project | Toàn project |
| `{locations_lib_name}` | Danh sách TÊN tất cả location trong project | Toàn project |
| `{characters_appearance_list}` | List appearance của **chỉ nhân vật xuất hiện trong clip này** | Clip này |
| `{characters_full_description}` | Full description của **chỉ nhân vật xuất hiện trong clip này** | Clip này |
| `{locations_description}` | Description của **chỉ location của clip này** | Clip này |

### Các phase trong một clip

```
Phase 1 (Plan)           ─→ LLM sinh storyboard panels từ text
          │
          ├─→ Phase 2 (Cinematography)  ─→ lighting, composition, camera angle
          │                              (chạy song song với Acting)
          │
          ├─→ Phase 2 (Acting)          ─→ acting directions, movement
          │                              (chạy song song với Cinematography)
          │
          └─→ Phase 3 (Detail)          ─→ shot_type, camera_move, video_prompt
                                            (chạy SAU khi cả 2 phase 2 hoàn thành)
                    │
                    ▼
               Merge: ghép Phase 2 rules + Phase 3 panels
```

**Prompt templates sử dụng:**
- Phase 1: `agent_storyboard_plan.en.txt`
- Phase 2 Cine: `agent_cinematographer.en.txt`
- Phase 2 Acting: `agent_acting_direction.en.txt`
- Phase 3: `agent_storyboard_detail.en.txt`

---

## Continuity TRONG một clip

Prompt `agent_storyboard_plan.en.txt` có các rule continuity nội bộ:

### Appearance persistence (dòng 176-186)
- Default appearance = item đầu tiên trong `{characters_appearance_list}`
- Giữ nguyên outfit xuyên suốt các panel
- Chỉ đổi khi source_text mô tả hành động thay đồ: "changed clothes", "took off her coat", "put on armor"...
- Sau khi đổi → giữ outfit mới cho đến khi có thay đổi tiếp
- Nếu cả clip không có mô tả thay đồ → DÙNG CÙNG MỘT appearance cho tất cả panel

### Character tracking (dòng 152-154)
- Nhân vật sau khi vào scene → tồn tại đến khi rời đi rõ ràng
- Không được "biến mất" giữa chừng
- Chỉ rời scene qua: explicit exit action, cut to extreme close-up, hoặc scene change hoàn toàn

### Spatial anchoring (dòng 219-252)
- Core principle: Mô tả nhân vật dựa trên **góc máy có thể thấy được**
- Wide/Medium shot: phải kể tất cả nhân vật có mặt
- Close-up/Reverse-shot: chỉ những gì camera thấy
- Phải tự check trước khi sinh mỗi panel:
  - Shot này có thể thấy những ai?
  - Đã mô tả hết những người visible chưa?

### Shot transition (dòng 104-107)
- "Smooth transitions between shots; the action from the previous shot carries into the next"
- "Avoid two consecutive shots with exactly identical content"

**⚠️ Tất cả đều là prompt instruction, không có code-level validation.** LLM sai → không ai bắt.

---

## Continuity GIỮA các clip

### Không hề có

Mỗi clip trong `mapWithConcurrency` chạy **hoàn toàn độc lập**. Không có:

- `{previous_clip_json}` — LLM không biết clip trước kết thúc thế nào
- `{previous_panel_state}` — không biết vị trí/trang phục/trạng thái cuối của clip trước
- `{previous_appearance_used}` — không biết nhân vật đang mặc outfit gì ở clip trước

Dữ liệu chia sẻ duy nhất là:
- `{characters_lib_name}` — danh sách tên toàn project (chỉ là tên)
- `{locations_lib_name}` — danh sách tên location toàn project (chỉ là tên)

Ví dụ cụ thể:
```
Clip 1 (đoạn: Zhang San vào phòng, ngồi xuống):
  Panel 1: "Zhang San bước vào Living Room"
  Panel 2: "Zhang San ngồi xuống ghế sofa"
  → Phase 1 output panel: appearance = "Default Appearance"

Clip 2 (đoạn: Zhang San nói chuyện với Li Si):
  Panel 1: "Zhang San đang ngồi ghế sofa, lên tiếng..."
  → Phase 1 output panel: appearance = "Default Appearance" (LLM tự đoán)
  → ⚠️ KHÔNG có cơ chế đảm bảo đây là cùng appearance với Clip 1
```

### Ngoại lệ duy nhất: Voice analysis

Bước voice-analyze (dòng 468-478 trong `script-to-storyboard.ts`) nhận `storyboard_json` từ **toàn bộ clip**:

```typescript
const voicePrompt = buildPrompt({
  promptId: PROMPT_IDS.NP_VOICE_ANALYSIS,
  locale: job.data.locale,
  variables: {
    input: episode.novelText,
    storyboard_json: buildStoryboardJsonFromClipPanels(orchestratorResult.clipPanels),
  },
})
```

`buildStoryboardJsonFromClipPanels` gom tất cả panel từ tất cả clip thành 1 JSON → voice analysis thấy toàn cảnh.

Nhưng voice analysis chỉ dùng thông tin này để **match dialogue line → panel** (ai nói câu nào ở panel nào), không dùng để enforce visual continuity.

---

## Code-level bugs

### Bug 1: Không có cross-clip continuity (architectural gap)

**Mức độ**: 🔴 Nghiêm trọng nếu cùng scene kéo dài qua nhiều clip. Nhẹ nếu mỗi clip là scene khác nhau.

**File**: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:319`

**Mô tả**: `mapWithConcurrency` xử lý clip song song. Không có mechanism pass trạng thái từ clip N-1 sang clip N. Hậu quả:
- Nhân vật có thể đổi outfit đột ngột giữa 2 clip
- Vị trí nhân vật có thể nhảy cóc
- Hành động không liên tục (đang chạy → đang ngồi)

**Workaround hiện tại**: Mỗi clip có `{clip_content}` chứa text gốc → LLM có thể tự suy luận continuity từ nội dung câu chuyện. Nhưng không có dữ liệu cứng từ output của clip trước.

---

### Bug 2: Default fallback tiếng Trung trong persist

**Mức độ**: 🟡 Nhẹ — output lẫn EN/ZH

**File**: `src/lib/workers/handlers/script-to-storyboard-helpers.ts:308-310`

```typescript
shotType: panel.shot_type || '中景',      // '中景' = Medium Shot (Chinese)
cameraMove: panel.camera_move || '固定',  // '固定' = Static (Chinese)
```

Khi LLM không trả về `shot_type` hoặc `camera_move`, fallback là tiếng Trung. Trong khi toàn bộ hệ thống đã chuyển sang default EN.

**Fix**: Đổi thành `'Medium Shot'` và `'Static'`.

---

### Bug 3: Không có code-level validate appearance persistence

**Mức độ**: 🟡 Vừa — LLM dễ hallucinate appearance

**File**: `src/lib/workers/handlers/script-to-storyboard-helpers.ts:297-303`

```typescript
const syncedCharacters = panel.characters
  ? syncPanelCharacters({
      characters: panel.characters,
      description: panel.description || null,
      allCharacterNames,
    })
  : null
```

`syncPanelCharacters` chỉ check:
- Nhân vật có tên trong `description` nhưng thiếu trong `characters[]` → tự thêm vào
- Không hề check `appearance` field có consistent không

Nếu LLM output:
```
Panel 3: characters: [{name: "Zhang San", appearance: "Red Dress"}]
Panel 4: characters: [{name: "Zhang San", appearance: "Blue Gown"}]
```
→ Không có code nào phát hiện hoặc sửa.

---

### Bug 4: Merge Phase 2 + Phase 3 có thể throw

**Mức độ**: 🟢 Hiếm — chỉ khi LLM output sai panel_number

**File**: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:178-210`

```typescript
function mergePanelsWithRules(params) {
  return finalPanels.map((panel, index) => {
    const rules = photographyRules.find((rule) => rule.panel_number === panel.panel_number)
    if (!rules) throw new Error(`Missing photography rule for panel_number=...`)
    const acting = actingDirections.find((item) => item.panel_number === panel.panel_number)
    if (!acting) throw new Error(`Missing acting direction for panel_number=...`)
  })
}
```

Phase 3 output có thể filter bớt panel (dòng 473-475: bỏ panel có description/location nullish). Nếu panel bị filter nhưng Phase 2 rules vẫn còn → không sao (chỉ tìm matching, không bắt 1-1). Nhưng nếu Phase 3 thêm panel (panel_number mới không có trong Phase 2) → throw.

---

### Bug 5: Phase 3 nhận `panels_json` từ Phase 1 (đúng logic, nhưng có thể gây confusion)

**Mức độ**: 🟢 Không phải bug

**File**: `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts:450-451`

```typescript
const phase3Prompt = promptTemplates.phase3DetailTemplate
  .replace('{panels_json}', JSON.stringify(planPanels, null, 2))  // planPanels = Phase 1 output
```

Phase 3 nhận Phase 1 panels để refine, không phải output của Phase 3 trước đó. Điều này đúng logic (Phase 3 thêm shot_type, camera_move, video_prompt vào panel gốc). Nhưng nếu Phase 1 có lỗi thì lỗi cascade sang Phase 3.

---

## Cấu trúc DB sau khi persist

Mỗi clip → 1 `novelPromotionStoryboard` record và N `novelPromotionPanel` records.

Panel numbering:
- Mỗi storyboard (1 clip) có panelIndex riêng: 0, 1, 2...
- Panel giữa các clip KHÔNG liên kết với nhau
- Không có global panel number (tổng thứ tự từ clip 1 → clip N)

Voice lines được match vào panel qua `matchedPanelId` (foreign key).

---

## Prompt templates liên quan

| Prompt file | Dùng cho | Continuity rules |
|------------|---------|-----------------|
| `agent_storyboard_plan.en.txt` | Phase 1 | Appearance persistence, character tracking, spatial anchoring |
| `agent_cinematographer.en.txt` | Phase 2 Cine | Lighting, composition, color tone per panel |
| `agent_acting_direction.en.txt` | Phase 2 Acting | Acting direction, movement per panel |
| `agent_storyboard_detail.en.txt` | Phase 3 | Shot type, camera move, video_prompt, shot progression |
| `agent_storyboard_insert.en.txt` | Insert panel thủ công | Transition giữa 2 panel đã có sẵn |

---

## Kết luận

| Vấn đề | Mức độ | Nguyên nhân |
|--------|--------|------------|
| Cross-clip continuity | 🔴 Nghiêm trọng | `mapWithConcurrency` xử lý độc lập, không pass state |
| Default Chinese fallback | 🟡 Nhẹ | Hardcode '中景'/'固定' trong persist |
| Không validate appearance | 🟡 Vừa | `syncPanelCharacters` chỉ check tên, không check appearance |
| Phase 2/3 merge throw | 🟢 Hiếm | Chỉ xảy ra khi LLM output panel_number sai |
| Prompt nhận Phase 1 input | 🟢 Đúng logic | Không cần fix |

**Pipeline hoạt động ổn trong nội bộ từng clip** nhờ prompt instruction chi tiết. Vấn đề duy nhất thực sự là **cross-clip continuity** — nếu scene kéo dài qua nhiều clip, không có gì đảm bảo tính liên tục giữa chúng.
