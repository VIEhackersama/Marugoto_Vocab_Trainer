import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { RunStore, Worker, selectSample, selectAllVocab } from './store.mjs';
import { extractLesson, EXTRACTOR_VERSION } from './extractor.mjs';
import { BrowserCollector, pageBlock, UserActionRequired } from './browser.mjs';
import { startServer } from './server.mjs';

const exampleHtml = (id, sentence = '本', translation = 'A book.') => `<li id="study-question-${id}"><p class="bp-ddw"><ruby>${sentence}<rt>ほん</rt><rp>(</rp></ruby>です。</p><p class="bp-sdw">${translation}</p><button title="Play audio">Play</button><audio src="https://audio.example.test/${id}.mp3"></audio></li>`;
const fixture = `<nav>PRIVATE ACCOUNT EMAIL</nav><article class="bp-reviewable-root"><header id="js-rev-header"><h1><span class="bp-ddw">です</span><span>To be</span></h1></header><div id="js-struct-details"><section><header id="structure"><h2>Structure</h2></header><p>Noun + です</p></section></div><section><header id="about"><h2>About です</h2></header><p>Explanation</p><h4>Caution</h4><ul>${exampleHtml(1)}</ul></section><section><div><header id="examples"><h2>Examples</h2></header></div><ul>${exampleHtml(1)}${exampleHtml(2,'猫','A cat.')}${exampleHtml(3,'犬','A dog.')}</ul><ul style="display:none">${exampleHtml(99,'秘密','HIDDEN PREMIUM')}</ul><header id="self-study"><h2>Self-Study Sentences</h2></header><ul>${exampleHtml(100,'個人','PRIVATE PERSONAL SENTENCE')}</ul></section></article><section id="discussion">PRIVATE DISCUSSION</section>`;

async function directory(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'bunpro-collector-test-'));
  t.after(() => rm(folder, { recursive: true, force: true })); return folder;
}
function samples() {
  const source = kind => ({ entries: Array.from({ length: 11 }, (_, i) => ({ lesson:i + 1, title:`Mục ${i + 1}`, url:`https://bunpro.jp/${kind}/${i + 1}?deck_id=5` })) });
  return selectSample(source('grammar_points'), source('vocabs'));
}
const resultFor = item => ({ title:item.title, capturedAt:new Date().toISOString(), examples:[{ sourceId:'study-question-1', type:'examples', sentence:'本です。',translation:'It is a book.', furigana:[], audioUrls:[] }], screenshots:[], sections:[], issues:['Cần đối chiếu.'] });

test('transient session errors recover automatically on third attempt without user input', async t => {
  const store=await new RunStore(await directory(t),samples().slice(0,2)).init(); const calls=new Map();
  const worker=new Worker(store,{capture:async item=>{
    const attempt=(calls.get(item.id)||0)+1;calls.set(item.id,attempt);
    if(item.id===store.run.items[0].id && attempt<3) throw new UserActionRequired('Session temporarily missing',{recoverable:true});
    return resultFor(item);
  }},{concurrency:2,spacingMs:0,recoveryRetryMs:0});
  await worker.start(); await worker.task;
  assert.equal(calls.get(store.run.items[0].id),3);assert.equal(calls.get(store.run.items[1].id),1);
  assert.equal(store.run.status,'COMPLETED');assert.ok(store.run.items.every(e=>e.status==='CAPTURED'));
});

test('three persistent recovery failures request intervention, then manual resume resets the budget', async t => {
  const store=await new RunStore(await directory(t),samples().slice(0,2)).init();let failing=true,calls=0;
  const worker=new Worker(store,{capture:async item=>{calls++;if(failing)throw new UserActionRequired('Browser unavailable',{recoverable:true});return resultFor(item);}},{spacingMs:0,recoveryRetryMs:0});
  await worker.start();await worker.task;
  assert.equal(calls,3);assert.equal(store.run.status,'AWAITING_USER');assert.equal(store.run.items[0].attempts,3);
  assert.equal(store.run.items[0].needsIntervention,true);assert.equal(store.run.items[1].attempts,0);
  assert.match(store.run.reason,/sau 3 lần/);
  failing=false;await worker.start();await worker.task;
  assert.equal(store.run.status,'COMPLETED');assert.equal(store.run.items[0].attempts,1);
  assert.equal(store.run.items[0].needsIntervention,false);
});

test('browser disconnect is recoverable but intentional timeout remains a normal item timeout', async () => {
  const collector=new BrowserCollector('unused');collector.capturePage=async()=>{throw new Error('Target page, context or browser has been closed');};
  await assert.rejects(collector.capture({},'unused',new AbortController().signal),e=>e.blocking&&e.recoverable);
  const controller=new AbortController();controller.abort();
  await assert.rejects(collector.capture({},'unused',controller.signal),e=>!e.blocking);
});

test('parallel lanes overlap, reserve retries, and finish all captures before export', async t => {
  const folder = await directory(t); const store = await new RunStore(folder,samples().slice(0,5)).init();
  let active = 0, peak = 0; const calls = new Map(); const starts = [];
  const worker = new Worker(store,{capture:async item => {
    starts.push(Date.now()); const attempt = (calls.get(item.id) || 0) + 1; calls.set(item.id,attempt);
    active++; peak = Math.max(peak,active);
    await new Promise(resolve => setTimeout(resolve,40)); active--;
    if (item.id === store.run.items[0].id && attempt === 1) throw new Error('temporary');
    assert.equal(store.run.status,'RUNNING'); return resultFor(item);
  }},{concurrency:2,spacingMs:10,retryMs:25});
  await worker.setConcurrency(2); await worker.start();
  await assert.rejects(worker.setConcurrency(1),/Tạm dừng/);
  await worker.task; assert.equal(peak,2); assert.equal(active,0);
  assert.equal(calls.get(store.run.items[0].id),2); assert.ok([...calls.values()].slice(1).every(n=>n===1));
  assert.ok(starts.slice(1).every((time,index)=>time-starts[index]>=8));
  assert.equal(store.run.status,'COMPLETED'); assert.ok(store.run.items.every(e=>e.status==='CAPTURED'));
  assert.equal(JSON.parse(await readFile(path.join(store.folder,'export.json'),'utf8')).counts.captured,5);
  const recovered=await new RunStore(folder,samples()).init(); assert.equal(new Worker(recovered,{}).concurrency,2);
});

test('parallel pause commits both active pages and blocking access stops new work', async t => {
  const store=await new RunStore(await directory(t),samples().slice(0,4)).init();
  const finishes=[];
  const worker=new Worker(store,{capture:item=>new Promise(resolve=>finishes.push(()=>resolve(resultFor(item))))},{concurrency:2,spacingMs:0});
  await worker.start(); while(finishes.length<2) await new Promise(resolve=>setTimeout(resolve,5));
  await worker.pause(); finishes.forEach(f=>f()); await worker.task;
  assert.equal(store.run.items.filter(e=>e.status==='CAPTURED').length,2);
  assert.equal(store.run.items.filter(e=>e.status==='QUEUED').length,2);
  let calls=0;
  const blocked=new Worker(store,{capture:async()=>{calls++;throw new UserActionRequired('CAPTCHA');}},{concurrency:2,spacingMs:30});
  await blocked.start(); await blocked.task;
  assert.equal(calls,1); assert.equal(store.run.status,'AWAITING_USER');
  assert.equal(store.run.items.filter(e=>e.status==='RUNNING').length,0);
  assert.ok(store.run.items.filter(e=>e.status==='QUEUED').every(e=>e.attempts===0));
});

test('full N5 inventory is complete, unique, and preserves deck URLs', async () => {
  const source = JSON.parse(await readFile(new URL('../../backend/src/main/resources/bunpro/n5-vocab-source.json', import.meta.url),'utf8'));
  const items = selectAllVocab(source);
  assert.equal(items.length,1100); assert.equal(new Set(items.map(e => e.lesson)).size,22);
  assert.ok(items.every(e => e.kind === 'VOCAB' && e.sourceUrl.includes('deck_id=5')));
  assert.throws(() => selectAllVocab({...source, entries:source.entries.slice(1)}),/chưa đủ/);
  assert.throws(() => selectAllVocab({entries:[source.entries[0],source.entries[0]]}),/trùng/);
});

test('full vocab scope and results survive restart', async t => {
  const folder = await directory(t); const all = samples().filter(e => e.kind === 'VOCAB');
  const service = await startServer({port:0,dataDirectory:folder,sample:samples(),allVocab:all,collector:{capture:async item => resultFor(item)},workerOptions:{spacingMs:0}});
  t.after(() => service.close());
  const response = await fetch(service.url + '/api/full-vocab',{method:'POST'}); assert.equal(response.status,201);
  assert.equal(service.store.run.scope,'N5_VOCAB_ALL'); assert.equal(service.store.run.items.length,10);
  await service.worker.start(); await service.worker.task;
  service.worker.delay = async () => {};
  const verification = await (await fetch(service.url + '/api/verify',{method:'POST'})).json();
  assert.equal(verification.passed,true); assert.equal(verification.entries.length,4);
  assert.ok(verification.entries.every(e=>e.kind==='VOCAB'));
  const recovered = await new RunStore(path.join(folder,'runs'),samples()).init();
  assert.equal(recovered.run.scope,'N5_VOCAB_ALL'); assert.equal((await recovered.export()).entries.length,10);
});

test('a completed run with an uncommitted running item recovers as paused', async t => {
  const folder=await directory(t);const store=await new RunStore(folder,samples().slice(0,1)).init();
  store.run.status='COMPLETED';store.run.items[0].status='RUNNING';store.run.items[0].attempts=1;await store.save();
  const recovered=await new RunStore(folder,samples()).init();
  assert.equal(recovered.run.status,'PAUSED');assert.equal(recovered.run.items[0].status,'QUEUED');
});

test('sample has one item per lesson and preserves navigation query', () => {
  const sample = samples(); assert.equal(sample.length,20); assert.equal(new Set(sample.map(e => e.id)).size,20);
  assert.equal(sample.filter(e => e.kind === 'VOCAB').length,10);
  assert.ok(sample.every(e => e.sourceUrl.endsWith('?deck_id=5')));
  assert.deepEqual(sample.slice(0,10).map(e => e.lesson), [1,2,3,4,5,6,7,8,9,10]);
});

test('DOM extraction preserves ruby, merges duplicate occurrences, and excludes private/hidden content', async t => {
  const browser = await chromium.launch({ headless:true }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.setContent(fixture);
  const result = await page.evaluate(extractLesson, { kind:'GRAMMAR', version:EXTRACTOR_VERSION });
  assert.equal(result.title,'です'); assert.equal(result.meaning,'To be'); assert.equal(result.examples.length,3);
  assert.equal(result.observedExampleCount,4); assert.equal(result.examples[0].sentence,'本です。');
  assert.equal(result.examples[0].reading,'ほんです。'); assert.deepEqual(result.examples[0].furigana,[{ text:'本',reading:'ほん' }]);
  assert.equal(result.examples[0].occurrences.length,2); assert.equal(result.examples[0].notes,'Caution');
  assert.equal('audioUrls' in result.examples[0],false); assert.equal('hasAudioControl' in result.examples[0],false);
  assert.equal(result.completeness,'NEEDS_REVIEW');
  await page.locator('#js-struct-details').evaluate(node => node.insertAdjacentHTML('beforeend','<section><h2>Dictionary Definition</h2><ol><li>1. first meaning</li><li>2. second meaning</li></ol></section>'));
  const vocabulary = await page.evaluate(extractLesson,{kind:'VOCAB',version:EXTRACTOR_VERSION});
  assert.match(vocabulary.dictionaryDefinition,/first meaning/); assert.match(vocabulary.dictionaryDefinition,/second meaning/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|HIDDEN PREMIUM|study-question-99|study-question-100|<script|onclick|src=/);
  await page.locator('#examples').evaluate(node => node.parentElement.insertAdjacentHTML('afterend','<p>Premium users get access to all example sentences</p>'));
  assert.equal((await page.evaluate(extractLesson,{kind:'VOCAB',version:EXTRACTOR_VERSION})).restricted,true);
});

test('browser collector captures lesson screenshots and rejects partial premium access', async t => {
  const folder = await directory(t);
  const browser = await chromium.launch({headless:true}); t.after(() => browser.close());
  const context = await browser.newContext();
  let restricted = false;
  await context.route('https://bunpro.jp/**', route => route.fulfill({contentType:'text/html',body:restricted ? fixture.replace('<header id="self-study">','<p>Get more example sentences! Premium users get access to 12 example sentences.</p><header id="self-study">') : fixture}));
  const collector = new BrowserCollector(path.join(folder,'profile')); collector.context = context;
  const item = samples()[0];
  const result = await collector.capture(item,path.join(folder,item.id),new AbortController().signal);
  assert.equal(result.examples.length,3); assert.ok(result.screenshots.includes('examples-1.png'));
  assert.ok(result.screenshots.includes('about.png')); assert.equal(result.loadingSettled,true);
  assert.doesNotMatch(await readFile(path.join(folder,item.id,'source.json'),'utf8'),/PRIVATE|HIDDEN PREMIUM/);
  assert.ok((await readFile(path.join(folder,item.id,'examples-1.png'))).length > 100);
  restricted = true;
  await assert.rejects(collector.capture(item,path.join(folder,'restricted'),new AbortController().signal),error => error.blocking && /một phần ví dụ/.test(error.message));
  assert.equal(context.pages().length,0);
});

test('pause saves current item, resume skips captured data, export survives restart', async t => {
  const folder = await directory(t); const store = await new RunStore(folder,samples().slice(0,2)).init();
  let finish, calls = 0;
  const collector = { capture:async item => { calls++; if (calls === 1) await new Promise(resolve => { finish = resolve; }); return resultFor(item); } };
  const worker = new Worker(store,collector,{spacingMs:0,retryMs:0}); await worker.start();
  while (!finish) await new Promise(resolve => setTimeout(resolve,5));
  await worker.pause(); finish(); await worker.task;
  assert.equal(store.run.items[0].status,'CAPTURED'); assert.equal(store.run.items[1].status,'QUEUED');
  const recovered = await new RunStore(folder,samples()).init(); assert.equal(recovered.run.status,'PAUSED');
  const next = new Worker(recovered,{capture:async item => { calls++; return resultFor(item); }},{spacingMs:0});
  await next.start(); await next.task; assert.equal(calls,2); assert.equal(recovered.run.status,'COMPLETED');
  assert.equal((await recovered.export()).entries.filter(e => e.result).length,2);
  assert.equal(JSON.parse(await readFile(path.join(recovered.folder,'export.json'),'utf8')).counts.captured,2);
});

test('blocking login pauses entire queue without consuming retry budget', async t => {
  const store = await new RunStore(await directory(t),samples().slice(0,2)).init();
  let calls = 0;
  const worker = new Worker(store,{capture:async () => { calls++; throw new UserActionRequired('Đăng nhập'); }},{spacingMs:0});
  await worker.start(); await worker.task;
  assert.equal(calls,1); assert.equal(store.run.status,'AWAITING_USER'); assert.equal(store.run.items[0].attempts,0);
  assert.ok(store.run.items.every(e => e.status === 'QUEUED'));
});

test('timeouts abort capture, retry twice, and continue to next item', async t => {
  const store = await new RunStore(await directory(t),samples().slice(0,2)).init(); let aborted = 0;
  const worker = new Worker(store,{capture:async (item, folder, signal) => {
    if (item.id === store.run.items[0].id) return new Promise((resolve,reject) => signal.addEventListener('abort',() => { aborted++; reject(new Error('aborted')); },{once:true}));
    return resultFor(item);
  }},{timeoutMs:15,spacingMs:0,retryMs:0});
  await worker.start(); await worker.task;
  assert.equal(aborted,3); assert.equal(store.run.items[0].attempts,3); assert.equal(store.run.items[0].status,'FAILED');
  assert.equal(store.run.items[1].status,'CAPTURED'); assert.equal(store.run.status,'COMPLETED');
});

test('interrupted running item recovers queued or already committed capture', async t => {
  const folder = await directory(t); const store = await new RunStore(folder,samples().slice(0,2)).init();
  store.run.status = 'RUNNING'; store.run.items[0].status = 'RUNNING'; store.run.items[0].attempts = 1;
  await store.save(); const recovered = await new RunStore(folder,samples()).init();
  assert.equal(recovered.run.items[0].status,'QUEUED'); assert.equal(recovered.run.items[0].attempts,0);
  await recovered.capture(recovered.run.items[0],resultFor(recovered.run.items[0]));
  recovered.run.items[0].status = 'RUNNING'; recovered.run.status = 'RUNNING'; await recovered.save();
  const committed = await new RunStore(folder,samples()).init(); assert.equal(committed.run.items[0].status,'CAPTURED');
});

test('access block classification distinguishes normal lesson from login, CAPTCHA, and throttling', () => {
  assert.equal(pageBlock({text:'About だ Examples'}),null);
  assert.match(pageBlock({url:'https://bunpro.jp/login'}),/đăng nhập/);
  assert.match(pageBlock({text:'Verify you are human'}),/xác minh/);
  assert.match(pageBlock({status:429}),/giới hạn/);
});

test('source recheck compares two entries of each kind without marking them reviewed', async t => {
  const all = samples();
  const service = await startServer({port:0,dataDirectory:await directory(t),sample:[all[0],all[1],all[10],all[11]],
    collector:{capture:async item => resultFor(item),close:async()=>{}},workerOptions:{spacingMs:0}});
  t.after(() => service.close()); service.worker.delay = async () => {};
  await service.worker.start(); await service.worker.task;
  const response = await fetch(`${service.url}/api/verify`,{method:'POST'});
  const comparison = await response.json();
  assert.equal(response.status,200); assert.equal(comparison.passed,true); assert.equal(comparison.entries.length,4);
  assert.equal(comparison.entries.filter(e=>e.kind==='GRAMMAR').length,2);
  assert.ok(service.store.run.items.every(e=>e.completeness==='NEEDS_REVIEW'));
  assert.equal(JSON.parse(await readFile(path.join(service.store.folder,'verification.json'),'utf8')).passed,true);
});

test('local API exports data, rejects foreign Origin, and dashboard detects disconnect', async t => {
  const browser = await chromium.launch({headless:true}); t.after(() => browser.close());
  const service = await startServer({port:0,dataDirectory:await directory(t),sample:samples().slice(0,2),
    collector:{capture:async item => resultFor(item),login:async () => ({message:'Đăng nhập'}),close:async () => {}},workerOptions:{spacingMs:0}});
  let closed = false; t.after(async () => { if (!closed) await service.close(); });
  const response = await fetch(`${service.url}/api/start`,{method:'POST',headers:{Origin:'https://evil.example'}}); assert.equal(response.status,403);
  const page = await browser.newPage(); await page.goto(service.url);
  await page.getByText('Worker kết nối',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Bắt đầu',exact:true}).click();
  await page.getByText('Đã kết thúc lượt · 1 worker',{exact:true}).waitFor();
  await page.getByRole('button',{name:'2 worker',exact:true}).click();
  await page.getByText('Đã kết thúc lượt · 2 worker',{exact:true}).waitFor();
  const snapshot = await (await fetch(`${service.url}/api/export`)).json(); assert.equal(snapshot.counts.captured,2);
  assert.equal(snapshot.entries.length,2);
  await page.locator('[data-id]').first().click(); await page.getByRole('heading',{name:'Ví dụ · 1',exact:true}).waitFor();
  await page.getByRole('button',{name:'Tôi đã đối chiếu đầy đủ với nguồn'}).click();
  await page.getByRole('button',{name:'Bỏ xác nhận đối chiếu'}).waitFor();
  // Simulate service disconnect without stopping the fixture page.
  await page.route('**/api/status',route => route.abort());
  await page.getByText('Mất kết nối worker',{exact:true}).waitFor({timeout:8000});
  await service.close(); closed = true;
  const restarted = await startServer({port:0,dataDirectory:service.store.directory.replace(/[\\/]runs$/,''),sample:samples().slice(0,2),collector:{close:async()=>{}}});
  try {
    assert.equal((await (await fetch(`${restarted.url}/api/export`)).json()).counts.captured,2);
    assert.equal((await (await fetch(`${restarted.url}/api/status`)).json()).workerConcurrency,2);
  } finally { await restarted.close(); }
});
