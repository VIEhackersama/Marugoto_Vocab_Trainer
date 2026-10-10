import React, { useState } from 'react';
import { POS_LABELS, TIERS, TIER_LABELS, sourceLabel } from '../bunproVocab.js';

export function VocabTags({ tags = [] }) {
  return <span className="vocab-tags">{tags.map(tag => <span key={tag}>{POS_LABELS[tag] || tag}</span>)}</span>;
}
export function RubySentence({ example, furigana = true }) {
  return <span lang="ja" className="vocab-sentence">{!furigana || !example.tokens?.length ? example.sentence : example.tokens.map((token, i) =>
    token.reading ? <ruby key={i}>{token.text}<rp>(</rp><rt>{token.reading}</rt><rp>)</rp></ruby> : <React.Fragment key={i}>{token.text}</React.Fragment>)}</span>;
}
export function VocabExamples({ data, editing = false, onTranslation }) {
  const [furigana, setFurigana] = useState(true);
  const [limit, setLimit] = useState(10);
  const examples = data?.examples || [];
  return <section className="vocab-examples" aria-label="Ví dụ của từ">
    <div className="vocab-section-title"><h3>Ví dụ <span>{examples.length}</span></h3><label className="vocab-check"><input type="checkbox" checked={furigana} onChange={e => setFurigana(e.target.checked)} />Furigana</label></div>
    {!examples.length && <p className="catalog-coverage">Chưa có ví dụ. Nhập JSON nguồn để bổ sung.</p>}
    {examples.slice(0, limit).map((ex, i) => <article className="vocab-example" key={ex.id}>
      <small className="vocab-example-index">{String(i + 1).padStart(2, '0')} {ex.level && `· ${ex.level}`}</small>
      <p><RubySentence example={ex} furigana={furigana} /></p>
      {ex.reading && <p lang="ja" className="catalog-reading">{ex.reading}</p>}
      <p lang="en">{ex.translationEn}</p>
      {editing ? <label>Bản dịch Việt<textarea value={ex.translationVi || ''} onChange={e => onTranslation(ex.id, e.target.value)} /></label> : ex.translationVi && <p>{ex.translationVi}</p>}
      {ex.notes && <small>{ex.notes}</small>}
    </article>)}
    {limit < examples.length && <button type="button" className="button-secondary" onClick={() => setLimit(examples.length)}>Xem đủ {examples.length} ví dụ</button>}
  </section>;
}

export function VocabEditor({ entry, busy, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone(entry.content));
  const set = (field, value) => setDraft(d => ({ ...d, [field]: value }));
  const setData = (field, value) => setDraft(d => ({ ...d, vocab: { ...d.vocab, [field]: value } }));
  function senseTags(index, tag, checked) {
    setDraft(d => {
      const senses = d.vocab.senses.map((s, i) => i === index ? { ...s, partsOfSpeech: checked ? [...new Set([...s.partsOfSpeech, tag])] : s.partsOfSpeech.filter(t => t !== tag) } : s);
      return { ...d, vocab: { ...d.vocab, senses, partsOfSpeech: [...new Set(senses.flatMap(s => s.partsOfSpeech))] } };
    });
  }
  return <form className="catalog-editor" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h3>Chỉnh sửa nội dung</h3>
    <label>Từ Nhật<input required value={draft.title || ''} onChange={e => set('title', e.target.value)} /></label>
    <label>Cách đọc<input value={draft.reading || ''} onChange={e => set('reading', e.target.value)} /></label>
    <label>Nghĩa tiếng Việt<textarea required value={draft.meaningVi || ''} onChange={e => set('meaningVi', e.target.value)} /></label>
    <label>Nghĩa tiếng Anh<textarea value={draft.meaningEn || ''} onChange={e => set('meaningEn', e.target.value)} /></label>
    <label className="vocab-check"><input type="checkbox" checked={draft.status === 'VERIFIED'} onChange={e => set('status', e.target.checked ? 'VERIFIED' : 'DRAFT')} />Tôi đã kiểm tra nghĩa Việt</label>
    {draft.vocab && <>
      {draft.vocab.senses.map((s, i) => <fieldset key={s.id}><legend>Nghĩa {i + 1}</legend>
        <label>Định nghĩa<textarea value={s.meaning} onChange={e => setData('senses', draft.vocab.senses.map((x, j) => j === i ? { ...x, meaning: e.target.value } : x))} /></label>
        <div className="vocab-pos-options">{Object.entries(POS_LABELS).map(([tag, label]) => <label className="vocab-check" key={tag}><input type="checkbox" checked={s.partsOfSpeech.includes(tag)} onChange={e => senseTags(i, tag, e.target.checked)} />{label}</label>)}</div>
        <small>Nhãn gốc: {s.sourceLabels.join(', ')}</small>
      </fieldset>)}
      {!draft.vocab.senses.length && <button type="button" className="button-secondary" onClick={() => setData('senses', [{ id: 'personal-1', meaning: draft.meaningEn || '', partsOfSpeech: [], sourceLabels: [], notes: '' }])}>Thêm nghĩa và phân loại</button>}
      <label>Nhãn chưa nhận diện (mỗi dòng một nhãn)<textarea value={draft.vocab.unknownLabels.join('\n')} onChange={e => setData('unknownLabels', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} /></label>
      <label>Ghi chú nguồn<textarea value={draft.vocab.notes || ''} onChange={e => setData('notes', e.target.value)} /></label>
      <label className="vocab-check"><input type="checkbox" checked={draft.vocab.completeness === 'REVIEWED'} onChange={e => setData('completeness', e.target.checked ? 'REVIEWED' : 'NEEDS_REVIEW')} />Tôi đã đối chiếu nội dung với nguồn</label>
      <VocabExamples data={draft.vocab} editing onTranslation={(id, value) => setData('examples', draft.vocab.examples.map(ex => ex.id === id ? { ...ex, translationVi: value } : ex))} />
    </>}
    <div className="inline-actions"><button disabled={busy} className="button-primary">Lưu nội dung</button><button disabled={busy} type="button" className="button-secondary" onClick={onCancel}>Hủy</button></div>
  </form>;
}

export function BunproVocabDetail({ entry, busy, onClose, onAssign, onLearn, onSave, onConjugation }) {
  const [editing, setEditing] = useState(false);
  const [tier, setTier] = useState(entry.tier || 'BEGINNER');
  const c = entry.content, data = c.vocab;
  const group = (entry.partsOfSpeech || []).find(t => ['ICHIDAN', 'GODAN', 'SURU', 'KURU', 'I_ADJECTIVE', 'NA_ADJECTIVE'].includes(t));
  return <aside className="catalog-detail vocab-detail" aria-label="Chi tiết từ đã chọn">
    <div className="catalog-detail-top"><span>Lesson {entry.lesson} · {TIER_LABELS[entry.tier || 'NEW']}</span><button disabled={busy} className="text-button" onClick={onClose}>Đóng</button></div>
    <h2 lang="ja">{c.title}</h2><p lang="ja" className="catalog-reading">{c.reading}</p>
    <VocabTags tags={entry.partsOfSpeech} />
    <h3>Nghĩa tiếng Việt</h3><p>{c.meaningVi || 'Chưa có bản dịch.'}</p><h3>Nghĩa tiếng Anh</h3><p lang="en">{c.meaningEn}</p>
    <p className="catalog-coverage">{sourceLabel(entry.completeness)} · {entry.exampleCount} ví dụ</p>
    {entry.dueAt && <p className="catalog-coverage">Ôn tiếp: {new Date(entry.dueAt).toLocaleString('vi-VN')} · {entry.reviewCount} lượt ôn</p>}
    {!editing && <>
      <div className="vocab-tier-control"><label>Mức học<select value={tier} onChange={e => setTier(e.target.value)}>{TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}</select></label><button className="button-secondary" disabled={busy || c.status !== 'VERIFIED'} onClick={() => onAssign([entry.id], tier)}>Gán mức</button></div>
      <div className="inline-actions catalog-detail-actions"><button className="button-primary" disabled={busy || c.status !== 'VERIFIED' || Boolean(entry.tier)} onClick={() => onLearn(entry.id)}>{entry.tier ? 'Đã kích hoạt lịch Bunpro' : 'Chọn học từ này'}</button><button disabled={busy} className="button-secondary" onClick={() => setEditing(true)}>Chỉnh sửa</button></div>
      {group && onConjugation && <button className="text-button" onClick={() => onConjugation(({ ICHIDAN: 'ichidan', GODAN: 'godan', SURU: 'irregular', KURU: 'irregular', I_ADJECTIVE: 'i-adj', NA_ADJECTIVE: 'na-adj' })[group])}>Tra bảng chia từ</button>}
      {!!data?.unknownLabels?.length && <p className="catalog-coverage">Nhãn cần phân loại: {data.unknownLabels.join(', ')}</p>}
      {!!data?.senses?.length && <section className="vocab-definitions"><h3>Định nghĩa</h3>{data.senses.map((sense, i) => <article key={sense.id}><VocabTags tags={sense.partsOfSpeech} /><p lang="en"><strong>{i + 1}.</strong> {sense.meaning}</p>{sense.notes && <small>{sense.notes}</small>}</article>)}</section>}
      {data?.notes && <details className="vocab-source-notes"><summary>Ghi chú / định nghĩa nguồn đầy đủ</summary><p>{data.notes}</p></details>}
      <VocabExamples key={entry.id} data={data} />
      {!!data?.issues?.length && <details><summary>Ghi nhận khi thu thập</summary><ul>{data.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}
    </>}
    {editing && <VocabEditor entry={entry} busy={busy} onCancel={() => setEditing(false)} onSave={async draft => { if (await onSave(entry.id, draft)) setEditing(false); }} />}
    <a href={entry.sourceUrl} target="_blank" rel="noreferrer">Xem nguồn Bunpro ↗</a>
  </aside>;
}
