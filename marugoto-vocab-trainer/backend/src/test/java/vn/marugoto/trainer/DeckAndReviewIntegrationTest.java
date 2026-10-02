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
}
