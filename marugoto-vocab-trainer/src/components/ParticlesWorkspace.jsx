import React, { useState } from 'react';
import { PARTICLE_LESSONS, COMPARISONS } from '../grammar/particles.js';
import './grammar.css';

export function ParticlesWorkspace() {
  const [lessonId, setLessonId] = useState('wa');
  const [comparisonId, setComparisonId] = useState('wa-ga');
  const lesson = PARTICLE_LESSONS.find(item => item.id === lessonId);
  const comparison = COMPARISONS.find(item => item.id === comparisonId);
  const lessons = PARTICLE_LESSONS.filter(item => item.section === lesson.section);

  function selectLesson(item) {
    setLessonId(item.id);
    if (item.compare) setComparisonId(item.compare);
  }

  return <section className="grammar-workspace particles-workspace" aria-labelledby="particles-heading">
    <div className="grammar-heading">
      <span className="eyebrow">Ngữ pháp · Nền tảng A1 → N5</span>
      <h1 id="particles-heading">Trợ từ & đuôi câu</h1>
      <p>Trợ từ cho biết vai trò của từng phần. Đuôi câu cho biết cách nói và ý định của người nói.</p>
    </div>
    <nav className="grammar-register particles-sections" aria-label="Loại ngữ pháp">
      <button type="button" aria-pressed={lesson.section === 'particles'} onClick={() => selectLesson(PARTICLE_LESSONS.find(item => item.id === 'wa'))}>Trợ từ</button>
      <button type="button" aria-pressed={lesson.section === 'endings'} onClick={() => selectLesson(PARTICLE_LESSONS.find(item => item.id === 'desu'))}>Đuôi câu</button>
    </nav>
    <div className="particles-layout">
      <nav className="particle-list" aria-label={lesson.section === 'particles' ? 'Chọn trợ từ' : 'Chọn đuôi câu'}>
        {lessons.map(item => <button type="button" key={item.id} aria-pressed={lessonId === item.id} onClick={() => selectLesson(item)}>
          <span lang="ja">{item.label}</span><small>{item.title}</small>
        </button>)}
      </nav>
      <div className="particles-content">
        <article className="grammar-surface" aria-labelledby="particle-lesson-heading">
          <div className="particle-lesson-title"><span lang="ja">{lesson.label}</span><div><small>{lesson.reading}</small><h2 id="particle-lesson-heading">{lesson.title}</h2></div></div>
          <p>{lesson.intro}</p>
          <div className="particle-pattern"><span>Mẫu nền tảng</span><p>{lesson.pattern}</p></div>
          <div className="particle-examples">{lesson.examples.map((item, index) => <section key={item.jp} aria-label={`Ví dụ ${index + 1}`}>
            <h3>Ví dụ {index + 1}</h3>
            <p className="particle-jp" lang="ja">{item.jp}</p>
            <p className="particle-reading" lang="ja">{item.kana}</p>
            <p className="particle-translation">{item.vi}</p>
            <div className="particle-breakdown" aria-label="Tách cấu trúc">{item.parts.map(([jp, role]) => <div key={jp}>
              <span lang="ja">{jp}</span><small>{role}</small>
            </div>)}</div>
          </section>)}</div>
          <aside className="grammar-note"><h3>Lưu ý dễ nhầm</h3><p>{lesson.note}</p></aside>
        </article>
        <section className="grammar-surface grammar-reference" aria-labelledby="grammar-comparison-heading">
          <h2 id="grammar-comparison-heading">So sánh dễ nhầm</h2>
          <nav className="grammar-register comparison-nav" aria-label="Chọn cặp so sánh">
            {COMPARISONS.map(item => <button type="button" lang="ja" key={item.id} aria-pressed={comparisonId === item.id} onClick={() => setComparisonId(item.id)}>{item.label}</button>)}
          </nav>
          <h3 className="comparison-title">{comparison.title}</h3><p>{comparison.intro}</p>
          <dl className="grammar-comparisons">{comparison.rows.map(([context, jp, kana, explanation]) => <div key={context}>
            <dt>{context}</dt><dd><p className="particle-jp" lang="ja">{jp}</p><p className="particle-reading" lang="ja">{kana}</p><p>{explanation}</p></dd>
          </div>)}</dl>
          <aside className="grammar-note"><h3>Cách nhớ</h3><p>{comparison.note}</p></aside>
        </section>
        <p className="grammar-terminology">Trong tab này, “đuôi câu” gồm です / ます, mẫu lời mời và trợ từ cuối câu か / ね / よ. Chúng thuộc các loại ngữ pháp khác nhau nhưng cùng giúp bạn đọc hiểu phần kết thúc câu.</p>
      </div>
    </div>
  </section>;
}
