package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:./target/bunpro-grammar-progress-test.db", "app.pdf-dir=./target/bunpro-grammar-progress-test-pdfs"})
@Transactional
class BunproGrammarProgressIntegrationTest {
    @Autowired BunproGrammarService grammar;
    @Autowired BunproVocabService vocab;
    @Autowired BunproService catalog;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    final Instant now=Instant.parse("2026-10-10T12:00:00.123Z");
    BunproGrammarService at(Instant time) { return new BunproGrammarService(jdbc,json,catalog,Clock.fixed(time,ZoneOffset.UTC)); }
    VocabCatalogEntry pattern() { return grammar.entries("N5").stream().filter(e->"VERIFIED".equals(e.content().status())).findFirst().orElseThrow(); }
    VocabReviewRequest rating(String rating,long revision,String id) { return new VocabReviewRequest(id,rating,"JP_TO_VI",revision); }
    @Test void manualAndBulkAssignmentPreserveLegacyAndVocabularyState() {
        var entries=grammar.entries("N5"); assertEquals(132,entries.size());
        assertTrue(entries.stream().allMatch(e->e.tier()==null));
        var first=pattern(); var second=entries.stream().filter(e->!e.id().equals(first.id()) && "VERIFIED".equals(e.content().status())).findFirst().orElseThrow();
        catalog.learnGrammar(first.id());
        var oldCard=catalog.grammarCards("N5",false).stream().filter(c->c.entryId().equals(first.id())).findFirst().orElseThrow();
        catalog.reviewGrammar(oldCard.id(),new GrammarReviewRequest("GOOD","だ"));
        var word=vocab.entries("N5").stream().filter(e->"VERIFIED".equals(e.content().status())).findFirst().orElseThrow();
        vocab.learn(word.id());
        var legacy=jdbc.queryForList("SELECT * FROM grammar_cards"); var oldReviews=jdbc.queryForList("SELECT * FROM grammar_review_logs");
        var vocabulary=jdbc.queryForList("SELECT * FROM bunpro_vocab_cards");
        at(now).assign(new VocabTierRequest(List.of(first.id(),second.id()),"EXPERT"));
        assertEquals(now.plus(Duration.ofDays(14)),grammar.detail(first.id()).dueAt());
        assertEquals("EXPERT",grammar.detail(second.id()).tier());
        assertEquals(legacy,jdbc.queryForList("SELECT * FROM grammar_cards"));
        assertEquals(oldReviews,jdbc.queryForList("SELECT * FROM grammar_review_logs"));
        assertEquals(vocabulary,jdbc.queryForList("SELECT * FROM bunpro_vocab_cards"));
        assertThrows(ResponseStatusException.class,()->at(now).assign(new VocabTierRequest(List.of(first.id(),vocab.entries("N5").getFirst().id()),"MASTER")));
        assertEquals("EXPERT",grammar.detail(first.id()).tier());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_grammar_review_logs",Integer.class));
    }
    @Test void reviewUsesSharedTierRulesAndConsistentFsrsDueDates() {
        var e=pattern(); at(now).learn(e.id());
        assertEquals(1,at(now).queue("N5").size());
        assertTrue(grammar.entries("N5").getFirst().content().sentences().isEmpty());
        assertFalse(grammar.detail(e.id()).content().sentences().isEmpty());
        var good=at(now).review(e.id(),rating("GOOD",0,"grammar-good")); assertEquals("ADEPT",good.tier());
        assertThrows(ResponseStatusException.class,()->at(now).review(e.id(),rating("GOOD",0,"grammar-good")));
        assertTrue(at(now).queue("N5").isEmpty());
        var hard=at(good.dueAt()).review(e.id(),rating("HARD",good.revision(),"grammar-hard")); assertEquals("ADEPT",hard.tier());
        var again=at(hard.dueAt()).review(e.id(),rating("AGAIN",hard.revision(),"grammar-again")); assertEquals("BEGINNER",again.tier());
        assertEquals(hard.dueAt().plus(Duration.ofMinutes(10)),again.dueAt());
        var persisted=Card.fromJson(jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_grammar_cards WHERE entry_id=?",String.class,e.id()));
        assertEquals(again.dueAt(),persisted.getDue());
        assertEquals(again.dueAt().toEpochMilli(),jdbc.queryForObject("SELECT due_at_after FROM bunpro_grammar_review_logs WHERE id='grammar-again'",Long.class));
        at(again.dueAt()).assign(new VocabTierRequest(List.of(e.id()),"MASTER"));
        var assigned=grammar.detail(e.id());
        var master=at(assigned.dueAt()).review(e.id(),rating("EASY",assigned.revision(),"grammar-master"));
        assertEquals("MASTER",master.tier()); assertTrue(master.dueAt().isAfter(assigned.dueAt()));
        assertFalse(master.dueAt().isAfter(assigned.dueAt().plus(Duration.ofDays(30))));
        assertEquals(4,master.reviewCount());
    }
    @Test void settingsAreIndependentAndBackupRestoresProgressAndMemory() {
        var e=pattern(); at(now).learn(e.id());
        var result=at(now).review(e.id(),rating("GOOD",0,"grammar-backup"));
        var vocabSettings=vocab.intervals();
        grammar.setIntervals(new VocabIntervals(List.of(2,4,8,16,32)));
        assertEquals(vocabSettings,vocab.intervals()); assertEquals(result.dueAt(),grammar.detail(e.id()).dueAt());
        assertThrows(ResponseStatusException.class,()->grammar.setIntervals(new VocabIntervals(List.of(1,3,2,14,30))));
        String memory=jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_grammar_cards WHERE entry_id=?",String.class,e.id());
        var backup=json.readValue(json.writeValueAsString(catalog.exportBackup()),LearningBackup.class);
        jdbc.update("DELETE FROM bunpro_grammar_review_logs"); jdbc.update("DELETE FROM bunpro_grammar_cards");
        grammar.setIntervals(new VocabIntervals(List.of(1,3,7,14,30))); catalog.restore(backup);
        assertEquals(memory,jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_grammar_cards WHERE entry_id=?",String.class,e.id()));
        assertEquals("ADEPT",grammar.detail(e.id()).tier()); assertEquals(List.of(2,4,8,16,32),grammar.intervals().days());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_grammar_review_logs",Integer.class));
        catalog.restore(new LearningBackup(null,null,null,null)); assertEquals("ADEPT",grammar.detail(e.id()).tier());
        Card before=Card.fromJson(memory); at(now.plusSeconds(1)).assign(new VocabTierRequest(List.of(e.id()),"EXPERT"));
        Card after=Card.fromJson(jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_grammar_cards WHERE entry_id=?",String.class,e.id()));
        assertEquals(before.getStability(),after.getStability()); assertEquals(before.getDifficulty(),after.getDifficulty());
        assertEquals(now.plusSeconds(1).plus(Duration.ofDays(16)),grammar.detail(e.id()).dueAt());
    }
}
