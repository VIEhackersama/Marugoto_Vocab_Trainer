import React, { useState } from 'react';

export function ContentEditor({ entry, onSave, onCancel, busy }) {
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
