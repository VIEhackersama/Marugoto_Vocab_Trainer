import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { sentencePrompt, isImeInput } from '../bunpro.js';
import { BunproWorkspace } from './BunproWorkspace.jsx';
import { GrammarWorkspace } from './GrammarWorkspace.jsx';
import './bunpro.css';

function GrammarReview() {
  const [level, setLevel] = useState('N5');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [composition, setComposition] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { setCards(await api(`/api/bunpro/grammar/cards?level=${level}&dueOnly=true`)); setCompleted(0); setAnswer(''); setRevealed(false); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { let current = true; setLoading(true); setError('');
    api(`/api/bunpro/grammar/cards?level=${level}&dueOnly=true`).then(result => { if (current) { setCards(result); setCompleted(0); setAnswer(''); setRevealed(false); } })
      .catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [level]);
  const card = cards[0];
  async function rate(rating) {
    if (busy || !revealed || !card) return;
    setBusy(true); setError('');
    try {
      await api(`/api/bunpro/grammar/cards/${card.id}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, responseText: answer }) });
      setCards(items => items.slice(1)); setCompleted(n => n + 1); setAnswer(''); setRevealed(false); setComposition(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="grammar-review" aria-labelledby="grammar-review-heading">
    <div className="workspace-heading"><div><span className="eyebrow">Ôn ngữ pháp · FSRS</span><h1 id="grammar-review-heading">Nhớ mẫu câu trong ngữ cảnh</h1><p>Nhập đáp án, xem giải thích rồi tự đánh giá mức nhớ.</p></div>
      <label>Cấp độ<select disabled={busy} value={level} onChange={e => setLevel(e.target.value)}><option>N5</option><option>N4</option></select></label></div>
    {error && <p role="alert" className="catalog-error">{error}</p>}
    {loading ? <p role="status">Đang tải thẻ đến hạn…</p> : card ? <article className="grammar-review-card">
      <div className="catalog-detail-top"><span>{level} · {cards.length} câu còn lại</span><span>{completed} câu đã ôn</span></div>
      <form onSubmit={e => { e.preventDefault(); if (!isImeInput(e.nativeEvent, composition) && !busy) setRevealed(true); }}>
        <p className="grammar-cloze" lang="ja">{sentencePrompt(card.sentence.prompt).map((part, i) => <React.Fragment key={i}>{i > 0 && <span className="grammar-blank" aria-label="Chỗ trống">＿＿＿</span>}{part}</React.Fragment>)}</p>
        <p className="grammar-hint">{card.sentence.translationVi}</p>
        <label htmlFor="grammar-answer">Đáp án của bạn</label>
        <input id="grammar-answer" lang="ja" autoComplete="off" autoFocus key={card.id} value={answer} disabled={busy || revealed} onChange={e => setAnswer(e.target.value)}
          onCompositionStart={() => setComposition(true)} onCompositionEnd={() => setComposition(false)}
          onKeyDown={e => { if (e.key === 'Enter' && isImeInput(e.nativeEvent, composition)) e.preventDefault(); }} placeholder="Gõ bằng bộ gõ tiếng Nhật…" />
        {!revealed && <button className="button-primary" disabled={busy || composition}>Xem đáp án</button>}
      </form>
      {revealed && <div className="grammar-revealed" aria-live="polite"><span className="eyebrow">{card.title}</span><h2 lang="ja">{card.sentence.answers.join(' / ')}</h2>
        <p className="grammar-complete" lang="ja">{card.sentence.sentence}</p><p lang="ja">{card.sentence.reading}</p><p>{card.sentence.translationVi}</p><p>{card.sentence.explanationVi}</p>
        <p className="catalog-coverage">Tự đối chiếu đáp án. Bạn quyết định mức nhớ, kể cả khi dùng cách diễn đạt tương đương.</p>
        <div className="grammar-ratings">{[['AGAIN','Again','Cần học lại'],['HARD','Hard','Nhớ khó'],['GOOD','Good','Nhớ được'],['EASY','Easy','Rất dễ']].map(([rating,label,hint]) =>
          <button key={rating} disabled={busy} className={`button-secondary rating-${rating.toLowerCase()}`} onClick={() => rate(rating)}><strong>{label}</strong><small>{hint}</small></button>)}</div>
      </div>}
    </article> : <div className="workspace-empty"><h2>{completed ? 'Đã ôn hết các câu trong phiên' : 'Chưa có câu đến hạn'}</h2><p>Chọn học trong Mẫu câu để thêm câu luyện tập vào lịch ôn.</p><button className="button-secondary" onClick={load}>Kiểm tra câu đến hạn</button></div>}
  </section>;
}

export function GrammarLearningWorkspace() {
  const [section, setSection] = useState('patterns');
  const [group, setGroup] = useState('noun');
  return <div className="grammar-learning"><nav className="catalog-subnav" aria-label="Nội dung ngữ pháp">
    {[['patterns','Mẫu câu'],['review','Ôn tập'],['conjugation','Bảng chia từ']].map(([id,label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}
  </nav>
    {section === 'patterns' && <BunproWorkspace kind="GRAMMAR" onConjugation={value => { setGroup(value || 'noun'); setSection('conjugation'); }} />}
    {section === 'review' && <GrammarReview />}
    {section === 'conjugation' && <GrammarWorkspace initialGroupId={group} />}
  </div>;
}
