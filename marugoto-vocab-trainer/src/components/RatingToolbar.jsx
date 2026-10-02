import React from 'react';

/**
 * Component for FSRS rating buttons (Again, Hard, Good, Easy).
 * Displays keyboard shortcut hints and auto-rating indicators.
 */
export function RatingToolbar({
  onRate,
  disabled = false,
  includeAgain = true,
  autoRating = null,
  autoRateByResponseTime = true
}) {
  const badgeText = autoRateByResponseTime ? 'Tự động' : 'Gợi ý';

  return (
    <div className="rating-options-toolbar" aria-label="Đánh giá mức độ ghi nhớ">
      {includeAgain && (
        <button
          type="button"
          disabled={disabled}
          className={`rating-pill-btn again ${autoRating === 'AGAIN' ? 'highlight-rating' : ''}`}
          onClick={() => onRate('AGAIN')}
          title="Quên hoàn toàn, cần học lại (Phím 1)"
        >
          <span className="rating-emoji">🔄</span>
          <span className="rating-name">Again</span>
          <span className="rating-shortcut-tag">1</span>
          {autoRating === 'AGAIN' && <span className="auto-pill-badge">{badgeText}</span>}
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        className={`rating-pill-btn hard ${autoRating === 'HARD' ? 'highlight-rating' : ''}`}
        onClick={() => onRate('HARD')}
        title="Nhớ khó khăn, mất nhiều thời gian (Phím 2)"
      >
        <span className="rating-emoji">🐢</span>
        <span className="rating-name">Hard</span>
        <span className="rating-shortcut-tag">2</span>
        {autoRating === 'HARD' && <span className="auto-pill-badge">{badgeText}</span>}
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`rating-pill-btn good ${autoRating === 'GOOD' ? 'highlight-rating' : ''}`}
        onClick={() => onRate('GOOD')}
        title="Nhớ bình thường, phản xạ vừa phải (Phím 3)"
      >
        <span className="rating-emoji">⏱️</span>
        <span className="rating-name">Good</span>
        <span className="rating-shortcut-tag">3</span>
        {autoRating === 'GOOD' && <span className="auto-pill-badge">{badgeText}</span>}
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`rating-pill-btn easy ${autoRating === 'EASY' ? 'highlight-rating' : ''}`}
        onClick={() => onRate('EASY')}
        title="Nhớ rất nhanh, phản xạ tức thì (Phím 4)"
      >
        <span className="rating-emoji">⚡</span>
        <span className="rating-name">Easy</span>
        <span className="rating-shortcut-tag">4</span>
        {autoRating === 'EASY' && <span className="auto-pill-badge">{badgeText}</span>}
      </button>
    </div>
  );
}

export default RatingToolbar;
