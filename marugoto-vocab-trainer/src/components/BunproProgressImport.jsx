import React, { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { downloadProgress, parseProgress, progressCsv, progressTemplate, stageLabel } from '../bunproProgress.js';

const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
const statuses = { NEW: 'Mới', UPDATE: 'Thay đổi', UNCHANGED: 'Giữ nguyên', ERROR: 'Cần xử lý' };
const dueSources = { WEB: 'Từ web', LOCAL: 'Giữ hạn local', CALCULATED: 'Tính tại local', MASTER: 'Không ôn định kỳ' };
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function BunproProgressImport({ onChanged }) {
  const [text, setText] = useState(''), [preview, setPreview] = useState(null), [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [page, setPage] = useState(1);
  const lock = useRef(false);
  async function action(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  function edit(value) { setText(value); setPreview(null); setSelected(new Set()); }
  async function inspect() {
    await action(async () => {
      const data = await api('/api/bunpro/progress/preview', post({ rows: parseProgress(text) }));
      setPreview(data); setPage(1); setSelected(new Set(data.rows.filter(r => r.status !== 'ERROR').map(r => r.index)));
    });
  }
  const valid = preview?.rows.filter(r => r.status !== 'ERROR') || [];
  return <section className="progress-import" aria-label="Nhập tiến độ Bunpro">
    <h2>Nhập tiến độ Bunpro</h2>
    <p>Nhập cả Vocabulary và Grammar trong một danh sách. Web là nguồn chuẩn cho các dòng bạn chọn; các mục ngoài danh sách giữ tiến độ hiện có.</p>
    <p className="catalog-coverage">Ghép bằng ID local hoặc link Bunpro, không ghép bằng cách đọc. Cấp SRS: 0–12. Hạn ôn dùng ISO 8601 có múi giờ; bỏ trống để giữ hạn local hoặc tính hạn cho mục mới.</p>
    <div className="inline-actions">
      <button disabled={busy} className="button-secondary" onClick={() => downloadProgress('bunpro-progress-template.json', JSON.stringify(progressTemplate, null, 2))}>Mẫu JSON</button>
      <button disabled={busy} className="button-secondary" onClick={() => downloadProgress('bunpro-progress-template.csv', progressCsv(progressTemplate), 'text/csv')}>Mẫu CSV</button>
      <button disabled={busy || !text.trim()} className="button-secondary" onClick={() => action(async () => {
        downloadProgress('bunpro-progress-input.json', JSON.stringify(parseProgress(text), null, 2));
      })}>Lưu danh sách nhập JSON</button>
      {['JSON', 'CSV'].map(format => <button key={format} disabled={busy} className="button-secondary" onClick={() => action(async () => {
        const rows = await api('/api/bunpro/progress/export');
        downloadProgress(`bunpro-progress.${format.toLowerCase()}`, format === 'JSON' ? JSON.stringify(rows, null, 2) : progressCsv(rows), format === 'JSON' ? 'application/json' : 'text/csv');
        setNotice('Đã xuất tiến độ. Cấp trống là mục cũ chưa xác định bậc; cần điền cấp chính xác trước khi nhập lại.');
      })}>Xuất tiến độ {format}</button>)}
      <label className="button-secondary vocab-file">Chọn file<input aria-label="Chọn file tiến độ" type="file" accept=".json,.csv,.tsv,.txt" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (file) action(async () => { if (file.size > 5 * 1024 * 1024) throw new Error('Tệp vượt 5 MB.'); edit(await file.text()); });
      }} /></label>
    </div>
    <label>Danh sách JSON, CSV hoặc bảng từ bảng tính<textarea disabled={busy} rows={9} value={text} onChange={e => edit(e.target.value)} placeholder="kind&#9;sourceUrl&#9;stage&#9;dueAt" /></label>
    <button disabled={busy || !text.trim()} className="button-primary" onClick={inspect}>Xem trước tiến độ</button>
    {error && <p className="catalog-error" role="alert">{error}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {preview && <>
      <h3>Đối chiếu trước khi nhập</h3>
      <p>{Object.entries(statuses).map(([key, label]) => `${label}: ${preview.rows.filter(r => r.status === key).length}`).join(' · ')}</p>
      <p className="catalog-coverage">Bản xem trước hết hạn lúc {date(preview.expiresAt)}. Mục cần hoàn thiện nội dung vẫn nhận tiến độ, nhưng chưa vào hàng đợi học.</p>
      <div className="inline-actions">
        <button disabled={busy} className="button-secondary" onClick={() => setSelected(new Set(valid.map(r => r.index)))}>Chọn toàn bộ {valid.length} dòng hợp lệ</button>
        <button disabled={busy} className="text-button" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
        <button disabled={busy || !selected.size} className="button-primary" onClick={() => action(async () => {
          const result = await api('/api/bunpro/progress/apply', post({ previewId: preview.previewId, indexes: [...selected] }));
          setPreview(null); setSelected(new Set());
          setNotice(`Đã xử lý ${result.rows.length} mục. Sao lưu trước khi nhập: ${result.backupPath}`);
          await onChanged();
        })}>{busy ? 'Đang xử lý…' : `Áp dụng ${selected.size} dòng đã chọn`}</button>
      </div>
      <p className="catalog-coverage">Trên màn hình nhỏ, vuốt ngang bảng để xem đủ cấp, hạn ôn và kết quả từng dòng.</p>
      <div className="progress-table-scroll"><table className="progress-table"><thead><tr><th>Chọn</th><th>Mục</th><th>Cấp trước → sau</th><th>Hạn trước → sau</th><th>Kết quả</th></tr></thead><tbody>
        {preview.rows.slice((page - 1) * 100, page * 100).map(row => <tr key={row.index}>
          <td><input type="checkbox" aria-label={`Nhập dòng ${row.index + 1}`} disabled={busy || row.status === 'ERROR'} checked={selected.has(row.index)} onChange={e => setSelected(old => { const next = new Set(old); e.target.checked ? next.add(row.index) : next.delete(row.index); return next; })} /></td>
          <td>{row.index + 1}. {row.title || row.input?.sourceUrl || row.input?.entryId}<small>{row.input?.kind}{row.needsReview && ' · Cần hoàn thiện nội dung'}</small></td>
          <td>{row.beforeStage != null ? stageLabel(row.beforeStage) : row.beforeTier ? `${row.beforeTier} · chưa xác định bậc` : 'Chưa học'} → {row.stage != null ? stageLabel(row.stage) : '—'}</td>
          <td>{date(row.beforeDueAt)} → {date(row.dueAt)}<small>{dueSources[row.dueSource]}</small></td>
          <td>{statuses[row.status]}<small>{row.message}</small></td>
        </tr>)}
      </tbody></table></div>
      <div className="catalog-pagination"><button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(preview.rows.length / 100))}</span><button disabled={busy || page * 100 >= preview.rows.length} onClick={() => setPage(page + 1)}>Sau</button></div>
    </>}
  </section>;
}
