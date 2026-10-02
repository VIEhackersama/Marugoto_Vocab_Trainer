import test from 'node:test';
import assert from 'node:assert/strict';
import {
  romajiToHiragana,
  normalizeJp,
  normalizeVi,
  getAcceptableJapaneseAnswers,
  checkTypedAnswer
} from './japaneseInput.js';

test('romajiToHiragana converts basic romaji to hiragana', () => {
  assert.equal(romajiToHiragana('watashi'), 'わたし');
  assert.equal(romajiToHiragana('arigatou'), 'ありがとう');
  assert.equal(romajiToHiragana('ohayou'), 'おはよう');
  assert.equal(romajiToHiragana('gakusei'), 'がくせい');
  assert.equal(romajiToHiragana('nihon', { isFinal: true }), 'にほん');
  assert.equal(romajiToHiragana('sensei'), 'せんせい');
});

test('romajiToHiragana handles digraphs and sokuon', () => {
  assert.equal(romajiToHiragana('kyoto'), 'きょと');
  assert.equal(romajiToHiragana('shinkansen', { isFinal: true }), 'しんかんせん');
  assert.equal(romajiToHiragana('chotto'), 'ちょっと');
  assert.equal(romajiToHiragana('matcha'), 'まっちゃ');
  assert.equal(romajiToHiragana('gakkou'), 'がっこう');
  assert.equal(romajiToHiragana('zasshi'), 'ざっし');
});

test('romajiToHiragana preserves existing kanji and kana', () => {
  assert.equal(romajiToHiragana('日本 (nihon)', { isFinal: true }), '日本 (にほん)');
  assert.equal(romajiToHiragana('ありがとうgozaimasu'), 'ありがとうございます');
});

test('getAcceptableJapaneseAnswers gathers all valid representations', () => {
  const card = {
    jp: '学生（がくせい）',
    romaji: 'gakusei',
    vi: 'học sinh, sinh viên'
  };
  const answers = getAcceptableJapaneseAnswers(card);
  assert.ok(answers.includes('学生（がくせい）'));
  assert.ok(answers.includes('がくせい'));
  assert.ok(answers.includes('学生'));
  assert.ok(answers.includes('gakusei'));
});

test('checkTypedAnswer validates Japanese typed responses (exact, kana, kanji, romaji)', () => {
  const card = {
    jp: '学生（がくせい）',
    romaji: 'gakusei',
    vi: 'học sinh'
  };

  // Romaji typing
  assert.equal(checkTypedAnswer('gakusei', card, 'JP').isCorrect, true);
  assert.equal(checkTypedAnswer('GAKUSEI', card, 'JP').isCorrect, true);

  // Kana typing
  assert.equal(checkTypedAnswer('がくせい', card, 'JP').isCorrect, true);

  // Kanji typing
  assert.equal(checkTypedAnswer('学生', card, 'JP').isCorrect, true);

  // Full string typing
  assert.equal(checkTypedAnswer('学生（がくせい）', card, 'JP').isCorrect, true);

  // Wrong answer
  assert.equal(checkTypedAnswer('sensei', card, 'JP').isCorrect, false);
  assert.equal(checkTypedAnswer('ねこ', card, 'JP').isCorrect, false);
});

test('checkTypedAnswer validates Vietnamese typed responses', () => {
  const card = {
    jp: 'ともだち',
    romaji: 'tomodachi',
    vi: 'bạn bè / bạn thân'
  };

  assert.equal(checkTypedAnswer('bạn bè', card, 'VI').isCorrect, true);
  assert.equal(checkTypedAnswer('ban be', card, 'VI').isCorrect, true);
  assert.equal(checkTypedAnswer('bạn thân', card, 'VI').isCorrect, true);
  assert.equal(checkTypedAnswer('ban than', card, 'VI').isCorrect, true);
  assert.equal(checkTypedAnswer('thầy giáo', card, 'VI').isCorrect, false);
});
