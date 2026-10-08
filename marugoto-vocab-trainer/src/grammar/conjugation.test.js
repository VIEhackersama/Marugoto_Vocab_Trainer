import test from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, GROUPS } from './conjugation.js';

test('ichidan keeps the stem for all tense and politeness combinations', () => {
  assert.deepEqual(conjugate('ichidan', '食べる').forms, ['食べる', '食べない', '食べた', '食べなかった']);
  assert.deepEqual(conjugate('ichidan', '見る', true).forms, ['見ます', '見ません', '見ました', '見ませんでした']);
  assert.equal(conjugate('ichidan', '起きる').te, '起きて');
});
test('all nine godan endings follow their sound changes', () => {
  const cases = [
    ['買う', '買わない', '買います', '買って', '買った'],
    ['待つ', '待たない', '待ちます', '待って', '待った'],
    ['帰る', '帰らない', '帰ります', '帰って', '帰った'],
    ['読む', '読まない', '読みます', '読んで', '読んだ'],
    ['遊ぶ', '遊ばない', '遊びます', '遊んで', '遊んだ'],
    ['死ぬ', '死なない', '死にます', '死んで', '死んだ'],
    ['書く', '書かない', '書きます', '書いて', '書いた'],
    ['泳ぐ', '泳がない', '泳ぎます', '泳いで', '泳いだ'],
    ['話す', '話さない', '話します', '話して', '話した'],
  ];
  for (const [word, negative, masu, te, past] of cases) {
    const plain = conjugate('godan', word);
    assert.deepEqual(plain.forms, [word, negative, past, negative.slice(0, -1) + 'かった']);
    assert.equal(plain.te, te);
    assert.equal(conjugate('godan', word, true).forms[0], masu);
  }
});
test('行く and ある retain their exceptions', () => {
  assert.deepEqual(conjugate('godan', '行く').forms, ['行く', '行かない', '行った', '行かなかった']);
  assert.equal(conjugate('godan', '行く').te, '行って');
  assert.deepEqual(conjugate('godan', 'ある').forms, ['ある', 'ない', 'あった', 'なかった']);
  assert.deepEqual(conjugate('godan', 'ある', true).forms, ['あります', 'ありません', 'ありました', 'ありませんでした']);
});
test('i adjective tense precedes です, including the いい exception', () => {
  assert.deepEqual(conjugate('i-adj', '高い', true).forms, ['高いです', '高くないです', '高かったです', '高くなかったです']);
  assert.deepEqual(conjugate('i-adj', 'いい').forms, ['いい', 'よくない', 'よかった', 'よくなかった']);
  assert.equal(conjugate('i-adj', 'いい').te, 'よくて');
});
test('na adjectives use the copula and never add な before です', () => {
  assert.deepEqual(conjugate('na-adj', '静か').forms, ['静かだ', '静かじゃない', '静かだった', '静かじゃなかった']);
  assert.deepEqual(conjugate('na-adj', 'きれい', true).forms, ['きれいです', 'きれいじゃありません', 'きれいでした', 'きれいじゃありませんでした']);
  assert.equal(conjugate('na-adj', '元気').te, '元気で');
});
test('every selectable example has four nonempty forms in both registers', () => {
  for (const group of GROUPS) for (const [word] of group.examples) for (const polite of [true, false]) {
    const result = conjugate(group.id, word, polite);
    assert.equal(result.forms.length, 4);
    assert.ok(result.forms.every(Boolean));
    assert.equal(result.rules.length, 4);
    assert.ok(result.te);
  }
});

test('nouns change the copula while the noun stays intact', () => {
  assert.deepEqual(conjugate('noun', '学生').forms, ['学生だ', '学生じゃない', '学生だった', '学生じゃなかった']);
  assert.deepEqual(conjugate('noun', '学生', true).forms, ['学生です', '学生じゃありません', '学生でした', '学生じゃありませんでした']);
  assert.equal(conjugate('noun', '学生').te, '学生で');
});

test('する compounds and 来る keep the correct readings and negatives', () => {
  assert.deepEqual(conjugate('irregular', '勉強する').forms, ['勉強する', '勉強しない', '勉強した', '勉強しなかった']);
  assert.deepEqual(conjugate('irregular', 'する', true).forms, ['します', 'しません', 'しました', 'しませんでした']);
  assert.deepEqual(conjugate('irregular', '来る').forms, ['来る', '来ない', '来た', '来なかった']);
  assert.deepEqual(conjugate('irregular', 'くる').forms, ['くる', 'こない', 'きた', 'こなかった']);
  assert.deepEqual(conjugate('irregular', 'くる', true).forms, ['きます', 'きません', 'きました', 'きませんでした']);
  assert.equal(conjugate('irregular', '来る').te, '来て');
  assert.equal(conjugate('irregular', 'くる').te, 'きて');
});

test('every example can display kana forms, including the 行く sound exception', () => {
  for (const group of GROUPS) for (const [, reading] of group.examples) {
    assert.equal(conjugate(group.id, reading).forms.length, 4);
    assert.equal(conjugate(group.id, reading, true).forms.length, 4);
  }
  assert.equal(conjugate('godan', 'いく').forms[2], 'いった');
  assert.equal(conjugate('godan', 'いく').te, 'いって');
});
