import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasKanji,
  parseKanjiReading,
  formatKanjiTerm,
  findKanjiSuggestions,
  autoMapKanjiForCards,
  getTestJapaneseDisplay,
  resolveCardKanjiDetails,
  KANJI_DICTIONARY,
} from './kanji.js';

test('hasKanji identifies kanji characters correctly', () => {
  assert.equal(hasKanji('さかな'), false);
  assert.equal(hasKanji('パン'), false);
  assert.equal(hasKanji('魚'), true);
  assert.equal(hasKanji('魚（さかな）'), true);
  assert.equal(hasKanji('食べます'), true);
  assert.equal(hasKanji('student'), false);
});

test('parseKanjiReading extracts kanji and reading properly', () => {
  // Format: 魚（さかな）
  const r1 = parseKanjiReading('魚（さかな）');
  assert.equal(r1.kanji, '魚');
  assert.equal(r1.reading, 'さかな');
  assert.equal(r1.hasKanji, true);
  assert.equal(r1.formatted, '魚（さかな）');

  // Format: 学生(がくせい) half-width parentheses
  const r2 = parseKanjiReading('学生(がくせい)');
  assert.equal(r2.kanji, '学生');
  assert.equal(r2.reading, 'がくせい');
  assert.equal(r2.hasKanji, true);

  // Pure Kana: さかな
  const r3 = parseKanjiReading('さかな');
  assert.equal(r3.kanji, '');
  assert.equal(r3.reading, 'さかな');
  assert.equal(r3.hasKanji, false);

  // Pure Kanji: 魚
  const r4 = parseKanjiReading('魚');
  assert.equal(r4.kanji, '魚');
  assert.equal(r4.hasKanji, true);

  // Kana(Kanji): がくせい（学生）
  const r5 = parseKanjiReading('がくせい（学生）');
  assert.equal(r5.kanji, '学生');
  assert.equal(r5.reading, 'がくせい');
});

test('formatKanjiTerm formats in various styles', () => {
  assert.equal(formatKanjiTerm('魚', 'さかな', 'ruby'), '魚（さかな）');
  assert.equal(formatKanjiTerm('魚', 'さかな', 'kanji-only'), '魚');
  assert.equal(formatKanjiTerm('魚', 'さかな', 'kana-only'), 'さかな');
  assert.equal(formatKanjiTerm('', 'さかな', 'ruby'), 'さかな');
});

test('findKanjiSuggestions finds 1-1 mappings for Marugoto words', () => {
  // Lesson 5 food items
  const fish = findKanjiSuggestions({ jp: 'さかな', vi: 'cá' });
  assert.ok(fish.bestMatch);
  assert.equal(fish.bestMatch.kanji, '魚');
  assert.equal(fish.bestMatch.formatted, '魚（さかな）');

  const meat = findKanjiSuggestions({ jp: 'にく', vi: 'thịt' });
  assert.ok(meat.bestMatch);
  assert.equal(meat.bestMatch.kanji, '肉');

  const egg = findKanjiSuggestions({ jp: 'たまご', vi: 'trứng' });
  assert.ok(egg.bestMatch);
  assert.equal(egg.bestMatch.kanji, '卵');

  const water = findKanjiSuggestions({ jp: 'みず', vi: 'nước' });
  assert.ok(water.bestMatch);
  assert.equal(water.bestMatch.kanji, '水');

  // People & places
  const student = findKanjiSuggestions({ jp: 'がくせい', vi: 'học sinh' });
  assert.ok(student.bestMatch);
  assert.equal(student.bestMatch.kanji, '学生');

  const school = findKanjiSuggestions({ jp: 'がっこう', vi: 'trường học' });
  assert.ok(school.bestMatch);
  assert.equal(school.bestMatch.kanji, '学校');

  // By Vietnamese keyword if kana is missing/custom
  const byVi = findKanjiSuggestions({ jp: '', vi: 'con mèo' });
  assert.ok(byVi.suggestions.some((s) => s.kanji === '猫'));

  // Phonetic mismatch regression tests:
  // Must NOT suggest kanji if kana reading does not match, even if Vietnamese words match!
  const okuremasu = findKanjiSuggestions({ jp: 'おくれます', vi: 'chậm / muộn', romaji: 'okuremasu' });
  assert.equal(okuremasu.bestMatch, null);
  assert.ok(!okuremasu.suggestions.some((s) => s.kanji === '遅い'));

  const australia = findKanjiSuggestions({ jp: 'オーストラリア', vi: 'nước Úc' });
  assert.equal(australia.bestMatch, null);
  assert.ok(!australia.suggestions.some((s) => s.kanji === '公務員'));

  const table = findKanjiSuggestions({ jp: 'テーブル', vi: 'cái bàn' });
  assert.equal(table.bestMatch, null);
  assert.ok(!table.suggestions.some((s) => s.kanji === '机'));

  const spain = findKanjiSuggestions({ jp: 'スペイン', vi: 'nước Tây Ban Nha' });
  assert.equal(spain.bestMatch, null);
  assert.ok(!spain.suggestions.some((s) => s.kanji === '日本'));

  const san = findKanjiSuggestions({ jp: '~さん', vi: 'Ông ... / Bà ... / Anh ... / Chị ...' });
  assert.equal(san.bestMatch, null);
});

test('autoMapKanjiForCards batch maps kana cards to kanji', () => {
  const cards = [
    { id: '1', jp: 'さかな', romaji: 'sakana', vi: 'cá' },
    { id: '2', jp: 'にく', romaji: 'niku', vi: 'thịt' },
    { id: '3', jp: 'たまご', romaji: 'tamago', vi: 'trứng' },
    { id: '4', jp: 'みず', romaji: 'mizu', vi: 'nước' },
    { id: '5', jp: 'コーヒー', romaji: 'koohii', vi: 'cà phê' }, // loanword, no kanji
    { id: '6', jp: '本（ほん）', romaji: 'hon', vi: 'sách' }, // already has kanji
  ];

  const result = autoMapKanjiForCards(cards, { style: 'ruby' });
  assert.equal(result.mappedCount, 4);
  assert.equal(result.mappedCards[0].jp, '魚（さかな）');
  assert.equal(result.mappedCards[1].jp, '肉（にく）');
  assert.equal(result.mappedCards[2].jp, '卵（たまご）');
  assert.equal(result.mappedCards[3].jp, '水（みず）');
  assert.equal(result.mappedCards[4].jp, 'コーヒー'); // unchanged
  assert.equal(result.mappedCards[5].jp, '本（ほん）'); // unchanged
});

test('getTestJapaneseDisplay handles ruby, kanji-only, and kana-only test modes', () => {
  assert.equal(getTestJapaneseDisplay('魚（さかな）', 'ruby'), '魚（さかな）');
  assert.equal(getTestJapaneseDisplay('魚（さかな）', 'kanji-only'), '魚');
  assert.equal(getTestJapaneseDisplay('魚（さかな）', 'kana-only'), 'さかな');

  assert.equal(getTestJapaneseDisplay('学生（がくせい）', 'kanji-only'), '学生');
  assert.equal(getTestJapaneseDisplay('学生（がくせい）', 'kana-only'), 'がくせい');

  assert.equal(getTestJapaneseDisplay('がくせい（学生）', 'kanji-only'), '学生');
  assert.equal(getTestJapaneseDisplay('がくせい（学生）', 'kana-only'), 'がくせい');

  assert.equal(getTestJapaneseDisplay('これ', 'kanji-only'), 'これ');
  assert.equal(getTestJapaneseDisplay('これ', 'kana-only'), 'これ');
  assert.equal(getTestJapaneseDisplay('これ', 'ruby'), 'これ');

  // Pure kanji fallback to dictionary reading for kana-only
  assert.equal(getTestJapaneseDisplay('魚', 'kanji-only'), '魚');
  assert.equal(getTestJapaneseDisplay('魚', 'kana-only'), 'さかな');
});

test('resolveCardKanjiDetails resolves both existing kanji and dynamic suggestions', () => {
  // Existing Kanji on card
  const r1 = resolveCardKanjiDetails({ jp: '父（ちち）', vi: 'bố (của mình)' });
  assert.equal(r1.kanji, '父');
  assert.equal(r1.reading, 'ちち');
  assert.equal(r1.isFromCard, true);
  assert.equal(r1.isSuggested, false);
  assert.equal(r1.hasKanji, true);

  // Pure Kana matching dictionary (e.g. ちち from A1 Lesson 4)
  const r2 = resolveCardKanjiDetails({ jp: 'ちち', vi: 'bố (của mình)' });
  assert.equal(r2.kanji, '父');
  assert.equal(r2.reading, 'ちち');
  assert.equal(r2.isFromCard, false);
  assert.equal(r2.isSuggested, true);
  assert.equal(r2.hasKanji, true);

  // Pure Kana without known Kanji
  const r3 = resolveCardKanjiDetails({ jp: 'これ', vi: 'cái này' });
  assert.equal(r3.kanji, '');
  assert.equal(r3.reading, 'これ');
  assert.equal(r3.hasKanji, false);
  assert.equal(r3.isSuggested, false);

  // Pure Kana that must NOT be morphed into another word (e.g. おくれます must NOT become 遅い)
  const r4 = resolveCardKanjiDetails({ jp: 'おくれます', vi: 'chậm / muộn', romaji: 'okuremasu' });
  assert.equal(r4.kanji, '');
  assert.equal(r4.reading, 'おくれます');
  assert.equal(r4.hasKanji, false);
  assert.equal(r4.isSuggested, false);
  assert.equal(getTestJapaneseDisplay({ jp: 'おくれます', vi: 'chậm / muộn' }, 'ruby'), 'おくれます');
  assert.equal(getTestJapaneseDisplay({ jp: 'おくれます', vi: 'chậm / muộn' }, 'kanji-only'), 'おくれます');
  assert.equal(getTestJapaneseDisplay({ jp: 'おくれます', vi: 'chậm / muộn' }, 'kana-only'), 'おくれます');
});


