package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.CardAndReviewLog;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
public class FsrsScheduler {
    private final Scheduler scheduler = Scheduler.builder()
            .desiredRetention(0.9)
            .learningSteps(new Duration[]{Duration.ofMinutes(1), Duration.ofMinutes(10)})
            .relearningSteps(new Duration[]{Duration.ofMinutes(10)})
            .maximumInterval(36500)
            .enableFuzzing(true)
            .build();

    public Card newCard() {
        return Card.builder().build();
    }

    public CardAndReviewLog review(Card card, Rating rating) {
        return scheduler.reviewCard(card, rating);
    }

    public Card read(String json) {
        return Card.fromJson(json);
    }

    public String write(Card card) {
        return card.toJson();
    }

    public Instant dueAt(Card card) {
        return card.getDue();
    }
}
