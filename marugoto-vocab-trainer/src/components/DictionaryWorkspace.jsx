import React, { useEffect, useRef, useState } from 'react';
import { KANA_ROWS, getKanaRow, isCardLeech } from '../dictionary.js';
import { hasKanji } from '../kanji.js';
import { JapaneseTerm, Highlight } from './JapaneseTerm.jsx';
import { Icon } from './Icon.jsx';

function Status({ card }) {
  const due = new Date(card.dueAt).getTime() <= Date.now();
  const isNew = !card.reviewCount;
  const date = new Date(card.dueAt);
  return (
    <div className="vocab-status">
      <div className="status-labels">
        {isNew && <span className="status-badge neutral">Mới</span>}
        {due ? (
          <span className="status-badge due">Đến hạn</span>
        ) : (
          !isNew && <span className="status-badge reviewed">Đã ôn</span>
        )}
        {isCardLeech(card) && (
          <span className="status-badge difficult">Từ khó</span>
        )}
      </div>
      <span className="vocab-meta">
        {card.reviewCount || 0} lượt · {card.wrongCount || 0} sai
        {!due && !Number.isNaN(date.getTime())
          ? ` · Ôn ${date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}`
          : ''}
      </span>
    </div>
  );
}

export function DictionaryWorkspace({
  cards,
  visibleCards,
  decks,
  customDeck,
  filters,
  setFilters,
  rowCounts,
  viewMode,
  setViewMode,
  showRomaji,
  setShowRomaji,
  editor,
  editingId,
  onAdd,
  onEdit,
  onDelete,
  onSpeak,
  onBatchKanji,
  onFlushKana,
  onImport,
  blocked = false,
}) {
  const searchRef = useRef(null);
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState(null);
  const pageSize = 80;
  const totalPages = Math.max(1, Math.ceil(visibleCards.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageCards = visibleCards.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const leechCount = cards.filter(isCardLeech).length;
  const dueCount = cards.filter(
    (card) => new Date(card.dueAt).getTime() <= Date.now(),
  ).length;
  const activeFilters =
    filters.search.trim() ||
    filters.deck !== 'all' ||
    filters.status !== 'all' ||
    filters.row !== 'all';
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
    setActionId(null);
  }, [filterKey, viewMode]);
  useEffect(() => {
    function keydown(event) {
      if (
        blocked ||
        editor ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) ||
        event.target?.isContentEditable
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [blocked, Boolean(editor)]);
  function resetFilters() {
    setFilters({
      search: '',
      deck: 'all',
      status: 'all',
      row: 'all',
      sort: filters.sort,
    });
  }
  function actions(card) {
    return (
      <div className="vocab-row-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`Nghe ${card.jp}`}
          title="Nghe phát âm"
          onClick={() => onSpeak(card.jp)}
        >
          <Icon name="audio" size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Sửa ${card.jp}`}
          title="Sửa từ vựng"
          onClick={() => onEdit(card)}
        >
          <Icon name="edit" size={17} />
        </button>
        <button
          type="button"
          className={`icon-button ${actionId === `${card.id}-${card.deckId}` ? 'selected' : ''}`}
          aria-label={`Thao tác với ${card.jp}`}
          aria-expanded={actionId === `${card.id}-${card.deckId}`}
          onClick={() =>
            setActionId(
              actionId === `${card.id}-${card.deckId}`
                ? null
                : `${card.id}-${card.deckId}`,
            )
          }
        >
          <Icon name="more" size={17} />
        </button>
      </div>
    );
  }
  function extraActions(card) {
    return (
      <div className="vocab-extra-actions">
        <span>
          Thao tác với <strong>{card.jp}</strong>
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onEdit(card);
            setActionId(null);
          }}
        >
          {hasKanji(card.jp) ? 'Sửa Hán tự và cách đọc' : 'Thêm Hán tự'}
        </button>
        {hasKanji(card.jp) && (
          <button
            type="button"
            className="text-button"
            onClick={() => onFlushKana(card)}
          >
            Gỡ về Kana
          </button>
        )}
        <button
          type="button"
          className="text-button danger-text"
          onClick={async () => {
            await onDelete(card);
            setActionId(null);
          }}
        >
          <Icon name="trash" size={15} />
          Xóa từ
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Đóng thao tác từ"
          onClick={() => setActionId(null)}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    );
  }
  function cardGrid(items) {
    return (
      <div className="vocab-grid">
        {items.map((card) => (
          <article
            className={`vocab-tile ${editingId === card.id ? 'selected' : ''}`}
            key={`${card.id}-${card.deckId}`}
          >
            <div className="tile-top">
              <span className="vocab-source">
                {card.deckId === 'custom' ? 'Tùy chỉnh' : card.deckTitle}
              </span>
              <span className="vocab-kana-row">{getKanaRow(card)}</span>
            </div>
            <button
              type="button"
              className="vocab-title-button"
              onClick={() => onEdit(card)}
            >
              <JapaneseTerm text={card.jp} query={filters.search} />
            </button>
            {showRomaji && card.romaji && (
              <span className="vocab-romaji">
                <Highlight text={card.romaji} query={filters.search} />
              </span>
            )}
            <p className="tile-meaning">
              <Highlight text={card.vi} query={filters.search} />
            </p>
            <div className="tile-bottom">
              <Status card={card} />
              {actions(card)}
            </div>
            {actionId === `${card.id}-${card.deckId}` && extraActions(card)}
          </article>
        ))}
      </div>
    );
  }
  return (
    <section
      className="dictionary-workspace"
      aria-labelledby="dictionary-heading"
    >
      <div className="workspace-heading" inert={blocked}>
        <div className="heading-with-stats">
          <h1 id="dictionary-heading">Từ điển</h1>
          <div className="workspace-stats">
            <span>
              <b>{cards.length}</b> từ vựng
            </span>
            <button
              type="button"
              onClick={() =>
                setFilters({
                  ...filters,
                  status: filters.status === 'due' ? 'all' : 'due',
                })
              }
            >
              <b>{dueCount}</b> đến hạn
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters({
                  ...filters,
                  status: filters.status === 'leech' ? 'all' : 'leech',
                })
              }
            >
              <b>{leechCount}</b> từ khó
            </button>
          </div>
        </div>
        <button type="button" className="button-primary" onClick={onAdd}>
          <Icon name="plus" size={17} />
          Thêm từ
        </button>
      </div>
      <div className={`dictionary-columns ${editor ? 'with-editor' : ''}`}>
        <div className="dictionary-results" inert={blocked}>
          <div className="dictionary-searchbar">
            <div className="search-field">
              <Icon name="search" />
              <input
                ref={searchRef}
                aria-label="Tìm từ vựng"
                placeholder="Tìm Kanji, Kana, Romaji hoặc tiếng Việt…"
                value={filters.search}
                onChange={(event) =>
                  setFilters({ ...filters, search: event.target.value })
                }
              />
              {filters.search ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Xóa tìm kiếm"
                  onClick={() => setFilters({ ...filters, search: '' })}
                >
                  <Icon name="close" size={15} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
            <select
              aria-label="Lọc bộ từ"
              value={filters.deck}
              onChange={(event) =>
                setFilters({ ...filters, deck: event.target.value })
              }
            >
              <option value="all">Tất cả bộ</option>
              {customDeck && (
                <option value="custom">
                  Từ tùy chỉnh ({customDeck.cardCount})
                </option>
              )}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.title} ({deck.cardCount})
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc trạng thái"
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value })
              }
            >
              <option value="all">Mọi trạng thái</option>
              <option value="due">Đến hạn ôn</option>
              <option value="reviewed">Đã ôn / Đang nhớ</option>
              <option value="new">Từ mới</option>
              <option value="leech">Từ khó ({leechCount})</option>
            </select>
          </div>
          <div className="dictionary-controls">
            <div className="result-count" aria-live="polite">
              {visibleCards.length} kết quả
              {activeFilters && (
                <button
                  type="button"
                  className="text-button"
                  onClick={resetFilters}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
            <div className="dictionary-view-tools">
              <select
                aria-label="Lọc hàng âm"
                value={filters.row}
                onChange={(event) =>
                  setFilters({ ...filters, row: event.target.value })
                }
              >
                <option value="all">Mọi hàng âm</option>
                {KANA_ROWS.filter((row) => row.id !== 'all').map((row) => (
                  <option key={row.id} value={row.label}>
                    {row.label} ({rowCounts[row.label] || 0})
                  </option>
                ))}
              </select>
              <select
                aria-label="Sắp xếp từ"
                value={filters.sort}
                onChange={(event) =>
                  setFilters({ ...filters, sort: event.target.value })
                }
              >
                <option value="gojuon-asc">五十音 A → Wa</option>
                <option value="gojuon-desc">五十音 Wa → A</option>
                <option value="wrong-desc">Sai nhiều nhất</option>
                <option value="review-desc">Ôn nhiều nhất</option>
                <option value="recent">Mới thêm gần đây</option>
              </select>
              <div className="view-switch" aria-label="Chế độ hiển thị">
                <button
                  type="button"
                  aria-pressed={viewMode === 'table'}
                  onClick={() => setViewMode('table')}
                >
                  Bảng
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === 'cards'}
                  onClick={() => setViewMode('cards')}
                >
                  Thẻ
                </button>
              </div>
              <details className="dictionary-tools">
                <summary>Công cụ</summary>
                <div className="tools-popover">
                  <label className="inline-checkbox">
                    <input
                      type="checkbox"
                      checked={showRomaji}
                      onChange={(event) => setShowRomaji(event.target.checked)}
                    />
                    Hiện Romaji
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onBatchKanji('all')}
                  >
                    Gán Kanji · Toàn thư viện
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onBatchKanji('filtered')}
                  >
                    Gán Kanji · Kết quả đang lọc
                  </button>
                </div>
              </details>
            </div>
          </div>
          {!visibleCards.length ? (
            <div className="workspace-empty">
              <Icon name="book" size={30} />
              <h2>
                {cards.length
                  ? 'Không có từ khớp bộ lọc'
                  : 'Bắt đầu thư viện từ vựng của bạn'}
              </h2>
              <p>
                {cards.length
                  ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem lại thư viện.'
                  : 'Thêm từ với Kanji, Kana, Romaji và nghĩa; hoặc nhập từ giáo trình PDF.'}
              </p>
              <div className="inline-actions">
                {cards.length ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={resetFilters}
                  >
                    Xóa bộ lọc
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={onImport}
                  >
                    Nhập PDF
                  </button>
                )}
                <button
                  type="button"
                  className="button-primary"
                  onClick={onAdd}
                >
                  Thêm từ vựng
                </button>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <div className="vocabulary-table-scroll">
              <table className="vocabulary-table">
                <caption className="sr-only">
                  Danh sách từ vựng và tiến độ ôn tập
                </caption>
                <colgroup>
                  <col className="word-column" />
                  <col className="meaning-column" />
                  <col className="deck-column" />
                  <col className="status-column" />
                  <col className="actions-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Từ tiếng Nhật</th>
                    <th scope="col">Nghĩa tiếng Việt</th>
                    <th scope="col">Bộ từ</th>
                    <th scope="col">Trạng thái & lượt ôn</th>
                    <th scope="col">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageCards.map((card) => (
                    <React.Fragment key={`${card.id}-${card.deckId}`}>
                      <tr className={editingId === card.id ? 'selected' : ''}>
                        <td>
                          <button
                            type="button"
                            className="vocab-title-button"
                            onClick={() => onEdit(card)}
                          >
                            <JapaneseTerm
                              text={card.jp}
                              query={filters.search}
                            />
                          </button>
                          {showRomaji && card.romaji && (
                            <span className="vocab-romaji">
                              <Highlight
                                text={card.romaji}
                                query={filters.search}
                              />
                            </span>
                          )}
                        </td>
                        <td className="vocab-meaning">
                          <Highlight text={card.vi} query={filters.search} />
                        </td>
                        <td className="vocab-source">
                          {card.deckId === 'custom'
                            ? 'Tùy chỉnh'
                            : card.deckTitle}
                        </td>
                        <td>
                          <Status card={card} />
                        </td>
                        <td>{actions(card)}</td>
                      </tr>
                      {actionId === `${card.id}-${card.deckId}` && (
                        <tr className="action-row">
                          <td colSpan={5}>{extraActions(card)}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filters.sort === 'gojuon-asc' &&
            filters.row === 'all' &&
            !filters.search.trim() ? (
            <div>
              {KANA_ROWS.filter((row) => row.id !== 'all').map((row) => {
                const grouped = pageCards.filter(
                  (card) => getKanaRow(card) === row.label,
                );
                return grouped.length ? (
                  <section key={row.id} className="vocab-group">
                    <h2>
                      {row.label}
                      <span>{rowCounts[row.label] || grouped.length} từ</span>
                    </h2>
                    {cardGrid(grouped)}
                  </section>
                ) : null;
              })}
            </div>
          ) : (
            cardGrid(pageCards)
          )}
          {visibleCards.length > 0 && (
            <div className="dictionary-pagination">
              <span>
                {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, visibleCards.length)} /{' '}
                {visibleCards.length} từ
              </span>
              {totalPages > 1 && (
                <div>
                  <button
                    type="button"
                    className="text-button"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Trước
                  </button>
                  <span>
                    Trang {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Sau
                  </button>
                </div>
              )}
              <span className="pagination-hint">Chọn từ để sửa · / để tìm</span>
            </div>
          )}
        </div>
        {editor}
      </div>
    </section>
  );
}
