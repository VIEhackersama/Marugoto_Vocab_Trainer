package vn.marugoto.trainer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:./target/bunpro-test.db", "app.pdf-dir=./target/bunpro-test-pdfs"})
@Transactional
class BunproIntegrationTest {
    @Autowired BunproService bunpro;
    @Autowired DictionaryController dictionary;
    @Autowired DeckService decks;
    @Autowired StudyService study;
    @Autowired ReviewService reviews;
    @Autowired BackupService backups;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired DatabaseMigrationRunner migrations;
    @BeforeEach void catalog() { jdbc.update("DELETE FROM bunpro_entries"); }
    CatalogContent vocab(String title,String reading,String meaning,String status) {
        return new CatalogContent(title,reading,"","house",meaning,status,"","","noun",List.of());
    }
    CatalogItem item(String id,String kind,CatalogContent c) {
        return new CatalogItem(id,kind,"N5",1,1,"https://bunpro.jp/"+(kind.equals("VOCAB")?"vocabs/":"grammar_points/")+id+"?deck_id=5",c);
    }
    CatalogSnapshot snapshot(CatalogItem... items) {
        return new CatalogSnapshot(1,"test-1","Bunpro","2026-10-10",(int)List.of(items).stream().filter(i->i.kind().equals("VOCAB")).count(),
                (int)List.of(items).stream().filter(i->i.kind().equals("GRAMMAR")).count(),List.of(items));
    }
    CatalogContent grammar() {
        var first=new GrammarSentence("one","学生{{blank}}。",List.of("です"),"学生です。","がくせいです。","Là học sinh.","です là cách kết thúc lịch sự.","VERIFIED");
        var second=new GrammarSentence("two","先生{{blank}}。",List.of("です"),"先生です。","せんせいです。","Là giáo viên.","です đứng sau danh từ.","VERIFIED");
        return new CatalogContent("です","","","to be","là","VERIFIED","Danh từ + です","Cách nói lịch sự.","noun",List.of(first,second));
    }
    int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }

    @Test void browseAndReimportCreateNoCardsAndKeepEdits() {
        int cards=count("study_cards");
        var snapshot=snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED")),item("desu","GRAMMAR",grammar()));
        bunpro.importSnapshot(snapshot); bunpro.importSnapshot(snapshot);
        assertEquals(1,bunpro.entries("VOCAB","N5").size()); assertEquals(1,bunpro.entries("GRAMMAR","N5").size());
        assertEquals(cards,count("study_cards")); assertEquals(0,count("grammar_cards"));
        bunpro.edit("house",vocab("家","いえ","nhà; nơi ở","VERIFIED")); bunpro.importSnapshot(snapshot);
        assertEquals("nhà; nơi ở",bunpro.entries("VOCAB","N5").getFirst().content().meaningVi());
        assertEquals("https://bunpro.jp/vocabs/house",bunpro.entries("VOCAB","N5").getFirst().sourceUrl());
    }

    @Test void exactMatchSharesProgressAndDictionaryContainsAllSourcesWithoutMutation() {
        var existing=decks.addCustomCard(new CardInput("家（いえ）","ie","nhà"));
        reviews.review(new ReviewRequest(existing.id(),"GOOD","FLASHCARD"));
        var before=jdbc.queryForList("SELECT * FROM study_cards ORDER BY id");
        bunpro.importSnapshot(snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED"))));
        var learned=bunpro.learnVocab("house",new CatalogLearnRequest(null,false));
        assertEquals("LEARNING",learned.status()); assertEquals(before,jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"));
        assertEquals(learned,bunpro.learnVocab("house",new CatalogLearnRequest(null,false)));
        var dict=dictionary.entries().cards().stream().filter(e->e.vocabularyId().equals(learned.vocabularyId())).toList();
        assertEquals(1,dict.size()); assertEquals(2,dict.getFirst().sources().size());
        assertEquals(1,study.cards("bunpro_n5","all",false,"JP_TO_VI",false).cards().size());
        assertEquals(before,jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"));
    }

    @Test void sameKanjiDifferentReadingRequiresDecisionAndCreatesSeparateWord() {
        decks.addCustomCard(new CardInput("家（いえ）","ie","nhà"));
        bunpro.importSnapshot(snapshot(item("uchi","VOCAB",vocab("家","うち","nhà mình","VERIFIED"))));
        assertEquals("CONFLICT",bunpro.learnVocab("uchi",new CatalogLearnRequest(null,false)).status());
        var learned=bunpro.learnVocab("uchi",new CatalogLearnRequest(null,true));
        assertEquals("うち",jdbc.queryForObject("SELECT reading FROM vocabularies WHERE id=?",String.class,learned.vocabularyId()));
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM vocabularies WHERE spelling LIKE '家%';",Integer.class));
    }

    @Test void incompleteItemsAreBlockedAndLessonReturnsConflicts() {
        decks.addCustomCard(new CardInput("家（いえ）","ie","ngôi nhà"));
        bunpro.importSnapshot(snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED")),item("missing","VOCAB",vocab("本","ほん","","MISSING"))));
        assertThrows(ResponseStatusException.class,()->bunpro.learnVocab("missing",new CatalogLearnRequest(null,true)));
        var result=bunpro.learnLesson("N5",1);
        assertEquals(0,result.learned()); assertEquals(1,result.blocked()); assertEquals(1,result.conflicts().size());
        assertEquals(0,count("bunpro_vocab_links"));
    }

    @Test void grammarReviewOnlyUpdatesOneSentenceAndReimportDoesNotEnrollNewSentences() {
        bunpro.importSnapshot(snapshot(item("desu","GRAMMAR",grammar())));
        int vocabCards=count("study_cards"); assertEquals(2,bunpro.learnGrammar("desu")); assertEquals(0,bunpro.learnGrammar("desu"));
        var cards=bunpro.grammarCards("N5",false); var untouched=jdbc.queryForMap("SELECT * FROM grammar_cards WHERE id=?",cards.get(1).id());
        bunpro.reviewGrammar(cards.getFirst().id(),new GrammarReviewRequest("GOOD","です"));
        assertEquals(untouched,jdbc.queryForMap("SELECT * FROM grammar_cards WHERE id=?",cards.get(1).id()));
        assertEquals(vocabCards,count("study_cards")); assertEquals(1,count("grammar_review_logs"));
        var original=grammar(); var next=new java.util.ArrayList<>(original.sentences());
        next.add(new GrammarSentence("three","猫{{blank}}。",List.of("です"),"猫です。","ねこです。","Là mèo.","Kết thúc câu lịch sự.","VERIFIED"));
        bunpro.importSnapshot(snapshot(item("desu","GRAMMAR",new CatalogContent(original.title(),"","",original.meaningEn(),original.meaningVi(),"VERIFIED",original.structure(),original.explanationVi(),"noun",next))));
        assertEquals(2,count("grammar_cards"));
    }

    @Test void backupRoundTripKeepsLinksContentSchedulesAndOldJsonIsAccepted() {
        bunpro.importSnapshot(snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED")),item("desu","GRAMMAR",grammar())));
        bunpro.learnVocab("house",new CatalogLearnRequest(null,true)); bunpro.learnGrammar("desu");
        bunpro.reviewGrammar(bunpro.grammarCards("N5",false).getFirst().id(),new GrammarReviewRequest("EASY","です"));
        var before=backups.exportBackup();
        var serialized=json.readValue(json.writeValueAsString(before),BackupDataDto.class);
        backups.importBackup(serialized); backups.importBackup(serialized);
        assertEquals(before.learning(),backups.exportBackup().learning());
        assertEquals(before.studyCards(),backups.exportBackup().studyCards());
        var old=json.readValue("{\"version\":1,\"exportedAt\":0,\"decks\":[],\"vocabularies\":[],\"studyCards\":[],\"reviewLogs\":[]}",BackupDataDto.class);
        backups.importBackup(old); assertEquals(before.learning(),backups.exportBackup().learning());
    }

    @Test void dictionaryReadDoesNotBackfillCards() {
        jdbc.update("INSERT INTO vocabularies(id,spelling,reading,romaji,meanings_vi,created_at) VALUES('untrained','猫','ねこ','','mèo',0)");
        int before=count("study_cards");
        assertTrue(dictionary.entries().cards().stream().anyMatch(e->e.vocabularyId().equals("untrained") && e.dueAt()==null));
        assertEquals(before,count("study_cards"));
    }

    @Test void bundledSnapshotImportsIdempotentlyWithoutEnrollingAnything() throws Exception {
        var resource=new org.springframework.core.io.ClassPathResource("bunpro/n5.json");
        CatalogSnapshot snapshot;
        try(var stream=resource.getInputStream()) { snapshot=json.readValue(stream,CatalogSnapshot.class); }
        int vocabCards=count("study_cards");
        var result=bunpro.importSnapshot(snapshot);
        assertEquals(1100,result.vocab()); assertEquals(132,result.grammar());
        assertEquals(0,result.missingTranslations()); assertEquals(0,result.missingExercises());
        var before=bunpro.exportBackup();
        bunpro.importSnapshot(snapshot);
        assertEquals(before,bunpro.exportBackup());
        assertEquals(vocabCards,count("study_cards")); assertEquals(0,count("grammar_cards"));
    }

    @Test void sourceRefreshAndPersonalEditCannotRemoveAnEnrolledSentence() {
        bunpro.importSnapshot(snapshot(item("desu","GRAMMAR",grammar()))); bunpro.learnGrammar("desu");
        var original=grammar();
        var trimmed=new CatalogContent(original.title(),"","",original.meaningEn(),original.meaningVi(),"VERIFIED",original.structure(),original.explanationVi(),"noun",List.of(original.sentences().getFirst()));
        assertThrows(ResponseStatusException.class,()->bunpro.importSnapshot(snapshot(item("desu","GRAMMAR",trimmed))));
        assertThrows(ResponseStatusException.class,()->bunpro.edit("desu",trimmed));
        assertEquals(2,bunpro.grammarCards("N5",false).size());
    }

    @Test void sameSpellingAndReadingWithDifferentMeaningRequiresExplicitLinkAndPreservesHistory() {
        var existing=decks.addCustomCard(new CardInput("家（いえ）","ie","ngôi nhà"));
        reviews.review(new ReviewRequest(existing.id(),"HARD","FLASHCARD"));
        var before=jdbc.queryForList("SELECT * FROM study_cards ORDER BY id");
        bunpro.importSnapshot(snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED"))));
        var result=bunpro.learnVocab("house",new CatalogLearnRequest(null,false));
        assertEquals("CONFLICT",result.status());
        bunpro.learnVocab("house",new CatalogLearnRequest(result.candidates().getFirst().id(),false));
        assertEquals(before,jdbc.queryForList("SELECT * FROM study_cards ORDER BY id"));
        assertEquals(1,count("bunpro_vocab_links"));
    }

    @Test void httpLearnAcceptsOptionalFlagAndEditReturnsNoContent() throws Exception {
        bunpro.importSnapshot(snapshot(item("house","VOCAB",vocab("家","いえ","nhà","VERIFIED"))));
        assertNull(json.readValue("{}",CatalogLearnRequest.class).createNew());
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new BunproController(bunpro))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/bunpro/vocab/house/learn")
                .contentType("application/json").content("{}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        assertEquals(1,count("bunpro_vocab_links"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/bunpro/entries/house")
                .contentType("application/json").content(json.writeValueAsString(vocab("家","いえ","nhà; nơi ở","VERIFIED"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());
        assertEquals("nhà; nơi ở",bunpro.entries("VOCAB","N5").getFirst().content().meaningVi());
    }

    @Test void migrationV4DoesNotRewriteLegacyVocabularyContent() {
        jdbc.update("INSERT INTO vocabularies(id,spelling,reading,romaji,meanings_vi,created_at) VALUES('legacy-blank-reading','家（いえ）','','ie','nhà',0)");
        var before=jdbc.queryForList("SELECT * FROM vocabularies ORDER BY id");
        for(String table:List.of("grammar_review_logs","grammar_cards","bunpro_vocab_links","bunpro_entries")) jdbc.execute("DROP TABLE "+table);
        jdbc.update("DELETE FROM schema_migrations WHERE version=4");
        migrations.afterSingletonsInstantiated();
        assertEquals(before,jdbc.queryForList("SELECT * FROM vocabularies ORDER BY id"));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version=4",Integer.class));
    }
}
