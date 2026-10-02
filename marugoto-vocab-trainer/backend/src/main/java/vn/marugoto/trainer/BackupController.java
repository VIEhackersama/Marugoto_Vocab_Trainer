package vn.marugoto.trainer;

import tools.jackson.databind.ObjectMapper;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/backup")
class BackupController {
    private final BackupService backupService;
    private final ObjectMapper objectMapper;

    BackupController(BackupService backupService, ObjectMapper objectMapper) {
        this.backupService = backupService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exportBackup() throws IOException {
        BackupDataDto backup = backupService.exportBackup();
        byte[] bytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(backup);

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        String filename = "marugoto_backup_" + timestamp + ".json";

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(bytes);
    }

    @PostMapping("/import")
    public BackupImportResult importJson(@RequestBody BackupDataDto backup) {
        if (backup == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Thiếu dữ liệu backup.");
        }
        return backupService.importBackup(backup);
    }

    @PostMapping(value = "/import-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BackupImportResult importFile(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "File backup trống.");
        }
        BackupDataDto backup = objectMapper.readValue(file.getInputStream(), BackupDataDto.class);
        return backupService.importBackup(backup);
    }
}
