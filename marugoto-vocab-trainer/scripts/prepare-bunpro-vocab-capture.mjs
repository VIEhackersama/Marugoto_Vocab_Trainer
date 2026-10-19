import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/prepare-bunpro-vocab-capture.mjs <capture.json>');
const capture = JSON.parse(readFileSync(input, 'utf8'));
const level = capture.scope === 'N4_VOCAB_ALL' ? 'N4' : 'N5';
const expected = level === 'N4' ? [1095, 8800] : [1100, 11205];
if (capture.version !== 1 || !capture.purpose?.startsWith('bunpro-source-capture') || capture.entries?.length !== expected[0]) throw new Error(`Expected the completed ${level} vocab capture.`);
const entries = capture.entries.map(entry => {
  const r = entry.result;
  if (entry.kind !== 'VOCAB' || entry.status !== 'CAPTURED' || !r?.examples) throw new Error(`Incomplete entry: ${entry.title}`);
  const { title, reading, meaning, dictionaryDefinition, examples, exampleCount, completeness, capturedAt, issues } = r;
  // Retain the two HTML fragments needed for structured definitions and exact ruby placement.
  // Drop page wrappers, duplicate details, screenshots and worker diagnostics.
  return { kind: entry.kind, level, lesson: entry.lesson, title: entry.title, sourceUrl: entry.sourceUrl, status: entry.status, exampleCount: entry.exampleCount,
    result: { title, reading, meaning, dictionaryDefinition, sections: r.sections.filter(s => ['dictionary-definition', 'examples'].includes(s.name)).map(({ name, html }) => ({ name, html })),
      examples, exampleCount, completeness, capturedAt, issues } };
});
const total = entries.reduce((sum, e) => sum + e.result.examples.length, 0);
if (total !== expected[1] || capture.counts.examples !== total) throw new Error(`Expected ${expected[1]} examples, got ${total}`);
const output = { version: capture.version, purpose: capture.purpose, scope: `${level}_VOCAB_ALL`, runId: capture.runId, counts: capture.counts, entries };
const target = resolve(`backend/src/main/resources/bunpro/${level.toLowerCase()}-vocab-capture.json`);
writeFileSync(target, JSON.stringify(output), 'utf8');
console.log(`Saved ${entries.length} words / ${total} examples to ${target}`);
