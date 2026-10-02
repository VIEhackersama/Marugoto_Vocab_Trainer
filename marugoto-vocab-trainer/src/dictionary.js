export const KANA_ROWS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'a', label: 'あ行 (A)', desc: 'a, i, u, e, o', chars: 'あいうえおぁぃぅぇぉアイウエオァィゥェォ', romaji: /^[aiueo]/i },
  { id: 'ka', label: 'か行 (Ka)', desc: 'ka, ki, ku, ke, ko, ga...', chars: 'かきくけこがぎぐげごカキクケコガギグゲゴ', romaji: /^[kg]/i },
  { id: 'sa', label: 'さ行 (Sa)', desc: 'sa, shi, su, se, so, za...', chars: 'さしすせそざじずぜぞサシスセソザジズゼゾ', romaji: /^[szj]/i },
  { id: 'ta', label: 'た行 (Ta)', desc: 'ta, chi, tsu, te, to, da...', chars: 'たちつてとだぢづでどっタチツテトダヂヅデドッ', romaji: /^[tdc]/i },
  { id: 'na', label: 'な行 (Na)', desc: 'na, ni, nu, ne, no', chars: 'なにぬねのナニヌネノ', romaji: /^n/i },
  { id: 'ha', label: 'は行 (Ha)', desc: 'ha, hi, fu, he, ho, ba, pa...', chars: 'はひふへほばびぶべぼぱぴぷぺぽハヒフヘホバビブベボパピプペポ', romaji: /^[hbp]/i },
  { id: 'ma', label: 'ま行 (Ma)', desc: 'ma, mi, mu, me, mo', chars: 'まみむめもマミムメモ', romaji: /^m/i },
  { id: 'ya', label: 'や行 (Ya)', desc: 'ya, yu, yo', chars: 'やゆよゃゅょヤユヨャュョ', romaji: /^y/i },
  { id: 'ra', label: 'ら行 (Ra)', desc: 'ra, ri, ru, re, ro', chars: 'らりるれろラリルレロ', romaji: /^r/i },
  { id: 'wa', label: 'わ行 (Wa)', desc: 'wa, wo, n', chars: 'わゐゑをんワヰヱヲン', romaji: /^w/i },
  { id: 'other', label: 'Khác', desc: 'A-Z, số, ký hiệu', chars: '', romaji: null },
];

export function isJapanese(s) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s || '');
}

export function removeDiacritics(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

export function extractReading(card) {
  const jp = card?.jp || '';
  // Check if kana in parentheses: e.g. 学生（がくせい） or 学生(がくせい)
  const parenMatch = jp.match(/[\(（]([\u3040-\u30ff\s～~\-]+)[\)）]/);
  if (parenMatch) {
    const inside = parenMatch[1].replace(/^[～~\-・\s\d\(\)\[\]"'`\.\/]+/, '');
    if (/[\u3040-\u30ff]/.test(inside)) return inside;
  }
  // Check if kana before parentheses: がくせい（学生）
  const beforeParen = jp.split(/[\(（]/)[0].replace(/^[～~\-・\s\d\(\)\[\]"'`\.\/]+/, '');
  if (/^[\u3040-\u30ff]/.test(beforeParen)) return beforeParen;

  // Clean leading symbols
  const clean = jp.replace(/^[～~\-・\s\d\(\)\[\]"'`\.\/]+/, '');
  if (/^[\u3040-\u30ff]/.test(clean)) return clean;

  if (card?.romaji && isJapanese(jp)) return card.romaji;
  return clean || card?.romaji || card?.vi || '';
}

export function toHiragana(str) {
  return (str || '').replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function canonicalKanaKey(cardOrJp) {
  const jp = typeof cardOrJp === 'string' ? cardOrJp : (cardOrJp?.jp || '');
  const reading = extractReading(typeof cardOrJp === 'string' ? { jp } : cardOrJp);
  const cleaned = reading
    .replace(/^[～~\-・\s\d\(\)\[\]"'`\.\/]+/, '')
    .replace(/[～~\-・\s\d\(\)\[\]"'`\.\/]+$/, '')
    .trim();
  return toHiragana(cleaned).toLowerCase();
}

export function findDuplicates(candidateCards, existingCards) {
  const existingByKana = new Map();
  const existingByJp = new Map();

  for (const card of (existingCards || [])) {
    const jpKey = (card.jp || '').trim().toLowerCase();
    if (jpKey && !existingByJp.has(jpKey)) {
      existingByJp.set(jpKey, card);
    }
    const kanaKey = canonicalKanaKey(card);
    if (kanaKey && !existingByKana.has(kanaKey)) {
      existingByKana.set(kanaKey, card);
    }
  }

  const duplicates = [];
  const uniqueCards = [];
  const seenInBatch = new Set();

  for (const card of (candidateCards || [])) {
    const jpKey = (card.jp || '').trim().toLowerCase();
    const kanaKey = canonicalKanaKey(card);

    const batchKey = kanaKey || jpKey;
    if (batchKey && seenInBatch.has(batchKey)) {
      continue;
    }
    if (batchKey) seenInBatch.add(batchKey);

    const matchByJp = existingByJp.get(jpKey);
    const matchByKana = existingByKana.get(kanaKey);

    if (matchByJp) {
      duplicates.push({
        candidate: card,
        existing: matchByJp,
        reason: 'Trùng khớp hoàn toàn chữ Nhật',
      });
    } else if (matchByKana && kanaKey) {
      duplicates.push({
        candidate: card,
        existing: matchByKana,
        reason: 'Trùng cách đọc Kana',
      });
    } else {
      uniqueCards.push(card);
    }
  }

  return {
    duplicates,
    uniqueCards,
    hasDuplicates: duplicates.length > 0,
  };
}

export function getKanaRow(card) {
  const cleanJp = (card?.jp || '').replace(/^[～~\-・\s\d\(\)\[\]"'`\.\/]+/, '');
  if (!isJapanese(cleanJp)) return 'Khác';
  const reading = extractReading(card);
  const firstChar = reading[0];
  if (firstChar) {
    for (const row of KANA_ROWS) {
      if (row.chars && row.chars.includes(firstChar)) return row.label;
    }
  }
  if (card?.romaji) {
    for (const row of KANA_ROWS) {
      if (row.romaji && row.romaji.test(card.romaji.trim())) return row.label;
    }
  }
  return 'Khác';
}

export function getRowIndex(card) {
  const label = getKanaRow(card);
  const idx = KANA_ROWS.findIndex((r) => r.label === label);
  return idx >= 0 ? idx : 999;
}

export const jaCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

export function compareJapanese(a, b) {
  const rowDiff = getRowIndex(a) - getRowIndex(b);
  if (rowDiff !== 0) return rowDiff;
  return jaCollator.compare(extractReading(a), extractReading(b));
}

export function filterAndSortDictionary(cards, options) {
  const {
    searchQuery = '',
    deckFilter = 'all',
    statusFilter = 'all',
    rowSelect = 'all',
    sortOrder = 'gojuon-asc',
    now = Date.now(),
  } = options || {};

  const trimmedSearch = searchQuery.trim();
  const searchNorm = removeDiacritics(trimmedSearch);
  const searchLower = trimmedSearch.toLowerCase();

  const filtered = cards.filter((card) => {
    // Deck filter
    if (deckFilter === 'custom' && card.deckId !== 'custom') return false;
    if (deckFilter !== 'all' && deckFilter !== 'custom' && card.deckId !== deckFilter) return false;

    // Status filter
    const isDue = new Date(card.dueAt).getTime() <= now;
    if (statusFilter === 'due' && !isDue) return false;
    if (statusFilter === 'reviewed' && (card.reviewCount === 0 || isDue)) return false;
    if (statusFilter === 'new' && card.reviewCount > 0) return false;

    // Gojuon Row filter
    if (rowSelect !== 'all') {
      const row = getKanaRow(card);
      if (row !== rowSelect) return false;
    }

    // Search query filter
    if (trimmedSearch) {
      const jp = (card.jp || '').toLowerCase();
      const vi = (card.vi || '').toLowerCase();
      const viNorm = removeDiacritics(vi);
      const romaji = (card.romaji || '').toLowerCase();
      return (
        jp.includes(searchLower) ||
        vi.includes(searchLower) ||
        viNorm.includes(searchNorm) ||
        romaji.includes(searchLower)
      );
    }

    return true;
  });

  return filtered.sort((a, b) => {
    if (sortOrder === 'gojuon-asc') return compareJapanese(a, b);
    if (sortOrder === 'gojuon-desc') return compareJapanese(b, a);
    if (sortOrder === 'wrong-desc') {
      const diff = (b.wrongCount || 0) - (a.wrongCount || 0);
      return diff !== 0 ? diff : compareJapanese(a, b);
    }
    if (sortOrder === 'review-desc') {
      const diff = (b.reviewCount || 0) - (a.reviewCount || 0);
      return diff !== 0 ? diff : compareJapanese(a, b);
    }
    if (sortOrder === 'recent') {
      return (b.id || '').localeCompare(a.id || '');
    }
    return compareJapanese(a, b);
  });
}
