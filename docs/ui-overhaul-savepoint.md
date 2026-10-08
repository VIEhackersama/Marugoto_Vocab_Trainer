# Savepoint — UI overhaul Marugoto

Ngày: 08/10/2026. **Savepoint lịch sử; công việc đã được tiếp tục và hoàn tất ngày 08/10/2026.**

Trạng thái mới nhất, kết quả kiểm chứng và cách mở bản QA nằm trong [ui-overhaul-handoff.md](ui-overhaul-handoff.md). Những việc “còn lại” và session ID bên dưới mô tả thời điểm tạm dừng, không phải trạng thái hiện tại.

## Tiếp tục tại phiên sau

Đọc file này và `docs/ui-ux-overhaul-plan.md` ở repo ngoài. Tiếp tục hoàn thiện/kiểm chứng bản overhaul hiện có, không bắt đầu lại audit hoặc viết lại app. Người dùng đã nói “Proceed” để triển khai plan; sau đó yêu cầu tạm dừng và lưu savepoint.

- Repo ngoài: `C:\Users\Admin\Documents\marugoto-vocab-trainer`.
- App: `C:\Users\Admin\Documents\marugoto-vocab-trainer\marugoto-vocab-trainer`.
- Code đã lưu trong working tree, **chưa commit**. Không reset/clean/stash toàn repo.
- Hướng đã chốt: laptop là chính; công cụ học chuyên nghiệp, nhiều thông tin; ưu tiên thêm từ đầy đủ Kanji/Kana/Romaji/nghĩa trong một lần và cải thiện Từ điển; bảo toàn tính năng học.
- Skill đã dùng: `C:\Users\Admin\.agents\skills\redesign-existing-projects\SKILL.md`.
- App có `.codegraph/`: dùng `codegraph explore` trước khi tìm/đọc code để hiểu hay định vị. Graph trả source hiện tại nhưng thường trim các đoạn; đọc tiếp đúng đoạn chưa hiện khi cần.

## Phần đã triển khai

1. `src/main.jsx`: shell Học tập / Từ điển / Bộ từ / Cài đặt; tách UI theo component; editor chung thay form cũ và modal Kanji cũ; giữ API, scheduler, queue và lifecycle. Có thông báo trong app và dialog xác nhận; không dùng window.confirm/alert cho các luồng đã sửa.
2. `src/components/VocabularyEditor.jsx`: Kanji, Kana, Romaji, nghĩa; gợi ý Marugoto; điền gợi ý có xác nhận nếu ghi đè; paste `魚（さかな）` tách trường; preview Furigana/audio; phát hiện trùng theo chính sách đồng âm hiện có; lỗi lưu giữ draft; lưu và thêm tiếp; dirty-close; Ctrl/Cmd+Enter; focus/trap/IME guard; desktop side panel, mobile/floating dialog. Từ cũ thiếu reading vẫn sửa được. Có metadata tiến độ khi sửa.
3. `src/utils/vocabularyEditor.js` + `.test.js`: adapter dữ liệu cũ và Kana→Romaji; Romaji manual không tự ghi đè. Long vowels explicit (`コー`→`koo`, `こう`→`kou`); unknown Kanji không đoán. Không ép Katakana thành Hiragana trong dữ liệu gốc.
4. `DictionaryWorkspace.jsx`: bảng mặc định, cột Nhật/nghĩa/bộ/trạng thái/thao tác, Ruby highlight, compact filters, search không dấu, bảng/thẻ, giữ Gojuon nhóm thẻ, công cụ batch Kanji/flush, trạng thái rỗng. Phân trang 80 kết quả, bộ lọc/chế độ lưu localStorage. Header và results inert khi editor mobile/dialog khác mở.
5. `AppHeader.jsx`, `DeckLibrary.jsx`, `SettingsPanel.jsx`, `Icon.jsx`, `JapaneseTerm.jsx`, `DialogFrame.jsx`: nav, thư viện PDF/custom, preferences/backup, SVG icons, accessibility dialogs. Dialog/editor có suspended để không tranh Escape/Tab với dialog xác nhận phía trên.
6. `src/workspace.css`: màu xanh đậm + nền xám nhạt, giữ Be Vietnam Pro/Noto Sans JP; responsive; nút lưu trong viewport; editor scroll độc lập (bọc fieldset bằng div cuộn để tránh lỗi Chromium); bảng và học gọn hơn; setup nâng cao dùng details; câu hỏi/đáp án đồng bộ palette. Các file mới đã format bằng Prettier 3.6.2 transient, không thêm dependency app.
7. `index.html` + `public/favicon.svg`: favicon, description, theme-color.
8. Typed Recall dùng được với bộ nhỏ; trắc nghiệm vẫn yêu cầu 5 đáp án khác nhau. Setup CTA disabled theo pool thực tế.
9. Timer câu hỏi tạm dừng khi mở editor/dialog hoặc chuyển khỏi Quiz/Review; khi quay lại dịch `questionStartTime` để loại thời gian tạm dừng khỏi phản xạ. Có banner quay lại phiên. Không chấm FSRS phía sau editor. Queue chờ Again vẫn giữ lịch dueAt thực tế.
10. Edit cập nhật nội dung queue/options/waiting mà giữ ID và tiến độ. Xóa từ/bộ, import bộ mới và restore được chặn/hướng dẫn khi phiên học đang diễn ra. Backup export vẫn dùng được. HMR tái sử dụng React root.

## Các thay đổi backend có sẵn của người dùng — phải bảo toàn

Những file này đã dirty **trước khi agent triển khai UI**, agent không sửa chúng:

- `backend/src/main/java/vn/marugoto/trainer/ReviewService.java`
- `backend/src/main/java/vn/marugoto/trainer/StudyService.java`
- `backend/src/test/java/vn/marugoto/trainer/DeckAndReviewIntegrationTest.java`
- `backend/src/main/resources/db/migration/V3__unify_study_card_schedules.sql` (untracked)

Code backend hiện đồng bộ schedule theo vocabulary giữa hai chiều. Không tự đổi scheduler/migration hay lấy README cũ mô tả lịch độc lập làm baseline.

## Kiểm chứng đã thực hiện

- `npm test`: **30/30 pass** (26 cũ + 4 test converter/adapter/validation/duplicate mới).
- `npm run build`: đã pass sau khi sửa JSX ban đầu; **cần chạy lại final build** vì sau đó còn tinh chỉnh timer, CSS, dialog và metadata editor.
- Kiểm tra tham chiếu bằng Babel trên 10 JSX modules: 0 unbound references. Script tạm `tmp/check-ui-bindings.mjs`; cần chạy lại cuối cùng.
- Backend integration: **5/5 pass**, dùng JDK 24 + Mockito javaagent rõ ràng. Chạy trên `backend/target/marugoto-test.db`, không dùng DB học thật.
- Browser E2E với backend thật, database QA riêng: validation; thêm 猫 đủ 4 trường; lưu/thêm tiếp; paste 図書館 tách Kanji/Kana; giữ Romaji sửa tay; dirty-close tiếp tục draft; cảnh báo duplicate; sửa 猫 sau khi ôn vẫn giữ 1 lượt; Ctrl+Enter lưu 桜; search tiếng Việt không dấu; mobile không tràn ngang.
- PDF: upload qua browser file chooser lần đầu lỗi tab stale; **retry đã thành công**, thấy preview 26 từ + 7 gán Kanji, xác nhận nhập thành công vào DB QA. Thư viện hiện có 38 từ (12 custom + 26 PDF).
- Typed Recall: bộ 2 từ bắt đầu được; trả lời đúng, FSRS lưu thành công. Trả lời sai tạo Again, màn chờ 00:55 xuất hiện, kết thúc sớm có confirmation và kết quả 0/1.
- Timer: mở editor lúc còn 9.9/10 giây, làm QA khác ~29 giây, timer vẫn 9.9 và card vẫn 0 lượt ôn; đóng editor/chuyển Dictionary có banner tiếp tục; quay lại trả lời được.
- Việt→Nhật trắc nghiệm: tạo 5 lựa chọn, giao diện hiển thị đủ; **chưa kiểm tra click đáp án đúng cuối cùng** (đã dừng theo yêu cầu). Lần cuối câu “bên cạnh”, đúng “よこ”. Phiên này là dữ liệu QA tạm, không cần khôi phục session UI.
- Fixture 5.000 từ: bảng render 80 rows, 63 trang; trang 2 hiển thị 81–160; không tràn ngang ở 1280×720. Lỗi POST giả lập 503 hiện inline, 4 trường draft giữ nguyên.
- Viewports đã xem: 1280×720 và 390×844; ở laptop thấy ~5–6 hàng từ và nút lưu trong viewport. **Chưa làm QA đủ 1366×768, 1440×900, 1920×1080, zoom 200%, reduced motion và nội dung rất dài**.

## Môi trường QA / cách chạy lại

Không dùng `backend/data/trainer.db` làm fixture. Dữ liệu riêng nằm ở `app/tmp/ui-qa-data/` (ignored).

Backend localhost:8081:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:APP_DATA_DIR='C:/Users/Admin/Documents/marugoto-vocab-trainer/marugoto-vocab-trainer/tmp/ui-qa-data'
$env:APP_PDF_DIR='C:/Users/Admin/Documents/marugoto-vocab-trainer/marugoto-vocab-trainer/tmp/ui-qa-data/pdfs'
# cwd app/backend
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.arguments=--server.port=8081'
```

Preview frontend thật: `node C:\Users\Admin\.codex\visualizations\2026\10\08\01a119aa-c099-7721-acb1-663bcb6ef4d2\ui-qa-preview.mjs` trong app. localhost:5174 proxy 8081; script chặn lifecycle trước proxy để tab QA không shutdown/kill port 5173 đang dùng của người dùng.

Fixture riêng 5.000 từ/lỗi lưu: `node tmp/qa-fixture-preview.mjs` trong app, localhost:5175. Chỉ đọc, mọi mutation trả 503; không có DB.

Integration:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
# cwd app/backend
.\mvnw.cmd test '-DargLine=-javaagent:C:/Users/Admin/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar'
```

Windows sandbox chặn Vite realpath và Java loopback/Mockito attach. Build/preview và backend QA/test đã chạy thành công với `require_escalated`, mô tả rõ localhost + database riêng. `python` hệ thống là WindowsApps alias; dùng `C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.

Browser dùng CUA, browser ID 2. Tabs QA đã đóng; viewport đã reset. Nếu qua summary, gọi `cua.rewriteDocumentation()` trước khi thao tác browser; tạo tab trong browser 2, không tự chọn browser khác. QA services đã được yêu cầu dừng bằng Ctrl+C lúc lưu savepoint.

## Việc cần làm khi tiếp tục

1. Kiểm tra diff / các thay đổi mới của người dùng trước khi sửa tiếp.
2. Hoàn thiện visual/accessibility QA: các viewport còn lại, nghĩa/từ dài, keyboard/focus trap/IME, dữ liệu cũ thiếu reading; xem lại palette ở màn kết quả/backup/batch (còn vài emoji/styles legacy).
3. Smoke test thêm: trả lời đúng Việt→Nhật; Flashcards lật/trắc nghiệm/typed; due-only; batch Kanji; download PDF; backup export/restore qua UI trên DB QA; import PDF trùng. Backend tests đã cover nhiều phần nhưng không tuyên bố toàn bộ browser parity đã pass.
4. Nếu chỉnh CSS/component mới, dùng formatter cho file mới; tránh reformat toàn `main.jsx` gây diff ồn. Chạy `npm test`, `node tmp/check-ui-bindings.mjs`, final `npm run build`; kiểm tra git diff whitespace.
5. Chụp/saved screenshot **giao diện thật** ở laptop (Dictionary + editor) vào docs, viết ghi chú bàn giao/nghiệm thu. Screenshot trước đây `docs/redesign-wireframe.jpg` là mockup, không dùng để khẳng định UI sản phẩm cuối.
6. Không tự đưa `createdAt` sort fix vào backend: “Mới thêm gần đây” còn sort theo UUID từ trước, plan mục 9 đã tách ngoài overhaul mặc định. Không đổi schema hay thêm runtime dependency.
7. Bàn giao bằng tiếng Việt, nêu thay đổi, kiểm thử và giới hạn thực tế; chưa commit/PR nếu người dùng chưa yêu cầu.

## Artifacts audit trước đó

- Repo ngoài `docs/ui-ux-overhaul-plan.md`.
- Repo ngoài `docs/redesign-wireframe.jpg`.
- App `docs/redesign-wireframe.html`.

**Trạng thái cuối:** code đã được lưu, nhiều luồng chính đã kiểm chứng, còn final QA/build/bàn giao. Dừng tại đây theo yêu cầu người dùng.
