import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVocab, validIntervals } from './bunproVocab.js';
import { readFileSync } from 'node:fs';

test('vocab filters combine multiple POS tags, manual tiers, due state and accentless search', () => {
  const entries = [
    { id: 'ie', lesson: 1, tier: null, learningStatus: 'NEW', completeness: 'NEEDS_REVIEW', partsOfSpeech: ['NOUN'], content: { title: '家', reading: 'いえ', meaningVi: 'ngôi nhà', status: 'VERIFIED' } },
    { id: 'kaeru', lesson: 2, tier: 'MASTER', learningStatus: 'DUE', completeness: 'REVIEWED', partsOfSpeech: ['GODAN', 'INTRANSITIVE'], content: { title: '帰る', reading: 'かえる', meaningVi: 'trở về', status: 'VERIFIED' } },
  ];
  assert.deepEqual(filterVocab(entries, { search: 'ngoi nha', tier: 'NEW' }).map(e => e.id), ['ie']);
  assert.deepEqual(filterVocab(entries, { pos: 'INTRANSITIVE', lesson: '2', tier: 'MASTER', state: 'DUE' }).map(e => e.id), ['kaeru']);
  assert.deepEqual(filterVocab(entries, { state: 'incomplete' }).map(e => e.id), ['ie']);
  assert.equal(filterVocab(entries, { pos: 'ICHIDAN' }).length, 0);
});
test('interval controls require five positive increasing whole days', () => {
  assert.equal(validIntervals([1, 3, 7, 14, 30]), true);
  for (const values of [[0, 3, 7, 14, 30], [1, 3, 3, 14, 30], [1, 3.5, 7, 14, 30], [1, 3, 7], [1, 3, 7, 14, 999999]]) assert.equal(validIntervals(values), false);
});
test('bundled capture retains the user source inventory, original labels and every example', () => {
  const capture = JSON.parse(readFileSync(new URL('../backend/src/main/resources/bunpro/n5-vocab-capture.json', import.meta.url), 'utf8'));
  assert.equal(capture.entries.length, 1100);
  assert.equal(capture.entries.reduce((count, e) => count + e.result.examples.length, 0), 11205);
  assert.equal(new Set(capture.entries.map(e => new URL(e.sourceUrl).pathname)).size, 1100);
  for (const entry of capture.entries) {
    assert.equal(entry.result.completeness, 'NEEDS_REVIEW');
    assert.equal(entry.exampleCount, entry.result.examples.length);
    assert.equal(entry.result.examples.every(ex => ex.sentence && ex.translation), true);
  }
});
