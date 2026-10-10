import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractLesson, EXTRACTOR_VERSION } from './extractor.mjs';

export class UserActionRequired extends Error {
  constructor(message, { recoverable = false } = {}) { super(message); this.blocking = true; this.recoverable = recoverable; }
}
export function pageBlock({ url = '', text = '', status = 200, hasPassword = false }) {
  if (status === 429 || /too many requests|rate limit|access denied|temporarily blocked/i.test(text)) return 'Bunpro đang giới hạn truy cập. Chờ rồi bấm Tiếp tục.';
  if (/captcha|verify you are human|checking your browser|just a moment/i.test(text)) return 'Trình duyệt đang yêu cầu xác minh. Xử lý trong trình duyệt Bunpro rồi bấm Tiếp tục.';
  if (/\/(login|signin|sign_in)(\/|\?|$)/i.test(url) || hasPassword) return 'Cần đăng nhập Bunpro trong trình duyệt riêng, rồi bấm Tiếp tục.';
  if (status === 401 || status === 403) return 'Phiên truy cập không còn hợp lệ. Kiểm tra đăng nhập/quyền truy cập trong trình duyệt Bunpro.';
  return null;
}
export class BrowserCollector {
  constructor(profileDirectory, { headless = false } = {}) { this.profileDirectory = profileDirectory; this.headless = headless; this.context = null; this.launching = null; }
  async ensureBrowser() {
    if (this.context) return this.context;
    if (!this.launching) this.launching = (async () => {
      await mkdir(this.profileDirectory, { recursive: true });
      const channels = this.headless ? [undefined] : [undefined, 'msedge', 'chrome'];
      const failures = [];
      for (const channel of channels) {
        try {
          const context = await chromium.launchPersistentContext(path.join(this.profileDirectory, channel || 'chromium'), {
            headless: this.headless, channel, viewport: { width: 1280, height: 900 }, acceptDownloads: false });
          this.context = context; this.browserName = channel || 'Chromium';
          context.on('close', () => { if (this.context === context) this.context = null; });
          return context;
        } catch (error) { failures.push(`${channel || 'Chromium'}: ${error.message.split('\n')[0]}`); }
      }
      throw new UserActionRequired(`Không mở được trình duyệt. Chạy npm run collector:install và đóng phiên collector khác nếu có. ${failures.join('; ')}`, {recoverable:true});
    })().finally(() => { this.launching = null; });
    return this.launching;
  }
  async login() {
    const context = await this.ensureBrowser();
    let page = context.pages().find(e => !e.isClosed() && /bunpro\.jp/.test(e.url()));
    if (!page) page = await context.newPage();
    await page.goto('https://bunpro.jp/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // This method is explicitly requested by the dashboard login button.
    await page.bringToFront();
    return { message: `Đăng nhập trong ${this.browserName} với profile riêng vừa mở, sau đó bấm Bắt đầu / Tiếp tục trên dashboard.` };
  }
  async capture(item, folder, signal) {
    try { return await this.capturePage(item, folder, signal); }
    catch (error) {
      if (!signal.aborted && /Target page, context or browser has been closed|Browser closed|browser.*disconnected/i.test(error.message)) {
        throw new UserActionRequired(`Trình duyệt bị đóng hoặc mất kết nối: ${error.message.split('\n')[0]}`, {recoverable:true});
      }
      throw error;
    }
  }
  async capturePage(item, folder, signal) {
    const context = await this.ensureBrowser();
    if (signal.aborted) throw new Error('Đã hết thời gian.');
    const page = await context.newPage();
    const cancel = () => { void page.close().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    page.setDefaultTimeout(5_000);
    try {
      const response = await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 });
      await page.waitForTimeout(500);
      const checkBlock = async () => {
        const info = await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 30_000), hasPassword: Boolean(document.querySelector('input[type=password]')) }));
        const reason = pageBlock({ ...info, status: response?.status() });
        if (reason) throw new UserActionRequired(reason, {recoverable: /Cần đăng nhập|Phiên truy cập không còn hợp lệ/.test(reason)});
      };
      await checkBlock();
      if (response?.status() >= 400) throw new Error(`Bunpro trả HTTP ${response.status()}.`);
      await page.locator('#js-rev-header h1').waitFor({ state: 'visible', timeout: 12_000 });
      const openTabs = [];
      for (const name of ['Details', 'Examples']) {
        const tab = page.getByRole('tab', { name, exact: true });
        if (await tab.count() && await tab.first().isVisible()) { await tab.first().click(); openTabs.push(name); }
      }
      // Open only known read-only content controls inside the lesson, not actions menus.
      const expand = page.locator('article.bp-reviewable-root').getByRole('button', { name: /^(Show more|Load more|More examples|Expand All|Read more)$/i });
      const expansionCount = Math.min(await expand.count(), 20);
      for (let i = 0; i < expansionCount; i++) if (await expand.nth(i).isVisible()) await expand.nth(i).click();
      let lastSignature = '', stable = 0, settled = false;
      for (let i = 0; i < 12; i++) {
        await page.locator('#examples').scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const section = document.querySelector('#examples')?.closest('section');
          const questions = [...(section?.querySelectorAll('[id^="study-question-"]') || [])].filter(e => e.getClientRects().length);
          questions.at(-1)?.scrollIntoView({ block: 'end' });
        });
        await page.waitForTimeout(350);
        const signature = await page.evaluate(() => [...document.querySelectorAll('article.bp-reviewable-root [id^="study-question-"]')].filter(e => e.getClientRects().length).map(e => `${e.id}:${e.textContent}`).join('|'));
        if (signature === lastSignature) stable++; else stable = 0;
        lastSignature = signature;
        if (stable >= 2) { settled = true; break; }
      }
      await checkBlock();
      const result = await page.evaluate(extractLesson, { kind: item.kind, version: EXTRACTOR_VERSION });
      if (result.restricted) throw new UserActionRequired('Bunpro chỉ hiển thị một phần ví dụ. Kiểm tra phiên đăng nhập/quyền gói học rồi bấm Tiếp tục.', {recoverable:true});
      if (!result.title || !result.examples.length) throw new Error('Bộ trích xuất chưa nhận diện được tiêu đề/ví dụ; cần kiểm tra cấu trúc trang.');
      if (!result.meaning || result.examples.some(e => !e.sentence || !e.translation)) throw new Error('Thiếu nghĩa gốc hoặc câu/bản dịch ví dụ; chưa thể lưu mục này là đã lấy.');
      result.requestedUrl = item.sourceUrl; result.kind = item.kind; result.lesson = item.lesson;
      result.loadingSettled = settled; result.openedTabs = openTabs;
      if (!settled) result.issues.push('Nội dung chưa ổn định sau các lượt cuộn.');
      await mkdir(folder, { recursive: true });
      const source = { sourceUrl: result.sourceUrl, capturedAt: result.capturedAt, sections: result.sections };
      await writeFile(path.join(folder, 'source.json'), JSON.stringify(source, null, 2) + '\n', 'utf8');
      result.screenshots = [];
      const screenshotStyle = '[title="This sentence has a Ghost"], [role="checkbox"], [aria-haspopup], button, #self-study {visibility:hidden!important}';
      for (const [name, selector] of [['title','#js-rev-header h1'], ['details','#js-struct-details'], ['about','#about']]) {
        const locator = name === 'about' ? page.locator(selector).locator('xpath=ancestor::section[1]') : page.locator(selector);
        if (await locator.count() && await locator.isVisible()) {
          const file = `${name}.png`;
          await locator.screenshot({ path: path.join(folder, file), style: screenshotStyle, timeout: 5_000 });
          result.screenshots.push(file);
        }
      }
      // Capture official examples only; self-study may contain personal data.
      const exampleLists = page.locator('#examples').locator('xpath=ancestor::section[1]').locator('ul').filter({ has: page.locator('[id^="study-question-"]') });
      for (let i = 0; i < await exampleLists.count(); i++) {
        const list = exampleLists.nth(i);
        const safe = await list.evaluate(node => {
          const marker = node.closest('section')?.querySelector('#self-study');
          return !(marker && (marker.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
        });
        if (safe && await list.isVisible()) {
          const file = `examples-${i + 1}.png`;
          await list.screenshot({ path: path.join(folder, file), style: screenshotStyle, timeout: 5_000 });
          result.screenshots.push(file);
        }
      }
      if (!result.screenshots.some(e => e.startsWith('examples'))) result.issues.push('Chưa tạo được ảnh vùng Examples.');
      return result;
    } finally { signal.removeEventListener('abort', cancel); await page.close().catch(() => {}); }
  }
  async close() { await this.context?.close(); }
}
