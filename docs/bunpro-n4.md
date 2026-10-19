# Bunpro N4

Danh mục N4 được gộp thêm vào project, giữ kho N5 và tiến độ học hiện có:

- 1.095 từ vựng trên 22 lesson, 8.800 ví dụ, từ file capture người dùng gửi ngày 13/10/2026.
- 185 mẫu ngữ pháp trên 10 lesson, 3.230 ví dụ (gồm ví dụ trong giải thích), lấy ngày 13/10/2026 từ [Grammar Library](https://bunpro.jp/grammar_points) qua phiên Bunpro đã đăng nhập. Toàn bộ 185 mẫu thành công; 0 mục lỗi sau khi lấy lại các mục chậm tải.

Giữ nghĩa tiếng Anh, cấu trúc, giải thích, câu Nhật, cách đọc, furigana và bản dịch tiếng Anh gốc. Phần giải thích và ví dụ gốc ngữ pháp nằm trong `content.grammarSource`, tách khỏi câu điền khuyết đã biên soạn. Giao diện Ngữ pháp → Mẫu câu → N4 hiển thị đầy đủ phần nguồn; danh sách nhẹ chỉ tải chi tiết khi chọn một mẫu.

Bản nhập có trạng thái `DRAFT`, độ đầy đủ `NEEDS_REVIEW`: chưa dịch sang tiếng Việt và chưa được người dùng đối chiếu đủ từng mục. Không đánh dấu nguồn đã kiểm tra, không tự tạo câu điền khuyết hoặc lịch ôn. Muốn kích hoạt ôn tập, thêm nghĩa Việt/cách dùng và xác nhận trong Chỉnh sửa như N5.

Backend tự nạp `n4.json` và `n4-vocab-capture.json` lúc khởi động. Các chỉnh sửa cá nhân và lịch ôn được giữ khi nhập lại. Backup hiện có lưu cả dữ liệu nguồn ngữ pháp N4. Nếu ứng dụng đang chạy phiên bản cũ, đóng rồi mở lại bằng `start-app.vbs` để nạp backend mới.

## Tạo lại dữ liệu

Từ thư mục `marugoto-vocab-trainer`:

```powershell
node scripts/prepare-bunpro-vocab-capture.mjs C:/path/to/n4-vocab-capture.json
node scripts/bunpro-collector/collect-n4-grammar.mjs
node scripts/prepare-bunpro-n4.mjs
```

Lượt ngữ pháp lưu riêng ở `data/bunpro-n4-grammar/runs/`, không chuyển dashboard hoặc ghi đè lượt vocab. Dùng 4 tab chung một profile, cách tối thiểu 2 giây giữa các lần bắt đầu tải trang. Có thể truyền số worker 1–4 sau tên script, ví dụ `node scripts/bunpro-collector/collect-n4-grammar.mjs 2` khi nguồn chậm. Chạy lại sẽ phục hồi lượt đang có, thử lại mục lỗi và bỏ qua các mục đã lưu. Phiên hết hạn/CAPTCHA/giới hạn truy cập sẽ dừng để người dùng xử lý, dùng cùng chính sách phục hồi của collector hiện có. Không chạy đồng thời một collector khác tranh chấp profile.

Các file `n4-grammar-source.json`, `n4-vocab-source.json` giữ danh mục nguồn; `n4.json` giữ bản nhập; `n4-vocab-capture.json` giữ các fragment cần phân tích loại từ và ruby. Bản nguồn, ảnh và export đầy đủ của grammar nằm trong thư mục data, được Git bỏ qua. Không thu audio, Self-Study, cookie hoặc thông tin tài khoản vào bản nhập.

## Kiểm tra

```powershell
node --test src/*.test.js
npm run build
cd backend
.\mvnw.cmd test
```

Kiểm tra N4 bao gồm URL/thứ tự lesson, số mục, furigana khớp câu gốc, không kích hoạt học khi thiếu Việt, nhập lại giữ sửa cá nhân/lịch, backup và từ chối capture giả cấp độ hoặc thay URL ngoài danh mục.
