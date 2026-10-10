import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVocab } from './bunproVocab.js';

test('grammar catalog combines progress and lesson filters with structure and usage search', () => {
  const entries = [
    { id: 'da', lesson: 1, tier: 'EXPERT', learningStatus: 'LEARNING', completeness: 'REVIEWED', content: { title: 'だ', status: 'VERIFIED', meaningVi: 'là', structure: 'Danh từ + だ', explanationVi: 'Khẳng định thân mật' } },
    { id: 'desu', lesson: 2, tier: null, learningStatus: 'NEW', completeness: 'NEEDS_REVIEW', content: { title: 'です', status: 'DRAFT', meaningVi: 'là', structure: 'Danh từ + です', explanationVi: 'Cách nói lịch sự' } },
  ];
  assert.deepEqual(filterVocab(entries, { search: 'than mat', lesson: '1', tier: 'EXPERT' }).map(e => e.id), ['da']);
  assert.deepEqual(filterVocab(entries, { search: 'Danh tu + です', tier: 'NEW', state: 'incomplete' }).map(e => e.id), ['desu']);
  assert.deepEqual(filterVocab(entries, { lesson: '2', tier: 'EXPERT' }), []);
});
