CREATE TABLE bunpro_vocab_content (
    entry_id TEXT PRIMARY KEY REFERENCES bunpro_entries(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    edited INTEGER NOT NULL DEFAULT 0,
    capture_version TEXT NOT NULL
);
CREATE TABLE bunpro_vocab_cards (
    entry_id TEXT PRIMARY KEY REFERENCES bunpro_entries(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK(tier IN ('BEGINNER','ADEPT','SEASONED','EXPERT','MASTER')),
    fsrs_card_json TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_bunpro_vocab_due ON bunpro_vocab_cards(due_at);
CREATE TABLE bunpro_vocab_review_logs (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES bunpro_vocab_cards(entry_id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK(rating IN ('AGAIN','HARD','GOOD','EASY')),
    direction TEXT NOT NULL CHECK(direction IN ('JP_TO_VI','VI_TO_JP')),
    reviewed_at INTEGER NOT NULL,
    due_at_after INTEGER NOT NULL,
    tier_before TEXT NOT NULL,
    tier_after TEXT NOT NULL
);
CREATE TABLE bunpro_vocab_settings (
    id TEXT PRIMARY KEY CHECK(id='intervals'),
    days_json TEXT NOT NULL
);
INSERT INTO bunpro_vocab_settings(id,days_json) VALUES('intervals','[1,3,7,14,30]');
