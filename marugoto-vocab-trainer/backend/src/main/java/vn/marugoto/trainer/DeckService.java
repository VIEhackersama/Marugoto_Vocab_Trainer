package vn.marugoto.trainer;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import io.github.openspacedrepetition.Card;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
class DeckService {
    private static final int MAX_CARDS_PER_PDF = 5000;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final FsrsScheduler fsrs;
    private final Path pdfDirectory;

    private static final RowMapper<DeckDto> DECK_MAPPER = (rs, row) -> new DeckDto(
            rs.getString("id"), rs.getString("title"), rs.getString("original_filename"),
            rs.getInt("card_count"), rs.getInt("due_count"), Instant.ofEpochMilli(rs.getLong("created_at")),
            "custom".equals(rs.getString("id")));

    private static final RowMapper<StudyCardDto> STUDY_CARD_MAPPER = (rs, row) -> new StudyCardDto(
            rs.getString("id"), rs.getString("deck_id"), rs.getString("deck_title"),
            rs.getString("japanese"), rs.getString("romaji"), rs.getString("vietnamese"),
            Instant.ofEpochMilli(rs.getLong("due_at")), rs.getInt("review_count"), rs.getInt("wrong_count"));

    DeckService(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            FsrsScheduler fsrs,
            @Value("${app.pdf-dir}") String pdfDirectory
    ) throws IOException {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.fsrs = fsrs;
        this.pdfDirectory = Path.of(pdfDirectory).toAbsolutePath().normalize();
        Files.createDirectories(this.pdfDirectory);
    }

    @Transactional
    DeckDto create(MultipartFile pdf, String cardsJson) throws IOException {
        return create(pdf, cardsJson, false);
    }

    @Transactional
    DeckDto create(MultipartFile pdf, String cardsJson, boolean skipDuplicates) throws IOException {
        if (pdf == null || pdf.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "PDF không được để trống.");
        if (pdf.getSize() > 50L * 1024 * 1024) throw new ResponseStatusException(BAD_REQUEST, "PDF vượt quá giới hạn 50 MB.");
        String filename = safeFilename(pdf.getOriginalFilename());
        byte[] bytes = pdf.getBytes();
        if (bytes.length < 5 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
            throw new ResponseStatusException(BAD_REQUEST, "File tải lên không phải PDF hợp lệ.");
        }

        List<CardInput> entries;
        try {
            entries = objectMapper.readValue(cardsJson, new TypeReference<>() {});
        } catch (Exception exception) {
            throw new ResponseStatusException(BAD_REQUEST, "Danh sách từ vựng không hợp lệ.");
        }
        entries = validatedEntries(entries);
        if (skipDuplicates) {
            Set<String> existingKana = new HashSet<>(jdbc.query(
                    "SELECT japanese FROM cards",
                    (rs, i) -> canonicalKanaKey(rs.getString("japanese"))
            ));
            Set<String> existingJp = new HashSet<>(jdbc.query(
                    "SELECT japanese FROM cards",
                    (rs, i) -> rs.getString("japanese").trim().toLowerCase(Locale.ROOT)
            ));
            entries = entries.stream().filter(entry -> {
                String jp = entry.jp().trim().toLowerCase(Locale.ROOT);
                String kana = canonicalKanaKey(entry.jp());
                return !existingJp.contains(jp) && (kana.isEmpty() || !existingKana.contains(kana));
            }).toList();
        }
        if (entries.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "PDF không có từ vựng hợp lệ để lưu.");
        if (entries.size() > MAX_CARDS_PER_PDF) throw new ResponseStatusException(BAD_REQUEST, "PDF có quá nhiều từ vựng.");

        String deckId = UUID.randomUUID().toString();
        String storedFilename = deckId + ".pdf";
        Path storedPath = pdfDirectory.resolve(storedFilename);
        Files.write(storedPath, bytes);
        long now = System.currentTimeMillis();
        try {
            String title = filename.replaceFirst("(?i)\\.pdf$", "").trim();
            if (title.isEmpty()) title = "Bộ từ mới";
            jdbc.update("INSERT INTO decks(id,title,original_filename,stored_filename,file_size,created_at) VALUES(?,?,?,?,?,?)",
                    deckId, title, filename, storedFilename, bytes.length, now);
            for (CardInput entry : entries) {
                Card state = fsrs.newCard();
                jdbc.update("""
                        INSERT INTO cards(id,deck_id,japanese,romaji,vietnamese,fsrs_card_json,due_at,created_at)
                        VALUES(?,?,?,?,?,?,?,?)
                        """,
                        UUID.randomUUID().toString(), deckId, entry.jp(), entry.romaji(), entry.vi(),
                        fsrs.write(state), fsrs.dueAt(state).toEpochMilli(), now);
            }
        } catch (RuntimeException exception) {
            Files.deleteIfExists(storedPath);
            throw exception;
        }
        return findDeck(deckId);
    }

    List<DeckDto> list() {
        long now = System.currentTimeMillis();
        return jdbc.query("""
                SELECT d.id,d.title,d.original_filename,d.created_at,
                       COUNT(c.id) AS card_count,
                       SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END) AS due_count
                FROM decks d LEFT JOIN cards c ON c.deck_id=d.id
                WHERE d.id != 'custom'
                GROUP BY d.id ORDER BY d.created_at DESC
                """, DECK_MAPPER, now);
    }

    DeckDto customDeck() {
        ensureCustomDeck();
        return findDeck("custom");
    }

    @Transactional(readOnly = true)
    Path pdfPath(String deckId) {
        if ("custom".equals(deckId)) {
            throw new ResponseStatusException(BAD_REQUEST, "Bộ từ tùy chỉnh không có file PDF gốc.");
        }
        String storedFilename = jdbc.query("SELECT stored_filename FROM decks WHERE id=?",
                rs -> rs.next() ? rs.getString(1) : null, deckId);
        if (storedFilename == null) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy bộ từ vựng.");
        Path path = pdfDirectory.resolve(storedFilename).normalize();
        if (!path.startsWith(pdfDirectory) || !Files.isRegularFile(path)) {
            throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy file PDF.");
        }
        return path;
    }

    @Transactional
    void delete(String deckId) throws IOException {
        if ("custom".equals(deckId)) {
            throw new ResponseStatusException(BAD_REQUEST, "Không thể xóa bộ từ vựng tùy chỉnh.");
        }
        Path pdfPath = pdfPath(deckId);
        int deleted = jdbc.update("DELETE FROM decks WHERE id=?", deckId);
        if (deleted == 0) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy bộ từ vựng.");
        Files.deleteIfExists(pdfPath);
    }

    boolean exists(String deckId) {
        if ("custom".equals(deckId)) return true;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM decks WHERE id=?", Integer.class, deckId);
        return count != null && count > 0;
    }

    public synchronized void ensureCustomDeck() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM decks WHERE id='custom'", Integer.class);
        if (count == null || count == 0) {
            jdbc.update("INSERT INTO decks(id,title,original_filename,stored_filename,file_size,created_at) VALUES('custom','Từ vựng tùy chỉnh','custom','',0,?)", System.currentTimeMillis());
        }
    }

    @Transactional
    StudyCardDto addCustomCard(CardInput input) {
        if (input == null) throw new ResponseStatusException(BAD_REQUEST, "Thiếu thông tin từ vựng.");
        String jp = normalize(input.jp());
        String vi = normalize(input.vi());
        String romaji = input.romaji() == null ? "" : normalize(input.romaji());
        if (jp.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Tiếng Nhật không được để trống.");
        if (vi.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Nghĩa tiếng Việt không được để trống.");

        ensureCustomDeck();

        long now = System.currentTimeMillis();
        String cardId = UUID.randomUUID().toString();
        Card state = fsrs.newCard();
        jdbc.update("""
                INSERT INTO cards(id,deck_id,japanese,romaji,vietnamese,fsrs_card_json,due_at,created_at)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                cardId, "custom", jp, romaji, vi,
                fsrs.write(state), fsrs.dueAt(state).toEpochMilli(), now);
        return new StudyCardDto(cardId, "custom", "Từ vựng tùy chỉnh", jp, romaji, vi, fsrs.dueAt(state), 0, 0);
    }

    @Transactional
    void deleteCard(String cardId) {
        int deleted = jdbc.update("DELETE FROM cards WHERE id=?", cardId);
        if (deleted == 0) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng.");
    }

    @Transactional
    StudyCardDto updateCard(String cardId, CardInput input) {
        if (input == null) throw new ResponseStatusException(BAD_REQUEST, "Thiếu thông tin từ vựng.");
        String jp = normalize(input.jp());
        String vi = normalize(input.vi());
        String romaji = input.romaji() == null ? "" : normalize(input.romaji());
        if (jp.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Tiếng Nhật không được để trống.");
        if (vi.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Nghĩa tiếng Việt không được để trống.");

        int updated = jdbc.update("""
                UPDATE cards SET japanese = ?, romaji = ?, vietnamese = ?
                WHERE id = ?
                """, jp, romaji, vi, cardId);
        if (updated == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng.");
        }
        return jdbc.query("""
                SELECT c.id, c.deck_id, d.title AS deck_title, c.japanese, c.romaji, c.vietnamese,
                       c.due_at, c.review_count, c.wrong_count
                FROM cards c JOIN decks d ON d.id = c.deck_id
                WHERE c.id = ?
                """, STUDY_CARD_MAPPER, cardId).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng."));
    }

    @Transactional
    List<StudyCardDto> updateCardsBatch(List<BatchCardUpdateItem> items) {
        if (items == null || items.isEmpty()) return List.of();
        List<String> updatedIds = new ArrayList<>();
        for (BatchCardUpdateItem item : items) {
            if (item == null || item.id() == null || item.id().isBlank()) continue;
            String jp = normalize(item.jp());
            String vi = normalize(item.vi());
            String romaji = item.romaji() == null ? "" : normalize(item.romaji());
            if (jp.isBlank() || vi.isBlank()) continue;
            int rows = jdbc.update("UPDATE cards SET japanese = ?, romaji = ?, vietnamese = ? WHERE id = ?", jp, romaji, vi, item.id());
            if (rows > 0) {
                updatedIds.add(item.id());
            }
        }
        if (updatedIds.isEmpty()) return List.of();
        String inSql = String.join(",", java.util.Collections.nCopies(updatedIds.size(), "?"));
        return jdbc.query("""
                SELECT c.id, c.deck_id, d.title AS deck_title, c.japanese, c.romaji, c.vietnamese,
                       c.due_at, c.review_count, c.wrong_count
                FROM cards c JOIN decks d ON d.id = c.deck_id
                WHERE c.id IN (""" + inSql + ")", STUDY_CARD_MAPPER, updatedIds.toArray());
    }

    DeckDto findDeck(String deckId) {
        long now = System.currentTimeMillis();
        return jdbc.query("""
                SELECT d.id,d.title,d.original_filename,d.created_at,COUNT(c.id) AS card_count,
                       SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END) AS due_count
                FROM decks d LEFT JOIN cards c ON c.deck_id=d.id WHERE d.id=? GROUP BY d.id
                """, DECK_MAPPER, now, deckId).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không tìm thấy bộ từ vựng."));
    }

    private static List<CardInput> validatedEntries(List<CardInput> entries) {
        if (entries == null) return List.of();
        List<CardInput> valid = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (CardInput entry : entries) {
            if (entry == null) continue;
            String jp = normalize(entry.jp());
            String vi = normalize(entry.vi());
            String romaji = entry.romaji() == null ? "" : normalize(entry.romaji());
            if (jp.isBlank() || vi.isBlank()) continue;
            String key = jp.toLowerCase(Locale.ROOT) + "|" + vi.toLowerCase(Locale.ROOT);
            if (seen.add(key)) valid.add(new CardInput(jp, romaji, vi));
        }
        return valid;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.strip().replaceAll("\\s+", " ");
    }

    private static String safeFilename(String filename) {
        if (filename == null || filename.isBlank()) return "vocabulary.pdf";
        String safe = Path.of(filename.replace('\\', '/')).getFileName().toString().replaceAll("[\\r\\n\\\"]", "_");
        return safe.isBlank() ? "vocabulary.pdf" : safe;
    }

    public static String toHiragana(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '\u30a1' && c <= '\u30f6') {
                sb.append((char) (c - 0x60));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    public static String extractReading(String jp) {
        if (jp == null) return "";
        var matcher = java.util.regex.Pattern.compile("[\\(（]([\\u3040-\\u30ff\\s～~\\-]+)[\\)）]").matcher(jp);
        if (matcher.find()) {
            String inside = matcher.group(1).replaceFirst("^[～~\\-・\\s\\d\\(\\[\"'`\\./]+", "");
            if (inside.matches(".*[\\u3040-\\u30ff].*")) return inside;
        }
        String beforeParen = jp.split("[\\(（]")[0].replaceFirst("^[～~\\-・\\s\\d\\(\\[\"'`\\./]+", "");
        if (beforeParen.matches("^[\\u3040-\\u30ff].*")) return beforeParen;

        String clean = jp.replaceFirst("^[～~\\-・\\s\\d\\(\\[\"'`\\./]+", "");
        return clean.strip();
    }

    public static String canonicalKanaKey(String jp) {
        String reading = extractReading(jp);
        String cleaned = reading.replaceAll("^[～~\\-・\\s\\d\\(\\[\"'`\\./]+", "")
                                .replaceAll("[～~\\-・\\s\\d\\(\\[\"'`\\./]+$", "")
                                .strip();
        return toHiragana(cleaned).toLowerCase(Locale.ROOT);
    }
}
