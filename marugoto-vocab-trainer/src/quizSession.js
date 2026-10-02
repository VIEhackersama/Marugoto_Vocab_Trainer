function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function uniqueById(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    if (!card?.id || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

export function selectInitialCards(allCards, dueCards, requestedCount, mode = 'TEST', random = Math.random) {
  const all = uniqueById(allCards);
  const allIds = new Set(all.map((card) => card.id));
  const due = uniqueById(dueCards).filter((card) => allIds.has(card.id));
  const limit = Math.max(0, Math.min(Math.floor(Number(requestedCount) || 0), mode === 'DUE' ? due.length : all.length));
  if (!limit) return [];

  if (mode === 'DUE') return shuffle(due, random).slice(0, limit);

  const dueIds = new Set(due.map((card) => card.id));
  const dueSelection = shuffle(due, random).slice(0, limit);
  const remainingCount = limit - dueSelection.length;
  const newSelection = shuffle(all.filter((card) => !dueIds.has(card.id)), random).slice(0, remainingCount);
  return shuffle([...dueSelection, ...newSelection], random);
}

export function createQuizSession(cards) {
  return {
    initialCount: cards.length,
    initialCompleted: 0,
    correctFirstTry: 0,
    firstAttempts: {},
    queue: cards.map((entry) => ({ entry, options: entry.quizOptions || [], repeat: false })),
    waiting: [],
  };
}

export function recordFirstAttempt(session, cardId, correct) {
  if (Object.hasOwn(session.firstAttempts, cardId)) return session;
  return {
    ...session,
    initialCompleted: session.initialCompleted + 1,
    correctFirstTry: session.correctFirstTry + (correct ? 1 : 0),
    firstAttempts: { ...session.firstAttempts, [cardId]: correct },
  };
}

export function removeCurrentQuestion(session) {
  return { ...session, queue: session.queue.slice(1) };
}

export function scheduleAgain(session, entry, dueAt, now = Date.now()) {
  const timestamp = typeof dueAt === 'number' ? dueAt : Date.parse(dueAt);
  const waiting = session.waiting.filter((item) => item.entry.id !== entry.id);
  if (!Number.isFinite(timestamp) || timestamp <= now) {
    return {
      ...session,
      queue: [...session.queue, { entry, options: entry.quizOptions || [], repeat: true }],
      waiting,
    };
  }
  return { ...session, waiting: [...waiting, { entry, dueAt: timestamp }] };
}

export function releaseDueRepeats(session, now = Date.now()) {
  const ready = session.waiting.filter((item) => item.dueAt <= now);
  if (!ready.length) return session;
  const waiting = session.waiting.filter((item) => item.dueAt > now);
  return {
    ...session,
    queue: [...session.queue, ...ready.map(({ entry }) => ({ entry, options: entry.quizOptions || [], repeat: true }))],
    waiting,
  };
}

export function nextWaitingDueAt(session) {
  if (!session.waiting.length) return null;
  return Math.min(...session.waiting.map((item) => item.dueAt));
}

export function secondsUntilNextRepeat(session, now = Date.now()) {
  const dueAt = nextWaitingDueAt(session);
  return dueAt === null ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));
}
