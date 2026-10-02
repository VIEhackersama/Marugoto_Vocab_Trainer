package vn.marugoto.trainer;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api/decks")
class DeckController {
    private final DeckService decks;

    DeckController(DeckService decks) {
        this.decks = decks;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    DeckDto create(
            @RequestParam("file") MultipartFile file,
            @RequestParam("cards") String cards,
            @RequestParam(value = "skipDuplicates", defaultValue = "false") boolean skipDuplicates
    ) throws IOException {
        return decks.create(file, cards, skipDuplicates);
    }

    @GetMapping
    List<DeckDto> list() {
        return decks.list();
    }

    @GetMapping("/custom")
    DeckDto getCustomDeck() {
        return decks.customDeck();
    }

    @GetMapping("/{deckId}/pdf")
    ResponseEntity<Resource> downloadPdf(@PathVariable String deckId) throws IOException {
        Path path = decks.pdfPath(deckId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(path.getFileName().toString(), StandardCharsets.UTF_8).build().toString())
                .body(new FileSystemResource(path));
    }

    @PostMapping("/custom-card")
    StudyCardDto addCustomCard(@RequestBody CardInput input) {
        return decks.addCustomCard(input);
    }

    @PutMapping("/cards/batch")
    List<StudyCardDto> updateCardsBatch(@RequestBody List<BatchCardUpdateItem> items) {
        return decks.updateCardsBatch(items);
    }

    @PutMapping("/cards/{cardId}")
    StudyCardDto updateCard(@PathVariable String cardId, @RequestBody CardInput input) {
        return decks.updateCard(cardId, input);
    }

    @DeleteMapping("/cards/{cardId}")
    ResponseEntity<Void> deleteCard(@PathVariable String cardId) {
        decks.deleteCard(cardId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{deckId}")
    ResponseEntity<Void> delete(@PathVariable String deckId) throws IOException {
        decks.delete(deckId);
        return ResponseEntity.noContent().build();
    }
}
