package vn.marugoto.trainer;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Set;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/bunpro/grammar/progress")
class BunproGrammarController {
    private final BunproGrammarService service;
    BunproGrammarController(BunproGrammarService service) { this.service=service; }
    private static void level(String level) { if(!Set.of("N5","N4").contains(level)) throw new ResponseStatusException(BAD_REQUEST,"Cấp độ không hợp lệ."); }
    @GetMapping("/entries") List<VocabCatalogEntry> entries(@RequestParam(defaultValue="N5") String level) { level(level); return service.entries(level); }
    @GetMapping("/entries/{id}") VocabCatalogEntry detail(@PathVariable String id) { return service.detail(id); }
    @PutMapping("/entries/{id}") @ResponseStatus(NO_CONTENT) void edit(@PathVariable String id,@RequestBody CatalogContent content) { service.edit(id,content); }
    @PutMapping("/tiers") @ResponseStatus(NO_CONTENT) void assign(@RequestBody VocabTierRequest request) { service.assign(request); }
    @PostMapping("/entries/{id}/learn") @ResponseStatus(NO_CONTENT) void learn(@PathVariable String id) { service.learn(id); }
    @GetMapping("/intervals") VocabIntervals intervals() { return service.intervals(); }
    @PutMapping("/intervals") VocabIntervals intervals(@RequestBody VocabIntervals request) { return service.setIntervals(request); }
    @GetMapping("/queue") List<VocabCatalogEntry> queue(@RequestParam(defaultValue="N5") String level) { level(level); return service.queue(level); }
    @PostMapping("/entries/{id}/reviews") VocabReviewResult review(@PathVariable String id,@RequestBody VocabReviewRequest request) { return service.review(id,request); }
}
