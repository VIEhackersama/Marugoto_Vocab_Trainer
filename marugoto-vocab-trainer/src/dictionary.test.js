import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANA_ROWS,
  extractReading,
  getKanaRow,
  compareJapanese,
  filterAndSortDictionary,
  removeDiacritics,
  canonicalKanaKey,
  findDuplicates,
} from './dictionary.js';

test('getKanaRow maps kana, kanji with readings, and prefixes properly', () => {
  assert.equal(getKanaRow({ jp: 'あいさつ', romaji: 'aisatsu' }), 'あ行 (A)');
  assert.equal(getKanaRow({ jp: 'おちゃ', romaji: 'ocha' }), 'あ行 (A)');
  assert.equal(getKanaRow({ jp: 'がくせい', romaji: 'gakusei' }), 'か行 (Ka)');
  assert.equal(getKanaRow({ jp: '学生（がくせい）', romaji: 'gakusei' }), 'か行 (Ka)');
  assert.equal(getKanaRow({ jp: '～さい', romaji: 'sai' }), 'さ行 (Sa)');
  assert.equal(getKanaRow({ jp: 'ねこ', romaji: 'neko' }), 'な行 (Na)');
  assert.equal(getKanaRow({ jp: 'パン', romaji: 'pan' }), 'は行 (Ha)');
  assert.equal(getKanaRow({ jp: 'CD', romaji: 'CD' }), 'Khác');
  assert.equal(getKanaRow({ jp: '日本語', romaji: 'nihongo' }), 'な行 (Na)');
});

test('compareJapanese orders words in authentic Gojuon sequence', () => {
  const words = [
    { id: '1', jp: 'ねこ', romaji: 'neko' },
    { id: '2', jp: 'パン', romaji: 'pan' },
    { id: '3', jp: 'あいさつ', romaji: 'aisatsu' },
    { id: '4', jp: '～さい', romaji: 'sai' },
    { id: '5', jp: 'がくせい', romaji: 'gakusei' },
    { id: '6', jp: 'CD', romaji: 'CD' },
  ];

  words.sort(compareJapanese);

  const jps = words.map((w) => w.jp);
  assert.deepEqual(jps, ['あいさつ', 'がくせい', '～さい', 'ねこ', 'パン', 'CD']);
});

test('filterAndSortDictionary filters by Japanese, Romaji and Vietnamese with diacritics', () => {
  const cards = [
    { id: '1', jp: 'ねこ', romaji: 'neko', vi: 'con mèo', deckId: 'pdf1', dueAt: Date.now() - 1000, reviewCount: 1, wrongCount: 0 },
    { id: '2', jp: 'いぬ', romaji: 'inu', vi: 'con chó', deckId: 'custom', dueAt: Date.now() + 100000, reviewCount: 2, wrongCount: 1 },
    { id: '3', jp: 'くるま', romaji: 'kuruma', vi: 'xe hơi', deckId: 'pdf1', dueAt: Date.now() + 100000, reviewCount: 0, wrongCount: 0 },
  ];

  // Vietnamese without diacritic search
  const resViNoAccent = filterAndSortDictionary(cards, { searchQuery: 'meo' });
  assert.equal(resViNoAccent.length, 1);
  assert.equal(resViNoAccent[0].jp, 'ねこ');

  // Vietnamese with diacritic search
  const resViAccent = filterAndSortDictionary(cards, { searchQuery: 'chó' });
  assert.equal(resViAccent.length, 1);
  assert.equal(resViAccent[0].jp, 'いぬ');

  // Romaji search
  const resRomaji = filterAndSortDictionary(cards, { searchQuery: 'kuru' });
  assert.equal(resRomaji.length, 1);
  assert.equal(resRomaji[0].jp, 'くるま');

  // Japanese search
  const resJp = filterAndSortDictionary(cards, { searchQuery: 'いぬ' });
  assert.equal(resJp.length, 1);
  assert.equal(resJp[0].jp, 'いぬ');

  // Deck filter
  const resCustom = filterAndSortDictionary(cards, { deckFilter: 'custom' });
  assert.equal(resCustom.length, 1);
  assert.equal(resCustom[0].deckId, 'custom');

  // Due status filter
  const resDue = filterAndSortDictionary(cards, { statusFilter: 'due' });
  assert.equal(resDue.length, 1);
  assert.equal(resDue[0].jp, 'ねこ');

  // New status filter
  const resNew = filterAndSortDictionary(cards, { statusFilter: 'new' });
  assert.equal(resNew.length, 1);
  assert.equal(resNew[0].jp, 'くるま');
});

test('canonicalKanaKey normalizes punctuation, katakana to hiragana, and kanji readings', () => {
  assert.equal(canonicalKanaKey('～さい'), 'さい');
  assert.equal(canonicalKanaKey('~さい'), 'さい');
  assert.equal(canonicalKanaKey('学生（がくせい）'), 'がくせい');
  assert.equal(canonicalKanaKey('がくせい（学生）'), 'がくせい');
  assert.equal(canonicalKanaKey('パン'), 'ぱん');
  assert.equal(canonicalKanaKey('あいさつ '), 'あいさつ');
});

test('findDuplicates identifies duplicate words and separates unique words', () => {
  const existingInDb = [
    { id: '1', jp: 'あいさつ', vi: 'chào hỏi', deckTitle: 'Bài 1' },
    { id: '2', jp: '学生（がくせい）', vi: 'học sinh', deckTitle: 'Bài 1' },
    { id: '3', jp: '～さい', vi: 'tuổi', deckTitle: 'Custom' },
    { id: '4', jp: 'パン', vi: 'bánh mì', deckTitle: 'Bài 2' },
  ];

  const candidateBatch = [
    { jp: 'あいさつ', vi: 'lời chào' }, // Exact match
    { jp: 'がくせい', vi: 'sinh viên' }, // Kana match with 学生（がくせい）
    { jp: '~さい', vi: 'năm tuổi' }, // Punctuation variant
    { jp: 'ぱん', vi: 'bánh mì' }, // Katakana vs Hiragana
    { jp: 'ねこ', vi: 'con mèo' }, // New word!
    { jp: 'いぬ', vi: 'con chó' }, // New word!
  ];

  const result = findDuplicates(candidateBatch, existingInDb);
  assert.equal(result.hasDuplicates, true);
  assert.equal(result.duplicates.length, 4);
  assert.equal(result.uniqueCards.length, 2);
  assert.deepEqual(
    result.uniqueCards.map((c) => c.jp),
    ['ねこ', 'いぬ']
  );
  assert.equal(result.duplicates[0].candidate.jp, 'あいさつ');
  assert.equal(result.duplicates[1].candidate.jp, 'がくせい');
  assert.equal(result.duplicates[1].existing.deckTitle, 'Bài 1');
});

