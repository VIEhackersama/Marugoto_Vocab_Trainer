package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
class StudyService {
    private final JdbcTemplate jdbc;
    private final DeckService decks;
    private final FsrsScheduler fsrs;

    private static final RowMapper<StudyCardDto> CARD_MAPPER = (rs, row) -> new StudyCardDto(
            rs.getString("id"), rs.getString("deck_id"), rs.getString("deck_title"),
            rs.getString("japanese"), rs.getString("romaji"), rs.getString("vietnamese"),
            Instant.ofEpochMilli(rs.getLong("due_at")), rs.getInt("review_count"), rs.getInt("wrong_count"));

    StudyService(JdbcTemplate jdbc, DeckService decks, FsrsScheduler fsrs) {
        this.jdbc = jdbc;
        this.decks = decks;
        this.fsrs = fsrs;
    }

    @Transactional(readOnly = true)
    StudyResponse cards(String deckId, String mode) {
        return cards(deckId, mode, false, "JP_TO_VI");
    }

    @Transactional(readOnly = true)
    StudyResponse cards(String deckId, String mode, boolean includeCustom) {
        return cards(deckId, mode, includeCustom, "JP_TO_VI");
    }

    @Transactional
    StudyResponse cards(String deckId, String mode, boolean includeCustom, String cardType) {
        String normalizedCardType = normalizeCardType(cardType);
        ensureCardsForDirection(normalizedCardType);

        String normalizedMode = mode == null ? "all" : mode.toLowerCase(Locale.ROOT);
        if (!normalizedMode.equals("all") && !normalizedMode.equals("due")) {
            throw new ResponseStatusException(BAD_REQUEST, "mode phải là all hoặc due.");
        }
        boolean allDecks = deckId == null || deckId.isBlank() || deckId.equalsIgnoreCase("all");
        if (!allDecks && !decks.exists(deckId)) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy bộ từ vựng.");

        long now = System.currentTimeMillis();
        String scopeClause;
        List<Object> args = new ArrayList<>();

        if (allDecks) {
            if (includeCustom) {
                scopeClause = "";
            } else {
                scopeClause = " AND vs.deck_id != 'custom'";
            }
        } else if ("custom".equalsIgnoreCase(deckId)) {
            scopeClause = " AND vs.deck_id = 'custom'";
        } else {
            if (includeCustom) {
                scopeClause = " AND (vs.deck_id = ? OR vs.deck_id = 'custom')";
                args.add(deckId);
            } else {
                scopeClause = " AND vs.deck_id = ?";
                args.add(deckId);
            }
        }

        String typeClause = " AND s.card_type = ?";
        args.add(normalizedCardType);

        String dueClause = normalizedMode.equals("due") ? " AND s.due_at <= ?" : "";
        if (normalizedMode.equals("due")) {
            args.add(now);
        }

        String sql = """
                SELECT s.id, vs.deck_id, d.title AS deck_title, v.spelling AS japanese, v.romaji, v.meanings_vi AS vietnamese,
                       s.due_at, s.review_count, s.wrong_count
                FROM study_cards s
                JOIN vocabularies v ON v.id = s.vocabulary_id
                JOIN vocabulary_sources vs ON vs.vocabulary_id = v.id
                JOIN decks d ON d.id = vs.deck_id
                WHERE 1=1
                """ + scopeClause + typeClause + dueClause + " ORDER BY s.due_at ASC, s.created_at ASC";

        List<StudyCardDto> cards = jdbc.query(sql, CARD_MAPPER, args.toArray());

        String dueSql = """
                SELECT COUNT(DISTINCT s.id)
                FROM study_cards s
                JOIN vocabulary_sources vs ON vs.vocabulary_id = s.vocabulary_id
                WHERE s.due_at <= ? AND s.card_type = ?
                """ + scopeClause;
        List<Object> dueArgs = new ArrayList<>();
        dueArgs.add(now);
        dueArgs.add(normalizedCardType);
        if (!allDecks && !"custom".equalsIgnoreCase(deckId)) {
            dueArgs.add(deckId);
        }
        Integer dueCount = jdbc.queryForObject(dueSql, Integer.class, dueArgs.toArray());
        return new StudyResponse(cards, dueCount == null ? 0 : dueCount);
    }

    public synchronized void ensureCardsForDirection(String cardType) {
        String normalizedType = normalizeCardType(cardType);
        List<String> missingVocabIds = jdbc.query(
                "SELECT v.id FROM vocabularies v WHERE NOT EXISTS (SELECT 1 FROM study_cards s WHERE s.vocabulary_id = v.id AND s.card_type = ?)",
                (rs, i) -> rs.getString("id"),
                normalizedType
        );
        if (missingVocabIds.isEmpty()) return;
        long now = System.currentTimeMillis();
        for (String vocabId : missingVocabIds) {
            Card state = fsrs.newCard();
            jdbc.update("""
                    INSERT INTO study_cards(id, vocabulary_id, card_type, fsrs_card_json, due_at, created_at)
                    VALUES(?,?,?,?,?,?)
                    """, UUID.randomUUID().toString(), vocabId, normalizedType,
                    fsrs.write(state), fsrs.dueAt(state).toEpochMilli(), now);
        }
    }

    private static String normalizeCardType(String cardType) {
        if (cardType == null || cardType.isBlank() || cardType.equalsIgnoreCase("jp-vi") || cardType.equalsIgnoreCase("JP_TO_VI")) {
            return "JP_TO_VI";
        }
        if (cardType.equalsIgnoreCase("vi-jp") || cardType.equalsIgnoreCase("VI_TO_JP")) {
            return "VI_TO_JP";
        }
        return cardType.toUpperCase(Locale.ROOT);
    }
}
