# Cấp SRS và nhập tiến độ Bunpro

Mở **Bunpro → Nhập tiến độ** trong kho từ hoặc kho ngữ pháp. Màn hình này nhận cả Vocabulary và Grammar trong cùng một lần nhập. Việc đọc tiến độ tài khoản Bunpro từ trình duyệt là bước thu thập riêng; chức năng này không tự đăng nhập hoặc đồng bộ tài khoản web.

## Cấp và lịch ôn

| Cấp | Tên | Chu kỳ mặc định |
| --- | --- | --- |
| 0 | Beginner 0 | Ôn lại sau 10 phút (quy tắc local) |
| 1–3 | Beginner 1–3 | 4, 8, 24 giờ |
| 4–6 | Adept 1–3 | 2, 4, 8 ngày |
| 7–9 | Seasoned 1–3 | 12, 24, 48 ngày |
| 10–11 | Expert 1–2 | 96, 176 ngày |
| 12 | Master | Không ôn định kỳ |

Good/Easy tăng một bậc nhỏ; Hard giữ bậc; Again giảm một bậc (thấp nhất 0), hẹn 10 phút. Đây là quy tắc local, chưa triển khai toàn bộ tùy chọn độ nghiêm khắc của Bunpro. Thẻ mới kích hoạt bằng “Chọn học” ở cấp 1 và có thể ôn ngay. Sau đó lịch được tính từ thời điểm trả lời theo chu kỳ của cấp mới.

“Cài đặt chu kỳ” nhận giờ, lưu số giây nguyên, đủ 11 giá trị tăng dần, tối đa 100 năm. Vocabulary và Grammar có cài đặt riêng. Đổi cài đặt không dời các hạn đã lưu.

Các thẻ cũ chỉ có mức lớn hiện “chưa xác định bậc”, giữ FSRS và hạn ôn cũ. Chỉ chuyển sang lịch cấp khi người dùng gán hoặc nhập cấp chính xác. API `/tiers` và `/intervals` cũ tiếp tục phục vụ dữ liệu cũ; `/tiers` chỉ gán mức lớn và xóa cấp chính xác. Giao diện mới dùng API `/progress/stages`.

## Nhập cả danh sách

1. Tải **Mẫu JSON/CSV**, hoặc **Xuất tiến độ JSON/CSV** để lấy các ID/link local. Mẫu chỉ minh họa định dạng; thay bằng tiến độ thực tế trước khi nhập. Cấp trống trong bản xuất là thẻ cũ chưa xác định bậc.
2. Chọn file JSON/CSV/TSV hoặc dán bảng có hàng tiêu đề. Giới hạn giao diện: 5 MB, tối đa 10.000 dòng.
3. Bấm **Xem trước tiến độ**. App tự ghép bằng ID hoặc URL Bunpro; nếu cung cấp cả hai thì cả hai phải khớp. Tham số deck, fragment và dấu `/` cuối link được bỏ khi đối chiếu. Không đoán theo tên hoặc kana.
4. Xem cấp/hạn trước–sau. Dòng không khớp, thiếu định danh, cấp ngoài 0–12 hoặc cùng mục xuất hiện nhiều lần cần xử lý riêng. Các mục hợp lệ có thể chọn cả lô, kể cả ngoài trang hiện tại.
5. Bấm **Áp dụng các dòng đã chọn**. Web là nguồn chuẩn cho cấp và hạn được cung cấp; mục ngoài danh sách giữ nguyên.

Hạn ôn dùng ISO 8601 có múi giờ, ví dụ `2026-10-20T09:00:00+07:00`. Hạn quá khứ được giữ để mục đến hạn ngay. Nếu bỏ trống: giữ hạn local có sẵn; mục mới tính hạn từ thời điểm preview cộng chu kỳ, gắn nhãn “Tính tại local”. Master luôn không có hạn ôn. Lần ôn tiếp theo dùng bảng lịch local.

```json
{
  "rows": [
    { "kind": "VOCAB", "sourceUrl": "https://bunpro.jp/vocabs/私", "stage": 5, "dueAt": "2026-10-20T09:00:00+07:00" }
  ]
}
```

JSON chấp nhận mảng trực tiếp hoặc `{ "rows": [...] }`. CSV/TSV dùng các cột `kind,entryId,sourceUrl,stage,dueAt,title,reading`; bắt buộc `kind`, `stage`, và ít nhất một trong `entryId`/`sourceUrl`. Bản xuất tiến độ chỉ chứa các mục đã có lịch. `title`/`reading` phục vụ đối chiếu, không sửa nội dung bài.

## An toàn và sao lưu

Preview không ghi database. Token preview chỉ tồn tại trong bộ nhớ server, có hiệu lực 30 phút; restart backend cần preview lại. Apply đối chiếu toàn bộ trạng thái thẻ/revision với preview, rồi ghi nguyên tử. Gửi lại cùng token và cùng lựa chọn trả kết quả cũ; cùng token nhưng khác lựa chọn trả 409. Nhập lại cùng tiến độ bằng preview mới hiện “Giữ nguyên” và không tăng revision.

Trước khi apply, backend xuất snapshot JSON nhất quán qua cùng kết nối giao dịch vào `APP_DATA_DIR/progress-backups/`. Lỗi sao lưu dừng nhập. File lưu toàn bộ dữ liệu học để có thể khôi phục qua chức năng Backup/Restore; đường dẫn xuất hiện sau khi nhập. Một lần nhập thất bại sau khi sao lưu có thể để lại file dự phòng, nhưng giao dịch database được rollback.

Nhập tiến độ không tạo lượt ôn giả, không tăng số lần đúng/sai. Nội dung DRAFT có thể nhận cấp nhưng vẫn phải hoàn thiện nội dung trước khi vào hàng đợi. Lịch từ điển và các bảng học cũ giữ độc lập.

Từ backup **v4**, bản sao lưu chứa cấp, chu kỳ theo cấp và nhật ký nhập. Phiên bản hiện tại xuất **v6**, bổ sung bài kiểm tra và trạng thái tạm dừng; vẫn nhận v1–v5. Ứng dụng cũ chỉ hỗ trợ v3 không thể đọc backup v4 trở lên. Khôi phục snapshot v4 trở lên đưa lịch, lượt ôn và nhật ký nhập Bunpro của các mục trong snapshot về đúng thời điểm sao lưu, kể cả gỡ lịch vừa tạo sau snapshot. Backup cũ giữ cách nhập gộp như trước; cấp vắng mặt được đọc là chưa xác định bậc, và backup thiếu phần bài kiểm tra không xóa đề/lượt làm hiện có. Migration V7 thêm cột nullable, không suy đoán hay đổi cấp/hạn của thẻ hiện có. Master dùng timestamp nội bộ năm 9999 để tương thích serialized Card; API trả `dueAt: null` và hàng đợi loại cấp 12.

## API local

Tất cả endpoint dưới `/api/bunpro/progress`; server chỉ bind loopback theo cấu hình hiện có.

| Method / đường dẫn | Request / response |
| --- | --- |
| `POST /preview` | `{rows: ProgressRow[]}` → `{previewId,expiresAt,rows}` |
| `POST /apply` | `{previewId,indexes: number[]}` → `{importId,backupPath,rows}`; indexes là chỉ số dòng từ 0 |
| `PUT /stages` | `{kind,entryIds: string[],stage: number}`; gán nguyên tử, đặt hạn theo cấp từ thời điểm gán |
| `GET /export` | `ProgressRow[]`, cả hai loại, chỉ các mục có lịch |
| `GET /intervals?kind=VOCAB` | `{seconds: number[11]}`; `kind` cũng nhận `GRAMMAR` |
| `PUT /intervals?kind=VOCAB` | `{seconds: number[11]}`; không dời hạn hiện tại |

`ProgressRow`: `kind` (`VOCAB`/`GRAMMAR`), `entryId` hoặc `sourceUrl`, `stage` (0–12), `dueAt` tùy chọn, `title`/`reading` tùy chọn. Timestamp được lưu với độ chính xác mili giây.

Mỗi dòng preview có `index,input,entryId,title,status,message,beforeTier,beforeStage,beforeDueAt,stage,dueAt,dueSource,revision,needsReview`. `status`: `NEW`, `UPDATE`, `UNCHANGED`, `ERROR`; `dueSource`: `WEB`, `LOCAL`, `CALCULATED`, `MASTER`. Chỉ dòng không có `ERROR` mới được chọn apply. Token hết hạn hoặc tiến độ thay đổi trả 409; payload không hợp lệ trả 400; không tạo được sao lưu trả 500, chưa ghi tiến độ. Khi kết quả apply chưa rõ do mất mạng, gửi lại cùng token và lựa chọn để nhận kết quả đã commit.

## Kiểm tra

Frontend: `node --test src/*.test.js src/utils/*.test.js`, `npm run build`.

Backend: `./mvnw.cmd test`, gồm `BunproExactProgressIntegrationTest`: cấp/lịch, nhập trộn, revision, idempotency, rollback giữa lô, backup lỗi/khôi phục và hợp đồng HTTP. Dùng database và thư mục dữ liệu dưới `backend/target`, không dùng tiến độ học thật.

Kiểm tra giao diện tự động (Chromium local, database riêng):

```powershell
cd marugoto-vocab-trainer/backend
.\mvnw.cmd -q -DskipTests compile dependency:build-classpath -Dmdep.outputFile=target/ui-classpath.txt
cd ..
node scripts/verify-bunpro-progress.mjs
```

Script lưu kết quả, log và ảnh desktop/mobile dưới `backend/target/progress-ui-*`. Cần Java 24, Chromium của Playwright và quyền kết nối localhost.

Beginner 0 được giữ nguyên khi nhập từ web. Nếu không có hạn nhập hoặc hạn local, cấp 0 được hẹn 10 phút; Hard ở cấp 0 cũng hẹn 10 phút. Bảng chu kỳ tùy chỉnh vẫn dành cho cấp 1–11. Migration V8 mở rộng giới hạn cấp, giữ toàn bộ thẻ và nhật ký, kể cả cấp chưa xác định.
