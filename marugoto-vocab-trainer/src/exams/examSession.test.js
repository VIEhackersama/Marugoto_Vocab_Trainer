import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExamSession, displayPreferences, isAnswered, remainingTime } from './examSession.js';

const attempt = (patch = {}) => ({ id: 'a', status: 'IN_PROGRESS', serverNow: Date.now(), revision: 0, answers: {}, flagged: [], results: {}, ...patch });
const storage = () => { const items = new Map(); return { getItem: k => items.get(k), setItem: (k, v) => items.set(k, v), removeItem: k => items.delete(k) }; };

test('autosave preserves newer edits made during an in-flight write and uses the returned revision', async () => {
  const calls = []; let release;
  const session = new ExamSession({ storage: storage(), request: async (path, body) => {
    calls.push(body); if (calls.length === 1) await new Promise(resolve => { release = resolve; });
    return attempt({ answers: body.answers, revision: body.revision + 1 });
  } });
  session.open(attempt()); session.edit('q1', 'old'); const saving = session.save();
  await new Promise(resolve => setImmediate(resolve)); session.edit('q1', 'new'); release(); await saving;
  assert.equal(session.answers.q1, 'new'); assert.equal(session.dirty, true); assert.equal(session.attempt.revision, 1);
  await session.save(); assert.equal(calls[1].revision, 1); assert.equal(calls[1].answers.q1, 'new'); assert.equal(session.dirty, false);
});

test('submission waits for an autosave and includes the freshest answers', async () => {
  const calls = []; const session = new ExamSession({ request: async (path, body) => {
    calls.push({ path, body }); return attempt({ revision: body.revision + 1, answers: body.answers, status: path.endsWith('/submit') ? 'SUBMITTED' : 'IN_PROGRESS' });
  } });
  session.open(attempt()); session.edit('q1', 'a'); const saved = session.save(); const submitted = session.submit(); await Promise.all([saved, submitted]);
  assert.equal(calls[1].body.revision, 1); assert.equal(calls[1].body.answers.q1, 'a'); assert.equal(session.busy, false); assert.equal(session.attempt.status, 'SUBMITTED');
});

test('network failures retain a browser draft, which can be resumed and retried', async () => {
  const local = storage(); const failed = new ExamSession({ storage: local, request: async () => { throw new Error('offline'); } });
  failed.open(attempt()); failed.edit('q1', 'a'); await assert.rejects(failed.save()); assert.equal(failed.answers.q1, 'a'); assert.equal(failed.saveStatus, 'error');
  const resumed = new ExamSession({ storage: local, request: async (path, body) => attempt({ revision: 1, answers: body.answers }) });
  resumed.open(attempt()); assert.equal(resumed.answers.q1, 'a'); await resumed.save(); assert.equal(resumed.dirty, false);
});

test('stale tab conflicts preserve local text and never guess a new revision', async () => {
  let count = 0; const local = storage(); const session = new ExamSession({ storage: local, request: async () => {
    count++; const error = new Error('stale'); error.status = 409; throw error;
  } });
  session.open(attempt()); session.edit('q1', 'local'); await assert.rejects(session.save());
  assert.equal(session.conflict, true); assert.equal(session.answers.q1, 'local');
  await assert.rejects(session.save()); assert.equal(count, 1);
  const resumed = new ExamSession({ storage: local }); resumed.open(attempt({ revision: 2, answers: { q1: 'other tab' } }));
  assert.equal(resumed.conflict, true); assert.equal(resumed.answers.q1, 'local');
});

test('locked answers cannot be changed and expiry keeps an unsaved draft available', async () => {
  const session = new ExamSession({ request: async () => attempt({ status: 'SUBMITTED', answers: { q1: 'saved' }, revision: 2 }) });
  session.open(attempt({ answers: { q1: 'a' }, results: { q1: {} } })); session.edit('q1', 'b'); assert.equal(session.answers.q1, 'a');
  session.edit('q2', 'not saved'); clearTimeout(session.timer); await session.pollExpiry();
  assert.equal(session.attempt.status, 'SUBMITTED'); assert.equal(session.answers.q1, 'saved'); assert.equal(session.expiredDraft.answers.q2, 'not saved');
});

test('display bounds, completion and absolute countdown handle boundary values', () => {
  assert.deepEqual(displayPreferences(), { font: 'MS Mincho', size: 20, lineHeight: 1.8, furigana: false });
  assert.equal(displayPreferences({ size: 100, lineHeight: .2, font: 'invalid' }).size, 32);
  assert.equal(displayPreferences({ size: 100, lineHeight: .2 }).lineHeight, 1.5);
  assert.equal(isAnswered({ type: 'fill_blank', blanks: [{ id: 'b1' }, { id: 'b2' }] }, { b1: 'a', b2: '' }), false);
  assert.equal(isAnswered({ type: 'essay' }, '  '), false);
  assert.equal(remainingTime(61000, 0), '1:01'); assert.equal(remainingTime(61000, 61001), '0:00');
});

test('a successful save in one tab does not erase the other tab browser draft', async () => {
  const local = storage();
  const first = new ExamSession({ storage: local, draftScope: 'tab1', request: async (path, body) => attempt({ revision: 1, answers: body.answers }) });
  const second = new ExamSession({ storage: local, draftScope: 'tab2' });
  first.open(attempt()); second.open(attempt()); first.edit('q1', 'first'); second.edit('q1', 'second'); clearTimeout(second.timer);
  await first.save();
  const resumed = new ExamSession({ storage: local, draftScope: 'tab2' }); resumed.open(attempt({ revision: 1, answers: { q1: 'first' } }));
  assert.equal(resumed.answers.q1, 'second'); assert.equal(resumed.conflict, true);
});

test('expiry returned by autosave preserves the rejected local answers for download', async () => {
  const session = new ExamSession({ request: async () => attempt({ status: 'SUBMITTED', answers: { q1: 'previously saved' }, revision: 2 }) });
  session.open(attempt()); session.edit('q1', 'too late'); await session.save();
  assert.equal(session.attempt.status, 'SUBMITTED'); assert.equal(session.answers.q1, 'previously saved');
  assert.equal(session.expiredDraft.answers.q1, 'too late'); assert.match(session.error, /hết giờ/);
  session.open(attempt({ id: 'another' })); assert.equal(session.expiredDraft, null);
});

test('pause is serialized after autosave and sends the newest answers and current question', async () => {
  const calls = []; let release;
  const session = new ExamSession({ storage: storage(), request: async (path, body) => {
    calls.push({ path, body });
    if (calls.length === 1) await new Promise(resolve => { release = resolve; });
    return attempt({ revision: body.revision + 1, answers: body.answers, flagged: body.flagged, currentQuestionId: body.currentQuestionId,
      ...(path.endsWith('/pause') ? { status: 'PAUSED', remainingMs: 50000, pausedAt: Date.now() } : {}) });
  } });
  session.open(attempt({ currentQuestionId: 'q1' })); session.edit('q1', 'a'); const saving = session.save();
  await new Promise(resolve => setImmediate(resolve)); session.edit('q5', 'latest essay'); session.selectQuestion('q5'); session.toggleFlag('q5');
  const pausing = session.pause(); release(); await Promise.all([saving, pausing]);
  assert.equal(calls[1].path, '/api/exam-attempts/a/pause'); assert.equal(calls[1].body.revision, 1);
  assert.equal(calls[1].body.answers.q5, 'latest essay'); assert.equal(calls[1].body.currentQuestionId, 'q5'); assert.deepEqual(calls[1].body.flagged, ['q5']);
  assert.equal(session.attempt.status, 'PAUSED'); assert.equal(session.dirty, false); assert.equal(session.busy, false);
  session.edit('q5', 'must not change'); session.selectQuestion('q1'); assert.equal(session.answers.q5, 'latest essay'); assert.equal(session.currentQuestionId, 'q5');
});

test('failed pause keeps the running attempt and local draft instead of pretending the timer stopped', async () => {
  const session = new ExamSession({ storage: storage(), request: async () => { throw new Error('offline'); } });
  session.open(attempt({ deadlineAt: Date.now() + 60000, currentQuestionId: 'q1' })); session.edit('q1', 'a');
  await assert.rejects(session.pause()); assert.equal(session.attempt.status, 'IN_PROGRESS'); assert.equal(session.dirty, true);
  assert.equal(session.answers.q1, 'a'); assert.equal(session.saveStatus, 'error'); assert.match(session.error, /Đồng hồ vẫn đang chạy/);
});

test('reopening paused state stays read-only and resumes only on an explicit action with revision', async () => {
  const calls = [];
  const session = new ExamSession({ request: async (path, body) => {
    calls.push({ path, body }); return attempt({ revision: 4, answers: { q5: 'saved essay' }, currentQuestionId: 'q5', deadlineAt: Date.now() + 50000 });
  } });
  session.open(attempt({ status: 'PAUSED', revision: 3, answers: { q5: 'saved essay' }, currentQuestionId: 'q5', remainingMs: 50000 }));
  assert.equal(session.currentQuestionId, 'q5'); session.edit('q5', 'changed'); await session.save(); assert.equal(calls.length, 0);
  assert.equal(session.answers.q5, 'saved essay'); assert.equal(session.attempt.remainingMs, 50000);
  await session.resume(); assert.deepEqual(calls[0], { path: '/api/exam-attempts/a/resume', body: { revision: 3 } });
  assert.equal(session.attempt.status, 'IN_PROGRESS'); assert.equal(session.currentQuestionId, 'q5'); assert.equal(session.answers.q5, 'saved essay');
});

test('current position is restored from a browser draft and persisted with ordinary autosave', async () => {
  const local = storage(); let sent;
  const session = new ExamSession({ storage: local }); session.open(attempt({ currentQuestionId: 'q1' })); session.selectQuestion('q4'); clearTimeout(session.timer);
  const reopened = new ExamSession({ storage: local, request: async (path, body) => {
    sent = body; return attempt({ revision: 1, answers: body.answers, flagged: body.flagged, currentQuestionId: body.currentQuestionId });
  } });
  reopened.open(attempt({ currentQuestionId: 'q1' })); assert.equal(reopened.currentQuestionId, 'q4'); await reopened.save(); assert.equal(sent.currentQuestionId, 'q4');
});
