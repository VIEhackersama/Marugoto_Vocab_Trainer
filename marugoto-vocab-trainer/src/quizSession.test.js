import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuizSession,
  DEFAULT_AGAIN_DELAY_SECONDS,
  normalizeAgainDelaySeconds,
  nextWaitingDueAt,
  recordFirstAttempt,
  releaseDueRepeats,
  removeCurrentQuestion,
  rescheduleWaitingRepeats,
  scheduleAgain,
  secondsUntilNextRepeat,
  selectInitialCards,
} from './quizSession.js';

const cards = Array.from({ length: 8 }, (_, index) => ({ id: `card-${index}` }));
const dueCards = cards.slice(0, 3);
const fixedRandom = () => 0.37;

test('Test uses due cards first and fills its requested count with distinct non-due cards', () => {
  const selected = selectInitialCards(cards, dueCards, 5, 'TEST', fixedRandom);
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected.map((card) => card.id)).size, 5);
  assert.ok(dueCards.every((due) => selected.some((card) => card.id === due.id)));
  assert.equal(selected.filter((card) => !dueCards.some((due) => due.id === card.id)).length, 2);
});

test('Test limits its initial selection to cards currently available', () => {
  assert.equal(selectInitialCards(cards, dueCards, 99, 'TEST', fixedRandom).length, cards.length);
});

test('due-only session never fills from cards that are not due', () => {
  const selected = selectInitialCards(cards, dueCards, 10, 'DUE', fixedRandom);
  assert.deepEqual(new Set(selected.map((card) => card.id)), new Set(dueCards.map((card) => card.id)));
});

test('Again waits for the configured delay, then requeues the card as a repeat', () => {
  const now = 1_000_000;
  const session = createQuizSession([cards[0], cards[1]]);
  const advanced = removeCurrentQuestion(session);
  const waiting = scheduleAgain(advanced, cards[0], 60, now);

  assert.equal(waiting.queue.length, 1);
  assert.equal(nextWaitingDueAt(waiting), now + 60_000);
  assert.equal(secondsUntilNextRepeat(waiting, now), 60);
  assert.equal(releaseDueRepeats(waiting, now + 59_999).queue.length, 1);

  const ready = releaseDueRepeats(waiting, now + 60_000);
  assert.equal(ready.queue.length, 2);
  assert.equal(ready.queue[1].entry.id, cards[0].id);
  assert.equal(ready.queue[1].repeat, true);
  assert.equal(ready.waiting.length, 0);
});

test('a failed first attempt counts once even after the card is repeated', () => {
  const session = createQuizSession([cards[0]]);
  const firstAnswer = recordFirstAttempt(session, cards[0].id, false);
  const repeatAnswer = recordFirstAttempt(firstAnswer, cards[0].id, true);
  assert.equal(repeatAnswer.initialCompleted, 1);
  assert.equal(repeatAnswer.correctFirstTry, 0);
});

test('ending a session leaves scheduled repeats stored in the session state', () => {
  const now = 2_000_000;
  const started = createQuizSession([cards[0]]);
  const session = scheduleAgain(removeCurrentQuestion(started), cards[0], 600, now);
  assert.equal(session.waiting.length, 1);
  assert.equal(session.waiting[0].entry.id, cards[0].id);
  assert.equal(session.queue.length, 0);
});

test('manual Again delay is the same regardless of wrong count or stored FSRS due date', () => {
  const now = 3_000_000;
  const first = { id: 'first', wrongCount: 1, dueAt: now + 60_000 };
  const second = { id: 'second', wrongCount: 20, dueAt: now + 900_000 };
  const session = createQuizSession([]);
  const waiting = scheduleAgain(scheduleAgain(session, first, 45, now), second, 45, now);
  assert.deepEqual(waiting.waiting.map((item) => item.dueAt), [now + 45_000, now + 45_000]);
  assert.equal(first.dueAt, now + 60_000);
  assert.equal(second.dueAt, now + 900_000);
});

test('applying a new wait resets all pending repeats from now without losing session progress', () => {
  const now = 4_000_000;
  let session = recordFirstAttempt(createQuizSession([cards[2]]), cards[0].id, false);
  session = scheduleAgain(scheduleAgain(session, cards[0], 60, now), cards[1], 90, now);
  const reset = rescheduleWaitingRepeats(session, 15, now + 10_000);
  assert.equal(secondsUntilNextRepeat(reset, now + 10_000), 15);
  assert.equal(reset.waiting.length, 2);
  assert.equal(releaseDueRepeats(reset, now + 24_999).waiting.length, 2);
  assert.equal(releaseDueRepeats(reset, now + 25_000).queue.length, 3);
  assert.equal(reset.initialCompleted, 1);
  assert.equal(reset.correctFirstTry, 0);
  assert.deepEqual(reset.firstAttempts, session.firstAttempts);
});

test('zero delay immediately queues Again cards and releases pending cards', () => {
  const now = 5_000_000;
  const session = createQuizSession([]);
  const immediate = scheduleAgain(session, cards[0], 0, now);
  assert.equal(immediate.queue[0].repeat, true);
  assert.equal(immediate.waiting.length, 0);
  const pending = scheduleAgain(session, cards[1], 30, now);
  const released = rescheduleWaitingRepeats(pending, 0, now);
  assert.equal(released.waiting.length, 0);
  assert.equal(released.queue[0].entry.id, cards[1].id);
});

test('invalid saved delays fall back to the default while valid zero and maximum are retained', () => {
  for (const value of [null, '', 'broken', -1, 3601, Infinity, 1.5]) {
    assert.equal(normalizeAgainDelaySeconds(value), DEFAULT_AGAIN_DELAY_SECONDS);
  }
  assert.equal(normalizeAgainDelaySeconds('0'), 0);
  assert.equal(normalizeAgainDelaySeconds('3600'), 3600);
});
