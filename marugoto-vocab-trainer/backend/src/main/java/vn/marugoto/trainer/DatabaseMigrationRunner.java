package vn.marugoto.trainer;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.PreparedStatement;

@Component
class DatabaseMigrationRunner implements SmartInitializingSingleton {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    DatabaseMigrationRunner(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Override
    public void afterSingletonsInstantiated() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
        Integer applied = jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version=1", Integer.class);
        if (applied != null && applied > 0) return;

        transaction.executeWithoutResult(status -> jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V1__create_decks_cards_and_reviews.sql"));
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)")) {
                statement.setLong(1, System.currentTimeMillis());
                statement.executeUpdate();
            }
            return null;
        }));
    }
}
