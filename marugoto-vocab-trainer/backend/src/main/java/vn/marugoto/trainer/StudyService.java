package vn.marugoto.trainer;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
class StudyService {
    private final JdbcTemplate jdbc;
    private final DeckService decks;

    private static final RowMapper<StudyCardDto> CARD_MAPPER = (rs, row) -> new StudyCardDto(
            rs.getString("id"), rs.getString("deck_id"), rs.getString("deck_title"),
            rs.getString("japanese"), rs.getString("romaji"), rs.getString("vietnamese"),
            Instant.ofEpochMilli(rs.getLong("due_at")), rs.getInt("review_count"), rs.getInt("wrong_count"));

    StudyService(JdbcTemplate jdbc, DeckService decks) {
        this.jdbc = jdbc;
        this.decks = decks;
    }

    @Transactional(readOnly = true)
    StudyResponse cards(String deckId, String mode) {
        return cards(deckId, mode, false);
    }

    @Transactional(readOnly = true)
    StudyResponse cards(String deckId, String mode, boolean includeCustom) {
        String normalizedMode = mode == null ? "all" : mode.toLowerCase();
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
                scopeClause = " AND c.deck_id != 'custom'";
            }
        } else if ("custom".equalsIgnoreCase(deckId)) {
            scopeClause = " AND c.deck_id = 'custom'";
        } else {
            if (includeCustom) {
                scopeClause = " AND (c.deck_id = ? OR c.deck_id = 'custom')";
                args.add(deckId);
            } else {
                scopeClause = " AND c.deck_id = ?";
                args.add(deckId);
            }
        }

        String dueClause = normalizedMode.equals("due") ? " AND c.due_at <= ?" : "";
        if (normalizedMode.equals("due")) {
            args.add(now);
        }

        String sql = """
                SELECT c.id,c.deck_id,d.title AS deck_title,c.japanese,c.romaji,c.vietnamese,
                       c.due_at,c.review_count,c.wrong_count
                FROM cards c JOIN decks d ON d.id=c.deck_id WHERE 1=1
                """ + scopeClause + dueClause + " ORDER BY c.due_at ASC,c.created_at ASC";

        List<StudyCardDto> cards = jdbc.query(sql, CARD_MAPPER, args.toArray());

        String dueSql = "SELECT COUNT(*) FROM cards c WHERE c.due_at <= ?" + scopeClause;
        List<Object> dueArgs = new ArrayList<>();
        dueArgs.add(now);
        if (!allDecks && !"custom".equalsIgnoreCase(deckId)) {
            dueArgs.add(deckId);
        }
        Integer dueCount = jdbc.queryForObject(dueSql, Integer.class, dueArgs.toArray());
        return new StudyResponse(cards, dueCount == null ? 0 : dueCount);
    }
}
