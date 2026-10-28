ALTER TABLE bunpro_vocab_cards ADD COLUMN stage INTEGER CHECK(stage BETWEEN 1 AND 12);
ALTER TABLE bunpro_grammar_cards ADD COLUMN stage INTEGER CHECK(stage BETWEEN 1 AND 12);
ALTER TABLE bunpro_vocab_review_logs ADD COLUMN stage_before INTEGER;
ALTER TABLE bunpro_vocab_review_logs ADD COLUMN stage_after INTEGER;
ALTER TABLE bunpro_grammar_review_logs ADD COLUMN stage_before INTEGER;
ALTER TABLE bunpro_grammar_review_logs ADD COLUMN stage_after INTEGER;
CREATE TABLE bunpro_stage_settings (
    kind TEXT PRIMARY KEY CHECK(kind IN ('VOCAB','GRAMMAR')),
    seconds_json TEXT NOT NULL
);
INSERT INTO bunpro_stage_settings VALUES('VOCAB','[14400,28800,86400,172800,345600,691200,1036800,2073600,4147200,8294400,15206400]');
INSERT INTO bunpro_stage_settings SELECT 'GRAMMAR',seconds_json FROM bunpro_stage_settings WHERE kind='VOCAB';
CREATE TABLE bunpro_progress_imports (
    id TEXT PRIMARY KEY,
    imported_at INTEGER NOT NULL,
    backup_path TEXT NOT NULL,
    changes_json TEXT NOT NULL
);
