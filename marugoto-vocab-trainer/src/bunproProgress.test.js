import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgress, progressCsv, stageLabel, progressLabel } from './bunproProgress.js';

test('exact labels cover all twelve levels and preserve unknown legacy levels', () => {
  assert.deepEqual(Array.from({length:12},(_,i)=>stageLabel(i+1)), ['Beginner 1','Beginner 2','Beginner 3','Adept 1','Adept 2','Adept 3','Seasoned 1','Seasoned 2','Seasoned 3','Expert 1','Expert 2','Master']);
  assert.equal(stageLabel(0), 'Beginner 0');
  assert.equal(progressLabel({tier:'BEGINNER',stage:0}), 'Beginner 0');
  assert.equal(parseProgress('[{"kind":"VOCAB","entryId":"a","stage":0}]')[0].stage,0);
  assert.match(progressLabel({tier:'ADEPT'}), /chưa xác định/);
  assert.equal(progressLabel({tier:'ADEPT',stage:5}), 'Adept 2');
});
test('CSV round trip preserves quotes, commas, line breaks, kana and exact dates', () => {
  const rows=[{kind:'VOCAB',entryId:'a',sourceUrl:'https://bunpro.jp/vocabs/私',stage:5,dueAt:'2026-10-20T09:00:00+07:00',title:'私,"a"\nsecond line',reading:'わたし'}];
  assert.deepEqual(parseProgress('\uFEFF'+progressCsv(rows)),rows);
  assert.deepEqual(parseProgress(JSON.stringify({rows})),rows);
  const tsv=parseProgress('kind\tsourceUrl\tstage\tdueAt\r\nvocab\thttps://bunpro.jp/vocabs/私\t3\t');
  assert.equal(tsv[0].stage,3); assert.equal(tsv[0].dueAt,null); assert.equal(tsv[0].kind,'VOCAB');
});
test('bad shapes, malformed quoting and timezone-free dates cannot silently import', () => {
  for(const text of ['', '{}', '[null]', 'kind,stage\nVOCAB,3', 'kind,entryId,stage\nVOCAB,"bad,3', 'kind,entryId,stage\nVOCAB,x,3,extra', '[{"stage":1.5}]', '[{"stage":2,"dueAt":"2026-10-20T09:00:00"}]'])
    assert.throws(()=>parseProgress(text),undefined,text);
  assert.equal(parseProgress('[{"kind":"VOCAB","entryId":"a","stage":null}]')[0].stage,null);
});
