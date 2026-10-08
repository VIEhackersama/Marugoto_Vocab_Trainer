# Bàn giao UI overhaul Marugoto

Cập nhật 08/10/2026, 15:54 (Asia/Bangkok). Đã tiếp tục từ savepoint và hoàn tất triển khai, QA và build. Code nằm trong working tree, chưa commit.

## Giao diện đã thay đổi

- Điều hướng chính gồm Học tập, Từ điển, Bộ từ và Cài đặt; trong Học tập vẫn có Flashcards, Kiểm tra và Ôn đến hạn.
- Một editor chung cho thêm/sửa: Kanji, Kana, Romaji và nghĩa; tách dữ liệu dán dạng `電車（でんしゃ）`, gợi ý Marugoto, phiên âm tự điền nhưng sửa tay được, nghe và xem trước, kiểm tra trùng/đồng âm, lưu và thêm tiếp.
- Từ điển dùng bảng mặc định, toolbar gọn, bộ lọc và chế độ xem được ghi nhớ, phân trang 80 từ, trạng thái và tiến độ, sửa ngay bên cạnh. Các công cụ Kanji, gỡ về Kana và chế độ thẻ vẫn có.
- Thư viện PDF/custom, màn cài đặt, hộp thoại nhập/trùng, batch Kanji và sao lưu dùng cùng hệ màu/icon. Các nút lưu/xác nhận vẫn tiếp cận được ở màn hình thấp.
- Typed Recall dùng được với bộ ít từ. Timer tạm dừng khi rời phiên hoặc mở editor/dialog; chỉnh từ trong phiên giữ hàng đợi và cập nhật nội dung đáp án. Phím tắt học không chạy phía sau editor.

## Sửa lỗi phát hiện khi QA

Khôi phục cùng JSON từng tạo thêm `vocabulary_sources` vì mỗi lần nhập sinh ID mới và không có unique constraint theo cặp từ–bộ. `BackupService` giờ chỉ tạo liên kết nếu cặp này chưa tồn tại. Không đổi schema hoặc scheduler. Test hồi quy khôi phục hai lần xác nhận giữ số liên kết, thẻ, lịch và nhật ký.

Sau khôi phục, frontend tải lại custom list, xóa phiên đã hoàn thành và đưa phạm vi học về toàn thư viện. Thông báo khôi phục mô tả đúng cơ chế cập nhật/gộp của backend. JSON không chứa PDF gốc; UI nhắc sao chép PDF riêng khi chuyển máy.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 30/30 pass: dictionary, Kanji, quiz session, typed answer và editor converter/adapter |
| Java integration | 6/6 pass: 5 test hiện có và 1 regression restore mới |
| `npm run build` sau thay đổi cuối | Pass; 46 modules |
| Kiểm tra JSX bindings | 10 modules, 0 tham chiếu chưa khai báo |
| `git diff --check` | Pass |
| Runtime tab QA mới | Không có error/warn khi điều hướng, mở thao tác từ, editor và dùng keyboard |

Browser QA sử dụng backend riêng port 8081, dữ liệu `marugoto-vocab-trainer/tmp/ui-qa-data`; không dùng DB học thật làm fixture. Đã kiểm tra:

- Thêm đủ bốn trường, tách Kanji/Kana khi dán, tự sinh và giữ Romaji sửa tay, validation, chống trùng nhưng cho phép đồng âm, giữ draft khi lỗi 503, Ctrl+Enter, lưu và thêm tiếp, xác nhận bỏ draft.
- Sửa từ sau review giữ ID và tiến độ; search Việt không dấu; Kanji/Furigana, trạng thái và menu từng dòng.
- Flashcards lật/trắc nghiệm/tự gõ; Test hai chiều; typed bộ ít từ; Ôn đến hạn; Again chờ và kết thúc sớm; timer không ghi review trong lúc editor mở.
- Nhập PDF 26 từ và tự mapping 7 từ; nhập lại nhận diện 26 từ trùng, mặc định bỏ qua và khóa xác nhận khi không còn từ mới; tải PDF thành công.
- Export/restore JSON qua UI; gỡ `本（ほん）` về Kana rồi batch gán lại; tiến độ giữ nguyên.
- 1280×720: thấy 5 hàng đầy đủ, nút lưu trong viewport. 1366×768, 1440×900, 1920×1080 và mobile 390×844 không tràn ngang. 640×360 kiểm tra reflow tương đương vùng CSS của laptop phóng to 200%; trình duyệt QA không cung cấp điều khiển zoom thật, nên không tuyên bố đã test native zoom 200%.
- Nội dung nghĩa dài không gây tràn ngang; mobile Tab từ nút cuối quay về nút đóng và Escape đóng editor sạch.
- Fixture 5.000 từ chỉ render tối đa 80 hàng/trang, 63 trang; chuyển trang 81–160 đã chạy đúng.

Rule `prefers-reduced-motion` đã có trong CSS. Chưa kiểm tra bật thiết lập giảm chuyển động ở hệ điều hành hoặc composition bằng bộ gõ IME thật; logic composition có guard trong editor và shortcut.

## Ảnh thực tế

- [Từ điển và editor](ui-overhaul-dictionary.jpg) — form thêm từ đủ bốn trường, ảnh từ app QA.
- [Màn Học tập](ui-overhaul-study.jpg).
- `redesign-wireframe.jpg` và HTML wireframe là bản phác cũ, không dùng thay ảnh sản phẩm.

## Trạng thái để tiếp tục

App nằm ở `C:\Users\Admin\Documents\marugoto-vocab-trainer\marugoto-vocab-trainer`. Bản QA tại `http://127.0.0.1:5174/` proxy đến backend 8081; có dữ liệu thử nghiệm. Dữ liệu học thật không bị chỉnh trong QA.

Các session được giữ để review: frontend 66417, backend 1712. Nếu phiên chạy đã hết, khởi động backend bằng JDK24 với `APP_DATA_DIR` và `APP_PDF_DIR` trỏ vào `tmp/ui-qa-data`, `--server.port=8081`; frontend dùng script `C:\Users\Admin\.codex\visualizations\2026\10\08\01a119aa-c099-7721-acb1-663bcb6ef4d2\ui-qa-preview.mjs`. Script QA không can thiệp lifecycle của app thật.

Để chạy test Java trên máy này: đặt `JAVA_HOME=C:\Program Files\Java\jdk-24`, chạy Maven với `-DargLine=-javaagent:C:/Users/Admin/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar`. Các database test nằm trong `backend/target`.

Giữ nguyên các thay đổi backend đã có trước overhaul: `ReviewService`, `StudyService`, `DeckAndReviewIntegrationTest` và migration V3 đồng bộ lịch hai chiều. Không reset/clean/stash toàn repo. Thay đổi backend mới của đợt này chỉ là sửa liên kết khi restore và test riêng `BackupRestoreRegressionTest`.

Hai giới hạn cũ chưa đưa vào overhaul: “Mới thêm gần đây” vẫn sort theo ID do DTO chưa có `createdAt`; build còn warning bundle lớn do PDF parser/worker. Không thêm dependency runtime. Không có commit, PR hoặc deploy trong đợt này.
