CREATE TABLE bunpro_entries (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('VOCAB','GRAMMAR')),
    level TEXT NOT NULL,
    lesson INTEGER NOT NULL,
    position INTEGER NOT NULL,
    source_url TEXT NOT NULL UNIQUE,
    content_json TEXT NOT NULL,
    edited INTEGER NOT NULL DEFAULT 0,
    snapshot_version TEXT NOT NULL
);
CREATE INDEX idx_bunpro_kind_level_lesson ON bunpro_entries(kind,level,lesson,position);
CREATE TABLE bunpro_vocab_links (
    entry_id TEXT PRIMARY KEY REFERENCES bunpro_entries(id) ON DELETE CASCADE,
    vocabulary_id TEXT NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE
);
CREATE INDEX idx_bunpro_link_vocab ON bunpro_vocab_links(vocabulary_id);
CREATE TABLE grammar_cards (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES bunpro_entries(id) ON DELETE CASCADE,
    sentence_id TEXT NOT NULL,
    fsrs_card_json TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(entry_id,sentence_id)
);
CREATE INDEX idx_grammar_cards_due ON grammar_cards(due_at);
CREATE TABLE grammar_review_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES grammar_cards(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK(rating IN ('AGAIN','HARD','GOOD','EASY')),
    reviewed_at INTEGER NOT NULL,
    due_at_after INTEGER NOT NULL,
    response_text TEXT NOT NULL DEFAULT ''
);
