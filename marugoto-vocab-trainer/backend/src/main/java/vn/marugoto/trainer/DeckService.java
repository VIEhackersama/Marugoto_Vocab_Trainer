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
            List<ExistingVocab> existingVocabs = jdbc.query(
                    "SELECT id, spelling, reading, meanings_vi FROM vocabularies",
                    (rs, i) -> new ExistingVocab(rs.getString("id"), rs.getString("spelling"), rs.getString("reading"), rs.getString("meanings_vi"))
            );
            entries = entries.stream().filter(entry -> !isDuplicate(entry, existingVocabs)).toList();
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

            List<ExistingVocab> allVocabs = new ArrayList<>(jdbc.query(
                    "SELECT id, spelling, reading, meanings_vi FROM vocabularies",
                    (rs, i) -> new ExistingVocab(rs.getString("id"), rs.getString("spelling"), rs.getString("reading"), rs.getString("meanings_vi"))
            ));

            for (CardInput entry : entries) {
                String vocabId = findMatchingVocabId(entry, allVocabs);
                String reading = extractReading(entry.jp());
                if (vocabId == null) {
                    vocabId = UUID.randomUUID().toString();
                    jdbc.update("""
                            INSERT INTO vocabularies(id,spelling,reading,romaji,meanings_vi,created_at)
                            VALUES(?,?,?,?,?,?)
                            """, vocabId, entry.jp(), reading, entry.romaji(), entry.vi(), now);
                    allVocabs.add(new ExistingVocab(vocabId, entry.jp(), reading, entry.vi()));
                }

                jdbc.update("""
                        INSERT INTO vocabulary_sources(id,vocabulary_id,deck_id,created_at)
                        VALUES(?,?,?,?)
                        """, UUID.randomUUID().toString(), vocabId, deckId, now);

                Integer cardCount = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM study_cards WHERE vocabulary_id=? AND card_type='JP_TO_VI'",
                        Integer.class, vocabId);
                if (cardCount == null || cardCount == 0) {
                    Card state = fsrs.newCard();
                    jdbc.update("""
                            INSERT INTO study_cards(id,vocabulary_id,card_type,fsrs_card_json,due_at,created_at)
                            VALUES(?,?,?,?,?,?)
                            """, UUID.randomUUID().toString(), vocabId, "JP_TO_VI",
                            fsrs.write(state), fsrs.dueAt(state).toEpochMilli(), now);
                }
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
                SELECT d.id, d.title, d.original_filename, d.created_at,
                       COUNT(DISTINCT s.id) AS card_count,
                       SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END) AS due_count
                FROM decks d
                LEFT JOIN vocabulary_sources vs ON vs.deck_id = d.id
                LEFT JOIN study_cards s ON s.vocabulary_id = vs.vocabulary_id
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
        jdbc.update("DELETE FROM vocabulary_sources WHERE deck_id=?", deckId);
        jdbc.update("DELETE FROM vocabularies WHERE id NOT IN (SELECT vocabulary_id FROM vocabulary_sources)");
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
        String vocabId = UUID.randomUUID().toString();
        String reading = extractReading(jp);
        jdbc.update("""
                INSERT INTO vocabularies(id,spelling,reading,romaji,meanings_vi,created_at)
                VALUES(?,?,?,?,?,?)
                """, vocabId, jp, reading, romaji, vi, now);

        jdbc.update("""
                INSERT INTO vocabulary_sources(id,vocabulary_id,deck_id,created_at)
                VALUES(?,?,?,?)
                """, UUID.randomUUID().toString(), vocabId, "custom", now);

        String cardId = UUID.randomUUID().toString();
        Card state = fsrs.newCard();
        jdbc.update("""
                INSERT INTO study_cards(id,vocabulary_id,card_type,fsrs_card_json,due_at,created_at)
                VALUES(?,?,?,?,?,?)
                """, cardId, vocabId, "JP_TO_VI",
                fsrs.write(state), fsrs.dueAt(state).toEpochMilli(), now);
        return new StudyCardDto(cardId, "custom", "Từ vựng tùy chỉnh", jp, romaji, vi, fsrs.dueAt(state), 0, 0);
    }

    @Transactional
    void deleteCard(String cardId) {
        List<String> vocabIds = jdbc.query(
                "SELECT vocabulary_id FROM study_cards WHERE id=?",
                (rs, i) -> rs.getString("vocabulary_id"),
                cardId
        );
        if (vocabIds.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng.");
        String vocabId = vocabIds.getFirst();

        int deleted = jdbc.update("DELETE FROM study_cards WHERE id=?", cardId);
        if (deleted == 0) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng.");

        Integer remainingCards = jdbc.queryForObject(
                "SELECT COUNT(*) FROM study_cards WHERE vocabulary_id=?",
                Integer.class,
                vocabId
        );
        if (remainingCards == null || remainingCards == 0) {
            jdbc.update("DELETE FROM vocabularies WHERE id=?", vocabId);
        }
    }

    @Transactional
    StudyCardDto updateCard(String cardId, CardInput input) {
        if (input == null) throw new ResponseStatusException(BAD_REQUEST, "Thiếu thông tin từ vựng.");
        String jp = normalize(input.jp());
        String vi = normalize(input.vi());
        String romaji = input.romaji() == null ? "" : normalize(input.romaji());
        if (jp.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Tiếng Nhật không được để trống.");
        if (vi.isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Nghĩa tiếng Việt không được để trống.");

        List<String> vocabIds = jdbc.query(
                "SELECT vocabulary_id FROM study_cards WHERE id=?",
                (rs, i) -> rs.getString("vocabulary_id"),
                cardId
        );
        if (vocabIds.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy từ vựng.");
        String vocabId = vocabIds.getFirst();
        String reading = extractReading(jp);

        jdbc.update("""
                UPDATE vocabularies SET spelling = ?, reading = ?, romaji = ?, meanings_vi = ?
                WHERE id = ?
                """, jp, reading, romaji, vi, vocabId);

        return jdbc.query("""
                SELECT s.id, vs.deck_id, d.title AS deck_title, v.spelling AS japanese, v.romaji, v.meanings_vi AS vietnamese,
                       s.due_at, s.review_count, s.wrong_count
                FROM study_cards s
                JOIN vocabularies v ON v.id = s.vocabulary_id
                JOIN vocabulary_sources vs ON vs.vocabulary_id = v.id
                JOIN decks d ON d.id = vs.deck_id
                WHERE s.id = ?
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

            List<String> vocabIds = jdbc.query(
                    "SELECT vocabulary_id FROM study_cards WHERE id=?",
                    (rs, i) -> rs.getString("vocabulary_id"),
                    item.id()
            );
            if (!vocabIds.isEmpty()) {
                String vocabId = vocabIds.getFirst();
                String reading = extractReading(jp);
                jdbc.update("UPDATE vocabularies SET spelling = ?, reading = ?, romaji = ?, meanings_vi = ? WHERE id = ?",
                        jp, reading, romaji, vi, vocabId);
                updatedIds.add(item.id());
            }
        }
        if (updatedIds.isEmpty()) return List.of();
        String inSql = String.join(",", java.util.Collections.nCopies(updatedIds.size(), "?"));
        return jdbc.query("""
                SELECT s.id, vs.deck_id, d.title AS deck_title, v.spelling AS japanese, v.romaji, v.meanings_vi AS vietnamese,
                       s.due_at, s.review_count, s.wrong_count
                FROM study_cards s
                JOIN vocabularies v ON v.id = s.vocabulary_id
                JOIN vocabulary_sources vs ON vs.vocabulary_id = v.id
                JOIN decks d ON d.id = vs.deck_id
                WHERE s.id IN (""" + inSql + ")", STUDY_CARD_MAPPER, updatedIds.toArray());
    }

    DeckDto findDeck(String deckId) {
        long now = System.currentTimeMillis();
        return jdbc.query("""
                SELECT d.id, d.title, d.original_filename, d.created_at,
                       COUNT(DISTINCT s.id) AS card_count,
                       SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END) AS due_count
                FROM decks d
                LEFT JOIN vocabulary_sources vs ON vs.deck_id = d.id
                LEFT JOIN study_cards s ON s.vocabulary_id = vs.vocabulary_id
                WHERE d.id=? GROUP BY d.id
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

    public record ExistingVocab(String id, String spelling, String reading, String meaningsVi) {}

    public static String extractKanjiOnly(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '\u4e00' && c <= '\u9faf') {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    public static boolean areWordsHomophones(String jp1, String vi1, String jp2, String vi2) {
        String kana1 = canonicalKanaKey(jp1);
        String kana2 = canonicalKanaKey(jp2);
        if (kana1.isEmpty() || !kana1.equals(kana2)) return false;

        String kanji1 = extractKanjiOnly(jp1);
        String kanji2 = extractKanjiOnly(jp2);

        // If both have kanji and their kanji characters differ -> homophones! (e.g. 橋 vs 箸)
        if (!kanji1.isEmpty() && !kanji2.isEmpty() && !kanji1.equals(kanji2)) {
            return true;
        }

        // If one or both lack kanji, check if meanings are distinct
        if (vi1 != null && vi2 != null && !vi1.isBlank() && !vi2.isBlank()) {
            boolean overlap = meaningsOverlap(vi1, vi2);
            if (!overlap && !kanji1.equals(kanji2)) {
                return true;
            }
        }
        return false;
    }

    public static boolean meaningsOverlap(String vi1, String vi2) {
        if (vi1 == null || vi2 == null || vi1.isBlank() || vi2.isBlank()) return true;
        Set<String> words1 = extractMeaningWords(vi1);
        Set<String> words2 = extractMeaningWords(vi2);
        if (words1.isEmpty() || words2.isEmpty()) return true;
        for (String w : words1) {
            if (words2.contains(w)) return true;
        }
        return false;
    }

    private static Set<String> extractMeaningWords(String vi) {
        String normalized = java.text.Normalizer.normalize(vi.toLowerCase(Locale.ROOT), java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[^a-z0-9\\s]", " ");
        String[] parts = normalized.split("\\s+");
        Set<String> set = new HashSet<>();
        for (String p : parts) {
            if (p.length() > 1) set.add(p);
        }
        return set;
    }

    private static boolean isDuplicate(CardInput candidate, List<ExistingVocab> existingList) {
        String candJp = candidate.jp().trim().toLowerCase(Locale.ROOT);
        String candKana = canonicalKanaKey(candidate.jp());

        for (ExistingVocab ex : existingList) {
            String exJp = ex.spelling().trim().toLowerCase(Locale.ROOT);
            if (candJp.equals(exJp)) {
                return true;
            }

            String exKana = ex.reading() == null || ex.reading().isBlank()
                    ? canonicalKanaKey(ex.spelling())
                    : canonicalKanaKey(ex.reading());

            if (!candKana.isEmpty() && candKana.equals(exKana)) {
                if (areWordsHomophones(candidate.jp(), candidate.vi(), ex.spelling(), ex.meaningsVi())) {
                    continue;
                }
                return true;
            }
        }
        return false;
    }

    private static String findMatchingVocabId(CardInput candidate, List<ExistingVocab> existingList) {
        String candJp = candidate.jp().trim().toLowerCase(Locale.ROOT);
        String candKana = canonicalKanaKey(candidate.jp());

        for (ExistingVocab ex : existingList) {
            String exJp = ex.spelling().trim().toLowerCase(Locale.ROOT);
            if (candJp.equals(exJp)) {
                return ex.id();
            }

            String exKana = ex.reading() == null || ex.reading().isBlank()
                    ? canonicalKanaKey(ex.spelling())
                    : canonicalKanaKey(ex.reading());

            if (!candKana.isEmpty() && candKana.equals(exKana)) {
                if (!areWordsHomophones(candidate.jp(), candidate.vi(), ex.spelling(), ex.meaningsVi())) {
                    return ex.id();
                }
            }
        }
        return null;
    }
}
