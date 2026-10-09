package vn.marugoto.trainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
class DatabaseMigrationRunner implements SmartInitializingSingleton {
    private static final Logger log = LoggerFactory.getLogger(DatabaseMigrationRunner.class);
    private static final Pattern VERSION_PATTERN = Pattern.compile("^V(\\d+)__.*\\.sql$");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final String datasourceUrl;

    DatabaseMigrationRunner(
            JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            @Value("${spring.datasource.url:}") String datasourceUrl
    ) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.datasourceUrl = datasourceUrl;
    }

    private record MigrationResource(int version, Resource resource) {}

    @Override
    public void afterSingletonsInstantiated() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");

        List<MigrationResource> migrations = discoverMigrations();
        List<MigrationResource> pending = new ArrayList<>();
        for (MigrationResource migration : migrations) {
            Integer applied = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM schema_migrations WHERE version=?",
                    Integer.class,
                    migration.version()
            );
            if (applied == null || applied == 0) {
                pending.add(migration);
            }
        }

        if (pending.isEmpty()) {
            return;
        }

        // Backup existing SQLite database before applying any pending migrations
        createDatabaseBackupBeforeMigration();

        for (MigrationResource migration : pending) {
            log.info("Applying database migration V{} ({})", migration.version(), migration.resource().getFilename());
            transaction.executeWithoutResult(status -> jdbc.execute((ConnectionCallback<Void>) connection -> {
                try (var statement = connection.createStatement()) {
                    statement.execute("PRAGMA foreign_keys=OFF");
                }
                ScriptUtils.executeSqlScript(connection, migration.resource());
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)")) {
                    statement.setInt(1, migration.version());
                    statement.setLong(2, System.currentTimeMillis());
                    statement.executeUpdate();
                }
                try (var statement = connection.createStatement()) {
                    statement.execute("PRAGMA foreign_keys=ON");
                }
                return null;
            }));
            log.info("Successfully applied database migration V{}", migration.version());
        }

        // Post-migration data cleanup: populate reading in vocabularies if empty
        // Only legacy migrations require vocabulary cleanup. Catalog/grammar migrations
        // must leave existing vocabulary content and schedules untouched.
        if (pending.stream().anyMatch(migration -> migration.version() <= 3)) {
            populateMissingVocabReadings();
        }
    }

    private List<MigrationResource> discoverMigrations() {
        List<MigrationResource> list = new ArrayList<>();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources("classpath*:db/migration/V*__*.sql");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename == null) continue;
                Matcher matcher = VERSION_PATTERN.matcher(filename);
                if (matcher.matches()) {
                    int version = Integer.parseInt(matcher.group(1));
                    list.add(new MigrationResource(version, resource));
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Không thể quét danh sách migration scripts.", e);
        }
        list.sort(Comparator.comparingInt(MigrationResource::version));
        return list;
    }

    private void createDatabaseBackupBeforeMigration() {
        if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:sqlite:")) return;
        String rawPath = datasourceUrl.substring("jdbc:sqlite:".length()).trim();
        if (rawPath.isEmpty() || rawPath.startsWith(":") || rawPath.contains(":memory:")) return;

        try {
            Path dbPath = Path.of(rawPath).toAbsolutePath().normalize();
            if (Files.isRegularFile(dbPath) && Files.size(dbPath) > 0) {
                Path backupPath = dbPath.resolveSibling(dbPath.getFileName().toString() + ".bak");
                Files.copy(dbPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Đã tự động sao lưu CSDL trước migration tại: {}", backupPath);
            }
        } catch (Exception e) {
            log.warn("Không thể tạo bản sao lưu CSDL trước migration: {}", e.getMessage());
        }
    }

    private void populateMissingVocabReadings() {
        try {
            Integer tableCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='vocabularies'",
                    Integer.class
            );
            if (tableCount == null || tableCount == 0) return;

            jdbc.query("SELECT id, spelling FROM vocabularies WHERE reading = ''", rs -> {
                String id = rs.getString("id");
                String spelling = rs.getString("spelling");
                String reading = DeckService.extractReading(spelling);
                if (reading != null && !reading.isBlank()) {
                    jdbc.update("UPDATE vocabularies SET reading = ? WHERE id = ?", reading, id);
                }
            });
        } catch (Exception e) {
            log.warn("Không thể chuẩn hóa reading cho vocabularies: {}", e.getMessage());
        }
    }
}
