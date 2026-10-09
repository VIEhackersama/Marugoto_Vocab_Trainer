import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalog, contentReady, sentencePrompt, isImeInput } from './bunpro.js';
import { filterAndSortDictionary } from './dictionary.js';
import { readFileSync } from 'node:fs';

test('catalog searches Vietnamese without accents, reading, and original meaning while preserving source identities', () => {
  const entries = [
    { id: 'ie', lesson: 1, learningStatus: 'NEW', content: { title: '家', reading: 'いえ', meaningVi: 'Ngôi nhà', meaningEn: 'house', status: 'VERIFIED' } },
    { id: 'uchi', lesson: 2, learningStatus: 'DUE', content: { title: '家', reading: 'うち', meaningVi: 'Nhà mình', meaningEn: 'home', status: 'VERIFIED' } },
  ];
  assert.equal(filterCatalog(entries, { search: 'ngoi nha' })[0].id, 'ie');
  assert.equal(filterCatalog(entries, { search: 'うち' })[0].id, 'uchi');
  assert.equal(filterCatalog(entries, { search: 'home', lesson: '2', state: 'DUE' }).length, 1);
  assert.equal(filterCatalog(entries, { search: '家' }).length, 2);
});
test('grammar enrollment requires verified content and a complete verified cloze', () => {
  const sentence = { id: '1', prompt: '学生{{blank}}。', answers: ['です'], sentence: '学生です。', reading: 'がくせいです。', translationVi: 'Là học sinh.', explanationVi: 'です sau danh từ.', status: 'VERIFIED' };
  const content = { meaningVi: 'là', structure: 'N + です', explanationVi: 'Lịch sự.', status: 'VERIFIED', sentences: [sentence] };
  assert.equal(Boolean(contentReady(content, 'GRAMMAR')), true);
  assert.equal(Boolean(contentReady({ ...content, sentences: [{ ...sentence, status: 'DRAFT' }] }, 'GRAMMAR')), false);
  assert.equal(Boolean(contentReady({ ...content, sentences: [{ ...sentence, reading: '' }] }, 'GRAMMAR')), false);
  assert.equal(contentReady({ ...content, sentences: [{ ...sentence, sentence: '先生です。' }] }, 'GRAMMAR'), false);
  assert.deepEqual(sentencePrompt(sentence.prompt), ['学生', '。']);
});

test('IME conversion Enter remains separate from revealing a grammar answer', () => {
  assert.equal(isImeInput({ isComposing: true, keyCode: 13 }), true);
  assert.equal(isImeInput({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeInput({ keyCode: 13 }, true), true);
  assert.equal(isImeInput({ isComposing: false, keyCode: 13 }), false);
});
test('dictionary filters all linked sources and never treats an unscheduled word as due', () => {
  const cards = [{ id: '1', deckId: 'custom', sources: [{ deckId: 'custom' }, { deckId: 'bunpro_n5' }], jp: '家（いえ）', vi: 'nhà', dueAt: null }];
  assert.equal(filterAndSortDictionary(cards, { deckFilter: 'bunpro_n5' }).length, 1);
  assert.equal(filterAndSortDictionary(cards, { statusFilter: 'due' }).length, 0);
});

test('bundled N5 snapshot covers the harvested source identities, lesson order and complete clozes', () => {
  const root = new URL('../backend/src/main/resources/bunpro/', import.meta.url);
  const snapshot = JSON.parse(readFileSync(new URL('n5.json', root), 'utf8'));
  const vocabs = snapshot.entries.filter(e => e.kind === 'VOCAB');
  const grammars = snapshot.entries.filter(e => e.kind === 'GRAMMAR');
  assert.equal(vocabs.length, 1100);
  assert.equal(grammars.length, 132);
  assert.equal(new Set(snapshot.entries.map(e => e.sourceUrl)).size, 1232);
  assert.equal(new Set(snapshot.entries.map(e => e.id)).size, 1232);
  for (const [name, items] of [['vocab', vocabs], ['grammar', grammars]]) {
    const source = JSON.parse(readFileSync(new URL(`n5-${name}-source.json`, root), 'utf8'));
    assert.deepEqual(new Set(items.map(e => e.sourceUrl)), new Set(source.entries.map(e => { const u = new URL(e.url); return u.origin + u.pathname; })));
    const byLesson = Map.groupBy(items, e => e.lesson);
    for (const lesson of byLesson.values()) {
      assert.deepEqual(lesson.map(e => e.position), lesson.map((_, i) => i + 1));
      if (name === 'vocab') assert.equal(lesson.length, 50);
    }
  }
  for (const entry of snapshot.entries) {
    assert.equal(entry.level, 'N5');
    assert.equal(Boolean(contentReady(entry.content, entry.kind)), true, entry.id);
    if (entry.kind === 'GRAMMAR') {
      for (const sentence of entry.content.sentences) {
        assert.equal(sentencePrompt(sentence.prompt).length, 2);
        assert.equal(sentence.prompt.replace('{{blank}}', sentence.answers[0]), sentence.sentence);
      }
    }
  }
  assert.deepEqual(vocabs.filter(e => e.content.title === '家').map(e => e.content.reading), ['いえ', 'うち']);
});
