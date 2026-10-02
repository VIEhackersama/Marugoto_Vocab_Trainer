/**
 * HTTP API client for Marugoto Vocab Trainer backend.
 */
export async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Lỗi máy chủ (${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function fetchDecks() {
  return api('/api/decks');
}

export async function fetchCustomDeck() {
  return api('/api/decks/custom');
}

export async function fetchStudyCards({ deckId = 'all', mode = 'all', includeCustom = true, cardType = 'JP_TO_VI' } = {}) {
  const params = new URLSearchParams({
    deckId,
    mode,
    includeCustom: String(includeCustom),
    cardType
  });
  return api(`/api/study/cards?${params}`);
}

export async function postReview({ cardId, rating, reviewType, responseMs, cardType }) {
  return api('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, rating, reviewType, responseMs, cardType })
  });
}

export async function updateCard(cardId, data) {
  return api(`/api/decks/cards/${cardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateCardsBatch(items) {
  return api('/api/decks/cards/batch', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items)
  });
}

export async function deleteCard(cardId) {
  return api(`/api/decks/cards/${cardId}`, { method: 'DELETE' });
}

export async function createCustomCard(data) {
  return api('/api/decks/custom-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteDeck(deckId) {
  return api(`/api/decks/${deckId}`, { method: 'DELETE' });
}
