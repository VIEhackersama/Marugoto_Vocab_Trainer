import React from 'react';
import { JapaneseTerm } from './JapaneseTerm.jsx';
import { Icon } from './Icon.jsx';

export function DeckLibrary({
  decks,
  customDeck,
  customCards,
  showCustomList,
  onToggleCustom,
  busy,
  onAdd,
  onEdit,
  onDeleteCard,
  onDictionary,
  onStudy,
  onFiles,
  onDeleteDeck,
  onBackup,
}) {
  return (
    <section className="deck-library" aria-labelledby="library-heading">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Tài liệu và từ tự thêm</span>
          <h1 id="library-heading">Bộ từ của bạn</h1>
        </div>
        <button type="button" className="button-secondary" onClick={onBackup}>
          Sao lưu dữ liệu
        </button>
      </div>
      <div className="library-grid">
        <div className="library-main">
          <div className="library-section-heading">
            <h2>
              Bộ từ đã chọn học <span>{decks.length}</span>
            </h2>
            <label
              className={`button-primary upload-control ${busy ? 'is-busy' : ''}`}
            >
              <Icon name="plus" size={17} />
              {busy ? 'Đang nhập…' : 'Nhập PDF'}
              <input
                type="file"
                className="sr-only"
                accept="application/pdf"
                multiple
                disabled={busy}
                aria-label="Chọn PDF để nhập từ vựng"
                onChange={onFiles}
              />
            </label>
          </div>
          <p className="section-description">
            Mỗi PDF tạo một bộ riêng. Có thể học từng bộ hoặc gộp các bộ đang
            có.
          </p>
          {decks.length ? (
            <div className="library-decks">
              {decks.map((deck) => (
                <article key={deck.id} className="library-deck">
                  <span className="deck-file-symbol">{deck.originalFilename ? 'PDF' : deck.id.startsWith('bunpro_') ? deck.id.slice(7).toUpperCase() : 'TỪ'}</span>
                  <div className="library-deck-body">
                    <h3>{deck.title}</h3>
                    <p>
                      {deck.cardCount} từ <span>·</span>{' '}
                      <b>{deck.dueCount} đến hạn</b>
                    </p>
                    <span className="file-name">{deck.originalFilename}</span>
                  </div>
                  <div className="library-deck-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => onStudy(deck.id)}
                    >
                      Học bộ này
                      <Icon name="arrow" size={15} />
                    </button>
                    {deck.originalFilename && <a
                      href={`/api/decks/${deck.id}/pdf`}
                      className="text-button"
                    >
                      Tải PDF
                    </a>}
                    <button
                      type="button"
                      className="icon-button danger-text"
                      aria-label={`Xóa bộ ${deck.title}`}
                      disabled={busy}
                      onClick={() => onDeleteDeck(deck)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="workspace-empty">
              <Icon name="book" size={30} />
              <h2>Chưa có bộ từ từ PDF</h2>
              <p>
                Chọn PDF giáo trình để kiểm tra và nhập từ vựng vào thư viện.
              </p>
            </div>
          )}
          <p className="library-note">
            PDF gốc và tiến độ được lưu trên máy này. File không gửi tới dịch vụ
            bên ngoài.
          </p>
        </div>
        <aside className="custom-library">
          <span className="eyebrow">Thư viện cá nhân</span>
          <h2>Từ vựng tùy chỉnh</h2>
          <p>Thêm Kanji, Kana, Romaji và nghĩa từ cùng một form.</p>
          <div className="custom-library-stats">
            <span>
              <b>{customDeck?.cardCount || 0}</b> từ
            </span>
            <span>
              <b>{customDeck?.dueCount || 0}</b> đến hạn
            </span>
          </div>
          <button type="button" className="button-primary" onClick={onAdd}>
            <Icon name="plus" size={17} />
            Thêm từ vựng
          </button>
          <button type="button" className="text-button" onClick={onDictionary}>
            Tra cứu từ tùy chỉnh
            <Icon name="arrow" size={15} />
          </button>
          <button
            type="button"
            className="text-button"
            aria-expanded={showCustomList}
            onClick={onToggleCustom}
          >
            {showCustomList ? 'Ẩn danh sách nhanh' : 'Xem danh sách nhanh'}
          </button>
          {showCustomList && (
            <div className="custom-quick-list">
              {customCards.length ? (
                customCards.map((card) => (
                  <div className="custom-quick-word" key={card.id}>
                    <div>
                      <JapaneseTerm text={card.jp} />
                      <span>{card.vi}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Sửa ${card.jp}`}
                        onClick={() => onEdit(card)}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger-text"
                        aria-label={`Xóa ${card.jp}`}
                        onClick={() => onDeleteCard(card)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-hint">
                  Chưa có từ tùy chỉnh. Thêm từ đầu tiên để bắt đầu.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
