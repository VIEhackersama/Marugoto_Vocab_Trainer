// Shared infrastructure for exam acceptance checks. Every run owns its processes
// and a fresh database under target; it never uses the application's live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function createExamHarness({ prefix, apiPort, webPort }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const backend = path.join(root, 'backend');
  const report = await readFile(path.join(backend, 'target/surefire-reports/TEST-vn.marugoto.trainer.ExamIntegrationTest.xml'), 'utf8');
  const entities = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
  const classpath = report.match(/<property name="java.class.path" value="([^"]+)"/)?.[1]
    ?.replace(/&(amp|quot|lt|gt|apos);/g, (_, name) => entities[name]);
  assert.ok(classpath, 'Run backend ExamIntegrationTest first to generate the runtime classpath.');
  for (const port of [apiPort, webPort]) {
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, `Invalid verification port: ${port}`);
    const probe = createServer();
    probe.listen(port, '127.0.0.1');
    await once(probe, 'listening');
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  }
  assert.notEqual(apiPort, webPort, 'Backend and frontend verification ports must differ.');
  const output = await mkdtemp(path.join(backend, 'target', prefix));
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  const children = [], errors = [];
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', javaName) : javaName;
  const javaArgs = ['--enable-native-access=ALL-UNNAMED', '-cp', classpath, 'vn.marugoto.trainer.VocabTrainerApplication',
    `--server.port=${apiPort}`, `--spring.datasource.url=jdbc:sqlite:${path.join(output, 'trainer.db').replaceAll('\\', '/')}`,
    `--app.data-dir=${output}`, `--app.pdf-dir=${path.join(output, 'pdfs')}`];

  function start(command, args, file, options = {}) {
    const stream = createWriteStream(path.join(output, file));
    const child = spawn(command, args, { cwd: root, windowsHide: true, ...options });
    child.stdout?.pipe(stream, { end: false }); child.stderr?.pipe(stream, { end: false });
    child.on('error', error => { child.startError = error; errors.push(error.message); });
    child.on('close', () => stream.end());
    children.push(child);
    return child;
  }
  async function ready(url, child) {
    for (let i = 0; i < 120; i++) {
      if (child.startError) throw child.startError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Service exited; logs: ${output}`);
      try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
      await delay(500);
    }
    throw new Error(`Service not ready: ${url}; logs: ${output}`);
  }
  async function stop(child) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), delay(5000)]);
    }
  }
  async function api(url, body, method = 'POST') {
    const response = await fetch(apiBase + url, body === undefined ? {} : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  }
  async function postman(args, name) {
    const child = start(process.platform === 'win32' ? 'postman.exe' : 'postman', [
      'request', ...args, '--script-post-request', '@' + path.join(root, `scripts/exams-${name}.assert.js`),
      '--timeout', '5000', '--output', path.join(output, `postman-${name}.json`),
    ], `postman-${name}.log`);
    const [exitCode] = await once(child, 'exit');
    assert.equal(exitCode, 0, `Postman ${name} assertions failed; see ${output}`);
  }
  async function close() { for (const child of children.reverse()) await stop(child); }
  return { root, backend, output, apiBase, webBase, java, javaArgs, errors, start, ready, stop, api, postman, close };
}
