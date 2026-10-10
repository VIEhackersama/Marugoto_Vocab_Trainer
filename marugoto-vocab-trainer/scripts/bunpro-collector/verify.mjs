const port = Number(process.env.BUNPRO_COLLECTOR_PORT || 4319);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port không hợp lệ.');
console.log('Đối chiếu lại 2 trang ngữ pháp + 2 trang từ vựng bằng phiên đăng nhập của worker…');
const response = await fetch(`http://127.0.0.1:${port}/api/verify`, { method:'POST', signal:AbortSignal.timeout(260_000) });
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
