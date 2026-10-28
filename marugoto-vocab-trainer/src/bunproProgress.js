export const SRS_STAGES = Array.from({ length: 13 }, (_, i) => i);
export function stageLabel(stage) {
  if (stage >= 0 && stage <= 3) return `Beginner ${stage}`;
  if (stage <= 6 && stage >= 4) return `Adept ${stage - 3}`;
  if (stage <= 9 && stage >= 7) return `Seasoned ${stage - 6}`;
  if (stage === 10 || stage === 11) return `Expert ${stage - 9}`;
  return stage === 12 ? 'Master' : 'Chưa xác định bậc';
}
export function progressLabel(entry) {
  if (entry.stage != null) return stageLabel(entry.stage);
  if (!entry.tier) return 'Chưa học';
  return `${{ BEGINNER: 'Beginner', ADEPT: 'Adept', SEASONED: 'Seasoned', EXPERT: 'Expert', MASTER: 'Master' }[entry.tier]} · chưa xác định bậc`;
}
const columns = ['kind', 'entryId', 'sourceUrl', 'stage', 'dueAt', 'title', 'reading'];
// RFC 4180 quoting, including embedded newlines and doubled quotes; TSV paste uses
// the same rules. Never split a quoted field on delimiters or line breaks.
function table(text, delimiter) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === delimiter || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== delimiter) { if (row.some(x => x.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else { if (closed || c === '"') throw new Error('Dấu ngoặc kép trong bảng không hợp lệ.'); field += c; }
  }
  if (quoted) throw new Error('Thiếu dấu đóng ngoặc kép.');
  row.push(field); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
export function parseProgress(text) {
  text = text.replace(/^\uFEFF/, '').replace(/^[ \r\n]+|[ \r\n]+$/g, '');
  if (!text.trim()) throw new Error('Nhập hoặc dán danh sách tiến độ.');
  let rows;
  if (text.startsWith('[') || text.startsWith('{')) {
    let value; try { value = JSON.parse(text); } catch { throw new Error('JSON không hợp lệ.'); }
    rows = Array.isArray(value) ? value : value.rows;
  } else {
    const data = table(text, text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',');
    const headers = (data.shift() || []).map(x => x.trim());
    if (new Set(headers).size !== headers.length || !headers.includes('kind') || !headers.includes('stage') || !headers.some(h => ['entryId', 'sourceUrl'].includes(h)))
      throw new Error('Cần tiêu đề kind, stage và entryId hoặc sourceUrl. Dùng file mẫu để giữ đúng cột.');
    rows = data.map((values, i) => {
      if (values.length !== headers.length) throw new Error(`Dòng ${i + 2}: số cột không khớp tiêu đề.`);
      return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
    });
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Cần từ 1 đến 10.000 dòng.');
  return rows.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Dòng ${i + 1} không phải đối tượng.`);
    const stage = row.stage === '' || row.stage == null ? null : Number(row.stage);
    if (stage != null && !Number.isInteger(stage)) throw new Error(`Dòng ${i + 1}: cấp SRS phải là số nguyên.`);
    const dueAt = String(row.dueAt || '').trim();
    if (dueAt && (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(dueAt) || !Number.isFinite(Date.parse(dueAt))))
      throw new Error(`Dòng ${i + 1}: hạn ôn cần ISO 8601 có múi giờ, ví dụ 2026-10-20T09:00:00+07:00.`);
    return { kind: String(row.kind || '').trim().toUpperCase(), entryId: String(row.entryId || '').trim(), sourceUrl: String(row.sourceUrl || '').trim(),
      stage, dueAt: dueAt || null, title: String(row.title || ''), reading: String(row.reading || '') };
  });
}
export function progressCsv(rows) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.join(','), ...rows.map(row => columns.map(c => quote(row[c])).join(','))].join('\r\n');
}
export function downloadProgress(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const progressTemplate = [{ kind: 'VOCAB', sourceUrl: 'https://bunpro.jp/vocabs/私', stage: 5, dueAt: '', title: '私', reading: 'わたし' },
  { kind: 'GRAMMAR', entryId: 'THAY_BANG_ID_LOCAL_TU_FILE_XUAT', stage: 2, dueAt: '', title: '', reading: '' }];
