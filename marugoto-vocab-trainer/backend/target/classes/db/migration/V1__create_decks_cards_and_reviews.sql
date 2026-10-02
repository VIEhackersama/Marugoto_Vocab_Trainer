CREATE TABLE decks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    japanese TEXT NOT NULL,
    romaji TEXT NOT NULL DEFAULT '',
    vietnamese TEXT NOT NULL,
    fsrs_card_json TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_cards_deck_due ON cards(deck_id, due_at);
CREATE INDEX idx_cards_due ON cards(due_at);

CREATE TABLE review_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('AGAIN', 'HARD', 'GOOD', 'EASY')),
    source TEXT NOT NULL CHECK (source IN ('FLASHCARD', 'RECALL', 'TEST')),
    reviewed_at INTEGER NOT NULL,
    due_at_after INTEGER NOT NULL
);

CREATE INDEX idx_review_logs_card_reviewed ON review_logs(card_id, reviewed_at);
