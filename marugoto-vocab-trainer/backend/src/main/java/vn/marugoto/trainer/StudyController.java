package vn.marugoto.trainer;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/study")
class StudyController {
    private final StudyService study;

    StudyController(StudyService study) {
        this.study = study;
    }

    @GetMapping("/cards")
    StudyResponse cards(
            @RequestParam(required = false, defaultValue = "all") String deckId,
            @RequestParam(required = false, defaultValue = "all") String mode,
            @RequestParam(required = false, defaultValue = "false") boolean includeCustom,
            @RequestParam(required = false, defaultValue = "JP_TO_VI") String cardType,
            @RequestParam(required = false, defaultValue = "false") boolean leechOnly
    ) {
        return study.cards(deckId, mode, includeCustom, cardType, leechOnly);
    }
}
