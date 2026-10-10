import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { filterVocab, TIERS, TIER_LABELS, POS_LABELS, validIntervals } from '../bunproVocab.js';
import { BunproVocabDetail } from './BunproVocabDetail.jsx';
import { BunproGrammarDetail } from './BunproGrammarDetail.jsx';
import { BunproProgressReview } from './BunproProgressReview.jsx';

const jsonRequest = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function BunproCatalogWorkspace({ onConjugation, kind = 'VOCAB', initialView = 'catalog' }) {
  const grammar = kind === 'GRAMMAR', noun = grammar ? 'mẫu' : 'từ';
  const base = grammar ? '/api/bunpro/grammar/progress' : '/api/bunpro/vocab';
  const Detail = grammar ? BunproGrammarDetail : BunproVocabDetail;
  const [entries, setEntries] = useState([]);
  const [level, setLevel] = useState('N5');
  const [view, setView] = useState(initialView);
  const [filters, setFilters] = useState({ search: '', lesson: 'all', tier: 'all', pos: 'all', state: 'all' });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [batchTier, setBatchTier] = useState('BEGINNER');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [capture, setCapture] = useState(null);
  const [preview, setPreview] = useState(null);
  const [settings, setSettings] = useState(null);
  const alive = useRef(false), listVersion = useRef(0), detailVersion = useRef(0), actionLock = useRef(false);
  const opener = useRef(null), panel = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; listVersion.current++; detailVersion.current++; }; }, []);
  async function load() {
    const version = ++listVersion.current;
    setLoading(true);
    try {
      const data = await api(`${base}/entries?level=${level}`);
      if (alive.current && version === listVersion.current) setEntries(data);
    } catch (e) { if (alive.current && version === listVersion.current) setError(e.message); }
    finally { if (alive.current && version === listVersion.current) setLoading(false); }
  }
  async function loadDetail(id) {
    const version = ++detailVersion.current;
    setDetailLoading(true); setDetail(null);
    try {
      const data = await api(`${base}/entries/${id}`);
      if (alive.current && version === detailVersion.current) setDetail(data);
    } catch (e) { if (alive.current && version === detailVersion.current) setError(e.message); }
    finally { if (alive.current && version === detailVersion.current) setDetailLoading(false); }
  }
  useEffect(() => { load(); setChecked(new Set()); setSelectedId(null); setDetail(null); setPage(1); setFilters(f => ({ ...f, lesson: 'all' })); }, [level]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else { detailVersion.current++; setDetail(null); setDetailLoading(false); } }, [selectedId]);
  useEffect(() => setPage(1), [filters]);
  useEffect(() => {
    if (!detail || !panel.current) return;
    panel.current.querySelector('button')?.focus();
  }, [detail?.id]);
  function closeDetail() { setSelectedId(null); opener.current?.focus(); }
  useEffect(() => {
    if (!selectedId) return;
    const key = e => {
      if (e.key === 'Escape' && !actionLock.current) { e.preventDefault(); closeDetail(); }
      if (e.key === 'Tab' && window.matchMedia('(max-width:850px)').matches && panel.current) {
        const nodes = [...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    const narrow = window.matchMedia('(max-width:850px)').matches, oldOverflow = document.body.style.overflow;
    if (narrow) document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); if (narrow) document.body.style.overflow = oldOverflow; };
  }, [selectedId]);
  async function action(callback) {
    if (actionLock.current) return false;
    actionLock.current = true; setBusy(true); setError(''); setNotice('');
    try { await callback(); return true; } catch (e) { if (alive.current) setError(e.message); return false; }
    finally { actionLock.current = false; if (alive.current) setBusy(false); }
  }
  async function refresh() { await load(); if (selectedId) await loadDetail(selectedId); }
  async function assign(ids, tier) {
    await action(async () => {
      await api(`${base}/tiers`, jsonRequest('PUT', { entryIds: ids, tier }));
      setChecked(new Set()); setNotice(`Đã gán ${ids.length} ${noun} vào ${TIER_LABELS[tier]}.`); await refresh();
    });
  }
  async function learn(id) {
    await action(async () => { await api(`${base}/entries/${id}/learn`, { method: 'POST' }); setNotice('Đã kích hoạt Beginner, có thể ôn ngay trong Ôn Bunpro.'); await refresh(); });
  }
  async function save(id, content) {
    return action(async () => { await api(`${base}/entries/${id}`, jsonRequest('PUT', content)); setNotice('Đã lưu chỉnh sửa cá nhân.'); await refresh(); });
  }
  async function readCapture(file) {
    if (!file) return;
    setCapture(null); setPreview(null);
    await action(async () => {
      if (file.size > 50 * 1024 * 1024) throw new Error('Tệp vượt 50 MB.');
      let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('Tệp không phải JSON hợp lệ.'); }
      const report = await api(`${base}/capture/preview`, jsonRequest('POST', data));
      setCapture(data); setPreview(report);
    });
  }
  const visible = useMemo(() => filterVocab(entries, filters), [entries, filters]);
  const pages = Math.max(1, Math.ceil(visible.length / 50)), currentPage = Math.min(page, pages), items = visible.slice((currentPage - 1) * 50, currentPage * 50);
  const lessons = [...new Set(entries.map(e => e.lesson))];
  const due = entries.filter(e => e.learningStatus === 'DUE').length;
  const filter = (field, value) => setFilters(f => ({ ...f, [field]: value }));
  const toggle = id => setChecked(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <section className="catalog-workspace vocab-workspace" aria-labelledby="bunpro-catalog-heading">
    <div className="workspace-heading"><div><span className="eyebrow">{grammar ? 'Kho ngữ pháp Bunpro' : 'Kho từ vựng Bunpro'}</span><h1 id="bunpro-catalog-heading">Bunpro <span className="catalog-level">{level}</span></h1><p>{grammar ? 'Xem cấu trúc, luyện mẫu câu và chủ động xếp mức học. Lịch ôn ngữ pháp được lưu riêng.' : 'Tra nghĩa, xem ví dụ và chủ động xếp mức học. Lịch ôn Bunpro được lưu riêng.'}</p></div><div className="catalog-summary"><strong>{entries.length.toLocaleString('vi-VN')}</strong><span>{noun} · {due} đến hạn ôn</span></div></div>
    <nav className="catalog-subnav" aria-label="Kho và ôn Bunpro">{[['catalog', grammar ? 'Kho ngữ pháp' : 'Kho từ'], ['review', `Ôn Bunpro (${due})`]].map(([id, label]) => <button key={id} disabled={busy} aria-current={view === id ? 'page' : undefined} onClick={() => { closeDetail(); setView(id); }}>{label}</button>)}</nav>
    {error && <div className="catalog-error" role="alert">{error}<button className="text-button" onClick={() => { setError(''); if (selectedId) loadDetail(selectedId); else load(); }}>Thử tải lại</button></div>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {view === 'review' ? <BunproProgressReview kind={kind} base={base} level={level} onChanged={load} /> : <>
      <div className="vocab-progress" aria-label="Tiến độ theo mức">{[...TIERS, 'NEW'].map(t => <button key={t} className={`vocab-progress-cell tier-${t.toLowerCase()}`} aria-pressed={filters.tier === t} onClick={() => filter('tier', filters.tier === t ? 'all' : t)}><span>{TIER_LABELS[t]}</span><strong>{entries.filter(e => (e.tier || 'NEW') === t).length}</strong></button>)}</div>
      <div className="vocab-tools">{!grammar && <label className="button-secondary vocab-file">{busy ? 'Đang xử lý…' : 'Nhập JSON nguồn'}<input aria-label="Nhập JSON nguồn" type="file" accept=".json,application/json" disabled={busy} onChange={e => { readCapture(e.target.files?.[0]); e.target.value = ''; }} /></label>}<button className="button-secondary" disabled={busy} onClick={() => action(async () => setSettings((await api(`${base}/intervals`)).days))}>Cài đặt chu kỳ</button><span className="catalog-coverage">{entries.reduce((sum, e) => sum + e.exampleCount, 0).toLocaleString('vi-VN')} ví dụ đã nhập</span></div>
      {preview && <section className="vocab-import-preview" aria-label="Xem trước dữ liệu nhập"><h2>Xem trước JSON nguồn</h2><p>{preview.words} từ · {preview.examples} ví dụ · {preview.matched} khớp kho · {preview.newWords} từ mới</p><p>{preview.unclassified} từ chưa phân loại · {preview.unknownLabels} nhãn chưa nhận diện</p><p className="catalog-coverage">Nội dung giữ trạng thái cần đối chiếu. Nhập dữ liệu không tạo lịch ôn.</p>{preview.errors.length > 0 && <div role="alert"><h3>Cần sửa trước khi nhập</h3><ul>{preview.errors.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}<div className="inline-actions"><button className="button-primary" disabled={busy || !capture || preview.errors.length > 0} onClick={() => action(async () => { await api(`${base}/capture/import`, jsonRequest('POST', capture)); setPreview(null); setCapture(null); setNotice('Đã nhập nguồn, giữ nguyên bản Việt và tiến độ hiện có.'); await refresh(); })}>Nhập {preview.words} từ</button><button className="button-secondary" disabled={busy} onClick={() => { setCapture(null); setPreview(null); }}>Hủy</button></div></section>}
      {settings && <form className="vocab-interval-settings" onSubmit={e => { e.preventDefault(); action(async () => { await api(`${base}/intervals`, jsonRequest('PUT', { days: settings })); setSettings(null); setNotice('Đã lưu chu kỳ. Áp dụng từ lần ôn hoặc gán mức tiếp theo.'); }); }}><h2>Giới hạn interval theo mức</h2><div>{TIERS.map((tier, i) => <label key={tier}>{TIER_LABELS[tier]} (ngày)<input type="number" min="1" max="36500" step="1" value={settings[i]} onChange={e => setSettings(old => old.map((day, j) => j === i ? Number(e.target.value) : day))} /></label>)}</div><p className="catalog-coverage">FSRS có thể hẹn sớm hơn. Chu kỳ phải tăng dần; thay đổi không dời hạn ôn hiện tại.</p><div className="inline-actions"><button disabled={busy || !validIntervals(settings)} className="button-primary">Lưu chu kỳ</button><button type="button" disabled={busy} className="button-secondary" onClick={() => setSettings(null)}>Hủy</button></div></form>}
      <div className="catalog-toolbar">
        <label className="catalog-search">Tìm kiếm<input type="search" value={filters.search} placeholder={grammar ? "Mẫu ngữ pháp, nghĩa, cách dùng…" : "Từ Nhật, cách đọc, nghĩa…"} onChange={e => filter('search', e.target.value)} /></label>
        <label>Cấp độ<select value={level} disabled={busy} onChange={e => setLevel(e.target.value)}><option>N5</option><option>N4</option></select></label>
        <label>Lesson<select value={filters.lesson} onChange={e => filter('lesson', e.target.value)}><option value="all">Tất cả</option>{lessons.map(l => <option key={l} value={l}>Lesson {l}</option>)}</select></label>
        <label>Mức học<select value={filters.tier} onChange={e => filter('tier', e.target.value)}><option value="all">Tất cả</option>{[...TIERS, 'NEW'].map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select></label>
        {!grammar && <label>Loại từ<select value={filters.pos} onChange={e => filter('pos', e.target.value)}><option value="all">Tất cả</option>{Object.entries(POS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="unknown">Chưa phân loại</option></select></label>}
        <label>Trạng thái<select value={filters.state} onChange={e => filter('state', e.target.value)}><option value="all">Tất cả</option><option value="DUE">Đến hạn</option><option value="incomplete">Cần kiểm tra</option></select></label>
      </div>
      <div className="vocab-batch"><label className="vocab-check"><input type="checkbox" disabled={busy || !items.length} checked={items.length > 0 && items.every(e => checked.has(e.id))} onChange={e => setChecked(old => { const next = new Set(old); items.forEach(item => e.target.checked ? next.add(item.id) : next.delete(item.id)); return next; })} />Chọn trang này</label><span>{checked.size} {noun} đã chọn</span><select aria-label="Mức để gán hàng loạt" value={batchTier} onChange={e => setBatchTier(e.target.value)}>{TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select><button className="button-secondary" disabled={busy || !checked.size} onClick={() => assign([...checked], batchTier)}>Gán mức</button>{checked.size > 0 && <button className="text-button" disabled={busy} onClick={() => setChecked(new Set())}>Bỏ chọn</button>}</div>
      {loading ? <div className="catalog-loading" role="status">Đang tải kho {level}…</div> : <div className={`catalog-layout ${selectedId ? 'has-detail' : ''}`}>
        <div><div className="catalog-list" aria-label={grammar ? "Danh sách ngữ pháp Bunpro" : "Danh sách từ Bunpro"}>{!items.length && <div className="workspace-empty"><h2>{entries.length ? `Không có ${noun} khớp bộ lọc` : `Chưa có dữ liệu ${level}`}</h2><p>{entries.length ? 'Thử đổi lesson hoặc mức học.' : 'Kho hiện có dữ liệu N5.'}</p></div>}
          {items.map(entry => <div className="vocab-selectable-row" key={entry.id}><input type="checkbox" aria-label={`Chọn ${entry.content.title}`} checked={checked.has(entry.id)} disabled={busy} onChange={() => toggle(entry.id)} /><button type="button" disabled={busy} className="catalog-row" aria-pressed={entry.id === selectedId} onClick={e => { opener.current = e.currentTarget; setSelectedId(entry.id); }}><span className="catalog-term" lang="ja">{entry.content.title}<small>{entry.content.reading}</small></span><span className="catalog-meaning">{entry.content.meaningVi || entry.content.meaningEn}<small>{grammar ? 'Ngữ pháp' : entry.partsOfSpeech.map(t => POS_LABELS[t] || t).join(' · ') || 'Chưa phân loại'} · {entry.exampleCount} ví dụ</small></span><span className={`catalog-state ${entry.learningStatus.toLowerCase()}`}>{TIER_LABELS[entry.tier || 'NEW']}{entry.learningStatus === 'DUE' && <small>Đến hạn</small>}</span></button></div>)}
        </div><div className="catalog-pagination"><button className="button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button><span>Trang {currentPage} / {pages} · {visible.length} {noun}</span><button className="button-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div></div>
        {selectedId && <div ref={panel} className="vocab-detail-host">{detailLoading ? <aside className="catalog-detail vocab-detail"><button className="text-button" onClick={closeDetail}>Đóng</button><div className="catalog-loading" role="status">Đang tải chi tiết…</div></aside> : detail ? <Detail key={`${detail.id}-${detail.revision}`} entry={detail} busy={busy} onClose={closeDetail} onAssign={assign} onLearn={learn} onSave={save} onConjugation={onConjugation} /> : <aside className="catalog-detail vocab-detail"><p>Chưa tải được chi tiết.</p><button className="button-secondary" onClick={() => loadDetail(selectedId)}>Thử lại</button><button className="text-button" onClick={closeDetail}>Đóng</button></aside>}</div>}
      </div>}
    </>}
  </section>;
}
