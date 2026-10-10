package vn.marugoto.trainer;

import java.time.Instant;
import java.util.List;

record VocabSense(String id, String meaning, List<String> partsOfSpeech, List<String> sourceLabels, String notes) {}
record RubyToken(String text, String reading) {}
record VocabExample(String id, String sentence, String reading, List<RubyToken> tokens,
                    String translationEn, String translationVi, String notes, String level) {}
record VocabData(List<VocabSense> senses, List<String> partsOfSpeech, List<String> unknownLabels,
                 List<VocabExample> examples, String notes, String completeness, String capturedAt,
                 List<String> issues) {}
record VocabCatalogEntry(String id, String kind, String level, int lesson, int position, String sourceUrl,
                         CatalogContent content, String learningStatus, boolean edited, String tier,
                         Instant dueAt, int reviewCount, int wrongCount, long revision,
                         int exampleCount, List<String> partsOfSpeech, String completeness) {}
record VocabTierRequest(List<String> entryIds, String tier) {}
record VocabReviewRequest(String requestId, String rating, String direction, long revision) {}
record VocabReviewResult(String entryId, String tier, Instant dueAt, int reviewCount, int wrongCount, long revision) {}
record VocabIntervals(List<Integer> days) {}
record CapturePreview(int words, int examples, int matched, int newWords, int unclassified,
                      int unknownLabels, int declaredWords, int declaredExamples, List<String> errors) {}
