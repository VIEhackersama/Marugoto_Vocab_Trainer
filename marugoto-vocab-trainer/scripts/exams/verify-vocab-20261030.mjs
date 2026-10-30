import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createExamHarness } from './verificationHarness.mjs';

const harness = await createExamHarness({ prefix: 'vocab-20261030-', apiPort: 18082, webPort: 15175 });
const { root, backend, output, apiBase, webBase, java, javaArgs, errors, start, ready, api, postman } = harness;
const documentPath = path.join(root, 'public/exams/de-tu-vung-ca-nhan-2026-10-30.json');
const document = JSON.parse(await readFile(documentPath, 'utf8'));
const coverage = JSON.parse(await readFile(new URL('../../../artifacts/exams/vocab-20261030/coverage.json', import.meta.url), 'utf8'));
const questions = document.sections.flatMap(section => section.questions);
assert.equal(questions.length, 80); assert.equal(coverage.uniqueTargets, 76);
assert.equal(questions.filter(q => q.type === 'single_choice').length, 60);
assert.equal(questions.filter(q => q.type === 'fill_blank').length, 20);
assert.ok(!Object.hasOwn(document, 'instructions') && document.sections.every(section => !Object.hasOwn(section, 'instructions')));
const positions = questions.filter(q => q.type === 'single_choice').reduce((result, q) => ({ ...result, [q.correctOptionId]: (result[q.correctOptionId] || 0) + 1 }), {});
assert.deepEqual(Object.values(positions).sort(), [15, 15, 15, 15]);
const source = JSON.parse(await readFile(process.argv[2], 'utf8'));
const vocab = source.filter(row => row.kind === 'VOCAB');
for (const target of coverage.coverage) {
  const row = vocab.find(row => row.entryId === target.entryId);
  assert.ok(row && row.stage === target.stage && row.title === target.target && row.reading === target.reading);
}
for (const row of vocab.filter(row => row.stage <= 3)) assert.ok(coverage.coverage.some(target => target.entryId === row.entryId));
const readingKanji = new Set(coverage.coverage.filter(row => row.skill.startsWith('reading_')).flatMap(row => [...row.target].filter(char => /\p{Script=Han}/u.test(char))));
function noHint(value) {
  if (Array.isArray(value)) value.forEach(noHint);
  else if (value && typeof value === 'object') {
    if (value.reading) assert.ok(![...value.text].some(char => readingKanji.has(char)), `Ruby discloses a tested reading: ${value.text}`);
    Object.values(value).forEach(noHint);
  }
}
document.sections.forEach(section => { if (section.passage) noHint(section.passage); section.questions.forEach(q => { noHint(q.prompt); q.options?.forEach(option => noHint(option.text)); }); });
let browser;
try {
  console.log(`Checking vocabulary exam with an isolated database: ${output}`);
  const server = start(java, javaArgs, 'backend.log', { cwd: backend });
  const vite = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15175', '--strictPort', '--configLoader', 'runner'], 'frontend.log');
  await Promise.all([ready(apiBase + '/api/exams', server), ready(webBase, vite)]);
  const preview = await api('/api/exams/preview', document);
  assert.equal(preview.questionCount, 80); assert.equal(preview.maxScore, 100); assert.equal(preview.essayCount, 0);
  assert.equal((await api('/api/exams')).length, 0);
  const imported = await api('/api/exams/import', document);
  assert.equal((await api('/api/exams/import', document)).id, imported.id);
  await postman(['GET', apiBase + '/api/exams'], 'vocab-20261030');
  const perfect = Object.fromEntries(questions.map(q => [q.id, q.type === 'single_choice' ? q.correctOptionId : Object.fromEntries(q.blanks.map(blank => [blank.id, blank.acceptedAnswers[0]]))]));
  let attempt = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  assert.ok(!/correctOptionId|acceptedAnswers|explanation/.test(JSON.stringify(attempt.document)));
  const full = await api(`/api/exam-attempts/${attempt.id}/submit`, { revision: attempt.revision, answers: perfect });
  assert.equal(full.metrics.score, 100); assert.equal(full.metrics.maxScore, 100); assert.equal(full.metrics.correctUnits, 80);
  attempt = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  assert.equal((await api(`/api/exam-attempts/${attempt.id}/submit`, { revision: attempt.revision, answers: {} })).metrics.score, 0);
  attempt = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  const variant = structuredClone(perfect); variant.q61.reading = '  あかるい  '; variant.q62.reading = 'ならう'; variant.q80.reading = 'でかける';
  assert.equal((await api(`/api/exam-attempts/${attempt.id}/submit`, { revision: attempt.revision, answers: variant })).metrics.score, 100);
  attempt = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  const wrong = structuredClone(perfect); wrong.q61.reading = 'あかる'; wrong.q72.reading = 'とりに';
  assert.equal((await api(`/api/exam-attempts/${attempt.id}/submit`, { revision: attempt.revision, answers: wrong })).metrics.score, 96);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.startsWith('/api/lifecycle/')) return route.fulfill({ json: { status: 'ok' } });
    const response = await route.fetch({ url: apiBase + url.pathname + url.search }); await route.fulfill({ response });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(webBase); await page.getByRole('button', { name: 'Bài kiểm tra', exact: true }).click();
  const scope = page.locator('.exam-workspace');
  await scope.getByRole('button', { name: 'Mở đề', exact: true }).click();
  await scope.getByRole('button', { name: 'Bắt đầu làm bài', exact: true }).click();
  await scope.locator('.exam-question-map button').nth(79).waitFor();
  assert.equal(await scope.locator('.exam-question-map button').count(), 80);
  await scope.locator('.exam-display summary').click(); await scope.getByLabel('Hiện furigana').check();
  await scope.locator('.exam-question-map button').nth(52).click(); await scope.locator('.exam-passage').waitFor();
  assert.equal(await scope.locator('.exam-section-heading p').count(), 0);
  assert.ok(await scope.locator('.exam-passage ruby rt').count() > 0);
  await page.screenshot({ path: path.join(output, 'reading-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'reading-mobile.png'), fullPage: true });
  await scope.locator('.exam-question-map button').nth(60).click();
  assert.equal(await scope.locator('.exam-prompt ruby').count(), 0);
  await scope.getByLabel('Câu 61, ô 1').fill('あかるい');
  await scope.getByRole('button', { name: 'Nộp bài', exact: true }).click(); await scope.getByRole('button', { name: 'Xác nhận nộp bài', exact: true }).click();
  await scope.getByLabel('Kết quả bài kiểm tra').waitFor();
  assert.ok((await scope.getByLabel('Kết quả bài kiểm tra').innerText()).includes('2 / 100'));
  await scope.locator('.exam-feedback.correct').waitFor();
  assert.deepEqual(errors, []);
  const result = { passed: true, examFile: 'public/exams/de-tu-vung-ca-nhan-2026-10-30.json', questions: 80, uniqueVocabularyTargets: 76, maxScore: 100, fullKeyScore: 100, emptyScore: 0, truncatedReadingScore: 96, postmanAssertions: 5, checks: ['exact VOCAB IDs/stages', 'all 47 lower-stage words', 'balanced answer positions', 'no reading hints in furigana', 'backend preview/import', 'idempotent import', 'hidden keys while working', 'real grader', 'mobile layout', '80-question navigation', 'reading input and result display'] };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(new URL('../../../artifacts/exams/vocab-20261030/verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, output }, null, 2));
} catch (error) {
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser?.close(); await harness.close(); }
