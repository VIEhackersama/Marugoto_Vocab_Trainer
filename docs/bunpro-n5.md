# Bunpro N5 và flashcard ngữ pháp

## Dữ liệu đã nhập

Bản `bunpro-n5-2026-10-10-vi-1` được thu thập qua phiên Bunpro đã đăng nhập ngày 10/10/2026 (giờ Việt Nam):

| Kho | Số mục | Lesson | Bản Việt | Câu điền khuyết |
| --- | ---: | ---: | ---: | ---: |
| Từ vựng N5 | 1.100 | 22, mỗi lesson 50 mục | 1.100 | Không áp dụng |
| Ngữ pháp N5 | 132 | 10 | 132 | 132 |

Nguồn danh mục: [Bunpro N5 Vocab](https://bunpro.jp/decks/resqiy/bunpro-n5-vocab) và [Grammar Library](https://bunpro.jp/grammar_points). Mỗi mục giữ URL nguồn chuẩn hóa và nghĩa tiếng Anh gốc. Không lưu cookie, tài khoản hoặc tiến độ Bunpro. Không nhập N4 trong đợt này.

Nghĩa Việt, cấu trúc, giải thích và các câu luyện tập được biên soạn trong dự án, có đối chiếu nội dung và kiểm tra cấu trúc. Chúng không phải bản dịch chính thức hay câu SRS gốc của Bunpro; chưa có vòng duyệt độc lập bởi giáo viên. `VERIFIED` thể hiện đã được kiểm tra ở lần biên soạn này; người dùng có thể sửa và xác nhận lại từng mục. Nghĩa Việt là bản ngắn gọn phục vụ học N5; nghĩa gốc giữ lại để tra cứu các nghĩa rộng hơn.

Các bản nguồn ở `marugoto-vocab-trainer/backend/src/main/resources/bunpro/n5-vocab-source.json` và `n5-grammar-source.json`; bản nhập là `n5.json`. Các tệp biên soạn nằm trong `marugoto-vocab-trainer/scripts/`. Tạo lại bản nhập bằng:

```powershell
cd marugoto-vocab-trainer
node scripts/build-bunpro-snapshot.mjs
```

Script kiểm tra số mục, URL duy nhất, thứ tự, số lượng từng lesson, nội dung bắt buộc và chỗ trống. Kiểm thử frontend đối chiếu toàn bộ URL bản nhập với bản nguồn. Không cần đăng nhập Bunpro để dùng dữ liệu đã nhập tại local.

## Cách dùng

- **Bunpro:** tìm theo từ, cách đọc hoặc nghĩa; lọc cấp độ, lesson, trạng thái. Chọn từ rồi bấm **Chọn học từ này**, hoặc chọn lesson rồi bấm **Học lesson đã chọn**.
- Nếu đã có từ tương đương theo cách viết, cách đọc và nghĩa đã chuẩn hóa, ứng dụng liên kết và giữ tiến độ. Nếu chỉ gần giống, ứng dụng đưa danh sách để chọn liên kết hoặc tạo từ riêng. 家／いえ và 家／うち không tự gộp.
- **Từ điển:** hiển thị một hàng cho mỗi từ đã lưu, kèm tất cả bộ nguồn. Việc đọc từ điển và duyệt kho không tạo lịch ôn.
- **Ngữ pháp → Mẫu câu:** xem cấu trúc, giải thích, ví dụ và nguồn; chọn học để tạo lịch cho các câu đã kiểm tra. Bổ sung câu sau này phải chọn học lại để đưa câu mới vào lịch.
- **Ngữ pháp → Ôn tập:** gõ đáp án tiếng Nhật, bấm **Xem đáp án**, tự đối chiếu rồi chọn **Again / Hard / Good / Easy**. Không có chấm đúng/sai tự động. Enter trong quá trình ghép chữ IME không lật thẻ.
- **Bảng chia từ:** vẫn giữ đủ nhóm và bảng chia trước đây, có thể mở từ chi tiết mẫu câu.
- Mục `MISSING` hoặc `DRAFT`, và mẫu chưa đủ câu đã kiểm tra, chỉ được tra cứu. Có thể bổ sung bằng **Kiểm tra / chỉnh sửa**. Chỉnh sửa cá nhân không bị lần nhập danh mục tiếp theo ghi đè.

## API

| Endpoint | Mục đích |
| --- | --- |
| `GET /api/dictionary` | Đọc từ vựng trực tiếp; mỗi hàng có `vocabularyId`, `sources`, lịch hiện có hoặc `dueAt: null` |
| `GET /api/bunpro/entries?kind=VOCAB&level=N5` | Danh mục, thứ tự lesson và trạng thái học |
| `GET /api/bunpro/entries?kind=GRAMMAR&level=N5` | Mẫu câu và câu luyện tập |
| `GET /api/bunpro/inventory` | Kiểm kê N5 và số mục chưa đủ nội dung đã kiểm tra |
| `POST /api/bunpro/import` | Nhập snapshot có phiên bản, không tạo thẻ |
| `PUT /api/bunpro/entries/{id}` | Lưu `CatalogContent`, đánh dấu chỉnh sửa cá nhân |
| `GET /api/bunpro/vocab/{id}/candidates` | Các từ có cùng cách viết hoặc cách đọc để người dùng đối chiếu |
| `POST /api/bunpro/vocab/{id}/learn` | Tự liên kết nếu khớp duy nhất; body `{ "vocabularyId": "…" }` để liên kết cụ thể hoặc `{ "createNew": true }` để tạo riêng |
| `POST /api/bunpro/lessons/{lesson}/learn?level=N5` | Chọn học các từ đủ nội dung; trả về mục cần lựa chọn và số mục bị chặn |
| `POST /api/bunpro/grammar/{id}/learn` | Chỉ kích hoạt câu đủ điều kiện, không tạo lại lịch đã có |
| `GET /api/bunpro/grammar/cards?level=N5&dueOnly=true` | Lấy các câu đã chọn học đến hạn |
| `POST /api/bunpro/grammar/cards/{id}/reviews` | Body `{ "rating": "GOOD", "responseText": "です" }`; cập nhật riêng câu đó |

Snapshot nhập có `version: 1`, `snapshotVersion`, `source`, `capturedAt`, `expectedVocab`, `expectedGrammar`, `entries`. Mỗi entry có `id`, `kind`, `level`, `lesson`, `position`, `sourceUrl`, `content`. Xem `n5.json` làm mẫu đầy đủ. Có thể nhập qua PowerShell khi backend đang chạy:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/bunpro/import `
  -ContentType 'application/json; charset=utf-8' `
  -InFile ./marugoto-vocab-trainer/backend/src/main/resources/bunpro/n5.json
```

Mã mục được tạo từ SHA-256 của URL chuẩn hóa, không dựa vào kanji. Mã câu ổn định trong từng mẫu. Không đổi mã khi sửa nội dung. Lần nhập mới không được bỏ câu đang có lịch ôn. Bản N5 đóng gói được nhập khi khởi động; không tải lại từ Bunpro hoặc đồng bộ tiến độ từ xa.

## Migration và sao lưu

Migration V4 chỉ thêm `bunpro_entries`, `bunpro_vocab_links`, `grammar_cards`, `grammar_review_logs` và chỉ mục; giữ ID và bảng dữ liệu trước đây. Bộ migration hiện có tạo bản sao SQLite trước khi chạy migration mới.

Backup phiên bản 2 bổ sung `learning`: danh mục, liên kết, lịch FSRS ngữ pháp và nhật ký tự đánh giá. Restore chấp nhận phiên bản 1 không có `learning`, vẫn giữ nội dung mới đang tồn tại. API ôn từ vựng cũ được giữ nguyên; ngữ pháp không dùng `vocabulary_id`. Restore là hợp nhất theo ID như trước, không thay toàn bộ CSDL.

## Kiểm thử

```powershell
cd marugoto-vocab-trainer
npm test
npm run build
cd backend
.\mvnw.cmd test
```

Kiểm thử bao gồm toàn bộ kiểm kê N5, nhập lại không tạo thẻ hoặc thay đổi dữ liệu, học từ trùng giữ nguyên lịch sử, khác cách đọc/nghĩa cần lựa chọn, lọc theo nhiều nguồn, từ điển không tạo thẻ, ôn một câu không tác động câu khác, thêm câu không tự kích hoạt, bảo vệ mã câu đang ôn và backup phiên bản 1/2.
