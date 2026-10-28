CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    document_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(source_id, content_hash),
    UNIQUE(source_id, version)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id),
    snapshot_json TEXT NOT NULL,
    feedback_mode TEXT NOT NULL CHECK(feedback_mode IN ('on_submit', 'per_question')),
    status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'SUBMITTED')),
    started_at INTEGER NOT NULL,
    deadline_at INTEGER,
    submitted_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,
    answers_json TEXT NOT NULL DEFAULT '{}',
    flagged_json TEXT NOT NULL DEFAULT '[]',
    results_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS exam_attempts_exam_started ON exam_attempts(exam_id, started_at DESC);
