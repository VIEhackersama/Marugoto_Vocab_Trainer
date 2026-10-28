package vn.marugoto.trainer;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

@RestController
class ExamController {
    private final ExamService exams;
    private final ApplicationAvailability availability;
    ExamController(ExamService exams, ApplicationAvailability availability) { this.exams = exams; this.availability = availability; }

    @ModelAttribute
    void requireReady(HttpServletResponse response) {
        // Tomcat accepts connections before ApplicationRunners finish importing
        // Bunpro. Opening a read/write exam transaction then can lock SQLite.
        if (availability.getReadinessState() != ReadinessState.ACCEPTING_TRAFFIC) {
            response.setHeader(HttpHeaders.RETRY_AFTER, "1");
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Ứng dụng đang tải dữ liệu. Vui lòng thử lại sau giây lát.");
        }
    }

    @GetMapping("/api/exams") List<ObjectNode> list() { return exams.list(); }
    @PostMapping("/api/exams/preview") ObjectNode preview(@RequestBody JsonNode input) { return exams.preview(input); }
    @PostMapping("/api/exams/import") ObjectNode importExam(@RequestBody JsonNode input) { return exams.importExam(input); }
    @GetMapping("/api/exams/{id}/export") ResponseEntity<JsonNode> export(@PathVariable String id) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"exam-" + id.replaceAll("[^a-zA-Z0-9-]", "") + ".json\"")
                .body(exams.export(id));
    }
    @PostMapping("/api/exams/{id}/attempts") ObjectNode start(@PathVariable String id, @RequestBody JsonNode input) { return exams.start(id, input); }
    @GetMapping("/api/exam-attempts") List<ObjectNode> attempts(@RequestParam(required = false) String examId) { return exams.attempts(examId); }
    @GetMapping("/api/exam-attempts/{id}") ObjectNode get(@PathVariable String id) { return exams.get(id); }
    @PutMapping("/api/exam-attempts/{id}/answers") ObjectNode save(@PathVariable String id, @RequestBody JsonNode input) { return exams.save(id, input); }
    @PostMapping("/api/exam-attempts/{id}/questions/{questionId}/check") ObjectNode check(@PathVariable String id, @PathVariable String questionId, @RequestBody JsonNode input) { return exams.check(id, questionId, input); }
    @PostMapping("/api/exam-attempts/{id}/submit") ObjectNode submit(@PathVariable String id, @RequestBody JsonNode input) { return exams.submit(id, input); }
    @PostMapping("/api/exam-attempts/{id}/pause") ObjectNode pause(@PathVariable String id, @RequestBody JsonNode input) { return exams.pause(id, input); }
    @PostMapping("/api/exam-attempts/{id}/resume") ObjectNode resume(@PathVariable String id, @RequestBody JsonNode input) { return exams.resume(id, input); }
}
