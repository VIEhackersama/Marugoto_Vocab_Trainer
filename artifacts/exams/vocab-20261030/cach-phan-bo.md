# Đề từ vựng cá nhân · 30/10/2026

File để nhập: `marugoto-vocab-trainer/public/exams/de-tu-vung-ca-nhan-2026-10-30.json`.

## Căn cứ

Chỉ dùng các dòng `kind: VOCAB` trong file `bunpro-progress.json` người học cung cấp: 235 từ, không trùng entryId. 93 dòng thuộc loại khác được loại khỏi việc chọn từ. Không đọc tiến độ tài khoản trực tuyến, không cập nhật lịch SRS và không coi danh mục từ cài sẵn trong app là danh sách đã học. Mã SHA-256 của file nguồn và từng ID từ được ghi trong `coverage.json`.

| Cấp SRS trong file | Số từ | Số câu trong đề |
| --- | ---: | ---: |
| 0 | 4 | 8 |
| 1 | 27 | 27 |
| 2 | 3 | 3 |
| 3 | 13 | 13 |
| 4 | 30 | 13 |
| 5 | 43 | 8 |
| 6 | 81 | 4 |
| 7 | 34 | 4 |
| Tổng | 235 | 80 |

Kiểm tra đủ 47 từ cấp 0–3. Bốn từ cấp 0 (明るい・習う・返す・遊ぶ) có một câu nhận diện cách dùng và một câu tự ghi cách đọc. Các cấp 4–6 được lấy mẫu để kiểm tra duy trì và phân biệt nghĩa/cách dùng. Cấp 7 có bốn câu nghĩa trong đoạn ngắn để kiểm tra chọn lọc, không tiêu tốn quá nhiều câu cho nhóm đang ở cấp cao nhất của snapshot này.

Đề kiểm tra **76 từ đích khác nhau**, không tuyên bố bao phủ cả 235 từ. Cấp SRS là tín hiệu phân bổ, không phải phép đo độc lập về khả năng nhớ; cấp thấp có thể là từ mới hoặc vừa bị hạ cấp. File không cung cấp lịch sử đúng/sai hay độ tự tin từng từ, nên không suy diễn các thông tin đó từ thời hạn ôn.

## Cấu trúc

- Câu 1–10: chọn cách đọc; 1 điểm/câu.
- Câu 11–40: nghĩa và cách dùng của nhóm cần ưu tiên; 1 điểm/câu.
- Câu 41–52: cách dùng từ trong câu; 1 điểm/câu.
- Câu 53–60: nghĩa của từ trong hai đoạn ngắn; 1 điểm/câu. Không hỏi suy luận lịch trình hoặc biến đổi ngữ pháp.
- Câu 61–80: tự ghi cách đọc bằng hiragana; 2 điểm/câu.

Tổng 100 điểm; thời gian gợi ý 75 phút. Không có tự luận dài, bài chia động từ, câu chọn trợ từ hay câu hỏi lý thuyết “vì sao dùng cấu trúc này”. Một số lựa chọn nghĩa dùng tiếng Việt để không biến việc hiểu một cách diễn đạt ngữ pháp mới thành điều kiện chọn đúng từ. Ngữ liệu hỗ trợ có thể chứa từ cơ bản ngoài danh sách, nhưng từ đích được chấm đều được đối chiếu đúng ID với phần VOCAB của file nguồn.

Từ đang được kiểm tra cách đọc không được gắn furigana trong ngữ liệu của đề; các kanji có thể tiết lộ cách đọc đó cũng bỏ ruby. Các từ hỗ trợ khác vẫn có furigana bật/tắt. Câu điền chỉ nhận toàn bộ cách đọc bằng hiragana, không nhận chữ Hán thay thế hoặc dạng chia khác vì đề đã yêu cầu rõ cách đọc của từ in sẵn. App so khớp NFC và bỏ khoảng trắng đầu/cuối như hợp đồng JSON v1.

## Cách dùng

Chọn **Bài kiểm tra → Nhập JSON**, nhập file đề, chọn **Sau khi nộp đề** cho lần đầu. Dùng chế độ **Ngay từng câu** cho lượt luyện sau. Không cần nhập file tiến độ Bunpro vào màn hình nhập đề. Đáp án và giải thích có trong JSON theo hợp đồng nhưng được app giấu trong khi làm bài.

Không thay đổi đề cũ hoặc lịch sử lượt làm. Nguồn biên soạn: `scripts/exams/create-vocab-20261030.mjs`; tái tạo bằng Node với đường dẫn tới file tiến độ làm tham số. Xác minh kỹ thuật: `scripts/exams/verify-vocab-20261030.mjs` dùng database riêng dưới `backend/target`, kiểm tra import/chấm và hiển thị thật. Báo cáo không thay thế việc thẩm định sư phạm độc lập.
