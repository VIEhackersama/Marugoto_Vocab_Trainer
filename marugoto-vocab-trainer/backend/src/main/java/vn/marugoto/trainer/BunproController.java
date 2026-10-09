package vn.marugoto.trainer;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/bunpro")
class BunproController {
    private final BunproService service;
    BunproController(BunproService service) { this.service=service; }
    private static void level(String value) {
        if(!Set.of("N5","N4").contains(value)) throw new ResponseStatusException(BAD_REQUEST,"Cấp độ không hợp lệ.");
    }
    @GetMapping("/entries")
    List<CatalogEntry> entries(@RequestParam(defaultValue="VOCAB") String kind,@RequestParam(defaultValue="N5") String level) {
        level(level);
        if(!Set.of("VOCAB","GRAMMAR").contains(kind)) throw new ResponseStatusException(BAD_REQUEST,"Loại nội dung không hợp lệ.");
        return service.entries(kind,level);
    }
    @GetMapping("/inventory") CatalogImportResult inventory() { return service.inventory(); }
    @PostMapping("/import") CatalogImportResult importSnapshot(@RequestBody CatalogSnapshot snapshot) { return service.importSnapshot(snapshot); }
    @PutMapping("/entries/{id}") @ResponseStatus(NO_CONTENT)
    void edit(@PathVariable String id,@RequestBody CatalogContent content) { service.edit(id,content); }
    @GetMapping("/vocab/{id}/candidates") List<VocabCandidate> candidates(@PathVariable String id) { return service.candidates(id); }
    @PostMapping("/vocab/{id}/learn") CatalogLearnResult learn(@PathVariable String id,@RequestBody(required=false) CatalogLearnRequest request) { return service.learnVocab(id,request); }
    @PostMapping("/lessons/{lesson}/learn") LessonLearnResult learnLesson(@PathVariable int lesson,@RequestParam(defaultValue="N5") String level) {
        level(level); if(lesson<1) throw new ResponseStatusException(BAD_REQUEST,"Lesson không hợp lệ.");
        return service.learnLesson(level,lesson);
    }
    @PostMapping("/grammar/{id}/learn") Map<String,Integer> learnGrammar(@PathVariable String id) { return Map.of("created",service.learnGrammar(id)); }
    @GetMapping("/grammar/cards") List<GrammarStudyCard> cards(@RequestParam(defaultValue="N5") String level,@RequestParam(defaultValue="true") boolean dueOnly) {
        level(level); return service.grammarCards(level,dueOnly);
    }
    @PostMapping("/grammar/cards/{id}/reviews") ReviewResponse review(@PathVariable String id,@RequestBody GrammarReviewRequest request) { return service.reviewGrammar(id,request); }
}
