# Kho từ Bunpro N5 và lịch ôn riêng

Kho N5 được bổ sung từ capture `run-2026-10-10T05-18-18-420Z-f9bde8b2`: **1.100 từ, 11.205 ví dụ**. Dữ liệu đóng gói tự nhập khi backend khởi động. Nghĩa Việt, ID và chỉnh sửa cá nhân hiện có được giữ lại. Nguồn vẫn ở trạng thái `NEEDS_REVIEW`; số ví dụ khớp JSON không chứng minh đầy đủ so với trang Bunpro.

## Sử dụng

- Mở **Bunpro → Kho từ**. Lọc lesson, mức học, loại từ hoặc tìm theo từ/cách đọc/nghĩa. Bấm một từ để xem định nghĩa, loại từ theo từng nghĩa và ví dụ Nhật–Anh. Furigana có thể tắt; từ có hơn 10 ví dụ có nút xem toàn bộ.
- Dải Beginner, Adept, Seasoned, Expert, Master và Chưa học đồng thời là bộ lọc. Chọn checkbox cạnh từ, hoặc **Chọn trang này**, rồi **Gán mức** để thao tác hàng loạt. Lựa chọn được giữ khi đổi trang; nút **Bỏ chọn** xóa lựa chọn.
- **Gán mức** kích hoạt lịch riêng và đặt hạn từ thời điểm gán + chu kỳ của mức. **Chọn học từ này** kích hoạt Beginner đến hạn ngay; bấm lại không đặt lại lịch đã có. Từ cần nghĩa Việt đã kiểm tra trước khi kích hoạt.
- **Ôn Bunpro** có hai chiều Nhật–Việt và Việt–Nhật, dùng chung tiến độ của một từ. Lật đáp án rồi tự đánh giá: Good/Easy tăng một mức, Hard giữ mức, Again giảm một mức và ôn lại sau 10 phút. Không vượt ngoài Beginner/Master.
- **Cài đặt chu kỳ** mặc định 1/3/7/14/30 ngày; giá trị là số nguyên dương tăng dần, tối đa 36.500 ngày. Đây là giới hạn tối đa: FSRS có thể hẹn sớm hơn. Thay đổi áp dụng từ lần ôn hoặc gán mức tiếp theo, không dời hạn đang lưu. Master vẫn ôn định kỳ.
- **Chỉnh sửa** cho sửa bản Việt, phân loại từng nghĩa, nhãn chưa nhận diện và bản dịch Việt của ví dụ. Xác nhận đối chiếu nguồn là thao tác riêng với xác nhận nghĩa Việt. Nhập lại nguồn giữ toàn bộ phần chi tiết đã sửa.
- **Nhập JSON nguồn** hiển thị preview trước khi nhập: kiểm kê, URL trùng, lỗi, số từ khớp và các nhãn chưa nhận diện. Bản N5 hiện tại yêu cầu đúng 1.100 từ / 11.205 ví dụ; không tự thêm từ vào lịch ôn.

Có **28 từ chưa có loại từ cấu trúc trong nguồn**, ví dụ レストラン ghi “No dictionary entry found”; chúng được hiển thị là Chưa phân loại. Nhãn chưa nhận diện được giữ nguyên để sửa. Không đoán nhóm động từ từ đuôi る. Capture chứa ví dụ N4/N3/N2 cho từ trong deck N5; giữ thứ tự và nhãn cấp độ gốc.

## Lưu trữ và tương thích

Migration V5 bổ sung `bunpro_vocab_content`, `bunpro_vocab_cards`, `bunpro_vocab_review_logs`, `bunpro_vocab_settings`. FSRS Bunpro có trạng thái, hạn ôn và log riêng theo `entryId`; không ghi vào `study_cards` hoặc `review_logs` của từ điển. Từ đã học bằng hệ thống cũ không tự kích hoạt lịch mới. API học cũ vẫn còn để tương thích, nhưng giao diện Bunpro mới sử dụng API riêng bên dưới.

FSRS dùng retention 0,9 và learning steps 1/10 phút; lịch đề xuất được giới hạn bằng chu kỳ mức sau khi tăng/giảm. Again được đặt đúng 10 phút. Hạn cuối cùng được ghi đồng nhất vào serialized Card, `due_at` và nhật ký. Gán tay giữ stability, difficulty, last review và lịch sử. Kết quả ôn có mã request duy nhất và revision để chặn gửi trùng hoặc ghi đè tiến độ đã đổi.

Backup phiên bản **3** bao gồm nội dung chi tiết, lịch, log và chu kỳ Bunpro. Restore vẫn nhận phiên bản 1/2; trường mới vắng mặt không xóa dữ liệu đang tồn tại. Bản backup mới không dùng để restore trên phiên bản ứng dụng cũ chỉ hỗ trợ đến v2.

HTML capture được phân tích offline bằng jsoup, chuyển thành văn bản và token ruby. Không render HTML nguồn trực tiếp, không tải URL và không thu audio. API danh sách chỉ trả metadata; ví dụ/định nghĩa đầy đủ tải khi mở chi tiết.

## API

Tất cả endpoint dưới `/api/bunpro/vocab`:

| Endpoint | Nội dung |
| --- | --- |
| `GET /entries?level=N5` | Danh sách nhẹ, `tier`, `dueAt`, `revision`, loại từ và số ví dụ |
| `GET /entries/{id}` | Chi tiết, `content.vocab` chứa senses/examples/tokens và metadata nguồn |
| `PUT /entries/{id}` | Lưu CatalogContent và chi tiết cá nhân |
| `POST /capture/preview` | Nhận JSON capture và trả kiểm kê/lỗi |
| `POST /capture/import` | Nhập nguyên capture khi toàn bộ kiểm kê hợp lệ |
| `PUT /tiers` | `{ "entryIds": ["…"], "tier": "EXPERT" }`; nguyên tử cho toàn bộ lựa chọn |
| `POST /entries/{id}/learn` | Kích hoạt Beginner đến hạn ngay nếu chưa có lịch |
| `GET /intervals`, `PUT /intervals` | `{ "days": [1,3,7,14,30] }` |
| `GET /queue?level=N5` | Mỗi từ đủ điều kiện đến hạn xuất hiện một lần |
| `POST /entries/{id}/reviews` | `{ "requestId": "UUID", "rating": "GOOD", "direction": "JP_TO_VI", "revision": 0 }` |

## Tạo lại dữ liệu đóng gói và kiểm tra

Từ thư mục `marugoto-vocab-trainer`:

```powershell
node scripts/prepare-bunpro-vocab-capture.mjs C:/path/to/capture.json
npm test
npm run build
cd backend
.\mvnw.cmd test
```

Script đóng gói giữ định nghĩa, ví dụ và hai fragment HTML cần cho phân loại/furigana; bỏ phần wrapper trùng và diagnostics. Kiểm thử đối chiếu mọi ví dụ, nhóm từ từ nguồn, gán mức, giới hạn FSRS, Again, revision/request trùng, nhập lại, lịch cũ và backup v1/v2/v3. Kiểm tra UI thủ công trên desktop 1366×900 và mobile 390×844 gồm nhập JSON gốc, lọc godan, xếp mức hàng loạt, lật đáp án, tăng mức, chỉnh sửa và furigana.

Ứng dụng đang chạy cần đóng rồi mở lại bằng `start-app.cmd`/`start-app.vbs` để backend nạp migration và dữ liệu mới. Bản preview kiểm thử sử dụng CSDL riêng ở `backend/target/bunpro-ui`, không phải tiến độ học thật.

Ngữ pháp N5 dùng cùng hệ thống mức học và quy tắc FSRS, với lịch và chu kỳ riêng. Xem [hướng dẫn ngữ pháp](bunpro-grammar-progress.md).
