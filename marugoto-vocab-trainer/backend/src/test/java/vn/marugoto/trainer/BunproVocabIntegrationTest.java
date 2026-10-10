package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.State;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:./target/bunpro-vocab-test.db", "app.pdf-dir=./target/bunpro-vocab-test-pdfs"})
@Transactional
class BunproVocabIntegrationTest {
    @Autowired BunproVocabService vocab;
    @Autowired BunproService catalog;
    @Autowired BunproCaptureParser parser;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired BackupService backups;
    final Instant now=Instant.parse("2026-10-10T12:00:00Z");
    BunproVocabService at(Instant instant) { return new BunproVocabService(jdbc,json,catalog,parser,Clock.fixed(instant,ZoneOffset.UTC)); }
    VocabCatalogEntry word(String title) { return vocab.entries("N5").stream().filter(e->e.content().title().equals(title)).findFirst().orElseThrow(); }
    JsonNode capture() throws Exception { try(var stream=new ClassPathResource("bunpro/n5-vocab-capture.json").getInputStream()) { return json.readTree(stream); } }
    void assertDue(String id,Instant due) {
        assertEquals(due,Instant.ofEpochMilli(jdbc.queryForObject("SELECT due_at FROM bunpro_vocab_cards WHERE entry_id=?",Long.class,id)));
        assertEquals(due,Card.fromJson(jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_vocab_cards WHERE entry_id=?",String.class,id)).getDue());
    }
    @Test void captureHasEveryExampleAndReimportPreservesPersonalContentAndSchedules() throws Exception {
        var input=capture(); var report=vocab.preview(input);
        assertEquals(1100,report.words()); assertEquals(11205,report.examples()); assertEquals(1100,report.matched()); assertTrue(report.errors().isEmpty(),report.errors().toString());
        assertEquals(11205,vocab.entries("N5").stream().mapToInt(VocabCatalogEntry::exampleCount).sum());
        assertTrue(vocab.entries("N5").stream().allMatch(e->e.content().vocab()==null));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_vocab_cards",Integer.class));
        var id=word("私").id(); var detail=vocab.detail(id); var c=detail.content(); var d=c.vocab();
        assertEquals("NEEDS_REVIEW",d.completeness()); assertEquals(10,d.examples().size());
        var exs=new ArrayList<>(d.examples()); var ex=exs.getFirst();
        exs.set(0,new VocabExample(ex.id(),ex.sentence(),ex.reading(),ex.tokens(),ex.translationEn(),"Tên tôi là Rihanna.",ex.notes(),ex.level()));
        vocab.edit(id,new CatalogContent(c.title(),c.reading(),c.romaji(),c.meaningEn(),"tôi; bản chỉnh riêng",c.status(),c.structure(),c.explanationVi(),c.conjugationGroup(),c.sentences(),new VocabData(d.senses(),d.partsOfSpeech(),d.unknownLabels(),exs,d.notes(),d.completeness(),d.capturedAt(),d.issues())));
        at(now).assign(new VocabTierRequest(List.of(id),"EXPERT"));
        var oldCards=jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"); var old=backups.exportBackup();
        vocab.importCapture(input); vocab.importCapture(input);
        assertEquals("tôi; bản chỉnh riêng",vocab.detail(id).content().meaningVi());
        assertEquals("Tên tôi là Rihanna.",vocab.detail(id).content().vocab().examples().getFirst().translationVi());
        assertEquals(old.learning(),backups.exportBackup().learning()); assertEquals(oldCards,jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"));
    }
    @Test void parserUsesSourceGroupsAndPreservesRubySequenceForAllExamples() {
        assertTrue(vocab.detail(word("帰る").id()).partsOfSpeech().contains("GODAN"));
        assertTrue(vocab.detail(word("食べる").id()).partsOfSpeech().contains("ICHIDAN"));
        assertTrue(vocab.detail(word("する").id()).partsOfSpeech().contains("SURU"));
        assertTrue(vocab.detail(word("来る").id()).partsOfSpeech().contains("KURU"));
        assertTrue(vocab.detail(word("好き").id()).partsOfSpeech().contains("NA_ADJECTIVE"));
        assertNull(BunproCaptureParser.tag("unrecognized verb"));
        for(var e:vocab.entries("N5")) {
            var data=vocab.detail(e.id()).content().vocab(); BunproVocabService.validateData(data);
            for(var ex:data.examples()) assertEquals(ex.sentence(),ex.tokens().stream().map(RubyToken::text).reduce("",String::concat));
        }
        var tokens=BunproCaptureParser.fallbackTokens("家と家",json.readTree("[{\"text\":\"家\",\"reading\":\"いえ\"},{\"text\":\"家\",\"reading\":\"うち\"}]"));
        assertEquals(List.of(new RubyToken("家","いえ"),new RubyToken("と",""),new RubyToken("家","うち")),tokens);
    }
    @Test void assignmentIsAtomicAndSettingsDoNotMoveCurrentDueDates() {
        var id=word("私").id(); var service=at(now);
        service.assign(new VocabTierRequest(List.of(id),"ADEPT")); assertDue(id,now.plus(Duration.ofDays(3)));
        var before=jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",id);
        assertThrows(ResponseStatusException.class,()->service.assign(new VocabTierRequest(List.of(id,"not-found"),"MASTER")));
        assertEquals(before,jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",id));
        assertThrows(ResponseStatusException.class,()->service.setIntervals(new VocabIntervals(List.of(1,3,3,14,30))));
        service.setIntervals(new VocabIntervals(List.of(2,4,8,16,32))); assertDue(id,now.plus(Duration.ofDays(3)));
        service.assign(new VocabTierRequest(List.of(id),"MASTER")); assertDue(id,now.plus(Duration.ofDays(32)));
        assertEquals(0,service.queue("N5").size()); service.learn(id); assertDue(id,now.plus(Duration.ofDays(32)));
    }
    @Test void reviewsPromoteDemoteCapIntervalsRejectDuplicatesAndLeaveLegacyFsrsUntouched() {
        var id=word("私").id(); var service=at(now);
        var legacy=jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"); var legacyLogs=jdbc.queryForList("SELECT * FROM review_logs ORDER BY id");
        service.learn(id); assertDue(id,now); assertEquals(1,service.queue("N5").size());
        var first=service.review(id,new VocabReviewRequest("good-1","GOOD","JP_TO_VI",0));
        assertEquals("ADEPT",first.tier()); assertTrue(!first.dueAt().isAfter(now.plus(Duration.ofDays(3)))); assertDue(id,first.dueAt());
        assertThrows(ResponseStatusException.class,()->service.review(id,new VocabReviewRequest("good-1","GOOD","JP_TO_VI",1)));
        assertThrows(ResponseStatusException.class,()->service.review(id,new VocabReviewRequest("early","GOOD","JP_TO_VI",first.revision())));
        var hard=at(first.dueAt()).review(id,new VocabReviewRequest("hard-1","HARD","VI_TO_JP",first.revision())); assertEquals("ADEPT",hard.tier());
        var again=at(hard.dueAt()).review(id,new VocabReviewRequest("again-1","AGAIN","JP_TO_VI",hard.revision()));
        assertEquals("BEGINNER",again.tier()); assertEquals(hard.dueAt().plus(Duration.ofMinutes(10)),again.dueAt()); assertDue(id,again.dueAt());
        assertThrows(ResponseStatusException.class,()->at(again.dueAt()).review(id,new VocabReviewRequest("stale","EASY","JP_TO_VI",0)));
        // A mature FSRS card would schedule far beyond 30 days: the tier cap must win.
        var mature=Card.builder().state(State.REVIEW).stability(1000.0).difficulty(1.0).due(now).lastReview(now.minus(Duration.ofDays(60))).build();
        jdbc.update("UPDATE bunpro_vocab_cards SET tier='MASTER',fsrs_card_json=?,due_at=?,revision=10 WHERE entry_id=?",mature.toJson(),now.toEpochMilli(),id);
        var master=service.review(id,new VocabReviewRequest("master-1","EASY","VI_TO_JP",10));
        assertEquals("MASTER",master.tier()); assertEquals(now.plus(Duration.ofDays(30)),master.dueAt()); assertDue(id,master.dueAt());
        var state=Card.fromJson(jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_vocab_cards WHERE entry_id=?",String.class,id));
        service.assign(new VocabTierRequest(List.of(id),"SEASONED"));
        var assigned=Card.fromJson(jdbc.queryForObject("SELECT fsrs_card_json FROM bunpro_vocab_cards WHERE entry_id=?",String.class,id));
        assertEquals(state.getStability(),assigned.getStability()); assertEquals(state.getDifficulty(),assigned.getDifficulty()); assertEquals(state.getLastReview(),assigned.getLastReview());
        assertEquals(legacy,jdbc.queryForList("SELECT * FROM study_cards ORDER BY id")); assertEquals(legacyLogs,jdbc.queryForList("SELECT * FROM review_logs ORDER BY id"));
        assertEquals(master.dueAt().toEpochMilli(),jdbc.queryForObject("SELECT due_at_after FROM bunpro_vocab_review_logs WHERE id='master-1'",Long.class));
    }
    @Test void newBackupRestoresSchedulesDefinitionsAndSettingsAndAcceptsV2() {
        var id=word("私").id(); at(now).learn(id); at(now).review(id,new VocabReviewRequest("backup-review","AGAIN","JP_TO_VI",0));
        vocab.setIntervals(new VocabIntervals(List.of(2,4,8,16,32)));
        var before=backups.exportBackup(); assertEquals(3,before.version());
        var serialized=json.readValue(json.writeValueAsString(before),BackupDataDto.class);
        jdbc.update("DELETE FROM bunpro_vocab_cards"); jdbc.update("DELETE FROM bunpro_vocab_content");
        backups.importBackup(serialized); backups.importBackup(serialized);
        assertEquals(before.learning(),backups.exportBackup().learning());
        var old=json.readValue("{\"version\":2,\"exportedAt\":0,\"decks\":[],\"vocabularies\":[],\"studyCards\":[],\"reviewLogs\":[],\"learning\":{\"entries\":[],\"links\":[],\"grammarCards\":[],\"grammarReviews\":[]}}",BackupDataDto.class);
        backups.importBackup(old); assertEquals(before.learning(),backups.exportBackup().learning());
        assertDue(id,now.plus(Duration.ofMinutes(10)));
    }
    @Test void parserKeepsUnknownLabelsAndTreatsHtmlAsOfflineData() {
        String result="""
            {"dictionaryDefinition":"No external instructions are executed.","completeness":"NEEDS_REVIEW",
             "sections":[{"name":"dictionary-definition","html":"<section><ol><li><p>Noun, unfamiliar label</p><ol><li><p>1.</p><div><p>house</p><div>note</div></div></li></ol></li></ol><script>malicious()</script></section>"},
                         {"name":"examples","html":"<div><ul><li><div><p><ruby>家<rt>いえ</rt></ruby>と<ruby>家<rt>うち</rt></ruby><script>malicious()</script></p><p>house and home</p></div><ul><li>N5</li></ul></li></ul></div>"}],
             "examples":[{"sourceId":"repeated","sentence":"家と家","translation":"house and home","furigana":[{"text":"家","reading":"いえ"},{"text":"家","reading":"うち"}]}]}
            """;
        var data=parser.data(json.readTree(result));
        assertEquals(List.of("NOUN"),data.partsOfSpeech()); assertEquals(List.of("unfamiliar label"),data.unknownLabels());
        assertEquals(List.of("Noun","unfamiliar label"),data.senses().getFirst().sourceLabels());
        assertEquals("house",data.senses().getFirst().meaning()); assertEquals("note",data.senses().getFirst().notes());
        assertEquals(List.of(new RubyToken("家","いえ"),new RubyToken("と",""),new RubyToken("家","うち")),data.examples().getFirst().tokens());
        BunproVocabService.validateData(data);
        assertThrows(IllegalArgumentException.class,()->parser.data(json.readTree("{\"examples\":[{\"sentence\":\"家\"}]}")));
    }
    @Test void malformedCaptureReportsInventoryErrorsAndCannotPartiallyImport() throws Exception {
        var input=capture();
        var broken=(tools.jackson.databind.node.ObjectNode)input;
        ((tools.jackson.databind.node.ObjectNode)broken.path("counts")).put("examples",11204);
        var preview=vocab.preview(broken); assertFalse(preview.errors().isEmpty());
        var before=backups.exportBackup().learning();
        assertThrows(ResponseStatusException.class,()->vocab.importCapture(broken));
        assertEquals(before,backups.exportBackup().learning());
    }
    @Test void persistedFsrsAndSqlDatesMatchEvenWhenClockHasNanoseconds() {
        var id=word("私").id(); var service=at(now.plusNanos(123456789));
        service.learn(id); assertDue(id,now.plusMillis(123));
        var result=service.review(id,new VocabReviewRequest("precise-clock","AGAIN","JP_TO_VI",0));
        assertEquals(now.plusMillis(123).plus(Duration.ofMinutes(10)),result.dueAt()); assertDue(id,result.dueAt());
    }
}
