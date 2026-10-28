-- Preserve cards and histories while allowing Bunpro Beginner 0.

CREATE TABLE bunpro_vocab_cards_v8 (
 entry_id TEXT PRIMARY KEY REFERENCES bunpro_entries(id) ON DELETE CASCADE,
 tier TEXT NOT NULL CHECK(tier IN ('BEGINNER','ADEPT','SEASONED','EXPERT','MASTER')),
 fsrs_card_json TEXT NOT NULL, due_at INTEGER NOT NULL,
 review_count INTEGER NOT NULL DEFAULT 0, wrong_count INTEGER NOT NULL DEFAULT 0,
 last_reviewed_at INTEGER, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 stage INTEGER CHECK(stage BETWEEN 0 AND 12)
);
INSERT INTO bunpro_vocab_cards_v8 SELECT entry_id,tier,fsrs_card_json,due_at,review_count,wrong_count,last_reviewed_at,revision,created_at,stage FROM bunpro_vocab_cards;
CREATE TABLE bunpro_vocab_review_logs_v8 (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES bunpro_vocab_cards_v8(entry_id) ON DELETE CASCADE,
 rating TEXT NOT NULL CHECK(rating IN ('AGAIN','HARD','GOOD','EASY')),
 direction TEXT NOT NULL CHECK(direction IN ('JP_TO_VI','VI_TO_JP')),
 reviewed_at INTEGER NOT NULL, due_at_after INTEGER NOT NULL, tier_before TEXT NOT NULL, tier_after TEXT NOT NULL,
 stage_before INTEGER, stage_after INTEGER
);
INSERT INTO bunpro_vocab_review_logs_v8 SELECT id,entry_id,rating,direction,reviewed_at,due_at_after,tier_before,tier_after,stage_before,stage_after FROM bunpro_vocab_review_logs;
DROP TABLE bunpro_vocab_review_logs;
DROP TABLE bunpro_vocab_cards;
ALTER TABLE bunpro_vocab_cards_v8 RENAME TO bunpro_vocab_cards;
ALTER TABLE bunpro_vocab_review_logs_v8 RENAME TO bunpro_vocab_review_logs;
CREATE INDEX idx_bunpro_vocab_due ON bunpro_vocab_cards(due_at);

CREATE TABLE bunpro_grammar_cards_v8 (
 entry_id TEXT PRIMARY KEY REFERENCES bunpro_entries(id) ON DELETE CASCADE,
 tier TEXT NOT NULL CHECK(tier IN ('BEGINNER','ADEPT','SEASONED','EXPERT','MASTER')),
 fsrs_card_json TEXT NOT NULL, due_at INTEGER NOT NULL,
 review_count INTEGER NOT NULL DEFAULT 0, wrong_count INTEGER NOT NULL DEFAULT 0,
 last_reviewed_at INTEGER, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 stage INTEGER CHECK(stage BETWEEN 0 AND 12)
);
INSERT INTO bunpro_grammar_cards_v8 SELECT entry_id,tier,fsrs_card_json,due_at,review_count,wrong_count,last_reviewed_at,revision,created_at,stage FROM bunpro_grammar_cards;
CREATE TABLE bunpro_grammar_review_logs_v8 (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES bunpro_grammar_cards_v8(entry_id) ON DELETE CASCADE,
 rating TEXT NOT NULL CHECK(rating IN ('AGAIN','HARD','GOOD','EASY')),
 direction TEXT NOT NULL CHECK(direction IN ('JP_TO_VI','VI_TO_JP')),
 reviewed_at INTEGER NOT NULL, due_at_after INTEGER NOT NULL, tier_before TEXT NOT NULL, tier_after TEXT NOT NULL,
 stage_before INTEGER, stage_after INTEGER
);
INSERT INTO bunpro_grammar_review_logs_v8 SELECT id,entry_id,rating,direction,reviewed_at,due_at_after,tier_before,tier_after,stage_before,stage_after FROM bunpro_grammar_review_logs;
DROP TABLE bunpro_grammar_review_logs;
DROP TABLE bunpro_grammar_cards;
ALTER TABLE bunpro_grammar_cards_v8 RENAME TO bunpro_grammar_cards;
ALTER TABLE bunpro_grammar_review_logs_v8 RENAME TO bunpro_grammar_review_logs;
CREATE INDEX idx_bunpro_grammar_due ON bunpro_grammar_cards(due_at);
