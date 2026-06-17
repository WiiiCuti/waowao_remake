# Tìm hiểu về việc sinh và sử dụng Props (Đạo cụ) trong Hệ thống

Tài liệu này tổng hợp chi tiết về hiện trạng sinh, lưu trữ, sử dụng và lý do vì sao `props` (đạo cụ) hiện tại chưa được hiển thị trên UI và chưa được áp dụng hiệu quả vào quá trình sinh ảnh panel.

---

## 1. Quá trình Phân tích và Lưu trữ Props (Backend - Story-to-Script)

*   **Phân tích (Analysis):** Khi chạy pipeline `story-to-script`, LLM phân tích nội dung truyện và phát hiện ra các đạo cụ quan trọng (`props`).
*   **Lưu trữ DB:**
    *   Các đạo cụ này được lưu trực tiếp vào bảng **`NovelPromotionLocation`** trong Database.
    *   Để phân biệt với địa điểm (location), các bản ghi đạo cụ sẽ có trường `assetKind = 'prop'`.
    *   Hàm thực hiện việc này là `persistAnalyzedProps` nằm trong file [story-to-script-helpers.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/story-to-script-helpers.ts#L163-L210).
*   **API Query:**
    *   Khi frontend gọi API `/api/novel-promotion/[projectId]/assets` để tải danh sách tài nguyên (trong file [route.ts](file:///run/media/thqui/_data/waoowaoo/src/app/api/novel-promotion/%5BprojectId%5D/assets/route.ts#L54-L61)), API sẽ tự động lọc các bản ghi từ bảng `NovelPromotionLocation`:
        *   Các bản ghi có `assetKind !== 'prop'` sẽ trả về ở mảng `locations`.
        *   Các bản ghi có `assetKind === 'prop'` sẽ trả về ở mảng `props`.

---

## 2. Quá trình Sử dụng Props trong Storyboard LLM

*   Trong worker xử lý kịch bản phân cảnh [script-to-storyboard.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/script-to-storyboard.ts#L301-L303), danh sách props được truy xuất từ DB (bằng cách lọc trường `assetKind === 'prop'`).
*   Thông tin props (gồm tên và mô tả tóm tắt) được truyền vào orchestrator để chuẩn bị ngữ cảnh prompt cho LLM.
*   Trong [orchestrator.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/novel-promotion/script-to-storyboard/orchestrator.ts#L421-L428), hệ thống build chuỗi mô tả `{props_description}` của những props xuất hiện trong phân đoạn kịch bản hiện tại.
*   Chuỗi `{props_description}` này được thay thế vào các template prompt của LLM bao gồm:
    *   `phase1PlanTemplate` (Lập kế hoạch phân cảnh)
    *   `phase2CinematographyTemplate` (Chỉ đạo góc quay/khung hình)
    *   `phase3DetailTemplate` (Chi tiết mô tả phân cảnh)
*   **Kết quả:** LLM khi phân tích phân cảnh (Storyboard) thực sự nhận thức được sự tồn tại của đạo cụ và có sử dụng thông tin của chúng khi viết mô tả chi tiết cho từng panel.

---

## 3. Các Điểm Nghẽn (Lý do Props không được gen/sử dụng trên thực tế)

### A. Thiếu thành phần giao diện (UI Frontend)
*   Tại thư mục giao diện quản lý tài nguyên: [src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/assets/](file:///run/media/thqui/_data/waoowaoo/src/app/%5Blocale%5D/workspace/%5BprojectId%5D/modes/novel-promotion/components/assets)
    *   Chỉ có `CharacterSection.tsx` (quản lý Nhân vật) và `LocationSection.tsx` (quản lý Địa điểm).
    *   **Hoàn toàn không có `PropSection.tsx`** hoặc khu vực hiển thị danh sách đạo cụ đã phân tích được. Do đó, người dùng không thể nhìn thấy, không thể edit mô tả, và không thể sinh ảnh mẫu hay xác nhận ảnh mẫu cho các đạo cụ này.

### B. Thiếu logic truyền Props vào worker Sinh ảnh Panel (Image Gen Worker)
Mặc dù thông tin props đã được ghi nhận trong bảng phân cảnh panel (trường `props` lưu dạng chuỗi JSON của panel), khi hệ thống chạy tác vụ sinh ảnh thực tế cho panel:
1.  **Không truy xuất Props từ DB:**
    *   Hàm `resolveNovelData` trong [image-task-handler-shared.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/image-task-handler-shared.ts#L159-L174) chỉ load `characters` và `locations` mà hoàn toàn bỏ qua việc cấu trúc và nạp thông tin `props` riêng biệt.
2.  **Không đưa vào Context Prompt sinh ảnh:**
    *   Hàm `buildPanelPromptContext` trong [panel-image-task-handler.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-image-task-handler.ts#L64-L140) xây dựng ngữ cảnh dựa vào `character_appearances` và `location_reference` nhưng không có phần xử lý cho đạo cụ.
3.  **Không build mô tả Props vào Prompt sinh ảnh:**
    *   Hàm `buildPanelPrompt` trong [panel-image-task-handler.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/panel-image-task-handler.ts#L142-L198) chỉ ghép mô tả nhân vật, bối cảnh, góc quay, ánh sáng, phong cách vẽ... mà **không hề ghép chuỗi mô tả đạo cụ** vào prompt gửi tới AI sinh ảnh.
4.  **Không có ảnh tham chiếu của Props:**
    *   Hàm `collectPanelReferenceImages` trong [image-task-handler-shared.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/workers/handlers/image-task-handler-shared.ts#L225-L264) chỉ gom ảnh tham chiếu của nhân vật (appearance) và địa điểm (location image) mà không nạp ảnh tham chiếu của đạo cụ.

---

## 4. Hướng Khắc Phục (Tham khảo)

Để sửa đổi triệt để vấn đề này, bạn có thể thực hiện theo các bước được mô tả chi tiết trong file kế hoạch [guide_prop_fixed.md](file:///run/media/thqui/_data/waoowaoo/guide_prop_fixed.md):
1.  **UI:** Xây dựng Component hiển thị danh sách đạo cụ tương tự như địa điểm (cho phép chọn ảnh mẫu/lưu mô tả).
2.  **Worker Image Gen:**
    *   Cập nhật `resolveNovelData` để nạp danh sách `props` riêng (hoặc lọc từ bảng `locations` những record có `assetKind === 'prop'`).
    *   Cập nhật `buildPanelPromptContext` và `collectPanelReferenceImages` để đưa mô tả & ảnh mẫu của đạo cụ tương ứng vào ngữ cảnh và danh sách ảnh tham chiếu.
    *   Cập nhật `buildPanelPrompt` để tự động chèn mô tả trực quan của đạo cụ vào prompt sinh ảnh panel.
