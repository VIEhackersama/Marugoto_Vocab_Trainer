package vn.marugoto.trainer;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:./target/bunpro-exact-test.db", "app.data-dir=./target/bunpro-exact-data", "app.pdf-dir=./target/bunpro-exact-pdfs"})
@AutoConfigureMockMvc
@Transactional
class BunproExactProgressIntegrationTest {
    @Autowired BunproProgressImportService imports;
    @Autowired BunproVocabService vocab;
    @Autowired BunproGrammarService grammar;
    @Autowired BunproService catalog;
    @Autowired BackupService backups;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired MockMvc mvc;
    final Instant now=Instant.parse("2026-10-20T00:00:00Z");
    @BeforeEach void clean() {
        jdbc.update("DELETE FROM bunpro_progress_imports");
        jdbc.update("DELETE FROM bunpro_vocab_review_logs"); jdbc.update("DELETE FROM bunpro_grammar_review_logs");
        jdbc.update("DELETE FROM bunpro_vocab_cards"); jdbc.update("DELETE FROM bunpro_grammar_cards");
    }
    VocabCatalogEntry word(int i) { return vocab.entries("N5").get(i); }
    VocabCatalogEntry pattern() { return grammar.entries("N5").stream().filter(e->"VERIFIED".equals(e.content().status())).findFirst().orElseThrow(); }
    ProgressRow row(VocabCatalogEntry e,int stage,Instant due) { return new ProgressRow(e.kind(),e.id(),e.sourceUrl(),stage,due,e.content().title(),e.content().reading()); }
    ProgressPreview preview(ProgressRow... rows) { return imports.preview(new ProgressInput(Arrays.asList(rows))); }
    ProgressApplied apply(ProgressPreview p) { return imports.apply(new ProgressApply(p.previewId(),p.rows().stream().filter(ProgressPreviewRow::valid).map(ProgressPreviewRow::index).toList())); }
    @Test void mixedImportIsReadOnlyUntilApplyAndPreservesHistoriesAndBackup() throws Exception {
        var w=word(0); var g=pattern();
        var legacy=jdbc.queryForList("SELECT * FROM study_cards");
        var p=preview(row(w,5,now),row(g,12,now));
        assertEquals(List.of("NEW","NEW"),p.rows().stream().map(ProgressPreviewRow::status).toList());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM bunpro_vocab_cards",Integer.class));
        var applied=apply(p);
        assertEquals(5,vocab.detail(w.id()).stage()); assertEquals(now,vocab.detail(w.id()).dueAt());
        assertEquals(12,grammar.detail(g.id()).stage()); assertNull(grammar.detail(g.id()).dueAt());
        assertTrue(grammar.queue("N5").isEmpty()); assertEquals(0,vocab.detail(w.id()).reviewCount());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM bunpro_vocab_review_logs",Integer.class));
        assertEquals(legacy,jdbc.queryForList("SELECT * FROM study_cards"));
        assertTrue(Files.size(Path.of(applied.backupPath()))>0);
        var pre=json.readValue(Files.readString(Path.of(applied.backupPath())),BackupDataDto.class);
        assertTrue(pre.learning().vocabCards().isEmpty());
        assertEquals(applied,apply(p)); assertEquals(0,vocab.detail(w.id()).revision());
        assertThrows(ResponseStatusException.class,()->imports.apply(new ProgressApply(p.previewId(),List.of(0))));
        var backup=json.readValue(json.writeValueAsString(backups.exportBackup()),BackupDataDto.class);
        assertEquals(6,backup.version());
        jdbc.update("DELETE FROM bunpro_vocab_cards"); jdbc.update("DELETE FROM bunpro_grammar_cards"); jdbc.update("DELETE FROM bunpro_progress_imports");
        catalog.restore(backup.learning());
        assertEquals(5,vocab.detail(w.id()).stage()); assertEquals(12,grammar.detail(g.id()).stage()); assertEquals(applied,apply(p));
    }
    @Test void exactStagesUseFixedIntervalsAndRecordEachTransition() {
        var w=word(0);
        for(int stage=0;stage<=11;stage++) {
            var p=preview(row(w,stage,now)); apply(p);
            var before=vocab.detail(w.id());
            var progress=new BunproProgress(jdbc,json,Clock.fixed(now,ZoneOffset.UTC),"VOCAB",id->{});
            var result=progress.review(w.id(),new VocabReviewRequest("pass-"+stage,"GOOD","JP_TO_VI",before.revision()));
            assertEquals(stage+1,result.stage()); assertEquals(BunproStages.tier(stage+1),result.tier());
            if(stage<11) assertEquals(now.plusSeconds(imports.intervals("VOCAB").seconds().get(stage)),result.dueAt());
            else assertNull(result.dueAt());
            assertEquals(stage,jdbc.queryForObject("SELECT stage_before FROM bunpro_vocab_review_logs WHERE id=?",Integer.class,"pass-"+stage));
        }
        assertThrows(ResponseStatusException.class,()->new BunproProgress(jdbc,json,Clock.fixed(BunproStages.MASTER_DUE,ZoneOffset.UTC),"VOCAB",id->{}).review(w.id(),new VocabReviewRequest("master","GOOD","JP_TO_VI",vocab.detail(w.id()).revision())));
        apply(preview(row(w,1,now)));
        var progress=new BunproProgress(jdbc,json,Clock.fixed(now,ZoneOffset.UTC),"VOCAB",id->{});
        var hard=progress.review(w.id(),new VocabReviewRequest("hard","HARD","JP_TO_VI",vocab.detail(w.id()).revision()));
        assertEquals(1,hard.stage()); assertEquals(now.plusSeconds(14400),hard.dueAt());
        apply(preview(row(w,1,now)));
        var again=progress.review(w.id(),new VocabReviewRequest("again","AGAIN","JP_TO_VI",vocab.detail(w.id()).revision()));
        assertEquals(0,again.stage()); assertEquals(now.plusSeconds(600),again.dueAt());
    }
    @Test void beginnerZeroPreservesWebDueAndRoundTripsBackupForBothKinds() {
        var w=word(0); var g=pattern();
        apply(preview(row(w,0,now),row(g,0,now)));
        assertEquals(0,vocab.detail(w.id()).stage()); assertEquals(0,grammar.detail(g.id()).stage());
        assertEquals(now,grammar.detail(g.id()).dueAt());
        var snapshot=backups.exportBackup();
        imports.assign(new StageAssignment("GRAMMAR",List.of(g.id()),4));
        catalog.restore(snapshot.learning()); assertEquals(0,grammar.detail(g.id()).stage());
        var progress=new BunproProgress(jdbc,json,Clock.fixed(now,ZoneOffset.UTC),"GRAMMAR",id->{});
        var hard=progress.review(g.id(),new VocabReviewRequest("zero-hard","HARD","JP_TO_VI",grammar.detail(g.id()).revision()));
        assertEquals(0,hard.stage()); assertEquals(now.plusSeconds(600),hard.dueAt());
        apply(preview(row(g,0,now)));
        var again=progress.review(g.id(),new VocabReviewRequest("zero-again","AGAIN","JP_TO_VI",grammar.detail(g.id()).revision()));
        assertEquals(0,again.stage()); assertEquals(now.plusSeconds(600),again.dueAt());
    }
    @Test void migrationV8PreservesBothHistoriesWithForeignKeysEnabled() throws Exception {
        try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite::memory:")) {
            try(var statement=connection.createStatement()) { statement.execute("PRAGMA foreign_keys=ON"); }
            String[] names={"create_decks_cards_and_reviews","separate_vocab_and_study_cards","unify_study_card_schedules","bunpro_catalog_and_grammar","bunpro_vocab_content_and_schedule","bunpro_grammar_progress","bunpro_exact_stages"};
            for(int version=1;version<=7;version++) org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.ClassPathResource("db/migration/V"+version+"__"+names[version-1]+".sql"));
            try(var statement=connection.createStatement()) {
                for(String kind:List.of("vocab","grammar")) {
                    statement.execute("INSERT INTO bunpro_entries VALUES('"+kind+"','"+kind.toUpperCase()+"','N5',1,1,'https://bunpro.jp/"+kind+"','{}',0,'test')");
                    statement.execute("INSERT INTO bunpro_"+kind+"_cards VALUES('"+kind+"','ADEPT','memory',123456,8,2,100,7,100,5)");
                    statement.execute("INSERT INTO bunpro_"+kind+"_review_logs VALUES('log','"+kind+"','GOOD','JP_TO_VI',100,123456,'BEGINNER','ADEPT',3,4)");
                }
            }
            connection.setAutoCommit(false);
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.ClassPathResource("db/migration/V8__bunpro_beginner_zero.sql"));
            connection.commit();
            try(var statement=connection.createStatement()) {
                for(String kind:List.of("vocab","grammar")) {
                    try(var rs=statement.executeQuery("SELECT * FROM bunpro_"+kind+"_cards")) {
                        assertTrue(rs.next()); assertEquals(5,rs.getInt("stage")); assertEquals(8,rs.getInt("review_count"));
                        assertEquals(123456,rs.getLong("due_at")); assertEquals("memory",rs.getString("fsrs_card_json"));
                    }
                    try(var rs=statement.executeQuery("SELECT * FROM bunpro_"+kind+"_review_logs")) {
                        assertTrue(rs.next()); assertEquals(3,rs.getInt("stage_before")); assertEquals(4,rs.getInt("stage_after"));
                    }
                    statement.execute("UPDATE bunpro_"+kind+"_cards SET stage=0");
                    assertThrows(java.sql.SQLException.class,()->statement.execute("UPDATE bunpro_"+kind+"_cards SET stage=-1"));
                }
                try(var rs=statement.executeQuery("PRAGMA foreign_key_check")) { assertFalse(rs.next()); }
            }
        }
    }
    @Test void invalidAndDuplicateMatchesNeverGetSilentlyAssigned() {
        var w=word(0); var other=word(1);
        var byUrl=new ProgressRow("VOCAB",null,w.sourceUrl()+"?deck_id=5#test",3,null,"","");
        assertEquals(w.id(),preview(byUrl).rows().getFirst().entryId());
        assertTrue(preview(row(w,2,null),byUrl).rows().stream().noneMatch(ProgressPreviewRow::valid));
        assertFalse(preview(new ProgressRow("VOCAB",w.id(),other.sourceUrl(),2,null,"","")).rows().getFirst().valid());
        assertFalse(preview(new ProgressRow("VOCAB",null,null,2,null,"","はし")).rows().getFirst().valid());
        for(Integer stage:Arrays.asList(-1,13,null)) assertFalse(preview(new ProgressRow("VOCAB",w.id(),null,stage,null,"","")).rows().getFirst().valid());
        assertFalse(preview(new ProgressRow(null,w.id(),null,1,null,"","")).rows().getFirst().valid());
        assertFalse(preview(new ProgressRow("VOCAB",null,"https://example.com/vocabs/test",1,null,"","")).rows().getFirst().valid());
    }
    @Test void missingDuePreservesLocalOrMarksCalculatedAndWebWins() {
        var w=word(0); var other=word(1);
        apply(preview(row(w,2,now)));
        var p=preview(row(w,5,null),row(other,3,null));
        assertEquals("LOCAL",p.rows().get(0).dueSource()); assertEquals(now,p.rows().get(0).dueAt());
        assertEquals("CALCULATED",p.rows().get(1).dueSource());
        assertTrue(p.rows().get(1).dueAt().isAfter(Instant.now().plusSeconds(86000)));
        apply(p); assertEquals(5,vocab.detail(w.id()).stage());
        var same=preview(row(w,5,now)); assertEquals("UNCHANGED",same.rows().getFirst().status());
        long revision=vocab.detail(w.id()).revision(); apply(same); assertEquals(revision,vocab.detail(w.id()).revision());
    }
    @Test void restoringThePreImportSnapshotRemovesNewSchedulesAndImportJournal() {
        var w=word(0); var g=pattern();
        var before=backups.exportBackup();
        apply(preview(row(w,5,now),row(g,12,null)));
        catalog.restore(before.learning());
        assertNull(vocab.detail(w.id()).tier()); assertNull(grammar.detail(g.id()).tier());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM bunpro_progress_imports",Integer.class));
    }
    @Test void stalePreviewRejectsWholeSelectionAndBackupFailureWritesNothing() throws Exception {
        var w=word(0); var other=word(1);
        var p=preview(row(w,2,now),row(other,4,now));
        imports.assign(new StageAssignment("VOCAB",List.of(other.id()),7));
        assertThrows(ResponseStatusException.class,()->apply(p)); assertNull(vocab.detail(w.id()).stage());
        Path file=Files.createTempFile(Path.of("target"),"backup-blocker-",".file");
        var broken=new BunproProgressImportService(jdbc,json,backups,file.toString());
        var q=broken.preview(new ProgressInput(List.of(row(w,2,now))));
        assertThrows(ResponseStatusException.class,()->broken.apply(new ProgressApply(q.previewId(),List.of(0))));
        assertNull(vocab.detail(w.id()).stage());
    }
    @Test void legacyStageIsNotGuessedAndSettingsAreIndependent() {
        var w=word(0); vocab.assign(new VocabTierRequest(List.of(w.id()),"ADEPT"));
        var old=jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",w.id());
        vocab.learn(w.id()); assertEquals(old,jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",w.id())); assertNull(vocab.detail(w.id()).stage());
        var settings=imports.intervals("GRAMMAR"); var seconds=new ArrayList<>(settings.seconds()); seconds.set(0,7200L);
        imports.intervals("VOCAB",new StageIntervals(seconds)); assertEquals(settings,imports.intervals("GRAMMAR"));
        assertEquals(old,jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",w.id()));
        assertThrows(ResponseStatusException.class,()->imports.assign(new StageAssignment("VOCAB",List.of(w.id(),"bad-id"),5)));
        assertEquals(old,jdbc.queryForMap("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?",w.id()));
    }
    @Test void migrationV7PreservesExistingCardsAndHistoryWithoutGuessingStage() throws Exception {
        try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite::memory:")) {
            for(int version=1;version<=6;version++) {
                String[] names={"create_decks_cards_and_reviews","separate_vocab_and_study_cards","unify_study_card_schedules","bunpro_catalog_and_grammar","bunpro_vocab_content_and_schedule","bunpro_grammar_progress"};
                org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.ClassPathResource("db/migration/V"+version+"__"+names[version-1]+".sql"));
            }
            try(var statement=connection.createStatement()) {
                statement.execute("INSERT INTO bunpro_vocab_cards(entry_id,tier,fsrs_card_json,due_at,review_count,wrong_count,revision,created_at) VALUES('legacy','ADEPT','unchanged-memory',123456,8,2,7,100)");
                statement.execute("INSERT INTO bunpro_vocab_review_logs(id,entry_id,rating,direction,reviewed_at,due_at_after,tier_before,tier_after) VALUES('old-log','legacy','GOOD','JP_TO_VI',100,123456,'BEGINNER','ADEPT')");
            }
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.ClassPathResource("db/migration/V7__bunpro_exact_stages.sql"));
            try(var statement=connection.createStatement(); var rs=statement.executeQuery("SELECT * FROM bunpro_vocab_cards WHERE entry_id='legacy'")) {
                assertTrue(rs.next()); assertEquals("ADEPT",rs.getString("tier")); assertNull(rs.getObject("stage"));
                assertEquals("unchanged-memory",rs.getString("fsrs_card_json")); assertEquals(123456,rs.getLong("due_at"));
                assertEquals(8,rs.getInt("review_count")); assertEquals(2,rs.getInt("wrong_count")); assertEquals(7,rs.getInt("revision"));
            }
            try(var statement=connection.createStatement(); var rs=statement.executeQuery("SELECT * FROM bunpro_vocab_review_logs WHERE id='old-log'")) {
                assertTrue(rs.next()); assertEquals("ADEPT",rs.getString("tier_after")); assertNull(rs.getObject("stage_after"));
            }
        }
    }
    @Test void httpContractPreservesOffsetAndRejectsStaleRequest() throws Exception {
        String body="{\"rows\":[{\"kind\":\"VOCAB\",\"entryId\":\""+word(0).id()+"\",\"stage\":3,\"dueAt\":\"2026-10-20T09:00:00+07:00\"}]}";
        var response=mvc.perform(post("/api/bunpro/progress/preview").contentType("application/json").content(body)).andExpect(status().isOk()).andReturn();
        var p=json.readValue(response.getResponse().getContentAsString(),ProgressPreview.class);
        assertEquals(Instant.parse("2026-10-20T02:00:00Z"),p.rows().getFirst().dueAt());
        mvc.perform(post("/api/bunpro/progress/apply").contentType("application/json").content(json.writeValueAsString(new ProgressApply(p.previewId(),List.of(0))))).andExpect(status().isOk());
        mvc.perform(get("/api/bunpro/progress/export")).andExpect(status().isOk());
        mvc.perform(put("/api/bunpro/progress/stages").contentType("application/json").content("{\"kind\":\"VOCAB\",\"entryIds\":[\""+word(0).id()+"\"],\"stage\":4}")).andExpect(status().isNoContent());
        mvc.perform(put("/api/bunpro/progress/stages").contentType("application/json").content("{\"kind\":\"VOCAB\",\"entryIds\":[\""+word(0).id()+"\"],\"stage\":13}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/bunpro/progress/preview").contentType("application/json").content(body.replace("\"stage\":3","\"stage\":3.9"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/bunpro/progress/preview").contentType("application/json").content(body.replace("2026-10-20T09:00:00+07:00","2026-10-20T09:00:00"))).andExpect(status().isBadRequest());
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void failureDuringSecondWriteRollsBackTheFirstWrite() {
        var w=word(0); var g=pattern(); var p=preview(row(w,2,now),row(g,4,now));
        jdbc.execute("CREATE TRIGGER fail_progress_insert BEFORE INSERT ON bunpro_grammar_cards BEGIN SELECT RAISE(ABORT,'test rollback'); END");
        try { assertThrows(RuntimeException.class,()->apply(p)); assertNull(vocab.detail(w.id()).stage()); assertNull(grammar.detail(g.id()).stage()); }
        finally { jdbc.execute("DROP TRIGGER fail_progress_insert"); }
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM bunpro_progress_imports",Integer.class));
    }
}
