import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import {
  createQuizSession,
  nextWaitingDueAt,
  recordFirstAttempt,
  releaseDueRepeats,
  removeCurrentQuestion,
  scheduleAgain,
  secondsUntilNextRepeat,
  selectInitialCards,
} from './quizSession.js';
import {
  KANA_ROWS,
  extractReading,
  getKanaRow,
  compareJapanese,
  filterAndSortDictionary,
  canonicalKanaKey,
  findDuplicates,
} from './dictionary.js';
import {
  hasKanji,
  parseKanjiReading,
  formatKanjiTerm,
  findKanjiSuggestions,
  autoMapKanjiForCards,
  getTestJapaneseDisplay,
  resolveCardKanjiDetails,
} from './kanji.js';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

function normalize(s) {
  return s.normalize('NFKC').replace(/[\u3000\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isJapanese(s) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s);
}

function isRomaji(s) {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters.length / Math.max(s.length, 1) > 0.55;
}

function cleanLine(s) {
  return normalize(s).replace(/^[•·–—]+\s*/, '');
}

async function extractPdfPages(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, enableScripting: false }).promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = content.items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => ({
        text: cleanLine(item.str),
        x: item.transform?.[4] ?? 0,
        y: Math.round(viewport.height - (item.transform?.[5] ?? 0)),
      }));
    const columnBoundary = viewport.width * 0.44;
    const lines = [];
    for (const item of items.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const column = item.x >= columnBoundary ? 'right' : 'left';
      let line = lines.find((candidate) => candidate.column === column && Math.abs(candidate.y - item.y) < 3);
      if (!line) {
        line = { y: item.y, column, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }
    pages.push(lines
      .map((line) => ({
        y: line.y,
        column: line.column,
        text: cleanLine(line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ')),
      }))
      .filter((line) => line.text)
      .sort((a, b) => a.y - b.y || a.column.localeCompare(b.column)));
  }
  return pages;
}

function parseVocabulary(pages) {
  const entries = [];
  for (const page of pages) {
    const left = page.filter((line) => line.column === 'left' && !/^\d+\s*\/\s*\d+$/.test(line.text));
    const right = page.filter((line) => line.column === 'right' && !/^\d+\s*\/\s*\d+$/.test(line.text));
    const japaneseRows = left.filter((line) => isJapanese(line.text));
    for (let i = 0; i < japaneseRows.length; i++) {
      const start = japaneseRows[i].y;
      const end = japaneseRows[i + 1]?.y ?? Infinity;
      const rowLeft = left.filter((line) => line.y >= start && line.y < end);
      const rowRight = right.filter((line) => line.y >= start && line.y < end);
      const jp = rowLeft.filter((line) => isJapanese(line.text)).map((line) => line.text).join(' ');
      const romaji = rowLeft.filter((line) => !isJapanese(line.text) && isRomaji(line.text)).map((line) => line.text).join(' ');
      const vi = rowRight.map((line) => line.text).join(' ');
      if (jp && vi) entries.push({ jp, romaji, vi });
    }
  }
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.jp}|${entry.vi}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Lỗi máy chủ (${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function optionKey(entry, direction) {
  const text = direction === 'jp-vi' ? entry.vi : entry.jp;
  return normalize(text).toLocaleLowerCase();
}

function makeOptions(entry, pool, direction) {
  if (pool.length < 5) return [];
  const seen = new Set([optionKey(entry, direction)]);
  const distractors = [];
  for (const candidate of shuffled(pool.filter((card) => card.id !== entry.id))) {
    const key = optionKey(candidate, direction);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distractors.push(candidate);
    if (distractors.length === 4) break;
  }
  return distractors.length === 4 ? shuffled([entry, ...distractors]) : [];
}

function removeDiacritics(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

function highlightMatch(text, query) {
  if (!query || !query.trim() || !text) return text;
  const q = query.trim();
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const index = lowerText.indexOf(lowerQ);

  if (index !== -1) {
    return (
      <>
        {text.slice(0, index)}
        <mark className="highlight-text">{text.slice(index, index + q.length)}</mark>
        {text.slice(index + q.length)}
      </>
    );
  }

  const normText = removeDiacritics(text);
  const normQ = removeDiacritics(q);
  const normIndex = normText.indexOf(normQ);
  if (normIndex !== -1) {
    return (
      <>
        {text.slice(0, normIndex)}
        <mark className="highlight-text">{text.slice(normIndex, normIndex + normQ.length)}</mark>
        {text.slice(normIndex + normQ.length)}
      </>
    );
  }

  return text;
}

function renderJpDisplay(jpText, searchQuery = '') {
  if (!jpText) return null;
  const parsed = parseKanjiReading(jpText);
  if (parsed.hasKanji && parsed.reading) {
    return (
      <span className="ruby-term-wrapper" title={`${parsed.kanji} (${parsed.reading})`}>
        <ruby className="dict-ruby">
          {parsed.kanji}
          <rp>（</rp>
          <rt>{parsed.reading}</rt>
          <rp>）</rp>
        </ruby>
      </span>
    );
  }
  return highlightMatch(jpText, searchQuery);
}

function renderTestJp(cardOrText, kanjiMode = 'ruby') {
  if (!cardOrText) return null;
  const details = resolveCardKanjiDetails(cardOrText);

  if (kanjiMode === 'kanji-only') {
    return (
      <span className="jp-text" lang="ja">
        {details.kanji || details.reading}
      </span>
    );
  }

  if (kanjiMode === 'kana-only') {
    return (
      <span className="jp-text" lang="ja">
        {details.reading}
      </span>
    );
  }

  // kanjiMode === 'ruby' / Furigana
  if (details.hasKanji && details.kanji && details.reading && details.kanji !== details.reading) {
    return (
      <span className="opt-jp-wrapper jp-text" lang="ja">
        <b className="opt-kanji">{details.kanji}</b>
        <span className="opt-kana-sub">（{details.reading}）</span>
      </span>
    );
  }

  return (
    <span className="jp-text" lang="ja">
      {details.reading || details.kanji}
    </span>
  );
}

function renderFlashcardJp(cardOrText, kanjiMode = 'ruby', customFontSize = null) {
  if (!cardOrText) return null;
  const details = resolveCardKanjiDetails(cardOrText);
  const headlineStyle = customFontSize ? { fontSize: `${customFontSize}px` } : undefined;
  const badgeStyle = customFontSize ? { fontSize: `${Math.max(14, Math.round(customFontSize * 0.46))}px` } : undefined;

  if (kanjiMode === 'kanji-only') {
    return (
      <span className="flashcard-jp-term" lang="ja">
        <span className="flashcard-kanji-headline" style={headlineStyle}>{details.kanji || details.reading}</span>
      </span>
    );
  }

  if (kanjiMode === 'kana-only') {
    return (
      <span className="flashcard-jp-term" lang="ja">
        <span className="flashcard-kana-headline" style={headlineStyle}>{details.reading}</span>
      </span>
    );
  }

  // Furigana mode
  if (details.hasKanji && details.kanji && details.reading && details.kanji !== details.reading) {
    return (
      <div className="flashcard-jp-stack" lang="ja">
        <span className="flashcard-kanji-headline" style={headlineStyle}>{details.kanji}</span>
        <span className="flashcard-kana-badge" style={badgeStyle}>（{details.reading}）</span>
      </div>
    );
  }

  return (
    <span className="flashcard-jp-term" lang="ja">
      <span className="flashcard-kanji-headline" style={headlineStyle}>{details.reading || details.kanji}</span>
    </span>
  );
}

function speakJapanese(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const cleanText = (text || '').replace(/[\(（].*?[\)）]/g, '').trim() || text;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

function App() {
  const [decks, setDecks] = useState([]);
  const [customDeck, setCustomDeck] = useState(null);
  const [selectedDeckId, setSelectedDeckId] = useState('all');
  const [entries, setEntries] = useState([]);
  const [dueCount, setDueCount] = useState(0);
  const [tab, setTab] = useState('import');
  const [mode, setMode] = useState('jp-vi');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [flashcardOptions, setFlashcardOptions] = useState([]);
  const [flashcardStatus, setFlashcardStatus] = useState(null);
  const [flashcardSelectedId, setFlashcardSelectedId] = useState(null);
  const [flashcardMessage, setFlashcardMessage] = useState('');
  const [cardSaving, setCardSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Custom vocab state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [newJp, setNewJp] = useState('');
  const [newVi, setNewVi] = useState('');
  const [keepAdding, setKeepAdding] = useState(false);
  const [modalError, setModalError] = useState('');
  const [showCustomList, setShowCustomList] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [importValidation, setImportValidation] = useState(null);

  // Dictionary state
  const [dictionaryCards, setDictionaryCards] = useState([]);
  const [dictSearchQuery, setDictSearchQuery] = useState('');
  const [dictDeckFilter, setDictDeckFilter] = useState('all');
  const [dictStatusFilter, setDictStatusFilter] = useState('all');
  const [dictRowSelect, setDictRowSelect] = useState('all');
  const [dictSortOrder, setDictSortOrder] = useState('gojuon-asc');
  const [dictViewMode, setDictViewMode] = useState('cards');
  const [dictShowRomaji, setDictShowRomaji] = useState(true);

  // Kanji modal state
  const [kanjiModalCard, setKanjiModalCard] = useState(null);
  const [kanjiInput, setKanjiInput] = useState('');
  const [kanaInput, setKanaInput] = useState('');
  const [kanjiFormat, setKanjiFormat] = useState('ruby');
  const [kanjiSaving, setKanjiSaving] = useState(false);
  const [kanjiModalError, setKanjiModalError] = useState('');

  // Batch auto-map modal state
  const [batchKanjiModalOpen, setBatchKanjiModalOpen] = useState(false);
  const [batchKanjiScope, setBatchKanjiScope] = useState('all'); // 'all' (entire DB) | 'filtered'
  const [batchKanjiPreview, setBatchKanjiPreview] = useState([]);
  const [batchKanjiSelected, setBatchKanjiSelected] = useState(new Set());
  const [batchKanjiSaving, setBatchKanjiSaving] = useState(false);

  // Test kanji mode: 'ruby' | 'kanji-only' | 'kana-only'
  const [testKanjiMode, setTestKanjiMode] = useState(() => {
    try {
      return localStorage.getItem('marugoto_test_kanji_mode') || 'ruby';
    } catch {
      return 'ruby';
    }
  });

  function handleSetTestKanjiMode(newMode) {
    setTestKanjiMode(newMode);
    try {
      localStorage.setItem('marugoto_test_kanji_mode', newMode);
    } catch {}
  }

  // Flashcard font size state (range: 28px - 68px, default: 46px)
  const [flashcardFontSize, setFlashcardFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem('marugoto_flashcard_font_size');
      const num = parseInt(saved, 10);
      return num >= 28 && num <= 68 ? num : 46;
    } catch {
      return 46;
    }
  });

  function handleAdjustFontSize(delta) {
    setFlashcardFontSize((prev) => {
      const next = Math.max(28, Math.min(68, prev + delta));
      try {
        localStorage.setItem('marugoto_flashcard_font_size', String(next));
      } catch {}
      return next;
    });
  }

  function handleResetFontSize() {
    setFlashcardFontSize(46);
    try {
      localStorage.setItem('marugoto_flashcard_font_size', '46');
    } catch {}
  }

  // Quiz / Test state
  const [quizCount, setQuizCount] = useState(10);
  const [quizSession, setQuizSession] = useState(null);
  const [quizClock, setQuizClock] = useState(Date.now());
  const [quizDone, setQuizDone] = useState(false);
  const [quizMode, setQuizMode] = useState('TEST');
  const [quizStatus, setQuizStatus] = useState(null);
  const [quizSelectedOptionId, setQuizSelectedOptionId] = useState(null);
  const [quizMessage, setQuizMessage] = useState('');
  const [quizSaving, setQuizSaving] = useState(false);

  // Custom in test & timer slider state
  const [includeCustom, setIncludeCustom] = useState(true);
  const [hasTimer, setHasTimer] = useState(true);
  const [disableRepeatTimeout, setDisableRepeatTimeout] = useState(true);
  const [timeLimit, setTimeLimit] = useState(10); // 3 to 30 seconds
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(10);
  const [autoRating, setAutoRating] = useState(null);
  const [quizAvailablePool, setQuizAvailablePool] = useState([]);
  const [quizAvailableDue, setQuizAvailableDue] = useState(0);

  const current = entries[index] || null;
  const currentQuestion = quizSession?.queue[0] || null;
  const hasFiveChoices = new Set(entries.map((entry) => optionKey(entry, mode))).size >= 5;
  const quizScore = quizSession?.correctFirstTry || 0;
  const quizInitialCompleted = quizSession?.initialCompleted || 0;
  const quizInitialCount = quizSession?.initialCount || 0;
  const pendingRepeatSeconds = quizSession ? secondsUntilNextRepeat(quizSession, quizClock) : 0;

  const trimmedDictSearch = dictSearchQuery.trim();
  const sortedDictionaryCards = filterAndSortDictionary(dictionaryCards, {
    searchQuery: dictSearchQuery,
    deckFilter: dictDeckFilter,
    statusFilter: dictStatusFilter,
    rowSelect: dictRowSelect,
    sortOrder: dictSortOrder,
    now: Date.now(),
  });

  const rowCounts = {};
  for (const card of dictionaryCards) {
    if (dictDeckFilter === 'custom' && card.deckId !== 'custom') continue;
    if (dictDeckFilter !== 'all' && dictDeckFilter !== 'custom' && card.deckId !== dictDeckFilter) continue;
    const isDue = new Date(card.dueAt).getTime() <= Date.now();
    if (dictStatusFilter === 'due' && !isDue) continue;
    if (dictStatusFilter === 'reviewed' && (card.reviewCount === 0 || isDue)) continue;
    if (dictStatusFilter === 'new' && card.reviewCount > 0) continue;
    if (trimmedDictSearch) {
      const searchNorm = removeDiacritics(trimmedDictSearch);
      const searchLower = trimmedDictSearch.toLowerCase();
      const jp = (card.jp || '').toLowerCase();
      const vi = (card.vi || '').toLowerCase();
      const viNorm = removeDiacritics(vi);
      const romaji = (card.romaji || '').toLowerCase();
      if (!jp.includes(searchLower) && !vi.includes(searchLower) && !viNorm.includes(searchNorm) && !romaji.includes(searchLower)) {
        continue;
      }
    }
    const row = getKanaRow(card);
    rowCounts[row] = (rowCounts[row] || 0) + 1;
  }

  const isCurrentTimerActive = hasTimer && (!currentQuestion?.repeat || !disableRepeatTimeout);

  async function refreshDecks(scope = selectedDeckId) {
    const [pdfDecks, custom] = await Promise.all([
      api('/api/decks'),
      api('/api/decks/custom').catch(() => null),
    ]);
    setDecks(pdfDecks);
    setCustomDeck(custom);
    const customDue = custom?.dueCount || 0;
    const pdfDue = pdfDecks.reduce((sum, deck) => sum + deck.dueCount, 0);
    setDueCount(scope === 'all'
      ? pdfDue + customDue
      : scope === 'custom'
        ? customDue
        : pdfDecks.find((deck) => deck.id === scope)?.dueCount || 0);
    return { pdfDecks, custom };
  }

  async function loadCards(deckId = selectedDeckId) {
    const query = new URLSearchParams({
      deckId,
      mode: 'all',
      includeCustom: deckId === 'all' || deckId === 'custom',
    });
    const result = await api(`/api/study/cards?${query}`);
    setEntries(result.cards);
    setDueCount(result.dueCount);
    setIndex(0);
    setRevealed(false);
    setFlashcardStatus(null);
    setFlashcardMessage('');
    setFlashcardOptions(result.cards.length >= 5 ? makeOptions(result.cards[0], result.cards, mode) : []);
  }

  async function refreshDictionary() {
    try {
      const result = await api('/api/study/cards?deckId=all&mode=all&includeCustom=true');
      if (result?.cards) {
        setDictionaryCards(result.cards);
      }
    } catch {
      // fallback
    }
  }

  useEffect(() => {
    async function initialize() {
      try {
        const { custom } = await refreshDecks('all');
        await loadCards('all');
        await refreshDictionary();
        if (custom && custom.cardCount > 0) {
          const res = await api('/api/study/cards?deckId=custom&mode=all').catch(() => null);
          if (res?.cards) {
            setCustomCards(res.cards);
            setShowCustomList(true);
          }
        }
      } catch (loadError) {
        setError(`Không kết nối được backend. Hãy khởi động Spring rồi tải lại trang. ${loadError.message}`);
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    if (current && entries.length >= 5) setFlashcardOptions(makeOptions(current, entries, mode));
    else setFlashcardOptions([]);
  }, [current?.id, entries.length, mode]);

  useEffect(() => {
    if (!quizSession || quizDone) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setQuizClock(now);
      setQuizSession((session) => session ? releaseDueRepeats(session, now) : session);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [Boolean(quizSession), quizDone]);

  useEffect(() => {
    if (quizSession && !quizDone && !quizSession.queue.length && !quizSession.waiting.length) {
      setQuizDone(true);
    }
  }, [quizSession, quizDone]);

  // Lifecycle heartbeat & automatic shutdown on tab close
  useEffect(() => {
    let tabId = '';
    try {
      tabId = sessionStorage.getItem('marugoto_tab_id');
      if (!tabId) {
        tabId = 'tab_' + Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('marugoto_tab_id', tabId);
      }
    } catch {
      tabId = 'tab_' + Math.random().toString(36).substring(2, 10);
    }

    const sendHeartbeat = () => {
      fetch(`/api/lifecycle/heartbeat?tabId=${encodeURIComponent(tabId)}`, { method: 'POST' }).catch(() => {});
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 3000);

    const handleTabClose = () => {
      const url = `/api/lifecycle/close?tabId=${encodeURIComponent(tabId)}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, []);

  async function selectDeck(deckId) {
    setBusy(true);
    setError('');
    setSelectedDeckId(deckId);
    setQuizSession(null);
    setQuizDone(false);
    try {
      await loadCards(deckId);
      await refreshDecks(deckId);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function executeImport(parsedFiles, skipDuplicates, autoMapKanji = true) {
    setBusy(true);
    setError('');
    setQuizSession(null);
    setQuizDone(false);
    try {
      const savedDecks = [];
      let totalSkipped = 0;
      for (const item of parsedFiles) {
        const useEntries = (item.autoMapKanji ?? autoMapKanji) ? item.entries : item.rawEntries;
        const dupResult = (item.autoMapKanji ?? autoMapKanji) ? item.dupResult : findDuplicates(useEntries, dictionaryCards);
        const cardsToSave = skipDuplicates ? dupResult.uniqueCards : useEntries;
        if (!cardsToSave.length) {
          totalSkipped += dupResult.duplicates.length;
          continue;
        }
        const form = new FormData();
        form.append('file', item.file);
        form.append('cards', JSON.stringify(cardsToSave));
        form.append('skipDuplicates', skipDuplicates ? 'true' : 'false');
        savedDecks.push(await api('/api/decks', { method: 'POST', body: form }));
        if (skipDuplicates) {
          totalSkipped += dupResult.duplicates.length;
        }
      }

      if (!savedDecks.length) {
        setError('Tất cả các từ vựng trong file PDF đã tồn tại trong thư viện. Không có từ mới nào được thêm.');
        setImportValidation(null);
        return;
      }

      const nextDeck = savedDecks.length === 1 ? savedDecks[0].id : 'all';
      setSelectedDeckId(nextDeck);
      await loadCards(nextDeck);
      await refreshDecks(nextDeck);
      await refreshDictionary();
      setImportValidation(null);
      setTab('flashcards');
    } catch (err) {
      setError(`Không thể lưu bộ từ: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const parsedFiles = [];
      for (const file of files) {
        const rawEntries = parseVocabulary(await extractPdfPages(file));
        if (!rawEntries.length) throw new Error(`Không trích xuất được từ vựng từ ${file.name}.`);
        const autoMapped = autoMapKanjiForCards(rawEntries, { style: 'ruby' });
        const entries = autoMapped.mappedCards;
        const dupResult = findDuplicates(entries, dictionaryCards);
        parsedFiles.push({
          file,
          rawEntries,
          entries,
          dupResult,
          mappedCount: autoMapped.mappedCount,
          previewList: autoMapped.previewList,
          autoMapKanji: true,
        });
      }

      setImportValidation({
        parsedFiles,
        skipDuplicates: true,
        autoMapKanji: true,
        showDetails: true,
      });
    } catch (importError) {
      setError(`Không thể nhập PDF: ${importError.message}`);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function recordReview(entry, rating, source) {
    const result = await api('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: entry.id, rating, source }),
    });
    setEntries((cards) => cards.map((card) => card.id === entry.id
      ? { ...card, dueAt: result.dueAt, reviewCount: result.reviewCount, wrongCount: result.wrongCount }
      : card));
    setDictionaryCards((cards) => cards.map((card) => card.id === entry.id
      ? { ...card, dueAt: result.dueAt, reviewCount: result.reviewCount, wrongCount: result.wrongCount }
      : card));
    await refreshDecks();
    return result;
  }

  function advanceCard() {
    setIndex((value) => (value + 1) % Math.max(entries.length, 1));
    setRevealed(false);
    setFlashcardStatus(null);
    setFlashcardSelectedId(null);
    setFlashcardMessage('');
  }

  async function chooseFlashcardOption(option) {
    if (!current || flashcardStatus || cardSaving) return;
    setFlashcardSelectedId(option.id);
    const correct = option.id === current.id;
    setFlashcardStatus(correct ? 'correct' : 'wrong');
    const answerDisplay = mode === 'jp-vi' ? current.vi : getTestJapaneseDisplay(current, testKanjiMode);
    setFlashcardMessage(correct
      ? 'Chính xác. Bạn thấy câu này dễ đến mức nào?'
      : `Chưa đúng. Đáp án: ${answerDisplay}`);
    if (!correct) {
      setCardSaving(true);
      try {
        await recordReview(current, 'AGAIN', 'RECALL');
      } catch (saveError) {
        setError(`Không lưu được lượt ôn: ${saveError.message}`);
      } finally {
        setCardSaving(false);
      }
    }
  }

  async function rateFlashcard(rating) {
    if (!current || cardSaving) return;
    setCardSaving(true);
    try {
      await recordReview(current, rating, flashcardStatus ? 'RECALL' : 'FLASHCARD');
      advanceCard();
    } catch (saveError) {
      setError(`Không lưu được lượt ôn: ${saveError.message}`);
    } finally {
      setCardSaving(false);
    }
  }

  function openAddModal() {
    setEditingCard(null);
    setNewJp('');
    setNewVi('');
    setModalError('');
    setIsModalOpen(true);
  }

  function openEditModal(card) {
    setEditingCard(card);
    setNewJp(card.jp);
    setNewVi(card.vi);
    setModalError('');
    setIsModalOpen(true);
  }

  async function handleSaveCustomCard(e) {
    e.preventDefault();
    setModalError('');
    if (!newJp.trim() || !newVi.trim()) {
      setModalError('Tiếng Nhật và Nghĩa tiếng Việt không được để trống.');
      return;
    }

    if (!editingCard) {
      const trimmedJp = newJp.trim();
      const kanaKey = canonicalKanaKey(trimmedJp);
      const existingMatch = dictionaryCards.find((c) =>
        c.jp.trim().toLowerCase() === trimmedJp.toLowerCase() ||
        (kanaKey && canonicalKanaKey(c) === kanaKey)
      );
      if (existingMatch) {
        const confirmMsg = `⚠️ Từ vựng này (hoặc cách đọc kana: “${kanaKey || trimmedJp}”) đã tồn tại trong bộ “${existingMatch.deckTitle}” (${existingMatch.jp} - ${existingMatch.vi}).\n\nBạn có chắc chắn vẫn muốn thêm thẻ này không?`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
    }

    setCardSaving(true);
    try {
      if (editingCard) {
        const updated = await api(`/api/decks/cards/${editingCard.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jp: newJp.trim(), romaji: editingCard.romaji || '', vi: newVi.trim() }),
        });
        setCustomCards((prev) => prev.map((c) => (c.id === editingCard.id ? updated : c)));
        setEntries((prev) => prev.map((c) => (c.id === editingCard.id ? { ...c, jp: updated.jp, vi: updated.vi, romaji: updated.romaji } : c)));
        setDictionaryCards((prev) => prev.map((c) => (c.id === editingCard.id ? updated : c)));
        await refreshDecks();
        setIsModalOpen(false);
      } else {
        await api('/api/decks/custom-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jp: newJp.trim(), romaji: '', vi: newVi.trim() }),
        });
        await refreshDecks();
        await loadCards();
        await refreshDictionary();
        if (showCustomList) {
          const res = await api('/api/study/cards?deckId=custom&mode=all');
          setCustomCards(res.cards);
        }
        setNewJp('');
        setNewVi('');
        if (!keepAdding) {
          setIsModalOpen(false);
        }
      }
    } catch (saveErr) {
      setModalError(saveErr.message);
    } finally {
      setCardSaving(false);
    }
  }

  async function toggleShowCustomCards() {
    if (!showCustomList) {
      try {
        const result = await api('/api/study/cards?deckId=custom&mode=all');
        setCustomCards(result.cards);
      } catch (err) {
        setError(`Không tải được danh sách từ custom: ${err.message}`);
      }
    }
    setShowCustomList((v) => !v);
  }

  async function handleDeleteCard(card) {
    if (!window.confirm(`Xóa từ “${card.jp} (${card.vi})”?`)) return;
    try {
      await api(`/api/decks/cards/${card.id}`, { method: 'DELETE' });
      setCustomCards((prev) => prev.filter((c) => c.id !== card.id));
      setEntries((prev) => prev.filter((c) => c.id !== card.id));
      setDictionaryCards((prev) => prev.filter((c) => c.id !== card.id));
      await refreshDecks();
      await loadCards();
    } catch (err) {
      setError(`Không xóa được từ: ${err.message}`);
    }
  }

  function applyCustomKanjiSuggestion(sug) {
    setNewJp(sug.formatted);
    if (!newVi.trim() && sug.vi) setNewVi(sug.vi);
  }

  function handleAutoFindKanjiCustom() {
    const { bestMatch, suggestions } = findKanjiSuggestions({ jp: newJp, vi: newVi });
    if (bestMatch) {
      applyCustomKanjiSuggestion(bestMatch);
    } else if (suggestions.length > 0) {
      applyCustomKanjiSuggestion(suggestions[0]);
    } else {
      alert('Không tìm thấy gợi ý Chữ Hán 1-1 phù hợp cho từ này.');
    }
  }

  function openKanjiModal(card) {
    setKanjiModalCard(card);
    setKanjiModalError('');
    const parsed = parseKanjiReading(card.jp);
    if (parsed.hasKanji) {
      setKanjiInput(parsed.kanji);
      setKanaInput(parsed.reading || extractReading(card));
      setKanjiFormat('ruby');
    } else {
      const { bestMatch } = findKanjiSuggestions(card);
      if (bestMatch) {
        setKanjiInput(bestMatch.kanji);
        setKanaInput(bestMatch.reading);
      } else {
        setKanjiInput('');
        setKanaInput(card.jp || '');
      }
      setKanjiFormat('ruby');
    }
  }

  async function handleSaveKanji() {
    if (!kanjiModalCard) return;
    setKanjiSaving(true);
    setKanjiModalError('');
    try {
      const finalJp = formatKanjiTerm(kanjiInput, kanaInput, kanjiFormat);
      if (!finalJp) {
        setKanjiModalError('Tiếng Nhật không được để trống.');
        setKanjiSaving(false);
        return;
      }
      const updated = await api(`/api/decks/cards/${kanjiModalCard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jp: finalJp,
          romaji: kanjiModalCard.romaji || '',
          vi: kanjiModalCard.vi,
        }),
      });

      setDictionaryCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEntries((prev) => prev.map((c) => (c.id === updated.id ? { ...c, jp: updated.jp, romaji: updated.romaji, vi: updated.vi } : c)));
      setCustomCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      await refreshDecks();
      setKanjiModalCard(null);
    } catch (err) {
      setKanjiModalError(`Không lưu được chữ Hán: ${err.message}`);
    } finally {
      setKanjiSaving(false);
    }
  }

  function openBatchKanjiModal(scopeChoice = 'all') {
    const targetPool = scopeChoice === 'all' ? dictionaryCards : sortedDictionaryCards;
    const unmapped = targetPool.filter((c) => !hasKanji(c.jp));
    if (!unmapped.length) {
      if (scopeChoice === 'filtered' && dictionaryCards.some((c) => !hasKanji(c.jp))) {
        return openBatchKanjiModal('all');
      }
      alert('Tất cả các từ trong phạm vi này đã có Chữ Hán!');
      return;
    }
    const result = autoMapKanjiForCards(unmapped, { style: 'ruby' });
    if (!result.mappedCount) {
      if (scopeChoice === 'filtered' && autoMapKanjiForCards(dictionaryCards.filter((c) => !hasKanji(c.jp)), { style: 'ruby' }).mappedCount > 0) {
        return openBatchKanjiModal('all');
      }
      alert('Không tìm thấy gợi ý Chữ Hán 1-1 từ giáo trình cho các từ chưa có Chữ Hán.');
      return;
    }
    setBatchKanjiScope(scopeChoice);
    setBatchKanjiPreview(result.previewList);
    setBatchKanjiSelected(new Set(result.previewList.map((p) => p.id)));
    setBatchKanjiModalOpen(true);
  }

  function switchBatchScope(newScope) {
    setBatchKanjiScope(newScope);
    const targetPool = newScope === 'all' ? dictionaryCards : sortedDictionaryCards;
    const unmapped = targetPool.filter((c) => !hasKanji(c.jp));
    const result = autoMapKanjiForCards(unmapped, { style: 'ruby' });
    setBatchKanjiPreview(result.previewList);
    setBatchKanjiSelected(new Set(result.previewList.map((p) => p.id)));
  }

  async function handleApplyBatchKanji() {
    if (!batchKanjiSelected.size) return;
    setBatchKanjiSaving(true);
    try {
      const itemsToUpdate = batchKanjiPreview
        .filter((p) => batchKanjiSelected.has(p.id))
        .map((p) => ({
          id: p.id,
          jp: p.mappedJp,
          romaji: p.romaji,
          vi: p.vi,
        }));

      const updatedCards = await api('/api/decks/cards/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemsToUpdate),
      });

      const updatedMap = new Map(updatedCards.map((c) => [c.id, c]));
      setDictionaryCards((prev) => prev.map((c) => updatedMap.get(c.id) || c));
      setEntries((prev) => prev.map((c) => {
        const u = updatedMap.get(c.id);
        return u ? { ...c, jp: u.jp, romaji: u.romaji, vi: u.vi } : c;
      }));
      setCustomCards((prev) => prev.map((c) => updatedMap.get(c.id) || c));
      await refreshDecks();
      setBatchKanjiModalOpen(false);
    } catch (err) {
      alert(`Lỗi khi cập nhật Chữ Hán: ${err.message}`);
    } finally {
      setBatchKanjiSaving(false);
    }
  }

  async function handleRejectKanji(card) {
    if (!card) return;
    const reading = parseKanjiReading(card.jp).reading || extractReading(card) || card.jp;
    if (!window.confirm(`Gỡ bỏ Chữ Hán khỏi từ “${card.jp}” và lưu lại thành thuần Kana “${reading}” trong cơ sở dữ liệu?`)) return;

    try {
      const updated = await api(`/api/decks/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jp: reading,
          romaji: card.romaji || '',
          vi: card.vi,
        }),
      });

      setDictionaryCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEntries((prev) => prev.map((c) => (c.id === updated.id ? { ...c, jp: updated.jp, romaji: updated.romaji, vi: updated.vi } : c)));
      setCustomCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (currentQuestion && currentQuestion.entry.id === card.id) {
        currentQuestion.entry.jp = updated.jp;
      }
      await refreshDecks();
      setQuizMessage(`✓ Đã gỡ Chữ Hán (Flush). Thẻ này đã chuyển về thuần Kana: “${reading}”`);
    } catch (err) {
      alert(`Lỗi khi gỡ Chữ Hán: ${err.message}`);
    }
  }

  async function handleSaveSuggestedKanji(card, kanji, reading) {
    if (!card || !kanji) return;
    const finalJp = formatKanjiTerm(kanji, reading, 'ruby');
    try {
      const updated = await api(`/api/decks/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jp: finalJp,
          romaji: card.romaji || '',
          vi: card.vi,
        }),
      });

      setDictionaryCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEntries((prev) => prev.map((c) => (c.id === updated.id ? { ...c, jp: updated.jp, romaji: updated.romaji, vi: updated.vi } : c)));
      setCustomCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (currentQuestion && currentQuestion.entry.id === card.id) {
        currentQuestion.entry.jp = updated.jp;
      }
      await refreshDecks();
      setQuizMessage(`✓ Đã lưu Chữ Hán “${finalJp}” vào cơ sở dữ liệu!`);
    } catch (err) {
      alert(`Lỗi khi lưu Chữ Hán: ${err.message}`);
    }
  }

  async function handleApplyHomophoneKanji(card, kanji, reading) {
    return handleSaveSuggestedKanji(card, kanji, reading);
  }


  async function updateQuizSetupPool(scope = selectedDeckId, incCustom = includeCustom) {
    try {
      const inc = scope === 'custom' ? true : incCustom;
      const query = new URLSearchParams({ deckId: scope, mode: 'all', includeCustom: inc });
      const result = await api(`/api/study/cards?${query}`);
      setQuizAvailablePool(result.cards);
      setQuizAvailableDue(result.dueCount);
    } catch {
      setQuizAvailablePool(entries);
      setQuizAvailableDue(dueCount);
    }
  }

  useEffect(() => {
    if (tab === 'quiz' || tab === 'review') {
      updateQuizSetupPool(selectedDeckId, includeCustom);
    }
  }, [tab, selectedDeckId, includeCustom]);

  // Question timer effect
  useEffect(() => {
    if (currentQuestion && !quizDone && !quizStatus) {
      const now = Date.now();
      setQuestionStartTime(now);
      setQuestionTimeLeft(timeLimit);
      setAutoRating(null);
    }
  }, [currentQuestion?.entry?.id, currentQuestion?.repeat, quizDone]);

  useEffect(() => {
    if (!currentQuestion || quizDone || quizStatus || !isCurrentTimerActive || !questionStartTime) return undefined;
    const interval = window.setInterval(() => {
      const elapsedSec = (Date.now() - questionStartTime) / 1000;
      const remaining = Math.max(0, timeLimit - elapsedSec);
      setQuestionTimeLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
        handleQuizTimeout();
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [currentQuestion?.entry?.id, currentQuestion?.repeat, quizDone, Boolean(quizStatus), isCurrentTimerActive, questionStartTime, timeLimit]);

  // Space/Enter to advance when answered & 1..5 keys to choose options
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;

      if ((event.key === 'Enter' || event.key === ' ') && quizStatus && !quizSaving) {
        event.preventDefault();
        advanceQuizQuestion();
        return;
      }

      if (!quizStatus && currentQuestion?.options?.length && !quizSaving) {
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= currentQuestion.options.length) {
          event.preventDefault();
          answerQuiz(currentQuestion.options[num - 1]);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quizStatus, quizSaving, currentQuestion]);

  function openQuizSetup(kind = 'TEST') {
    if (quizSession && !quizDone) {
      setTab(quizMode === 'DUE' ? 'review' : 'quiz');
      return;
    }
    updateQuizSetupPool(selectedDeckId, includeCustom);
    const available = kind === 'DUE' ? quizAvailableDue : quizAvailablePool.length;
    const requested = Math.floor(Number(quizCount)) || 10;
    setQuizCount(String(Math.max(1, Math.min(requested, Math.max(available, 1)))));
    setQuizSession(null);
    setQuizDone(false);
    setQuizMode(kind);
    setQuizStatus(null);
    setQuizMessage('');
    setTab(kind === 'DUE' ? 'review' : 'quiz');
  }

  async function startQuiz(kind = 'TEST') {
    setBusy(true);
    setError('');
    try {
      const incCustom = selectedDeckId === 'custom' ? true : includeCustom;
      const query = new URLSearchParams({ deckId: selectedDeckId, mode: 'due', includeCustom: incCustom });
      const dueCards = (await api(`/api/study/cards?${query}`)).cards;
      if (kind === 'DUE' && !dueCards.length) {
        setError('Hiện không có thẻ nào đến hạn ôn.');
        return;
      }
      const allQuery = new URLSearchParams({ deckId: selectedDeckId, mode: 'all', includeCustom: incCustom });
      const allCards = (await api(`/api/study/cards?${allQuery}`)).cards;
      if (new Set(allCards.map((card) => optionKey(card, mode))).size < 5) {
        setError('Cần ít nhất 5 đáp án khác nhau để tạo đủ lựa chọn trắc nghiệm.');
        return;
      }
      const maxCount = kind === 'DUE' ? dueCards.length : allCards.length;
      const requestedCount = Math.max(1, Math.min(maxCount, Math.floor(Number(quizCount)) || 10));
      const selected = selectInitialCards(allCards, dueCards, requestedCount, kind);
      if (!selected.length) {
        setError('Không có thẻ phù hợp để bắt đầu phiên học.');
        return;
      }
      setQuizSession(createQuizSession(selected.map((entry) => ({
        ...entry,
        quizOptions: makeOptions(entry, allCards, mode),
      }))));
      setQuizClock(Date.now());
      setQuizDone(false);
      setQuizMode(kind);
      setQuizStatus(null);
      setQuizSelectedOptionId(null);
      setQuizMessage('');
      setQuestionStartTime(Date.now());
      setQuestionTimeLeft(timeLimit);
      setAutoRating(null);
    } catch (loadError) {
      setError(`Không tải được câu hỏi: ${loadError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuizTimeout() {
    if (quizDone || quizStatus || quizSaving || !currentQuestion || !isCurrentTimerActive) return;
    setQuizSelectedOptionId(null);
    if (!currentQuestion.repeat) {
      setQuizSession((session) => session
        ? recordFirstAttempt(session, currentQuestion.entry.id, false)
        : session);
    }
    setQuizStatus('wrong');
    const answerDisplay = mode === 'jp-vi' ? currentQuestion.entry.vi : getTestJapaneseDisplay(currentQuestion.entry, testKanjiMode);
    setQuizMessage(`Hết thời gian (${timeLimit}s)! Bạn cần ôn lại từ này. Đáp án: ${answerDisplay}`);
    setQuizSaving(true);
    try {
      const result = await recordReview(currentQuestion.entry, 'AGAIN', 'TEST');
      setQuizSession((session) => session
        ? scheduleAgain(session, currentQuestion.entry, result.dueAt)
        : session);
    } catch (saveError) {
      setError(`Không lưu được lượt ôn: ${saveError.message}`);
    } finally {
      setQuizSaving(false);
    }
  }

  async function answerQuiz(option) {
    if (quizDone || quizStatus || quizSaving || !currentQuestion) return;
    setQuizSelectedOptionId(option.id);
    const correct = option.id === currentQuestion.entry.id;
    if (!currentQuestion.repeat) {
      setQuizSession((session) => session
        ? recordFirstAttempt(session, currentQuestion.entry.id, correct)
        : session);
    }
    setQuizStatus(correct ? 'correct' : 'wrong');
    if (!correct) {
      const answerDisplay = mode === 'jp-vi' ? currentQuestion.entry.vi : getTestJapaneseDisplay(currentQuestion.entry, testKanjiMode);
      setQuizMessage(`Chưa đúng. Đáp án: ${answerDisplay}`);
      setQuizSaving(true);
      try {
        const result = await recordReview(currentQuestion.entry, 'AGAIN', 'TEST');
        setQuizSession((session) => session
          ? scheduleAgain(session, currentQuestion.entry, result.dueAt)
          : session);
      } catch (saveError) {
        setError(`Không lưu được lượt ôn: ${saveError.message}`);
        setQuizStatus(null);
        setQuizSelectedOptionId(null);
        setQuizMessage('');
      } finally {
        setQuizSaving(false);
      }
    } else {
      const elapsed = questionStartTime ? Math.max(0.1, (Date.now() - questionStartTime) / 1000) : 1;
      let calculatedRating = 'GOOD';
      if (isCurrentTimerActive) {
        const ratio = elapsed / timeLimit;
        if (ratio <= 0.30 && elapsed <= 3.5) {
          calculatedRating = 'EASY';
        } else if (ratio <= 0.75) {
          calculatedRating = 'GOOD';
        } else {
          calculatedRating = 'HARD';
        }
      }
      setAutoRating(calculatedRating);
      const ratingLabel = calculatedRating === 'EASY' ? '🟢 Easy (Dễ)' : calculatedRating === 'GOOD' ? '🟡 Good (Vừa)' : '🟠 Hard (Khó)';
      setQuizMessage(isCurrentTimerActive
        ? `Chính xác! (${elapsed.toFixed(1)}s · Đã lưu mức: ${ratingLabel})`
        : `Chính xác! (Đã lưu mức: ${ratingLabel})`);
      setQuizSaving(true);
      try {
        const source = quizMode === 'DUE' ? 'TEST' : quizMode;
        await recordReview(currentQuestion.entry, calculatedRating, source);
      } catch (saveError) {
        setError(`Không lưu được lượt ôn: ${saveError.message}`);
      } finally {
        setQuizSaving(false);
      }
    }
  }

  async function rateQuiz(rating) {
    if (quizSaving || !currentQuestion) return;
    setQuizSaving(true);
    try {
      const source = quizMode === 'DUE' ? 'TEST' : quizMode;
      await recordReview(currentQuestion.entry, rating, source);
      advanceQuizQuestion();
    } catch (saveError) {
      setError(`Không lưu được lượt ôn: ${saveError.message}`);
    } finally {
      setQuizSaving(false);
    }
  }

  function advanceQuizQuestion() {
    setQuizSession((session) => session ? removeCurrentQuestion(session) : session);
    setQuizStatus(null);
    setQuizSelectedOptionId(null);
    setQuizMessage('');
    setAutoRating(null);
  }

  function endQuizSession() {
    if (quizStatus === 'wrong') {
      setQuizSession((session) => session ? removeCurrentQuestion(session) : session);
    }
    setQuizDone(true);
    setQuizStatus(null);
    setQuizSelectedOptionId(null);
    setQuizMessage('');
  }

  function handleConfirmEndSession() {
    if (window.confirm('Bạn có chắc muốn kết thúc sớm phiên kiểm tra này? Kết quả các câu đã làm vẫn sẽ được lưu.')) {
      endQuizSession();
    }
  }

  async function deleteDeck(deck) {
    if (!window.confirm(`Xóa bộ “${deck.title}”, PDF và toàn bộ tiến độ ôn?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/decks/${deck.id}`, { method: 'DELETE' });
      const scope = selectedDeckId === deck.id ? 'all' : selectedDeckId;
      setSelectedDeckId(scope);
      setQuizSession(null);
      setQuizDone(false);
      await loadCards(scope);
      await refreshDecks(scope);
      await refreshDictionary();
    } catch (deleteError) {
      setError(`Không xóa được bộ: ${deleteError.message}`);
    } finally {
      setBusy(false);
    }
  }

  function promptText(entry, kMode = testKanjiMode) {
    return mode === 'jp-vi' ? renderTestJp(entry, kMode) : entry.vi;
  }

  function optionText(entry, kMode = testKanjiMode) {
    return mode === 'jp-vi' ? entry.vi : renderTestJp(entry, kMode);
  }

  function renderRatings(onRate, disabled = false, includeAgain = true) {
    return (
      <div className="rating-options-toolbar" aria-label="Đánh giá mức độ ghi nhớ">
        {includeAgain && (
          <button
            type="button"
            disabled={disabled}
            className={`rating-pill-btn again ${autoRating === 'AGAIN' ? 'highlight-rating' : ''}`}
            onClick={() => onRate('AGAIN')}
            title="Quên hoàn toàn, cần học lại"
          >
            <span className="rating-emoji">🔄</span>
            <span className="rating-name">Again</span>
            {autoRating === 'AGAIN' && <span className="auto-pill-badge">Tự động</span>}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          className={`rating-pill-btn hard ${autoRating === 'HARD' ? 'highlight-rating' : ''}`}
          onClick={() => onRate('HARD')}
          title="Nhớ khó khăn, mất nhiều thời gian"
        >
          <span className="rating-emoji">🐢</span>
          <span className="rating-name">Hard</span>
          {autoRating === 'HARD' && <span className="auto-pill-badge">Tự động</span>}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`rating-pill-btn good ${autoRating === 'GOOD' ? 'highlight-rating' : ''}`}
          onClick={() => onRate('GOOD')}
          title="Nhớ bình thường, phản xạ vừa phải"
        >
          <span className="rating-emoji">⏱️</span>
          <span className="rating-name">Good</span>
          {autoRating === 'GOOD' && <span className="auto-pill-badge">Tự động</span>}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`rating-pill-btn easy ${autoRating === 'EASY' ? 'highlight-rating' : ''}`}
          onClick={() => onRate('EASY')}
          title="Nhớ rất nhanh, phản xạ tức thì"
        >
          <span className="rating-emoji">⚡</span>
          <span className="rating-name">Easy</span>
          {autoRating === 'EASY' && <span className="auto-pill-badge">Tự động</span>}
        </button>
      </div>
    );
  }

  function renderDictCard(card) {
    const isDue = new Date(card.dueAt).getTime() <= Date.now();
    const rowLabel = getKanaRow(card);
    return (
      <div key={card.id} className="dict-card">
        <div className="dict-card-top">
          <span className={`deck-tag ${card.deckId === 'custom' ? 'custom' : ''}`}>
            {card.deckId === 'custom' ? '★ Tùy chỉnh' : (card.deckTitle || 'PDF')}
          </span>
          <div className="dict-card-badges">
            <span className="kana-row-badge">{rowLabel}</span>
            {hasKanji(card.jp) && (
              <span className="kanji-tag-badge" title="Từ vựng có Chữ Hán">🈸 Hán tự</span>
            )}
            {isDue ? (
              <span className="dict-badge due">⌛ Đến hạn</span>
            ) : card.reviewCount > 0 ? (
              <span className="dict-badge reviewed">✅ Đã ôn</span>
            ) : (
              <span className="dict-badge new">🌱 Mới</span>
            )}
          </div>
        </div>

        <div className="dict-card-body">
          <div className="dict-jp-row">
            <h3 className="dict-jp-term">{renderJpDisplay(card.jp, dictSearchQuery)}</h3>
            <button
              type="button"
              className="dict-audio-btn"
              onClick={() => speakJapanese(card.jp)}
              title="Phát âm tiếng Nhật"
              aria-label="Phát âm tiếng Nhật"
            >
              🔊
            </button>
          </div>

          {dictShowRomaji && card.romaji && (
            <div className="dict-romaji-text">
              {highlightMatch(card.romaji, dictSearchQuery)}
            </div>
          )}

          <div className="dict-vi-text">
            {highlightMatch(card.vi, dictSearchQuery)}
          </div>
        </div>

        <div className="dict-card-footer">
          <div className="dict-fsrs-meta">
            <span title="Số lần đã ôn tập">🔄 {card.reviewCount || 0} lượt</span>
            {card.wrongCount > 0 && (
              <span className="dict-meta-wrong" title="Số lần trả lời sai">⚠️ {card.wrongCount} sai</span>
            )}
          </div>
          <div className="dict-card-actions">
            <button
              type="button"
              className={`dict-action-btn kanji ${hasKanji(card.jp) ? 'has-kanji' : ''}`}
              onClick={() => openKanjiModal(card)}
              title={hasKanji(card.jp) ? 'Chỉnh sửa Chữ Hán' : 'Thêm Chữ Hán 1-1'}
            >
              {hasKanji(card.jp) ? '🈸 Sửa Hán tự' : '🈸 + Hán tự'}
            </button>
            <button
              type="button"
              className="dict-action-btn edit"
              onClick={() => openEditModal(card)}
              title="Chỉnh sửa từ vựng"
            >
              ✏️ Sửa
            </button>
            <button
              type="button"
              className="dict-action-btn delete"
              onClick={() => handleDeleteCard(card)}
              title="Xóa từ vựng"
            >
              🗑️ Xóa
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Marugoto Vocab Trainer</h1>
          <p>Import PDF → flashcard → recall → test. PDF và tiến độ được lưu trên máy này.</p>
        </div>
        {entries.length > 0 && <div className="stats"><b>{entries.length}</b> thẻ · <b>{dueCount}</b> đến hạn</div>}
      </header>

      <div className="deck-toolbar">
        <label htmlFor="deck-select">Bộ học</label>
        <select id="deck-select" value={selectedDeckId} disabled={busy || loading || Boolean(quizSession && !quizDone)} onChange={(event) => selectDeck(event.target.value)}>
          <option value="all">Tất cả bộ</option>
          {customDeck && <option value="custom">★ Từ vựng tùy chỉnh · {customDeck.cardCount} từ</option>}
          {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title} · {deck.cardCount} từ</option>)}
        </select>
        <div className="direction-picker">
          <label htmlFor="direction-select">Chiều học</label>
          <select id="direction-select" value={mode} disabled={Boolean(quizSession && !quizDone)} onChange={(event) => setMode(event.target.value)}>
            <option value="jp-vi">Nhật → Việt</option>
            <option value="vi-jp">Việt → Nhật</option>
          </select>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('dictionary')}>
          📖 Từ điển ({dictionaryCards.length})
        </button>
        <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
          Import
        </button>
        <button disabled={!entries.length || loading} className={tab === 'flashcards' ? 'active' : ''} onClick={() => setTab('flashcards')}>
          Flashcards
        </button>
        <button disabled={!hasFiveChoices || loading || busy || Boolean(quizSession && !quizDone && quizMode !== 'TEST')} className={tab === 'quiz' ? 'active' : ''} onClick={() => openQuizSetup('TEST')}>
          Test
        </button>
        <button disabled={!dueCount || !hasFiveChoices || loading || busy || Boolean(quizSession && !quizDone && quizMode !== 'DUE')} className={tab === 'review' ? 'active' : ''} onClick={() => openQuizSetup('DUE')}>
          Ôn đến hạn ({dueCount})
        </button>
      </nav>

      {error && <div className="feedback bad" role="alert">{error}</div>}
      {loading && <section className="panel"><p>Đang tải bộ từ và tiến độ…</p></section>}

      {!loading && tab === 'dictionary' && (
        <section className="panel dict-page">
          <div className="dict-header-row">
            <div>
              <h2>📖 Từ điển tiếng Nhật (Lexicon)</h2>
              <p className="dict-subtext">
                Toàn bộ từ vựng được sắp xếp theo bảng chữ cái tiếng Nhật (五十音順 Gojūon). Tra cứu tức thì bằng chữ Nhật, Romaji hoặc tiếng Việt.
              </p>
            </div>
            <div className="dict-stats-summary">
              <span className="dict-stat-pill"><b>{dictionaryCards.length}</b> từ vựng</span>
              <span className="dict-stat-pill due"><b>{dictionaryCards.filter((c) => new Date(c.dueAt).getTime() <= Date.now()).length}</b> đến hạn</span>
              {customDeck?.cardCount > 0 && (
                <span className="dict-stat-pill custom"><b>{customDeck.cardCount}</b> từ tùy chỉnh</span>
              )}
              <button
                type="button"
                className="batch-kanji-btn"
                onClick={openBatchKanjiModal}
                title="Tự động quét và gán Chữ Hán 1-1 cho các từ trong từ điển"
              >
                ✨ Tự động gán Chữ Hán (1-1)
              </button>
            </div>
          </div>

          <div className="dict-search-container">
            <div className="dict-search-wrapper">
              <span className="dict-search-icon">🔍</span>
              <input
                type="text"
                className="dict-search-input"
                placeholder="Tra cứu từ vựng bằng tiếng Nhật (Kanji/Kana), tiếng Việt (có/không dấu) hoặc Romaji…"
                value={dictSearchQuery}
                onChange={(e) => setDictSearchQuery(e.target.value)}
              />
              {dictSearchQuery && (
                <button
                  type="button"
                  className="dict-search-clear"
                  onClick={() => setDictSearchQuery('')}
                  title="Xóa tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>
            <div className="dict-search-info">
              {trimmedDictSearch ? (
                <span>Tìm thấy <b>{sortedDictionaryCards.length}</b> / {dictionaryCards.length} từ</span>
              ) : (
                <span>Hiển thị <b>{sortedDictionaryCards.length}</b> từ vựng</span>
              )}
            </div>
          </div>

          <div className="gojuon-bar-container">
            <div className="gojuon-bar-label">Bảng âm 五十音:</div>
            <div className="gojuon-chips-scroll">
              {KANA_ROWS.map((row) => {
                const count = row.id === 'all'
                  ? dictionaryCards.length
                  : (rowCounts[row.label] || 0);
                const isActive = dictRowSelect === (row.id === 'all' ? 'all' : row.label);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`gojuon-chip ${isActive ? 'active' : ''} ${count === 0 && row.id !== 'all' ? 'empty' : ''}`}
                    onClick={() => setDictRowSelect(row.id === 'all' ? 'all' : row.label)}
                    title={row.desc || row.label}
                  >
                    <span className="gojuon-name">{row.label}</span>
                    <span className="gojuon-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dict-toolbar">
            <div className="dict-toolbar-group">
              <label htmlFor="dict-deck-filter">Bộ từ:</label>
              <select
                id="dict-deck-filter"
                value={dictDeckFilter}
                onChange={(e) => setDictDeckFilter(e.target.value)}
              >
                <option value="all">Tất cả bộ ({dictionaryCards.length})</option>
                {customDeck && (
                  <option value="custom">★ Từ tùy chỉnh ({customDeck.cardCount})</option>
                )}
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.title} ({d.cardCount})</option>
                ))}
              </select>
            </div>

            <div className="dict-toolbar-group">
              <label htmlFor="dict-status-filter">Trạng thái:</label>
              <select
                id="dict-status-filter"
                value={dictStatusFilter}
                onChange={(e) => setDictStatusFilter(e.target.value)}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="due">⌛ Cần ôn gấp (Đến hạn)</option>
                <option value="reviewed">✅ Đã học / Đang nhớ</option>
                <option value="new">🌱 Từ mới (Chưa học)</option>
              </select>
            </div>

            <div className="dict-toolbar-group">
              <label htmlFor="dict-sort-select">Sắp xếp:</label>
              <select
                id="dict-sort-select"
                value={dictSortOrder}
                onChange={(e) => setDictSortOrder(e.target.value)}
              >
                <option value="gojuon-asc">五十音順 (A → Wa chuẩn)</option>
                <option value="gojuon-desc">五十音 đảo ngược (Wa → A)</option>
                <option value="wrong-desc">Số lần sai nhiều nhất</option>
                <option value="review-desc">Số lần ôn nhiều nhất</option>
                <option value="recent">Mới thêm gần đây</option>
              </select>
            </div>

            <div className="dict-toolbar-group dict-view-toggle">
              <label>Chế độ:</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={dictViewMode === 'cards' ? 'active' : ''}
                  onClick={() => setDictViewMode('cards')}
                  title="Dạng thẻ từ"
                >
                  🗂️ Thẻ
                </button>
                <button
                  type="button"
                  className={dictViewMode === 'table' ? 'active' : ''}
                  onClick={() => setDictViewMode('table')}
                  title="Dạng bảng chi tiết"
                >
                  📋 Bảng
                </button>
              </div>
            </div>

            <div className="dict-toolbar-group dict-romaji-toggle">
              <label className="toggle-label" htmlFor="dict-romaji-switch">
                <span>Hiện Romaji</span>
                <input
                  id="dict-romaji-switch"
                  type="checkbox"
                  className="toggle-switch small-switch"
                  checked={dictShowRomaji}
                  onChange={(e) => setDictShowRomaji(e.target.checked)}
                />
              </label>
            </div>
          </div>

          {sortedDictionaryCards.length === 0 ? (
            <div className="dict-empty-state">
              <div className="empty-icon">🔍</div>
              <h3>Không tìm thấy từ vựng nào</h3>
              <p>Không có kết quả nào khớp với bộ lọc hoặc từ khóa tìm kiếm “<b>{dictSearchQuery}</b>”.</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setDictSearchQuery('');
                  setDictDeckFilter('all');
                  setDictStatusFilter('all');
                  setDictRowSelect('all');
                }}
              >
                Đặt lại tất cả bộ lọc
              </button>
            </div>
          ) : dictViewMode === 'cards' ? (
            <div className="dict-content-container">
              {dictSortOrder === 'gojuon-asc' && dictRowSelect === 'all' && !trimmedDictSearch ? (
                KANA_ROWS.filter((r) => r.id !== 'all').map((row) => {
                  const rowCards = sortedDictionaryCards.filter((c) => getKanaRow(c) === row.label);
                  if (rowCards.length === 0) return null;
                  return (
                    <div key={row.id} className="dict-row-section">
                      <div className="dict-row-header">
                        <span className="dict-row-title">{row.label}</span>
                        {row.desc && <span className="dict-row-desc">{row.desc}</span>}
                        <span className="dict-row-count">{rowCards.length} từ</span>
                      </div>
                      <div className="dict-cards-grid">
                        {rowCards.map((card) => renderDictCard(card))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="dict-cards-grid">
                  {sortedDictionaryCards.map((card) => renderDictCard(card))}
                </div>
              )}
            </div>
          ) : (
            <div className="dict-table-container">
              <table className="dict-table">
                <thead>
                  <tr>
                    <th style={{ width: '45px' }}>#</th>
                    <th>Tiếng Nhật</th>
                    {dictShowRomaji && <th>Romaji</th>}
                    <th>Nghĩa tiếng Việt</th>
                    <th>Hàng âm</th>
                    <th>Bộ từ</th>
                    <th>Tiến độ FSRS</th>
                    <th style={{ width: '100px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDictionaryCards.map((card, idx) => {
                    const isDue = new Date(card.dueAt).getTime() <= Date.now();
                    return (
                      <tr key={card.id}>
                        <td className="col-idx">{idx + 1}</td>
                        <td className="col-jp">
                          <div className="jp-with-audio">
                            <span className="jp-text">{renderJpDisplay(card.jp, dictSearchQuery)}</span>
                            <button
                              type="button"
                              className="audio-icon-btn"
                              onClick={() => speakJapanese(card.jp)}
                              title="Nghe phát âm"
                            >
                              🔊
                            </button>
                          </div>
                        </td>
                        {dictShowRomaji && (
                          <td className="col-romaji">
                            {card.romaji ? highlightMatch(card.romaji, dictSearchQuery) : <span className="empty-dash">—</span>}
                          </td>
                        )}
                        <td className="col-vi">{highlightMatch(card.vi, dictSearchQuery)}</td>
                        <td>
                          <span className="kana-row-badge">{getKanaRow(card)}</span>
                        </td>
                        <td className="col-deck">
                          <span className={`deck-tag ${card.deckId === 'custom' ? 'custom' : ''}`}>
                            {card.deckId === 'custom' ? '★ Tùy chỉnh' : (card.deckTitle || 'PDF')}
                          </span>
                        </td>
                        <td className="col-srs">
                          <div className="srs-status-box">
                            {isDue ? (
                              <span className="dict-badge due">⌛ Đến hạn</span>
                            ) : card.reviewCount > 0 ? (
                              <span className="dict-badge reviewed">✅ Đã ôn ({card.reviewCount})</span>
                            ) : (
                              <span className="dict-badge new">🌱 Mới</span>
                            )}
                            {card.wrongCount > 0 && (
                              <span className="dict-badge wrong" title={`${card.wrongCount} lần sai`}>
                                {card.wrongCount} sai
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="col-actions">
                          <button
                            type="button"
                            className="table-action-btn kanji"
                            onClick={() => openKanjiModal(card)}
                            title={hasKanji(card.jp) ? 'Chỉnh sửa Chữ Hán' : 'Thêm Chữ Hán 1-1'}
                          >
                            🈸
                          </button>
                          <button
                            type="button"
                            className="edit-btn"
                            onClick={() => openEditModal(card)}
                            title="Sửa từ vựng"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => handleDeleteCard(card)}
                            title="Xóa từ vựng"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!loading && tab === 'import' && (
        <section className="panel">
          <div className="custom-catalog-box">
            <div className="custom-catalog-header">
              <div>
                <h3>★ Bộ từ vựng tùy chỉnh (Custom Vocab)</h3>
                <p className="catalog-desc">Catalog lưu riêng biệt trên máy này, hoàn toàn độc lập khỏi các file PDF.</p>
                <div className="catalog-stats">
                  <b>{customDeck?.cardCount || 0}</b> từ · <b>{customDeck?.dueCount || 0}</b> đến hạn
                </div>
              </div>
              <div className="custom-catalog-actions">
                <button className="primary" onClick={openAddModal}>+ Thêm từ mới</button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setDictDeckFilter('custom');
                    setTab('dictionary');
                  }}
                >
                  📖 Tra cứu trong Từ điển
                </button>
                <button type="button" className="secondary-button" onClick={() => toggleShowCustomCards()}>
                  {showCustomList ? 'Ẩn danh sách' : `Xem nhanh (${customDeck?.cardCount || 0})`}
                </button>
              </div>
            </div>

            {showCustomList && (
              <div className="custom-words-list">
                <div className="custom-list-note">
                  💡 Danh sách rút gọn các từ tùy chỉnh. Để tra cứu nhanh, nghe phát âm và sắp xếp theo bảng chữ cái tiếng Nhật, hãy mở trang <b>📖 Từ điển</b>.
                </div>
                {customCards.length === 0 ? (
                  <p className="empty-hint">Chưa có từ tùy chỉnh nào. Bấm “+ Thêm từ mới” để tạo.</p>
                ) : (
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Tiếng Nhật</th>
                        <th>Nghĩa tiếng Việt</th>
                        <th>Lượt ôn</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customCards.map((card) => (
                        <tr key={card.id}>
                          <td><b>{card.jp}</b></td>
                          <td>{card.vi}</td>
                          <td>{card.reviewCount} ({card.wrongCount} sai)</td>
                          <td className="action-cell">
                            <button className="edit-btn" onClick={() => openEditModal(card)}>Sửa</button>
                            <button className="danger-btn" onClick={() => handleDeleteCard(card)}>Xóa</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="pdf-catalog-section">
            <h2>Thêm bộ từ vựng từ PDF</h2>
            <p>Mỗi PDF tạo một bộ riêng. Chọn “Tất cả bộ” để học chung; tiến độ ôn của từng bộ vẫn được lưu độc lập.</p>
            <label className="upload">
              <input type="file" accept="application/pdf" multiple disabled={busy} onChange={handleFiles} />
              <span>{busy ? 'Đang nhập…' : 'Chọn PDF'}</span>
            </label>
            <div className="hint">PDF được lưu trong thư mục dữ liệu của backend trên máy này. File không được gửi lên dịch vụ bên ngoài.</div>
            <div className="deck-list">
              <h3>Các bộ PDF đã lưu</h3>
              {!decks.length && <p>Chưa có file PDF nào. Hãy nhập PDF để bắt đầu.</p>}
              {decks.map((deck) => (
                <div className="deck-row" key={deck.id}>
                  <div>
                    <b>{deck.title}</b>
                    <small>{deck.cardCount} từ · {deck.dueCount} đến hạn · {deck.originalFilename}</small>
                  </div>
                  <div className="deck-actions">
                    <a href={`/api/decks/${deck.id}/pdf`}>Tải PDF</a>
                    <button disabled={busy} onClick={() => deleteDeck(deck)}>Xóa</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {!loading && tab === 'flashcards' && current && (
        <section className="panel">
          <div className="toolbar flashcard-toolbar">
            <div className="flashcard-toolbar-left">
              <span className="card-counter-badge">{index + 1} / {entries.length}</span>
              <span className="deck-tag-label" title={current.deckTitle}>{current.deckTitle}</span>
            </div>

            <div className="flashcard-toolbar-center">
              <div className="quiz-kanji-segmented-group" title="Chế độ hiển thị chữ Hán">
                <button
                  type="button"
                  className={`kanji-seg-pill ${testKanjiMode === 'ruby' ? 'active' : ''}`}
                  onClick={() => handleSetTestKanjiMode('ruby')}
                  title="Hán tự kèm Furigana"
                >
                  Furigana
                </button>
                <button
                  type="button"
                  className={`kanji-seg-pill ${testKanjiMode === 'kanji-only' ? 'active' : ''}`}
                  onClick={() => handleSetTestKanjiMode('kanji-only')}
                  title="Chỉ Chữ Hán (Only Kanji)"
                >
                  Only Kanji
                </button>
                <button
                  type="button"
                  className={`kanji-seg-pill ${testKanjiMode === 'kana-only' ? 'active' : ''}`}
                  onClick={() => handleSetTestKanjiMode('kana-only')}
                  title="Tắt Chữ Hán (Chỉ Kana)"
                >
                  Chỉ Kana
                </button>
              </div>
            </div>

            <div className="flashcard-toolbar-right">
              <div className="font-size-control-group" title="Điều chỉnh cỡ chữ Flashcard (28px - 68px)">
                <button
                  type="button"
                  className="font-size-btn"
                  disabled={flashcardFontSize <= 28}
                  onClick={() => handleAdjustFontSize(-4)}
                  title="Giảm cỡ chữ (A-)"
                  aria-label="Giảm cỡ chữ"
                >
                  A−
                </button>
                <span
                  className="font-size-display-pill"
                  onClick={handleResetFontSize}
                  title="Cỡ chữ hiện tại. Bấm để khôi phục mặc định (46px)"
                >
                  {flashcardFontSize}px
                </span>
                <button
                  type="button"
                  className="font-size-btn"
                  disabled={flashcardFontSize >= 68}
                  onClick={() => handleAdjustFontSize(4)}
                  title="Tăng cỡ chữ (A+)"
                  aria-label="Tăng cỡ chữ"
                >
                  A+
                </button>
              </div>
            </div>
          </div>

          <div
            className="card flashcard-main-card"
            tabIndex={0}
            role="button"
            onClick={() => {
              if (flashcardStatus || cardSaving) return;
              setRevealed((value) => !value);
              setFlashcardMessage('');
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                if (flashcardStatus || cardSaving) return;
                e.preventDefault();
                setRevealed((value) => !value);
              }
            }}
          >
            <div className="label">{mode === 'jp-vi' ? 'Tiếng Nhật' : 'Nghĩa tiếng Việt'}</div>
            <div
              className="term flashcard-term"
              style={{ fontSize: `${flashcardFontSize}px` }}
            >
              {mode === 'jp-vi' ? renderFlashcardJp(current, testKanjiMode, flashcardFontSize) : current.vi}
            </div>

            {mode === 'jp-vi' && (
              <button
                type="button"
                className="flashcard-speak-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  speakJapanese(current.jp);
                }}
                title="Phát âm từ này (Audio)"
                aria-label="Phát âm tiếng Nhật"
              >
                🔊
              </button>
            )}

            {!revealed ? (
              <div className="tap">Bấm hoặc nhấn Phím cách để lật thẻ</div>
            ) : (
              <div className="answer flashcard-answer">
                <div className="answer-label">{mode === 'jp-vi' ? 'Nghĩa tiếng Việt' : 'Tiếng Nhật'}</div>
                <div
                  className="answer-text"
                  style={{
                    fontSize: mode === 'vi-jp'
                      ? `${flashcardFontSize}px`
                      : `${Math.max(22, Math.round(flashcardFontSize * 0.65))}px`,
                  }}
                >
                  {mode === 'jp-vi' ? current.vi : renderFlashcardJp(current, testKanjiMode, flashcardFontSize)}
                </div>
                {current.romaji && (
                  <small
                    className="answer-romaji"
                    style={{ fontSize: `${Math.max(13, Math.round(flashcardFontSize * 0.34))}px` }}
                  >
                    {current.romaji}
                  </small>
                )}
                {mode === 'vi-jp' && (
                  <button
                    type="button"
                    className="flashcard-speak-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakJapanese(current.jp);
                    }}
                    title="Phát âm từ này (Audio)"
                    aria-label="Phát âm tiếng Nhật"
                  >
                    🔊
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="manual-test">
            <h3>Recall trực tiếp · chọn 1 trong 5</h3>
            {!hasFiveChoices ? <p>Cần ít nhất 5 đáp án khác nhau theo chiều học này để tạo đủ lựa chọn.</p> : !revealed && (
              <div className="options">
                {flashcardOptions.map((option) => {
                  const isCorrect = option.id === current.id;
                  const isSelectedWrong = flashcardStatus === 'wrong' && option.id === flashcardSelectedId;
                  const optClass = flashcardStatus
                    ? isCorrect
                      ? 'correct-option'
                      : isSelectedWrong
                        ? 'wrong-option'
                        : ''
                    : '';
                  return (
                    <button
                      disabled={Boolean(flashcardStatus) || cardSaving}
                      className={optClass}
                      key={option.id}
                      onClick={() => chooseFlashcardOption(option)}
                    >
                      {optionText(option)}
                    </button>
                  );
                })}
              </div>
            )}
            {flashcardMessage && <div className={`feedback ${flashcardStatus === 'correct' ? 'ok' : 'bad'}`}>{flashcardMessage}</div>}
            {flashcardStatus === 'correct' && renderRatings(rateFlashcard, cardSaving, false)}
            {flashcardStatus === 'wrong' && <button className="primary next-button" disabled={cardSaving} onClick={advanceCard}>Tiếp theo</button>}
          </div>

          {revealed && !flashcardStatus && <div className="actions">{renderRatings(rateFlashcard, cardSaving)}</div>}
        </section>
      )}

      {!loading && (tab === 'quiz' || tab === 'review') && hasFiveChoices && (
        <section className={`panel ${quizSession && !quizDone ? 'quiz-active-panel' : ''}`}>
          {!quizSession && !quizDone && (
            <>
              <h2>{tab === 'review' ? 'Ôn tập thẻ đến hạn' : 'Tạo bài kiểm tra (Test)'}</h2>
              <div className="setup-scope-badge">
                Phạm vi: <b>{selectedDeckId === 'all' ? 'Tất cả các bộ' : selectedDeckId === 'custom' ? 'Từ vựng tùy chỉnh' : (decks.find((d) => d.id === selectedDeckId)?.title || selectedDeckId)}</b>
                {' · '}<b>{quizAvailableDue || dueCount}</b> thẻ đến hạn {tab === 'quiz' && `(tổng cộng ${quizAvailablePool.length || entries.length} thẻ)`}
              </div>

              <div className="setup-options-container">
                {selectedDeckId !== 'custom' && (
                  <div className="setup-option-card">
                    <label className="setup-option-label" htmlFor="include-custom-toggle">
                      <div className="option-text-group">
                        <span className="option-title">Bao gồm từ vựng tùy chỉnh (Custom)</span>
                        <span className="option-desc">Gộp cả các từ vựng bạn tự tạo vào bài ôn tập này</span>
                      </div>
                      <input
                        id="include-custom-toggle"
                        type="checkbox"
                        className="toggle-switch"
                        checked={includeCustom}
                        onChange={(e) => setIncludeCustom(e.target.checked)}
                      />
                    </label>
                  </div>
                )}

                <div className="setup-option-card">
                  <div className="option-text-group" style={{ marginBottom: '10px' }}>
                    <span className="option-title">🈸 Chế độ hiển thị Chữ Hán (Kanji)</span>
                    <span className="option-desc">Tùy chọn hiển thị chữ Hán, Furigana hoặc chế độ thử thách Only Kanji trong bài test</span>
                  </div>
                  <div className="kanji-mode-toggle-group">
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'ruby' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('ruby')}
                      title="Hiển thị Chữ Hán kèm cách đọc Furigana phía trên"
                    >
                      <span className="pill-title">🈸 Hán tự + Furigana</span>
                      <span className="pill-sub">Chữ Hán kèm phiên âm</span>
                    </button>
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'kanji-only' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('kanji-only')}
                      title="Chỉ hiển thị Chữ Hán, ẩn hoàn toàn phiên âm để kiểm tra nhớ mặt chữ"
                    >
                      <span className="pill-title">🈸 Chỉ Chữ Hán (Only Kanji)</span>
                      <span className="pill-sub">Ẩn cách đọc (Thử thách)</span>
                    </button>
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'kana-only' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('kana-only')}
                      title="Tắt chữ Hán, chỉ hiển thị cách đọc Kana thuần túy"
                    >
                      <span className="pill-title">🔤 Tắt Chữ Hán (Chỉ Kana)</span>
                      <span className="pill-sub">Thuần Hiragana / Katakana</span>
                    </button>
                  </div>
                </div>

                <div className={`setup-option-card ${hasTimer ? 'active-group' : ''}`}>
                  <label className="setup-option-label" htmlFor="has-timer-toggle">
                    <div className="option-text-group">
                      <span className="option-title">Giới hạn thời gian mỗi từ (Đánh giá FSRS tự động)</span>
                      <span className="option-desc">Tự động chấm mức Dễ / Vừa / Khó dựa trên tốc độ phản xạ của bạn</span>
                    </div>
                    <input
                      id="has-timer-toggle"
                      type="checkbox"
                      className="toggle-switch"
                      checked={hasTimer}
                      onChange={(e) => setHasTimer(e.target.checked)}
                    />
                  </label>

                  {hasTimer && (
                    <div className="timer-config-panel">
                      <div className="slider-header-row">
                        <span className="slider-label">Thời gian làm mỗi câu:</span>
                        <span className="slider-badge">{timeLimit} giây</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="30"
                        step="1"
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(Number(e.target.value))}
                        className="timer-slider"
                      />
                      <div className="slider-ticks">
                        <span>3s (Nhanh)</span>
                        <span>10s (Chuẩn)</span>
                        <span>20s</span>
                        <span>30s (Thong thả)</span>
                      </div>

                      <div className="rating-rules-grid">
                        <div className="rule-pill easy">
                          <span className="rule-badge">⚡ Easy</span>
                          <span className="rule-text">≤ 30% (≤ 3.5s)</span>
                        </div>
                        <div className="rule-pill good">
                          <span className="rule-badge">⏱️ Good</span>
                          <span className="rule-text">30% – 75%</span>
                        </div>
                        <div className="rule-pill hard">
                          <span className="rule-badge">🐢 Hard</span>
                          <span className="rule-text">&gt; 75%</span>
                        </div>
                        <div className="rule-pill again">
                          <span className="rule-badge">⌛ Again</span>
                          <span className="rule-text">Hết giờ</span>
                        </div>
                      </div>

                      <div className="try-again-sub-option">
                        <label className="setup-option-label" htmlFor="disable-repeat-toggle">
                          <div className="option-text-group">
                            <span className="option-sub-title">Tắt timeout khi gặp từ cần Try Again</span>
                            <span className="option-desc">Không đếm ngược khi làm lại từ vừa sai để bạn có thời gian suy nghĩ kỹ hơn</span>
                          </div>
                          <input
                            id="disable-repeat-toggle"
                            type="checkbox"
                            className="toggle-switch small-switch"
                            checked={disableRepeatTimeout}
                            onChange={(e) => setDisableRepeatTimeout(e.target.checked)}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="setup-footer-bar">
                <div className="count-selection-group">
                  <label htmlFor="quiz-count-input" className="count-label">Số câu hỏi:</label>
                  <input
                    id="quiz-count-input"
                    className="count-input"
                    type="number"
                    min="1"
                    max={Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length))}
                    value={quizCount}
                    onChange={(event) => setQuizCount(event.target.value)}
                    onBlur={() => {
                      const maxLimit = Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length));
                      const requested = Math.floor(Number(quizCount)) || 10;
                      setQuizCount(String(Math.max(1, Math.min(requested, maxLimit))));
                    }}
                  />
                  <div className="quick-count-chips">
                    {[5, 10, 20].filter((n) => n < Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length))).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`chip-btn ${Number(quizCount) === n ? 'active' : ''}`}
                        onClick={() => setQuizCount(String(n))}
                      >
                        {n} câu
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`chip-btn ${Number(quizCount) === Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length)) ? 'active' : ''}`}
                      onClick={() => setQuizCount(String(Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length))))}
                    >
                      Tất cả ({Math.max(1, tab === 'review' ? (quizAvailableDue || dueCount) : (quizAvailablePool.length || entries.length))})
                    </button>
                  </div>
                </div>

                <button
                  className="primary start-btn"
                  disabled={busy}
                  onClick={() => startQuiz(tab === 'review' ? 'DUE' : 'TEST')}
                >
                  {busy ? 'Đang chuẩn bị…' : tab === 'review' ? 'Bắt đầu ôn tập →' : 'Bắt đầu kiểm tra →'}
                </button>
              </div>
            </>
          )}

          {currentQuestion && !quizDone && (
            <div className="quiz-session-wrapper">
              <div className="quiz-top-bar">
                <button
                  type="button"
                  className="quiz-exit-action-btn"
                  disabled={quizSaving}
                  onClick={handleConfirmEndSession}
                  title="Dừng phiên làm bài và xem kết quả hiện tại"
                >
                  <span className="exit-icon">✕</span>
                  <span className="exit-label">Kết thúc</span>
                </button>

                <div className="quiz-progress-display">
                  <div className="quiz-badge-wrap">
                    {currentQuestion.repeat ? (
                      <span className="quiz-repeat-badge">🔄 Ôn lại thẻ sai</span>
                    ) : (
                      <span className="quiz-step-badge">
                        Câu <b>{quizInitialCompleted + (Object.hasOwn(quizSession.firstAttempts, currentQuestion.entry.id) ? 0 : 1)}</b> / {quizInitialCount}
                      </span>
                    )}
                    <span className="quiz-deck-badge" title={currentQuestion.entry.deckTitle}>
                      {currentQuestion.entry.deckTitle}
                    </span>
                  </div>
                </div>

                <div className="quiz-kanji-segmented-group" title="Chế độ hiển thị chữ Hán">
                  <button
                    type="button"
                    className={`kanji-seg-pill ${testKanjiMode === 'ruby' ? 'active' : ''}`}
                    onClick={() => handleSetTestKanjiMode('ruby')}
                    title="Hiển thị Chữ Hán kèm Furigana"
                  >
                    Furigana
                  </button>
                  <button
                    type="button"
                    className={`kanji-seg-pill ${testKanjiMode === 'kanji-only' ? 'active' : ''}`}
                    onClick={() => handleSetTestKanjiMode('kanji-only')}
                    title="Chỉ Chữ Hán (Only Kanji) - Ẩn phiên âm"
                  >
                    Only Kanji
                  </button>
                  <button
                    type="button"
                    className={`kanji-seg-pill ${testKanjiMode === 'kana-only' ? 'active' : ''}`}
                    onClick={() => handleSetTestKanjiMode('kana-only')}
                    title="Tắt Chữ Hán (Chỉ Kana)"
                  >
                    Chỉ Kana
                  </button>
                </div>
              </div>

              {hasTimer && !quizStatus && (
                isCurrentTimerActive ? (
                  <div className="quiz-timer-container" aria-label="Thời gian còn lại">
                    <div className="quiz-timer-track">
                      <div
                        className={`quiz-timer-bar ${
                          questionTimeLeft / timeLimit > 0.65 ? 'timer-easy' : questionTimeLeft / timeLimit > 0.25 ? 'timer-good' : 'timer-hard'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, (questionTimeLeft / timeLimit) * 100))}%` }}
                      />
                    </div>
                    <div className="quiz-timer-meta">
                      <span className="quiz-timer-readout">
                        ⏱️ <b>{questionTimeLeft.toFixed(1)}s</b> / {timeLimit}s
                      </span>
                      {currentQuestion.repeat && (
                        <button
                          type="button"
                          className="quiz-timer-pause-btn"
                          onClick={() => setDisableRepeatTimeout(true)}
                          title="Tắt timeout cho câu ôn lại này"
                        >
                          ⏸️ Tắt tính giờ cho câu này
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="quiz-timer-paused-notice">
                    <span>⏳ <b>Chế độ ôn lại:</b> Đã tắt đếm ngược thời gian để bạn suy nghĩ kỹ hơn</span>
                    <button
                      type="button"
                      className="quiz-timer-pause-btn"
                      onClick={() => {
                        setDisableRepeatTimeout(false);
                        setQuestionStartTime(Date.now());
                        setQuestionTimeLeft(timeLimit);
                      }}
                      title="Bật tính giờ cho câu này"
                    >
                      ▶️ Bật lại tính giờ
                    </button>
                  </div>
                )
              )}

              {mode === 'jp-vi' ? (() => {
                const promptDetails = resolveCardKanjiDetails(currentQuestion.entry);
                return (
                  <div className="quiz-card-hero" lang="ja">
                    {/* Large authentic Kanji */}
                    {promptDetails.hasKanji && testKanjiMode !== 'kana-only' && (
                      <div className="quiz-kanji-headline jp-text">
                        {promptDetails.kanji}
                      </div>
                    )}

                    {/* Clearly separated Kana reading */}
                    {(testKanjiMode === 'ruby' || testKanjiMode === 'kana-only' || !promptDetails.hasKanji) && (
                      <div className={`quiz-kana-pill jp-text ${promptDetails.hasKanji && testKanjiMode !== 'kana-only' ? 'with-kanji' : 'only-kana'}`}>
                        {promptDetails.hasKanji && testKanjiMode !== 'kana-only' ? `（${promptDetails.reading}）` : promptDetails.reading}
                      </div>
                    )}

                    {/* Subtle helper actions row */}
                    <div className="quiz-prompt-toolbar" lang="vi">
                      {promptDetails.isFromCard && (
                        <button
                          type="button"
                          className="quiz-tool-btn danger"
                          onClick={() => handleRejectKanji(currentQuestion.entry)}
                          title="Gỡ bỏ chữ Hán này khỏi cơ sở dữ liệu và chuyển về thuần Kana để tránh nhầm lẫn"
                        >
                          ✕ Gỡ Hán tự
                        </button>
                      )}

                      {promptDetails.isSuggested && (
                        <button
                          type="button"
                          className="quiz-tool-btn success"
                          onClick={() => handleSaveSuggestedKanji(currentQuestion.entry, promptDetails.kanji, promptDetails.reading)}
                          title="Lưu chữ Hán gợi ý này vào thẻ từ trong DB"
                        >
                          💾 Lưu Hán tự “{promptDetails.kanji}”
                        </button>
                      )}

                      <button
                        type="button"
                        className="quiz-tool-btn"
                        onClick={() => openKanjiModal(currentQuestion.entry)}
                        title="Chỉnh sửa hoặc đổi chữ Hán khác"
                      >
                        ✏️ {promptDetails.hasKanji ? 'Đổi Hán tự' : '+ Thêm Hán tự'}
                      </button>

                      {promptDetails.homophones?.length > 0 && (
                        <div className="quiz-homophone-strip">
                          <span className="homophone-intro">Đồng âm:</span>
                          {promptDetails.homophones.slice(0, 3).map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              className="homophone-btn"
                              onClick={() => handleApplyHomophoneKanji(currentQuestion.entry, h.kanji, promptDetails.reading)}
                              title={`Đổi sang ${h.kanji} (${h.vi})`}
                            >
                              {h.kanji} <small>({h.vi})</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="quiz-card-hero">
                  <div className="quiz-vietnamese-headline">{currentQuestion.entry.vi}</div>
                </div>
              )}

              <div className="quiz-prompt-heading">
                <span>Chọn đáp án đúng:</span>
                <span className="quiz-keyboard-hint">Nhấn phím <b>1</b> – <b>5</b> để chọn nhanh</span>
              </div>

              <div className="quiz-options-list" role="radiogroup">
                {currentQuestion.options.map((option, idx) => {
                  const optDetails = resolveCardKanjiDetails(option);
                  const isCorrect = option.id === currentQuestion.entry.id;
                  const isSelectedWrong = quizStatus === 'wrong' && option.id === quizSelectedOptionId;
                  let cardStateClass = '';
                  if (quizStatus) {
                    if (isCorrect) cardStateClass = 'is-correct';
                    else if (isSelectedWrong) cardStateClass = 'is-wrong';
                    else cardStateClass = 'is-dimmed';
                  }

                  return (
                    <button
                      type="button"
                      disabled={Boolean(quizStatus) || quizSaving}
                      className={`quiz-choice-card ${cardStateClass}`}
                      key={option.id}
                      onClick={() => answerQuiz(option)}
                    >
                      <span className="choice-number">{idx + 1}</span>
                      <div className="choice-text">
                        {mode === 'jp-vi' ? (
                          <span className="choice-vi">{option.vi}</span>
                        ) : (
                          <span className="choice-jp" lang="ja">
                            {testKanjiMode === 'kanji-only' ? (
                              <b className="opt-kanji jp-text">{optDetails.kanji || optDetails.reading}</b>
                            ) : testKanjiMode === 'kana-only' ? (
                              <span className="opt-kana-sub jp-text">{optDetails.reading}</span>
                            ) : optDetails.hasKanji && optDetails.kanji !== optDetails.reading ? (
                              <>
                                <b className="opt-kanji jp-text">{optDetails.kanji}</b>
                                <span className="opt-kana-sub jp-text">（{optDetails.reading}）</span>
                              </>
                            ) : (
                              <span className="opt-kana-sub jp-text">{optDetails.reading}</span>
                            )}
                          </span>
                        )}
                      </div>
                      {quizStatus && isCorrect && <span className="choice-indicator correct">✓</span>}
                      {quizStatus && isSelectedWrong && <span className="choice-indicator wrong">✕</span>}
                    </button>
                  );
                })}
              </div>

              {quizStatus && (
                <div className={`quiz-feedback-box ${quizStatus === 'correct' ? 'ok' : 'bad'}`}>
                  <div className="feedback-content-row">
                    <div className="feedback-status-badge">
                      {quizStatus === 'correct' ? '✓ Chính xác!' : '✕ Chưa đúng'}
                    </div>
                    <div className="feedback-msg-text">{quizMessage}</div>
                  </div>

                  {quizStatus === 'correct' && (
                    <div className="feedback-rating-panel">
                      <div className="rating-panel-heading">Đã tự động lưu theo thời gian phản xạ. Bạn có thể chọn mức khác bên dưới nếu muốn đổi:</div>
                      {renderRatings(rateQuiz, quizSaving, false)}
                    </div>
                  )}

                  <div className="feedback-actions-row">
                    <button
                      type="button"
                      className="primary quiz-continue-btn"
                      disabled={quizSaving}
                      onClick={advanceQuizQuestion}
                    >
                      Tiếp theo → <kbd className="shortcut-badge">Space / Enter</kbd>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {quizSession && !quizDone && !currentQuestion && quizSession.waiting.length > 0 && (
            <div className="session-wait">
              <div className="wait-icon">⏳</div>
              <h2>Đã xong các thẻ ban đầu</h2>
              <p>{quizSession.waiting.length} thẻ Again đang chờ tới bước ôn tiếp theo.</p>
              <div className="countdown">
                {String(Math.floor(pendingRepeatSeconds / 60)).padStart(2, '0')}:{String(pendingRepeatSeconds % 60).padStart(2, '0')}
              </div>
              <p className="wait-sub">Thẻ sẽ tự quay lại hàng đợi khi bộ đếm về 00:00.</p>
              <div className="wait-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={quizSaving}
                  onClick={handleConfirmEndSession}
                >
                  Kết thúc phiên sớm &amp; xem kết quả
                </button>
              </div>
            </div>
          )}

          {quizDone && (
            <div className="quiz-result-card">
              <div className="result-celebration">🎉</div>
              <h2>{quizMode === 'DUE' ? 'Hoàn thành lượt ôn tập' : 'Kết quả kiểm tra (Test)'}</h2>
              <div className="result-score-container">
                <span className="result-score-main">{quizScore} / {quizInitialCount}</span>
                <span className="result-score-badge">
                  {Math.round((quizScore / Math.max(quizInitialCount, 1)) * 100)}%
                </span>
              </div>
              <p className="result-explanation">
                Điểm số tính theo câu trả lời ở lượt đầu tiên. Tiến độ ôn tập FSRS đã được tự động lưu.
              </p>
              {quizSession?.waiting.length > 0 && (
                <div className="result-alert waiting">
                  ⏳ {quizSession.waiting.length} thẻ cần ôn lại (Again) đã được lưu và sẽ xuất hiện trong các lượt ôn tới hạn.
                </div>
              )}
              {quizSession?.queue.length > 0 && (
                <div className="result-alert pending">
                  📝 {quizSession.queue.length} thẻ chưa làm vẫn giữ nguyên trạng thái cho lượt sau.
                </div>
              )}
              <div className="result-actions-group">
                <button
                  type="button"
                  className="primary result-btn"
                  onClick={() => { setQuizSession(null); setQuizDone(false); setQuizStatus(null); }}
                >
                  🔄 Bắt đầu phiên mới
                </button>
                <button
                  type="button"
                  className="secondary-button result-btn"
                  onClick={() => { setQuizSession(null); setQuizDone(false); setQuizStatus(null); setTab('flashcards'); }}
                >
                  📖 Về Flashcards
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && !hasFiveChoices && entries.length > 0 && tab !== 'import' && (
        <section className="panel"><p>Cần ít nhất 5 đáp án khác nhau theo chiều học này để tạo bài trắc nghiệm.</p></section>
      )}

      {!loading && !entries.length && tab !== 'import' && (
        <section className="panel"><p>Chưa có thẻ trong phạm vi này. Hãy nhập PDF hoặc chọn bộ khác.</p></section>
      )}

      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCard ? 'Chỉnh sửa từ vựng' : 'Thêm từ vựng tùy chỉnh'}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSaveCustomCard}>
              <div className="form-group">
                <label htmlFor="custom-jp">Tiếng Nhật (Kanji / Kana) *</label>
                <div className="input-with-button">
                  <input
                    id="custom-jp"
                    type="text"
                    autoFocus
                    placeholder="Ví dụ: さかな hoặc 魚（さかな）"
                    value={newJp}
                    onChange={(e) => setNewJp(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="inline-suggest-btn"
                    onClick={handleAutoFindKanjiCustom}
                    title="Tìm chữ Hán 1-1 cho từ này"
                  >
                    ✨ Tìm Hán tự
                  </button>
                </div>
              </div>

              {(() => {
                const sugResult = findKanjiSuggestions({ jp: newJp, vi: newVi });
                if (!sugResult || !sugResult.suggestions.length) return null;
                return (
                  <div className="kanji-suggestions-box">
                    <div className="kanji-sug-header">💡 Gợi ý Chữ Hán 1-1:</div>
                    <div className="kanji-sug-chips">
                      {sugResult.suggestions.slice(0, 5).map((sug, idx) => (
                        <button
                          type="button"
                          key={idx}
                          className="kanji-sug-chip"
                          onClick={() => applyCustomKanjiSuggestion(sug)}
                          title={`Gán ${sug.kanji} (${sug.reading}) - ${sug.vi}`}
                        >
                          <span className="chip-kanji">{sug.kanji}</span>
                          <span className="chip-reading">（{sug.reading}）</span>
                          <span className="chip-vi">{sug.vi}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="form-group">
                <label htmlFor="custom-vi">Nghĩa tiếng Việt *</label>
                <input
                  id="custom-vi"
                  type="text"
                  placeholder="Ví dụ: con mèo"
                  value={newVi}
                  onChange={(e) => setNewVi(e.target.value)}
                  required
                />
              </div>
              {!editingCard && (
                <div className="form-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={keepAdding}
                      onChange={(e) => setKeepAdding(e.target.checked)}
                    />
                    <span>Tiếp tục thêm từ khác sau khi lưu</span>
                  </label>
                </div>
              )}
              {modalError && <div className="feedback bad" role="alert">{modalError}</div>}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setIsModalOpen(false)}>Hủy</button>
                <button type="submit" className="primary" disabled={cardSaving}>
                  {cardSaving ? 'Đang lưu…' : (editingCard ? 'Cập nhật' : 'Lưu từ vựng')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importValidation && (
        <div className="modal-backdrop" onClick={() => !busy && setImportValidation(null)}>
          <div className="modal-card import-validation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 Kiểm tra từ vựng trước khi nhập PDF</h3>
              <button disabled={busy} className="close-btn" onClick={() => setImportValidation(null)}>×</button>
            </div>

            <div className="validation-summary-box">
              <div className="validation-file-info">
                File: <b>{importValidation.parsedFiles.map((f) => f.file.name).join(', ')}</b>
              </div>
              <div className="validation-stats-grid">
                <div className="val-stat-pill total">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + f.entries.length, 0)}</span>
                  <span className="stat-label">Tổng từ trong PDF</span>
                </div>
                <div className="val-stat-pill unique">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.uniqueCards.length, 0)}</span>
                  <span className="stat-label">✅ Từ mới hợp lệ</span>
                </div>
                <div className="val-stat-pill duplicate">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.duplicates.length, 0)}</span>
                  <span className="stat-label">⚠️ Trùng với DB</span>
                </div>
                <div className="val-stat-pill kanji">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + (f.mappedCount || 0), 0)}</span>
                  <span className="stat-label">🈸 Gán Chữ Hán 1-1</span>
                </div>
              </div>

              <div style={{ marginTop: '12px', background: '#fdf2f8', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fbcfe8' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={importValidation.autoMapKanji ?? true}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setImportValidation((prev) => {
                        const updatedFiles = prev.parsedFiles.map((f) => {
                          const chosenEntries = checked ? f.entries : f.rawEntries;
                          return {
                            ...f,
                            autoMapKanji: checked,
                            dupResult: findDuplicates(chosenEntries, dictionaryCards),
                          };
                        });
                        return {
                          ...prev,
                          autoMapKanji: checked,
                          parsedFiles: updatedFiles,
                        };
                      });
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#831843' }}>
                    <b>✨ Tự động gán Chữ Hán 1-1</b> cho {importValidation.parsedFiles.reduce((s, f) => s + (f.mappedCount || 0), 0)} từ phù hợp (Ví dụ: さかな → 魚（さかな）)
                  </span>
                </label>
              </div>
            </div>

            <div className="validation-options-panel">
              <div className="option-title-label">Kiểm soát từ vựng trùng lặp:</div>
              <label className={`val-radio-card ${importValidation.skipDuplicates ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="dup-strategy"
                  checked={importValidation.skipDuplicates}
                  onChange={() => setImportValidation((prev) => ({ ...prev, skipDuplicates: true }))}
                />
                <div className="val-radio-text">
                  <div className="val-radio-head">
                    <b>Bỏ qua các từ đã tồn tại (Khuyến nghị)</b>
                    <span className="val-rec-badge">Tránh trùng lặp FSRS</span>
                  </div>
                  <div className="val-radio-desc">
                    Chỉ nạp {importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.uniqueCards.length, 0)} từ mới chưa có trong thư viện. Tiến độ ôn tập của các từ cũ không bị xáo trộn.
                  </div>
                </div>
              </label>

              <label className={`val-radio-card ${!importValidation.skipDuplicates ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="dup-strategy"
                  checked={!importValidation.skipDuplicates}
                  onChange={() => setImportValidation((prev) => ({ ...prev, skipDuplicates: false }))}
                />
                <div className="val-radio-text">
                  <div className="val-radio-head">
                    <b>Vẫn nhập tất cả ({importValidation.parsedFiles.reduce((s, f) => s + f.entries.length, 0)} từ)</b>
                  </div>
                  <div className="val-radio-desc">
                    Tạo thẻ cho toàn bộ từ trong file PDF, chấp nhận việc từ vựng bị lặp lại ở nhiều bộ.
                  </div>
                </div>
              </label>
            </div>

            <div className="duplicates-detail-section">
              <div className="dup-section-header">
                <span>Chi tiết các từ đã tồn tại ({importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.duplicates.length, 0)} từ):</span>
              </div>
              <div className="dup-table-scroll">
                <table className="dup-table">
                  <thead>
                    <tr>
                      <th>Từ trong PDF</th>
                      <th>Từ đã có trong DB</th>
                      <th>Thuộc bộ</th>
                      <th>Lý do phát hiện</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importValidation.parsedFiles.flatMap((f) => f.dupResult.duplicates).map((dup, i) => (
                      <tr key={i}>
                        <td>
                          <b>{dup.candidate.jp}</b>
                          <div className="dup-sub-vi">{dup.candidate.vi}</div>
                        </td>
                        <td>
                          <b>{dup.existing.jp}</b>
                          <div className="dup-sub-vi">{dup.existing.vi}</div>
                        </td>
                        <td>
                          <span className={`deck-tag ${dup.existing.deckId === 'custom' ? 'custom' : ''}`}>
                            {dup.existing.deckTitle || (dup.existing.deckId === 'custom' ? 'Tùy chỉnh' : 'PDF')}
                          </span>
                        </td>
                        <td>
                          <span className="dup-reason-badge">{dup.reason}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setImportValidation(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || (importValidation.skipDuplicates && importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.uniqueCards.length, 0) === 0)}
                onClick={() => executeImport(importValidation.parsedFiles, importValidation.skipDuplicates, importValidation.autoMapKanji ?? true)}
              >
                {busy
                  ? 'Đang nhập…'
                  : `Xác nhận nhập (${importValidation.skipDuplicates
                      ? importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.uniqueCards.length, 0)
                      : importValidation.parsedFiles.reduce((s, f) => s + f.entries.length, 0)} từ) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🈸 Kanji Quick Modal */}
      {kanjiModalCard && (
        <div className="modal-backdrop" onClick={() => !kanjiSaving && setKanjiModalCard(null)}>
          <div className="modal-card kanji-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🈸 Gán / Chỉnh sửa Chữ Hán (Kanji)</h3>
              <button disabled={kanjiSaving} className="close-btn" onClick={() => setKanjiModalCard(null)}>×</button>
            </div>

            <div className="kanji-card-reference">
              <div className="kanji-ref-row">
                <span className="kanji-ref-label">Từ vựng hiện tại:</span>
                <span className="kanji-ref-val">{kanjiModalCard.jp}</span>
              </div>
              <div className="kanji-ref-row">
                <span className="kanji-ref-label">Romaji:</span>
                <span className="kanji-ref-val">{kanjiModalCard.romaji || '—'}</span>
              </div>
              <div className="kanji-ref-row">
                <span className="kanji-ref-label">Nghĩa tiếng Việt:</span>
                <span className="kanji-ref-val">{kanjiModalCard.vi}</span>
              </div>
            </div>

            {/* Quick Suggestions from Marugoto Dictionary */}
            {(() => {
              const { suggestions } = findKanjiSuggestions(kanjiModalCard);
              if (!suggestions || suggestions.length === 0) return null;
              return (
                <div className="kanji-suggestions-box">
                  <div className="kanji-sug-header">
                    <span>💡 Gợi ý Chữ Hán 1-1 theo Marugoto:</span>
                  </div>
                  <div className="kanji-sug-chips">
                    {suggestions.map((sug, i) => (
                      <button
                        type="button"
                        key={i}
                        className="kanji-sug-chip"
                        onClick={() => {
                          setKanjiInput(sug.kanji);
                          setKanaInput(sug.reading);
                          setKanjiFormat('ruby');
                        }}
                        title={`Chọn chữ Hán ${sug.kanji} - ${sug.vi}`}
                      >
                        <span className="chip-kanji">{sug.kanji}</span>
                        <span className="chip-reading">（{sug.reading}）</span>
                        <span className="chip-vi">{sug.vi}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="kanji-form-grid">
              <div className="form-group">
                <label htmlFor="kanji-input">Chữ Hán (Kanji)</label>
                <input
                  id="kanji-input"
                  type="text"
                  placeholder="Ví dụ: 魚"
                  value={kanjiInput}
                  onChange={(e) => setKanjiInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="kana-input">Cách đọc (Kana)</label>
                <input
                  id="kana-input"
                  type="text"
                  placeholder="Ví dụ: さかな"
                  value={kanaInput}
                  onChange={(e) => setKanaInput(e.target.value)}
                />
              </div>
            </div>

            <div className="kanji-format-selector">
              <div className="option-title-label">Kiểu lưu vào thẻ từ:</div>
              <label>
                <input
                  type="radio"
                  name="kanji-style"
                  checked={kanjiFormat === 'ruby'}
                  onChange={() => setKanjiFormat('ruby')}
                />
                <span>
                  <b>Chữ Hán kèm cách đọc</b> (Ví dụ: <code>{formatKanjiTerm(kanjiInput || '魚', kanaInput || 'さかな', 'ruby')}</code>) — <i>Khuyên dùng</i>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="kanji-style"
                  checked={kanjiFormat === 'kanji-only'}
                  onChange={() => setKanjiFormat('kanji-only')}
                />
                <span>
                  <b>Chỉ chữ Hán</b> (Ví dụ: <code>{formatKanjiTerm(kanjiInput || '魚', kanaInput || 'さかな', 'kanji-only')}</code>)
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="kanji-style"
                  checked={kanjiFormat === 'kana-only'}
                  onChange={() => setKanjiFormat('kana-only')}
                />
                <span>
                  <b>Chỉ Kana</b> (Gỡ bỏ chữ Hán: <code>{formatKanjiTerm(kanjiInput || '魚', kanaInput || 'さかな', 'kana-only')}</code>)
                </span>
              </label>
            </div>

            <div className="kanji-live-preview">
              <div className="preview-label">Xem trước hiển thị</div>
              <div className="preview-result">
                {renderJpDisplay(formatKanjiTerm(kanjiInput, kanaInput, kanjiFormat)) || <span className="empty-dash">Chưa nhập</span>}
              </div>
            </div>

            {kanjiModalError && <div className="feedback bad">{kanjiModalError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={kanjiSaving}
                onClick={() => setKanjiModalCard(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="primary"
                disabled={kanjiSaving || (!kanjiInput.trim() && kanjiFormat !== 'kana-only')}
                onClick={handleSaveKanji}
              >
                {kanjiSaving ? 'Đang lưu…' : 'Lưu Chữ Hán'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✨ Batch Auto Map Kanji Modal */}
      {batchKanjiModalOpen && (
        <div className="modal-backdrop" onClick={() => !batchKanjiSaving && setBatchKanjiModalOpen(false)}>
          <div className="modal-card batch-kanji-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✨ Tự động gán Chữ Hán 1-1 cho Từ điển</h3>
              <button disabled={batchKanjiSaving} className="close-btn" onClick={() => setBatchKanjiModalOpen(false)}>×</button>
            </div>

            <div className="batch-scope-box">
              <span className="batch-scope-title">Phạm vi quét và cập nhật:</span>
              <div className="batch-scope-options">
                <label className={`batch-scope-pill ${batchKanjiScope === 'all' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="batch-scope"
                    checked={batchKanjiScope === 'all'}
                    onChange={() => switchBatchScope('all')}
                  />
                  <span>🌐 Toàn bộ thư viện ({dictionaryCards.length} từ trong DB)</span>
                </label>
                <label className={`batch-scope-pill ${batchKanjiScope === 'filtered' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="batch-scope"
                    checked={batchKanjiScope === 'filtered'}
                    onChange={() => switchBatchScope('filtered')}
                  />
                  <span>📁 Bộ từ đang lọc ({sortedDictionaryCards.length} từ)</span>
                </label>
              </div>
            </div>

            <div className="batch-kanji-summary">
              Tìm thấy <b>{batchKanjiPreview.length}</b> từ vựng có thể tự động gán Chữ Hán chuẩn 1-1 theo giáo trình Marugoto. Đã chọn <b>{batchKanjiSelected.size}</b> từ để cập nhật.
              <div className="batch-kanji-note">
                💡 Cập nhật trực tiếp vào cơ sở dữ liệu SQLite — Giữ nguyên 100% lịch sử và tiến độ ôn tập FSRS của từng thẻ!
              </div>
            </div>

            {batchKanjiPreview.length === 0 ? (
              <div className="empty-hint" style={{ padding: '24px', textAlign: 'center' }}>
                Không tìm thấy từ nào cần gán Chữ Hán trong phạm vi này (tất cả các từ đã có Chữ Hán).
              </div>
            ) : (
              <div className="dup-table-scroll" style={{ maxHeight: '320px' }}>
                <table className="batch-kanji-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={batchKanjiSelected.size === batchKanjiPreview.length && batchKanjiPreview.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBatchKanjiSelected(new Set(batchKanjiPreview.map((p) => p.id)));
                            } else {
                              setBatchKanjiSelected(new Set());
                            }
                          }}
                        />
                      </th>
                      <th>Từ gốc</th>
                      <th>Chữ Hán được gán</th>
                      <th>Nghĩa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchKanjiPreview.map((item) => (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={batchKanjiSelected.has(item.id)}
                            onChange={(e) => {
                              const next = new Set(batchKanjiSelected);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setBatchKanjiSelected(next);
                            }}
                          />
                        </td>
                        <td><b>{item.originalJp}</b></td>
                        <td>
                          <b style={{ color: '#be185d' }}>{renderJpDisplay(item.mappedJp)}</b>
                        </td>
                        <td>{item.vi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '18px' }}>
              <button
                type="button"
                className="secondary-button"
                disabled={batchKanjiSaving}
                onClick={() => setBatchKanjiModalOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="primary"
                disabled={batchKanjiSaving || batchKanjiSelected.size === 0}
                onClick={handleApplyBatchKanji}
              >
                {batchKanjiSaving ? 'Đang cập nhật…' : `Áp dụng Chữ Hán (${batchKanjiSelected.size} từ)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>Backend local-only · SQLite + PDF trên máy này · SRS FSRS</footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
