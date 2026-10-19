import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BrowserCollector } from './browser.mjs';
import { RunStore, Worker, writeJson, counts } from './store.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const root = path.join(project, 'backend/src/main/resources/bunpro');
const collector = new BrowserCollector(path.join(project, 'data/bunpro-collector/profile'));
let timer;
try {
  const context = await collector.ensureBrowser();
  const page = await context.newPage();
  await page.goto('https://bunpro.jp/grammar_points', {waitUntil:'networkidle', timeout:60000});
  const entries = await page.evaluate(() => [...document.querySelectorAll('li[id^="lesson-"]')].flatMap(lesson => {
    const number = Number(lesson.querySelector('header strong')?.textContent.match(/\d+/)?.[0]);
    return [...lesson.querySelectorAll('a[href^="/grammar_points/"]')].filter(a => [...a.querySelectorAll('span')].some(s => s.textContent.trim() === 'N4')).map(a => ({
      lesson:number, title:a.querySelector('h4')?.textContent.trim(),
      paragraphs:[...a.querySelectorAll('p')].map(p=>p.textContent.trim()), url:new URL(a.getAttribute('href'), location.origin).href,
    }));
  }));
  await page.close();
  if (!entries.length || new Set(entries.map(e=>e.url)).size !== entries.length || new Set(entries.map(e=>e.lesson)).size !== 10) throw new Error('Danh mục N4 thiếu lesson hoặc trùng URL.');
  const source = {source:'https://bunpro.jp/grammar_points', level:'N4', capturedAt:new Date().toISOString(), expectedCount:entries.length, entries};
  await writeJson(path.join(root, 'n4-grammar-source.json'), source);
  const items = entries.map(e => ({id:createHash('sha256').update(`GRAMMAR:${e.url}`).digest('hex').slice(0,24), kind:'GRAMMAR', level:'N4', lesson:e.lesson, title:e.title, sourceUrl:e.url, status:'QUEUED', completeness:'NOT_CHECKED', attempts:0, error:null, exampleCount:0}));
  const store = await new RunStore(path.join(project, 'data/bunpro-n4-grammar/runs'), items).init();
  if (store.run.scope !== 'N4_GRAMMAR_ALL') await store.create(items, 'N4_GRAMMAR_ALL');
  const worker = new Worker(store, collector, {concurrency:Number(process.argv[2] || 4)});
  await worker.setConcurrency(worker.concurrency);
  console.log(`N4 grammar: ${entries.length} patterns; run ${store.run.id}`);
  timer = setInterval(()=>console.log(JSON.stringify({status:store.run.status,reason:store.run.reason,...counts(store.run)})),15000);
  if(store.run.items.some(e=>e.status==='FAILED')) await worker.retry();
  else await worker.start();
  await worker.task;
  const capture = await store.export();
  await writeJson(path.join(project,'data/bunpro-n4-grammar/capture.json'),capture);
  console.log(JSON.stringify({status:store.run.status,reason:store.run.reason,...counts(store.run)}));
  if(capture.counts.captured !== entries.length) process.exitCode = 1;
} finally { clearInterval(timer); await collector.close(); }
