import React, { useState } from 'react';
import { BunproWorkspace } from './BunproWorkspace.jsx';
import { GrammarWorkspace } from './GrammarWorkspace.jsx';
import './bunpro.css';

export function GrammarLearningWorkspace() {
  const [section, setSection] = useState('patterns');
  const [group, setGroup] = useState('noun');
  return <div className="grammar-learning"><nav className="catalog-subnav" aria-label="Nội dung ngữ pháp">
    {[['patterns','Mẫu câu'],['review','Ôn tập'],['conjugation','Bảng chia từ']].map(([id,label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}
  </nav>
    {section === 'patterns' && <BunproWorkspace kind="GRAMMAR" onConjugation={value => { setGroup(value || 'noun'); setSection('conjugation'); }} />}
    {section === 'review' && <BunproWorkspace kind="GRAMMAR" initialView="review" />}
    {section === 'conjugation' && <GrammarWorkspace initialGroupId={group} />}
  </div>;
}
