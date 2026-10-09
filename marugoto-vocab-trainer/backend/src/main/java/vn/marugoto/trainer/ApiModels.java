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
        int wrongCount,
        boolean isLeech
) {
    public StudyCardDto(String id, String deckId, String deckTitle, String jp, String romaji, String vi, Instant dueAt, int reviewCount, int wrongCount) {
        this(id, deckId, deckTitle, jp, romaji, vi, dueAt, reviewCount, wrongCount,
                wrongCount >= 3 || (reviewCount >= 3 && (double) wrongCount / reviewCount >= 0.35));
    }
}

record ReviewRequest(String cardId, String rating, String source, Long responseMs, String cardType) {
    public ReviewRequest(String cardId, String rating, String source) {
        this(cardId, rating, source, null, "JP_TO_VI");
    }
}

record ReviewResponse(String cardId, String rating, Instant reviewedAt, Instant dueAt, int reviewCount, int wrongCount) {}

record ApiError(String error) {}

record BatchCardUpdateItem(String id, String jp, String romaji, String vi) {}

record StudyResponse(List<StudyCardDto> cards, int dueCount) {}

// --- Backup & Restore DTOs ---

record BackupDeckItem(
        String id,
        String title,
        String originalFilename,
        String storedFilename,
        long fileSize,
        long createdAt
) {}

record BackupVocabItem(
        String id,
        String spelling,
        String reading,
        String romaji,
        String meaningsVi,
        long createdAt,
        List<String> deckIds
) {}

record BackupStudyCardItem(
        String id,
        String vocabularyId,
        String cardType,
        String fsrsCardJson,
        long dueAt,
        Long lastReviewedAt,
        int reviewCount,
        int wrongCount,
        long createdAt
) {}

record BackupReviewLogItem(
        String id,
        String cardId,
        String rating,
        String source,
        long reviewedAt,
        long dueAtAfter,
        String cardType,
        Long responseMs,
        Integer isCorrect
) {}

record BackupDataDto(
        int version,
        long exportedAt,
        List<BackupDeckItem> decks,
        List<BackupVocabItem> vocabularies,
        List<BackupStudyCardItem> studyCards,
        List<BackupReviewLogItem> reviewLogs,
        LearningBackup learning
) {
    public BackupDataDto(int version, long exportedAt, List<BackupDeckItem> decks,
                         List<BackupVocabItem> vocabularies, List<BackupStudyCardItem> studyCards,
                         List<BackupReviewLogItem> reviewLogs) {
        this(version, exportedAt, decks, vocabularies, studyCards, reviewLogs, null);
    }
}

record BackupImportResult(
        int importedDecks,
        int importedVocabularies,
        int importedStudyCards,
        int importedReviewLogs,
        String message
) {}
