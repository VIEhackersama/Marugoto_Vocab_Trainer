// Local end-to-end check. Requires compiled backend classes and
// backend/target/ui-classpath.txt (mvn dependency:build-classpath).
// All writes are isolated in a new backend/target/progress-ui-* directory.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer as netServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=path.join(root,'backend');
const folder=await mkdtemp(path.join(backend,'target','progress-ui-'));
const classpath=(await readFile(path.join(backend,'target','ui-classpath.txt'),'utf8')).trim();
async function freePort() {
  const s=netServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const port=s.address().port; await new Promise(r=>s.close(r)); return port;
}
const backendPort=await freePort(), uiPort=await freePort();
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin','java.exe'):'java';
const child=spawn(java,['-cp',`${path.join(backend,'target','classes')}${path.delimiter}${classpath}`,'vn.marugoto.trainer.VocabTrainerApplication',
  `--server.port=${backendPort}`,`--spring.datasource.url=jdbc:sqlite:${path.join(folder,'trainer.db')}`,
  `--app.data-dir=${folder}`,`--app.pdf-dir=${path.join(folder,'pdfs')}`],{cwd:backend,windowsHide:true,stdio:['ignore','pipe','pipe']});
const log=createWriteStream(path.join(folder,'server.log')); child.stdout.pipe(log); child.stderr.pipe(log);
let server,browser,page;
const apiRoot=`http://127.0.0.1:${backendPort}`;
const get=async endpoint=> { const r=await fetch(apiRoot+endpoint); assert.equal(r.status,200,endpoint); return r.json(); };
try {
  for(let i=0;i<120;i++) {
    try { await get('/api/bunpro/progress/export'); break; }
    catch(e) { if(child.exitCode!=null || i===119) throw e; await new Promise(r=>setTimeout(r,250)); }
  }
  server=await createServer({configFile:false,root,plugins:[react()],server:{host:'127.0.0.1',port:uiPort,strictPort:true,proxy:{'/api':apiRoot}}});
  await server.listen();
  browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:1366,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${uiPort}`);
  await page.getByRole('button',{name:'Bunpro',exact:true}).click();
  await page.locator('.catalog-row').first().waitFor();
  await page.getByRole('button', { name: 'Cài đặt chu kỳ', exact: true }).click();
  const intervals = await get('/api/bunpro/progress/intervals?kind=VOCAB');
  const intervalForm = page.locator('.vocab-interval-settings');
  assert.equal(await intervalForm.locator('input').count(), 11);
  assert.equal(await intervalForm.getByLabel('Beginner 0 (giờ)', { exact: true }).count(), 0);
  assert.equal(Number(await intervalForm.getByLabel('Beginner 1 (giờ)', { exact: true }).inputValue()), intervals.seconds[0] / 3600);
  assert.equal(Number(await intervalForm.getByLabel('Expert 2 (giờ)', { exact: true }).inputValue()), intervals.seconds[10] / 3600);
  const changedHours = intervals.seconds[0] / 3600 + 0.5;
  await intervalForm.getByLabel('Beginner 1 (giờ)', { exact: true }).fill(String(changedHours));
  await intervalForm.getByRole('button', { name: 'Lưu chu kỳ', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Đã lưu chu kỳ' }).waitFor();
  const storedIntervals = await get('/api/bunpro/progress/intervals?kind=VOCAB');
  assert.equal(storedIntervals.seconds[0], changedHours * 3600);
  assert.deepEqual(storedIntervals.seconds.slice(1), intervals.seconds.slice(1));
  await page.getByRole('button',{name:'Chọn toàn bộ 1100 kết quả lọc',exact:true}).click();
  await page.getByLabel('Mức để gán hàng loạt').selectOption('3');
  await page.getByRole('button',{name:'Gán mức',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Đã gán 1100'}).waitFor();
  const vocab=await get('/api/bunpro/vocab/entries?level=N5');
  assert(vocab.every(e=>e.stage===3),'selection must include results beyond the current page');
  const grammar=await get('/api/bunpro/grammar/progress/entries?level=N5');
  const rows=[{kind:'VOCAB',entryId:vocab[0].id,stage:5,dueAt:'2026-10-20T09:00:00+07:00'},
    {kind:'GRAMMAR',entryId:grammar[0].id,stage:12}, {kind:'VOCAB',entryId:'missing-id',stage:4}];
  await page.getByRole('button',{name:'Nhập tiến độ',exact:true}).click();
  const input=page.getByLabel('Danh sách JSON, CSV hoặc bảng từ bảng tính');
  await input.fill(JSON.stringify(rows));
  await page.getByRole('button',{name:'Xem trước tiến độ',exact:true}).click();
  await page.getByRole('heading',{name:'Đối chiếu trước khi nhập'}).waitFor();
  assert.equal(await page.getByRole('checkbox').count(),3);
  assert.equal(await page.getByRole('checkbox',{name:'Nhập dòng 3'}).isEnabled(),false);
  await page.screenshot({path:path.join(folder,'preview-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Áp dụng 2 dòng đã chọn',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Đã xử lý 2 mục'}).waitFor();
  const w=await get(`/api/bunpro/vocab/entries/${vocab[0].id}`);
  assert.equal(w.stage,5); assert.equal(Date.parse(w.dueAt),Date.parse(rows[0].dueAt)); assert.equal(w.reviewCount,0);
  const g=await get(`/api/bunpro/grammar/progress/entries/${grammar[0].id}`);
  assert.equal(g.stage,12); assert.equal(g.dueAt,null);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Xuất tiến độ CSV',exact:true}).click();
  const download=await downloadPromise; await download.saveAs(path.join(folder,'export.csv'));
  assert((await readFile(path.join(folder,'export.csv'),'utf8')).includes(vocab[0].id));
  const tsv=`kind\tentryId\tstage\tdueAt\nVOCAB\t${vocab[0].id}\t5\t${rows[0].dueAt}`;
  await input.fill(tsv); await page.getByRole('button',{name:'Xem trước tiến độ',exact:true}).click();
  await page.getByRole('heading',{name:'Đối chiếu trước khi nhập'}).waitFor();
  assert((await page.locator('.progress-table').innerText()).includes('Giữ nguyên'));
  // A real local progress change after preview must be visible as a conflict.
  await fetch(apiRoot+'/api/bunpro/progress/stages',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'VOCAB',entryIds:[vocab[0].id],stage:6})});
  await page.getByRole('button',{name:'Áp dụng 1 dòng đã chọn',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Tiến độ đã đổi'}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(folder,'preview-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'page must not overflow on mobile');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,checks:['stage 1–11 interval labels and persistence','1100 filtered selections','mixed preview/apply','invalid row disabled','offset date','Master queue state','CSV download','TSV paste','stale conflict','mobile overflow','no page errors'],screenshots:['preview-desktop.png','preview-mobile.png']},null,2));
  console.log(`Bunpro progress UI checks passed: ${folder}`);
} catch(error) {
  if(page) {
    await page.screenshot({path:path.join(folder,'failure.png'),fullPage:true}).catch(()=>{});
    await writeFile(path.join(folder,'failure.txt'),await page.locator('body').innerText().catch(()=>''));
  }
  throw error;
} finally {
  await browser?.close(); await server?.close(); child.kill(); log.end();
}
