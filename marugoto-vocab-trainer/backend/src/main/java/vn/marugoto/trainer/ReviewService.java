package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.CardAndReviewLog;
import io.github.openspacedrepetition.Rating;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
class ReviewService {
    private final JdbcTemplate jdbc;
    private final FsrsScheduler fsrs;

    ReviewService(JdbcTemplate jdbc, FsrsScheduler fsrs) {
        this.jdbc = jdbc;
        this.fsrs = fsrs;
    }

    @Transactional
    ReviewResponse review(ReviewRequest request) {
        if (request == null || request.cardId() == null || request.cardId().isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "Thiếu cardId.");
        }
        Rating rating = parseRating(request.rating());
        String source = parseSource(request.source());
        var rows = jdbc.query("SELECT fsrs_card_json,due_at,review_count,wrong_count FROM study_cards WHERE id=?",
                (rs, row) -> new ExistingCard(rs.getString("fsrs_card_json"), rs.getInt("review_count"), rs.getInt("wrong_count")),
                request.cardId());
        if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Không tìm thấy thẻ.");

        ExistingCard existing = rows.getFirst();
        Card prior = fsrs.read(existing.fsrsJson());
        CardAndReviewLog result = fsrs.review(prior, rating);
        Card updated = result.card();
        Instant now = Instant.now();
        long dueAt = fsrs.dueAt(updated).toEpochMilli();
        int reviewCount = existing.reviewCount() + 1;
        int wrongCount = existing.wrongCount() + (rating == Rating.AGAIN ? 1 : 0);
        String cardType = request.cardType() == null || request.cardType().isBlank() ? "JP_TO_VI" : request.cardType();
        int isCorrect = rating == Rating.AGAIN ? 0 : 1;

        jdbc.update("UPDATE study_cards SET fsrs_card_json=?,due_at=?,review_count=?,wrong_count=?,last_reviewed_at=? WHERE id=?",
                fsrs.write(updated), dueAt, reviewCount, wrongCount, now.toEpochMilli(), request.cardId());
        jdbc.update("INSERT INTO review_logs(id,card_id,rating,source,reviewed_at,due_at_after,card_type,response_ms,is_correct) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), request.cardId(), rating.name(), source, now.toEpochMilli(), dueAt, cardType, request.responseMs(), isCorrect);
        return new ReviewResponse(request.cardId(), rating.name(), now, Instant.ofEpochMilli(dueAt), reviewCount, wrongCount);
    }

    private static Rating parseRating(String value) {
        if (value == null) throw new ResponseStatusException(BAD_REQUEST, "Thiếu rating.");
        try {
            return Rating.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(BAD_REQUEST, "rating phải là AGAIN, HARD, GOOD hoặc EASY.");
        }
    }

    private static String parseSource(String value) {
        if (value == null) throw new ResponseStatusException(BAD_REQUEST, "Thiếu source.");
        String normalized = value.toUpperCase(Locale.ROOT);
        if (!normalized.equals("FLASHCARD") && !normalized.equals("RECALL") && !normalized.equals("TEST")) {
            throw new ResponseStatusException(BAD_REQUEST, "source không hợp lệ.");
        }
        return normalized;
    }

    private record ExistingCard(String fsrsJson, int reviewCount, int wrongCount) {}
}
