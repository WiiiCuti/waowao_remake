# Guide: Thêm Narrator vào Pipeline

## Mục đích

Hiện tại pipeline chỉ gen voice cho panel có hội thoại (dialogue). Panel không có dialogue thì hoàn toàn silent — người xem không nghe được gì.

Giải pháp: thêm **narrator** (người dẫn chuyện). Với panel không có lời thoại, narrator sẽ đọc lại nội dung gốc từ novel (lấy từ `srtSegment` của panel). Narrator voice cũng là TTS — user upload file hoặc chọn từ thư viện, y hệt dialogue.

## Luồng xử lý

```
VOICE_ANALYZE (LLM)
  ├── Dialogue lines (speaker="玄离", isNarration=false, content=lời thoại)
  └── Narration lines (speaker="Narrator", isNarration=true, content="")

VOICE_LINE (TTS)
  ├── Dialogue: TTS với voice binding character
  └── Narration: content = panel.srtSegment → TTS với narrator voice

createProjectFromPanels
  ├── Dialogue: attachment.audio + attachment.subtitle
  └── Narration: attachment.audio (no subtitle)

Remotion render → có âm thanh đầy đủ
```

## Danh sách file cần sửa (18 files)

### 1. Database

| # | File | Thay đổi |
|---|------|----------|
| 1 | `prisma/schema.prisma` | `NovelPromotionVoiceLine` + field `isNarration Boolean @default(false)`. Sau đó chạy migration. |

### 2. Prompt

| # | File | Thay đổi |
|---|------|----------|
| 2 | `lib/prompts/novel-promotion/voice_analysis.zh.txt` | Panel không dialogue → sinh `speaker:"Narrator"`, `isNarration:true`, `content:""` |
| 3 | `lib/prompts/novel-promotion/voice_analysis.en.txt` | Tương tự bản zh |

### 3. Backend workers

| # | File | Thay đổi |
|---|------|----------|
| 4 | `src/lib/workers/handlers/voice-analyze-helpers.ts` | `VoiceLinePayload` type + field `isNarration: boolean` |
| 5 | `src/lib/workers/handlers/voice-analyze.ts` | Upsert voice line: lưu `isNarration` vào DB |
| 6 | `src/lib/voice/generate-voice-line.ts` | `isNarration === true`: content = `panel.srtSegment`, dùng narrator voice preset, bỏ emotion prompt |

### 4. API

| # | File | Thay đổi |
|---|------|----------|
| 7 | `src/app/api/novel-promotion/[projectId]/voice-lines/route.ts` | POST/PATCH accept `isNarration`, GET response include `isNarration` |

### 5. Query hooks

| # | File | Thay đổi |
|---|------|----------|
| 8 | `src/lib/query/mutations/useVoiceMutations.ts` | `ProjectVoiceLine` type + mutation payload + `isNarration` |

### 6. Voice stage runtime

| # | File | Thay đổi |
|---|------|----------|
| 9 | `src/lib/novel-promotion/stages/voice-stage-runtime/types.ts` | `VoiceLine` interface + `isNarration?: boolean` |
| 10 | `src/lib/novel-promotion/stages/voice-stage-runtime/useVoiceSpeakerState.ts` | Inject `"Narrator"` vào speakers list, luôn hiển thị |
| 11 | `src/lib/novel-promotion/stages/voice-stage-runtime/useVoiceLineCrudActions.ts` | Pass `isNarration` qua mutation create/update |

### 7. Video editor

| # | File | Thay đổi |
|---|------|----------|
| 12 | `src/features/video-editor/hooks/useEditorActions.ts` | Narration → `clip.attachment.audio` (giống dialogue), **không** `subtitle` |

### 8. UI components

| # | File | Thay đổi |
|---|------|----------|
| 13 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice/SpeakerVoiceStatus.tsx` | Narrator row: badge tím + icon book, Voice Settings mở binding dialog |
| 14 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice/VoiceLineCard.tsx` | Narration card: viền tím, ẩn emotion settings, badge `#Narrator #1` |
| 15 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage/VoiceControlPanel.tsx` | Inline editor narration: content pre-filled srtSegment, speaker disabled |
| 16 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage/VoiceLineList.tsx` | Sắp xếp narration lines |
| 17 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx` | Narration line: màu tím, icon book, không ngoặc kép |
| 18 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardFooter.tsx` | Ẩn narration khỏi danh sách chọn lip-sync |

## Flow tổng thể

```
Novel text
  ↓
VOICE_ANALYZE (LLM)
  ├── Dialogue: speaker="玄离", isNarration=false, content="nguyên văn hội thoại"
  └── Narration: speaker="Narrator", isNarration=true, content=""
  ↓
Lưu vào DB (NovelPromotionVoiceLine)
  ↓
Voice line list UI hiển thị — narration card tím, dialogue card xanh
  ↓
User chọn giọng narrator (Voice Settings → upload/chọn từ thư viện)
  ↓
Gen voice:
  ├── Dialogue → TTS với voice của character
  └── Narration → content = panel.srtSegment → TTS với narrator voice
  ↓
createProjectFromPanels:
  ├── Dialogue → audio + subtitle
  └── Narration → audio (không subtitle)
  ↓
Remotion render → video có âm thanh đầy đủ
```
