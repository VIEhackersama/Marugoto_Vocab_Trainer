import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../backend/src/main/resources/bunpro/',import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file,root),'utf8'));
const canonical = url => { const u=new URL(url);return u.origin+u.pathname.replace(/[\[\]]/g,c=>encodeURIComponent(c)); };

test('N4 bundle covers both source inventories, all captured examples and original ruby',()=>{
  const snapshot=read('n4.json'),grammar=read('n4-grammar-source.json'),vocab=read('n4-vocab-source.json'),capture=read('n4-vocab-capture.json');
  assert.equal(snapshot.expectedGrammar,185);assert.equal(snapshot.expectedVocab,1095);
  assert.equal(snapshot.entries.length,1280);
  assert.equal(new Set(snapshot.entries.map(e=>e.id)).size,1280);
  assert.equal(new Set(snapshot.entries.map(e=>e.sourceUrl)).size,1280);
  for(const [kind,source] of [['GRAMMAR',grammar],['VOCAB',vocab]]) {
    const entries=snapshot.entries.filter(e=>e.kind===kind);
    assert.deepEqual(entries.map(e=>e.sourceUrl),source.entries.map(e=>canonical(e.url)));
    const positions=new Map();
    for(const entry of entries) {
      const position=(positions.get(entry.lesson)||0)+1;positions.set(entry.lesson,position);
      assert.equal(entry.position,position);assert.equal(entry.level,'N4');
      assert.equal(entry.content.status,'DRAFT');assert.equal(entry.content.meaningVi,'');
      assert.deepEqual(entry.content.sentences,[]);
      if(kind==='GRAMMAR') {
        assert.ok(entry.content.structure);assert.ok(entry.content.grammarSource.explanationEn);
        assert.equal(entry.content.grammarSource.completeness,'NEEDS_REVIEW');
        const examples=entry.content.grammarSource.examples;
        assert.ok(examples.length);assert.equal(new Set(examples.map(e=>e.id)).size,examples.length);
        for(const ex of examples) { assert.ok(ex.translationEn);assert.equal(ex.tokens.map(t=>t.text).join(''),ex.sentence); }
      }
    }
    assert.equal(positions.size,kind==='GRAMMAR'?10:22);
  }
  assert.equal(capture.scope,'N4_VOCAB_ALL');assert.equal(capture.entries.length,1095);
  assert.equal(capture.entries.reduce((n,e)=>n+e.result.examples.length,0),8800);
});
