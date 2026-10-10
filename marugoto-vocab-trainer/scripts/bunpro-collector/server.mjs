import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { RunStore, Worker, selectSample, selectAllVocab, counts, stamp, writeJson, captureWithTimeout } from './store.mjs';
import { BrowserCollector } from './browser.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
export async function startServer({ port = 4319, dataDirectory = path.join(project, 'data/bunpro-collector'), sample, allVocab, collector, workerOptions } = {}) {
  let store, worker, ready = false, verifying = false, actionBusy = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    let actionAcquired = false;
    try {
      const address = server.address();
      const host = `127.0.0.1:${address.port}`;
      if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Chỉ chấp nhận truy cập từ dashboard local.' });
      if (!ready) return send(503, { error: 'Worker đang khởi động.' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, { app: 'bunpro-collector', heartbeatAt: stamp(), workerBusy: Boolean(worker.task) || verifying, verificationBusy: verifying, ...store.run, workerConcurrency: worker.concurrency, counts: counts(store.run) });
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('Content-Disposition', `attachment; filename="${store.run.id}.json"`);
        return send(200, await store.export());
      }
      if (req.method === 'GET' && url.pathname === '/api/report') {
        res.setHeader('Content-Disposition', `attachment; filename="${store.run.id}-report.md"`);
        return send(200, await store.report(), 'text/markdown; charset=utf-8');
      }
      const match = url.pathname.match(/^\/api\/items\/([a-f0-9]{24})(?:\/artifacts\/(source\.json|[a-z]+(?:-\d+)?\.png))?$/);
      if (req.method === 'GET' && match) {
        const item = store.item(match[1]);
        if (match[2]) {
          const result = await store.result(item.id);
          if (match[2] !== 'source.json' && !result.screenshots?.includes(match[2])) return send(404, { error: 'Không có ảnh này.' });
          const bytes = await readFile(path.join(store.folder, item.id, match[2]));
          return send(200, match[2].endsWith('.json') ? JSON.parse(bytes) : bytes, match[2].endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8');
        }
        return send(200, { item, result: item.status === 'CAPTURED' ? await store.result(item.id) : null });
      }
      if (req.method === 'POST') {
        // Actions intentionally accept no arbitrary URLs, filesystem paths, or scripts.
        req.resume();
        if (actionBusy) return send(409, { error: 'Một thao tác điều khiển khác đang xử lý; hãy đợi.' });
        actionBusy = true; actionAcquired = true;
        if (verifying) return send(409, { error: 'Đang đối chiếu mẫu; hãy đợi.' });
        if (url.pathname === '/api/verify') {
          if (worker.task) return send(409, { error: 'Đợi lượt thu thập hoàn thành hoặc tạm dừng trước khi đối chiếu.' });
          const vocabOnly = store.run.scope === 'N5_VOCAB_ALL';
          const captured = store.run.items.filter(e => e.kind === 'VOCAB' && e.status === 'CAPTURED');
          const ordered = [...captured].sort((a,b) => a.exampleCount - b.exampleCount);
          const items = vocabOnly ? [...new Map([ordered[0], ordered[1], ordered.at(-1), captured.at(-1), ...captured].filter(Boolean).map(e=>[e.id,e])).values()].slice(0,4)
            : ['GRAMMAR','VOCAB'].flatMap(kind => store.run.items.filter(e => e.kind === kind && e.status === 'CAPTURED').slice(0, 2));
          if (items.length !== 4) return send(409, { error: 'Cần đủ 4 mục để đối chiếu mẫu.' });
          verifying = true;
          const comparison = { checkedAt: stamp(), method: 'Reload source and compare title, meaning, structure, sentences, translations and furigana; human completeness review still required', entries: [] };
          try {
            for (const item of items) {
              try {
                const prior = await store.result(item.id);
                const current = await captureWithTimeout(collector, item, path.join(store.folder, 'verification', item.id));
                const comparable = result => ({ title: result.title, meaning: result.meaning, dictionaryDefinition: result.dictionaryDefinition, structure: result.structure,
                  examples: result.examples.map(e => ({sourceId:e.sourceId, sentence:e.sentence, translation:e.translation, reading:e.reading, furigana:e.furigana})) });
                const matches = JSON.stringify(comparable(prior)) === JSON.stringify(comparable(current));
                comparison.entries.push({id:item.id,kind:item.kind,title:item.title,sourceUrl:item.sourceUrl,matches,previousExamples:prior.examples.length,currentExamples:current.examples.length});
                if (!matches) { item.completeness = 'NEEDS_REVIEW'; item.reviewedAt = null; await store.save(); }
              } catch (error) { comparison.entries.push({id:item.id,kind:item.kind,title:item.title,matches:false,error:error.message}); if (error.blocking) break; }
              await worker.delay(2_000);
            }
            comparison.passed = comparison.entries.length === 4 && comparison.entries.every(e => e.matches);
            await writeJson(path.join(store.folder, 'verification.json'), comparison);
            return send(200, comparison);
          } finally { verifying = false; }
        }
        if (url.pathname === '/api/login') {
          if (worker.task) return send(409, { error: 'Tạm dừng và đợi mục hiện tại kết thúc trước khi mở đăng nhập.' });
          return send(200, await collector.login());
        }
        if (['/api/start', '/api/resume'].includes(url.pathname)) {
          if (worker.task && store.run.status !== 'RUNNING') return send(409, { error: 'Đang kết thúc mục hiện tại; hãy đợi.' });
          await worker.start(); return send(202, { message: 'Worker đang chạy.' });
        }
        if (url.pathname === '/api/pause') { await worker.pause(); return send(200, { message: 'Đã yêu cầu tạm dừng.' }); }
        const workers = url.pathname.match(/^\/api\/workers\/([12])$/);
        if (workers) {
          if (worker.task) return send(409, {error:'Tạm dừng và đợi các mục hiện tại kết thúc trước khi đổi số worker.'});
          await worker.setConcurrency(Number(workers[1]));
          return send(200,{message:`Đã đặt ${worker.concurrency} worker. Bấm Tiếp tục để chạy.`});
        }
        if (url.pathname === '/api/retry') { await worker.retry(); return send(202, { message: 'Đang thử lại các mục lỗi.' }); }
        if (url.pathname === '/api/new' || url.pathname === '/api/full-vocab') {
          if (worker.task) return send(409, { error: 'Đợi worker dừng trước khi tạo lượt mới.' });
          const full = url.pathname === '/api/full-vocab' || store.run.scope === 'N5_VOCAB_ALL';
          if (full && !allVocab) return send(409, { error: 'Chưa có danh mục toàn bộ N5.' });
          await store.create(full ? allVocab : sample, full ? 'N5_VOCAB_ALL' : 'N5_SAMPLE');
          await worker.setConcurrency(worker.concurrency);
          return send(201, { message: `Đã tạo lượt ${store.run.items.length} mục; bấm Bắt đầu. Lượt cũ vẫn được giữ.` });
        }
        const review = url.pathname.match(/^\/api\/items\/([a-f0-9]{24})\/(review|unreview)$/);
        if (review) {
          const item = store.item(review[1]);
          if (item.status !== 'CAPTURED') return send(409, { error: 'Chưa có dữ liệu để đối chiếu.' });
          item.completeness = review[2] === 'review' ? 'REVIEWED' : 'NEEDS_REVIEW';
          item.reviewedAt = review[2] === 'review' ? stamp() : null;
          await store.save(); await store.report(); return send(200, { message: 'Đã lưu trạng thái đối chiếu.' });
        }
      }
      const files = { '/': ['index.html','text/html; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/style.css': ['style.css','text/css; charset=utf-8'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname]; return send(200, await readFile(path.join(publicDirectory, file)), type);
      }
      return send(404, { error: 'Không tìm thấy.' });
    } catch (error) { return send(error.code === 'ENOENT' ? 404 : 400, { error: error.message }); }
    finally { if (actionAcquired) actionBusy = false; }
  });
  // Reserve the port before touching state; a second service cannot mutate this run.
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  try {
    if (!sample) {
      const root = path.join(project, 'backend/src/main/resources/bunpro');
      const grammar = JSON.parse(await readFile(path.join(root, 'n5-grammar-source.json'), 'utf8'));
      const vocab = JSON.parse(await readFile(path.join(root, 'n5-vocab-source.json'), 'utf8'));
      sample = selectSample(grammar, vocab);
      allVocab = selectAllVocab(vocab);
    }
    collector ||= new BrowserCollector(path.join(dataDirectory, 'profile'));
    store = await new RunStore(path.join(dataDirectory, 'runs'), sample).init();
    worker = new Worker(store, collector, workerOptions); ready = true;
  } catch (error) { server.close(); throw error; }
  return { server, store, worker, collector, url: `http://127.0.0.1:${server.address().port}`, async close() {
    if (worker.task) { await worker.pause(); await worker.task; }
    await collector.close?.(); await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.BUNPRO_COLLECTOR_PORT || 4319);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port không hợp lệ.');
  const service = await startServer({ port });
  console.log(`Bunpro collector: ${service.url} · ${service.store.run.id}`);
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
