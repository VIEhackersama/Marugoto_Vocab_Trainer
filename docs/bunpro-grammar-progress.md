# Mức học và lịch ôn ngữ pháp Bunpro N5

Mở **Ngữ pháp → Mẫu câu** để xem 132 mẫu N5. Gán Beginner, Adept, Seasoned, Expert hoặc Master từng mẫu trong panel chi tiết, hoặc chọn nhiều checkbox rồi **Gán mức**. Dải thống kê và bộ lọc lesson/mức/trạng thái giúp chọn phạm vi học. Tìm kiếm bao gồm nghĩa, cấu trúc và cách dùng.

**Chọn học mẫu này** kích hoạt Beginner đến hạn ngay. Gán mức bằng tay đặt hạn từ thời điểm gán cộng chu kỳ mức. Nội dung cần nghĩa Việt, cấu trúc và cách dùng đã kiểm tra trước khi kích hoạt; chỉnh sửa vẫn giữ toàn bộ câu luyện tập và ID.

**Ôn tập** và **Ôn Bunpro** đều dùng lịch mới. Một mẫu xuất hiện một lần khi đến hạn, các câu đã kiểm tra được luân phiên theo số lần ôn. Nhập đáp án tiếng Nhật, bấm Enter sau khi hoàn tất bộ gõ hoặc **Xem đáp án**, đối chiếu câu/giải thích rồi tự đánh giá. Nếu chưa có câu điền khuyết đã kiểm tra, ôn nghĩa và cách dùng mẫu. Duyệt chi tiết không tính là ôn.

Quy tắc dùng chung với kho từ: Good/Easy tăng một mức, Hard giữ mức, Again giảm một mức và hẹn đúng 10 phút. Giới hạn Beginner/Master; Master tiếp tục ôn định kỳ. FSRS tính hạn, giới hạn interval bằng chu kỳ mức mới. Mặc định 1/3/7/14/30 ngày; cài đặt ngữ pháp tách riêng từ vựng. Thay đổi chu kỳ không dời các hạn đã lưu. Gán lại mức giữ trí nhớ FSRS và lịch sử.

Migration V6 thêm `bunpro_grammar_cards`, `bunpro_grammar_review_logs`, `bunpro_grammar_settings`; tiến độ theo ID của mẫu, không theo từng câu. Các bảng ngữ pháp cũ và lịch từ điển/từ vựng được giữ nguyên, không tự kích hoạt mẫu vào hệ thống mới. Backup v3 bao gồm mức, FSRS, nhật ký và chu kỳ mới; các trường ngữ pháp mới là tùy chọn nên vẫn đọc backup v1/v2 và v3 trước đợt này.

API dưới `/api/bunpro/grammar/progress`: `GET /entries`, `GET/PUT /entries/{id}`, `PUT /tiers`, `POST /entries/{id}/learn`, `GET/PUT /intervals`, `GET /queue`, `POST /entries/{id}/reviews`. Payload gán mức, chu kỳ và kết quả ôn giống API vocab; kết quả ôn kiểm tra request ID và revision để chặn trùng/stale. Backend và frontend dùng chung `BunproProgress`, `BunproCatalogWorkspace`, `BunproProgressReview`.
