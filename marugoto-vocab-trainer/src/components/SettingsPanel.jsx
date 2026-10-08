import React from 'react';
import { Icon } from './Icon.jsx';
import { AgainDelayControl } from './AgainDelayControl.jsx';

export function SettingsPanel({
  preferences,
  onChange,
  onBackup,
  onImport,
  sessionActive,
}) {
  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Hiển thị và dữ liệu học</span>
          <h1 id="settings-heading">Cài đặt</h1>
        </div>
      </div>
      <div className="settings-layout">
        <div className="settings-section">
          <h2>Cách học của bạn</h2>
          <p className="section-description">
            Chế độ hiển thị, Romaji và hình thức trả lời được ghi nhớ trên trình
            duyệt này.
          </p>
          {sessionActive && (
            <p className="inline-warning">
              Kết thúc phiên học hiện tại trước khi thay đổi cấu hình.
            </p>
          )}
          <fieldset disabled={sessionActive}>
            <AgainDelayControl seconds={preferences.againDelaySeconds}
              onChange={(value) => onChange('againDelaySeconds', value)} disabled={sessionActive} />
            <label className="settings-row">
              <span>
                <strong>Hiển thị tiếng Nhật</strong>
                <small>
                  Giữ đầy đủ dữ liệu Kanji và Kana; chỉ đổi cách hiển thị.
                </small>
              </span>
              <select
                value={preferences.kanjiMode}
                onChange={(event) => onChange('kanjiMode', event.target.value)}
              >
                <option value="ruby">Kanji + Furigana</option>
                <option value="kanji-only">Chỉ Kanji</option>
                <option value="kana-only">Chỉ Kana</option>
              </select>
            </label>
            <label className="settings-row">
              <span>
                <strong>Phiên âm Romaji</strong>
                <small>Áp dụng cho Flashcards và bài kiểm tra.</small>
              </span>
              <select
                value={preferences.romajiMode}
                onChange={(event) => onChange('romajiMode', event.target.value)}
              >
                <option value="always">Luôn hiện</option>
                <option value="reveal">Khi lật / trả lời</option>
                <option value="never">Ẩn</option>
              </select>
            </label>
            <label className="settings-row">
              <span>
                <strong>Chế độ Flashcards</strong>
                <small>Lật thẻ, chọn đáp án hoặc tự gõ.</small>
              </span>
              <select
                value={preferences.studyMode}
                onChange={(event) => onChange('studyMode', event.target.value)}
              >
                <option value="flip">Thẻ lật</option>
                <option value="test">Trắc nghiệm</option>
                <option value="typed">Tự gõ từ</option>
              </select>
            </label>
            <label className="settings-row">
              <span>
                <strong>Hình thức kiểm tra</strong>
                <small>Tự gõ dùng được cả với bộ có ít từ.</small>
              </span>
              <select
                value={preferences.questionType}
                onChange={(event) =>
                  onChange('questionType', event.target.value)
                }
              >
                <option value="multiple_choice">Trắc nghiệm</option>
                <option value="typed">Tự gõ từ</option>
              </select>
            </label>
            <label className="settings-row">
              <span>
                <strong>Tự đánh giá theo phản xạ</strong>
                <small>
                  Lưu mức nhớ sau khi trả lời; vẫn có thể đánh giá thủ công.
                </small>
              </span>
              <input
                className="toggle-switch"
                type="checkbox"
                checked={preferences.autoRate}
                onChange={(event) => onChange('autoRate', event.target.checked)}
              />
            </label>
            <label className="settings-row">
              <span>
                <strong>Cỡ chữ Flashcards</strong>
                <small>Điều chỉnh từ 28 đến 68px.</small>
              </span>
              <input
                type="range"
                min="28"
                max="68"
                step="2"
                value={preferences.fontSize}
                aria-label="Cỡ chữ Flashcards"
                onChange={(event) =>
                  onChange('fontSize', Number(event.target.value))
                }
              />
              <output>{preferences.fontSize}px</output>
            </label>
          </fieldset>
        </div>
        <aside className="settings-data">
          <Icon name="book" size={24} />
          <h2>Dữ liệu của bạn</h2>
          <p>Từ vựng, bộ PDF và tiến độ ôn tập được lưu trên máy này.</p>
          <button type="button" className="button-primary" onClick={onBackup}>
            Sao lưu & khôi phục
          </button>
          <button type="button" className="text-button" onClick={onImport}>
            Quản lý bộ từ
            <Icon name="arrow" size={15} />
          </button>
          <div className="settings-data-note">
            File JSON lưu từ vựng và lịch sử ôn. Nếu chuyển máy, hãy sao chép
            PDF gốc riêng. Khôi phục cập nhật các từ có trong file.
          </div>
        </aside>
      </div>
    </section>
  );
}
