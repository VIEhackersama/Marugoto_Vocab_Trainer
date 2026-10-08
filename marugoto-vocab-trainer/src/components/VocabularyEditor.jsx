import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KANJI_DICTIONARY,
  findKanjiSuggestions,
  parseKanjiReading,
} from '../kanji.js';
import { romajiToHiragana } from '../utils/japaneseInput.js';
import {
  createVocabularyDraft,
  finalizeVocabularyDraft,
  vocabularyDraftToInput,
  validateVocabularyDraft,
  findVocabularyConflict,
  kanaToRomaji,
} from '../utils/vocabularyEditor.js';
import { JapaneseTerm } from './JapaneseTerm.jsx';
import { Icon } from './Icon.jsx';

export function VocabularyEditor({
  card,
  cards,
  onSave,
  onClose,
  onSpeak,
  onSaved,
  requestRef,
  modal = false,
  suspended = false,
}) {
  const initial = useRef(createVocabularyDraft(card));
  const [draft, setDraft] = useState(initial.current);
  const [manualRomaji, setManualRomaji] = useState(Boolean(card?.romaji));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [overwriteSuggestion, setOverwriteSuggestion] = useState(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState('');
  const [convertInput, setConvertInput] = useState(false);
  const [composition, setComposition] = useState(false);
  const panelRef = useRef(null);
  const firstInputRef = useRef(null);
  const saveRef = useRef(null);
  const closeRef = useRef(null);
  const pendingCloseRef = useRef(onClose);
  const modalRef = useRef(modal);
  const suspendedRef = useRef(suspended);
  modalRef.current = modal;
  suspendedRef.current = suspended;
  const clean = finalizeVocabularyDraft(draft);
  const input = vocabularyDraftToInput(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  const generatedRomaji = kanaToRomaji(clean.reading);
  const conflict = useMemo(
    () => findVocabularyConflict(draft, cards, card),
    [draft, cards, card],
  );
  const duplicateKey = JSON.stringify(input);
  const suggestions = useMemo(() => {
    const exact = KANJI_DICTIONARY.filter(
      (entry) => entry.kanji === draft.spelling.trim(),
    );
    const found = findKanjiSuggestions({
      jp: clean.reading || draft.spelling,
      romaji: draft.romaji,
      vi: draft.meaning,
    }).suggestions;
    return [...exact, ...found]
      .filter(
        (entry, index, all) =>
          all.findIndex(
            (other) =>
              other.kanji === entry.kanji && other.reading === entry.reading,
          ) === index,
      )
      .slice(0, 4);
  }, [draft.spelling, clean.reading, draft.romaji, draft.meaning]);

  function requestClose(afterClose = onClose) {
    if (saving) return;
    pendingCloseRef.current = afterClose;
    if (dirty) setDiscard(true);
    else afterClose();
  }
  closeRef.current = requestClose;
  if (requestRef) requestRef.current = requestClose;

  useEffect(() => {
    const previous = document.activeElement;
    firstInputRef.current?.focus({ preventScroll: true });
    function keydown(event) {
      if (event.isComposing || suspendedRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveRef.current?.(false);
      }
      if (
        event.key === 'Tab' &&
        (modalRef.current || window.matchMedia('(max-width: 760px)').matches)
      ) {
        const elements = [
          ...panelRef.current.querySelectorAll(
            'button, input, textarea, select',
          ),
        ].filter((el) => !el.disabled && el.getClientRects().length);
        const first = elements[0];
        const last = elements.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !panelRef.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !panelRef.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function changeField(field, value) {
    setErrors((prev) => ({ ...prev, [field]: undefined, save: undefined }));
    setDiscard(false);
    setOverwriteSuggestion(null);
    setDraft((prev) => {
      let next = { ...prev, [field]: value };
      if (field === 'spelling') {
        const parsed = parseKanjiReading(value);
        if (parsed.hasKanji && parsed.reading)
          next = { ...next, spelling: parsed.kanji, reading: parsed.reading };
      }
      if (
        (field === 'reading' || next.reading !== prev.reading) &&
        !manualRomaji
      )
        next.romaji = kanaToRomaji(
          romajiToHiragana(next.reading, { isFinal: true }),
        );
      return next;
    });
  }

  function applySuggestion(suggestion, replace = false) {
    const proposed = {
      spelling: suggestion.kanji,
      reading: suggestion.reading,
      romaji: suggestion.romaji || kanaToRomaji(suggestion.reading),
      meaning: suggestion.vi,
    };
    const overwrites = Object.keys(proposed).some(
      (key) =>
        draft[key].trim() &&
        proposed[key] &&
        draft[key].trim() !== proposed[key],
    );
    if (overwrites && !replace) {
      setOverwriteSuggestion(suggestion);
      return;
    }
    setDraft((prev) => ({ ...prev, ...proposed }));
    setManualRomaji(true);
    setErrors({});
    setOverwriteSuggestion(null);
  }

  async function save(keepAdding = false, allowDuplicate = false) {
    if (saving || composition) return;
    const validation = validateVocabularyDraft(draft, card);
    if (Object.keys(validation).length) {
      setErrors(validation);
      panelRef.current
        .querySelector(`[name="${Object.keys(validation)[0]}"]`)
        ?.focus();
      return;
    }
    if (conflict && confirmedDuplicate !== duplicateKey && !allowDuplicate) {
      setErrors({
        duplicate:
          'Từ này đã có trong thư viện. Xem thông tin bên dưới trước khi lưu.',
      });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const saved = await onSave(input, card);
      onSaved?.(saved, keepAdding);
      if (keepAdding && !card) {
        initial.current = createVocabularyDraft(null);
        setDraft(initial.current);
        setManualRomaji(false);
        setConfirmedDuplicate('');
        setDiscard(false);
        setOverwriteSuggestion(null);
        window.requestAnimationFrame(() => firstInputRef.current?.focus());
      } else onClose();
    } catch (error) {
      setErrors({
        save: error.message || 'Chưa lưu được từ vựng. Hãy thử lại.',
      });
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  return (
    <aside
      className="vocabulary-editor"
      ref={panelRef}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby="vocabulary-editor-title"
      aria-describedby="vocabulary-editor-description"
    >
      <div className="editor-heading">
        <div>
          <span className="eyebrow">
            {card ? 'Chỉnh sửa nội dung' : 'Bộ từ tùy chỉnh'}
          </span>
          <h2 id="vocabulary-editor-title">
            {card ? 'Sửa từ vựng' : 'Thêm từ vựng'}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Đóng editor"
          onClick={() => requestClose()}
          disabled={saving}
        >
          <Icon name="close" />
        </button>
      </div>
      <p id="vocabulary-editor-description" className="editor-description">
        {card
          ? 'Nội dung thay đổi, tiến độ ôn được giữ nguyên.'
          : 'Nhập đầy đủ cách viết, cách đọc và nghĩa trong một lần.'}
      </p>
      {card && (
        <div className="editor-card-context">
          {card.deckTitle} · {card.reviewCount || 0} lượt ôn ·{' '}
          {card.wrongCount || 0} lần sai
          {card.dueAt &&
            ` · Hạn ôn ${new Date(card.dueAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`}
        </div>
      )}
      {discard && (
        <div className="inline-warning" role="alert">
          <strong>Bản nháp chưa được lưu</strong>
          <p>Bạn muốn tiếp tục nhập hay bỏ những thay đổi này?</p>
          <div className="inline-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setDiscard(false)}
            >
              Tiếp tục nhập
            </button>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => pendingCloseRef.current()}
            >
              Bỏ thay đổi
            </button>
          </div>
        </div>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
      >
        <div className="editor-scroll">
          <fieldset disabled={saving} className="editor-fields">
            <div className="editor-field">
              <label htmlFor="vocab-spelling">
                Cách viết / Kanji <span>tùy chọn</span>
              </label>
              <input
                ref={firstInputRef}
                id="vocab-spelling"
                name="spelling"
                lang="ja"
                value={draft.spelling}
                placeholder="猫, 食べます…"
                autoComplete="off"
                onChange={(event) =>
                  changeField('spelling', event.target.value)
                }
                onCompositionStart={() => setComposition(true)}
                onCompositionEnd={() => setComposition(false)}
              />
            </div>
            <div className="editor-field">
              <div className="field-label-row">
                <label htmlFor="vocab-reading">
                  Cách đọc Kana {card && !initial.current.reading ? '' : '*'}
                </label>
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={convertInput}
                    onChange={(event) => setConvertInput(event.target.checked)}
                  />
                  Gõ Romaji → Kana
                </label>
              </div>
              <input
                id="vocab-reading"
                name="reading"
                lang="ja"
                value={draft.reading}
                placeholder="ねこ, たべます…"
                aria-invalid={Boolean(errors.reading)}
                aria-describedby={
                  errors.reading ? 'reading-error' : 'reading-help'
                }
                autoComplete="off"
                onCompositionStart={() => setComposition(true)}
                onCompositionEnd={(event) => {
                  setComposition(false);
                  changeField('reading', event.currentTarget.value);
                }}
                onChange={(event) =>
                  changeField(
                    'reading',
                    convertInput && !event.nativeEvent.isComposing
                      ? romajiToHiragana(event.target.value, { isFinal: false })
                      : event.target.value,
                  )
                }
                onBlur={() => {
                  if (!composition && draft.reading)
                    changeField('reading', clean.reading);
                }}
              />
              {errors.reading ? (
                <p className="field-error" id="reading-error">
                  {errors.reading}
                </p>
              ) : (
                <p className="field-help" id="reading-help">
                  {card && !initial.current.reading
                    ? 'Từ cũ chưa có cách đọc. Bổ sung nếu bạn biết; có thể giữ dữ liệu hiện tại.'
                    : 'Kana hoặc Katakana; dán 魚（さかな） để tách nhanh.'}
                </p>
              )}
            </div>
            <div className="editor-field">
              <div className="field-label-row">
                <label htmlFor="vocab-romaji">Romaji</label>
                {manualRomaji &&
                  generatedRomaji &&
                  draft.romaji !== generatedRomaji && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          romaji: generatedRomaji,
                        }));
                        setManualRomaji(false);
                      }}
                    >
                      Tạo lại từ Kana
                    </button>
                  )}
              </div>
              <input
                id="vocab-romaji"
                name="romaji"
                value={draft.romaji}
                placeholder="neko, tabemasu…"
                autoComplete="off"
                onChange={(event) => {
                  setManualRomaji(true);
                  changeField('romaji', event.target.value);
                }}
              />
              <p className="field-help">
                {manualRomaji
                  ? 'Phiên âm bạn chọn sẽ được giữ nguyên.'
                  : 'Tự điền từ Kana. Có thể sửa phiên âm.'}
              </p>
            </div>
            <div className="editor-field">
              <label htmlFor="vocab-meaning">Nghĩa tiếng Việt *</label>
              <textarea
                id="vocab-meaning"
                name="meaning"
                rows={2}
                value={draft.meaning}
                placeholder="con mèo…"
                aria-invalid={Boolean(errors.meaning)}
                aria-describedby={errors.meaning ? 'meaning-error' : undefined}
                onChange={(event) => changeField('meaning', event.target.value)}
              />
              {errors.meaning && (
                <p className="field-error" id="meaning-error">
                  {errors.meaning}
                </p>
              )}
            </div>
            {suggestions.length > 0 && (
              <section
                className="editor-suggestions"
                aria-label="Gợi ý từ Marugoto"
              >
                <div className="suggestion-heading">
                  Gợi ý từ Marugoto <span>Chọn để điền các trường</span>
                </div>
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={`${suggestion.kanji}-${suggestion.reading}`}
                      onClick={() => applySuggestion(suggestion)}
                    >
                      <span className="suggestion-kanji" lang="ja">
                        {suggestion.kanji}
                      </span>
                      <span className="suggestion-detail">
                        <span lang="ja">{suggestion.reading}</span>
                        <span>
                          {suggestion.romaji} · {suggestion.vi}
                        </span>
                      </span>
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {overwriteSuggestion && (
              <div className="inline-warning">
                <p>
                  Điền “{overwriteSuggestion.kanji}” sẽ thay các trường khác với
                  gợi ý hiện tại.
                </p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => applySuggestion(overwriteSuggestion, true)}
                  >
                    Dùng gợi ý này
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOverwriteSuggestion(null)}
                  >
                    Giữ nội dung đã nhập
                  </button>
                </div>
              </div>
            )}
            {input.jp && (
              <div className="editor-preview">
                <span className="eyebrow">Xem trước thẻ từ</span>
                <div>
                  <JapaneseTerm text={input.jp} />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Nghe cách đọc bản nháp"
                    onClick={() => onSpeak(clean.reading || clean.spelling)}
                  >
                    <Icon name="audio" />
                  </button>
                </div>
                {draft.romaji && (
                  <span className="preview-romaji">{draft.romaji}</span>
                )}
                <p>{draft.meaning || 'Nghĩa tiếng Việt'}</p>
              </div>
            )}
            {conflict && (
              <div
                className="inline-warning"
                role={errors.duplicate ? 'alert' : undefined}
              >
                <strong>Từ tương tự đã có</strong>
                <p>
                  {conflict.existing.jp} · {conflict.existing.vi}
                  <br />
                  {conflict.existing.deckTitle}
                </p>
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={confirmedDuplicate === duplicateKey}
                    onChange={(event) =>
                      setConfirmedDuplicate(
                        event.target.checked ? duplicateKey : '',
                      )
                    }
                  />
                  Vẫn lưu nội dung này
                </label>
              </div>
            )}
            {errors.save && (
              <p role="alert" className="field-error">
                {errors.save}
              </p>
            )}
            {errors.duplicate && (
              <p role="alert" className="field-error">
                {errors.duplicate}
              </p>
            )}
          </fieldset>
        </div>
        <div className="editor-footer">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : card ? 'Lưu thay đổi' : 'Lưu từ'}
          </button>
          {!card && (
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={() => save(true)}
            >
              Lưu và thêm tiếp
            </button>
          )}
          <kbd title="Phím tắt lưu từ">Ctrl ↵</kbd>
        </div>
        <span role="status" className="sr-only">
          {saving ? 'Đang lưu từ vựng' : ''}
        </span>
      </form>
    </aside>
  );
}
