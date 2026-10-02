import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuizSession,
  nextWaitingDueAt,
  recordFirstAttempt,
  releaseDueRepeats,
  removeCurrentQuestion,
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

test('Again waits until dueAt, then requeues the card as a repeat', () => {
  const now = 1_000_000;
  const session = createQuizSession([cards[0], cards[1]]);
  const advanced = removeCurrentQuestion(session);
  const dueAtIso = new Date(now + 60_000).toISOString();
  const waiting = scheduleAgain(advanced, cards[0], dueAtIso, now);

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
  const session = scheduleAgain(removeCurrentQuestion(started), cards[0], now + 600_000, now);
  assert.equal(session.waiting.length, 1);
  assert.equal(session.waiting[0].entry.id, cards[0].id);
  assert.equal(session.queue.length, 0);
});
