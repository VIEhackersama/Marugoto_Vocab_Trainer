package vn.marugoto.trainer;

import java.time.Instant;
import java.util.List;
import java.util.Map;

record GrammarSentence(String id, String prompt, List<String> answers, String sentence,
                       String reading, String translationVi, String explanationVi, String status) {}
record CatalogContent(String title, String reading, String romaji, String meaningEn,
                      String meaningVi, String status, String structure, String explanationVi,
                      String conjugationGroup, List<GrammarSentence> sentences, VocabData vocab) {
    CatalogContent(String title, String reading, String romaji, String meaningEn, String meaningVi,
                   String status, String structure, String explanationVi, String conjugationGroup,
                   List<GrammarSentence> sentences) {
        this(title,reading,romaji,meaningEn,meaningVi,status,structure,explanationVi,conjugationGroup,sentences,null);
    }
    CatalogContent withVocab(VocabData data) {
        return new CatalogContent(title,reading,romaji,meaningEn,meaningVi,status,structure,explanationVi,conjugationGroup,sentences,data);
    }
}
record CatalogEntry(String id, String kind, String level, int lesson, int position,
                    String sourceUrl, CatalogContent content, String vocabularyId,
                    String learningStatus, boolean edited) {}
record CatalogItem(String id, String kind, String level, int lesson, int position,
                   String sourceUrl, CatalogContent content) {}
record CatalogSnapshot(int version, String snapshotVersion, String source, String capturedAt,
                       int expectedVocab, int expectedGrammar, List<CatalogItem> entries) {}
record CatalogImportResult(int vocab, int grammar, int missingTranslations, int missingExercises) {}
record CatalogLearnRequest(String vocabularyId, Boolean createNew) {}
record CatalogLearnResult(String entryId, String vocabularyId, String status, List<VocabCandidate> candidates) {}
record VocabCandidate(String id, String spelling, String reading, String meaningVi) {}
record LessonLearnResult(int learned, int blocked, List<CatalogLearnResult> conflicts) {}
record GrammarStudyCard(String id, String entryId, String title, GrammarSentence sentence,
                        Instant dueAt, int reviewCount, int wrongCount) {}
record GrammarReviewRequest(String rating, String responseText) {}
record DictionarySource(String deckId, String title) {}
record DictionaryEntry(String id, String vocabularyId, String deckId, String deckTitle,
                       String jp, String reading, String romaji, String vi, Instant dueAt,
                       int reviewCount, int wrongCount, boolean isLeech, List<DictionarySource> sources) {}
record LearningBackup(List<Map<String,Object>> entries, List<Map<String,Object>> links,
                      List<Map<String,Object>> grammarCards, List<Map<String,Object>> grammarReviews,
                      List<Map<String,Object>> vocabContent, List<Map<String,Object>> vocabCards,
                      List<Map<String,Object>> vocabReviews, List<Map<String,Object>> vocabSettings,
                      List<Map<String,Object>> grammarProgress, List<Map<String,Object>> grammarProgressReviews,
                      List<Map<String,Object>> grammarSettings) {
    LearningBackup(List<Map<String,Object>> entries, List<Map<String,Object>> links,
                   List<Map<String,Object>> grammarCards, List<Map<String,Object>> grammarReviews,
                   List<Map<String,Object>> vocabContent, List<Map<String,Object>> vocabCards,
                   List<Map<String,Object>> vocabReviews, List<Map<String,Object>> vocabSettings) {
        this(entries,links,grammarCards,grammarReviews,vocabContent,vocabCards,vocabReviews,vocabSettings,null,null,null);
    }
    LearningBackup(List<Map<String,Object>> entries, List<Map<String,Object>> links,
                   List<Map<String,Object>> grammarCards, List<Map<String,Object>> grammarReviews) {
        this(entries,links,grammarCards,grammarReviews,null,null,null,null);
    }
}
