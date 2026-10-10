import React, { useState } from 'react';
import { TIERS, TIER_LABELS } from '../bunproVocab.js';
import { ContentEditor } from './BunproContentEditor.jsx';

export function GrammarExamples({ sentences = [] }) {
  return <section className="vocab-examples"><h3>Câu luyện tập · {sentences.length}</h3>{!sentences.length && <p className="catalog-coverage">Chưa có câu luyện tập. Có thể thêm trong Chỉnh sửa.</p>}{sentences.map((s, i) => <article className="vocab-example" key={s.id}><span className="eyebrow">Câu {i + 1} · {s.status === 'VERIFIED' ? 'Đã kiểm tra' : 'Cần kiểm tra'}</span><p lang="ja" className="vocab-sentence">{s.sentence}</p><p lang="ja" className="catalog-reading">{s.reading}</p><p>{s.translationVi}</p><p className="catalog-coverage">{s.explanationVi}</p></article>)}</section>;
}

export function BunproGrammarDetail({ entry, busy, onClose, onAssign, onLearn, onSave }) {
  const [editing, setEditing] = useState(false), [tier, setTier] = useState(entry.tier || 'BEGINNER');
  const c=entry.content;
  const ready=c.status === 'VERIFIED' && c.meaningVi?.trim() && c.structure?.trim() && c.explanationVi?.trim();
  return <aside className="catalog-detail vocab-detail" aria-label={`Chi tiết ${c.title}`}>
    <div className="catalog-detail-top"><span className="eyebrow">Lesson {entry.lesson} · {TIER_LABELS[entry.tier || 'NEW']}</span><button className="text-button" disabled={busy} onClick={onClose}>Đóng</button></div>
    <h2 lang="ja">{c.title}</h2><p className="catalog-reading" lang="ja">{c.reading}</p>
    {editing ? <ContentEditor entry={entry} busy={busy} onCancel={() => setEditing(false)} onSave={async content => { if(await onSave(entry.id,content)) setEditing(false); }} /> : <>
      <p className="vocab-meaning">{c.meaningVi || 'Chưa có nghĩa Việt'}</p><p lang="en">{c.meaningEn}</p>
      <h3>Cấu trúc</h3><p className="grammar-structure" lang="ja">{c.structure || 'Chưa có cấu trúc'}</p><h3>Cách dùng</h3><p className="grammar-explanation">{c.explanationVi || 'Chưa có giải thích'}</p>
      <p className="catalog-coverage">{c.status === 'VERIFIED' ? 'Nội dung đã kiểm tra' : 'Cần kiểm tra nội dung trước khi học'}{entry.dueAt && ` · Hạn ôn: ${new Date(entry.dueAt).toLocaleString('vi-VN')}`}</p>
      <div className="inline-actions"><button className="button-secondary" disabled={busy} onClick={() => setEditing(true)}>Chỉnh sửa</button>{!entry.tier && <button className="button-primary" disabled={busy || !ready} onClick={() => onLearn(entry.id)}>Chọn học mẫu này</button>}</div>
      <div className="vocab-tier-control"><label>Mức học<select value={tier} disabled={busy} onChange={e => setTier(e.target.value)}>{TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select></label><button className="button-secondary" disabled={busy || !ready} onClick={() => onAssign([entry.id],tier)}>Gán mức</button></div>
      <GrammarExamples sentences={c.sentences} /><a href={entry.sourceUrl} target="_blank" rel="noreferrer">Xem nguồn Bunpro</a>
    </>}
  </aside>;
}
