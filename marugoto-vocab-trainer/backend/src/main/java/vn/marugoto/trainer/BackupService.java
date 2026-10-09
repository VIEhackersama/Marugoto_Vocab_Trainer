package vn.marugoto.trainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
class BackupService {
    private static final Logger log = LoggerFactory.getLogger(BackupService.class);

    private final JdbcTemplate jdbc;
    private final String datasourceUrl;
    private final BunproService bunpro;

    BackupService(
            JdbcTemplate jdbc,
            @Value("${spring.datasource.url:}") String datasourceUrl,
            BunproService bunpro
    ) {
        this.jdbc = jdbc;
        this.datasourceUrl = datasourceUrl;
        this.bunpro = bunpro;
    }

    public BackupDataDto exportBackup() {
        long exportedAt = System.currentTimeMillis();

        List<BackupDeckItem> decks = jdbc.query(
                "SELECT id, title, original_filename, stored_filename, file_size, created_at FROM decks",
                (rs, i) -> new BackupDeckItem(
                        rs.getString("id"),
                        rs.getString("title"),
                        rs.getString("original_filename"),
                        rs.getString("stored_filename"),
                        rs.getLong("file_size"),
                        rs.getLong("created_at")
                )
        );

        Map<String, List<String>> sourcesMap = new HashMap<>();
        jdbc.query(
                "SELECT vocabulary_id, deck_id FROM vocabulary_sources",
                rs -> {
                    String vocabId = rs.getString("vocabulary_id");
                    String deckId = rs.getString("deck_id");
                    sourcesMap.computeIfAbsent(vocabId, k -> new ArrayList<>()).add(deckId);
                }
        );

        List<BackupVocabItem> vocabularies = jdbc.query(
                "SELECT id, spelling, reading, romaji, meanings_vi, created_at FROM vocabularies",
                (rs, i) -> {
                    String vocabId = rs.getString("id");
                    List<String> deckIds = sourcesMap.getOrDefault(vocabId, List.of());
                    return new BackupVocabItem(
                            vocabId,
                            rs.getString("spelling"),
                            rs.getString("reading"),
                            rs.getString("romaji"),
                            rs.getString("meanings_vi"),
                            rs.getLong("created_at"),
                            deckIds
                    );
                }
        );

        List<BackupStudyCardItem> studyCards = jdbc.query(
                "SELECT id, vocabulary_id, card_type, fsrs_card_json, due_at, last_reviewed_at, review_count, wrong_count, created_at FROM study_cards",
                (rs, i) -> new BackupStudyCardItem(
                        rs.getString("id"),
                        rs.getString("vocabulary_id"),
                        rs.getString("card_type"),
                        rs.getString("fsrs_card_json"),
                        rs.getLong("due_at"),
                        rs.getObject("last_reviewed_at") != null ? rs.getLong("last_reviewed_at") : null,
                        rs.getInt("review_count"),
                        rs.getInt("wrong_count"),
                        rs.getLong("created_at")
                )
        );

        List<BackupReviewLogItem> reviewLogs = jdbc.query(
                "SELECT id, card_id, rating, source, reviewed_at, due_at_after, card_type, response_ms, is_correct FROM review_logs",
                (rs, i) -> new BackupReviewLogItem(
                        rs.getString("id"),
                        rs.getString("card_id"),
                        rs.getString("rating"),
                        rs.getString("source"),
                        rs.getLong("reviewed_at"),
                        rs.getLong("due_at_after"),
                        rs.getString("card_type"),
                        rs.getObject("response_ms") != null ? rs.getLong("response_ms") : null,
                        rs.getObject("is_correct") != null ? rs.getInt("is_correct") : null
                )
        );

        return new BackupDataDto(2, exportedAt, decks, vocabularies, studyCards, reviewLogs, bunpro.exportBackup());
    }

    @Transactional
    public BackupImportResult importBackup(BackupDataDto data) {
        if (data == null || data.version() <= 0 || data.version() > 2) {
            throw new ResponseStatusException(BAD_REQUEST, "Dữ liệu sao lưu không hợp lệ.");
        }

        createDatabaseBackupBeforeRestore();

        int importedDecks = 0;
        int importedVocabs = 0;
        int importedCards = 0;
        int importedLogs = 0;

        if (data.decks() != null) {
            for (BackupDeckItem d : data.decks()) {
                if (d == null || d.id() == null || d.id().isBlank()) continue;
                int affected = jdbc.update("""
                        INSERT INTO decks(id, title, original_filename, stored_filename, file_size, created_at)
                        VALUES(?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            title = excluded.title,
                            original_filename = excluded.original_filename
                        """, d.id(), d.title(), d.originalFilename(), d.storedFilename() != null ? d.storedFilename() : "",
                        d.fileSize(), d.createdAt());
                if (affected > 0) importedDecks++;
            }
        }

        if (data.vocabularies() != null) {
            for (BackupVocabItem v : data.vocabularies()) {
                if (v == null || v.id() == null || v.id().isBlank()) continue;
                int affected = jdbc.update("""
                        INSERT INTO vocabularies(id, spelling, reading, romaji, meanings_vi, created_at)
                        VALUES(?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            spelling = excluded.spelling,
                            reading = excluded.reading,
                            romaji = excluded.romaji,
                            meanings_vi = excluded.meanings_vi
                        """, v.id(), v.spelling(), v.reading(), v.romaji(), v.meaningsVi(), v.createdAt());
                if (affected > 0) importedVocabs++;

                if (v.deckIds() != null) {
                    for (String deckId : v.deckIds()) {
                        if (deckId == null || deckId.isBlank()) continue;
                        jdbc.update("""
                                INSERT INTO vocabulary_sources(id, vocabulary_id, deck_id, created_at)
                                SELECT ?,?,?,?
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM vocabulary_sources WHERE vocabulary_id=? AND deck_id=?
                                )
                                """, UUID.randomUUID().toString(), v.id(), deckId, v.createdAt(), v.id(), deckId);
                    }
                }
            }
        }

        if (data.studyCards() != null) {
            for (BackupStudyCardItem s : data.studyCards()) {
                if (s == null || s.id() == null || s.id().isBlank()) continue;
                int affected = jdbc.update("""
                        INSERT INTO study_cards(id, vocabulary_id, card_type, fsrs_card_json, due_at, last_reviewed_at, review_count, wrong_count, created_at)
                        VALUES(?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            fsrs_card_json = excluded.fsrs_card_json,
                            due_at = excluded.due_at,
                            last_reviewed_at = excluded.last_reviewed_at,
                            review_count = excluded.review_count,
                            wrong_count = excluded.wrong_count
                        """, s.id(), s.vocabularyId(), s.cardType(), s.fsrsCardJson(), s.dueAt(),
                        s.lastReviewedAt(), s.reviewCount(), s.wrongCount(), s.createdAt());
                if (affected > 0) importedCards++;
            }
        }

        if (data.reviewLogs() != null) {
            for (BackupReviewLogItem l : data.reviewLogs()) {
                if (l == null || l.id() == null || l.id().isBlank()) continue;
                int affected = jdbc.update("""
                        INSERT OR IGNORE INTO review_logs(id, card_id, rating, source, reviewed_at, due_at_after, card_type, response_ms, is_correct)
                        VALUES(?,?,?,?,?,?,?,?,?)
                        """, l.id(), l.cardId(), l.rating(), l.source(), l.reviewedAt(), l.dueAtAfter(),
                        l.cardType(), l.responseMs(), l.isCorrect());
                if (affected > 0) importedLogs++;
            }
        }

        bunpro.restore(data.learning());
        return new BackupImportResult(
                importedDecks,
                importedVocabs,
                importedCards,
                importedLogs,
                String.format("Khôi phục thành công: %d bộ từ, %d từ vựng, %d thẻ học và %d nhật ký ôn tập.",
                        importedDecks, importedVocabs, importedCards, importedLogs)
        );
    }

    private void createDatabaseBackupBeforeRestore() {
        if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:sqlite:")) return;
        String rawPath = datasourceUrl.substring("jdbc:sqlite:".length()).trim();
        if (rawPath.isEmpty() || rawPath.startsWith(":") || rawPath.contains(":memory:")) return;

        try {
            Path dbPath = Path.of(rawPath).toAbsolutePath().normalize();
            if (Files.isRegularFile(dbPath) && Files.size(dbPath) > 0) {
                String timestamp = String.valueOf(System.currentTimeMillis());
                Path backupPath = dbPath.resolveSibling(dbPath.getFileName().toString() + ".pre-restore." + timestamp + ".bak");
                Files.copy(dbPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Đã tạo bản sao lưu CSDL trước khi khôi phục tại: {}", backupPath);
            }
        } catch (Exception e) {
            log.warn("Không thể tạo bản sao lưu CSDL trước restore: {}", e.getMessage());
        }
    }
}
