package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:sqlite:./target/lifecycle-availability-test.db",
        "app.pdf-dir=./target/lifecycle-availability-test-pdfs"
})
@DirtiesContext
class LifecycleAvailabilityTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void dictionarySaveStillWorksAfterMissingHeartbeats() throws Exception {
        assertEquals(200, request("POST", "/api/lifecycle/heartbeat?tabId=background-tab", "").statusCode());
        // The former watchdog terminated the JVM in roughly 9-11 seconds.
        Thread.sleep(12000);
        var state = request("GET", "/api/lifecycle/status", null);
        assertEquals(200, state.statusCode());
        assertEquals(1, mapper.readTree(state.body()).get("activeTabs").asInt());

        var created = request("POST", "/api/decks/custom-card",
                "{\"jp\":\"寿命試験（じゅみょうしけん）\",\"romaji\":\"jumyou shiken\",\"vi\":\"kiểm tra duy trì\"}");
        assertEquals(200, created.statusCode(), created.body());
        String id = mapper.readTree(created.body()).get("id").asText();
        try {
            for (int i = 0; i < 10; i++) {
                var saved = request("PUT", "/api/decks/cards/" + id,
                        "{\"jp\":\"寿命試験（じゅみょうしけん）\",\"romaji\":\"jumyou shiken\",\"vi\":\"kiểm tra " + i + "\"}");
                assertEquals(200, saved.statusCode(), saved.body());
                assertEquals("kiểm tra " + i, mapper.readTree(saved.body()).get("vi").asText());
                assertEquals(200, request("GET", "/api/study/cards?deckId=all&mode=all&includeCustom=true", null).statusCode());
            }
        } finally {
            assertEquals(204, request("DELETE", "/api/decks/cards/" + id, null).statusCode());
        }
    }

    private HttpResponse<String> request(String method, String path, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
