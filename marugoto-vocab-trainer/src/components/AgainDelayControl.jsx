import React, { useEffect, useId, useState } from 'react';
import { MAX_AGAIN_DELAY_SECONDS } from '../quizSession.js';

export function AgainDelayControl({ seconds, onChange, onApply, disabled = false }) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(seconds));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(String(seconds)); }, [seconds]);

  function submit(event) {
    event.preventDefault();
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 0 || next > MAX_AGAIN_DELAY_SECONDS || draft === '') return;
    onChange(next);
    onApply?.(next);
    setSaved(true);
  }

  return (
    <form className="again-delay-control" onSubmit={submit}>
      <div className="again-delay-description">
        <label htmlFor={inputId}>Chờ ôn lại thẻ Again</label>
        <p id={`${inputId}-help`}>
          {onApply
            ? 'Áp dụng để đặt lại thời gian chờ của các thẻ đang đợi, tính từ bây giờ.'
            : 'Thời gian từ khi trả lời sai đến khi thẻ quay lại trong phiên. Áp dụng cho Kiểm tra và Ôn đến hạn.'}
          {' '}0 giây = ôn ngay. Tối đa 3.600 giây.
        </p>
      </div>
      <div className="again-delay-fields">
        <div className="again-delay-input">
          <input id={inputId} type="number" min="0" max={MAX_AGAIN_DELAY_SECONDS} step="1" required
            value={draft} disabled={disabled} aria-describedby={`${inputId}-help`}
            onChange={(event) => { setDraft(event.target.value); setSaved(false); }} />
          <span>giây</span>
        </div>
        <button type="submit" className="secondary-button" disabled={disabled}>
          {onApply ? 'Áp dụng' : 'Lưu thời gian'}
        </button>
      </div>
      <span className="again-delay-status" role="status">
        {saved ? (onApply ? 'Đã áp dụng và ghi nhớ cho phiên sau.' : 'Đã lưu cho các phiên sau.') : ''}
      </span>
    </form>
  );
}
