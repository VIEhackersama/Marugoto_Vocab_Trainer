package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:sqlite:./target/backup-regression-test.db",
        "app.pdf-dir=./target/backup-regression-test-pdfs"
})
@Transactional
class BackupRestoreRegressionTest {
    @Autowired DeckService decks;
    @Autowired ReviewService reviews;
    @Autowired StudyService study;
    @Autowired BackupService backups;
    @Autowired JdbcTemplate jdbc;

    @Test
    void restoringTheSameBackupTwiceKeepsSourcesSchedulesAndReviews() {
        var card = decks.addCustomCard(new CardInput("猫（ねこ）", "neko", "mèo"));
        reviews.review(new ReviewRequest(card.id(), "GOOD", "FLASHCARD", 1200L, "JP_TO_VI"));
        var backup = backups.exportBackup();
        var before = study.cards("custom", "all", true, "JP_TO_VI", false);
        int sourceCount = jdbc.queryForObject("SELECT COUNT(*) FROM vocabulary_sources", Integer.class);
        int reviewCount = jdbc.queryForObject("SELECT COUNT(*) FROM review_logs", Integer.class);

        backups.importBackup(backup);
        backups.importBackup(backup);

        var after = study.cards("custom", "all", true, "JP_TO_VI", false);
        assertEquals(before, after);
        assertEquals(sourceCount, jdbc.queryForObject("SELECT COUNT(*) FROM vocabulary_sources", Integer.class));
        assertEquals(reviewCount, jdbc.queryForObject("SELECT COUNT(*) FROM review_logs", Integer.class));
        assertEquals(backup.studyCards().size(), backups.exportBackup().studyCards().size());
    }
}
