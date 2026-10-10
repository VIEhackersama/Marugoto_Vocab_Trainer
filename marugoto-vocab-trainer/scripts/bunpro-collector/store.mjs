import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const stamp = () => new Date().toISOString();
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, file);
}
export function selectSample(grammar, vocab) {
  return [['GRAMMAR', grammar], ['VOCAB', vocab]].flatMap(([kind, source]) => {
    const lessons = [...new Set(source.entries.map(e => e.lesson))].sort((a, b) => a - b).slice(0, 10);
    if (lessons.length !== 10) throw new Error(`Cần 10 lesson trong nguồn ${kind}.`);
    return lessons.map(lesson => {
      const entry = source.entries.find(e => e.lesson === lesson);
      const url = new URL(entry.url);
      if (url.origin !== 'https://bunpro.jp' || !/^\/(grammar_points|vocabs)\//.test(url.pathname)) throw new Error('URL nguồn không hợp lệ.');
      return { id: createHash('sha256').update(`${kind}:${url.origin}${url.pathname}`).digest('hex').slice(0, 24),
        kind, lesson, title: entry.title || entry.spelling, sourceUrl: entry.url,
        status: 'QUEUED', completeness: 'NOT_CHECKED', attempts: 0, error: null, exampleCount: 0 };
    });
  });
}
export function selectAllVocab(source) {
  if (!source.entries?.length || source.expectedCount && source.expectedCount !== source.entries.length) throw new Error('Danh mục N5 chưa đủ số mục dự kiến.');
  const items = source.entries.map(entry => {
    const url = new URL(entry.url);
    if (url.origin !== 'https://bunpro.jp' || !url.pathname.startsWith('/vocabs/')) throw new Error('URL từ vựng không hợp lệ.');
    return { id: createHash('sha256').update(`VOCAB:${url.origin}${url.pathname}`).digest('hex').slice(0, 24), kind:'VOCAB', lesson:entry.lesson,
      title:entry.spelling || entry.title, sourceUrl:entry.url, status:'QUEUED', completeness:'NOT_CHECKED', attempts:0, error:null, exampleCount:0 };
  });
  if (new Set(items.map(e => e.id)).size !== items.length) throw new Error('Danh mục có URL từ vựng trùng.');
  return items;
}
export function counts(run) {
  const count = status => run.items.filter(e => e.status === status).length;
  return { total: run.items.length, captured: count('CAPTURED'), running: count('RUNNING'),
    queued: count('QUEUED'), failed: count('FAILED'), needsReview: run.items.filter(e => e.status === 'CAPTURED' && e.completeness !== 'REVIEWED').length,
    examples: run.items.reduce((sum, e) => sum + e.exampleCount, 0) };
}
export async function captureWithTimeout(collector, item, folder, timeoutMs = 60_000) {
  const controller = new AbortController();
  let timer;
  const capture = collector.capture(item, folder, controller.signal);
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new Error(`Quá ${timeoutMs / 1000} giây khi lấy mục.`));
  }, timeoutMs); });
  try { return await Promise.race([capture, timeout]); }
  finally { clearTimeout(timer); controller.abort(); await capture.catch(() => {}); }
}
export class RunStore {
  constructor(directory, sample) { this.directory = directory; this.sample = sample; this.run = null; this.saving = Promise.resolve(); }
  get folder() { return path.join(this.directory, this.run.id); }
  async init() {
    await mkdir(this.directory, { recursive: true });
    const directories = (await readdir(this.directory, { withFileTypes: true })).filter(e => e.isDirectory() && e.name.startsWith('run-')).map(e => e.name).sort().reverse();
    if (directories.length) {
      // A corrupt latest state is surfaced, never silently replaced by a fresh queue.
      this.run = JSON.parse(await readFile(path.join(this.directory, directories[0], 'state.json'), 'utf8'));
      if (this.run.version !== 1 || !Array.isArray(this.run.items)) throw new Error('Trạng thái lượt chạy không hợp lệ.');
      for (const item of this.run.items) {
        if (item.status === 'RUNNING') {
          try {
            const result = await this.result(item.id);
            item.status = 'CAPTURED'; item.exampleCount = result.examples.length; item.completeness = 'NEEDS_REVIEW'; item.error = null;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            item.status = 'QUEUED'; item.attempts = Math.max(0, item.attempts - 1);
          }
        }
      }
      if (this.run.status === 'RUNNING' || this.run.status === 'COMPLETED' && this.run.items.some(e=>e.status==='QUEUED')) {
        this.run.status = 'PAUSED'; this.run.reason = 'Khôi phục các mục chưa hoàn thành. Bấm Tiếp tục.';
      }
    } else await this.create();
    await this.save();
    return this;
  }
  async create(items = this.sample, scope = 'N5_SAMPLE') {
    this.run = { version: 1, id: `run-${stamp().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`, createdAt: stamp(),
      updatedAt: stamp(), status: 'IDLE', reason: null, scope, items: structuredClone(items) };
    await this.save();
  }
  item(id) { const item = this.run.items.find(e => e.id === id); if (!item) throw new Error('Không tìm thấy mục.'); return item; }
  async save() {
    this.run.updatedAt = stamp();
    const folder = this.folder, snapshot = structuredClone(this.run);
    this.saving = this.saving.catch(() => {}).then(() => writeJson(path.join(folder, 'state.json'), snapshot));
    await this.saving;
  }
  async result(id) { this.item(id); return JSON.parse(await readFile(path.join(this.folder, id, 'result.json'), 'utf8')); }
  async capture(item, result) {
    await writeJson(path.join(this.folder, item.id, 'result.json'), result);
    item.status = 'CAPTURED'; item.completeness = 'NEEDS_REVIEW'; item.exampleCount = result.examples.length;
    item.error = null; item.capturedAt = result.capturedAt; await this.save();
  }
  async export() {
    const entries = [];
    for (const item of this.run.items) entries.push({ ...item, result: item.status === 'CAPTURED' ? await this.result(item.id) : null });
    return { version: 1, purpose: 'bunpro-source-capture (không phải snapshot import kho học)', runId: this.run.id,
      createdAt: this.run.createdAt, updatedAt: this.run.updatedAt, status: this.run.status, counts: counts(this.run), entries };
  }
  async report({ includeExport = true } = {}) {
    this.reporting = (this.reporting || Promise.resolve()).catch(() => {}).then(() => this.writeReport(includeExport));
    return this.reporting;
  }
  async writeReport(includeExport) {
    if (includeExport) await writeJson(path.join(this.folder, 'export.json'), await this.export());
    const totals = counts(this.run);
    const report = [`# Bunpro N5 — ${this.run.id}`, `Trạng thái: ${this.run.status}`, `Đã lấy: ${totals.captured}/${totals.total} · Lỗi: ${totals.failed} · Cần kiểm tra: ${totals.needsReview} · Ví dụ: ${totals.examples}`, '',
      ...this.run.items.map(e => `- ${e.kind} lesson ${e.lesson}: ${e.title} — ${e.status}, ${e.exampleCount} ví dụ${e.error ? ` — ${e.error}` : ''}`)].join('\n');
    await writeFile(path.join(this.folder, 'report.md'), report + '\n', 'utf8');
    return report;
  }
}

export class Worker {
  constructor(store, collector, { timeoutMs = 60_000, spacingMs = 2_000, retryMs = 3_000, recoveryRetryMs = 10_000, concurrency = store.run.workerConcurrency || 1 } = {}) {
    this.store = store; this.collector = collector; this.timeoutMs = timeoutMs;
    this.spacingMs = spacingMs; this.retryMs = retryMs; this.task = null;
    this.recoveryRetryMs = recoveryRetryMs;
    if (![1,2].includes(concurrency)) throw new Error('Chỉ hỗ trợ 1 hoặc 2 worker.');
    this.concurrency = concurrency; this.admission = Promise.resolve(); this.nextStartAt = 0;
  }
  async setConcurrency(count) {
    if (this.task) throw new Error('Tạm dừng và đợi các mục đang lấy kết thúc trước khi đổi số worker.');
    if (![1,2].includes(count)) throw new Error('Chỉ hỗ trợ 1 hoặc 2 worker.');
    this.concurrency = count; this.store.run.workerConcurrency = count; await this.store.save();
  }
  async start() {
    if (this.task) return;
    for (const item of this.store.run.items.filter(e => e.needsIntervention)) {
      item.status = 'QUEUED'; item.attempts = 0; item.needsIntervention = false;
    }
    this.store.run.status = 'RUNNING'; this.store.run.reason = null;
    this.task = this.store.save().then(async () => {
      // Each lane claims synchronously; wait for every lane before exporting/completing.
      await Promise.allSettled(Array.from({length:this.concurrency}, async () => {
        try { await this.loop(); }
        catch (error) { this.store.run.status = 'PAUSED'; this.store.run.reason = `Lỗi worker: ${error.message}`; await this.store.save(); }
      }));
      if (this.store.run.status === 'RUNNING') {
        const pending = this.store.run.items.some(e => !['CAPTURED','FAILED'].includes(e.status));
        this.store.run.status = pending ? 'PAUSED' : 'COMPLETED';
        this.store.run.reason = pending ? 'Còn mục chưa hoàn thành; cần khôi phục trước khi kết thúc.' : null;
        await this.store.save();
      }
      await this.store.report();
    }).catch(async error => {
      this.store.run.status = 'PAUSED'; this.store.run.reason = `Lỗi worker: ${error.message}`; await this.store.save();
    }).finally(() => { this.task = null; });
  }
  async pause() { this.store.run.status = 'PAUSED'; this.store.run.reason = 'Tạm dừng; mục đang chạy sẽ được lưu trước khi dừng.'; await this.store.save(); }
  async retry() {
    if (this.task || this.store.run.status === 'RUNNING') throw new Error('Tạm dừng và đợi mục đang chạy kết thúc trước khi thử lại.');
    for (const item of this.store.run.items.filter(e => e.status === 'FAILED')) { item.status = 'QUEUED'; item.attempts = 0; item.error = null; item.needsIntervention = false; }
    await this.start();
  }
  async loop() {
    while (this.store.run.status === 'RUNNING') {
      const item = this.store.run.items.find(e => e.status === 'QUEUED');
      if (!item) break;
      // Reserve before the first await, including the whole retry backoff.
      item.status = 'RUNNING';
      while (item.attempts < 3 && this.store.run.status === 'RUNNING') {
        await this.admit();
        if (this.store.run.status !== 'RUNNING') break;
        item.status = 'RUNNING'; item.attempts++; item.error = null; item.retryAt = null; await this.store.save();
        try {
          const result = await captureWithTimeout(this.collector, item, path.join(this.store.folder, item.id), this.timeoutMs);
          await this.store.capture(item, result); break;
        } catch (error) {
          item.error = error.message;
          if (error.blocking && (!error.recoverable || item.attempts >= 3)) {
            if (error.recoverable) {
              item.status = 'FAILED'; item.needsIntervention = true;
              this.store.run.status = 'AWAITING_USER';
              this.store.run.reason = `Tự phục hồi thất bại sau 3 lần: ${error.message}`;
            } else {
              item.status = 'QUEUED'; item.attempts--; this.store.run.status = 'AWAITING_USER'; this.store.run.reason = error.message;
            }
          } else item.status = item.attempts >= 3 ? 'FAILED' : 'RUNNING';
          const waitMs = (error.recoverable ? this.recoveryRetryMs : this.retryMs) * item.attempts;
          item.retryAt = this.store.run.status === 'RUNNING' && item.status === 'RUNNING' ? new Date(Date.now() + waitMs).toISOString() : null;
          await this.store.save();
          if (this.store.run.status !== 'RUNNING' || item.status === 'FAILED') break;
          await this.delay(waitMs);
        }
      }
      // A pause during the retry backoff must leave the item resumable.
      if (item.status === 'RUNNING') { item.status = 'QUEUED'; await this.store.save(); }
      if (item.retryAt) { item.retryAt = null; await this.store.save(); }
      await this.store.report({ includeExport: false });
    }
  }
  async admit() {
    const turn = this.admission.then(async () => {
      await this.delay(Math.max(0, this.nextStartAt - Date.now()));
      this.nextStartAt = Date.now() + this.spacingMs;
    });
    this.admission = turn.catch(() => {}); await turn;
  }
  async delay(ms) { if (ms) await new Promise(resolve => setTimeout(resolve, ms)); }
}
