package vn.marugoto.trainer;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.*;
import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:sqlite:./target/exam-test.db", "app.data-dir=./target/exam-test-data", "app.pdf-dir=./target/exam-test-pdfs"})
@AutoConfigureMockMvc
@Transactional
class ExamIntegrationTest {
    @Autowired ExamService exams;
    @Autowired ExamDocument documents;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired BackupService backups;
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;

    ObjectNode sample() throws Exception { return (ObjectNode) json.readTree(Files.readString(Path.of("../public/exams/exam-template.json"))); }
    ObjectNode input(JsonNode attempt, String answers) {
        var input = json.createObjectNode(); input.set("revision", attempt.path("revision")); input.set("answers", json.readTree(answers)); return input;
    }
    ObjectNode start(String mode) throws Exception {
        var imported = exams.importExam(sample()); return exams.start(imported.path("id").asText(), json.readTree("{\"feedbackMode\":\"" + mode + "\"}"));
    }
    String id(JsonNode attempt) { return attempt.path("id").asText(); }

    @BeforeEach void clear() { jdbc.update("DELETE FROM exam_attempts"); jdbc.update("DELETE FROM exams"); }

    @Test void samplePreviewIsReadOnlyAndImportVersionsAreImmutableAndCanonical() throws Exception {
        var source = sample(); var preview = exams.preview(source);
        assertEquals(5, preview.path("questionCount").asInt()); assertEquals(1, preview.path("essayCount").asInt());
        assertEquals(6, preview.path("maxScore").asInt()); assertEquals(0, exams.list().size());
        var first = exams.importExam(source); assertFalse(first.path("reused").asBoolean());
        var reordered = json.createObjectNode(); var fields = new ArrayList<>(source.properties()); Collections.reverse(fields); fields.forEach(e -> reordered.set(e.getKey(), e.getValue()));
        var again = exams.importExam(reordered); assertEquals(id(first), id(again)); assertTrue(again.path("reused").asBoolean());
        var a = exams.start(id(first), json.createObjectNode()); source.put("title", "Đề đã sửa");
        var second = exams.importExam(source); assertNotEquals(id(first), id(second)); assertEquals(2, second.path("version").asInt());
        assertEquals("Đề mẫu N5 · Ngữ pháp, đọc hiểu và viết", exams.get(id(a)).path("document").path("title").asText());
    }

    @Test void validatesFieldPathsAndNeverImportsPartOfAnInvalidDocument() throws Exception {
        var cases = List.of("version", "duplicateQuestion", "duplicateSection", "option", "placeholder", "duplicateBlank", "missingExplanation", "type", "float", "splitToken", "readingBlank", "unknownField");
        for (var kind : cases) {
            var doc = sample(); var section = (ObjectNode) doc.path("sections").get(0); var q = (ObjectNode) section.path("questions").get(0); var fill = (ObjectNode) section.path("questions").get(1);
            switch (kind) {
                case "version" -> doc.put("schemaVersion", 2);
                case "duplicateQuestion" -> fill.put("id", "q1");
                case "duplicateSection" -> ((ObjectNode) doc.path("sections").get(1)).put("id", "grammar");
                case "option" -> q.put("correctOptionId", "missing");
                case "placeholder" -> fill.put("prompt", "{{b1}} {{missing}}");
                case "duplicateBlank" -> ((ObjectNode) fill.path("blanks").get(1)).put("id", "b1");
                case "missingExplanation" -> q.remove("explanation");
                case "type" -> q.put("type", "other");
                case "float" -> q.put("points", 1.2);
                case "splitToken" -> fill.set("prompt", json.readTree("[{\"text\":\"{{b\"},{\"text\":\"1}} {{b2}}\"}]"));
                case "readingBlank" -> ((ObjectNode) fill.path("prompt").get(1)).put("reading", "ばす");
                case "unknownField" -> q.put("hint", "answer");
            }
            var error = assertThrows(IllegalArgumentException.class, () -> exams.importExam(doc), kind);
            assertTrue(error.getMessage().startsWith("$."), error.getMessage()); assertTrue(exams.list().isEmpty());
        }
    }

    @Test void httpResponsesRedactKeysAndRejectWrongAnswerTypesAndMalformedRevision() throws Exception {
        var a = start("on_submit"); var response = mvc.perform(get("/api/exam-attempts/" + id(a))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(response.contains("correctOptionId")); assertFalse(response.contains("acceptedAnswers")); assertFalse(response.contains("modelAnswer")); assertFalse(response.contains("explanation"));
        mvc.perform(post("/api/exam-attempts/" + id(a) + "/questions/q1/check").contentType("application/json").content(input(a, "{}").toString())).andExpect(status().isBadRequest());
        mvc.perform(put("/api/exam-attempts/" + id(a) + "/answers").contentType("application/json").content("{\"revision\":0.5,\"answers\":{}}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/exam-attempts/" + id(a) + "/answers").contentType("application/json").content(input(a, "{\"q2\":\"bad\"}").toString())).andExpect(status().isBadRequest());
        mvc.perform(put("/api/exam-attempts/" + id(a) + "/answers").contentType("application/json").content(input(a, "{\"q1\":\"nonexistent\"}").toString())).andExpect(status().isBadRequest());
        assertEquals(0, exams.get(id(a)).path("revision").asInt());
    }

    @Test void startingApplicationRejectsExamRequestsBeforeOpeningSQLiteTransactions() throws Exception {
        AvailabilityChangeEvent.publish(context, ReadinessState.REFUSING_TRAFFIC);
        try {
            mvc.perform(get("/api/exams")).andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After", "1"));
            mvc.perform(post("/api/exams/import").contentType("application/json").content(sample().toString())).andExpect(status().isServiceUnavailable());
            assertTrue(exams.list().isEmpty());
        } finally { AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC); }
        mvc.perform(get("/api/exams")).andExpect(status().isOk());
    }

    @Test void submitAtomicallySavesCurrentAnswersAndExcludesEssaysFromScoring() throws Exception {
        var schedules = jdbc.queryForList("SELECT * FROM study_cards");
        var a = start("on_submit");
        var submitted = exams.submit(id(a), input(a, "{\"q1\":\"a\",\"q2\":{\"b1\":\"で\",\"b2\":\"へ\"},\"q3\":\"b\",\"q4\":{\"transport\":\" バス \"},\"q5\":\"私はアンです。\"}"));
        assertEquals("SUBMITTED", submitted.path("status").asText());
        assertEquals(6, submitted.path("metrics").path("score").asInt()); assertEquals(6, submitted.path("metrics").path("maxScore").asInt());
        assertEquals(5, submitted.path("metrics").path("totalUnits").asInt()); assertEquals(100, submitted.path("metrics").path("correctPercent").asInt());
        assertEquals(1, submitted.path("metrics").path("answeredEssays").asInt());
        assertEquals("REFERENCE", submitted.path("results").path("q5").path("kind").asText());
        var replay = exams.submit(id(a), input(a, "{}")); assertEquals(submitted.path("revision"), replay.path("revision")); assertEquals(submitted.path("answers"), replay.path("answers"));
        var repeat = exams.start(a.path("examId").asText(), json.createObjectNode()); assertNotEquals(id(a), id(repeat)); assertEquals(2, exams.attempts(null).size());
        assertEquals(schedules, jdbc.queryForList("SELECT * FROM study_cards"));
    }

    @Test void perQuestionLocksOnlyCheckedAnswersAndStaleWritesCannotOverwrite() throws Exception {
        var a = start("per_question");
        var checked = exams.check(id(a), "q1", input(a, "{\"q1\":\"b\",\"q2\":{\"b1\":\"で\"}}"));
        assertTrue(checked.path("results").has("q1")); assertFalse(checked.path("results").has("q2")); assertFalse(checked.path("document").toString().contains("explanation"));
        var stale = assertThrows(ResponseStatusException.class, () -> exams.save(id(a), input(a, "{}"))); assertEquals(409, stale.getStatusCode().value());
        assertThrows(IllegalArgumentException.class, () -> exams.save(id(a), input(checked, "{\"q1\":\"a\"}")));
        var saved = exams.save(id(a), input(checked, "{\"q1\":\"b\",\"q2\":{\"b1\":\"で\",\"b2\":\"に\"}}"));
        var finished = exams.submit(id(a), input(saved, saved.path("answers").toString()));
        assertEquals(2, finished.path("metrics").path("score").asInt()); assertEquals(0, finished.path("results").path("q1").path("score").asInt());
        assertEquals(1, finished.path("metrics").path("essayCount").asInt());
    }

    @Test void fillMatchingPreservesKanaLongMarksConjugationAndVietnameseDiacritics() throws Exception {
        var q = sample().path("sections").get(1).path("questions").get(1);
        assertTrue(documents.grade(q, json.readTree("{\"transport\":\" バス \"}")).path("correct").asBoolean());
        for (var value : List.of("ばす", "バース", "バスで", "バス。", "")) assertFalse(documents.grade(q, json.readTree("{\"transport\":\"" + value + "\"}")).path("correct").asBoolean(), value);
        var blank = (ObjectNode) q.path("blanks").get(0); blank.set("acceptedAnswers", json.readTree("[\"が\",\"cá\"]"));
        assertTrue(documents.grade(q, json.readTree("{\"transport\":\"が\"}")).path("correct").asBoolean());
        assertTrue(documents.grade(q, json.readTree("{\"transport\":\"cá\"}")).path("correct").asBoolean());
        assertFalse(documents.grade(q, json.readTree("{\"transport\":\"ca\"}")).path("correct").asBoolean());
    }

    @Test void deadlineSurvivesRecreationAndRejectsLateUnsavedAnswers() throws Exception {
        var instant = Instant.parse("2026-10-28T00:00:00Z"); var doc = sample(); doc.put("timeLimitMinutes", 1);
        var first = new ExamService(jdbc, json, documents, Clock.fixed(instant, ZoneOffset.UTC));
        var e = first.importExam(doc); var a = first.start(id(e), json.createObjectNode());
        var saved = first.save(id(a), input(a, "{\"q1\":\"a\"}"));
        var recreated = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(40), ZoneOffset.UTC));
        assertEquals(a.path("deadlineAt"), recreated.get(id(a)).path("deadlineAt"));
        var late = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(61), ZoneOffset.UTC));
        var ended = late.submit(id(a), input(saved, "{\"q1\":\"a\",\"q3\":\"b\"}"));
        assertEquals("SUBMITTED", ended.path("status").asText()); assertEquals(2, ended.path("metrics").path("score").asInt());
        assertFalse(ended.path("answers").has("q3")); assertEquals(a.path("deadlineAt"), ended.path("submittedAt"));
    }

    @Test void backupRoundTripKeepsDraftsLocksResultsAndOlderBackupsPreserveExams() throws Exception {
        var a = start("per_question");
        var input = input(a, "{\"q1\":\"a\",\"q5\":\"Bài đang viết\"}"); input.set("flagged", json.readTree("[\"q5\"]"));
        var checked = exams.check(id(a), "q1", input);
        var original = json.readValue(json.writeValueAsString(backups.exportBackup()), BackupDataDto.class);
        assertEquals(6, original.version()); assertEquals(1, original.exams().attempts().size());
        jdbc.update("DELETE FROM exam_attempts"); jdbc.update("DELETE FROM exams"); backups.importBackup(original);
        var restored = exams.get(id(a)); assertEquals(checked.path("answers"), restored.path("answers")); assertEquals(checked.path("results"), restored.path("results")); assertEquals(checked.path("flagged"), restored.path("flagged"));
        backups.importBackup(new BackupDataDto(4, 0, null, null, null, null)); assertEquals(1, exams.list().size()); assertEquals(1, exams.attempts(null).size());
        assertThrows(ResponseStatusException.class, () -> backups.importBackup(new BackupDataDto(5, 0, null, null, null, null)));
        var invalid = new ExamBackup(original.exams().exams(), List.of(new StoredExamAttempt(id(a), "missing", "{}", "on_submit", "IN_PROGRESS", 1, null, null, 0, "{}", "[]", "{}")));
        assertThrows(IllegalArgumentException.class, () -> exams.restore(invalid)); assertEquals(1, exams.attempts(null).size());
    }

    @Test void essayOnlyExamHasNoAutomaticPercentageOrScore() throws Exception {
        var source = sample(); var essay = source.path("sections").get(2).deepCopy(); source.putArray("sections").add(essay); source.remove("timeLimitMinutes");
        var a = exams.start(id(exams.importExam(source)), json.createObjectNode()); assertFalse(a.has("deadlineAt"));
        var result = exams.submit(id(a), input(a, "{\"q5\":\"test\"}"));
        assertEquals(0, result.path("metrics").path("maxScore").asInt()); assertFalse(result.path("metrics").has("correctPercent"));
    }

    @Test void pauseSavesLatestAnswersFlagsAndPositionAndRestartDoesNotConsumeTime() throws Exception {
        var instant = Instant.parse("2026-10-28T00:00:00Z"); var source = sample(); source.put("timeLimitMinutes", 1);
        var initial = new ExamService(jdbc, json, documents, Clock.fixed(instant, ZoneOffset.UTC));
        var a = initial.start(id(initial.importExam(source)), json.createObjectNode());
        var tenSecondsLater = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(10), ZoneOffset.UTC));
        var pending = input(a, "{\"q1\":\"a\",\"q2\":{\"b1\":\"で\",\"b2\":\"に\"},\"q5\":\"Bài đang gõ\"}");
        pending.put("currentQuestionId", "q5"); pending.set("flagged", json.readTree("[\"q3\"]"));
        var paused = tenSecondsLater.pause(id(a), pending);
        assertEquals("PAUSED", paused.path("status").asText()); assertEquals(50000, paused.path("remainingMs").asLong()); assertFalse(paused.has("deadlineAt"));
        assertEquals("q5", paused.path("currentQuestionId").asText()); assertEquals("Bài đang gõ", paused.path("answers").path("q5").asText());
        assertEquals(pending.path("flagged"), paused.path("flagged")); assertTrue(paused.path("results").isEmpty());
        var afterRestart = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(86400), ZoneOffset.UTC));
        var reopened = afterRestart.get(id(a)); assertEquals("PAUSED", reopened.path("status").asText()); assertEquals(50000, reopened.path("remainingMs").asLong());
        assertEquals("PAUSED", afterRestart.attempts(null).getFirst().path("status").asText());
        var resumed = afterRestart.resume(id(a), input(reopened, "{}"));
        assertEquals("IN_PROGRESS", resumed.path("status").asText()); assertEquals(instant.plusSeconds(86450).toEpochMilli(), resumed.path("deadlineAt").asLong());
        assertFalse(resumed.has("remainingMs")); assertFalse(resumed.has("pausedAt")); assertEquals(paused.path("answers"), resumed.path("answers"));
        var afterSevenMore = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(86407), ZoneOffset.UTC));
        var pausedAgain = afterSevenMore.pause(id(a), input(resumed, resumed.path("answers").toString()));
        assertEquals(43000, pausedAgain.path("remainingMs").asLong());
    }

    @Test void pausedAttemptsRejectWritesAndStaleTabsCannotResumeOrOverwriteThem() throws Exception {
        var a = start("per_question"); var checked = exams.check(id(a), "q1", input(a, "{\"q1\":\"a\"}"));
        var stalePause = assertThrows(ResponseStatusException.class, () -> exams.pause(id(a), input(a, "{}"))); assertEquals(409, stalePause.getStatusCode().value());
        var pauseInput = input(checked, "{\"q1\":\"a\",\"q5\":\"saved\"}"); pauseInput.put("currentQuestionId", "q5");
        var paused = exams.pause(id(a), pauseInput);
        assertEquals(checked.path("results"), paused.path("results"));
        for (var operation : List.of("save", "check", "submit")) {
            var error = assertThrows(ResponseStatusException.class, () -> {
                if (operation.equals("save")) exams.save(id(a), input(paused, "{\"q1\":\"a\",\"q5\":\"changed\"}"));
                else if (operation.equals("check")) exams.check(id(a), "q2", input(paused, "{\"q1\":\"a\"}"));
                else exams.submit(id(a), input(paused, "{\"q1\":\"a\"}"));
            });
            assertEquals(409, error.getStatusCode().value());
        }
        assertThrows(ResponseStatusException.class, () -> exams.resume(id(a), input(checked, "{}")));
        var resumed = exams.resume(id(a), input(paused, "{}"));
        assertEquals("saved", resumed.path("answers").path("q5").asText()); assertEquals("q5", resumed.path("currentQuestionId").asText());
        assertThrows(ResponseStatusException.class, () -> exams.resume(id(a), input(paused, "{}")));
        mvc.perform(post("/api/exam-attempts/" + id(a) + "/pause").contentType("application/json").content(input(resumed, resumed.path("answers").toString()).toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAUSED"));
        assertFalse(exams.get(id(a)).path("document").toString().contains("correctOptionId"));
    }

    @Test void pauseAfterDeadlineCannotRescueOrStoreLateAnswers() throws Exception {
        var instant = Instant.parse("2026-10-28T00:00:00Z"); var source = sample(); source.put("timeLimitMinutes", 1);
        var first = new ExamService(jdbc, json, documents, Clock.fixed(instant, ZoneOffset.UTC));
        var a = first.start(id(first.importExam(source)), json.createObjectNode());
        var late = new ExamService(jdbc, json, documents, Clock.fixed(instant.plusSeconds(60), ZoneOffset.UTC));
        var result = late.pause(id(a), input(a, "{\"q1\":\"a\"}"));
        assertEquals("SUBMITTED", result.path("status").asText()); assertTrue(result.path("answers").isEmpty()); assertEquals(0, result.path("metrics").path("score").asInt());
        assertEquals("SUBMITTED", late.resume(id(a), input(result, "{}")).path("status").asText());
    }

    @Test void untimedPauseAndBackupV6KeepStateAndLegacyV5StillRestores() throws Exception {
        var source = sample(); source.remove("timeLimitMinutes"); var a = exams.start(id(exams.importExam(source)), json.createObjectNode());
        // Simulate an actual v5 JSON backup whose attempt records have none of the new fields.
        var v5 = (ObjectNode) json.valueToTree(backups.exportBackup()); v5.put("version", 5);
        for (var saved : v5.path("exams").path("attempts")) { var record = (ObjectNode) saved; record.remove("remainingMs"); record.remove("pausedAt"); record.remove("currentQuestionId"); }
        backups.importBackup(json.treeToValue(v5, BackupDataDto.class));
        var restored = exams.get(id(a)); assertEquals("q1", restored.path("currentQuestionId").asText());
        var pending = input(restored, "{\"q5\":\"tự luận\"}"); pending.put("currentQuestionId", "q5");
        var paused = exams.pause(id(a), pending); assertFalse(paused.has("remainingMs")); assertFalse(paused.has("deadlineAt"));
        var full = json.readValue(json.writeValueAsString(backups.exportBackup()), BackupDataDto.class); assertEquals(6, full.version());
        jdbc.update("DELETE FROM exam_attempts"); jdbc.update("DELETE FROM exams"); backups.importBackup(full);
        var reopened = exams.get(id(a)); assertEquals("PAUSED", reopened.path("status").asText()); assertEquals("q5", reopened.path("currentQuestionId").asText());
        var resumed = exams.resume(id(a), input(reopened, "{}")); assertFalse(resumed.has("deadlineAt")); assertEquals("tự luận", resumed.path("answers").path("q5").asText());
    }

    @Test void timedPausedBackupRetainsBudgetAndInvalidPositionDoesNotSaveAnything() throws Exception {
        var a = start("on_submit"); var invalid = input(a, "{\"q1\":\"a\"}"); invalid.put("currentQuestionId", "not-a-question");
        assertThrows(IllegalArgumentException.class, () -> exams.pause(id(a), invalid));
        var unchanged = exams.get(id(a)); assertEquals(a.path("revision"), unchanged.path("revision")); assertTrue(unchanged.path("answers").isEmpty());
        var pending = input(a, "{\"q1\":\"a\"}"); pending.put("currentQuestionId", "q2"); var paused = exams.pause(id(a), pending);
        var full = json.readValue(json.writeValueAsString(backups.exportBackup()), BackupDataDto.class);
        jdbc.update("DELETE FROM exam_attempts"); jdbc.update("DELETE FROM exams"); backups.importBackup(full);
        var reopened = exams.get(id(a)); assertEquals(paused.path("remainingMs"), reopened.path("remainingMs")); assertEquals("q2", reopened.path("currentQuestionId").asText());
    }

    @Test void v10MigrationPreservesV9AnswersRevisionsAndForeignKeys() throws Exception {
        var path = Files.createTempFile(Path.of("target"), "exam-pause-migration-", ".db");
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + path.toAbsolutePath())) {
            connection.createStatement().execute("PRAGMA foreign_keys=ON");
            var ds = new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true);
            var local = new JdbcTemplate(ds);
            new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(new org.springframework.core.io.ClassPathResource("db/migration/V9__exam_library_and_attempts.sql")).execute(ds);
            local.update("INSERT INTO exams VALUES('exam','source',1,'hash','{}',1)");
            local.update("INSERT INTO exam_attempts(id,exam_id,snapshot_json,feedback_mode,status,started_at,deadline_at,revision,answers_json,flagged_json,results_json) VALUES('attempt','exam','{}','per_question','IN_PROGRESS',1,60001,7,?,?,?)", "{\"q1\":\"で\"}", "[\"q1\"]", "{\"q1\":{\"score\":1}}");
            var before = local.queryForMap("SELECT * FROM exam_attempts");
            new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(new org.springframework.core.io.ClassPathResource("db/migration/V10__pause_and_resume_exam_attempts.sql")).execute(ds);
            var after = local.queryForMap("SELECT * FROM exam_attempts"); before.forEach((key, value) -> assertEquals(value, after.get(key), key));
            assertNull(after.get("remaining_ms")); assertNull(after.get("paused_at")); assertNull(after.get("current_question_id"));
            local.update("UPDATE exam_attempts SET status='PAUSED',deadline_at=NULL,remaining_ms=50000,paused_at=10001");
            assertTrue(local.queryForList("PRAGMA foreign_key_check").isEmpty());
        }
    }
}
