import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('downloadable sample has shared reading, furigana, all question types and valid answer references', async () => {
  const sample = JSON.parse(await readFile(new URL('../../public/exams/exam-template.json', import.meta.url), 'utf8'));
  const schema = JSON.parse(await readFile(new URL('../../public/exams/exam.schema.json', import.meta.url), 'utf8'));
  const prompt = await readFile(new URL('../../public/exams/generate-exam-prompt.txt', import.meta.url), 'utf8');
  assert.equal(sample.schemaVersion, schema.properties.schemaVersion.const);
  assert.ok(sample.sections.some(s => Array.isArray(s.passage) && s.passage.some(t => t.reading)));
  const questions = sample.sections.flatMap(s => s.questions);
  assert.deepEqual(new Set(questions.map(q => q.type)), new Set(['single_choice', 'fill_blank', 'essay']));
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  for (const q of questions) {
    assert.ok(q.explanation);
    if (q.type === 'single_choice') assert.ok(q.options.some(o => o.id === q.correctOptionId));
    if (q.type === 'essay') assert.ok(q.modelAnswer);
    if (q.type === 'fill_blank') {
      const text = typeof q.prompt === 'string' ? q.prompt : q.prompt.map(t => t.text).join('');
      assert.deepEqual([...text.matchAll(/\{\{([^}]+)}}/g)].map(m => m[1]).sort(), q.blanks.map(b => b.id).sort());
      q.blanks.forEach(b => assert.ok(b.acceptedAnswers.length));
    }
    assert.ok(prompt.includes(q.type));
  }
});
