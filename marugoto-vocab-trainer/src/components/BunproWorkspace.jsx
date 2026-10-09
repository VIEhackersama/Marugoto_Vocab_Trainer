import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { filterCatalog, contentReady, LEARNING_LABELS, CONTENT_LABELS } from '../bunpro.js';
import './bunpro.css';

function ContentEditor({ entry, onSave, onCancel, busy }) {
  const [draft, setDraft] = useState(() => structuredClone(entry.content));
  const grammar = entry.kind === 'GRAMMAR';
  const set = (name, value) => setDraft(d => ({ ...d, [name]: value }));
  function sentence(index, name, value) {
    setDraft(d => ({ ...d, sentences: d.sentences.map((s, i) => i === index ? { ...s, [name]: value } : s) }));
  }
  return <form className="catalog-editor" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h3>Kiểm tra nội dung tiếng Việt</h3>
    <label>Nghĩa tiếng Việt<textarea required value={draft.meaningVi || ''} onChange={e => set('meaningVi', e.target.value)} /></label>
    {grammar && <>
      <label>Cấu trúc kết hợp<textarea required value={draft.structure || ''} onChange={e => set('structure', e.target.value)} /></label>
      <label>Giải thích cách dùng<textarea required value={draft.explanationVi || ''} onChange={e => set('explanationVi', e.target.value)} /></label>
      {(draft.sentences || []).map((s, i) => <fieldset key={s.id}><legend>Câu luyện tập {i + 1}</legend>
        <label>Câu hỏi (đặt {'{{blank}}'} ở chỗ trống)<textarea required value={s.prompt} onChange={e => sentence(i, 'prompt', e.target.value)} /></label>
        <label>Đáp án (mỗi dòng một đáp án)<textarea required value={(s.answers || []).join('\n')} onChange={e => sentence(i, 'answers', e.target.value.split('\n'))} /></label>
        {[['sentence', 'Câu hoàn chỉnh'], ['reading', 'Cách đọc cả câu'], ['translationVi', 'Bản dịch'], ['explanationVi', 'Giải thích đáp án']].map(([name, label]) =>
          <label key={name}>{label}<textarea required value={s[name] || ''} onChange={e => sentence(i, name, e.target.value)} /></label>)}
        <label className="catalog-check"><input type="checkbox" checked={s.status === 'VERIFIED'} onChange={e => sentence(i, 'status', e.target.checked ? 'VERIFIED' : 'DRAFT')} />Tôi đã kiểm tra câu và đáp án</label>
      </fieldset>)}
      <button type="button" className="text-button" onClick={() => setDraft(d => ({ ...d, sentences: [...(d.sentences || []), {
        id: crypto.randomUUID(), prompt: '{{blank}}', answers: [], sentence: '', reading: '', translationVi: '', explanationVi: '', status: 'DRAFT',
      }] }))}>Thêm câu luyện tập</button>
    </>}
    <label className="catalog-check"><input type="checkbox" checked={draft.status === 'VERIFIED'} onChange={e => set('status', e.target.checked ? 'VERIFIED' : 'DRAFT')} />Tôi đã kiểm tra nghĩa{grammar ? ', cấu trúc và cách dùng' : ''}</label>
    <div className="inline-actions"><button disabled={busy} className="button-primary">Lưu nội dung</button><button disabled={busy} type="button" className="button-secondary" onClick={onCancel}>Hủy</button></div>
  </form>;
}

export function BunproWorkspace({ kind = 'VOCAB', onLearned = async () => {}, onConjugation }) {
  const [level, setLevel] = useState('N5');
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ search: '', lesson: 'all', state: 'all' });
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [editing, setEditing] = useState(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const grammar = kind === 'GRAMMAR';
  async function load() {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api(`/api/bunpro/entries?kind=${kind}&level=${level}`);
      if (mounted.current && version === requestVersion.current) setEntries(result);
    } catch (e) { if (mounted.current && version === requestVersion.current) setError(e.message); }
    finally { if (mounted.current && version === requestVersion.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; requestVersion.current++; }; }, [kind, level]);
  useEffect(() => { setPage(1); }, [filters, level]);
  const visible = useMemo(() => filterCatalog(entries, filters), [entries, filters]);
  const selected = entries.find(e => e.id === selectedId);
  const lessons = [...new Set(entries.map(e => e.lesson))];
  const missing = entries.filter(e => !contentReady(e.content, kind)).length;
  const totalPages = Math.max(1, Math.ceil(visible.length / 50));
  const safePage = Math.min(page, totalPages);
  const items = visible.slice((safePage - 1) * 50, safePage * 50);
  function filter(name, value) { setFilters(f => ({ ...f, [name]: value })); }
  async function action(callback) {
    setBusy(true); setError(''); setNotice('');
    try { await callback(); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function learn(entry, request = {}) {
    await action(async () => {
      if (grammar) {
        const result = await api(`/api/bunpro/grammar/${entry.id}/learn`, { method: 'POST' });
        setNotice(result.created ? `Đã thêm ${result.created} câu vào lịch ôn.` : 'Các câu đã có trong lịch ôn.');
      } else {
        const result = await api(`/api/bunpro/vocab/${entry.id}/learn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (result.status === 'CONFLICT') { setConflict(result); return; }
        setConflict(null); setNotice('Đã chọn học. Tiến độ được dùng chung trong từ điển.');
        await onLearned();
      }
      await load();
    });
  }
  async function learnLesson() {
    await action(async () => {
      const result = await api(`/api/bunpro/lessons/${filters.lesson}/learn?level=${level}`, { method: 'POST' });
      setNotice(`Đã chọn ${result.learned} từ · ${result.blocked} từ cần kiểm tra · ${result.conflicts.length} từ cần chọn liên kết.`);
      if (result.conflicts.length) { setSelectedId(result.conflicts[0].entryId); setConflict(result.conflicts[0]); }
      await onLearned(); await load();
    });
  }
  return <section className="catalog-workspace" aria-labelledby={`catalog-${kind}`}>
    <div className="workspace-heading"><div><span className="eyebrow">{grammar ? 'Ngữ pháp theo mẫu câu' : 'Kho từ vựng Bunpro'}</span><h1 id={`catalog-${kind}`}>{grammar ? 'Mẫu câu' : 'Bunpro'} <span className="catalog-level">{level}</span></h1>
      <p>{grammar ? 'Học cách kết hợp, rồi luyện trong câu điền khuyết.' : 'Tra cứu theo lesson. Chọn những từ bạn muốn đưa vào lịch học.'}</p></div>
      <div className="catalog-summary"><strong>{entries.length.toLocaleString('vi-VN')}</strong><span>{grammar ? 'mẫu câu' : 'từ trong kho'} · {entries.filter(e => e.learningStatus !== 'NEW').length} đang học</span></div></div>
    {error && <div role="alert" className="catalog-error">{error}<button className="text-button" onClick={() => { setError(''); load(); }}>Thử tải lại</button></div>}
    {notice && <p role="status" className="catalog-notice">{notice}</p>}
    <div className="catalog-toolbar">
      <label className="catalog-search">Tìm kiếm<input type="search" value={filters.search} placeholder="Tiếng Nhật, cách đọc, nghĩa…" onChange={e => filter('search', e.target.value)} /></label>
      <label>Cấp độ<select value={level} disabled={busy || editing} onChange={e => { setLevel(e.target.value); setSelectedId(null); setConflict(null); setFilters(f => ({ ...f, lesson: 'all' })); }}><option>N5</option><option>N4</option></select></label>
      <label>Lesson<select value={filters.lesson} onChange={e => filter('lesson', e.target.value)}><option value="all">Tất cả lesson</option>{lessons.map(l => <option key={l} value={l}>Lesson {l}</option>)}</select></label>
      <label>Trạng thái<select value={filters.state} onChange={e => filter('state', e.target.value)}><option value="all">Tất cả</option>{Object.entries(LEARNING_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="incomplete">Cần kiểm tra nội dung</option></select></label>
      {!grammar && <button className="button-primary" disabled={busy || loading || filters.lesson === 'all'} onClick={learnLesson}>Học lesson đã chọn</button>}
    </div>
    {missing > 0 && <p className="catalog-coverage">{missing} {grammar ? 'mẫu' : 'từ'} chưa đủ nội dung đã kiểm tra. Có thể tra cứu và bổ sung trước khi học.</p>}
    {loading ? <div className="catalog-loading" role="status">Đang tải kho {level}…</div> : !entries.length ? <div className="workspace-empty"><h2>Chưa có dữ liệu {level}</h2><p>Đợt đầu có N5. Kho N4 sẽ được bổ sung sau.</p></div> : <div className={`catalog-layout ${selected ? 'has-detail' : ''}`}>
      <div><div className="catalog-list" aria-label={grammar ? 'Danh sách mẫu câu' : 'Danh sách từ Bunpro'}>
        {!items.length && <p>Không có mục khớp bộ lọc.</p>}
        {items.map(e => <button key={e.id} type="button" disabled={busy || editing} className="catalog-row" aria-pressed={e.id === selectedId} onClick={() => { setSelectedId(e.id); setConflict(null); }}>
          <span className="catalog-term" lang="ja">{e.content.title}<small>{e.content.reading}</small></span>
          <span className="catalog-meaning">{e.content.meaningVi || e.content.meaningEn}<small>Lesson {e.lesson} · {CONTENT_LABELS[e.content.status]}</small></span><span className={`catalog-state ${e.learningStatus.toLowerCase()}`}>{LEARNING_LABELS[e.learningStatus]}</span>
        </button>)}
      </div><div className="catalog-pagination"><button className="button-secondary" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>Trước</button><span>Trang {safePage} / {totalPages} · {visible.length} mục</span><button className="button-secondary" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>Sau</button></div></div>
      {selected && <aside className="catalog-detail" aria-label="Chi tiết mục đã chọn">
        <div className="catalog-detail-top"><span>Lesson {selected.lesson} · {LEARNING_LABELS[selected.learningStatus]}</span><button disabled={busy || editing} className="text-button" onClick={() => { setSelectedId(null); setConflict(null); }}>Đóng</button></div>
        <h2 lang="ja">{selected.content.title}</h2>{selected.content.reading && <p lang="ja" className="catalog-reading">{selected.content.reading}</p>}
        <h3>Nghĩa tiếng Việt</h3><p>{selected.content.meaningVi || 'Chưa có bản dịch.'}</p><h3>Nghĩa gốc</h3><p>{selected.content.meaningEn}</p>
        {grammar && <><h3>Cấu trúc</h3><p className="catalog-structure">{selected.content.structure || 'Chưa bổ sung.'}</p><h3>Cách dùng</h3><p>{selected.content.explanationVi || 'Chưa bổ sung.'}</p>
          {(selected.content.sentences || []).map(s => <article className="catalog-example" key={s.id}><p lang="ja">{s.sentence}</p><small lang="ja">{s.reading}</small><p>{s.translationVi}</p><p>{s.explanationVi}</p><small>{CONTENT_LABELS[s.status]}</small></article>)}
          {onConjugation && <button className="text-button" onClick={() => onConjugation(selected.content.conjugationGroup)}>Tra bảng chia từ</button>}</>}
        <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Xem nguồn Bunpro ↗</a>
        {grammar && <p className="catalog-coverage">Bản Việt, giải thích và câu luyện tập được biên soạn trong ứng dụng.</p>}
        {editing ? <ContentEditor key={selected.id} entry={selected} busy={busy} onCancel={() => setEditing(false)} onSave={draft => action(async () => {
          await api(`/api/bunpro/entries/${selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
          setEditing(false); setNotice('Đã lưu nội dung. Bản nhập sau giữ chỉnh sửa của bạn.'); await load();
        })} /> : <div className="inline-actions catalog-detail-actions"><button className="button-primary" disabled={busy || !contentReady(selected.content, kind) || (!grammar && selected.vocabularyId)} onClick={() => learn(selected)}>{selected.vocabularyId ? 'Đã liên kết tiến độ' : grammar ? 'Chọn học các câu đã kiểm tra' : 'Chọn học từ này'}</button><button disabled={busy} className="button-secondary" onClick={() => setEditing(true)}>Kiểm tra / chỉnh sửa</button></div>}
        {conflict?.entryId === selected.id && <section className="catalog-conflict" aria-label="Chọn từ để dùng chung tiến độ"><h3>Chọn từ tương đương</h3><p>Có từ gần giống trong từ điển. Chọn liên kết nếu cùng cách đọc và nghĩa.</p>
          {conflict.candidates.map(v => <button disabled={busy} className="catalog-candidate" key={v.id} onClick={() => learn(selected, { vocabularyId: v.id })}><strong lang="ja">{v.spelling} · {v.reading}</strong><span>{v.meaningVi}</span><small>Dùng chung tiến độ</small></button>)}
          <button className="button-secondary" disabled={busy} onClick={() => learn(selected, { createNew: true })}>Tạo từ riêng</button></section>}
      </aside>}
    </div>}
  </section>;
}
