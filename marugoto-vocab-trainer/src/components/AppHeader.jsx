import React from 'react';

export function AppHeader({ section, onNavigate, sessionActive, dueCount }) {
  return (
    <header className="app-header">
      <a className="skip-link" href="#app-main">
        Đến nội dung chính
      </a>
      <button
        type="button"
        className="brand"
        onClick={() => onNavigate('study')}
        aria-label="Marugoto — mở Học tập"
      >
        <span className="brand-mark" lang="ja">
          ま
        </span>
        <span>
          marugoto<small>Vocab trainer</small>
        </span>
      </button>
      <nav aria-label="Điều hướng chính">
        {[
          ['study', 'Học tập'],
          ['dictionary', 'Từ điển'],
          ['grammar', 'Chia từ'],
          ['particles', 'Trợ từ & đuôi câu'],
          ['import', 'Bộ từ'],
          ['settings', 'Cài đặt'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            {label}
            {id === 'study' && dueCount > 0 && (
              <span className="nav-count">{dueCount}</span>
            )}
            {id === 'study' && sessionActive && (
              <span className="session-dot" title="Phiên học đang diễn ra" />
            )}
          </button>
        ))}
      </nav>
      <span className="local-indicator">
        <span />
        Dữ liệu trên máy này
      </span>
    </header>
  );
}
