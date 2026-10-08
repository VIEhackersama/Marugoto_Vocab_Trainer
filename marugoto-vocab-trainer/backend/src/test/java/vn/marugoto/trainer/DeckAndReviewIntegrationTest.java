package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:sqlite:./target/marugoto-test.db",
        "app.pdf-dir=./target/marugoto-test-pdfs"
})
@AutoConfigureMockMvc
class DeckAndReviewIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired DeckService decks;
    @Autowired StudyService study;

    @Test
    void repeatedRowsInOnePdfCreateOnlyOneSourceAndStudyResult() throws Exception {
        var pdf = new MockMultipartFile("file", "repeated.pdf", "application/pdf",
                "%PDF-1.7\nfixture".getBytes(StandardCharsets.US_ASCII));
        var deck = decks.create(pdf, """
                [{"jp":"さんぽ(を) します","romaji":"sanpo (o) shimasu","vi":"đi dạo"},
                 {"jp":"さんぽ(を) します","romaji":"sanpo (o) shimasu","vi":"Đi dạo."}]
                """);
        assertEquals(1, deck.cardCount());
        assertEquals(1, deck.dueCount());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM vocabulary_sources WHERE deck_id=?", Integer.class, deck.id()));
        assertEquals(1, study.cards(deck.id(), "all", false, "JP_TO_VI", false).cards().size());
    }

    @Test
    void legacyDuplicateSourcesDoNotRepeatCardsOrInflateDueCounts() throws Exception {
        var pdf = new MockMultipartFile("file", "legacy.pdf", "application/pdf",
                "%PDF-1.7\nfixture".getBytes(StandardCharsets.US_ASCII));
        var deck = decks.create(pdf, """
                [{"jp":"さんぽ(を) します","romaji":"sanpo (o) shimasu","vi":"đi dạo"}]
                """);
        jdbc.update("""
                INSERT INTO vocabulary_sources(id,vocabulary_id,deck_id,created_at)
                SELECT 'legacy-duplicate', vocabulary_id, deck_id, created_at
                FROM vocabulary_sources WHERE deck_id=?
                """, deck.id());
        for (String type : java.util.List.of("JP_TO_VI", "VI_TO_JP")) {
            for (String mode : java.util.List.of("all", "due")) {
                var result = study.cards(deck.id(), mode, false, type, false);
                assertEquals(1, result.cards().size());
                assertEquals(1, result.dueCount());
                assertEquals(1, study.cards("all", mode, true, type, false).cards().size());
            }
        }
        assertEquals(1, decks.findDeck(deck.id()).dueCount());
        assertEquals(1, decks.list().getFirst().dueCount());
    }

    @Test
    void vocabularySharedByTwoPdfsAppearsOnceAndRetainsBothDeckFilters() throws Exception {
        var pdf = new MockMultipartFile("file", "shared.pdf", "application/pdf",
                "%PDF-1.7\nfixture".getBytes(StandardCharsets.US_ASCII));
        String input = """
                [{"jp":"ねこ","romaji":"neko","vi":"mèo"},
                 {"jp":"橋（はし）","romaji":"hashi","vi":"cây cầu"},
                 {"jp":"箸（はし）","romaji":"hashi","vi":"đôi đũa"}]
                """;
        var first = decks.create(pdf, input);
        var second = decks.create(pdf, input);
        assertEquals(6, jdbc.queryForObject("SELECT COUNT(*) FROM vocabulary_sources", Integer.class));
        for (String type : java.util.List.of("JP_TO_VI", "VI_TO_JP")) {
            assertEquals(3, study.cards("all", "all", true, type, false).cards().size());
            var firstCards = study.cards(first.id(), "all", false, type, false).cards();
            var secondCards = study.cards(second.id(), "all", false, type, false).cards();
            assertEquals(3, firstCards.size());
            assertEquals(3, secondCards.size());
            assertTrue(firstCards.stream().allMatch(c -> c.deckId().equals(first.id())));
            assertTrue(secondCards.stream().allMatch(c -> c.deckId().equals(second.id())));
        }
    }

    @org.junit.jupiter.api.BeforeEach
    void resetDatabase() {
        jdbc.update("DELETE FROM review_logs");
        jdbc.update("DELETE FROM study_cards");
        jdbc.update("DELETE FROM vocabulary_sources");
        jdbc.update("DELETE FROM vocabularies");
        jdbc.update("DELETE FROM decks WHERE id != 'custom'");
    }

    @Test
    void uploadReviewDownloadAndDeleteDeck() throws Exception {
        String cardsJson = """
                [
                  {"jp":"ねこ","romaji":"neko","vi":"con mèo"},
                  {"jp":"いぬ","romaji":"inu","vi":"con chó"},
                  {"jp":"みず","romaji":"mizu","vi":"nước"},
                  {"jp":"やま","romaji":"yama","vi":"núi"},
                  {"jp":"そら","romaji":"sora","vi":"bầu trời"}
                ]
                """;
        MockMultipartFile pdf = new MockMultipartFile("file", "sample.pdf", "application/pdf",
                "%PDF-1.7\nfixture".getBytes(StandardCharsets.US_ASCII));

        String response = mvc.perform(multipart("/api/decks").file(pdf).param("cards", cardsJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode deck = objectMapper.readTree(response);
        String deckId = deck.get("id").asString();
        assertEquals(5, deck.get("cardCount").asInt());
        Path storedPdf = Path.of("./target/marugoto-test-pdfs", deck.get("id").asString() + ".pdf");
        assertTrue(Files.isRegularFile(storedPdf));

        JsonNode cards = objectMapper.readTree(mvc.perform(get("/api/study/cards").param("deckId", deckId).param("mode", "all"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(5, cards.get("cards").size());
        String cardId = cards.get("cards").get(0).get("id").asString();

        String reviewResponse = mvc.perform(post("/api/reviews")
                        .contentType("application/json")
                        .content("{\"cardId\":\"" + cardId + "\",\"rating\":\"AGAIN\",\"source\":\"TEST\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(reviewResponse);
        assertEquals("AGAIN", review.get("rating").asString());
        assertEquals(1, review.get("reviewCount").asInt());
        assertEquals(1, review.get("wrongCount").asInt());

        String correctReviewResponse = mvc.perform(post("/api/reviews")
                        .contentType("application/json")
                        .content("{\"cardId\":\"" + cardId + "\",\"rating\":\"HARD\",\"source\":\"RECALL\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode correctReview = objectMapper.readTree(correctReviewResponse);
        assertEquals("HARD", correctReview.get("rating").asString());
        assertEquals(2, correctReview.get("reviewCount").asInt());

        mvc.perform(get("/api/decks/{deckId}/pdf", deckId))
                .andExpect(status().isOk());
        JsonNode dueCards = objectMapper.readTree(mvc.perform(get("/api/study/cards").param("deckId", deckId).param("mode", "due"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(dueCards.get("cards").size() < 5);

        mvc.perform(delete("/api/decks/{deckId}", deckId)).andExpect(status().isNoContent());
        assertTrue(Files.notExists(storedPdf));
        mvc.perform(get("/api/decks/{deckId}/pdf", deckId)).andExpect(status().isNotFound());
        JsonNode remaining = objectMapper.readTree(mvc.perform(get("/api/decks")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(0, remaining.size());
    }

    @Test
    void customCardsLifecycle() throws Exception {
        String customCardJson = """
                {"jp":"さくら","romaji":"sakura","vi":"hoa anh đào"}
                """;
        String cardResponse = mvc.perform(post("/api/decks/custom-card")
                        .contentType("application/json")
                        .content(customCardJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode cardNode = objectMapper.readTree(cardResponse);
        String cardId = cardNode.get("id").asString();
        assertEquals("さくら", cardNode.get("jp").asString());
        assertEquals("custom", cardNode.get("deckId").asString());

        JsonNode customStudy = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", "custom")
                        .param("mode", "all"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(customStudy.get("cards").size() >= 1);

        String updateCardJson = """
                {"jp":"さくら（桜）","romaji":"","vi":"hoa anh đào Nhật Bản"}
                """;
        String updatedResponse = mvc.perform(put("/api/decks/cards/{cardId}", cardId)
                        .contentType("application/json")
                        .content(updateCardJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode updatedNode = objectMapper.readTree(updatedResponse);
        assertEquals("さくら（桜）", updatedNode.get("jp").asString());
        assertEquals("hoa anh đào Nhật Bản", updatedNode.get("vi").asString());

        String batchUpdateJson = """
                [{"id":"%s","jp":"桜（さくら）","romaji":"sakura","vi":"hoa anh đào"}]
                """.formatted(cardId);
        String batchResponse = mvc.perform(put("/api/decks/cards/batch")
                        .contentType("application/json")
                        .content(batchUpdateJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode batchNode = objectMapper.readTree(batchResponse);
        assertTrue(batchNode.isArray());
        assertEquals(1, batchNode.size());
        assertEquals("桜（さくら）", batchNode.get(0).get("jp").asString());

        mvc.perform(delete("/api/decks/cards/{cardId}", cardId))
                .andExpect(status().isNoContent());
    }

    @Test
    void homophonesAreNotTreatedAsDuplicates() throws Exception {
        // First deck has 橋（はし） - cây cầu
        String deck1Json = """
                [{"jp":"橋（はし）","romaji":"hashi","vi":"cây cầu"}]
                """;
        MockMultipartFile pdf1 = new MockMultipartFile("file", "deck1.pdf", "application/pdf",
                "%PDF-1.7\nfixture1".getBytes(StandardCharsets.US_ASCII));
        String res1 = mvc.perform(multipart("/api/decks").file(pdf1).param("cards", deck1Json))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String deckId1 = objectMapper.readTree(res1).get("id").asString();

        // Second deck has 箸（はし） - đôi đũa (same kana reading はし, different kanji & meaning)
        // With skipDuplicates=true, it MUST NOT be discarded as a duplicate!
        String deck2Json = """
                [
                  {"jp":"橋（はし）","romaji":"hashi","vi":"cây cầu"},
                  {"jp":"箸（はし）","romaji":"hashi","vi":"đôi đũa"}
                ]
                """;
        MockMultipartFile pdf2 = new MockMultipartFile("file", "deck2.pdf", "application/pdf",
                "%PDF-1.7\nfixture2".getBytes(StandardCharsets.US_ASCII));
        String res2 = mvc.perform(multipart("/api/decks").file(pdf2).param("cards", deck2Json).param("skipDuplicates", "true"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode deck2 = objectMapper.readTree(res2);
        String deckId2 = deck2.get("id").asString();

        // deck2 should contain exactly 1 card: 箸（はし） (the genuine duplicate 橋 was skipped, but homophone 箸 was preserved)
        assertEquals(1, deck2.get("cardCount").asInt());

        JsonNode cards = objectMapper.readTree(mvc.perform(get("/api/study/cards").param("deckId", deckId2).param("mode", "all"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, cards.get("cards").size());
        assertEquals("箸（はし）", cards.get("cards").get(0).get("jp").asString());
        assertEquals("đôi đũa", cards.get("cards").get(0).get("vi").asString());

        // Test review with responseMs and cardType
        String cardId = cards.get("cards").get(0).get("id").asString();
        String reviewRes = mvc.perform(post("/api/reviews")
                        .contentType("application/json")
                        .content("{\"cardId\":\"" + cardId + "\",\"rating\":\"GOOD\",\"source\":\"FLASHCARD\",\"responseMs\":1450,\"cardType\":\"JP_TO_VI\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(reviewRes);
        assertEquals("GOOD", review.get("rating").asString());
        assertEquals(1, review.get("reviewCount").asInt());

        mvc.perform(delete("/api/decks/{deckId}", deckId1)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/decks/{deckId}", deckId2)).andExpect(status().isNoContent());
    }

    @Test
    void backupExportImportAndLeechFilter() throws Exception {
        String deckJson = """
                [
                  {"jp":"りんご","romaji":"ringo","vi":"quả táo"},
                  {"jp":"みかん","romaji":"mikan","vi":"quả quýt"}
                ]
                """;
        MockMultipartFile pdf = new MockMultipartFile("file", "fruit.pdf", "application/pdf",
                "%PDF-1.7\nfixtureFruit".getBytes(StandardCharsets.US_ASCII));
        String res = mvc.perform(multipart("/api/decks").file(pdf).param("cards", deckJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String deckId = objectMapper.readTree(res).get("id").asString();

        JsonNode cards = objectMapper.readTree(mvc.perform(get("/api/study/cards").param("deckId", deckId).param("mode", "all"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(2, cards.get("cards").size());
        String ringoCardId = cards.get("cards").get(0).get("id").asString();

        // Initially no leech cards
        JsonNode leechesInitial = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("leechOnly", "true"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(0, leechesInitial.get("cards").size());

        // Review ringo 3 times with AGAIN -> wrongCount = 3 -> leech!
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/reviews")
                            .contentType("application/json")
                            .content("{\"cardId\":\"" + ringoCardId + "\",\"rating\":\"AGAIN\",\"source\":\"TEST\"}"))
                    .andExpect(status().isOk());
        }

        // Query leechOnly=true -> should return ringo
        JsonNode leechesAfter = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("leechOnly", "true"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, leechesAfter.get("cards").size());
        assertEquals(ringoCardId, leechesAfter.get("cards").get(0).get("id").asString());
        assertTrue(leechesAfter.get("cards").get(0).get("isLeech").asBoolean());

        // Test export backup
        String backupJson = mvc.perform(get("/api/backup/export"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode backupData = objectMapper.readTree(backupJson);
        assertTrue(backupData.has("version"));
        assertTrue(backupData.has("exportedAt"));
        assertTrue(backupData.get("decks").size() >= 1);
        assertTrue(backupData.get("studyCards").size() >= 2);
        assertTrue(backupData.get("reviewLogs").size() >= 3);

        // Test import backup
        String importResultJson = mvc.perform(post("/api/backup/import")
                        .contentType("application/json")
                        .content(backupJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode importResult = objectMapper.readTree(importResultJson);
        assertTrue(importResult.get("importedDecks").asInt() >= 1);
        assertTrue(importResult.get("message").asString().contains("thành công"));

        mvc.perform(delete("/api/decks/{deckId}", deckId)).andExpect(status().isNoContent());
    }

    @Test
    void bidirectionalReviewSyncsScheduleAndDueCount() throws Exception {
        String deckJson = """
                [
                  {"jp":"ほん","romaji":"hon","vi":"quyển sách"},
                  {"jp":"くるま","romaji":"kuruma","vi":"xe hơi"}
                ]
                """;
        MockMultipartFile pdf = new MockMultipartFile("file", "sync_test.pdf", "application/pdf",
                "%PDF-1.7\nfixtureSync".getBytes(StandardCharsets.US_ASCII));
        String res = mvc.perform(multipart("/api/decks").file(pdf).param("cards", deckJson))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String deckId = objectMapper.readTree(res).get("id").asString();

        // Initially 2 due cards in both directions
        JsonNode jpInitial = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "JP_TO_VI"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode viInitial = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "VI_TO_JP"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(2, jpInitial.get("dueCount").asInt());
        assertEquals(2, viInitial.get("dueCount").asInt());

        // Review card 1 in JP_TO_VI direction with EASY
        String card1Id = jpInitial.get("cards").get(0).get("id").asString();
        mvc.perform(post("/api/reviews")
                        .contentType("application/json")
                        .content("{\"cardId\":\"" + card1Id + "\",\"rating\":\"EASY\",\"source\":\"FLASHCARD\",\"cardType\":\"JP_TO_VI\"}"))
                .andExpect(status().isOk());

        // Both directions must now have exactly 1 due card!
        JsonNode jpAfterReview1 = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "JP_TO_VI"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode viAfterReview1 = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "VI_TO_JP"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, jpAfterReview1.get("dueCount").asInt());
        assertEquals(1, viAfterReview1.get("dueCount").asInt());

        // Review remaining due card 2 in VI_TO_JP direction with EASY
        String card2ViId = viAfterReview1.get("cards").get(0).get("id").asString();
        mvc.perform(post("/api/reviews")
                        .contentType("application/json")
                        .content("{\"cardId\":\"" + card2ViId + "\",\"rating\":\"EASY\",\"source\":\"TEST\",\"cardType\":\"VI_TO_JP\"}"))
                .andExpect(status().isOk());

        // Both directions must now have exactly 0 due cards!
        JsonNode jpAfterReview2 = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "JP_TO_VI"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode viAfterReview2 = objectMapper.readTree(mvc.perform(get("/api/study/cards")
                        .param("deckId", deckId)
                        .param("cardType", "VI_TO_JP"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(0, jpAfterReview2.get("dueCount").asInt());
        assertEquals(0, viAfterReview2.get("dueCount").asInt());

        mvc.perform(delete("/api/decks/{deckId}", deckId)).andExpect(status().isNoContent());
    }
}

