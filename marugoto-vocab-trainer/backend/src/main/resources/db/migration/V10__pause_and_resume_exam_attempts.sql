CREATE TABLE exam_attempts_v10 (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id),
    snapshot_json TEXT NOT NULL,
    feedback_mode TEXT NOT NULL CHECK(feedback_mode IN ('on_submit', 'per_question')),
    status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'PAUSED', 'SUBMITTED')),
    started_at INTEGER NOT NULL,
    deadline_at INTEGER,
    submitted_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,
    answers_json TEXT NOT NULL DEFAULT '{}',
    flagged_json TEXT NOT NULL DEFAULT '[]',
    results_json TEXT NOT NULL DEFAULT '{}',
    remaining_ms INTEGER,
    paused_at INTEGER,
    current_question_id TEXT
);

INSERT INTO exam_attempts_v10(id,exam_id,snapshot_json,feedback_mode,status,started_at,deadline_at,submitted_at,revision,answers_json,flagged_json,results_json)
SELECT id,exam_id,snapshot_json,feedback_mode,status,started_at,deadline_at,submitted_at,revision,answers_json,flagged_json,results_json
FROM exam_attempts;

DROP TABLE exam_attempts;
ALTER TABLE exam_attempts_v10 RENAME TO exam_attempts;
CREATE INDEX exam_attempts_exam_started ON exam_attempts(exam_id, started_at DESC);
