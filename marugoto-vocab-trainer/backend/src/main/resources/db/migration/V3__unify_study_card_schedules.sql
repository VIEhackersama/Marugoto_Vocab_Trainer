-- Unify study card schedules across directions (JP_TO_VI and VI_TO_JP)
-- Synchronize each vocabulary to the card with later due_at (more progress / fewer cards due)

UPDATE study_cards
SET fsrs_card_json = jp.fsrs_card_json,
    due_at = jp.due_at,
    review_count = jp.review_count,
    wrong_count = jp.wrong_count,
    last_reviewed_at = jp.last_reviewed_at
FROM study_cards jp
WHERE study_cards.vocabulary_id = jp.vocabulary_id
  AND study_cards.card_type = 'VI_TO_JP'
  AND jp.card_type = 'JP_TO_VI'
  AND jp.due_at > study_cards.due_at;

UPDATE study_cards
SET fsrs_card_json = vi.fsrs_card_json,
    due_at = vi.due_at,
    review_count = vi.review_count,
    wrong_count = vi.wrong_count,
    last_reviewed_at = vi.last_reviewed_at
FROM study_cards vi
WHERE study_cards.vocabulary_id = vi.vocabulary_id
  AND study_cards.card_type = 'JP_TO_VI'
  AND vi.card_type = 'VI_TO_JP'
  AND vi.due_at > study_cards.due_at;
