import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../backend/src/main/resources/bunpro/', import.meta.url);
const vocab = JSON.parse(await readFile(new URL('n5-vocab-source.json', root), 'utf8'));
const grammar = JSON.parse(await readFile(new URL('n5-grammar-source.json', root), 'utf8'));
const translations = (await readFile(new URL('./bunpro-vocab-vi.txt', import.meta.url), 'utf8')).trim().split(/\r?\n/);
const lessons = new Map();
const canonical = value => { const url = new URL(value); return `${url.origin}${url.pathname}`; };
const stableId = (kind, url) => `bunpro-${kind.toLowerCase()}-${createHash('sha256').update(canonical(url)).digest('hex').slice(0, 24)}`;
const words = [...vocab.entries].sort((a, b) => a.lesson - b.lesson);
if (words.length !== 1100 || translations.length !== words.length || grammar.entries.length !== 132) throw new Error('Source/translation inventory does not match N5: 1100 / 132.');

const entries = words.map((word, i) => {
  const position = (lessons.get(word.lesson) || 0) + 1;
  lessons.set(word.lesson, position);
  return { id: stableId('VOCAB', word.url), kind: 'VOCAB', level: 'N5', lesson: word.lesson, position,
    sourceUrl: canonical(word.url), content: {
      title: word.spelling, reading: word.paragraphs.length > 1 ? word.paragraphs[0] : word.spelling,
      romaji: '', meaningEn: word.paragraphs.at(-1), meaningVi: translations[i], status: 'VERIFIED',
      structure: '', explanationVi: '', conjugationGroup: null, sentences: [],
    } };
});
if ([...lessons.values()].some(n => n !== 50) || lessons.size !== 22) throw new Error('Every vocabulary lesson must have 50 entries.');

const authored = (await readFile(new URL('./bunpro-grammar-vi.tsv', import.meta.url), 'utf8')).trim().split(/\r?\n/).map(line => line.split('|'));
if (authored.length !== 132 || authored.some(row => row.length !== 9)) throw new Error('Grammar source must have 132 rows, each with 9 fields.');
lessons.clear();
for (let i = 0; i < grammar.entries.length; i++) {
  const item = grammar.entries[i];
  const [index, meaningVi, structure, explanationVi, prompt, answerText, reading, translationVi, conjugationGroup] = authored[i];
  if (Number(index) !== i + 1) throw new Error(`Grammar order mismatch at ${i + 1}.`);
  const answers = answerText.split('~');
  if (prompt.split('{{blank}}').length !== 2 || answers.some(a => !a.trim())) throw new Error(`Invalid cloze at ${i + 1}.`);
  const id = stableId('GRAMMAR', item.url);
  const position = (lessons.get(item.lesson) || 0) + 1;
  lessons.set(item.lesson, position);
  entries.push({ id, kind: 'GRAMMAR', level: 'N5', lesson: item.lesson, position, sourceUrl: canonical(item.url), content: {
    title: item.title, reading: '', romaji: '', meaningEn: item.paragraphs[0], meaningVi, status: 'VERIFIED',
    structure, explanationVi, conjugationGroup, sentences: [{ id: `${id}-example-1`, prompt, answers,
      sentence: prompt.replace('{{blank}}', answers[0]), reading, translationVi, explanationVi, status: 'VERIFIED' }],
  } });
}
if (new Set(entries.map(e => e.id)).size !== entries.length || new Set(entries.map(e => e.sourceUrl)).size !== entries.length) throw new Error('Duplicate source identity.');
if (entries.some(e => !e.content.title?.trim() || !e.content.meaningEn?.trim() || !e.content.meaningVi?.trim())) throw new Error('Missing required content.');
const snapshot = { version: 1, snapshotVersion: 'bunpro-n5-2026-10-10-vi-1', source: 'https://bunpro.jp',
  capturedAt: vocab.capturedAt, expectedVocab: 1100, expectedGrammar: 132, entries };
await writeFile(new URL('n5.json', root), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Built ${snapshot.expectedVocab} vocabulary entries, ${snapshot.expectedGrammar} grammar patterns and 132 cloze sentences; 0 missing translations/exercises.`);
