import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { TIER_LABELS } from '../bunproVocab.js';
import { GrammarExamples } from './BunproGrammarDetail.jsx';
import { VocabExamples, VocabTags } from './BunproVocabDetail.jsx';

export function BunproProgressReview({ level, onChanged, kind = 'VOCAB', base = '/api/bunpro/vocab' }) {
  const grammar = kind === 'GRAMMAR', noun = grammar ? 'mẫu' : 'từ';
  const [answer, setAnswer] = useState(''), [composing, setComposing] = useState(false);
  const [queue, setQueue] = useState([]), [detail, setDetail] = useState(null);
  const [revealed, setRevealed] = useState(false), [direction, setDirection] = useState('JP_TO_VI');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [completed, setCompleted] = useState(0);
  const alive = useRef(false), version = useRef(0), detailVersion = useRef(0), lock = useRef(false), requestId = useRef(null);
  const card = queue[0];
  async function load() {
    const currentVersion = ++version.current;
    setLoading(true);
    try { const cards = await api(`${base}/queue?level=${level}`); if (alive.current && currentVersion === version.current) setQueue(cards); }
    catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current && currentVersion === version.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; version.current++; detailVersion.current++; }; }, [level]);
  useEffect(() => {
    setRevealed(false); setDetail(null); setAnswer(''); setComposing(false); requestId.current = crypto.randomUUID();
    const currentVersion = ++detailVersion.current;
    if (!card) return;
    api(`${base}/entries/${card.id}`).then(data => { if (alive.current && currentVersion === detailVersion.current) setDetail(data); }).catch(e => { if (alive.current && currentVersion === detailVersion.current) setError(e.message); });
  }, [card?.id, card?.revision]);
  const sentences = detail?.content.sentences?.filter(s => s.status === 'VERIFIED' && s.prompt?.includes('{{blank}}')) || [];
  const exercise = sentences.length ? sentences[(card?.reviewCount || 0) % sentences.length] : null;
  async function rate(rating) {
    if (lock.current || !card || !revealed || !detail) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await api(`${base}/entries/${card.id}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, rating, direction, revision: card.revision }) });
      setCompleted(count => count + 1);
      setNotice(`${detail.content.title} → ${TIER_LABELS[result.tier]} · ôn tiếp ${new Date(result.dueAt).toLocaleString('vi-VN')}`);
      setRevealed(false); setQueue(old => old.filter(e => e.id !== card.id));
      await load(); await onChanged();
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="vocab-review" aria-label={grammar ? "Ôn ngữ pháp Bunpro" : "Ôn từ Bunpro"}>
    <div className="catalog-toolbar">{!grammar && <label>Chiều ôn<select disabled={busy || revealed} value={direction} onChange={e => setDirection(e.target.value)}><option value="JP_TO_VI">Nhật → Việt</option><option value="VI_TO_JP">Việt → Nhật</option></select></label>}<span className="catalog-coverage">{completed} {noun} đã ôn · {queue.length} {noun} đang đến hạn</span></div>
    <p className="catalog-coverage">Good/Easy tăng một mức · Hard giữ mức · Again giảm một mức, ôn lại sau 10 phút. FSRS tính lịch trong giới hạn của mức.</p>
    {error && <div className="catalog-error" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => { setError(''); load(); }}>Tải lại lượt ôn</button></div>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}
    {loading ? <div className="catalog-loading" role="status">Đang tải lượt ôn…</div> : !card ? <div className="workspace-empty"><h2>Đã hết {noun} đến hạn</h2><p>Chọn học {noun} mới trong kho hoặc quay lại khi đến hạn tiếp theo.</p><button className="button-secondary" onClick={load}>Kiểm tra {noun} đến hạn</button></div> : <article className="grammar-review-card">
      <span className="eyebrow">{TIER_LABELS[card.tier]} · {grammar ? exercise ? 'Điền mẫu ngữ pháp phù hợp' : 'Nghĩa và cách dùng mẫu này?' : direction === 'JP_TO_VI' ? 'Nghĩa của từ này?' : 'Từ tiếng Nhật là gì?'}</span>
      <h2 className="vocab-review-prompt" lang={direction === 'JP_TO_VI' ? 'ja' : 'vi'}>{grammar && !detail ? 'Đang tải câu luyện tập…' : grammar && exercise ? exercise.prompt.replace('{{blank}}','＿＿＿') : direction === 'JP_TO_VI' ? card.content.title : card.content.meaningVi}</h2>
      {grammar && exercise && !revealed && <label>Đáp án của bạn<input lang="ja" value={answer} autoComplete="off" onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !composing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); setRevealed(true); } }} onChange={e => setAnswer(e.target.value)} placeholder="Nhập mẫu ngữ pháp…" /></label>}
      {!revealed && <button className="button-primary" disabled={!detail || busy || composing} onClick={() => setRevealed(true)}>{detail ? 'Xem đáp án' : 'Đang tải đáp án…'}</button>}
      {revealed && detail && <div className="grammar-revealed"><h2 lang="ja">{detail.content.title}</h2><p lang="ja" className="catalog-reading">{detail.content.reading}</p><p>{detail.content.meaningVi}</p><p lang="en">{detail.content.meaningEn}</p>{grammar ? <><h3>Cấu trúc</h3><p className="grammar-structure">{detail.content.structure}</p><h3>Cách dùng</h3><p className="grammar-explanation">{detail.content.explanationVi}</p>{exercise && <div><p>Đáp án: <strong lang="ja">{exercise.answers.join(' / ')}</strong></p>{answer && <p>Bạn đã nhập: {answer}</p>}<p className="catalog-coverage">Đối chiếu đáp án rồi tự đánh giá mức nhớ.</p></div>}</> : <VocabTags tags={detail.partsOfSpeech} />}<div className="grammar-ratings">{[['AGAIN', 'Quên', 'Giảm mức · 10 phút'], ['HARD', 'Khó', 'Giữ mức'], ['GOOD', 'Nhớ', 'Tăng một mức'], ['EASY', 'Dễ', 'Tăng một mức']].map(([rating, label, hint]) => <button key={rating} className={`button-secondary rating-${rating.toLowerCase()}`} disabled={busy} onClick={() => rate(rating)}>{label}<small>{hint}</small></button>)}</div>{grammar ? <GrammarExamples sentences={detail.content.sentences} /> : <VocabExamples key={detail.id} data={detail.content.vocab} />}</div>}
    </article>}
  </section>;
}
