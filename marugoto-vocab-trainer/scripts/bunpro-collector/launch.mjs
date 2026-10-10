import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.BUNPRO_COLLECTOR_PORT || 4319);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port không hợp lệ.');
const url = `http://127.0.0.1:${port}`;
async function healthy() {
  try { const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) }); return response.ok && (await response.json()).app === 'bunpro-collector'; }
  catch { return false; }
}
if (!await healthy()) {
  const directory = fileURLToPath(new URL('../../data/bunpro-collector/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const log = await open(`${directory}/service.log`, 'a');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))],
    { detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd], cwd: fileURLToPath(new URL('../../', import.meta.url)) });
  child.unref(); await log.close();
  let started = false;
  for (let i = 0; i < 30; i++) { if (await healthy()) { started = true; break; } await new Promise(resolve => setTimeout(resolve, 300)); }
  if (!started) throw new Error(`Không khởi động được. Xem ${directory}/service.log hoặc chạy npm run collector:serve.`);
}
console.log(`Dashboard: ${url}\nWorker chạy nền; đóng terminal không dừng worker. Giữ máy thức khi thu thập.`);
const command = process.platform === 'win32' ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
const args = process.platform === 'win32' ? ['-NoProfile','-NonInteractive','-Command', `Start-Process -FilePath '${url}'`] : [url];
const browser = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
browser.on('error', () => console.log(`Mở thủ công ${url}`)); browser.unref();
