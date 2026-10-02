package vn.marugoto.trainer;

import java.time.Instant;
import java.util.List;

record CardInput(String jp, String romaji, String vi) {}

record DeckDto(String id, String title, String originalFilename, int cardCount, int dueCount, Instant createdAt, boolean custom) {}

record StudyCardDto(
        String id,
        String deckId,
        String deckTitle,
        String jp,
        String romaji,
        String vi,
        Instant dueAt,
        int reviewCount,
        int wrongCount
) {}

record ReviewRequest(String cardId, String rating, String source) {}

record ReviewResponse(String cardId, String rating, Instant reviewedAt, Instant dueAt, int reviewCount, int wrongCount) {}

record ApiError(String error) {}

record BatchCardUpdateItem(String id, String jp, String romaji, String vi) {}

record StudyResponse(List<StudyCardDto> cards, int dueCount) {}
