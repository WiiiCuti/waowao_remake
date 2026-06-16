# Phân tích Sâu: Các Luồng Tạo Ngoại Hình Nhân Vật & Báo Cáo Lỗi (Bug Report)

## 1. Tổng Quan Hệ Thống

Hệ thống có **3 luồng chính** liên quan đến việc xử lý ngoại hình nhân vật. Mỗi luồng độc lập nhau về data flow nhưng bị ảnh hưởng chéo bởi một số lỗi cấu trúc dữ liệu cốt lõi:

---

## 2. Luồng 1: Phân Tích & Xác Nhận Ngoại Hình Gốc (Analyze & Confirm)

Luồng này gồm 2 giai đoạn truyền nối dữ liệu cho nhau (Phase 1 tạo dữ liệu, Phase 2 sinh ảnh dựa trên dữ liệu đó). **Bug hệ thống xảy ra do sự đứt gãy dữ liệu giữa 2 Phase này.**

### Giai đoạn 1: Phân Tích Truyện (Analyze Novel/Global)
*   **Prompt sử dụng**: `agent_character_profile.en.txt`
*   **Mục đích**: Đọc kịch bản/truyện và trích xuất danh sách nhân vật. AI được yêu cầu phân tích số lượng trang phục cần thiết cho nhân vật xuyên suốt truyện (trường `expected_appearances`).
*   **Đầu ra kỳ vọng**: Dữ liệu profile nhân vật kèm các trang phục -> Lưu vào DB (trường `profileData`).

### Giai đoạn 2: Xác Nhận Ngoại Hình (Confirm Profile)
*   **Prompt sử dụng**: `agent_character_visual.en.txt` (**Duy nhất** prompt này được gọi khi User bấm Confirm).
*   **Mục đích**: Sinh mô tả ngoại hình chi tiết và các biến thể trang phục để vẽ ảnh, dựa trên đầu vào do Giai đoạn 1 cung cấp.

#### Sơ đồ hoạt động Giai đoạn 2 (Confirm)
```text
[User bấm "Confirm" trên CharacterProfileCard]
    ↓
useProfileManagement.handleConfirmProfile(characterId, updatedProfileData?)
    ↓
POST /api/novel-promotion/{projectId}/character-profile/confirm
    ↓
[Worker] handleConfirmProfile()
    ↓ (1) Lấy character.profileData từ DB (Dữ liệu do Giai đoạn 1 sinh ra)
    ↓ (2) Build prompt agent_character_visual.en.txt với:
         character_profiles = [{ name, ...parsedProfile }]
         source_text = globalAssetText
    ↓ (3) Gọi AI → nhận về danh sách các trang phục chi tiết { characters[0].appearances[] }
    ↓ (4) Xóa toàn bộ CharacterAppearance cũ (nếu có)
    ↓ (5) Tạo mới các hàng trong bảng CharacterAppearance (1 hàng cho mỗi appearance)
    ↓ (6) Nếu autoGenImages=true: submit task sinh ảnh cho trang phục chính (appearance[0])
```

### ❌ Các Bug trong Luồng 1

#### Bug #1 (Critical) — Lỗi đứt gãy dữ liệu `expected_appearances` giữa 2 Giai đoạn
Khi **Giai đoạn 1** phân tích truyện và tạo nhân vật, trường `expected_appearances` trong AI response trả về **bị code bỏ qua hoàn toàn** trong quá trình lưu `profileData` vào database. Sự thiếu sót này khiến **Giai đoạn 2** bị mất nguyên liệu đầu vào:
*   **Bằng chứng từ AI Prompt (`lib/prompts/novel-promotion/agent_character_profile.en.txt`)**:
    File thiết kế prompt bắt buộc AI trả về cấu trúc này (không phải là suy đoán):
    ```json
    {
      "new_characters": [
        {
          "name": "...",
          "expected_appearances": [
            {"id": 1, "change_reason": "Initial appearance", "visual_context": "..."},
            {"id": 2, "change_reason": "Reason for outfit change", "visual_context": "..."}
          ]
        }
      ]
    }
    ```
    *(Ghi chú trong prompt: `expected_appearances is required, must include at least id=1 initial appearance`)*.
*   **Code thực tế khi lưu vào DB** (tại [analyze-global-persist.ts:69](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/analyze-global-persist.ts#L69) và [analyze-novel.ts:263](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/analyze-novel.ts#L263)):
    ```typescript
    const profileData = {
      role_level: char.role_level,
      archetype: char.archetype,
      // ... chỉ lưu 12 trường cố định
      // ❌ KHÔNG HỀ CÓ trường expected_appearances
    }
    ```
*   **Hậu quả**: Prompt sinh ảnh `agent_character_visual` ở Giai đoạn 2 ưu tiên đọc dữ liệu theo thứ tự:
    1.  `expected_appearances[].visual_context` (thông tin bối cảnh trực tiếp từ truyện).
    2.  `source_text` (nội dung text gốc của truyện).
    3.  Tự tưởng tượng dựa trên `personality_tags`, `era_period`, `costume_tier`.
    Do trường `expected_appearances` luôn bị xóa mất khi lưu ở Giai đoạn 1, Giai đoạn 2 nhận mảng trống. Theo luật trong file `.txt`, nếu mảng này trống, AI Giai đoạn 2 tự động fallback về việc sinh ra **duy nhất 1 ngoại hình tự tưởng tượng (Initial appearance)** -> Các trang phục phụ biến mất, ảnh sinh ra không bám sát sự kiện truyện.

#### Bug #2 (High) — Type `CharacterProfileData` và Dialog Edit thiếu trường `expected_appearances`
Kể cả khi ta sửa Bug #1 để lưu dữ liệu thành công từ lúc đầu, khi user mở dialog chỉnh sửa và bấm lưu:
*   [CharacterProfileDialog.tsx](file:///run/media/thqui/_data/waoowaoo/src/app/%5Blocale%5D/workspace/%5BprojectId%5D/modes/novel-promotion/components/assets/CharacterProfileDialog.tsx) và file interface định nghĩa [types/character-profile.ts](file:///run/media/thqui/_data/waoowaoo/src/types/character-profile.ts) **không khai báo trường `expected_appearances`**.
*   Khi user submit form edit, API gửi dữ liệu có type `CharacterProfileData` (không có trường này).
*   Tại controller xử lý lưu profile [character-profile.ts:52-61](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/character-profile.ts#L52-L61), hàm `stringifyProfileData(payload.profileData)` sẽ serialize lại và lưu đè lên DB, qua đó **xóa sạch trường `expected_appearances`** đã có trước đó.
*   **Hậu quả**: Chỉ cần user nhấn chỉnh sửa profile và lưu một lần, thông tin ngoại hình khớp truyện sẽ biến mất hoàn toàn.

---

## 3. Luồng 2: Tạo Ngoại Hình Phụ / Trang Phục (Sub-Appearance)

*   **Mục đích**: Thêm các trang phục, trạng thái ngoại hình phụ thứ 2, thứ 3 cho nhân vật (ví dụ: mặc giáp, đồ thường ngày, đồ dạ hội).

### Có 2 phương thức tạo sub-appearance:
1.  **Luồng 2a (Tự động khi Confirm)**: Tạo từ danh sách `expected_appearances` trong `profileData` khi AI chạy `agent_character_visual`.
2.  **Luồng 2b (Thêm thủ công bởi User)**: User click nút "Add Appearance" trên giao diện workspace.

### ❌ Các Bug trong Luồng 2

#### Bug #1 lan truyền đến Luồng 2a
*   Tại file xử lý [character-profile.ts:152-166](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/character-profile.ts#L152-L166), code thực hiện duyệt qua mảng `appearances` do AI trả về để tạo các bản ghi sub-appearance. Tuy nhiên, vì `expected_appearances` bị mất (do Bug #1), AI chỉ trả về đúng 1 ngoại hình chính (index = 0). Do đó **không có sub-appearance nào được tự động tạo ra**.

#### Luồng 2c (Tự động cascade sinh ảnh cho sub-appearance khi main image hoàn tất)
*   Khi ảnh chính (index 0) được sinh thành công với cờ `autoGen=true`, hàm `autoGenSubAppearances()` trong [character-image-task-handler.ts:247-252](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/character-image-task-handler.ts#L247-L252) sẽ quét các sub-appearance khác để kích hoạt task sinh ảnh tiếp nối.
*   *Đánh giá*: Cơ chế cascade này viết đúng logic, nhưng do luồng 2a bị hỏng (không tạo ra sub-appearance nào trong DB), nên luồng cascade này hoàn toàn vô dụng.

#### Luồng 2b (Thêm thủ công)
*   Người dùng điền mô tả -> gửi request đến [character/appearance/route.ts:57](file:///run/media/thqui/_data/waoowaoo/src/app/api/novel-promotion/%5BprojectId%5D/character/appearance/route.ts#L57) để tính toán index mới và chèn bản ghi.
*   *Đánh giá*: Hoạt động bình thường vì không phụ thuộc vào `profileData` ban đầu.

---

## 4. Luồng 3: Chọn Trang Phục / Xác Nhận Ảnh (Confirm Selection)

*   **Mục đích**: Khi AI sinh ra nhiều ảnh ứng viên cho một ngoại hình (ví dụ 3 ảnh ứng viên) -> User click chọn 1 ảnh ưng ý -> Hệ thống xóa các ảnh ứng viên khác và chốt ảnh đã chọn làm ảnh đại diện chính thức cho ngoại hình đó.

### Sơ đồ luồng hoạt động
```
[User xem danh sách ảnh ứng viên (candidatures) trên UI]
    ↓
[User click chọn một ảnh] → Cập nhật selectedIndex trên appearance trong DB
    ↓
[User bấm "Confirm Selection"]
    ↓
POST /api/novel-promotion/{projectId}/character/confirm-selection
    body: { characterId, appearanceId }
    ↓
[Server] confirm-selection/route.ts
    (1) Kiểm tra appearance.selectedIndex != null
    (2) Lấy selectedImageUrl = imageUrls[selectedIndex]
    (3) Xóa tất cả các ảnh ứng viên khác khỏi Storage (COS)
    (4) Cập nhật DB: imageUrls = [selectedImageUrl], selectedIndex = 0
    (5) Cập nhật danh sách descriptions: descriptions = [selectedDescription]
```

### ⚠️ Vấn đề tiềm ẩn ở Luồng 3

*   **Thu hẹp dữ liệu descriptions**:
    Tại file [confirm-selection/route.ts:86-104](file:///run/media/thqui/_data/waoowaoo/src/app/api/novel-promotion/%5BprojectId%5D/character/confirm-selection/route.ts#L86-L104), khi confirm selection thành công, hệ thống chỉ giữ lại duy nhất 1 description tương ứng với bức ảnh được chọn, đồng thời ghi đè mảng `descriptions` thành một mảng có 1 phần tử:
    ```typescript
    await prisma.characterAppearance.update({
        data: {
            imageUrl: selectedImageUrl,
            imageUrls: encodeImageUrls([selectedImageUrl]),
            selectedIndex: 0,
            description: selectedDescription,
            descriptions: JSON.stringify([selectedDescription]) // ⚠️ Chỉ còn 1 phần tử
        }
    })
    ```
    *Hậu quả tiềm ẩn*: Nếu trong tương lai user muốn chạy lại tính năng generate lại một nhóm ảnh ứng viên (regenerate group) dựa trên mảng descriptions có sẵn, mảng này lúc này chỉ còn 1 phần tử thay vì 3 phần tử khác biệt ban đầu, dẫn đến việc sinh lại ảnh bị hạn chế về độ đa dạng.

---

## 5. Ảnh Hưởng Lên Luồng Chọn Trang Phục Vào Panel (Panel Outfit Selection)

*   **Mục đích**: Khi hệ thống tiến hành chuyển đổi kịch bản thành phân cảnh phân vai (Script-to-Storyboard), AI sẽ phân tích xem nhân vật ở phân cảnh (panel) nào nên mặc trang phục/ngoại hình nào, từ đó gán đúng mô tả trang phục phù hợp để sinh prompt vẽ ảnh panel.

### Sơ đồ luồng hoạt động
1.  **Phase 1 (Planning Phase)**:
    *   Hàm `getFilteredAppearanceList` xây dựng danh sách trang phục khả dụng gửi cho AI (`appearanceListText` - vd: `Linh: ["Initial appearance", "Wedding Dress", "Armor"]`).
    *   Hàm `getFilteredFullDescription` xây dựng mô tả chi tiết của từng ngoại hình gửi cho AI (`fullDescriptionText`).
    *   AI dựa vào kịch bản để phân tích và gán trang phục cho nhân vật vào từng panel (`panel.characters` chứa `{ name, appearance }`).
2.  **Phase 3 (Detailing Phase) & Gen ảnh panel**:
    *   Hàm `refinePanelPrompts` và `refineSinglePanel` (trong [prompt-refiner.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/novel-promotion/prompt-refiner.ts)) gọi `buildCharacterResources` để lấy thông tin chi tiết về nhân vật và trang phục đã chọn cho panel đó.
    *   `buildCharacterResources` tìm kiếm trang phục có tên khớp với `ref.appearance` trong danh sách `appearances` của nhân vật ở DB:
        ```typescript
        const matchedAppearance = ref.appearance
          ? appearances.find((a) => a.changeReason.toLowerCase() === ref.appearance!.toLowerCase())
          : null
        ```
    *   Mô tả ngoại hình tìm được sẽ được đưa vào làm thông tin tham chiếu để AI thiết lập Prompt vẽ ảnh panel cuối cùng.

### ❌ Các Bug và "Hiệu ứng Domino" tàn phá luồng Panel Outfit Selection

Do **Bug #1** (mất `expected_appearances` khi lưu DB ban đầu) và **Bug #2** (xóa sạch `expected_appearances` khi User chỉnh sửa Profile), mảng `appearances` trong DB của nhân vật luôn bị thiếu hụt hoặc chỉ có 1 phần tử mặc định ban đầu. Điều này trực tiếp gây ra 2 hậu quả tồi tệ lên luồng Panel:

#### Hậu quả 1: AI bị "mù" lựa chọn khi lập kế hoạch phân cảnh (Phase 1)
*   Vì DB trống rỗng, `appearanceListText` (menu trang phục khả dụng) gửi lên AI chỉ chứa đúng 1 lựa chọn: `Linh: ["Initial appearance"]` thay vì có nhiều lựa chọn trang phục khác nhau.
*   **Hậu quả**: AI Đạo diễn (Phase 1 Orchestrator) không có lựa chọn nào khác ngoài việc gắn `"Initial appearance"` cho nhân vật trên tất cả mọi phân cảnh (panel), bất chấp việc kịch bản ghi rõ nhân vật vừa thay đổi trang phục (ví dụ: mặc váy cưới hoặc mặc áo giáp).

#### Hậu quả 2: Prompt Refiner bị "fallback ép buộc" khi sinh prompt vẽ ảnh (Phase 3)
*   Giả sử AI Phase 1 hoặc User cố gắng gán thủ công một tên trang phục khác vào panel (ví dụ: `"Wedding Dress"` hoặc `"Armor"`), khi đi qua hàm `buildCharacterResources` để sinh prompt vẽ ảnh, hệ thống sẽ thực hiện tìm kiếm trang phục có tên tương ứng trong danh sách `appearances` ở DB.
*   Tuy nhiên, do DB chỉ lưu trữ duy nhất ngoại hình mặc định, tìm kiếm trả về `null` (`matchedAppearance = null`).
*   **Hậu quả**: Code tự động fallback về phần tử đầu tiên:
    ```typescript
    const appearance = matchedAppearance || appearances[0] // Fallback về Initial appearance
    ```
    Hệ thống lấy mô tả của ngoại hình gốc (`Initial appearance`) để đưa vào Prompt Refiner. Kết quả là ảnh sinh ra cho phân cảnh vẫn vẽ nhân vật mặc trang phục thường ngày mặc dù trên giao diện hiển thị nhân vật đang chọn trang phục phụ. Nhân vật không bao giờ thay đổi ngoại hình trong comic.

---

## 6. Bug Phụ Nhưng Nghiêm Trọng Khác (Bug #3 - Medium)

### `analyze-novel.ts` Đọc Sai Cấu Trúc Trả Về Từ AI
*   **Nơi xảy ra lỗi**: [analyze-novel.ts:236-238](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/analyze-novel.ts#L236-L238)
*   **Chi tiết lỗi**:
    Trong flow phân tích một tập truyện đơn lẻ, code cố gắng đọc danh sách nhân vật từ trường `characters` của object kết quả AI trả về:
    ```typescript
    const parsedCharacters = Array.isArray(charactersData.characters)
        ? (charactersData.characters as ...)
        : [] // ❌ Luôn trả về mảng rỗng vì trường này không tồn tại
    ```
    **Bằng chứng từ AI Prompt (`lib/prompts/novel-promotion/agent_character_profile.en.txt`)**:
    File prompt quy định cực kỳ rõ ràng rằng AI phải trả về JSON với 2 mảng phân biệt:
    ```json
    {
      "new_characters": [...],
      "updated_characters": [...]
    }
    ```
    Việc code TypeScript (`analyze-novel.ts`) cố truy cập trường `characters` (trường không hề được yêu cầu trong prompt .txt) là nguyên nhân gốc rễ gây ra lỗi phân tích nhân vật ở chế độ một chương truyện.
*   **Hậu quả**: Flow phân tích một tập truyện đơn lẻ (`Analyze Novel`) không bao giờ nhận diện hoặc tạo ra được bất kì nhân vật nào. (Bên flow `Analyze Global` lỗi này đã được xử lý bằng code tương thích ngược).

---

## 7. Ma Trận Ảnh Hưởng: Bug vs Luồng Xử Lý

| Tên Bug | Luồng 1 (Confirm Gốc) | Luồng 2a (Auto Sub) | Luồng 2b (Manual Sub) | Luồng 2c (Cascade Sub) | Luồng 3 (Confirm Select) | Luồng Panel (Outfit Selection) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bug #1: Mất expected_appearances** | ❌ **ROOT CAUSE** | ❌ **Broken** | ✅ Bình thường | ❌ **Broken** | ✅ Bình thường | ❌ **Mất menu & Fallback prompt** |
| **Bug #2: Khuyết trường khi User Edit** | ❌ **Mất khi save** | N/A | N/A | N/A | N/A | ❌ **Mất menu & Fallback prompt** |
| **Bug #3: analyze-novel.ts đọc sai key** | ❌ **Không tạo được nhân vật** | ❌ **Không tạo được nhân vật** | ✅ Bình thường | ✅ Bình thường | ✅ Bình thường | ✅ Bình thường |
| **Vấn đề tiềm ẩn: Thu hẹp description** | N/A | N/A | N/A | N/A | ⚠️ **Giảm tập mô tả để re-gen** | ✅ Bình thường |

---

## 8. Nhóm 1: Backend / Data Flow (6 bugs phát hiện thêm)

| Bug | Mức độ | File | Mô tả |
|-----|--------|------|-------|
| **#4** | HIGH | `analyze-novel.ts:278-287` | `introduction` không được lưu vào DB khi tạo character (global-persist thì có lưu). Mọi prompt downstream phải fallback `"No character introductions available"` |
| **#5** | HIGH | `analyze-novel.ts:236-289` | `updated_characters` hoàn toàn không được xử lý. AI đề xuất cập nhật alias/relationship cho character cũ bị vứt bỏ (global-persist có xử lý) |
| **#6** | MEDIUM | `storyboard-phases.ts:33-36` + `orchestrator.ts:387` | Type `CharacterAsset` thiếu trường `introduction`. Nếu sau này refactor map chặt theo type, introduction sẽ mất |
| **#7** | MEDIUM | `script-to-storyboard-helpers.ts:237-244` | `syncPanelCharacters` không match alias (vd: panel ghi "Boss Lin" nhưng DB name là "Lin Mo/Boss Lin" → substring match fail) |
| **#8** | LOW | `prompt-refiner.ts:130` | Gọi `.toLowerCase()` trên `changeReason` không có null guard. `image-task-handler-shared.ts:239` thì có guard |
| **#9** | LOW | `character-profile-mutations.ts:244` | Response type khai `appearances[].id?: number` nhưng thực tế là UUID string |

---

## 9. Nhóm 2: Frontend / UI (7 bugs phát hiện thêm)

| Bug | Mức độ | File | Mô tả |
|-----|--------|------|-------|
| **#10** | CRITICAL | `CharacterCard.tsx:314` | `isConfirmingSelection` set `true` nhưng không bao giờ reset về `false`. Sau 1 lần confirm fail, nút bị disable vĩnh viễn đến khi component unmount |
| **#11** | HIGH | `CharacterCardGallery.tsx:43-101` | Chế độ `selection` (gallery nhiều ảnh ứng viên) không hiển thị trạng thái lỗi. Ảnh fail hiển thị thành blank, không báo gì |
| **#12** | HIGH | `useProjectAssets.ts:29,43` | `descriptions` và `previousDescriptions` bị hardcode `null`, mất toàn bộ dữ liệu description từ API |
| **#13** | MEDIUM | `CharacterEditModal.tsx:11` | Prop `appearanceId` type là `number` nhưng ID thật là UUID string |
| **#14** | MEDIUM | `useProfileManagement.ts:95-98` | Không validate profileData ở frontend trước khi gửi confirm |
| **#15** | MEDIUM | `character-profile.ts:275-303` | Batch confirm nhiều character fail một phần, chỉ trả về `successCount`, không cho user biết character nào fail và lý do |
| **#16** | LOW | `CharacterSection.tsx:268-273` | Character có 0 appearance → render header trống, không có placeholder |

---

## 10. Kiểm Chứng Bug — Đối Chiếu Source Code (2025-06-16)

Mỗi bug được kiểm chứng bằng cách đọc trực tiếp source code.

### Bug #1 — ✅ CONFIRMED (Critical)

**Claim**: `expected_appearances` không được lưu vào `profileData`.

**Evidence**:
- `analyze-global-persist.ts:69-82` — object `profileData` có đúng 12 trường (`role_level`, `archetype`, ..., `age_range`), **không có `expected_appearances`**.
- `analyze-novel.ts:263-276` — y hệt, 12 trường, không có `expected_appearances`.
- Prompt `agent_character_profile.en.txt:224-227` yêu cầu AI trả về `expected_appearances` (required, `must include at least id=1`).

**Verdict**: BUG THẬT. Dữ liệu AI trả về bị vứt bỏ.

---

### Bug #2 — ✅ CONFIRMED (High)

**Claim**: `CharacterProfileData` type và Dialog thiếu trường `expected_appearances`.

**Evidence**:
- `character-profile.ts:10-46` — interface `CharacterProfileData` chỉ có 12 fields, **không có `expected_appearances`**.
- `validateProfileData()` (line 70-88) chỉ validate 12 field đó. Nếu thêm field mới, validate sẽ pass nhưng field không được bảo vệ.
- Khi user edit profile, `stringifyProfileData()` (line 63-65) serialize object theo type → field `expected_appearances` trong DB bị ghi đè mất.

**Verdict**: BUG THẬT.

---

### Bug #3 — ✅ CONFIRMED (High)

**Claim**: `analyze-novel.ts` đọc `charactersData.characters` thay vì `new_characters`.

**Evidence**:
- `analyze-novel.ts:236`: `const parsedCharacters = Array.isArray(charactersData.characters) ? ...` — đọc field `characters`.
- `agent_character_profile.en.txt:207`: AI output schema: `"new_characters": [...]` — field tên là `new_characters`, không phải `characters`.
- Không có field nào tên `characters` trong prompt schema.

**Verdict**: BUG THẬT. `charactersData.characters` luôn `undefined` → `parsedCharacters = []`.

---

### Bug #4 — ✅ CONFIRMED (HIGH)

**Claim**: `introduction` không được lưu vào DB trong `analyze-novel.ts`.

**Evidence**:
- `analyze-novel.ts:278-287`: `prisma.novelPromotionCharacter.create()` chỉ set `name`, `aliases`, `profileData`, `profileConfirmed`. **Không có `introduction`**.
- `analyze-global-persist.ts:84-96`: create **có** `introduction: readText(char.introduction)` ở line 89.
- Prompt `agent_character_profile.en.txt:211`: `"introduction": "Character introduction: ..."` — AI bắt buộc trả về trường này (line 261: `introduction is required`).

**Verdict**: BUG THẬT. Character tạo từ novel analysis không bao giờ có introduction trong DB.

---

### Bug #5 — ✅ CONFIRMED (HIGH)

**Claim**: `updated_characters` không được xử lý trong `analyze-novel.ts`.

**Evidence**:
- `analyze-novel.ts:236-289` — chỉ có 1 vòng lặp `for (const item of parsedCharacters)` xử lý character mới. **Không có code nào xử lý `updated_characters`**.
- `analyze-global-persist.ts:111-148` — **có** vòng lặp `for (const update of params.charactersData.updated_characters || [])` với logic merge alias, update introduction.
- Prompt `agent_character_profile.en.txt:230-236` — định nghĩa rõ `updated_characters` array.

**Verdict**: BUG THẬT. AI đề xuất cập nhật bị bỏ qua hoàn toàn.

---

### Bug #6 — ✅ CONFIRMED (Medium)

**Claim**: `CharacterAsset` type thiếu `introduction`.

**Evidence**:
- `storyboard-phases.ts:33-36`: `type CharacterAsset = { name: string; appearances?: CharacterAppearance[] }` — **không có `introduction`**.
- `orchestrator.ts:387`: `buildCharactersIntroduction(novelPromotionData.characters || [], locale)` — runtime vẫn chạy vì Prisma trả về đủ field, nhưng type không khớp.

**Verdict**: BUG THẬT. Type-safety gap, nếu refactor sẽ mất introduction.

---

### Bug #7 — ⚠️ CONFIRMED nhưng overstated (Low)

**Claim**: `syncPanelCharacters` không match alias.

**Evidence**:
- `script-to-storyboard-helpers.ts:243`: `allCharacterNames = project.characters.map(c => c.name)` — chỉ lấy `name`, không lấy `aliases`.
- `image-task-handler-shared.ts:288-291`: `desc.includes(lower)` kiểm tra description có chứa character name không. Nếu description dùng alias (vd: "Boss Lin") mà DB name là "Lin Mo", `"boss lin".includes("lin mo")` → false.

**Analysis**: Về mặt kỹ thuật đúng, nhưng trong thực tế:
- Panel description do AI sinh luôn dùng canonical name, không dùng alias.
- Đây là edge case hiếm gặp.
- Hàm `findCharacterByName` trong cùng file (line 206-223) **có** xử lý alias bằng cách split `/`.

**Verdict**: Đúng về mặt kỹ thuật, nhưng severity thấp hơn claim (LOW, không phải MEDIUM).

---

### Bug #8 — ✅ CONFIRMED (Low)

**Claim**: `prompt-refiner.ts` không có null guard cho `changeReason`.

**Evidence**:
- `prompt-refiner.ts:130`: `a.changeReason.toLowerCase()` — không có `|| ''`.
- `image-task-handler-shared.ts:239`: `(a.changeReason || '').toLowerCase()` — có guard.
- Cùng 1 pattern, xử lý khác nhau. Nếu DB có bản ghi với `changeReason = null`, prompt-refiner.ts sẽ crash.

**Verdict**: BUG THẬT (inconsistency).

---

### Bug #9 — ✅ CONFIRMED (Low)

**Claim**: Response type mutation khai `appearances[].id?: number` nhưng ID thật là UUID string.

**Evidence**:
- `character-profile-mutations.ts:244-246`: `id?: number`.
- `types/project.ts:34`: `CharacterAppearance.id: string` (UUID).

**Verdict**: BUG THẬT. Type sai nhưng vô hại vì response không consumed ở đây.

---

### Bug #10 — ✅ CONFIRMED (Critical)

**Claim**: `isConfirmingSelection` set `true` nhưng không bao giờ reset.

**Evidence**:
- `CharacterCard.tsx:83`: `const [isConfirmingSelection, setIsConfirmingSelection] = useState(false)`.
- `CharacterCard.tsx:314`: `setIsConfirmingSelection(true)` — set trong `onConfirmSelection` callback.
- **Không có** `setIsConfirmingSelection(false)` ở bất kỳ đâu trong component (không `useEffect`, không `finally`, không error handler).
- So sánh với `LocationCard.tsx:276-278` — component đó có pattern `try { ... } finally { setIsConfirmingSelection(false) }`.

**Verdict**: BUG THẬT. Nút Confirm Selection bị kẹt vĩnh viễn sau lần click đầu nếu callback fail.

---

### Bug #11 — ✅ CONFIRMED (High)

**Claim**: Gallery mode `selection` không hiển thị error state.

**Evidence**:
- `CharacterCardGallery.tsx:43-101` — `selection` mode render: chỉ có `isThisTaskRunning && <TaskStatusOverlay>`. **Không có error display nào**.
- `CharacterCardGallery.tsx:103-148` — `single` mode **có** `appearanceErrorDisplay` với icon alert + message.

**Verdict**: BUG THẬT. Ảnh generate fail hiển thị blank không thông báo.

---

### Bug #12 — ✅ CONFIRMED (High)

**Claim**: `descriptions` và `previousDescriptions` hardcode `null`.

**Evidence**:
- `useProjectAssets.ts:29`: `descriptions: null` — hardcoded, không đọc từ variant data.
- `useProjectAssets.ts:43`: `previousDescriptions: null` — hardcoded.
- `CharacterAppearance` type defines `descriptions: string[] | null` và `previousDescriptions: string[] | null` — type cho phép array, nhưng data layer luôn trả về null.

**Verdict**: BUG THẬT. Dữ liệu description từ API bị mất ở UI data layer.

---

### Bug #13 — ✅ CONFIRMED (Medium)

**Claim**: `appearanceId` type là `number` nhưng ID thật là UUID string.

**Evidence**:
- `CharacterEditModal.tsx:11`: `appearanceId: number`.
- `CharacterEditModal.tsx:17`: `onSave: (characterId: string, appearanceId: number) => void`.
- Line 51: `appearanceId={String(appearanceId)}` — phải convert sang string để pass cho shared component.
- `types/project.ts:34`: `CharacterAppearance.id: string` — ID thật là string.

**Verdict**: BUG THẬT. Type sai, runtime có convert nên không crash nhưng gây confusion.

---

### Bug #14 — ✅ CONFIRMED (Medium)

**Claim**: Không validate profileData ở frontend trước khi confirm.

**Evidence**:
- `useProfileManagement.ts:95-98`: gọi `confirmCharacterProfileMutation.mutateAsync({ characterId, profileData: updatedProfileData, generateImage: true })` — **không có validate**.
- Backend worker có validate (`character-profile.ts:53`: `validateProfileData(payload.profileData)`), nhưng chỉ chạy khi task được pick up → delay.
- Nếu user gửi profile data sai format, chỉ biết lỗi sau khi worker chạy (có thể vài phút).

**Verdict**: BUG THẬT. Thiếu UX feedback sớm.

---

### Bug #15 — ✅ CONFIRMED (Medium)

**Claim**: Batch confirm partial failure không thông báo chi tiết.

**Evidence**:
- `character-profile.ts:275-303`: vòng lặp confirm từng character, catch error và continue, nhưng return chỉ có `meta: { count: successCount }` (line 309+). **Không có danh sách character fail**.
- `useProfileManagement.ts:131-132`: UI chỉ hiển thị `showToast?.(t('characterProfile.batchConfirmSuccess', { count: confirmedCount }), 'success')` — chỉ biết số thành công.

**Verdict**: BUG THẬT. User không biết character nào fail và lý do.

---

### Bug #16 — ✅ CONFIRMED (Low)

**Claim**: Character có 0 appearance → render header trống.

**Evidence**:
- `CharacterSection.tsx:268-269`: `primaryAppearance = sortedAppearances.find(...) || sortedAppearances[0]` — khi mảng rỗng → `undefined`.
- Line 271-273: optional chaining ngăn crash nhưng `primarySelected = false`.
- Line 310-311: `sortedAppearances.map(...)` — render empty khi mảng rỗng.
- **Không có** placeholder "No appearances yet" hay "Generating first appearance...".

**Verdict**: BUG THẬT. UX gap, character hiển thị như "rỗng" không giải thích.

---

## 11. Ma Trận Kiểm Chứng Tổng Hợp

| Bug # | Claim Severity | Verified Severity | Real? | Ghi chú |
|-------|---------------|-------------------|-------|---------|
| 1 | Critical | Critical | ✅ | expected_appearances mất khi lưu |
| 2 | High | High | ✅ | Type + dialog thiếu field |
| 3 | Medium | High | ✅ | Đọc sai key AI response → 0 character |
| 4 | HIGH (new) | High | ✅ | introduction mất trong analyze-novel |
| 5 | HIGH (new) | High | ✅ | updated_characters bị bỏ qua |
| 6 | MEDIUM (new) | Medium | ✅ | CharacterAsset type thiếu introduction |
| 7 | MEDIUM (new) | Low | ✅ | Alias matching gap (edge case) |
| 8 | LOW (new) | Low | ✅ | changeReason null guard inconsistency |
| 9 | LOW (new) | Low | ✅ | Type mismatch id number vs string |
| 10 | CRITICAL (new) | Critical | ✅ | isConfirmingSelection stuck forever |
| 11 | HIGH (new) | High | ✅ | No error display in selection gallery |
| 12 | HIGH (new) | High | ✅ | descriptions hardcoded null |
| 13 | MEDIUM (new) | Medium | ✅ | appearanceId number vs UUID |
| 14 | MEDIUM (new) | Medium | ✅ | Missing frontend validation |
| 15 | MEDIUM (new) | Medium | ✅ | Batch failure not granular |
| 16 | LOW (new) | Low | ✅ | No empty state for 0 appearances |

**Kết luận**: 16/16 bugs đều confirmed. Chỉ Bug #7 bị overstated (LOW thay vì MEDIUM).

---

## 12. Kế Hoạch & Thứ Tự Sửa Lỗi Đề Xuất (Tổng Hợp)

Tổng cộng có 16 bugs. Để khôi phục hoàn toàn tính năng sinh ảnh nhân vật bám sát cốt truyện và đảm bảo UI/UX mượt mà, nên tiến hành sửa đổi theo 3 Phase:

**Phase 1: Vá Lỗ Hổng Schema & Data Loss (Core Backend - Bugs #1, #2, #4, #5, #6)**
1. Cập nhật `CharacterProfileData` type (thêm `expected_appearances`, `introduction`, `aliases`).
2. Sửa `analyze-novel.ts` và `analyze-global-persist.ts` để lưu đủ trường và xử lý `updated_characters`.

**Phase 2: Khắc Phục UI/UX Tê Liệt (Core Frontend - Bugs #10, #11, #12, #14)**
1. Sửa lỗi kẹt trạng thái loading `isConfirmingSelection` (Bug #10).
2. Xóa hardcode `null` trong `useProjectAssets.ts` (Bug #12).
3. Thêm hiển thị trạng thái lỗi cho Gallery và validation trước khi gửi (Bug #11, #14).

**Phase 3: Sửa Lỗi Logic Nhánh (Minor Bugs & Mapping - Bugs #3, #7, #8, #9, #13, #15, #16)**
1. Fix Bug #3 (truy cập đúng `new_characters` trong AI response).
2. Sửa thuật toán `syncPanelCharacters` để match cả alias (Bug #7).
3. Sửa lại các sai sót về Type (UUID thay vì number) và các lỗi hiển thị nhỏ.
