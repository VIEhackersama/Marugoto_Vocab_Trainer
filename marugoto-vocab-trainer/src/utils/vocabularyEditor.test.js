import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kanaToRomaji,
  createVocabularyDraft,
  vocabularyDraftToInput,
  validateVocabularyDraft,
  findVocabularyConflict,
} from './vocabularyEditor.js';

test('romaji suggestion handles contracted sounds, gemination, syllabic n, and long vowels', () => {
  for (const [kana, romaji] of [
    ['ねこ', 'neko'],
    ['がっこう', 'gakkou'],
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha'],
    ['しんよう', "shin'you"],
    ['せんせい', 'sensei'],
    ['コーヒー', 'koohii'],
    ['パーティー', 'paatii'],
    ['ヴァイオリン', 'vaiorin'],
    ['ﾊﾟﾝ', 'pan'],
  ]) {
    assert.equal(kanaToRomaji(kana), romaji, kana);
  }
  assert.equal(kanaToRomaji('学校'), '');
  assert.equal(kanaToRomaji('ー'), '');
});

test('editor round trips legacy Kanji, Kana, Katakana and preserves manually edited romaji', () => {
  for (const card of [
    { jp: '食べます（たべます）', romaji: 'tabemasu', vi: 'ăn' },
    { jp: 'パン', romaji: 'pan', vi: 'bánh mì' },
    { jp: '学校', romaji: 'gakkō', vi: 'trường học' },
  ]) {
    assert.deepEqual(vocabularyDraftToInput(createVocabularyDraft(card)), card);
  }
  assert.deepEqual(
    vocabularyDraftToInput({
      spelling: '猫',
      reading: 'neko',
      romaji: 'neko',
      meaning: 'con mèo',
    }),
    { jp: '猫（ねこ）', romaji: 'neko', vi: 'con mèo' },
  );
});

test('validation requires a reading for new Kanji but permits repairing legacy cards without guessing', () => {
  const draft = {
    spelling: '学校',
    reading: '',
    romaji: 'gakkou',
    meaning: 'trường học',
  };
  assert.ok(validateVocabularyDraft(draft).reading);
  assert.deepEqual(
    validateVocabularyDraft(draft, { jp: '学校', vi: 'trường học' }),
    {},
  );
  assert.ok(validateVocabularyDraft({ ...draft, reading: '学校' }).reading);
  assert.ok(
    validateVocabularyDraft({ ...draft, reading: 'がっこう', meaning: ' ' })
      .meaning,
  );
});

test('duplicate feedback allows homophones and excludes the card being edited', () => {
  const bridge = {
    id: 'bridge',
    jp: '橋（はし）',
    vi: 'cây cầu',
    romaji: 'hashi',
  };
  const draft = {
    spelling: '箸',
    reading: 'はし',
    romaji: 'hashi',
    meaning: 'đôi đũa',
  };
  assert.equal(findVocabularyConflict(draft, [bridge]), null);
  assert.equal(
    findVocabularyConflict(createVocabularyDraft(bridge), [bridge])?.existing
      .id,
    'bridge',
  );
  assert.equal(
    findVocabularyConflict(createVocabularyDraft(bridge), [bridge], bridge),
    null,
  );
});
