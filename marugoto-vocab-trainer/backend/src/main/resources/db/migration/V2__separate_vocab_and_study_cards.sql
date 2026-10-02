CREATE TABLE IF NOT EXISTS vocabularies (
    id TEXT PRIMARY KEY,
    spelling TEXT NOT NULL,
    reading TEXT NOT NULL DEFAULT '',
    romaji TEXT NOT NULL DEFAULT '',
    meanings_vi TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vocabulary_sources (
    id TEXT PRIMARY KEY,
    vocabulary_id TEXT NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    lesson TEXT,
    page INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS study_cards (
    id TEXT PRIMARY KEY,
    vocabulary_id TEXT NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL DEFAULT 'JP_TO_VI',
    fsrs_card_json TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS review_logs_v2 (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('AGAIN', 'HARD', 'GOOD', 'EASY')),
    source TEXT NOT NULL,
    reviewed_at INTEGER NOT NULL,
    due_at_after INTEGER NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'JP_TO_VI',
    response_ms INTEGER,
    is_correct INTEGER
);

-- Migrate data from cards if cards exists as a table
INSERT OR IGNORE INTO vocabularies (id, spelling, reading, romaji, meanings_vi, created_at)
SELECT id, japanese, '', romaji, vietnamese, created_at FROM cards;

INSERT OR IGNORE INTO vocabulary_sources (id, vocabulary_id, deck_id, created_at)
SELECT 'src_' || id, id, deck_id, created_at FROM cards;

INSERT OR IGNORE INTO study_cards (id, vocabulary_id, card_type, fsrs_card_json, due_at, review_count, wrong_count, last_reviewed_at, created_at)
SELECT id, id, 'JP_TO_VI', fsrs_card_json, due_at, review_count, wrong_count, last_reviewed_at, created_at FROM cards;

-- Migrate review_logs data into review_logs_v2
INSERT OR IGNORE INTO review_logs_v2 (id, card_id, rating, source, reviewed_at, due_at_after, card_type, response_ms, is_correct)
SELECT id, card_id, rating, source, reviewed_at, due_at_after, 'JP_TO_VI', NULL, (CASE WHEN rating = 'AGAIN' THEN 0 ELSE 1 END)
FROM review_logs;

DROP TABLE review_logs;
ALTER TABLE review_logs_v2 RENAME TO review_logs;

ALTER TABLE cards RENAME TO _legacy_cards;

CREATE VIEW cards AS
SELECT
    s.id AS id,
    vs.deck_id AS deck_id,
    v.spelling AS japanese,
    v.romaji AS romaji,
    v.meanings_vi AS vietnamese,
    s.fsrs_card_json AS fsrs_card_json,
    s.due_at AS due_at,
    s.review_count AS review_count,
    s.wrong_count AS wrong_count,
    s.last_reviewed_at AS last_reviewed_at,
    s.created_at AS created_at
FROM study_cards s
JOIN vocabularies v ON v.id = s.vocabulary_id
JOIN vocabulary_sources vs ON vs.vocabulary_id = v.id;

CREATE INDEX IF NOT EXISTS idx_study_cards_due ON study_cards(due_at);
CREATE INDEX IF NOT EXISTS idx_study_cards_vocab_type ON study_cards(vocabulary_id, card_type);
CREATE INDEX IF NOT EXISTS idx_vocab_sources_deck ON vocabulary_sources(deck_id);
CREATE INDEX IF NOT EXISTS idx_vocab_sources_vocab ON vocabulary_sources(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_card_reviewed ON review_logs(card_id, reviewed_at);
