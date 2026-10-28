import React, { useEffect, useReducer, useRef, useState } from 'react';
import { EXAM_FONTS, ExamSession, displayPreferences, examRequest, isAnswered, remainingTime } from '../exams/examSession.js';
import './exams.css';

const TYPE_LABEL = { single_choice: 'Trắc nghiệm', fill_blank: 'Điền từ', essay: 'Tự luận' };
const SAVE_LABEL = { saved: 'Đã lưu', pending: 'Chưa lưu', saving: 'Đang lưu…', error: 'Lưu lỗi' };
const date = value => new Date(value).toLocaleString('vi-VN');
const modeLabel = mode => mode === 'per_question' ? 'Ngay từng câu' : 'Sau khi nộp đề';
function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExamContent({ value, furigana = false, blank }) {
  if (value == null) return null;
  const renderText = (text, key) => blank ? text.split(/(\{\{[A-Za-z0-9][A-Za-z0-9_.:-]*}})/g).map((part, i) =>
    part.startsWith('{{') && part.endsWith('}}') ? <React.Fragment key={`${key}-${i}`}>{blank(part.slice(2, -2))}</React.Fragment> : part) : text;
  if (typeof value === 'string') return <>{renderText(value, 'text')}</>;
  return <>{value.map((token, index) => token.reading
    ? <ruby key={index}>{token.text}{furigana && <rt>{token.reading}</rt>}</ruby>
    : <React.Fragment key={index}>{renderText(token.text, index)}</React.Fragment>)}</>;
}

function DisplaySettings({ prefs, setPrefs }) {
  const update = patch => setPrefs(old => displayPreferences({ ...old, ...patch }));
  return <details className="exam-display"><summary>Kiểu chữ & furigana</summary>
    <div className="exam-display-controls">
      <label>Font bài thi<select value={prefs.font} onChange={e => update({ font: e.target.value })}>{Object.keys(EXAM_FONTS).map(font => <option key={font}>{font}</option>)}</select></label>
      <label>Cỡ chữ: {prefs.size}px<input aria-label="Cỡ chữ bài thi" type="range" min="16" max="32" value={prefs.size} onChange={e => update({ size: e.target.value })}/></label>
      <label>Giãn dòng: {prefs.lineHeight.toFixed(1)}<input aria-label="Giãn dòng bài thi" type="range" min="1.5" max="2.2" step="0.1" value={prefs.lineHeight} onChange={e => update({ lineHeight: e.target.value })}/></label>
      <label className="exam-check-label"><input type="checkbox" checked={prefs.furigana} onChange={e => update({ furigana: e.target.checked })}/>Hiện furigana</label>
    </div>
    <p className="exam-paper exam-font-preview" lang="ja"><ExamContent value={[{ text: '試験', reading: 'しけん' }, { text: 'の文字を読みましょう。' }]} furigana={prefs.furigana}/></p>
    <small>Font lấy từ máy đang dùng; nếu chưa cài, trình duyệt dùng font dự phòng.</small>
  </details>;
}

function ExamSummary({ exam, furigana }) {
  return <><h3>{exam.title}</h3>{exam.description && <p><ExamContent value={exam.description} furigana={furigana}/></p>}
    <p className="exam-muted">{exam.questionCount} câu · {exam.automaticCount} tự chấm · {exam.essayCount} tự luận · {exam.timeLimitMinutes ? `${exam.timeLimitMinutes} phút` : 'Không giới hạn thời gian'}</p>
    <ol className="exam-sections-list">{exam.sections.map(s => <li key={s.id}>{s.title}<span>{s.questionCount} câu</span></li>)}</ol></>;
}

function QuestionFeedback({ question, result, furigana }) {
  if (!result) return null;
  return <div className={`exam-feedback ${result.kind === 'REFERENCE' ? 'reference' : result.correct ? 'correct' : 'incorrect'}`} role="status">
    <strong>{result.kind === 'REFERENCE' ? 'Đáp án tham khảo · không tính điểm' : `${result.correct ? 'Chính xác' : result.score > 0 ? 'Đúng một phần' : 'Chưa đúng'} · ${result.score}/${result.maxScore} điểm`}</strong>
    <div className="exam-paper">
      {question.type === 'single_choice' && <p>Đáp án: <ExamContent value={question.options.find(o => o.id === result.correctOptionId)?.text} furigana={furigana}/></p>}
      {question.type === 'fill_blank' && <ul>{question.blanks.map((b, i) => <li key={b.id}>Ô {i + 1}: {result.blanks[b.id].acceptedAnswers.join(' / ')} — {result.blanks[b.id].correct ? 'đúng' : 'chưa đúng'}</li>)}</ul>}
      {result.modelAnswer && <p><ExamContent value={result.modelAnswer} furigana={furigana}/></p>}
      <p><ExamContent value={result.explanation} furigana={furigana}/></p>
    </div>
  </div>;
}

export function ExamWorkspace({ active }) {
  const [, redraw] = useReducer(n => n + 1, 0);
  const sessionRef = useRef(null);
  if (!sessionRef.current) {
    let storage, draftScope = '';
    try {
      storage = window.localStorage;
      draftScope = sessionStorage.getItem('marugoto_exam_tab') || crypto.randomUUID();
      sessionStorage.setItem('marugoto_exam_tab', draftScope);
    } catch { storage = null; }
    sessionRef.current = new ExamSession({ onChange: redraw, storage, draftScope });
  }
  const session = sessionRef.current;
  const [view, setView] = useState('library'), [exams, setExams] = useState([]), [history, setHistory] = useState([]);
  const [text, setText] = useState(''), [preview, setPreview] = useState(null), [setup, setSetup] = useState(null);
  const [feedbackMode, setFeedbackMode] = useState('on_submit');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false), [now, setNow] = useState(Date.now());
  const [prefs, setPrefs] = useState(() => {
    try { return displayPreferences(JSON.parse(localStorage.getItem('marugoto_exam_display') || '{}')); } catch { return displayPreferences(); }
  });
  const booted = useRef(false), expiryRequest = useRef(false), composing = useRef(false);

  useEffect(() => { try { localStorage.setItem('marugoto_exam_display', JSON.stringify(prefs)); } catch {} }, [prefs]);
  const refreshLibrary = async () => {
    const [definitions, attempts] = await Promise.all([examRequest('/api/exams'), examRequest('/api/exam-attempts')]);
    setExams(definitions); setHistory(attempts);
  };
  const action = async fn => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const selectAttempt = attempt => {
    session.open(attempt); setView('attempt'); setConfirmSubmit(false); setSetup(null);
    try { localStorage.setItem('marugoto_exam_active', attempt.id); } catch {}
  };
  useEffect(() => {
    if (!active) return;
    action(async () => {
      await refreshLibrary();
      if (!booted.current) {
        booted.current = true;
        let id; try { id = localStorage.getItem('marugoto_exam_active'); } catch {}
        if (id) {
          try { selectAttempt(await examRequest(`/api/exam-attempts/${id}`)); }
          catch { try { localStorage.removeItem('marugoto_exam_active'); } catch {} }
        }
      }
    });
  }, [active]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const guard = event => { if (session.dirty || session.busy) { event.preventDefault(); event.returnValue = ''; } };
    const flush = () => { if (document.visibilityState === 'hidden' && !composing.current) session.save().catch(() => {}); };
    window.addEventListener('beforeunload', guard); document.addEventListener('visibilitychange', flush);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', guard); document.removeEventListener('visibilitychange', flush); };
  }, [session]);
  const attempt = session.attempt;
  const expired = attempt?.status === 'IN_PROGRESS' && attempt.deadlineAt && now + session.offset >= attempt.deadlineAt;
  useEffect(() => {
    if (!expired || expiryRequest.current) return;
    expiryRequest.current = true;
    session.pollExpiry().catch(e => setError(e.message)).finally(() => { expiryRequest.current = false; });
  }, [expired, now, session]);

  const switchView = target => action(async () => {
    if (session.dirty) await session.save();
    setView(target); setSetup(null); setConfirmSubmit(false);
    try { localStorage.removeItem('marugoto_exam_active'); } catch {}
    await refreshLibrary();
  });
  const openAttempt = id => action(async () => {
    if (session.dirty) await session.save();
    selectAttempt(await examRequest(`/api/exam-attempts/${id}`));
  });
  const readJson = () => { try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { throw new Error(`JSON không hợp lệ: ${e.message}`); } };
  const updateText = value => { setText(value); setPreview(null); setError(''); };
  const payloadDownload = () => download('bai-lam-ban-nhap.json', JSON.stringify({ attemptId: attempt.id, ...(session.expiredDraft || { answers: session.answers, flagged: session.flagged }) }, null, 2));
  const allQuestions = attempt?.document.sections.flatMap(section => section.questions.map(question => ({ section, question }))) || [];
  const current = Math.max(0, allQuestions.findIndex(({ question }) => question.id === session.currentQuestionId));
  const selectQuestion = index => session.selectQuestion(allQuestions[index].question.id);
  const currentItem = allQuestions[current] || allQuestions[0];
  const submitted = attempt?.status === 'SUBMITTED';
  const paused = attempt?.status === 'PAUSED';
  const disabled = session.busy || session.conflict || expired || submitted || paused;
  const completed = allQuestions.filter(({ question }) => isAnswered(question, session.answers[question.id])).length;
  const paperStyle = { '--exam-font': EXAM_FONTS[prefs.font], '--exam-size': `${prefs.size}px`, '--exam-leading': prefs.lineHeight };
  const draftNotice = session.error || error;

  return <section className="exam-workspace" hidden={!active} style={paperStyle} aria-label="Bài kiểm tra">
    <div className="exam-heading"><div><span className="eyebrow">Đề của bạn</span><h1>Bài kiểm tra</h1><p>Nhập một file JSON, làm bài và giữ lại từng lượt kiểm tra.</p></div>
      <nav aria-label="Quản lý bài kiểm tra">{[['library', 'Thư viện đề'], ['import', 'Nhập JSON'], ['history', 'Lịch sử']].map(([id, label]) =>
        <button key={id} disabled={busy || session.busy} aria-current={view === id ? 'page' : undefined} onClick={() => switchView(id)}>{label}</button>)}</nav>
    </div>
    {draftNotice && <div className="exam-error" role="alert">{draftNotice}
      {attempt && (session.dirty || session.expiredDraft) && <button onClick={payloadDownload}>Tải bản nháp</button>}
      {session.conflict && <button onClick={() => action(() => session.refresh())}>Dùng bản đã lưu trên máy chủ</button>}
      {!session.conflict && session.saveStatus === 'error' && <button disabled={session.busy} onClick={() => action(() => session.save())}>Thử lưu lại</button>}
    </div>}
    {notice && <p className="exam-notice" role="status">{notice}</p>}
    <DisplaySettings prefs={prefs} setPrefs={setPrefs}/>

    {view === 'import' && <div className="exam-import-grid"><div className="exam-panel">
      <h2>Nhập đề từ JSON</h2><p>Chọn file hoặc dán nội dung. Kiểm tra cấu trúc trước khi lưu vào thư viện.</p>
      <label className="exam-file">Chọn file JSON<input type="file" accept=".json,application/json" disabled={busy} aria-label="Chọn file đề JSON" onChange={e => {
        const file = e.target.files[0]; if (!file) return;
        action(async () => { updateText(await file.text()); }); e.target.value = '';
      }}/></label>
      <label className="exam-json-label">Nội dung JSON<textarea aria-label="Nội dung đề JSON" className="exam-json" spellCheck="false" value={text} onChange={e => updateText(e.target.value)} placeholder={'{\n  "schemaVersion": 1,\n  "id": "de-cua-ban",\n  ...\n}'}/></label>
      <button disabled={busy || !text.trim()} onClick={() => action(async () => { setPreview(null); setPreview(await examRequest('/api/exams/preview', readJson())); })}>Kiểm tra JSON</button>
    </div><aside className="exam-panel">
      <h2>Sinh đề cho những lần sau</h2><p>Tải mẫu, schema và prompt để yêu cầu AI sinh đúng định dạng này.</p>
      <div className="exam-resource-links"><a href="/exams/exam-template.json" download>Tải đề JSON mẫu</a><a href="/exams/exam.schema.json" download>Tải JSON Schema v1</a><a href="/exams/generate-exam-prompt.txt" download>Tải prompt sinh đề</a></div>
      <div className="exam-inline"><button className="button-secondary" disabled={busy} onClick={() => action(async () => { const r = await fetch('/exams/exam-template.json'); if (!r.ok) throw new Error('Không tải được đề mẫu.'); updateText(await r.text()); })}>Nạp đề mẫu vào ô nhập</button>
        <button className="button-secondary" disabled={busy} onClick={() => action(async () => { const r = await fetch('/exams/generate-exam-prompt.txt'); if (!r.ok) throw new Error('Không tải được prompt.'); const value = await r.text(); try { await navigator.clipboard.writeText(value); setNotice('Đã sao chép prompt sinh đề.'); } catch { download('prompt-sinh-de.txt', value, 'text/plain'); setNotice('Đã tải prompt vì trình duyệt không cho sao chép.'); } })}>Sao chép prompt</button></div>
      <p className="exam-muted">Trắc nghiệm và điền từ được tự chấm. Câu dài hiện đáp án tham khảo, không tính vào điểm tự động.</p>
      {preview && <div className="exam-import-preview"><span className="exam-tag">JSON hợp lệ</span><ExamSummary exam={preview} furigana={prefs.furigana}/><button disabled={busy} onClick={() => action(async () => {
        const imported = await examRequest('/api/exams/import', readJson()); await refreshLibrary(); setSetup(imported); setView('library');
        setNotice(imported.reused ? 'Đề này đã có trong thư viện; giữ nguyên lịch sử.' : `Đã nhập đề, phiên bản ${imported.version}.`);
      })}>Lưu đề vào thư viện</button></div>}
    </aside></div>}

    {view === 'library' && <>
      {setup && <div className="exam-panel exam-setup"><ExamSummary exam={setup} furigana={prefs.furigana}/>
        {setup.instructions && <p className="exam-paper"><ExamContent value={setup.instructions} furigana={prefs.furigana}/></p>}
        <label>Hiện đáp án<select aria-label="Thời điểm hiện kết quả" value={feedbackMode} onChange={e => setFeedbackMode(e.target.value)}><option value="on_submit">Sau khi nộp đề</option><option value="per_question">Ngay từng câu</option></select></label>
        <p className="exam-muted">{feedbackMode === 'per_question' ? 'Mỗi câu chỉ kiểm tra một lần; đáp án sẽ khóa sau khi kiểm tra.' : 'Bạn có thể sửa câu trả lời trước khi nộp. Đáp án được giấu trong suốt lượt làm.'} Bấm Tạm dừng để lưu bài và dừng đồng hồ trước khi thoát. {setup.timeLimitMinutes ? 'Nếu đóng trang khi bài đang chạy, đồng hồ vẫn tiếp tục.' : ''}</p>
        <button disabled={busy} onClick={() => action(async () => selectAttempt(await examRequest(`/api/exams/${setup.id}/attempts`, { feedbackMode })))}>Bắt đầu làm bài</button>
      </div>}
      <div className="exam-library-title"><h2>Thư viện đề <span>{exams.length}</span></h2><button disabled={busy} onClick={() => switchView('import')}>Nhập đề mới</button></div>
      {!exams.length && <div className="exam-empty"><h3>Đề đầu tiên bắt đầu từ một file JSON</h3><p>Bạn có thể dùng đề mẫu để thử đầy đủ trắc nghiệm, điền từ, tự luận và đoạn đọc.</p><button onClick={() => switchView('import')}>Mở trang nhập JSON</button></div>}
      <div className="exam-library">{exams.map(exam => {
        const drafts = history.filter(a => a.examId === exam.id && a.status !== 'SUBMITTED');
        return <article className="exam-panel" key={exam.id}><span className="exam-tag">Phiên bản {exam.version}</span><ExamSummary exam={exam} furigana={prefs.furigana}/>
          <div className="exam-inline"><button disabled={busy} onClick={() => { setSetup(exam); setFeedbackMode('on_submit'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Mở đề</button>
            {drafts.map((draft, i) => <button className="button-secondary" key={draft.id} disabled={busy} onClick={() => openAttempt(draft.id)}>{draft.status === 'PAUSED' ? 'Mở bài tạm dừng' : 'Tiếp tục bài'} {drafts.length > 1 ? i + 1 : ''}</button>)}
            <a href={`/api/exams/${exam.id}/export`} download>Xuất JSON</a></div>
        </article>;
      })}</div>
    </>}

    {view === 'history' && <div className="exam-panel"><h2>Lịch sử làm bài</h2>{!history.length && <p>Chưa có lượt làm bài nào.</p>}
      <div className="exam-history">{history.map(a => <article key={a.id}><div><h3>{a.title}</h3><p>{date(a.startedAt)} · {modeLabel(a.feedbackMode)}</p></div>
        <span>{a.status === 'PAUSED' ? `Tạm dừng${a.remainingMs != null ? ` · ${remainingTime(a.remainingMs, 0)}` : ''}` : a.status === 'IN_PROGRESS' ? 'Đang làm' : a.metrics.maxScore ? `${a.metrics.score}/${a.metrics.maxScore} điểm` : 'Tự luận · đã nộp'}</span>
        <button disabled={busy} onClick={() => openAttempt(a.id)}>{a.status === 'PAUSED' ? 'Mở bài' : a.status === 'IN_PROGRESS' ? 'Tiếp tục' : 'Xem kết quả'}</button></article>)}</div>
    </div>}

    {view === 'attempt' && attempt && currentItem && <>
      <div className="exam-attempt-bar"><div><h2>{attempt.document.title}</h2><p>{modeLabel(attempt.feedbackMode)} · {submitted ? `Đã nộp ${date(attempt.submittedAt)}` : `Đã trả lời ${completed}/${allQuestions.length} câu`}</p></div>
        <div className="exam-attempt-status"><span role="status" className={`exam-save ${session.saveStatus}`}>{SAVE_LABEL[session.saveStatus]}</span>
          {!submitted && attempt.deadlineAt && <strong className={expired ? 'exam-time-expired' : ''} aria-label="Thời gian còn lại">{remainingTime(attempt.deadlineAt, now + session.offset)}</strong>}
          {paused && attempt.remainingMs != null && <strong aria-label="Thời gian còn lại">{remainingTime(attempt.remainingMs, 0)}</strong>}
          {!submitted && !paused && <button className="button-secondary" disabled={disabled || busy} onClick={() => action(async () => { await session.pause(); setConfirmSubmit(false); await refreshLibrary(); })}>Tạm dừng</button>}
          {!submitted && !paused && <button disabled={disabled || busy} onClick={() => setConfirmSubmit(true)}>Nộp bài</button>}
          {submitted && <button disabled={busy} onClick={() => { setSetup(exams.find(e => e.id === attempt.examId)); setView('library'); }}>Làm lại lượt mới</button>}
        </div>
      </div>
      {paused && <div className="exam-panel exam-paused" role="status"><span className="exam-tag">Đã tạm dừng</span><h3>Bài làm và thời gian đã được lưu</h3>
        <p>Đang ở câu {current + 1}/{allQuestions.length}. Bạn có thể đóng app và mở lại để tiếp tục từ đây.</p>
        <p className="exam-muted">{attempt.remainingMs != null ? `Còn ${remainingTime(attempt.remainingMs, 0)}. Đồng hồ chỉ chạy khi bạn bấm Tiếp tục.` : 'Bài không giới hạn thời gian. Câu trả lời được giữ nguyên khi tạm dừng.'}</p>
        <button disabled={busy || session.busy || session.conflict} onClick={() => action(() => session.resume())}>Tiếp tục làm bài</button></div>}
      {!paused && attempt.document.instructions && <details className="exam-general-instructions"><summary>Hướng dẫn làm bài</summary><p className="exam-paper"><ExamContent value={attempt.document.instructions} furigana={prefs.furigana}/></p></details>}
      {submitted && <div className="exam-result-summary" aria-label="Kết quả bài kiểm tra"><div><span>Điểm tự động</span><strong>{attempt.metrics.maxScore ? `${attempt.metrics.score} / ${attempt.metrics.maxScore}` : 'Không có câu tính điểm'}</strong></div>
        <div><span>Đơn vị trả lời đúng</span><strong>{attempt.metrics.correctUnits}/{attempt.metrics.totalUnits}{attempt.metrics.totalUnits > 0 && ` · ${attempt.metrics.correctPercent}%`}</strong></div>
        <div><span>Tự luận đã viết</span><strong>{attempt.metrics.answeredEssays}/{attempt.metrics.essayCount}</strong><small>Không tính trong điểm tự động</small></div></div>}
      {confirmSubmit && !submitted && !paused && <div className="exam-submit-confirm" role="alert"><p>Bạn đã trả lời {completed}/{allQuestions.length} câu. Nộp bài sẽ khóa toàn bộ câu trả lời.</p><button disabled={disabled} onClick={() => action(async () => { await session.submit(); setConfirmSubmit(false); await refreshLibrary(); })}>Xác nhận nộp bài</button><button className="button-secondary" disabled={session.busy} onClick={() => setConfirmSubmit(false)}>Tiếp tục làm</button></div>}
      {!paused && <div className="exam-taking-layout"><aside className="exam-question-map" aria-label="Điều hướng câu hỏi">
        <h3>Câu hỏi</h3><div>{allQuestions.map(({ question }, i) => {
          const checked = Object.hasOwn(attempt.results, question.id); const answered = isAnswered(question, session.answers[question.id]);
          return <button key={question.id} disabled={session.busy || session.conflict} aria-current={current === i ? 'step' : undefined} className={`${checked ? 'checked' : answered ? 'answered' : ''} ${session.flagged.includes(question.id) ? 'flagged' : ''}`} title={`Câu ${i + 1}: ${checked ? '✓ đã khóa' : answered ? 'đã trả lời' : 'chưa trả lời'}${session.flagged.includes(question.id) ? ', đánh dấu xem lại' : ''}`} onClick={() => selectQuestion(i)}>{i + 1}{session.flagged.includes(question.id) && <sup>*</sup>}</button>;
        })}</div><p>Viền chấm: xem lại<br/>Nền xanh: đã trả lời<br/>✓ trong chú thích: câu đã khóa</p>
      </aside><div className="exam-question-body" key={currentItem.question.id}>
        <div className="exam-section-heading"><span>{currentItem.section.title}</span>{currentItem.section.instructions && <p className="exam-paper"><ExamContent value={currentItem.section.instructions} furigana={prefs.furigana}/></p>}</div>
        {currentItem.section.passage && <div className="exam-passage"><h3>Đoạn đọc</h3><div className="exam-paper" lang="ja"><ExamContent value={currentItem.section.passage} furigana={prefs.furigana}/></div></div>}
        {(() => {
          const q = currentItem.question; const result = attempt.results[q.id]; const locked = disabled || Boolean(result); const answer = session.answers[q.id];
          const inputBlank = id => <input type="text" className="exam-blank" aria-label={`Câu ${current + 1}, ô ${q.blanks.findIndex(b => b.id === id) + 1}`} autoComplete="off" spellCheck="false" disabled={locked} value={answer?.[id] || ''}
            onCompositionStart={() => { composing.current = true; clearTimeout(session.timer); }} onCompositionEnd={e => { composing.current = false; session.edit(q.id, { ...session.answers[q.id], [id]: e.currentTarget.value }); }}
            onChange={e => { session.edit(q.id, { ...session.answers[q.id], [id]: e.target.value }); if (composing.current) clearTimeout(session.timer); }}/ >;
          return <article className="exam-panel exam-question"><div className="exam-question-heading"><h3>Câu {current + 1}<span>{TYPE_LABEL[q.type]}</span></h3>
            <button disabled={disabled} className="button-secondary" aria-pressed={session.flagged.includes(q.id)} onClick={() => session.toggleFlag(q.id)}>{session.flagged.includes(q.id) ? 'Bỏ đánh dấu' : 'Đánh dấu xem lại'}</button></div>
            <div className="exam-paper" lang="ja">
              <div className="exam-prompt"><ExamContent value={q.prompt} furigana={prefs.furigana} blank={q.type === 'fill_blank' ? inputBlank : undefined}/></div>
              {q.type === 'single_choice' && <fieldset className="exam-options" disabled={locked}><legend className="sr-only">Chọn đáp án câu {current + 1}</legend>{q.options.map((option, i) => <label key={option.id} className={`${answer === option.id ? 'selected' : ''} ${result?.correctOptionId === option.id ? 'correct' : ''}`}>
                <input type="radio" name={`exam-${attempt.id}-${q.id}`} checked={answer === option.id} onChange={() => session.edit(q.id, option.id)}/><span className="exam-option-letter">{String.fromCharCode(65 + i)}</span><span><ExamContent value={option.text} furigana={prefs.furigana}/></span></label>)}</fieldset>}
              {q.type === 'essay' && <label className="exam-essay-label"><span className="sr-only">Bài viết câu {current + 1}</span><textarea aria-label={`Bài viết câu ${current + 1}`} disabled={locked} value={answer || ''} placeholder="Viết câu trả lời tại đây…" spellCheck="false"
                onCompositionStart={() => { composing.current = true; clearTimeout(session.timer); }} onCompositionEnd={e => { composing.current = false; session.edit(q.id, e.currentTarget.value); }}
                onChange={e => { session.edit(q.id, e.target.value); if (composing.current) clearTimeout(session.timer); }}/></label>}
            </div>
            {!submitted && attempt.feedbackMode === 'per_question' && !result && <button disabled={locked || busy} onClick={() => action(() => session.check(q.id))}>{q.type === 'essay' ? 'Hoàn tất câu' : 'Kiểm tra câu'}</button>}
            {result && <p className="exam-muted">Câu đã khóa.</p>}
            <QuestionFeedback question={q} result={result} furigana={prefs.furigana}/>
          </article>;
        })()}
        <div className="exam-question-footer"><button className="button-secondary" disabled={current === 0 || session.busy || session.conflict} onClick={() => selectQuestion(current - 1)}>Câu trước</button><span>{current + 1} / {allQuestions.length}</span><button className="button-secondary" disabled={current === allQuestions.length - 1 || session.busy || session.conflict} onClick={() => selectQuestion(current + 1)}>Câu tiếp</button></div>
      </div></div>}
    </>}
  </section>;
}
