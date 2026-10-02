package vn.marugoto.trainer;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reviews")
class ReviewController {
    private final ReviewService reviews;

    ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @PostMapping
    ReviewResponse review(@RequestBody ReviewRequest request) {
        return reviews.review(request);
    }
}
