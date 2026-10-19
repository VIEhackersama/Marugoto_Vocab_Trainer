package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:./target/bunpro-n4-test.db", "app.pdf-dir=./target/bunpro-n4-test-pdfs"})
@Transactional
class BunproN4IntegrationTest {
    @Autowired BunproService catalog;
    @Autowired BunproVocabService vocab;
    @Autowired BunproGrammarService grammar;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired BackupService backups;

    @Test void bundledN4IsCompleteAndSourceOnlyReimportPreservesPersonalContentAndProgress() throws Exception {
        assertEquals(1100,vocab.entries("N5").size());
        assertEquals(132,grammar.entries("N5").size());
        assertEquals(1095,vocab.entries("N4").size());
        assertEquals(185,grammar.entries("N4").size());
        assertEquals(8800,vocab.entries("N4").stream().mapToInt(VocabCatalogEntry::exampleCount).sum());
        var first=grammar.entries("N4").getFirst();
        assertNull(first.content().grammarSource()); // List response stays small.
        var detail=grammar.detail(first.id()); var c=detail.content();
        assertFalse(c.grammarSource().examples().isEmpty());
        assertFalse(c.grammarSource().explanationEn().isBlank());
        assertEquals("DRAFT",c.status());
        assertThrows(ResponseStatusException.class,()->grammar.learn(first.id()));
        assertThrows(ResponseStatusException.class,()->vocab.learn(vocab.entries("N4").getFirst().id()));
        for(var entry:grammar.entries("N4")) for(var ex:grammar.detail(entry.id()).content().grammarSource().examples()) {
            assertFalse(ex.translationEn().isBlank());
            assertEquals(ex.sentence(),ex.tokens().stream().map(RubyToken::text).reduce("",String::concat));
        }
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_grammar_cards",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_vocab_cards",Integer.class));
        var edited=new CatalogContent(c.title(),c.reading(),c.romaji(),c.meaningEn(),"hoặc đại loại như vậy","VERIFIED",c.structure(),"Nội dung cá nhân đã kiểm tra.",null,List.of(),null,c.grammarSource());
        grammar.edit(first.id(),edited); grammar.learn(first.id());
        var before=backups.exportBackup();
        try(var stream=new ClassPathResource("bunpro/n4.json").getInputStream()) { catalog.importSnapshot(json.readValue(stream,CatalogSnapshot.class)); }
        try(var stream=new ClassPathResource("bunpro/n4-vocab-capture.json").getInputStream()) {
            var capture=json.readTree(stream); assertTrue(vocab.preview(capture).errors().isEmpty());
            assertEquals(1095,vocab.preview(capture).matched()); vocab.importCapture(capture);
        }
        assertEquals(edited,grammar.detail(first.id()).content());
        assertEquals(before.learning(),backups.exportBackup().learning());
        var roundTrip=json.readValue(json.writeValueAsString(before),BackupDataDto.class);
        backups.importBackup(roundTrip);
        assertEquals(edited,grammar.detail(first.id()).content());
    }

    @Test void n4CaptureCannotBeMislabelledAsN5OrSubstituteOtherUrls() throws Exception {
        String original;
        try(var stream=new ClassPathResource("bunpro/n4-vocab-capture.json").getInputStream()) { original=new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8); }
        assertFalse(vocab.preview(json.readTree(original.replace("N4_VOCAB_ALL","N5_VOCAB_ALL"))).errors().isEmpty());
        var first=vocab.entries("N4").getFirst().sourceUrl();
        assertFalse(vocab.preview(json.readTree(original.replace(first,"https://bunpro.jp/vocabs/not-in-n4"))).errors().isEmpty());
    }
}
