// Run after backend tests (their Surefire report supplies the resolved classpath).
// Starts its own database/backend/frontend; never connects to the user's trainer.db.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { EXAM_FONTS } from '../src/exams/examSession.js';
import { createExamHarness, delay } from './exams/verificationHarness.mjs';

const webPort = Number(process.env.EXAM_VERIFY_WEB_PORT || 15173);
const harness = await createExamHarness({ prefix: 'exams-ui-', apiPort: Number(process.env.EXAM_VERIFY_API_PORT || 18080), webPort });
const { root, backend, output, apiBase, webBase, java, javaArgs, errors, start, ready, stop, api, postman } = harness;
let browser, javaProcess;

try {
  console.log(`Starting isolated exam verification: ${output}`);
  javaProcess = start(java, javaArgs, 'backend.log', { cwd: backend });
  const vite = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--configLoader', 'runner'], 'frontend.log');
  await Promise.all([ready(apiBase + '/api/exams', javaProcess), ready(webBase, vite)]);
  await postman(['POST', apiBase + '/api/exams/preview', '--header', 'Content-Type:application/json',
    '--body', await readFile(path.join(root, 'public/exams/exam-template.json'), 'utf8')], 'preview');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  // Keep UI verification deterministic/offline; exam fonts come from the OS.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  // Route app traffic to the isolated backend instead of the normal Vite proxy.
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.startsWith('/api/lifecycle/')) return route.fulfill({ json: { status: 'ok', activeTabs: 1 } });
    try { const response = await route.fetch({ url: apiBase + url.pathname + url.search }); await route.fulfill({ response }); }
    catch (error) { if (!context.__restarting) errors.push(error.message); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const scope = page.locator('.exam-workspace');
  const enter = async p => { await p.goto(webBase); await p.getByRole('button', { name: 'Bài kiểm tra', exact: true }).click(); await p.locator('.exam-heading').waitFor(); };
  const expectEventually = async fn => { for (let i = 0; i < 60; i++) { try { await fn(); return; } catch (error) { if (i === 59) throw error; await delay(100); } } };
  const question = async n => { await scope.locator('.exam-question-map button').nth(n - 1).click(); };
  const saved = async () => expectEventually(async () => assert.equal(await scope.locator('.exam-save').innerText(), 'Đã lưu'));
  const normalizeFamily = family => family.replace(/["'\s]/g, '').toLowerCase();
  const assertExamFonts = async (...selectors) => {
    const font = await scope.getByLabel('Font chữ tiếng Nhật').inputValue();
    for (const selector of selectors) {
      const families = await scope.locator(selector).evaluateAll(elements => elements.map(el => getComputedStyle(el).fontFamily));
      assert.ok(families.length, 'Missing font target: ' + selector);
      for (const family of families) assert.equal(normalizeFamily(family), normalizeFamily(EXAM_FONTS[font]), selector + ' must use ' + font);
    }
  };
  const postmanAttempt = (attemptId, name) => postman(['GET', apiBase + '/api/exam-attempts/' + attemptId], name);
  await enter(page);
  const navFont = await page.locator('.app-header').evaluate(el => getComputedStyle(el).fontFamily);
  await scope.getByRole('button', { name: 'Nhập JSON', exact: true }).click();
  await scope.getByLabel('Chọn file đề JSON').setInputFiles(path.join(root, 'public/exams/exam-template.json'));
  await expectEventually(async () => assert.equal(await scope.getByLabel('Nội dung đề JSON').inputValue(), await readFile(path.join(root, 'public/exams/exam-template.json'), 'utf8')));
  await scope.getByRole('button', { name: 'Kiểm tra JSON', exact: true }).click();
  await scope.getByText('JSON hợp lệ', { exact: true }).waitFor();
  await scope.getByRole('button', { name: 'Lưu đề vào thư viện' }).click();
  await scope.getByRole('button', { name: 'Bắt đầu làm bài' }).waitFor();
  await scope.locator('.exam-display summary').click();
  await scope.getByLabel('Font chữ tiếng Nhật').selectOption('Noto Serif JP');
  await scope.getByLabel('Cỡ chữ bài thi').focus(); await page.keyboard.press('End');
  await scope.getByLabel('Hiện furigana').check();
  assert.equal(await scope.locator('.exam-font-preview').evaluate(el => getComputedStyle(el).fontSize), '32px');
  assert.equal(await page.locator('.app-header').evaluate(el => getComputedStyle(el).fontFamily), navFont);
  await scope.getByLabel('Cỡ chữ bài thi').focus(); await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const startResponse = page.waitForResponse(r => /\/api\/exams\/[^/]+\/attempts$/.test(r.url()) && r.request().method() === 'POST');
  await scope.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  const first = await (await startResponse).json();
  assert.ok(!/correctOptionId|acceptedAnswers|modelAnswer|explanation/.test(JSON.stringify(first.document)));
  assert.ok(await scope.locator('.exam-question ruby rt').count() > 0);
  assert.equal(await scope.locator('.exam-section-heading p').count(), 0, 'Hide section coaching from existing exams too');
  assert.equal(await scope.getByText('Chọn đáp án phù hợp hoặc điền vào chỗ trống.', { exact: true }).count(), 0);
  for (const font of Object.keys(EXAM_FONTS)) {
    await scope.getByLabel('Font chữ tiếng Nhật').selectOption(font);
    await assertExamFonts('.exam-font-preview', '.exam-font-preview ruby', '.exam-prompt', '.exam-prompt ruby', '.exam-prompt rt', '.exam-options label > span:last-child');
    assert.equal(await page.locator('.app-header').evaluate(el => getComputedStyle(el).fontFamily), navFont);
  }
  await scope.getByLabel('Font chữ tiếng Nhật').selectOption('Noto Serif JP');
  await scope.getByRole('radio').nth(0).check();
  await question(2);
  const growingBlank = scope.getByLabel('Câu 2, ô 1');
  const emptyWidth = (await growingBlank.boundingBox()).width;
  await growingBlank.dispatchEvent('compositionstart');
  await growingBlank.fill('静かではありませんでした');
  await growingBlank.dispatchEvent('compositionend');
  assert.ok((await growingBlank.boundingBox()).width > emptyWidth + 50, 'Japanese answers must expand beyond the initial blank width');
  const fitsBlank = () => growingBlank.evaluate(el => ({ horizontal: el.scrollWidth <= el.clientWidth + 2, vertical: el.scrollHeight <= el.clientHeight + 2, height: el.clientHeight }));
  const singleLine = await fitsBlank(); assert.ok(singleLine.horizontal && singleLine.vertical);
  await page.setViewportSize({ width: 390, height: 844 });
  await scope.getByLabel('Cỡ chữ bài thi').focus(); await page.keyboard.press('End');
  await growingBlank.fill('静かではありませんでした。'.repeat(5));
  for (const font of ['MS Mincho', 'Yu Mincho', 'Noto Serif JP', 'Yu Gothic', 'Mặc định']) {
    await scope.getByLabel('Font chữ tiếng Nhật').selectOption(font);
    await assertExamFonts('.exam-prompt', '.exam-blank textarea', '.exam-blank-mirror');
    const wrapped = await fitsBlank();
    assert.ok(wrapped.horizontal && wrapped.vertical, `Long answers must remain fully visible with ${font}`);
    assert.ok(wrapped.height > singleLine.height * 2, 'Long mobile answers must wrap and grow vertically');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.screenshot({ path: path.join(output, 'mobile-growing-blank.png'), fullPage: true });
  await scope.getByLabel('Font chữ tiếng Nhật').selectOption('Noto Serif JP');
  await scope.getByLabel('Cỡ chữ bài thi').focus(); await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.setViewportSize({ width: 1366, height: 900 });
  await growingBlank.fill('で');
  assert.ok((await growingBlank.boundingBox()).width < emptyWidth + 20, 'Blank must shrink again after deleting text');
  await scope.getByLabel('Câu 2, ô 2').fill('へ');
  assert.equal(await scope.locator('.exam-review').count(), 0);
  await scope.getByRole('button', { name: 'Đánh dấu xem lại', exact: true }).click();
  await saved(); await page.screenshot({ path: path.join(output, 'desktop-fill.png'), fullPage: true });
  await question(3); assert.ok(await scope.locator('.exam-passage').isVisible());
  for (const font of Object.keys(EXAM_FONTS)) {
    await scope.getByLabel('Font chữ tiếng Nhật').selectOption(font);
    await assertExamFonts('.exam-passage .exam-paper', '.exam-passage ruby', '.exam-passage rt', '.exam-prompt', '.exam-options label > span:last-child');
  }
  await page.screenshot({ path: path.join(output, 'japanese-font-reading.png'), fullPage: true });
  await scope.getByLabel('Font chữ tiếng Nhật').selectOption('Noto Serif JP');
  await scope.getByRole('radio').nth(1).check();
  await question(4); await scope.getByLabel('Câu 4, ô 1').fill('バス');
  await question(5); await assertExamFonts('.exam-essay-label textarea'); const essay = scope.getByRole('textbox', { name: 'Bài viết câu 5' });
  await essay.dispatchEvent('compositionstart'); await essay.fill('私はアンです。学生です。ベトナム人です。'); await essay.dispatchEvent('compositionend');
  await page.route('**/api/exam-attempts/*/pause', route => route.fulfill({ status: 503, json: { error: 'Mất kết nối thử nghiệm' } }));
  await scope.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await scope.getByRole('alert').getByText(/Đồng hồ vẫn đang chạy/).waitFor();
  assert.equal((await api(`/api/exam-attempts/${first.id}`)).status, 'IN_PROGRESS');
  assert.equal(await essay.inputValue(), '私はアンです。学生です。ベトナム人です。');
  await page.unroute('**/api/exam-attempts/*/pause');
  const pausedResponse = page.waitForResponse(r => r.url().endsWith(`/api/exam-attempts/${first.id}/pause`) && r.status() === 200);
  await scope.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  const stored = await (await pausedResponse).json(); await scope.getByText('Đã tạm dừng', { exact: true }).waitFor();
  assert.equal(stored.status, 'PAUSED'); assert.equal(stored.currentQuestionId, 'q5'); assert.ok(stored.remainingMs > 0); assert.equal(stored.answers.q5, '私はアンです。学生です。ベトナム人です。'); assert.deepEqual(stored.flagged, ['q2']);
  assert.equal(await scope.locator('.exam-question').count(), 0);
  const frozenTimer = await scope.getByLabel('Thời gian còn lại').innerText(); await delay(1200); assert.equal(await scope.getByLabel('Thời gian còn lại').innerText(), frozenTimer);
  await postmanAttempt(first.id, 'pause');
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'mobile-paused.png'), fullPage: true }); await page.setViewportSize({ width: 1366, height: 900 });
  context.__restarting = true; await stop(javaProcess); javaProcess = start(java, javaArgs, 'backend-paused-restart.log', { cwd: backend });
  await ready(apiBase + '/api/exams', javaProcess); context.__restarting = false;
  const persistedPause = await api(`/api/exam-attempts/${first.id}`); assert.equal(persistedPause.status, 'PAUSED'); assert.equal(persistedPause.remainingMs, stored.remainingMs); assert.equal(persistedPause.currentQuestionId, 'q5');
  await page.reload(); await page.getByRole('button', { name: 'Bài kiểm tra', exact: true }).click();
  await scope.getByText('Đã tạm dừng', { exact: true }).waitFor(); assert.equal(await scope.getByLabel('Thời gian còn lại').innerText(), frozenTimer);
  const resumeResponse = page.waitForResponse(r => r.url().endsWith(`/api/exam-attempts/${first.id}/resume`) && r.status() === 200);
  await scope.getByRole('button', { name: 'Tiếp tục làm bài', exact: true }).click();
  const resumed = await (await resumeResponse).json(); assert.ok(Math.abs((resumed.deadlineAt - resumed.serverNow) - stored.remainingMs) < 1000);
  await scope.getByRole('textbox', { name: 'Bài viết câu 5' }).waitFor(); assert.equal(await scope.getByRole('textbox', { name: 'Bài viết câu 5' }).inputValue(), stored.answers.q5);
  assert.equal(await scope.locator('.exam-question-map button').nth(4).getAttribute('aria-current'), 'step');
  await postmanAttempt(first.id, 'resume');
  await scope.locator('.exam-display summary').click(); assert.equal(await scope.getByLabel('Font chữ tiếng Nhật').inputValue(), 'Noto Serif JP');
  assert.equal(await scope.locator('.exam-feedback').count(), 0);
  await scope.getByRole('button', { name: 'Nộp bài', exact: true }).click(); await scope.getByRole('button', { name: 'Xác nhận nộp bài' }).click();
  await scope.getByLabel('Kết quả bài kiểm tra').waitFor(); assert.ok((await scope.getByLabel('Kết quả bài kiểm tra').innerText()).includes('6 / 6'));
  assert.equal(await scope.locator('.exam-review').count(), 0);
  assert.equal(await scope.locator('.exam-question-map button.graded-correct').count(), 4);
  assert.equal(await scope.locator('.exam-question-map button.graded-reference').count(), 1);
  await scope.locator('.exam-feedback.reference').waitFor();
  await page.screenshot({ path: path.join(output, 'desktop-result.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await question(3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'mobile-reading.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });

  await scope.getByRole('button', { name: 'Làm lại lượt mới' }).click(); await scope.getByLabel('Thời điểm hiện kết quả').selectOption('per_question');
  await scope.getByRole('button', { name: 'Bắt đầu làm bài' }).click(); await scope.getByRole('radio').nth(1).check();
  await scope.getByRole('button', { name: 'Kiểm tra câu', exact: true }).click(); await scope.getByText('Câu đã khóa.', { exact: true }).waitFor();
  assert.equal(await scope.getByRole('radio').nth(0).isDisabled(), true); assert.ok((await scope.locator('.exam-feedback').innerText()).includes('0/2'));
  assert.equal(await scope.locator('.exam-question-map button.graded-incorrect').count(), 1);
  assert.equal(await scope.locator('.exam-review').count(), 0, 'Do not expose results for unchecked questions');
  await question(2); await scope.getByLabel('Câu 2, ô 1').fill('で'); await scope.getByLabel('Câu 2, ô 2').fill('を');
  await scope.getByRole('button', { name: 'Kiểm tra câu', exact: true }).click(); await scope.getByText('Câu đã khóa.', { exact: true }).waitFor();
  assert.ok((await scope.locator('.exam-feedback').innerText()).includes('1/2'));
  assert.equal(await scope.locator('.exam-question-map button.graded-partial').count(), 1);
  const second = (await api('/api/exam-attempts')).find(a => a.status === 'IN_PROGRESS');

  // Two actual tabs load the same revision. The second must preserve its stale edit.
  const tab2 = await context.newPage(); tab2.on('pageerror', error => errors.push(error.message)); await enter(tab2);
  const secondScope = tab2.locator('.exam-workspace'); await secondScope.locator('.exam-question-map').waitFor();
  await question(3); await scope.getByRole('radio').nth(0).check(); await saved();
  await secondScope.locator('.exam-question-map button').nth(2).click(); await secondScope.getByRole('radio').nth(1).check();
  await secondScope.getByRole('button', { name: 'Dùng bản đã lưu trên máy chủ' }).waitFor();
  assert.equal(await secondScope.getByRole('radio').nth(1).isChecked(), true);
  await secondScope.getByRole('button', { name: 'Dùng bản đã lưu trên máy chủ' }).click();
  await expectEventually(async () => assert.equal(await secondScope.getByRole('radio').nth(0).isChecked(), true)); await tab2.close();

  // A failed write remains editable and is retried without losing local text.
  await question(5);
  await page.route('**/api/exam-attempts/*/answers', route => route.fulfill({ status: 503, json: { error: 'Mất kết nối thử nghiệm' } }));
  await scope.getByRole('textbox', { name: 'Bài viết câu 5' }).fill('Bản nháp khi mất kết nối');
  await scope.getByRole('button', { name: 'Thử lưu lại' }).waitFor();
  assert.equal(await scope.getByRole('textbox', { name: 'Bài viết câu 5' }).inputValue(), 'Bản nháp khi mất kết nối');
  await page.unroute('**/api/exam-attempts/*/answers'); await scope.getByRole('button', { name: 'Thử lưu lại' }).click(); await saved();
  await scope.getByRole('button', { name: 'Hoàn tất câu' }).click(); await scope.locator('.exam-feedback.reference').waitFor();

  // Restart the JVM and continue the exact attempt from SQLite.
  context.__restarting = true; await stop(javaProcess); javaProcess = start(java, javaArgs, 'backend-restarted.log', { cwd: backend });
  await ready(apiBase + '/api/exams', javaProcess); context.__restarting = false;
  const restored = await api(`/api/exam-attempts/${second.id}`); assert.equal(restored.answers.q5, 'Bản nháp khi mất kết nối'); assert.ok(restored.results.q1); assert.ok(restored.results.q5);
  await scope.getByRole('button', { name: 'Nộp bài', exact: true }).click(); await scope.getByRole('button', { name: 'Xác nhận nộp bài' }).click(); await scope.getByLabel('Kết quả bài kiểm tra').waitFor();
  const finished = await api(`/api/exam-attempts/${second.id}`); assert.equal(finished.metrics.score, 1);
  const review = scope.getByRole('region', { name: 'Câu trả lời chưa đúng', exact: true });
  assert.equal(await review.getByRole('button').count(), 4, 'Review includes wrong, partially correct, and unanswered automatic questions');
  assert.equal(await review.getByRole('button', { name: /Câu 5/ }).count(), 0, 'Essays must not be classified as wrong');
  await review.getByRole('button', { name: /Câu 2 · Đúng một phần/ }).click();
  assert.equal(await scope.locator('.exam-question-map button').nth(1).getAttribute('aria-current'), 'step');
  assert.equal(await scope.locator('.exam-question').evaluate(el => el === document.activeElement), true);
  assert.equal(await scope.getByLabel('Câu 2, ô 1').inputValue(), 'で');
  assert.equal(await scope.getByLabel('Câu 2, ô 2').inputValue(), 'を');
  await scope.locator('.exam-feedback.incorrect').waitFor();
  await page.screenshot({ path: path.join(output, 'desktop-wrong-question-review.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await review.getByRole('button', { name: /Câu 1 · Chưa đúng/ }).focus(); await page.keyboard.press('Enter');
  assert.equal(await scope.locator('.exam-question-map button').nth(0).getAttribute('aria-current'), 'step');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'mobile-wrong-question-review.png'), fullPage: true });
  const backup = await api('/api/backup/export'); assert.equal(backup.version, 6); assert.equal(backup.exams.attempts.length, 2);
  await api('/api/backup/import', backup);
  const roundtrip = await api(`/api/exam-attempts/${second.id}`); assert.deepEqual(roundtrip.answers, finished.answers); assert.deepEqual(roundtrip.results, finished.results);
  await scope.getByRole('button', { name: 'Lịch sử', exact: true }).click(); await scope.locator('.exam-history article').nth(1).waitFor();
  assert.equal(await scope.locator('.exam-history article').count(), 2);
  assert.deepEqual(errors, []);
  const result = { passed: true, output, assertions: ['JSON import', 'Japanese font cascade on passages, ruby, choices and answer fields', 'section coaching hidden', 'growing blanks and IME', 'long mobile answers at 32px in all five fonts', 'wrong/partial/unanswered review and keyboard navigation', 'autosave/IME', 'pause offline failure', 'atomic pause save', 'frozen timer after browser/JVM restart', 'explicit resume with remaining budget', 'current question restoration', 'Postman pause/resume contracts', 'both feedback modes', 'locked answers', 'multi-tab revision conflict', 'offline retry', 'JVM restart', 'backup v6 roundtrip', 'mobile overflow', 'history'], firstAttempt: first.id, secondAttempt: second.id };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (browser) for (const [ci, context] of browser.contexts().entries()) for (const [pi, page] of context.pages().entries()) {
    await page.screenshot({ path: path.join(output, `failure-${ci}-${pi}.png`), fullPage: true }).catch(() => {});
    await writeFile(path.join(output, `failure-${ci}-${pi}.html`), await page.content().catch(() => '')).catch(() => {});
  }
  console.error('Browser errors:', errors); throw error;
} finally {
  if (browser) await browser.close();
  await harness.close();
}
