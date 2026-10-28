package vn.marugoto.trainer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Clock;
import java.util.*;

import static org.springframework.http.HttpStatus.*;
import static vn.marugoto.trainer.ExamDocument.require;

record StoredExam(String id, String sourceId, int version, String contentHash, String documentJson, long createdAt) {}
record StoredExamAttempt(String id, String examId, String snapshotJson, String feedbackMode, String status,
                         long startedAt, Long deadlineAt, Long submittedAt, int revision,
                         String answersJson, String flaggedJson, String resultsJson,
                         Long remainingMs, Long pausedAt, String currentQuestionId) {
    StoredExamAttempt(String id, String examId, String snapshotJson, String feedbackMode, String status,
                      long startedAt, Long deadlineAt, Long submittedAt, int revision,
                      String answersJson, String flaggedJson, String resultsJson) {
        this(id, examId, snapshotJson, feedbackMode, status, startedAt, deadlineAt, submittedAt, revision,
                answersJson, flaggedJson, resultsJson, null, null, null);
    }
}
record ExamBackup(List<StoredExam> exams, List<StoredExamAttempt> attempts) {}

@Service
class ExamService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ExamDocument documents;
    private final Clock clock;
    private static final RowMapper<StoredExam> EXAM = (r, i) -> new StoredExam(r.getString("id"), r.getString("source_id"), r.getInt("version"), r.getString("content_hash"), r.getString("document_json"), r.getLong("created_at"));
    private static final RowMapper<StoredExamAttempt> ATTEMPT = (r, i) -> new StoredExamAttempt(r.getString("id"), r.getString("exam_id"), r.getString("snapshot_json"), r.getString("feedback_mode"), r.getString("status"), r.getLong("started_at"), r.getObject("deadline_at") == null ? null : r.getLong("deadline_at"), r.getObject("submitted_at") == null ? null : r.getLong("submitted_at"), r.getInt("revision"), r.getString("answers_json"), r.getString("flagged_json"), r.getString("results_json"), r.getObject("remaining_ms") == null ? null : r.getLong("remaining_ms"), r.getObject("paused_at") == null ? null : r.getLong("paused_at"), r.getString("current_question_id"));

    @Autowired
    ExamService(JdbcTemplate jdbc, ObjectMapper json, ExamDocument documents) { this(jdbc, json, documents, Clock.systemUTC()); }
    ExamService(JdbcTemplate jdbc, ObjectMapper json, ExamDocument documents, Clock clock) {
        this.jdbc = jdbc; this.json = json; this.documents = documents; this.clock = clock;
    }

    private JsonNode read(String value) { return json.readTree(value); }
    private String write(Object value) { return json.writeValueAsString(value); }
    private StoredExam exam(String id) {
        var rows = jdbc.query("SELECT * FROM exams WHERE id=?", EXAM, id);
        if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy đề."); return rows.getFirst();
    }
    private StoredExamAttempt row(String id) {
        var rows = jdbc.query("SELECT * FROM exam_attempts WHERE id=?", ATTEMPT, id);
        if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy lượt làm bài."); return rows.getFirst();
    }

    private ObjectNode summary(JsonNode document) {
        var node = json.createObjectNode(); node.set("sourceId", document.path("id")); node.set("title", document.path("title"));
        for (var key : List.of("description", "instructions", "timeLimitMinutes")) if (document.has(key)) node.set(key, document.get(key));
        int automatic = 0, essays = 0;
        long maxScore = 0;
        for (var q : documents.questions(document)) {
            var grade = documents.grade(q, null);
            if (grade.path("kind").asText().equals("REFERENCE")) essays++; else { automatic++; maxScore += grade.path("maxScore").asLong(); }
        }
        node.put("questionCount", automatic + essays); node.put("automaticCount", automatic); node.put("essayCount", essays); node.put("maxScore", maxScore);
        var sections = node.putArray("sections");
        for (var section : document.path("sections")) {
            var item = sections.addObject(); item.set("id", section.path("id")); item.set("title", section.path("title")); item.put("questionCount", section.path("questions").size());
        }
        return node;
    }

    ObjectNode preview(JsonNode input) { return summary(documents.validate(input)); }

    @Transactional
    ObjectNode importExam(JsonNode input) {
        var document = documents.validate(input); var hash = documents.hash(document); var sourceId = document.path("id").asText();
        var existing = jdbc.query("SELECT * FROM exams WHERE source_id=? AND content_hash=?", EXAM, sourceId, hash);
        boolean reused = !existing.isEmpty();
        String id;
        if (reused) id = existing.getFirst().id();
        else {
            id = UUID.randomUUID().toString();
            int version = jdbc.queryForObject("SELECT COALESCE(MAX(version),0)+1 FROM exams WHERE source_id=?", Integer.class, sourceId);
            jdbc.update("INSERT INTO exams(id,source_id,version,content_hash,document_json,created_at) VALUES(?,?,?,?,?,?)", id, sourceId, version, hash, write(document), clock.millis());
        }
        var result = examSummary(exam(id)); result.put("reused", reused); return result;
    }

    private ObjectNode examSummary(StoredExam e) {
        var result = summary(read(e.documentJson())); result.put("id", e.id()); result.put("version", e.version()); result.put("createdAt", e.createdAt()); return result;
    }
    List<ObjectNode> list() { return jdbc.query("SELECT * FROM exams ORDER BY created_at DESC, version DESC", EXAM).stream().map(this::examSummary).toList(); }
    JsonNode export(String id) { return read(exam(id).documentJson()); }

    @Transactional
    ObjectNode start(String examId, JsonNode input) {
        String mode = input.path("feedbackMode").asText("on_submit");
        require(Set.of("on_submit", "per_question").contains(mode), "feedbackMode", "Cần on_submit hoặc per_question.");
        var e = exam(examId); var document = read(e.documentJson()); var now = clock.millis();
        Long deadline = document.has("timeLimitMinutes") ? now + document.path("timeLimitMinutes").asLong() * 60000L : null;
        var id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO exam_attempts(id,exam_id,snapshot_json,feedback_mode,status,started_at,deadline_at,current_question_id) VALUES(?,?,?,?,?,?,?,?)", id, examId, e.documentJson(), mode, "IN_PROGRESS", now, deadline, documents.questions(document).getFirst().path("id").asText());
        return view(row(id));
    }

    private ObjectNode redacted(JsonNode source) {
        ObjectNode copy = (ObjectNode) source.deepCopy();
        for (var section : copy.path("sections")) for (var q : section.path("questions")) {
            var question = (ObjectNode) q;
            question.remove("explanation"); question.remove("correctOptionId"); question.remove("modelAnswer");
            for (var blank : question.path("blanks")) ((ObjectNode) blank).remove("acceptedAnswers");
        }
        return copy;
    }

    private ObjectNode view(StoredExamAttempt attempt) {
        var document = read(attempt.snapshotJson()); var result = json.createObjectNode();
        result.put("id", attempt.id()); result.put("examId", attempt.examId()); result.put("status", attempt.status()); result.put("feedbackMode", attempt.feedbackMode());
        result.put("startedAt", attempt.startedAt()); result.put("revision", attempt.revision()); result.put("serverNow", clock.millis());
        if (attempt.deadlineAt() != null) result.put("deadlineAt", attempt.deadlineAt());
        if (attempt.remainingMs() != null) result.put("remainingMs", attempt.remainingMs());
        if (attempt.pausedAt() != null) result.put("pausedAt", attempt.pausedAt());
        result.put("currentQuestionId", currentQuestion(attempt, json.createObjectNode()));
        if (attempt.submittedAt() != null) result.put("submittedAt", attempt.submittedAt());
        result.set("document", redacted(document)); result.set("answers", read(attempt.answersJson())); result.set("flagged", read(attempt.flaggedJson()));
        var grades = read(attempt.resultsJson()); result.set("results", grades);
        long score = 0, max = 0;
        int correct = 0, total = 0, essays = 0, answeredEssays = 0;
        for (var q : documents.questions(document)) {
            var id = q.path("id").asText(); var g = grades.path(id);
            if (q.path("type").asText().equals("essay")) {
                essays++; if (!read(attempt.answersJson()).path(id).asText("").isBlank()) answeredEssays++;
            } else {
                var possible = documents.grade(q, null); max += possible.path("maxScore").asLong(); total += possible.path("totalUnits").asInt();
                score += g.path("score").asLong(0); correct += g.path("correctUnits").asInt(0);
            }
        }
        var metrics = result.putObject("metrics"); metrics.put("score", score); metrics.put("maxScore", max); metrics.put("correctUnits", correct); metrics.put("totalUnits", total);
        if (total > 0) metrics.put("correctPercent", Math.round(correct * 1000.0 / total) / 10.0);
        metrics.put("essayCount", essays); metrics.put("answeredEssays", answeredEssays);
        return result;
    }

    private StoredExamAttempt expire(StoredExamAttempt a) {
        if (a.status().equals("IN_PROGRESS") && a.deadlineAt() != null && clock.millis() >= a.deadlineAt()) {
            finish(a, read(a.answersJson()), read(a.flaggedJson()), a.deadlineAt(), currentQuestion(a, json.createObjectNode())); return row(a.id());
        }
        return a;
    }

    @Transactional
    ObjectNode get(String id) { return view(expire(row(id))); }

    @Transactional
    List<ObjectNode> attempts(String examId) {
        var rows = examId == null ? jdbc.query("SELECT * FROM exam_attempts ORDER BY started_at DESC", ATTEMPT)
                : jdbc.query("SELECT * FROM exam_attempts WHERE exam_id=? ORDER BY started_at DESC", ATTEMPT, examId);
        var result = new ArrayList<ObjectNode>();
        for (var r : rows) {
            var a = expire(r); var item = json.createObjectNode();
            item.put("id", a.id()); item.put("examId", a.examId()); item.put("title", read(a.snapshotJson()).path("title").asText());
            item.put("status", a.status()); item.put("feedbackMode", a.feedbackMode()); item.put("startedAt", a.startedAt());
            if (a.remainingMs() != null) item.put("remainingMs", a.remainingMs());
            if (a.pausedAt() != null) item.put("pausedAt", a.pausedAt());
            if (a.submittedAt() != null) item.put("submittedAt", a.submittedAt());
            // History does not leak unsubmitted grading data or full documents.
            if (a.status().equals("SUBMITTED")) item.set("metrics", view(a).path("metrics"));
            result.add(item);
        }
        return result;
    }

    private void revision(StoredExamAttempt a, JsonNode input) {
        var rev = input.get("revision");
        require(rev != null && rev.isIntegralNumber() && rev.canConvertToInt() && rev.asInt() >= 0, "revision", "Cần revision nguyên không âm.");
        if (rev.asInt() != a.revision()) throw new ResponseStatusException(CONFLICT, "Bài đã thay đổi ở tab khác. Tải lại bản đã lưu để tiếp tục; nội dung đang gõ vẫn được giữ tại tab này.");
    }

    private JsonNode answers(StoredExamAttempt a, JsonNode input) {
        var answers = input.get("answers"); require(answers != null && answers.isObject(), "answers", "Cần object câu trả lời.");
        var questions = new LinkedHashMap<String, JsonNode>(); documents.questions(read(a.snapshotJson())).forEach(q -> questions.put(q.path("id").asText(), q));
        answers.properties().forEach(e -> {
            var q = questions.get(e.getKey()); var path = "answers." + e.getKey(); require(q != null, path, "Không tìm thấy câu hỏi.");
            var answer = e.getValue();
            switch (q.path("type").asText()) {
                case "single_choice" -> {
                    require(answer.isString(), path, "Cần ID lựa chọn hoặc chuỗi trống.");
                    var ids = new HashSet<String>(); q.path("options").forEach(o -> ids.add(o.path("id").asText()));
                    require(answer.asText().isEmpty() || ids.contains(answer.asText()), path, "ID lựa chọn không hợp lệ.");
                }
                case "essay" -> require(answer.isString() && answer.asText().length() <= 200000, path, "Câu trả lời phải là chuỗi tối đa 200.000 ký tự.");
                case "fill_blank" -> {
                    require(answer.isObject(), path, "Cần object theo ID chỗ trống.");
                    var ids = new HashSet<String>(); q.path("blanks").forEach(b -> ids.add(b.path("id").asText()));
                    answer.properties().forEach(b -> require(ids.contains(b.getKey()) && b.getValue().isString() && b.getValue().asText().length() <= 200000, path + "." + b.getKey(), "Chỗ trống hoặc kiểu dữ liệu không hợp lệ."));
                }
            }
        });
        var previous = read(a.answersJson());
        read(a.resultsJson()).properties().forEach(e -> require(Objects.equals(previous.get(e.getKey()), answers.get(e.getKey())), "answers." + e.getKey(), "Câu đã kiểm tra bị khóa."));
        return answers;
    }

    private JsonNode flags(StoredExamAttempt a, JsonNode input) {
        if (!input.has("flagged")) return read(a.flaggedJson());
        var flags = input.get("flagged"); require(flags.isArray(), "flagged", "Cần mảng ID câu hỏi.");
        var ids = new HashSet<String>(); documents.questions(read(a.snapshotJson())).forEach(q -> ids.add(q.path("id").asText()));
        var unique = new HashSet<String>();
        for (var flag : flags) require(flag.isString() && ids.contains(flag.asText()) && unique.add(flag.asText()), "flagged", "ID câu hỏi không hợp lệ hoặc trùng.");
        return flags;
    }

    private String currentQuestion(StoredExamAttempt a, JsonNode input) {
        if (!input.has("currentQuestionId")) return a.currentQuestionId() == null ? documents.questions(read(a.snapshotJson())).getFirst().path("id").asText() : a.currentQuestionId();
        var current = input.get("currentQuestionId");
        require(current.isString() && documents.questions(read(a.snapshotJson())).stream().anyMatch(q -> q.path("id").asText().equals(current.asText())), "currentQuestionId", "Không tìm thấy câu hỏi.");
        return current.asText();
    }

    private void requireRunning(StoredExamAttempt a) {
        if (!a.status().equals("IN_PROGRESS")) throw new ResponseStatusException(CONFLICT, "Bài đang tạm dừng. Tải bản đã lưu và bấm Tiếp tục trước khi làm bài.");
    }

    private void persist(StoredExamAttempt a, JsonNode answers, JsonNode flags, JsonNode results, Long submittedAt, String currentQuestionId) {
        int changed = jdbc.update("UPDATE exam_attempts SET answers_json=?,flagged_json=?,results_json=?,current_question_id=?,revision=revision+1,status=?,submitted_at=? WHERE id=? AND revision=? AND status='IN_PROGRESS'",
                write(answers), write(flags), write(results), currentQuestionId, submittedAt == null ? "IN_PROGRESS" : "SUBMITTED", submittedAt, a.id(), a.revision());
        if (changed != 1) throw new ResponseStatusException(CONFLICT, "Bài đã thay đổi; tải lại bản đã lưu.");
    }

    @Transactional
    ObjectNode save(String id, JsonNode input) {
        var a = expire(row(id)); if (a.status().equals("SUBMITTED")) return view(a);
        requireRunning(a); revision(a, input); persist(a, answers(a, input), flags(a, input), read(a.resultsJson()), null, currentQuestion(a, input)); return view(row(id));
    }

    @Transactional
    ObjectNode check(String id, String questionId, JsonNode input) {
        var a = expire(row(id)); if (a.status().equals("SUBMITTED")) return view(a);
        requireRunning(a);
        require(a.feedbackMode().equals("per_question"), "feedbackMode", "Chế độ này chỉ xem đáp án sau khi nộp đề.");
        revision(a, input); var answers = answers(a, input); var flags = flags(a, input);
        var question = documents.questions(read(a.snapshotJson())).stream().filter(q -> q.path("id").asText().equals(questionId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không tìm thấy câu hỏi."));
        var grades = (ObjectNode) read(a.resultsJson());
        if (!grades.has(questionId)) grades.set(questionId, documents.grade(question, answers.get(questionId)));
        persist(a, answers, flags, grades, null, currentQuestion(a, input)); return view(row(id));
    }

    private void finish(StoredExamAttempt a, JsonNode answers, JsonNode flags, long submittedAt, String currentQuestionId) {
        var grades = (ObjectNode) read(a.resultsJson());
        for (var q : documents.questions(read(a.snapshotJson()))) {
            var id = q.path("id").asText(); if (!grades.has(id)) grades.set(id, documents.grade(q, answers.get(id)));
        }
        persist(a, answers, flags, grades, submittedAt, currentQuestionId);
    }

    @Transactional
    ObjectNode submit(String id, JsonNode input) {
        var a = expire(row(id)); if (a.status().equals("SUBMITTED")) return view(a);
        requireRunning(a); revision(a, input);
        finish(a, answers(a, input), flags(a, input), clock.millis(), currentQuestion(a, input)); return view(row(id));
    }

    @Transactional
    ObjectNode pause(String id, JsonNode input) {
        var a = expire(row(id)); if (a.status().equals("SUBMITTED")) return view(a);
        requireRunning(a); revision(a, input);
        var answers = answers(a, input); var flags = flags(a, input); var current = currentQuestion(a, input);
        long now = clock.millis();
        // A pause cannot rescue an attempt whose saved time has already expired.
        if (a.deadlineAt() != null && now >= a.deadlineAt()) return view(expire(a));
        Long remaining = a.deadlineAt() == null ? null : a.deadlineAt() - now;
        int changed = jdbc.update("UPDATE exam_attempts SET answers_json=?,flagged_json=?,current_question_id=?,status='PAUSED',remaining_ms=?,paused_at=?,deadline_at=NULL,revision=revision+1 WHERE id=? AND revision=? AND status='IN_PROGRESS'",
                write(answers), write(flags), current, remaining, now, a.id(), a.revision());
        if (changed != 1) throw new ResponseStatusException(CONFLICT, "Bài đã thay đổi; tải lại bản đã lưu.");
        return view(row(id));
    }

    @Transactional
    ObjectNode resume(String id, JsonNode input) {
        var a = expire(row(id));
        if (a.status().equals("SUBMITTED")) return view(a);
        revision(a, input);
        if (!a.status().equals("PAUSED")) throw new ResponseStatusException(CONFLICT, "Bài không còn tạm dừng. Tải bản đã lưu để tiếp tục.");
        Long deadline = a.remainingMs() == null ? null : clock.millis() + a.remainingMs();
        int changed = jdbc.update("UPDATE exam_attempts SET status='IN_PROGRESS',deadline_at=?,remaining_ms=NULL,paused_at=NULL,revision=revision+1 WHERE id=? AND revision=? AND status='PAUSED'", deadline, a.id(), a.revision());
        if (changed != 1) throw new ResponseStatusException(CONFLICT, "Bài đã thay đổi; tải lại bản đã lưu.");
        return view(row(id));
    }

    @Transactional(readOnly = true)
    ExamBackup backup() { return new ExamBackup(jdbc.query("SELECT * FROM exams", EXAM), jdbc.query("SELECT * FROM exam_attempts", ATTEMPT)); }

    @Transactional
    void restore(ExamBackup backup) {
        if (backup == null) return; // Old backups do not own or erase exam data.
        require(backup.exams() != null && backup.attempts() != null, "exams", "Backup thiếu danh sách đề/lượt làm.");
        var definitions = new HashMap<String, StoredExam>(); var versions = new HashSet<String>(); var hashes = new HashSet<String>();
        for (var e : backup.exams()) {
            require(e != null && e.id() != null && !e.id().isBlank() && definitions.putIfAbsent(e.id(), e) == null, "exams", "ID đề bị thiếu/trùng.");
            var doc = documents.validate(read(e.documentJson()));
            require(e.sourceId().equals(doc.path("id").asText()) && e.version() > 0 && e.createdAt() > 0 && documents.hash(doc).equals(e.contentHash()), "exams." + e.id(), "Định danh hoặc mã nội dung không khớp.");
            require(versions.add(e.sourceId() + "/" + e.version()) && hashes.add(e.sourceId() + "/" + e.contentHash()), "exams", "Trùng phiên bản/nội dung.");
        }
        var ids = new HashSet<String>();
        for (var a : backup.attempts()) {
            require(a != null && a.id() != null && !a.id().isBlank() && ids.add(a.id()) && definitions.containsKey(a.examId()), "examAttempts", "ID lượt làm hoặc đề không hợp lệ.");
            require(read(a.snapshotJson()).equals(read(definitions.get(a.examId()).documentJson())), "examAttempts." + a.id(), "Bản chụp đề không khớp.");
            require(Set.of("on_submit", "per_question").contains(a.feedbackMode()) && Set.of("IN_PROGRESS", "PAUSED", "SUBMITTED").contains(a.status()) && a.revision() >= 0 && a.startedAt() > 0, "examAttempts", "Trạng thái không hợp lệ.");
            var doc = read(a.snapshotJson());
            Long duration = doc.has("timeLimitMinutes") ? doc.path("timeLimitMinutes").asLong() * 60000L : null;
            boolean paused = a.status().equals("PAUSED");
            require((a.status().equals("SUBMITTED") == (a.submittedAt() != null)) && (a.submittedAt() == null || a.submittedAt() >= a.startedAt()), "examAttempts", "Thời gian nộp không hợp lệ.");
            if (paused) {
                require(a.deadlineAt() == null && a.pausedAt() != null && a.pausedAt() >= a.startedAt()
                        && (duration == null ? a.remainingMs() == null : a.remainingMs() != null && a.remainingMs() > 0 && a.remainingMs() <= duration), "examAttempts", "Thời gian tạm dừng không hợp lệ.");
            } else {
                require(a.pausedAt() == null && a.remainingMs() == null && (duration == null ? a.deadlineAt() == null : a.deadlineAt() != null && a.deadlineAt() >= a.startedAt()), "examAttempts", "Hạn làm bài không hợp lệ.");
                require(a.submittedAt() == null || a.deadlineAt() == null || a.submittedAt() <= a.deadlineAt(), "examAttempts", "Thời gian nộp vượt hạn làm bài.");
            }
            var input = json.createObjectNode(); input.set("answers", read(a.answersJson())); input.set("flagged", read(a.flaggedJson()));
            answers(a, input); flags(a, input);
            if (a.currentQuestionId() != null) { input.put("currentQuestionId", a.currentQuestionId()); currentQuestion(a, input); }
            var grades = read(a.resultsJson()); require(grades.isObject(), "examAttempts.results", "Cần object kết quả.");
            var computed = json.createObjectNode();
            for (var q : documents.questions(doc)) if (a.status().equals("SUBMITTED") || grades.has(q.path("id").asText())) computed.set(q.path("id").asText(), documents.grade(q, input.path("answers").get(q.path("id").asText())));
            require(documents.hash(computed).equals(documents.hash(grades)) && (!a.feedbackMode().equals("on_submit") || a.status().equals("SUBMITTED") || grades.isEmpty()), "examAttempts.results", "Kết quả không khớp câu trả lời.");
        }
        jdbc.update("DELETE FROM exam_attempts"); jdbc.update("DELETE FROM exams");
        for (var e : backup.exams()) jdbc.update("INSERT INTO exams(id,source_id,version,content_hash,document_json,created_at) VALUES(?,?,?,?,?,?)", e.id(), e.sourceId(), e.version(), e.contentHash(), e.documentJson(), e.createdAt());
        for (var a : backup.attempts()) jdbc.update("INSERT INTO exam_attempts(id,exam_id,snapshot_json,feedback_mode,status,started_at,deadline_at,submitted_at,revision,answers_json,flagged_json,results_json,remaining_ms,paused_at,current_question_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                a.id(), a.examId(), a.snapshotJson(), a.feedbackMode(), a.status(), a.startedAt(), a.deadlineAt(), a.submittedAt(), a.revision(), a.answersJson(), a.flaggedJson(), a.resultsJson(), a.remainingMs(), a.pausedAt(), a.currentQuestionId());
    }
}
