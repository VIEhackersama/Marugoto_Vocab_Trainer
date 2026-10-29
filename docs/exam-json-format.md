# Bài kiểm tra từ JSON

Mở **Bài kiểm tra → Nhập JSON**. Chọn file UTF-8 hoặc dán nội dung, bấm **Kiểm tra JSON**, kiểm tra thông tin đề rồi **Lưu đề vào thư viện**. Có thể nạp đề mẫu ngay trên trang.

Trang cung cấp `exam-template.json`, JSON Schema `exam.schema.json` (Draft 2020-12) và `generate-exam-prompt.txt` để tải/sao chép. Điền phạm vi học và yêu cầu vào prompt; yêu cầu công cụ sinh đề trả đúng JSON rồi import. Không cần Word hoặc dịch vụ AI trong ứng dụng.

Prompt sinh đề ưu tiên cách ra đề thi tiếng Nhật: đoạn đọc khi cần, câu hỏi ngắn gọn và các lựa chọn/ô trả lời; không cần lời dẫn dài hay hỏi lý thuyết “vì sao dùng mẫu này”. Không sinh `instructions` ở cấp đề/phần, không gợi sẵn đáp án trong câu dẫn. Giữ đủ ngữ cảnh để đáp án tốt nhất là duy nhất; phân tích chi tiết nằm trong `explanation` để đọc sau khi chấm. Đề cũ vẫn nhập được, nhưng hướng dẫn của từng phần không hiện phía trên câu hỏi khi làm bài.

**Font chữ tiếng Nhật** áp dụng cho đoạn đọc, câu hỏi, lựa chọn, furigana và ô trả lời trong bài thi. Quy tắc font tiếng Nhật chung của web không ghi đè thiết lập này; các trang học khác giữ font riêng. Cỡ chữ và giãn dòng vẫn áp dụng cho vùng nội dung bài thi.

Ô điền đáp án tự co giãn theo nội dung và font đang chọn; câu trả lời dài tự xuống dòng trong ô khi hết chiều ngang, kể cả trên điện thoại. Sau khi nộp, mục **Câu cần xem lại** liệt kê nội dung những câu tự chấm bị sai, đúng một phần hoặc bỏ trống. Bấm một mục để mở lại câu hỏi cùng bài làm và giải thích. Bảng số câu dùng xanh cho câu đúng, đỏ cho câu chưa đúng, vàng cho câu đúng một phần và xám cho tự luận; nhãn trạng thái cũng đọc được bằng bàn phím/trình đọc màn hình.

## Định dạng phiên bản 1

- Đề: `schemaVersion: 1`, `id`, `title`, `sections`; tùy chọn `description`, `instructions`, `timeLimitMinutes` (số nguyên 1–1440; bỏ trường nếu không giới hạn).
- Phần: `id`, `title`, `questions`; tùy chọn `instructions`, `passage` (đoạn đọc dùng chung cho các câu trong phần).
- Câu: `id`, `type`, `prompt`, `explanation`.
- `single_choice`: `options: [{id, text}]`, `correctOptionId`, `points?` (mặc định 1).
- `fill_blank`: `blanks: [{id, acceptedAnswers, points?}]`; mỗi `{{id}}` trong prompt tương ứng đúng một blank, xuất hiện đúng một lần. Điểm mặc định 1 mỗi ô. Câu nhiều ô được tính điểm từng ô.
- `essay`: `modelAnswer`; không có điểm tự động. Mọi nội dung viết vẫn được lưu.

Nội dung hiển thị có thể là chuỗi hoặc mảng `{text, reading?}`. Ví dụ `[{"text":"学校","reading":"がっこう"},{"text":"へ行きます。"}]`. `title` là chuỗi thường. Mảng token không được rỗng, token không chỉ có khoảng trắng. Không chia placeholder qua các token hoặc gắn reading lên token chứa placeholder. Nội dung được hiển thị như văn bản, không thực thi HTML/Markdown.

ID có 1–120 ký tự, bắt đầu bằng chữ/số, sau đó dùng chữ/số hoặc `_.:-`; không dùng `constructor`, `prototype`. ID câu duy nhất trong toàn đề, ID phần duy nhất trong đề; ID đáp án/ô trống duy nhất trong câu. Tối đa 100 phần và tổng 1000 câu. Trắc nghiệm có 2–20 lựa chọn; câu điền có 1–100 ô, mỗi ô 1–100 đáp án hợp lệ. Điểm là số nguyên 1–100000. Chuỗi tối đa 200000 ký tự, mỗi nội dung tối đa 10000 token. Trường không hỗ trợ bị từ chối. Backend kiểm tra thêm liên kết đáp án, ID và placeholder ngoài khả năng kiểm tra của JSON Schema.

Điền từ dùng NFC + bỏ khoảng trắng đầu/cuối rồi so khớp toàn bộ chuỗi. Không đổi kana, bỏ trường âm/dấu câu/dấu tiếng Việt hoặc đoán dạng chia. Các biến thể phải ghi rõ trong `acceptedAnswers`. Đáp án không được trống.

Nhập cùng ID và cùng nội dung (không phân biệt thứ tự thuộc tính object) dùng lại đề cũ; thay nội dung tạo phiên bản mới. Thứ tự mảng luôn có ý nghĩa. Mỗi lượt làm giữ bản chụp đề bất biến.

## Làm bài và lưu dữ liệu

Chọn **Sau khi nộp đề** hoặc **Ngay từng câu** trước khi bắt đầu. Lựa chọn không đổi giữa lượt. Chế độ từng câu khóa đáp án sau khi bấm kiểm tra/hoàn tất; có thể kiểm tra cả câu bỏ trống. Nộp bài khóa toàn bộ câu. Làm lại tạo lượt mới.

Điểm tự động cộng điểm trắc nghiệm và từng ô điền từ. Tỷ lệ đúng tính trên số câu trắc nghiệm + số ô điền; các ô có trọng số khác nhau vẫn chỉ là một đơn vị trong tỷ lệ. Tự luận dài được đếm riêng, không vào mẫu số hoặc điểm.

Font, cỡ chữ, giãn dòng và furigana chỉ áp dụng trong khu vực nội dung bài thi, ghi nhớ tại trình duyệt. Font lấy từ máy và có font dự phòng.

Đề và lượt làm lưu trong SQLite. Câu trả lời tự lưu sau khoảng 650ms ngừng nhập; bộ gõ IME lưu sau khi hoàn tất composition. Trình duyệt giữ bản nháp dự phòng. Nếu backend lỗi hoặc tab khác đã ghi phiên bản mới, trang giữ nội dung tại tab, cho tải bản nháp và chủ động dùng lại bản trên máy chủ. Nộp bài gửi cả câu trả lời hiện tại; không phụ thuộc việc autosave vừa hoàn tất hay chưa.

Nút **Tạm dừng** gửi ngay đáp án đang chọn/đang gõ, dấu xem lại và câu đang xem trong cùng một transaction. Khi lưu thành công, bài chuyển sang `PAUSED`, giữ số mili giây còn lại trong SQLite và ngừng đếm; nội dung câu hỏi được ẩn, không cho sửa/chấm/nộp khi đang dừng. Bài không giới hạn thời gian cũng tạm dừng được. Đóng app, khởi động lại backend hoặc tải lại trang không tự tiếp tục: mở lại bài rồi bấm **Tiếp tục làm bài** để backend đặt hạn mới từ thời gian còn lại. Thư viện và lịch sử có đường mở lại bài tạm dừng.

Thời gian do backend xác định. Nếu đóng trang khi bài còn `IN_PROGRESS`, đồng hồ vẫn chạy; cần bấm Tạm dừng và chờ thông báo lưu thành công trước khi thoát để giữ thời gian. Nếu lưu lỗi, trang giữ bản nháp nhưng không giả vờ đồng hồ đã dừng. Hết giờ, chỉ câu đã lưu trên backend được tính; hệ thống chốt khi nhận yêu cầu tiếp theo. Bấm dừng sau hạn không cứu được bài hoặc ghi thêm đáp án muộn. Revision vẫn bảo vệ khi hai tab cùng mở bài.

Migration V10 mở rộng trạng thái và thêm thời gian/câu đang xem, giữ nguyên các câu trả lời và lịch sử V9. Backup mới là **v6**, giữ cả trạng thái dừng, thời gian còn lại và vị trí câu; vẫn nhận v5 cũ không có các trường mới. Backup v1–v4 không có phần bài kiểm tra vẫn giữ nguyên dữ liệu kiểm tra đang có. Dữ liệu không tác động SRS/Bunpro.

## API cục bộ

Không thêm cơ chế đăng nhập; dùng cùng backend chỉ lắng nghe `127.0.0.1` như ứng dụng hiện tại. Đề xuất/export và file JSON nguồn chứa đáp án để chủ máy quản lý. Các response dành cho lượt đang làm loại bỏ đáp án/giải thích chưa được phép xem; đây là công cụ tự học cục bộ, không phải nền tảng thi chống gian lận.

| Method | Đường dẫn | Đầu vào / kết quả |
|---|---|---|
| GET | `/api/exams` | Danh sách thông tin đề và phiên bản, không có đáp án |
| POST | `/api/exams/preview` | JSON đề → thông tin đề hợp lệ; không ghi dữ liệu |
| POST | `/api/exams/import` | JSON đề → thông tin đề, `id` nội bộ, `version`, `reused` |
| GET | `/api/exams/{id}/export` | JSON gốc có đáp án để tải xuống |
| POST | `/api/exams/{id}/attempts` | `{feedbackMode: "on_submit" hoặc "per_question"}` → lượt mới |
| GET | `/api/exam-attempts?examId=...` | Lịch sử; bỏ query để lấy tất cả |
| GET | `/api/exam-attempts/{id}` | Tiếp tục/xem lượt; chốt nếu đã hết giờ |
| PUT | `/api/exam-attempts/{id}/answers` | Lưu toàn bộ câu trả lời và đánh dấu |
| POST | `/api/exam-attempts/{id}/questions/{questionId}/check` | Lưu và chấm/khóa một câu trong chế độ từng câu |
| POST | `/api/exam-attempts/{id}/submit` | Lưu và nộp trong một transaction; gửi lại trả cùng kết quả |
| POST | `/api/exam-attempts/{id}/pause` | `{revision, answers, flagged?, currentQuestionId?}` → lưu và tạm dừng trong một transaction |
| POST | `/api/exam-attempts/{id}/resume` | `{revision}` → tiếp tục bài đã dừng; không gửi đáp án để ghi đè |

Các thao tác lưu/check/submit/pause nhận `{revision, answers, flagged?, currentQuestionId?}`. `answers` là object theo ID câu: trắc nghiệm → ID lựa chọn, điền từ → object `{blankId: "nội dung"}`, tự luận → chuỗi. Bỏ khóa câu hoặc dùng chuỗi trống/object thiếu ô để biểu diễn chưa trả lời. `flagged` là mảng ID không trùng. `currentQuestionId` phải nằm trong đề; không gửi thì giữ vị trí đang lưu, hoặc câu đầu đối với bài V9 cũ. Câu đã khóa phải giữ nguyên dữ liệu đã lưu. `revision` tăng sau mỗi lần ghi, kể cả pause/resume; sai revision trả HTTP 409 và không ghi đè. Không gửi revision mới bằng cách đoán. Khi bài `PAUSED`, lưu/check/submit bị từ chối với 409; chỉ resume mới đưa bài về trạng thái chạy. Pause/resume không tự thử lại yêu cầu ghi với revision mới.

Response lượt gồm `id`, `examId`, `document` đã loại đáp án, `answers`, `flagged`, `currentQuestionId`, `results`, `metrics`, `status`, `feedbackMode`, `revision`, `startedAt`, `serverNow` và `deadlineAt`/`submittedAt` nếu có. `status` nhận `IN_PROGRESS`, `PAUSED`, `SUBMITTED`. Khi dừng, có `pausedAt` và `remainingMs` nếu đề có thời lượng, không có `deadlineAt`; khi tiếp tục, `deadlineAt = serverNow + remainingMs` và bỏ hai trường dừng. Timestamp là epoch milliseconds UTC, `remainingMs` là khoảng thời gian mili giây. Kết quả các câu bị khóa được trả riêng trong `results`. Mỗi thao tác kiểm tra hạn trước khi nhận câu trả lời; nếu quá hạn trả bản đã chốt. Lỗi hợp đồng dùng HTTP 400 `{error: "đường.dẫn: lý do"}`, ID không có trả 404. Trong lúc backend đang khởi tạo kho dữ liệu, API bài thi trả 503 kèm `Retry-After: 1`, chưa mở transaction để tránh tranh chấp SQLite; giao diện tự thử lại các yêu cầu đọc trong tối đa 15 giây.

Không cần cấu hình Postman workspace hoặc kết nối bên ngoài. `scripts/verify-exams.mjs` kiểm thử giao diện/API trên dữ liệu riêng trong `backend/target`, không sửa CSDL học thật.

Để chạy nghiệm thu: chạy `mvnw.cmd test` (Windows) hoặc `./mvnw test` tại thư mục backend với Java 24; sau đó chạy `npm run exams:verify` tại thư mục ứng dụng (cần Chromium của Playwright và Postman CLI). Đặt `JAVA_HOME` trỏ tới JDK 24 hoặc đưa Java 24 vào `PATH`. Script đọc classpath từ báo cáo Surefire, dùng cổng 18080/15173, tạo CSDL mới, kiểm tra chín assertion Postman cho preview/pause/resume và luồng UI, lưu ảnh/báo cáo trong `backend/target/exams-ui-*`, rồi dừng các tiến trình thử. Nếu cổng đang được dùng, chọn cổng khác bằng `EXAM_VERIFY_API_PORT`/`EXAM_VERIFY_WEB_PORT`; không dừng tiến trình đang chiếm cổng.

Đề thực tế `public/exams/de-01-phan-tich-2026-10-28.json` có 55 câu, gồm 5 câu tự luận và 100 điểm tự động. `npm run exams:generate:de01` tái tạo JSON từ nguồn biên soạn, `npm run exams:verify:de01` kiểm tra đầy đủ đáp án và giao diện với CSDL riêng (cổng mặc định 18081/15174). Phạm vi học và báo cáo cấu trúc nằm trong `artifacts/exams/de-01-20261028/` ở gốc repo; ảnh, database và đường dẫn tuyệt đối của từng lần chạy chỉ lưu dưới `backend/target`.
