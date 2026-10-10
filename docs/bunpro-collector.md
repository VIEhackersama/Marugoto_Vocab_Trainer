# Worker thu thập Bunpro N5

Worker chạy local, chưa gọi Ollama/OpenAI. Nó lấy 10 mục đầu của 10 lesson ngữ pháp và 10 mục đầu của 10 lesson từ vựng từ danh mục N5 đã lưu. Nội dung nguyên ngôn ngữ nguồn, chưa dịch và chưa nhập vào kho học.

## Khởi động trên Windows

```powershell
cd C:\Users\Admin\Documents\marugoto-vocab-trainer\marugoto-vocab-trainer
npm install
npm run collector:install
npm run collector
```

`collector:install` chỉ cần cho lần đầu, hoặc sau khi đổi phiên bản Playwright. `npm run collector` mở dashboard tại <http://127.0.0.1:4319> và chạy dịch vụ nền. Đóng terminal hoặc dashboard không dừng dịch vụ; máy cần còn thức. Khởi động lại máy sẽ dừng dịch vụ. Chạy lại lệnh và bấm **Tiếp tục** để phục hồi.

1. Bấm **Mở đăng nhập Bunpro**. Đăng nhập tài khoản có gói học trong Chromium riêng vừa mở. Nếu Chromium tải về không khởi động được, worker thử Edge rồi Chrome đã cài, đều dùng profile riêng. Phiên Chrome/Edge thông thường của bạn không tự chuyển sang profile này.
2. Bấm **Bắt đầu**. Worker lấy một mục mỗi lần, cách nhau ít nhất 2 giây.
3. Nếu worker yêu cầu xác minh, đăng nhập hoặc chờ giới hạn truy cập, xử lý trong Chromium rồi bấm **Tiếp tục**. Có thể đóng Chromium sau khi đăng nhập; lần thu thập tiếp theo sẽ dùng lại profile.
4. Chọn từng mục để xem ví dụ, furigana, bản dịch gốc, ghi chú và ảnh vùng bài học. Bấm **Tôi đã đối chiếu đầy đủ với nguồn** chỉ sau khi so sánh thật.
5. **Xuất JSON** chứa trạng thái của cả 20 mục và dữ liệu đã thu được. **Báo cáo** tải bản ngắn. **Lượt mới** giữ nguyên thư mục lượt trước và tạo hàng đợi mới.

Worker không mở trang để học, bookmark hoặc thay đổi tiến độ Bunpro. Các câu Self-Study cá nhân và thảo luận không thuộc phạm vi thu thập. Không lưu toàn bộ HTML trang, cookie hoặc thông tin tài khoản trong export. Profile đăng nhập nằm riêng trong thư mục dữ liệu local, được Git bỏ qua.

## Dữ liệu và trạng thái

Tất cả dữ liệu nằm ở `marugoto-vocab-trainer/data/bunpro-collector/` (đã được Git bỏ qua):

- `profile/`: phiên Chromium riêng. Không chia sẻ thư mục này.
- `service.log`: nhật ký khởi động dịch vụ.
- `runs/run-.../state.json`: hàng đợi và tiến độ được ghi sau mỗi thay đổi.
- `runs/run-.../<id>/result.json`: nội dung có cấu trúc; `source.json`: bản nội dung nguồn đã lọc; các file PNG: ảnh vùng bài học.
- `runs/run-.../export.json`, `report.md`: báo cáo cập nhật sau mỗi mục; export.json được ghi khi dừng/kết thúc. Nút Xuất JSON luôn xuất dữ liệu hiện có.

Trạng thái thu thập: `QUEUED`, `RUNNING`, `CAPTURED`, `FAILED`. Trạng thái độ đầy đủ: `NOT_CHECKED`, `NEEDS_REVIEW`, `REVIEWED`. Số câu lấy được không chứng minh rằng tất cả câu trên nguồn đã được lấy; bản đầu luôn yêu cầu đối chiếu. Theo yêu cầu mới, bộ trích xuất không lấy audio hoặc URL audio.

Thời hạn 60 giây cho một mục, tối đa 3 lần thử tổng cộng (lần đầu + 2 lần thử lại). Khoảng chờ thử lại là 3 và 6 giây. Lỗi riêng lẻ không chặn hàng đợi. Mất đăng nhập, CAPTCHA và giới hạn truy cập tạm dừng toàn lượt. Bấm **Tạm dừng** sẽ để mục hiện tại lưu xong rồi dừng. Chạy lại mục `CAPTURED` không tải lại; dùng **Lượt mới** nếu muốn lấy lại nguồn.

Dashboard cập nhật mỗi 2 giây và cảnh báo mất kết nối. Dashboard không gọi ChatGPT; mình chỉ đọc báo cáo khi bạn yêu cầu hoặc trong lượt làm việc đang hoạt động. Không có tác vụ Codex định kỳ được tạo.

## API local và kiểm thử

Dịch vụ bind `127.0.0.1`, kiểm tra Host/Origin, không bật CORS. Port mặc định 4319; có thể đổi bằng biến môi trường `BUNPRO_COLLECTOR_PORT`.

| API | Chức năng |
| --- | --- |
| `GET /api/status` | Heartbeat, trạng thái lượt, danh sách mục và thống kê |
| `POST /api/login` | Mở trình duyệt riêng ở trang đăng nhập |
| `POST /api/start`, `/api/resume`, `/api/pause`, `/api/retry`, `/api/new` | Điều khiển hàng đợi |
| `GET /api/items/<id>` | Nội dung mục |
| `POST /api/items/<id>/review`, `/unreview` | Lưu hoặc bỏ xác nhận đối chiếu |
| `GET /api/items/<id>/artifacts/<filename>` | Bản nguồn JSON hoặc ảnh đã ghi nhận |
| `GET /api/export`, `/api/report` | Tải kết quả và báo cáo |

```powershell
npm run collector:test
npm run collector:verify
npm test
npm run build
```

Kiểm thử dùng trang mẫu trong Chromium và collector giả cho timeout/phục hồi/đăng nhập; không dùng tài khoản thật. Để nghiệm thu nguồn thật: chạy 20 mục rồi dùng `npm run collector:verify`. Lệnh gọi `POST /api/verify` để tải lại 2 ngữ pháp + 2 từ vựng bằng phiên worker, so sánh tiêu đề, nghĩa, cấu trúc, câu Nhật, bản dịch và furigana với dữ liệu đã lưu; ghi `verification.json` và ảnh mới vào thư mục lượt chạy. Kiểm tra này không tự xác nhận `REVIEWED`: vẫn cần đối chiếu trực quan để xác nhận độ đầy đủ. Nếu cấu trúc Bunpro đổi, giữ trạng thái cần kiểm tra và cập nhật bộ trích xuất trước khi xác nhận.

Để chạy dịch vụ trong terminal thay vì nền: `npm run collector:serve`; Ctrl+C sẽ kết thúc mục hiện tại, lưu tiến độ và đóng Chromium. Để dừng dịch vụ nền, dùng Task Manager tìm tiến trình Node có command line `scripts/bunpro-collector/server.mjs` và kết thúc tiến trình đó. Không kết thúc các tiến trình Node khác.

## Kết quả kiểm tra ngày 10/10/2026

- Đã thu thập thật 10 mục ngữ pháp + 10 từ vựng bằng phiên Bunpro có gói học: 20/20 thành công, 271 ví dụ, mỗi mục có bản nguồn và ảnh đối chiếu.
- Tải lại các mục だ, が, 私, パン: tiêu đề, nghĩa, cấu trúc, câu Nhật, bản dịch và furigana khớp bản lưu; số ví dụ lần lượt 19, 17, 10, 10.
- Khởi động lại dịch vụ vẫn khôi phục đủ 20 mục và xuất lại dữ liệu; không tải lại các mục đã hoàn thành.
- 58 kiểm thử Node/Chromium đều qua; ứng dụng Vite build thành công.
- Trên máy này bản Chromium tải về báo `spawn UNKNOWN`; Edge với profile riêng hoạt động. Các mục vẫn là `NEEDS_REVIEW`; kiểm tra lặp lại bằng bộ trích xuất không thay thế việc xác nhận độ đầy đủ bằng mắt. Nút audio không cung cấp URL trong DOM ở các trang đã kiểm tra, nên dữ liệu ghi rõ phần này chưa thu được.

## Toàn bộ từ vựng N5

Danh mục hiện có 1.100 URL duy nhất trên 22 lesson. Bấm **Toàn bộ từ vựng N5**, rồi **Bắt đầu**. Lượt mẫu cũ được giữ riêng. Dashboard có tìm kiếm từ và phân trang 50 mục. API `POST /api/full-vocab` tạo lượt đầy đủ, từ chối khi worker còn chạy; `/api/start` bắt đầu lượt đó.

Bộ trích xuất `bunpro-dom-2-no-audio` lưu nghĩa ở tiêu đề, toàn bộ Dictionary Definition nếu có, cùng các câu Nhật, cách đọc/furigana và bản dịch ví dụ gốc. Không dịch sang tiếng Việt và không thu audio. Ví dụ thiếu câu/bản dịch hoặc thiếu nghĩa sẽ được thử lại rồi báo lỗi. Vẫn cần kiểm tra độ đầy đủ: trạng thái đã lấy không tự chuyển thành đã đối chiếu.

Đóng chat/dashboard không dừng tiến trình nền. Sau khi tắt máy hoặc worker bị ngắt, chạy `npm run collector` rồi bấm **Tiếp tục**; các mục đã lưu được dùng lại. Lượt 1.100 mục không gọi mô hình AI và không thay đổi API import/kho học.

## Hai worker song song

Dashboard cho chọn **1 worker** hoặc **2 worker** sau khi tạm dừng và đợi các mục đang lấy lưu xong. Sau đó bấm **Tiếp tục**. Số worker được lưu trong state.json và khôi phục sau khi khởi động lại. API: `POST /api/workers/1` hoặc `/api/workers/2`; từ chối đổi khi còn đang chạy.

Hai worker dùng hai tab trong cùng một browser context/profile, không mở hai tiến trình tranh chấp profile. Mỗi mục được giữ riêng trong suốt quá trình thử lại. Bộ điều phối chỉ báo kết thúc và xuất JSON sau khi cả hai worker đã dừng. Giữ tối thiểu 2 giây giữa các lần bắt đầu tải trang trên toàn bộ worker; lỗi đăng nhập/CAPTCHA/giới hạn truy cập dừng giao thêm mục, các mục đang lấy được lưu xong.

## Tự phục hồi lỗi phiên/trình duyệt

Khi trình duyệt bị đóng/mất kết nối, không mở được trình duyệt, hoặc Bunpro tạm hiển thị thiếu quyền gói học/phiên đăng nhập, worker tự thử tối đa **3 lần tổng cộng**, chờ **10 giây rồi 20 giây** giữa các lần. Nếu trình duyệt đã đóng, lần sau mở lại profile đang lưu. Không lấy lại các mục đã hoàn thành. Dashboard hiển thị “Chờ tự thử lại” và thời điểm thử tiếp theo.

Sau 3 lần vẫn lỗi, mục được đánh dấu cần can thiệp và cả lượt chuyển `AWAITING_USER`; xử lý phiên rồi bấm **Tiếp tục** hoặc **Thử lại mục lỗi** để cấp lại số lần thử. CAPTCHA và giới hạn truy cập vẫn dừng ngay. Lỗi tải/nội dung riêng lẻ giữ chính sách 3 lần tổng cộng với khoảng chờ 3/6 giây. Cơ chế này chạy trong tiến trình Node; nếu cả tiến trình bị tắt, vẫn cần khởi động lại dịch vụ.
