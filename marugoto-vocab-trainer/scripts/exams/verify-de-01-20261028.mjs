import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createExamHarness } from './verificationHarness.mjs';

const webPort = Number(process.env.EXAM_VERIFY_WEB_PORT || 15174);
const harness = await createExamHarness({ prefix: 'exam-de01-', apiPort: Number(process.env.EXAM_VERIFY_API_PORT || 18081), webPort });
const { root, backend, output, apiBase, webBase, java, javaArgs, errors, start, ready, api } = harness;
let browser;
const documentPath = path.join(root, 'public/exams/de-01-phan-tich-2026-10-28.json');
const document = JSON.parse(await readFile(documentPath, 'utf8'));
const questions = document.sections.flatMap(s => s.questions);
assert.equal(questions.length, 55);
assert.equal(new Set(questions.map(q => q.id)).size, 55);
const plain = value => typeof value === 'string' ? value : value.map(t => t.text).join('');
assert.equal(new Set(questions.map(q => plain(q.prompt))).size, 55);
assert.ok(!JSON.stringify(document).includes('[['));

try {
  console.log(`Verifying real exam in an isolated database: ${output}`);
  const javaProcess = start(java, javaArgs, 'backend.log', { cwd: backend });
  const vite = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--configLoader', 'runner'], 'frontend.log');
  await Promise.all([ready(apiBase + '/api/exams', javaProcess), ready(webBase, vite)]);
  assert.equal((await api('/api/exams')).length, 0);
  const preview = await api('/api/exams/preview', document); assert.equal(preview.questionCount, 55); assert.equal(preview.automaticCount, 50); assert.equal(preview.essayCount, 5); assert.equal(preview.maxScore, 100);
  assert.equal((await api('/api/exams')).length, 0);
  const imported = await api('/api/exams/import', document); assert.equal(imported.version, 1);
  const duplicate = await api('/api/exams/import', document); assert.equal(duplicate.id, imported.id); assert.equal(duplicate.reused, true);
  let attempt = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  assert.ok(!/correctOptionId|acceptedAnswers|modelAnswer|explanation/.test(JSON.stringify(attempt.document)));
  const perfect = Object.fromEntries(questions.map(q => [q.id, q.type === 'single_choice' ? q.correctOptionId : q.type === 'fill_blank' ? Object.fromEntries(q.blanks.map(b => [b.id, b.acceptedAnswers[0]])) : 'Bài phân tích thử nghiệm để kiểm tra lưu trữ.']));
  const submitted = await api(`/api/exam-attempts/${attempt.id}/submit`, { revision: attempt.revision, answers: perfect, flagged: [] });
  assert.equal(submitted.metrics.score, 100); assert.equal(submitted.metrics.maxScore, 100); assert.equal(submitted.metrics.correctPercent, 100); assert.equal(submitted.metrics.answeredEssays, 5);
  assert.equal(Object.keys(submitted.results).length, 55);
  for (const q of questions.filter(q => q.type === 'essay')) assert.equal(submitted.results[q.id].kind, 'REFERENCE');
  // Every explicitly allowed variant, including kana/kanji and time formats,
  // is checked against the backend grader, rather than a second JS grader.
  let variantsChecked = 0;
  for (let index = 1; index < Math.max(...questions.flatMap(q => (q.blanks || []).map(b => b.acceptedAnswers.length))); index++) {
    const varied = structuredClone(perfect);
    for (const q of questions.filter(q => q.type === 'fill_blank')) for (const blank of q.blanks) {
      if (index < blank.acceptedAnswers.length) { varied[q.id][blank.id] = blank.acceptedAnswers[index]; variantsChecked++; }
    }
    const a = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
    assert.equal((await api(`/api/exam-attempts/${a.id}/submit`, { revision: a.revision, answers: varied })).metrics.score, 100);
  }
  const empty = await api(`/api/exams/${imported.id}/attempts`, { feedbackMode: 'on_submit' });
  const emptyResult = await api(`/api/exam-attempts/${empty.id}/submit`, { revision: empty.revision, answers: {} });
  assert.equal(emptyResult.metrics.score, 0); assert.equal(emptyResult.metrics.maxScore, 100); assert.equal(emptyResult.metrics.answeredEssays, 0);

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
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(webBase); await page.getByRole('button', { name: 'Bài kiểm tra', exact: true }).click();
  const scope = page.locator('.exam-workspace'); await scope.getByRole('button', { name: 'Nhập JSON', exact: true }).click();
  await scope.getByLabel('Chọn file đề JSON').setInputFiles(documentPath); await scope.getByRole('button', { name: 'Kiểm tra JSON', exact: true }).click();
  await scope.getByText('JSON hợp lệ', { exact: true }).waitFor();
  assert.ok((await scope.locator('.exam-import-preview').innerText()).includes('55 câu'));
  await page.screenshot({ path: path.join(output, 'import-preview.png'), fullPage: true });
  await scope.getByRole('button', { name: 'Lưu đề vào thư viện' }).click();
  await scope.getByRole('button', { name: 'Bắt đầu làm bài' }).click(); await scope.locator('.exam-question-map button').nth(54).waitFor();
  assert.equal(await scope.locator('.exam-question-map button').count(), 55);
  await scope.locator('.exam-display summary').click(); await scope.getByLabel('Hiện furigana').check();
  await scope.locator('.exam-question-map button').nth(40).click();
  assert.ok(await scope.locator('.exam-passage ruby rt').count() > 0); assert.equal(await scope.locator('.exam-feedback').count(), 0);
  await page.screenshot({ path: path.join(output, 'reading-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'reading-mobile.png'), fullPage: true });
  await scope.locator('.exam-question-map button').nth(50).click(); await scope.getByRole('textbox', { name: 'Bài viết câu 51' }).waitFor();
  assert.equal(await scope.locator('.exam-feedback').count(), 0);
  await scope.getByRole('button', { name: 'Nộp bài', exact: true }).click(); await scope.getByRole('button', { name: 'Xác nhận nộp bài' }).click();
  await scope.locator('.exam-feedback.reference').waitFor(); assert.ok((await scope.locator('.exam-feedback').innerText()).includes('Checklist'));
  await page.screenshot({ path: path.join(output, 'analysis-reference-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const result = { passed: true, documentPath, output, questions: 55, automaticQuestions: 50, essays: 5, maxScore: 100, fullKeyScore: submitted.metrics.score, emptyScore: emptyResult.metrics.score, additionalAcceptedVariantsChecked: variantsChecked, checks: ['backend contract', 'read-only preview', 'idempotent import', 'hidden keys before submit', 'all correct answers', 'all declared fill variants', 'empty submission', 'essay exclusion from score', 'actual file upload', '55-question navigation', 'furigana', 'mobile overflow', 'reference/checklist reveal after submission'], limitation: 'Technical verification and author self-review; no independent teacher review.' };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  // Share reproducible evidence without publishing the local user's absolute paths.
  const sharedResult = { ...result, documentPath: path.relative(root, documentPath).replaceAll('\\', '/') };
  delete sharedResult.output;
  await writeFile(new URL('../../../artifacts/exams/de-01-20261028/verification.json', import.meta.url), JSON.stringify(sharedResult, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await harness.close();
}
