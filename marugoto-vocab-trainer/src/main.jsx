import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
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
  filterAndSortDictionary,
  findDuplicates,
  isCardLeech,
} from './dictionary.js';
import {
  hasKanji,
  parseKanjiReading,
  formatKanjiTerm,
  autoMapKanjiForCards,
  getTestJapaneseDisplay,
  resolveCardKanjiDetails,
} from './kanji.js';
import { extractPdfPages, parseVocabulary, normalizeText as normalize } from './utils/pdfParser.js';
import { api, getBackupExportUrl, importBackupFile } from './api/client.js';
import { RatingToolbar } from './components/RatingToolbar.jsx';
import { romajiToHiragana, checkTypedAnswer } from './utils/japaneseInput.js';
import { VocabularyEditor } from './components/VocabularyEditor.jsx';
import { DictionaryWorkspace } from './components/DictionaryWorkspace.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { DeckLibrary } from './components/DeckLibrary.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { DialogFrame } from './components/DialogFrame.jsx';
import { Icon } from './components/Icon.jsx';
import './styles.css';
import './workspace.css';

function dictionaryPreference(key, fallback, allowed) {
  try {
    const value = JSON.parse(localStorage.getItem(`marugoto_dictionary_${key}`));
    return allowed ? (allowed.includes(value) ? value : fallback) : (typeof value === typeof fallback ? value : fallback);
  } catch { return fallback; }
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

let cachedJaVoice = null;
function getJapaneseVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  // 1. Exact ja-JP or ja_JP
  const jaVoices = voices.filter((v) => v.lang === 'ja-JP' || v.lang === 'ja_JP' || v.lang?.toLowerCase() === 'ja');
  if (jaVoices.length > 0) {
    // Prefer natural/local voice if available (e.g. Microsoft Haruka, Ichiro, Sayaka, Google 日本語)
    const preferred = jaVoices.find((v) => /haruka|ichiro|ayumi|sayaka|keiko|google/i.test(v.name)) || jaVoices[0];
    return preferred;
  }
  // 2. Name contains Japanese or 日本語
  const byName = voices.find((v) => /japanese|日本語/i.test(v.name));
  return byName || null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedJaVoice = getJapaneseVoice();
  };
}

function speakJapanese(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const cleanText = (text || '')
      .replace(/[\(（].*?[\)）]/g, '')
      .replace(/[～~・\s]+/g, ' ')
      .trim() || text;
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    const voice = cachedJaVoice || getJapaneseVoice();
    if (voice) {
      utterance.voice = voice;
    }
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
  const [tab, setTab] = useState('flashcards');
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
  const [editorKey, setEditorKey] = useState(0);
  const editorRequestRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [showFlashcardDisplay, setShowFlashcardDisplay] = useState(false);
  const [smallScreen, setSmallScreen] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = event => setSmallScreen(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [showCustomList, setShowCustomList] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [importValidation, setImportValidation] = useState(null);

  // Backup & Restore state
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // Leech / Difficult cards state
  const [quizLeechOnly, setQuizLeechOnly] = useState(false);
  const [flashcardLeechOnly, setFlashcardLeechOnly] = useState(false);

  // Dictionary state
  const [dictionaryCards, setDictionaryCards] = useState([]);
  const [dictSearchQuery, setDictSearchQuery] = useState(() => dictionaryPreference('search', ''));
  const [dictDeckFilter, setDictDeckFilter] = useState(() => dictionaryPreference('deck', 'all'));
  const [dictStatusFilter, setDictStatusFilter] = useState(() => dictionaryPreference('status', 'all', ['all', 'due', 'reviewed', 'new', 'leech']));
  const [dictRowSelect, setDictRowSelect] = useState(() => dictionaryPreference('row', 'all', ['all', ...KANA_ROWS.map(row => row.label)]));
  const [dictSortOrder, setDictSortOrder] = useState(() => dictionaryPreference('sort', 'gojuon-asc', ['gojuon-asc', 'gojuon-desc', 'wrong-desc', 'review-desc', 'recent']));
  const [dictViewMode, setDictViewMode] = useState(() => dictionaryPreference('view', 'table', ['table', 'cards']));
  const [dictShowRomaji, setDictShowRomaji] = useState(() => dictionaryPreference('romaji', true));
  const [dictionaryNow, setDictionaryNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setDictionaryNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const preferences = { search: dictSearchQuery, deck: dictDeckFilter, status: dictStatusFilter, row: dictRowSelect, sort: dictSortOrder, view: dictViewMode, romaji: dictShowRomaji };
    try { for (const [key, value] of Object.entries(preferences)) localStorage.setItem(`marugoto_dictionary_${key}`, JSON.stringify(value)); } catch {}
  }, [dictSearchQuery, dictDeckFilter, dictStatusFilter, dictRowSelect, dictSortOrder, dictViewMode, dictShowRomaji]);
  useEffect(() => {
    if (!loading && dictDeckFilter !== 'all' && dictDeckFilter !== 'custom' && !decks.some(deck => deck.id === dictDeckFilter)) setDictDeckFilter('all');
  }, [loading, decks, dictDeckFilter]);

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

  // Romaji visibility mode: 'always' (luôn hiện) | 'reveal' (khi lật/trả lời) | 'never' (tắt)
  const [romajiMode, setRomajiMode] = useState(() => {
    try {
      return localStorage.getItem('marugoto_romaji_mode') || 'reveal';
    } catch {
      return 'reveal';
    }
  });

  function handleSetRomajiMode(newMode) {
    setRomajiMode(newMode);
    try {
      localStorage.setItem('marugoto_romaji_mode', newMode);
    } catch {}
  }

  // Flashcard study mode: 'flip' | 'test' | 'typed'
  const [studyMode, setStudyMode] = useState(() => {
    try {
      return localStorage.getItem('marugoto_study_mode') || 'flip';
    } catch {
      return 'flip';
    }
  });

  function handleSetStudyMode(newMode) {
    setStudyMode(newMode);
    try {
      localStorage.setItem('marugoto_study_mode', newMode);
    } catch {}
    setRevealed(false);
    setFlashcardStatus(null);
    setFlashcardMessage('');
  }

  // Quiz question type: 'multiple_choice' | 'typed'
  const [quizQuestionType, setQuizQuestionType] = useState(() => {
    try {
      return localStorage.getItem('marugoto_quiz_question_type') || 'multiple_choice';
    } catch {
      return 'multiple_choice';
    }
  });

  function handleSetQuizQuestionType(newType) {
    setQuizQuestionType(newType);
    try {
      localStorage.setItem('marugoto_quiz_question_type', newType);
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
  const [autoRateByResponseTime, setAutoRateByResponseTime] = useState(() => {
    try {
      const saved = localStorage.getItem('marugoto_auto_rate');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Typed Recall state
  const [typedInput, setTypedInput] = useState('');
  const [typedFeedback, setTypedFeedback] = useState(null);
  const [quizTypedInput, setQuizTypedInput] = useState('');
  const [autoConvertRomaji, setAutoConvertRomaji] = useState(() => {
    try {
      const saved = localStorage.getItem('marugoto_auto_convert_romaji');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const typedInputRef = useRef(null);
  const quizTypedInputRef = useRef(null);

  const [cardStartTime, setCardStartTime] = useState(Date.now());
  useEffect(() => {
    setCardStartTime(Date.now());
    setTypedInput('');
    setTypedFeedback(null);
  }, [index, tab]);

  useEffect(() => {
    setQuizTypedInput('');
  }, [quizSession?.queue?.[0]?.entry?.id]);

  function calculateResponseRating(elapsedSeconds, limitSeconds = 10) {
    const ratio = elapsedSeconds / limitSeconds;
    if (ratio <= 0.30 && elapsedSeconds <= 3.5) {
      return 'EASY';
    } else if (ratio <= 0.75) {
      return 'GOOD';
    } else {
      return 'HARD';
    }
  }

  const [quizAvailablePool, setQuizAvailablePool] = useState([]);
  const [quizAvailableDue, setQuizAvailableDue] = useState(0);

  const current = entries[index] || null;
  const currentQuestion = quizSession?.queue[0] || null;
  const quizPaused = !['quiz', 'review'].includes(tab) || isModalOpen || Boolean(importValidation) || batchKanjiModalOpen || isBackupModalOpen || Boolean(confirmation);
  const questionPauseRef = useRef(null);
  const hasFiveChoices = new Set(entries.map((entry) => optionKey(entry, mode))).size >= 5;
  const quizScore = quizSession?.correctFirstTry || 0;
  const quizInitialCompleted = quizSession?.initialCompleted || 0;
  const quizInitialCount = quizSession?.initialCount || 0;
  const pendingRepeatSeconds = quizSession ? secondsUntilNextRepeat(quizSession, quizClock) : 0;

  const trimmedDictSearch = dictSearchQuery.trim();
  const sortedDictionaryCards = useMemo(() => filterAndSortDictionary(dictionaryCards, {
    searchQuery: dictSearchQuery,
    deckFilter: dictDeckFilter,
    statusFilter: dictStatusFilter,
    rowSelect: dictRowSelect,
    sortOrder: dictSortOrder,
    now: dictionaryNow,
  }), [dictionaryCards, dictSearchQuery, dictDeckFilter, dictStatusFilter, dictRowSelect, dictSortOrder, dictionaryNow]);

  const rowCounts = {};
  for (const card of dictionaryCards) {
    if (dictDeckFilter === 'custom' && card.deckId !== 'custom') continue;
    if (dictDeckFilter !== 'all' && dictDeckFilter !== 'custom' && card.deckId !== dictDeckFilter) continue;
    const isDue = new Date(card.dueAt).getTime() <= Date.now();
    if (dictStatusFilter === 'due' && !isDue) continue;
    if (dictStatusFilter === 'reviewed' && (card.reviewCount === 0 || isDue)) continue;
    if (dictStatusFilter === 'new' && card.reviewCount > 0) continue;
    if (dictStatusFilter === 'leech' && !isCardLeech(card)) continue;
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

  async function loadCards(deckId = selectedDeckId, studyDirection = mode, leechOnly = flashcardLeechOnly) {
    const cardType = studyDirection === 'jp-vi' ? 'JP_TO_VI' : 'VI_TO_JP';
    const query = new URLSearchParams({
      deckId,
      mode: 'all',
      includeCustom: deckId === 'all' || deckId === 'custom',
      cardType,
      leechOnly: String(leechOnly),
    });
    const result = await api(`/api/study/cards?${query}`);
    setEntries(result.cards);
    setDueCount(result.dueCount);
    setIndex(0);
    setRevealed(false);
    setFlashcardStatus(null);
    setFlashcardMessage('');
    setFlashcardOptions(result.cards.length >= 5 ? makeOptions(result.cards[0], result.cards, studyDirection) : []);
    return result;
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
        const study = await loadCards('all');
        if (!study.cards.length) setTab('import');
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
      await loadCards(deckId, mode);
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
    if (quizSession && !quizDone) {
      setNotice({ message: 'Kết thúc phiên học hiện tại trước khi nhập bộ từ mới.' });
      event.target.value = '';
      return;
    }
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

  async function recordReview(entry, rating, source, responseMs = null) {
    const result = await api('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: entry.id,
        rating,
        source,
        responseMs: typeof responseMs === 'number' ? Math.round(responseMs) : null,
        cardType: mode === 'vi-jp' ? 'VI_TO_JP' : 'JP_TO_VI',
      }),
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

    const elapsed = Math.max(0.1, (Date.now() - cardStartTime) / 1000);
    const elapsedMs = Math.round(elapsed * 1000);

    if (correct) {
      const calculatedRating = calculateResponseRating(elapsed, 10);
      setAutoRating(calculatedRating);
      const ratingLabel = calculatedRating === 'EASY' ? 'Easy' : calculatedRating === 'GOOD' ? 'Good' : 'Hard';
      if (autoRateByResponseTime) {
        setFlashcardMessage(`Chính xác! (${elapsed.toFixed(1)}s · Đã tự động lưu: ${ratingLabel})`);
        setCardSaving(true);
        try {
          await recordReview(current, calculatedRating, 'RECALL', elapsedMs);
        } catch (saveError) {
          setError(`Không lưu được lượt ôn: ${saveError.message}`);
        } finally {
          setCardSaving(false);
        }
      } else {
        setFlashcardMessage(`Chính xác! (${elapsed.toFixed(1)}s · Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để tiếp tục)`);
      }
    } else {
      setAutoRating('AGAIN');
      setFlashcardMessage(`Chưa đúng. Đáp án: ${answerDisplay}`);
      setCardSaving(true);
      try {
        await recordReview(current, 'AGAIN', 'RECALL', elapsedMs);
      } catch (saveError) {
        setError(`Không lưu được lượt ôn: ${saveError.message}`);
      } finally {
        setCardSaving(false);
      }
    }
  }

  async function submitFlashcardTypedAnswer(e) {
    if (e) e.preventDefault();
    if (!current || flashcardStatus || cardSaving) return;
    const direction = mode === 'jp-vi' ? 'VI' : 'JP';
    const result = checkTypedAnswer(typedInput, current, direction);
    setTypedFeedback(result);
    setFlashcardStatus(result.isCorrect ? 'correct' : 'wrong');

    const elapsed = Math.max(0.1, (Date.now() - cardStartTime) / 1000);
    const elapsedMs = Math.round(elapsed * 1000);

    if (result.isCorrect) {
      const calculatedRating = calculateResponseRating(elapsed, 10);
      setAutoRating(calculatedRating);
      const ratingLabel = calculatedRating === 'EASY' ? 'Easy' : calculatedRating === 'GOOD' ? 'Good' : 'Hard';
      if (autoRateByResponseTime) {
        setFlashcardMessage(`Chính xác! (${elapsed.toFixed(1)}s · Đã tự động lưu: ${ratingLabel})`);
        setCardSaving(true);
        try {
          await recordReview(current, calculatedRating, 'RECALL', elapsedMs);
        } catch (saveError) {
          setError(`Không lưu được lượt ôn: ${saveError.message}`);
        } finally {
          setCardSaving(false);
        }
      } else {
        setFlashcardMessage(`Chính xác! (${elapsed.toFixed(1)}s · Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để tiếp tục)`);
      }
    } else {
      setAutoRating('AGAIN');
      const expectedStr = direction === 'JP' ? (current.jp || '') : (current.vi || '');
      setFlashcardMessage(`Chưa chính xác. Đáp án đúng: ${expectedStr}`);
      setCardSaving(true);
      try {
        await recordReview(current, 'AGAIN', 'RECALL', elapsedMs);
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
      const elapsedMs = Math.max(100, Date.now() - cardStartTime);
      await recordReview(current, rating, flashcardStatus ? 'RECALL' : 'FLASHCARD', elapsedMs);
      advanceCard();
    } catch (saveError) {
      setError(`Không lưu được lượt ôn: ${saveError.message}`);
    } finally {
      setCardSaving(false);
    }
  }

  function askConfirmation(description, confirmLabel = 'Xác nhận', title = 'Xác nhận thao tác') {
    return new Promise(resolve => setConfirmation({ description, confirmLabel, title, resolve }));
  }

  function resolveConfirmation(accepted) {
    confirmation?.resolve(accepted);
    setConfirmation(null);
  }

  function openBackup() {
    setBackupStatus(null);
    setIsBackupModalOpen(true);
  }

  function openEditor(card = null) {
    const open = () => { setEditingCard(card); setEditorKey(key => key + 1); setIsModalOpen(true); };
    if (isModalOpen) editorRequestRef.current?.(open);
    else open();
  }

  function openAddModal() { openEditor(); }
  function openEditModal(card) { openEditor(card); }

  async function saveVocabulary(input, original) {
    setCardSaving(true);
    try {
      const updated = await api(original ? `/api/decks/cards/${original.id}` : '/api/decks/custom-card', {
        method: original ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const mergeContent = card => card.id === updated.id ? { ...card, jp: updated.jp, romaji: updated.romaji, vi: updated.vi } : card;
      const merge = card => ({ ...mergeContent(card), ...(card.quizOptions ? { quizOptions: card.quizOptions.map(mergeContent) } : {}) });
      setCustomCards(cards => original ? cards.map(merge) : [...cards, updated]);
      setEntries(cards => original ? cards.map(merge) : cards);
      setDictionaryCards(cards => original ? cards.map(merge) : [...cards, updated]);
      // Keep the question/options already queued consistent without restarting the session.
      if (original) setQuizSession(session => session ? { ...session,
        queue: session.queue.map(question => ({ ...question, entry: merge(question.entry), options: question.options.map(merge) })),
        waiting: session.waiting.map(item => ({ ...item, entry: merge(item.entry) })),
      } : session);
      // A successful write must not be reported as failed when a follow-up refresh fails.
      try {
        await refreshDecks();
        await refreshDictionary();
        if (!original && !quizSession) await loadCards();
      } catch { setError('Từ đã được lưu. Chưa tải lại được danh sách; hãy tải lại trang khi kết nối sẵn sàng.'); }
      return updated;
    } finally { setCardSaving(false); }
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
    if (quizSession && !quizDone) { setNotice({ message: 'Kết thúc phiên học trước khi xóa từ.' }); return; }
    if (!await askConfirmation(`Xóa từ “${card.jp}” (${card.vi}) và lịch sử ôn của từ này?`, 'Xóa từ', 'Xóa từ vựng')) return;
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

  function openBatchKanjiModal(scopeChoice = 'all') {
    const targetPool = scopeChoice === 'all' ? dictionaryCards : sortedDictionaryCards;
    const unmapped = targetPool.filter((c) => !hasKanji(c.jp));
    if (!unmapped.length) {
      if (scopeChoice === 'filtered' && dictionaryCards.some((c) => !hasKanji(c.jp))) {
        return openBatchKanjiModal('all');
      }
      setNotice({ message: 'Tất cả các từ trong phạm vi này đã có Chữ Hán!' });
      return;
    }
    const result = autoMapKanjiForCards(unmapped, { style: 'ruby' });
    if (!result.mappedCount) {
      if (scopeChoice === 'filtered' && autoMapKanjiForCards(dictionaryCards.filter((c) => !hasKanji(c.jp)), { style: 'ruby' }).mappedCount > 0) {
        return openBatchKanjiModal('all');
      }
      setNotice({ message: 'Không tìm thấy gợi ý Chữ Hán 1-1 từ giáo trình cho các từ chưa có Chữ Hán.' });
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
      setNotice({ message: `Lỗi khi cập nhật Chữ Hán: ${err.message}` });
    } finally {
      setBatchKanjiSaving(false);
    }
  }

  async function handleRejectKanji(card) {
    if (!card) return;
    const reading = parseKanjiReading(card.jp).reading || extractReading(card) || card.jp;
    if (!await askConfirmation(`Chuyển “${card.jp}” về Kana “${reading}”? Tiến độ ôn được giữ nguyên.`, 'Chuyển về Kana', 'Gỡ Hán tự')) return;

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
      setNotice({ message: `Lỗi khi gỡ Chữ Hán: ${err.message}` });
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
      setNotice({ message: `Lỗi khi lưu Chữ Hán: ${err.message}` });
    }
  }

  async function handleApplyHomophoneKanji(card, kanji, reading) {
    return handleSaveSuggestedKanji(card, kanji, reading);
  }


  async function updateQuizSetupPool(scope = selectedDeckId, incCustom = includeCustom, studyDirection = mode, leech = quizLeechOnly) {
    try {
      const inc = scope === 'custom' ? true : incCustom;
      const cardType = studyDirection === 'jp-vi' ? 'JP_TO_VI' : 'VI_TO_JP';
      const query = new URLSearchParams({ deckId: scope, mode: 'all', includeCustom: inc, cardType, leechOnly: String(leech) });
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
      updateQuizSetupPool(selectedDeckId, includeCustom, mode, quizLeechOnly);
    }
  }, [tab, selectedDeckId, includeCustom, mode, quizLeechOnly]);

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
    if (!currentQuestion || quizDone || quizStatus) { questionPauseRef.current = null; return; }
    const questionKey = `${currentQuestion.entry.id}:${currentQuestion.repeat}`;
    if (quizPaused) {
      if (questionPauseRef.current?.key !== questionKey) questionPauseRef.current = { key: questionKey, startedAt: Date.now() };
    } else {
      if (questionPauseRef.current?.key === questionKey) {
        const pausedMs = Date.now() - questionPauseRef.current.startedAt;
        setQuestionStartTime(start => start ? start + pausedMs : start);
      }
      questionPauseRef.current = null;
    }
  }, [quizPaused, currentQuestion?.entry?.id, currentQuestion?.repeat, quizDone, Boolean(quizStatus)]);

  useEffect(() => {
    if (quizPaused || !currentQuestion || quizDone || quizStatus || !isCurrentTimerActive || !questionStartTime) return undefined;
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
  }, [quizPaused, currentQuestion?.entry?.id, currentQuestion?.repeat, quizDone, Boolean(quizStatus), isCurrentTimerActive, questionStartTime, timeLimit]);

  // Keyboard shortcuts: Space/Enter to advance & 1..4 keys for options/ratings
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.isComposing || isModalOpen || importValidation || batchKanjiModalOpen || isBackupModalOpen || confirmation || event.ctrlKey || event.metaKey || event.altKey || event.target?.isContentEditable || event.target?.tagName === 'SELECT') return;
      if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        if (event.key === 'Enter') {
          if ((tab === 'quiz' || tab === 'review') && quizStatus && !quizSaving) {
            event.preventDefault();
            event.target.blur();
            if (quizStatus === 'correct' && !autoRateByResponseTime && autoRating) {
              rateQuiz(autoRating);
            } else {
              advanceQuizQuestion();
            }
            return;
          }
          if (tab === 'flashcards' && flashcardStatus && !cardSaving) {
            event.preventDefault();
            event.target.blur();
            if (flashcardStatus === 'wrong') {
              advanceCard();
            } else {
              rateFlashcard(autoRating || 'GOOD');
            }
            return;
          }
        }
        return;
      }

      // Quiz / Review tab
      if (tab === 'quiz' || tab === 'review') {
        if (quizStatus && !quizSaving) {
          if (event.key === '1') {
            event.preventDefault();
            rateQuiz('AGAIN');
            return;
          }
          if (event.key === '2') {
            event.preventDefault();
            rateQuiz('HARD');
            return;
          }
          if (event.key === '3') {
            event.preventDefault();
            rateQuiz('GOOD');
            return;
          }
          if (event.key === '4') {
            event.preventDefault();
            rateQuiz('EASY');
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (quizStatus === 'correct' && !autoRateByResponseTime && autoRating) {
              rateQuiz(autoRating);
            } else {
              advanceQuizQuestion();
            }
            return;
          }
        }

        if (!quizStatus && currentQuestion?.options?.length && !quizSaving) {
          const num = parseInt(event.key, 10);
          if (num >= 1 && num <= currentQuestion.options.length) {
            event.preventDefault();
            answerQuiz(currentQuestion.options[num - 1]);
          }
        }
        return;
      }

      // Flashcards tab
      if (tab === 'flashcards' && !cardSaving && current) {
        if (!revealed && !flashcardStatus && studyMode === 'test' && flashcardOptions?.length) {
          const num = parseInt(event.key, 10);
          if (num >= 1 && num <= flashcardOptions.length) {
            event.preventDefault();
            chooseFlashcardOption(flashcardOptions[num - 1]);
            return;
          }
        }

        if (revealed || flashcardStatus) {
          if (event.key === '1') {
            event.preventDefault();
            rateFlashcard('AGAIN');
            return;
          }
          if (event.key === '2') {
            event.preventDefault();
            rateFlashcard('HARD');
            return;
          }
          if (event.key === '3') {
            event.preventDefault();
            rateFlashcard('GOOD');
            return;
          }
          if (event.key === '4') {
            event.preventDefault();
            rateFlashcard('EASY');
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (flashcardStatus === 'wrong') {
              advanceCard();
            } else {
              rateFlashcard('GOOD');
            }
            return;
          }
        } else {
          if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            setRevealed(true);
            return;
          }
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setIndex((v) => (v - 1 + Math.max(entries.length, 1)) % Math.max(entries.length, 1));
          setRevealed(false);
          setFlashcardStatus(null);
          setFlashcardSelectedId(null);
          setFlashcardMessage('');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          advanceCard();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, quizStatus, quizSaving, currentQuestion, autoRateByResponseTime, autoRating, cardSaving, current, revealed, flashcardStatus, studyMode, flashcardOptions, entries.length, isModalOpen, importValidation, batchKanjiModalOpen, isBackupModalOpen, confirmation]);

  function openQuizSetup(kind = 'TEST') {
    if (quizSession && !quizDone) {
      setTab(quizMode === 'DUE' ? 'review' : 'quiz');
      return;
    }
    updateQuizSetupPool(selectedDeckId, includeCustom, mode, quizLeechOnly);
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
      const cardType = mode === 'jp-vi' ? 'JP_TO_VI' : 'VI_TO_JP';
      const incCustom = selectedDeckId === 'custom' ? true : includeCustom;
      const query = new URLSearchParams({ deckId: selectedDeckId, mode: 'due', includeCustom: incCustom, cardType, leechOnly: String(quizLeechOnly) });
      const dueCards = (await api(`/api/study/cards?${query}`)).cards;
      if (kind === 'DUE' && !dueCards.length) {
        setError(quizLeechOnly ? 'Hiện không có từ khó nào đến hạn ôn.' : 'Hiện không có thẻ nào đến hạn ôn.');
        return;
      }
      const allQuery = new URLSearchParams({ deckId: selectedDeckId, mode: 'all', includeCustom: incCustom, cardType, leechOnly: String(quizLeechOnly) });
      const allCards = (await api(`/api/study/cards?${allQuery}`)).cards;
      if (!allCards.length) {
        setError('Không có từ khó nào trong phạm vi đã chọn để làm bài kiểm tra.');
        return;
      }
      if (quizQuestionType === 'multiple_choice' && new Set(allCards.map((card) => optionKey(card, mode))).size < 5) {
        setError('Cần ít nhất 5 đáp án khác nhau để tạo đủ lựa chọn trắc nghiệm. Hãy tắt lọc từ khó hoặc chuyển sang hình thức Tự gõ từ (Typed Recall).');
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
      setQuizTypedInput('');
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
    if (quizPaused || quizDone || quizStatus || quizSaving || !currentQuestion || !isCurrentTimerActive) return;
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
      const result = await recordReview(currentQuestion.entry, 'AGAIN', 'TEST', timeLimit * 1000);
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
        const elapsed = questionStartTime ? Math.max(0.1, (Date.now() - questionStartTime) / 1000) : 1;
        const responseMs = Math.round(elapsed * 1000);
        const result = await recordReview(currentQuestion.entry, 'AGAIN', 'TEST', responseMs);
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
      const responseMs = Math.round(elapsed * 1000);
      const calculatedRating = calculateResponseRating(elapsed, timeLimit);
      setAutoRating(calculatedRating);
      const ratingLabel = calculatedRating === 'EASY' ? 'Easy (Dễ)' : calculatedRating === 'GOOD' ? 'Good (Vừa)' : 'Hard (Khó)';
      if (autoRateByResponseTime) {
        setQuizMessage(isCurrentTimerActive
          ? `Chính xác! (${elapsed.toFixed(1)}s · Đã tự động lưu: ${ratingLabel})`
          : `Chính xác! (Đã tự động lưu: ${ratingLabel})`);
        setQuizSaving(true);
        try {
          const source = quizMode === 'DUE' ? 'TEST' : quizMode;
          await recordReview(currentQuestion.entry, calculatedRating, source, responseMs);
        } catch (saveError) {
          setError(`Không lưu được lượt ôn: ${saveError.message}`);
        } finally {
          setQuizSaving(false);
        }
      } else {
        setQuizMessage(isCurrentTimerActive
          ? `Chính xác! (${elapsed.toFixed(1)}s · Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để xác nhận)`
          : `Chính xác! (Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để xác nhận)`);
      }
    }
  }

  async function submitQuizTypedAnswer(e) {
    if (e) e.preventDefault();
    if (quizDone || quizStatus || quizSaving || !currentQuestion) return;
    const direction = mode === 'jp-vi' ? 'VI' : 'JP';
    const result = checkTypedAnswer(quizTypedInput, currentQuestion.entry, direction);
    setTypedFeedback(result);
    const correct = result.isCorrect;

    if (!currentQuestion.repeat) {
      setQuizSession((session) => session
        ? recordFirstAttempt(session, currentQuestion.entry.id, correct)
        : session);
    }
    setQuizStatus(correct ? 'correct' : 'wrong');

    const elapsed = questionStartTime ? Math.max(0.1, (Date.now() - questionStartTime) / 1000) : 1;
    const responseMs = Math.round(elapsed * 1000);

    if (!correct) {
      const answerDisplay = direction === 'VI' ? currentQuestion.entry.vi : getTestJapaneseDisplay(currentQuestion.entry, testKanjiMode);
      setQuizMessage(`Chưa đúng. Đáp án: ${answerDisplay}`);
      setQuizSaving(true);
      try {
        const source = quizMode === 'DUE' ? 'TEST' : quizMode;
        const res = await recordReview(currentQuestion.entry, 'AGAIN', source, responseMs);
        setQuizSession((session) => session
          ? scheduleAgain(session, currentQuestion.entry, res.dueAt)
          : session);
      } catch (saveError) {
        setError(`Không lưu được lượt ôn: ${saveError.message}`);
        setQuizStatus(null);
        setQuizMessage('');
      } finally {
        setQuizSaving(false);
      }
    } else {
      const calculatedRating = calculateResponseRating(elapsed, timeLimit);
      setAutoRating(calculatedRating);
      const ratingLabel = calculatedRating === 'EASY' ? 'Easy (Dễ)' : calculatedRating === 'GOOD' ? 'Good (Vừa)' : 'Hard (Khó)';
      if (autoRateByResponseTime) {
        setQuizMessage(isCurrentTimerActive
          ? `Chính xác! (${elapsed.toFixed(1)}s · Đã tự động lưu: ${ratingLabel})`
          : `Chính xác! (Đã tự động lưu: ${ratingLabel})`);
        setQuizSaving(true);
        try {
          const source = quizMode === 'DUE' ? 'TEST' : quizMode;
          await recordReview(currentQuestion.entry, calculatedRating, source, responseMs);
        } catch (saveError) {
          setError(`Không lưu được lượt ôn: ${saveError.message}`);
        } finally {
          setQuizSaving(false);
        }
      } else {
        setQuizMessage(isCurrentTimerActive
          ? `Chính xác! (${elapsed.toFixed(1)}s · Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để xác nhận)`
          : `Chính xác! (Gợi ý: ${ratingLabel} — Bấm 1-4 hoặc Enter để xác nhận)`);
      }
    }
  }

  async function rateQuiz(rating) {
    if (quizSaving || !currentQuestion) return;
    setQuizSaving(true);
    try {
      const source = quizMode === 'DUE' ? 'TEST' : quizMode;
      const elapsed = questionStartTime ? Math.max(0.1, (Date.now() - questionStartTime) / 1000) : 1;
      await recordReview(currentQuestion.entry, rating, source, Math.round(elapsed * 1000));
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

  async function handleConfirmEndSession() {
    if (await askConfirmation('Kết thúc phiên hiện tại? Kết quả các câu đã làm vẫn được lưu.', 'Kết thúc phiên', 'Kết thúc phiên học')) {
      endQuizSession();
    }
  }

  async function deleteDeck(deck) {
    if (quizSession && !quizDone) { setNotice({ message: 'Kết thúc phiên học trước khi xóa bộ từ.' }); return; }
    if (!await askConfirmation(`Xóa bộ “${deck.title}”, PDF gốc và tiến độ của bộ này?`, 'Xóa bộ từ', 'Xóa bộ từ')) return;
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
      <RatingToolbar
        onRate={onRate}
        disabled={disabled}
        includeAgain={includeAgain}
        autoRating={autoRating}
        autoRateByResponseTime={autoRateByResponseTime}
      />
    );
  }

  const studyTab = ['flashcards', 'quiz', 'review'].includes(tab);
  const sessionActive = Boolean(quizSession && !quizDone);
  const otherDialogOpen = Boolean(importValidation || batchKanjiModalOpen || isBackupModalOpen || confirmation);
  const modalEditor = isModalOpen && (tab !== 'dictionary' || smallScreen);
  const editor = isModalOpen ? <VocabularyEditor key={editorKey} card={editingCard} cards={dictionaryCards}
    requestRef={editorRequestRef} modal={modalEditor} suspended={otherDialogOpen} onSave={saveVocabulary} onClose={() => setIsModalOpen(false)} onSpeak={speakJapanese}
    onSaved={(card, keepAdding) => setNotice({ message: keepAdding ? 'Đã lưu từ. Bạn có thể thêm từ tiếp theo.' : 'Đã lưu từ vựng.', card })}/> : null;

  function setDictionaryFilters(filters) {
    setDictSearchQuery(filters.search); setDictDeckFilter(filters.deck); setDictStatusFilter(filters.status); setDictRowSelect(filters.row); setDictSortOrder(filters.sort);
  }

  function navigate(section) {
    const go = () => setTab(section === 'study' ? (sessionActive ? quizMode === 'DUE' ? 'review' : 'quiz' : 'flashcards') : section);
    if (isModalOpen) editorRequestRef.current?.(() => { setIsModalOpen(false); go(); });
    else go();
  }

  const availableQuizChoices = new Set(quizAvailablePool.map(card => optionKey(card, mode))).size >= 5;
  const canStartQuiz = quizAvailablePool.length > 0 && (quizQuestionType === 'typed' || availableQuizChoices) && (tab !== 'review' || quizAvailableDue > 0);

  return (
    <div className="app">
      <div inert={otherDialogOpen || (modalEditor && tab !== 'dictionary') || (isModalOpen && smallScreen)}>
        <AppHeader section={studyTab ? 'study' : tab} onNavigate={navigate} sessionActive={sessionActive} dueCount={dueCount}/>
      </div>
      <main id="app-main" className={`app-main ${studyTab ? 'study-page' : ''}`} inert={otherDialogOpen || (modalEditor && tab !== 'dictionary')}>
      {studyTab && <div className="study-page-heading"><div><span className="eyebrow">Học và ghi nhớ</span><h1>Học tập</h1></div><div className="study-summary"><b>{entries.length}</b> từ trong phạm vi <span>·</span> <b>{dueCount}</b> đến hạn</div></div>}
      {studyTab && <div className="study-navigation">
        <nav className="tabs" aria-label="Hình thức học">
          <button className={tab === 'flashcards' ? 'active' : ''} aria-current={tab === 'flashcards' ? 'page' : undefined} onClick={() => setTab('flashcards')}>Flashcards</button>
          <button disabled={loading || busy || Boolean(sessionActive && quizMode !== 'TEST')} className={tab === 'quiz' ? 'active' : ''} aria-current={tab === 'quiz' ? 'page' : undefined} onClick={() => openQuizSetup('TEST')}>Kiểm tra</button>
          <button disabled={loading || busy || Boolean(sessionActive && quizMode !== 'DUE')} className={tab === 'review' ? 'active' : ''} aria-current={tab === 'review' ? 'page' : undefined} onClick={() => openQuizSetup('DUE')}>Ôn đến hạn <span>{dueCount}</span></button>
        </nav>
        <div className="study-context"><label htmlFor="deck-select" className="sr-only">Bộ học</label><select id="deck-select" value={selectedDeckId} disabled={busy || loading || sessionActive} onChange={event => selectDeck(event.target.value)}><option value="all">Tất cả bộ</option>{customDeck && <option value="custom">Từ tùy chỉnh · {customDeck.cardCount} từ</option>}{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.title} · {deck.cardCount} từ</option>)}</select><label htmlFor="direction-select" className="sr-only">Chiều học</label><select id="direction-select" value={mode} disabled={sessionActive || busy || loading} onChange={async event => {
          const direction = event.target.value; setMode(direction);
          try { await loadCards(selectedDeckId, direction); await updateQuizSetupPool(selectedDeckId, includeCustom, direction); }
          catch (error) { setError(error.message); }
        }}><option value="jp-vi">Nhật → Việt</option><option value="vi-jp">Việt → Nhật</option></select></div>
      </div>}
      {notice && <div className="workspace-notice" role="status"><Icon name="check" size={17}/><span>{notice.message}</span>{notice.card && <button type="button" className="text-button" onClick={() => {
        const reveal = () => { setTab('dictionary'); setDictionaryFilters({ search: notice.card.jp, deck: 'all', status: 'all', row: 'all', sort: 'gojuon-asc' }); };
        if (isModalOpen) editorRequestRef.current?.(() => { setIsModalOpen(false); reveal(); }); else reveal();
      }}>Xem từ đã lưu</button>}<button type="button" className="icon-button" aria-label="Ẩn thông báo" onClick={() => setNotice(null)}><Icon name="close" size={16}/></button></div>}
      {error && <div className="feedback bad" role="alert">{error}</div>}
      {sessionActive && !['quiz', 'review'].includes(tab) && <div className="session-return"><span>Phiên học đang tạm dừng · thời gian trả lời được giữ lại</span><button type="button" className="text-button" onClick={() => navigate('study')}>Tiếp tục phiên học <Icon name="arrow" size={15}/></button></div>}
      {loading && <section className="loading-workspace" aria-busy="true" aria-label="Đang tải bộ từ và tiến độ"><div className="skeleton skeleton-title"/><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/><span role="status">Đang tải bộ từ và tiến độ…</span></section>}

      {!loading && tab === 'dictionary' && <DictionaryWorkspace cards={dictionaryCards} visibleCards={sortedDictionaryCards}
        decks={decks} customDeck={customDeck} filters={{ search: dictSearchQuery, deck: dictDeckFilter, status: dictStatusFilter, row: dictRowSelect, sort: dictSortOrder }}
        setFilters={setDictionaryFilters} rowCounts={rowCounts} viewMode={dictViewMode} setViewMode={setDictViewMode} showRomaji={dictShowRomaji} setShowRomaji={setDictShowRomaji}
        editor={editor} editingId={isModalOpen ? editingCard?.id : null} onAdd={openAddModal} onEdit={openEditModal} onDelete={handleDeleteCard}
        onSpeak={speakJapanese} onBatchKanji={openBatchKanjiModal} onFlushKana={handleRejectKanji} onImport={() => navigate('import')} blocked={otherDialogOpen || (isModalOpen && smallScreen)}/>}

      {!loading && tab === 'import' && <DeckLibrary decks={decks} customDeck={customDeck} customCards={customCards} showCustomList={showCustomList}
        onToggleCustom={toggleShowCustomCards} busy={busy} onAdd={openAddModal} onEdit={openEditModal} onDeleteCard={handleDeleteCard}
        onDictionary={() => { setDictDeckFilter('custom'); setTab('dictionary'); }} onFiles={handleFiles} onDeleteDeck={deleteDeck} onBackup={openBackup}
        onStudy={async deckId => { if (sessionActive) { setNotice({ message: 'Kết thúc phiên học hiện tại trước khi chọn bộ khác.' }); return; } await selectDeck(deckId); setTab('flashcards'); }}/>}
      {!loading && tab === 'settings' && <SettingsPanel sessionActive={sessionActive} preferences={{ kanjiMode: testKanjiMode, romajiMode, studyMode, questionType: quizQuestionType, autoRate: autoRateByResponseTime, fontSize: flashcardFontSize }}
        onBackup={openBackup} onImport={() => navigate('import')} onChange={(key, value) => {
          if (key === 'kanjiMode') handleSetTestKanjiMode(value);
          if (key === 'romajiMode') handleSetRomajiMode(value);
          if (key === 'studyMode') handleSetStudyMode(value);
          if (key === 'questionType') handleSetQuizQuestionType(value);
          if (key === 'autoRate') { setAutoRateByResponseTime(value); try { localStorage.setItem('marugoto_auto_rate', String(value)); } catch {} }
          if (key === 'fontSize') { setFlashcardFontSize(value); try { localStorage.setItem('marugoto_flashcard_font_size', String(value)); } catch {} }
        }}/>}

      {!loading && tab === 'flashcards' && current && (
        <section className={`panel flashcard-panel ${showFlashcardDisplay ? 'show-display' : ''}`}>
          <div className="toolbar flashcard-toolbar">
            <div className="flashcard-toolbar-left">
              <span className="card-counter-badge">{index + 1} / {entries.length}</span>
              <span className="deck-tag-label" title={current.deckTitle}>{current.deckTitle}</span>
              {isCardLeech(current) && (
                <span className="leech-indicator-badge" title="Từ khó: đã trả lời sai ≥3 lần hoặc tỷ lệ quên cao">Từ khó</span>
              )}
              <button
                type="button"
                className="backup-btn"
                style={{
                  padding: '4px 10px',
                  fontSize: '12.5px',
                  background: flashcardLeechOnly ? '#fee2e2' : undefined,
                  borderColor: flashcardLeechOnly ? '#ef4444' : undefined,
                  color: flashcardLeechOnly ? '#b91c1c' : undefined,
                  fontWeight: flashcardLeechOnly ? '700' : '500',
                }}
                onClick={async () => {
                  const next = !flashcardLeechOnly;
                  setFlashcardLeechOnly(next);
                  await loadCards(selectedDeckId, mode, next);
                }}
                title={flashcardLeechOnly ? 'Đang lọc từ khó. Bấm để hiển thị tất cả thẻ.' : 'Bấm để chỉ luyện các từ khó / hay sai.'}
              >
                {flashcardLeechOnly ? 'Từ khó (Bật)' : 'Lọc từ khó'}
              </button>
            </div>

            <button type="button" className="button-secondary display-preferences-toggle" aria-expanded={showFlashcardDisplay} onClick={() => setShowFlashcardDisplay(value => !value)}>Tùy chọn hiển thị</button>
            <div className={`flashcard-toolbar-center ${showFlashcardDisplay ? 'is-open' : ''}`}>
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

              <div className="romaji-segmented-group" title="Chế độ hiển thị Romaji">
                <button
                  type="button"
                  className={`romaji-seg-pill ${romajiMode === 'always' ? 'active' : ''}`}
                  onClick={() => handleSetRomajiMode('always')}
                  title="Luôn hiển thị phiên âm Romaji"
                >
                  Romaji: Hiện
                </button>
                <button
                  type="button"
                  className={`romaji-seg-pill ${romajiMode === 'reveal' ? 'active' : ''}`}
                  onClick={() => handleSetRomajiMode('reveal')}
                  title="Chỉ hiện Romaji khi lật thẻ hoặc trả lời"
                >
                  Khi lật thẻ
                </button>
                <button
                  type="button"
                  className={`romaji-seg-pill ${romajiMode === 'never' ? 'active' : ''}`}
                  onClick={() => handleSetRomajiMode('never')}
                  title="Tắt Romaji hoàn toàn"
                >
                  Tắt Romaji
                </button>
              </div>
            </div>

            <div className="flashcard-toolbar-right">
              <div className="study-mode-segmented-group" title="Hình thức học Flashcard">
                <button
                  type="button"
                  className={`study-mode-pill ${studyMode === 'flip' ? 'active' : ''}`}
                  onClick={() => handleSetStudyMode('flip')}
                  title="Thẻ lật truyền thống"
                >
                  Thẻ lật
                </button>
                <button
                  type="button"
                  className={`study-mode-pill ${studyMode === 'test' ? 'active' : ''}`}
                  onClick={() => handleSetStudyMode('test')}
                  title="Trắc nghiệm 1 trong 5"
                >
                  Trắc nghiệm
                </button>
                <button
                  type="button"
                  className={`study-mode-pill ${studyMode === 'typed' ? 'active' : ''}`}
                  onClick={() => handleSetStudyMode('typed')}
                  title="Gõ câu trả lời trực tiếp (Typed Recall)"
                >
                  Gõ từ
                </button>
              </div>

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
              if (e.target !== e.currentTarget) return;
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

            {mode === 'jp-vi' && romajiMode === 'always' && current.romaji && (
              <div className="flashcard-front-romaji">{current.romaji}</div>
            )}

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
                <Icon name="audio" size={22}/>
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
                {current.romaji && romajiMode !== 'never' && (
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
                    <Icon name="audio" size={22}/>
                  </button>
                )}
              </div>
            )}
          </div>

          {studyMode === 'test' && (
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
          )}

          {studyMode === 'typed' && (
            <div className="typed-recall-section">
              <div className="typed-recall-header">
                <span className="typed-recall-title">Gõ câu trả lời (Typed Recall)</span>
                {mode === 'vi-jp' && (
                  <label className="typed-convert-toggle">
                    <input
                      type="checkbox"
                      checked={autoConvertRomaji}
                      onChange={(e) => {
                        setAutoConvertRomaji(e.target.checked);
                        try { localStorage.setItem('marugoto_auto_convert_romaji', String(e.target.checked)); } catch {}
                      }}
                    />
                    <span>Chuyển Romaji ➔ Hiragana</span>
                  </label>
                )}
              </div>
              <form onSubmit={submitFlashcardTypedAnswer} className="typed-input-wrapper">
                <input
                  ref={typedInputRef}
                  type="text"
                  className={`typed-input-box ${flashcardStatus === 'correct' ? 'correct' : flashcardStatus === 'wrong' ? 'wrong' : ''}`}
                  placeholder={mode === 'jp-vi' ? 'Nhập nghĩa tiếng Việt...' : 'Nhập tiếng Nhật (hoặc gõ Romaji)...'}
                  value={typedInput}
                  disabled={Boolean(flashcardStatus) || cardSaving}
                  autoFocus
                  onChange={(e) => {
                    let val = e.target.value;
                    if (mode === 'vi-jp' && autoConvertRomaji) {
                      val = romajiToHiragana(val, { isFinal: false });
                    }
                    setTypedInput(val);
                  }}
                />
                <button
                  type="submit"
                  className="typed-submit-btn"
                  disabled={Boolean(flashcardStatus) || cardSaving || !typedInput.trim()}
                >
                  Kiểm tra ↵
                </button>
              </form>

              {mode === 'vi-jp' && typedInput && !flashcardStatus && (
                <div className="typed-hint-bar">
                  <span>Đang nhập:</span>
                  <span className="typed-preview-badge">{romajiToHiragana(typedInput, { isFinal: true })}</span>
                </div>
              )}

              {typedFeedback && (
                <div className={`typed-diff-feedback ${typedFeedback.isCorrect ? 'correct' : 'wrong'}`}>
                  {typedFeedback.isCorrect ? (
                    <div>✓ Chính xác! Bạn đã nhớ từ này.</div>
                  ) : (
                    <div>
                      <div>✗ Chưa đúng: <span className="user-answer">{typedInput}</span></div>
                      <span className="expected-answer">Đáp án đúng: {mode === 'jp-vi' ? current.vi : current.jp}</span>
                    </div>
                  )}
                </div>
              )}

              {flashcardMessage && <div className={`feedback ${flashcardStatus === 'correct' ? 'ok' : 'bad'}`}>{flashcardMessage}</div>}
              {flashcardStatus === 'correct' && renderRatings(rateFlashcard, cardSaving, false)}
              {flashcardStatus === 'wrong' && (
                <button className="primary next-button" disabled={cardSaving} onClick={advanceCard}>
                  Tiếp theo (Phím Space/Enter)
                </button>
              )}
            </div>
          )}

          {studyMode === 'flip' && revealed && !flashcardStatus && (
            <div className="actions">{renderRatings(rateFlashcard, cardSaving)}</div>
          )}
        </section>
      )}

      {!loading && (tab === 'quiz' || tab === 'review') && (
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
                  <label className="setup-option-label" htmlFor="quiz-leech-only-toggle">
                    <div className="option-text-group">
                      <span className="option-title">Chỉ luyện các từ khó / hay sai (Leech cards)</span>
                      <span className="option-desc">Lọc riêng các từ bạn đã trả lời sai ≥ 3 lần hoặc có tỷ lệ quên cao để luyện tập chuyên sâu</span>
                    </div>
                    <input
                      id="quiz-leech-only-toggle"
                      type="checkbox"
                      className="toggle-switch"
                      checked={quizLeechOnly}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setQuizLeechOnly(val);
                        updateQuizSetupPool(selectedDeckId, includeCustom, mode, val);
                      }}
                    />
                  </label>
                </div>

                <div className="setup-option-card">
                  <div className="option-text-group" style={{ marginBottom: '10px' }}>
                    <span className="option-title">Hình thức trả lời</span>
                    <span className="option-desc">Chọn làm bài bằng trắc nghiệm hoặc tự gõ câu trả lời (Typed Recall)</span>
                  </div>
                  <div className="study-mode-segmented-group">
                    <button
                      type="button"
                      className={`study-mode-pill ${quizQuestionType === 'multiple_choice' ? 'active' : ''}`}
                      onClick={() => handleSetQuizQuestionType('multiple_choice')}
                    >
                      Trắc nghiệm (1 trong 5)
                    </button>
                    <button
                      type="button"
                      className={`study-mode-pill ${quizQuestionType === 'typed' ? 'active' : ''}`}
                      onClick={() => handleSetQuizQuestionType('typed')}
                    >
                      Tự gõ câu trả lời
                    </button>
                  </div>
                </div>

              </div>
              <details className="advanced-study-settings">
                <summary>Hiển thị, thời gian và đánh giá <span>{hasTimer ? `${timeLimit} giây / câu` : 'Không giới hạn thời gian'} · {testKanjiMode === 'ruby' ? 'Furigana' : testKanjiMode === 'kanji-only' ? 'Chỉ Kanji' : 'Chỉ Kana'}</span></summary>
                <div className="setup-options-container">
                <div className="setup-option-card">
                  <div className="option-text-group" style={{ marginBottom: '10px' }}>
                    <span className="option-title">Chế độ hiển thị Romaji</span>
                    <span className="option-desc">Tùy chọn hiển thị phiên âm Romaji trong bài kiểm tra</span>
                  </div>
                  <div className="romaji-segmented-group">
                    <button
                      type="button"
                      className={`romaji-seg-pill ${romajiMode === 'always' ? 'active' : ''}`}
                      onClick={() => handleSetRomajiMode('always')}
                    >
                      Luôn hiện
                    </button>
                    <button
                      type="button"
                      className={`romaji-seg-pill ${romajiMode === 'reveal' ? 'active' : ''}`}
                      onClick={() => handleSetRomajiMode('reveal')}
                    >
                      Chỉ khi trả lời
                    </button>
                    <button
                      type="button"
                      className={`romaji-seg-pill ${romajiMode === 'never' ? 'active' : ''}`}
                      onClick={() => handleSetRomajiMode('never')}
                    >
                      Tắt Romaji
                    </button>
                  </div>
                </div>

                <div className="setup-option-card">
                  <div className="option-text-group" style={{ marginBottom: '10px' }}>
                    <span className="option-title">Chế độ hiển thị Chữ Hán (Kanji)</span>
                    <span className="option-desc">Tùy chọn hiển thị chữ Hán, Furigana hoặc chế độ thử thách Only Kanji trong bài test</span>
                  </div>
                  <div className="kanji-mode-toggle-group">
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'ruby' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('ruby')}
                      title="Hiển thị Chữ Hán kèm cách đọc Furigana phía trên"
                    >
                      <span className="pill-title">Hán tự + Furigana</span>
                      <span className="pill-sub">Chữ Hán kèm phiên âm</span>
                    </button>
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'kanji-only' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('kanji-only')}
                      title="Chỉ hiển thị Chữ Hán, ẩn hoàn toàn phiên âm để kiểm tra nhớ mặt chữ"
                    >
                      <span className="pill-title">Chỉ Chữ Hán (Only Kanji)</span>
                      <span className="pill-sub">Ẩn cách đọc (Thử thách)</span>
                    </button>
                    <button
                      type="button"
                      className={`kanji-mode-pill ${testKanjiMode === 'kana-only' ? 'active' : ''}`}
                      onClick={() => handleSetTestKanjiMode('kana-only')}
                      title="Tắt chữ Hán, chỉ hiển thị cách đọc Kana thuần túy"
                    >
                      <span className="pill-title">Tắt Chữ Hán (Chỉ Kana)</span>
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
                          <span className="rule-badge">Easy</span>
                          <span className="rule-text">≤ 30% (≤ 3.5s)</span>
                        </div>
                        <div className="rule-pill good">
                          <span className="rule-badge">Good</span>
                          <span className="rule-text">30% – 75%</span>
                        </div>
                        <div className="rule-pill hard">
                          <span className="rule-badge">Hard</span>
                          <span className="rule-text">&gt; 75%</span>
                        </div>
                        <div className="rule-pill again">
                          <span className="rule-badge">⌛ Again</span>
                          <span className="rule-text">Hết giờ</span>
                        </div>
                      </div>

                      <div className="try-again-sub-option">
                        <label className="setup-option-label" htmlFor="auto-rate-toggle">
                          <div className="option-text-group">
                            <span className="option-sub-title">Tự động chọn mức nhớ theo phản xạ (Mặc định: Bật)</span>
                            <span className="option-desc">Tự động lưu Easy/Good/Hard theo thời gian làm bài để học nhanh. Tắt để xác nhận thủ công hoặc dùng phím 1-4</span>
                          </div>
                          <input
                            id="auto-rate-toggle"
                            type="checkbox"
                            className="toggle-switch small-switch"
                            checked={autoRateByResponseTime}
                            onChange={(e) => {
                              setAutoRateByResponseTime(e.target.checked);
                              try {
                                localStorage.setItem('marugoto_auto_rate', e.target.checked ? 'true' : 'false');
                              } catch {}
                            }}
                          />
                        </label>
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

              </details>
              {!canStartQuiz && <div className="setup-availability" role="status">{!quizAvailablePool.length ? 'Không có từ phù hợp trong phạm vi này. Thử đổi bộ hoặc tắt lọc từ khó.' : tab === 'review' && !quizAvailableDue ? 'Không có từ đến hạn ôn trong phạm vi đã chọn.' : 'Trắc nghiệm cần 5 đáp án khác nhau. Chọn Tự gõ từ để học bộ nhỏ.'}</div>}
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
                  disabled={busy || !canStartQuiz}
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
                      <span className="quiz-repeat-badge">Ôn lại thẻ sai</span>
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
                        <b>{questionTimeLeft.toFixed(1)}s</b> / {timeLimit}s
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
                    <span><b>Chế độ ôn lại:</b> Đã tắt đếm ngược thời gian để bạn suy nghĩ kỹ hơn</span>
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
                        onClick={() => openEditModal(currentQuestion.entry)}
                        title="Chỉnh sửa hoặc đổi chữ Hán khác"
                      >
                        {promptDetails.hasKanji ? 'Đổi Hán tự' : '+ Thêm Hán tự'}
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

                      {mode === 'jp-vi' && currentQuestion.entry.romaji && (romajiMode === 'always' || (romajiMode === 'reveal' && quizStatus)) && (
                        <div className="flashcard-front-romaji">{currentQuestion.entry.romaji}</div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="quiz-card-hero">
                  <div className="quiz-vietnamese-headline">{currentQuestion.entry.vi}</div>
                </div>
              )}

              {quizQuestionType === 'typed' ? (
                <div className="typed-recall-section" style={{ marginTop: '16px' }}>
                  <div className="typed-recall-header">
                    <span className="typed-recall-title">Gõ câu trả lời</span>
                    {mode === 'vi-jp' && (
                      <label className="typed-convert-toggle">
                        <input
                          type="checkbox"
                          checked={autoConvertRomaji}
                          onChange={(e) => {
                            setAutoConvertRomaji(e.target.checked);
                            try { localStorage.setItem('marugoto_auto_convert_romaji', String(e.target.checked)); } catch {}
                          }}
                        />
                        <span>Chuyển Romaji ➔ Hiragana</span>
                      </label>
                    )}
                  </div>
                  <form onSubmit={submitQuizTypedAnswer} className="typed-input-wrapper">
                    <input
                      ref={quizTypedInputRef}
                      type="text"
                      className={`typed-input-box ${quizStatus === 'correct' ? 'correct' : quizStatus === 'wrong' ? 'wrong' : ''}`}
                      placeholder={mode === 'jp-vi' ? 'Nhập nghĩa tiếng Việt...' : 'Nhập tiếng Nhật (hoặc gõ Romaji)...'}
                      value={quizTypedInput}
                      disabled={Boolean(quizStatus) || quizSaving}
                      aria-label={mode === 'jp-vi' ? 'Nhập nghĩa tiếng Việt...' : 'Nhập tiếng Nhật (hoặc gõ Romaji)...'}
                      autoFocus
                      onChange={(e) => {
                        let val = e.target.value;
                        if (mode === 'vi-jp' && autoConvertRomaji) {
                          val = romajiToHiragana(val, { isFinal: false });
                        }
                        setQuizTypedInput(val);
                      }}
                    />
                    <button
                      type="submit"
                      className="typed-submit-btn"
                      disabled={Boolean(quizStatus) || quizSaving || !quizTypedInput.trim()}
                    >
                      Kiểm tra ↵
                    </button>
                  </form>

                  {mode === 'vi-jp' && quizTypedInput && !quizStatus && (
                    <div className="typed-hint-bar">
                      <span>Đang nhập:</span>
                      <span className="typed-preview-badge">{romajiToHiragana(quizTypedInput, { isFinal: true })}</span>
                    </div>
                  )}

                  {typedFeedback && quizStatus && (
                    <div className={`typed-diff-feedback ${typedFeedback.isCorrect ? 'correct' : 'wrong'}`}>
                      {typedFeedback.isCorrect ? (
                        <div>✓ Chính xác!</div>
                      ) : (
                        <div>
                          <div>✗ Bạn đã nhập: <span className="user-answer">{quizTypedInput}</span></div>
                          <span className="expected-answer">Đáp án đúng: {mode === 'jp-vi' ? currentQuestion.entry.vi : currentQuestion.entry.jp}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                </>
              )}

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
                      <div className="rating-panel-heading">
                        {autoRateByResponseTime
                          ? 'Đã tự động lưu theo thời gian phản xạ. Bạn có thể chọn mức khác bên dưới nếu muốn đổi (Phím 1-4):'
                          : 'Gợi ý mức nhớ dựa trên thời gian phản xạ. Vui lòng bấm chọn hoặc nhấn phím 1-4 để xác nhận:'}
                      </div>
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
              <div className="wait-icon"><Icon name="book" size={36}/></div>
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
              <div className="result-celebration"><Icon name="check" size={40}/></div>
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
                  {quizSession.waiting.length} thẻ cần ôn lại (Again) đã được lưu và sẽ xuất hiện trong các lượt ôn tới hạn.
                </div>
              )}
              {quizSession?.queue.length > 0 && (
                <div className="result-alert pending">
                  {quizSession.queue.length} thẻ chưa làm vẫn giữ nguyên trạng thái cho lượt sau.
                </div>
              )}
              <div className="result-actions-group">
                <button
                  type="button"
                  className="primary result-btn"
                  onClick={() => { setQuizSession(null); setQuizDone(false); setQuizStatus(null); }}
                >
                  Bắt đầu phiên mới
                </button>
                <button
                  type="button"
                  className="secondary-button result-btn"
                  onClick={() => { setQuizSession(null); setQuizDone(false); setQuizStatus(null); setTab('flashcards'); }}
                >
                  Về Flashcards
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!loading && tab === 'flashcards' && !current && <section className="workspace-empty"><Icon name="book" size={30}/><h2>{flashcardLeechOnly ? 'Không có từ khó trong phạm vi này' : 'Chưa có từ để học'}</h2><p>Chọn bộ khác, thêm từ hoặc nhập từ giáo trình PDF để bắt đầu.</p><div className="inline-actions">{flashcardLeechOnly && <button className="button-secondary" onClick={async () => { setFlashcardLeechOnly(false); try { await loadCards(selectedDeckId, mode, false); } catch (error) { setError(error.message); } }}>Hiện tất cả từ</button>}<button className="button-secondary" onClick={() => navigate('import')}>Mở Bộ từ</button><button className="button-primary" onClick={openAddModal}>Thêm từ</button></div></section>}
      </main>
      {isModalOpen && tab !== 'dictionary' && <div className="floating-editor"><div className="editor-scrim" onClick={() => editorRequestRef.current?.()}/>{editor}</div>}

      {importValidation && (
        <DialogFrame label="Kiểm tra từ vựng trước khi nhập PDF" busy={busy} onClose={() => setImportValidation(null)} className="import-validation-modal">
            <div className="modal-header">
              <h3>Kiểm tra từ vựng trước khi nhập PDF</h3>
              <button aria-label="Đóng xem trước PDF" disabled={busy} className="close-btn" onClick={() => setImportValidation(null)}><Icon name="close"/></button>
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
                  <span className="stat-label">Từ mới hợp lệ</span>
                </div>
                <div className="val-stat-pill duplicate">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + f.dupResult.duplicates.length, 0)}</span>
                  <span className="stat-label">Từ đã có</span>
                </div>
                <div className="val-stat-pill kanji">
                  <span className="stat-num">{importValidation.parsedFiles.reduce((s, f) => s + (f.mappedCount || 0), 0)}</span>
                  <span className="stat-label">Gợi ý Chữ Hán</span>
                </div>
              </div>

              <div className="import-kanji-choice">
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
                  <span>
                    <b>Tự động gán Chữ Hán 1-1</b> cho {importValidation.parsedFiles.reduce((s, f) => s + (f.mappedCount || 0), 0)} từ phù hợp (Ví dụ: さかな → 魚（さかな）)
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
                      <th>Từ đã có</th>
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
        </DialogFrame>
      )}

      {/* ✨ Batch Auto Map Kanji Modal */}
      {batchKanjiModalOpen && (
        <DialogFrame label="Tự động gán Chữ Hán" busy={batchKanjiSaving} onClose={() => setBatchKanjiModalOpen(false)} className="batch-kanji-modal">
            <div className="modal-header">
              <h3>Tự động gán Chữ Hán cho Từ điển</h3>
              <button aria-label="Đóng gợi ý Chữ Hán" disabled={batchKanjiSaving} className="close-btn" onClick={() => setBatchKanjiModalOpen(false)}><Icon name="close"/></button>
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
                  <span>Toàn bộ thư viện ({dictionaryCards.length} từ)</span>
                </label>
                <label className={`batch-scope-pill ${batchKanjiScope === 'filtered' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="batch-scope"
                    checked={batchKanjiScope === 'filtered'}
                    onChange={() => switchBatchScope('filtered')}
                  />
                  <span>Bộ từ đang lọc ({sortedDictionaryCards.length} từ)</span>
                </label>
              </div>
            </div>

            <div className="batch-kanji-summary">
              Tìm thấy <b>{batchKanjiPreview.length}</b> từ vựng có thể tự động gán Chữ Hán chuẩn 1-1 theo giáo trình Marugoto. Đã chọn <b>{batchKanjiSelected.size}</b> từ để cập nhật.
              <div className="batch-kanji-note">
                Lịch sử và tiến độ ôn tập của từng từ được giữ nguyên sau khi cập nhật.
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
                          aria-label="Chọn tất cả gợi ý Chữ Hán"
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
                            aria-label={`Chọn gợi ý cho ${item.originalJp}`}
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
                          <b className="mapped-kanji">{renderJpDisplay(item.mappedJp)}</b>
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
        </DialogFrame>
      )}

      {/* 💾 Backup & Restore Modal */}
      {isBackupModalOpen && (
        <DialogFrame label="Sao lưu và khôi phục dữ liệu" busy={backupLoading} suspended={Boolean(confirmation)} onClose={() => setIsBackupModalOpen(false)} className="backup-modal-card">
            <div className="modal-header">
              <h3>Sao lưu và khôi phục dữ liệu</h3>
              <button
                type="button"
                className="close-btn"
                aria-label="Đóng sao lưu"
                disabled={backupLoading}
                onClick={() => setIsBackupModalOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="backup-modal-desc">
              Toàn bộ các bộ từ, từ vựng tự tạo, thẻ học FSRS và nhật ký ôn tập được lưu trữ cục bộ trên máy tính. Bạn có thể xuất file sao lưu JSON để lưu trữ hoặc chuyển sang máy khác.
            </p>

            <div className="backup-grid">
              <div className="backup-box">
                <h4>Xuất bản sao lưu</h4>
                <p>Tải từ vựng và tiến độ dưới dạng JSON. PDF gốc cần sao chép riêng khi chuyển máy.</p>
                <a
                  href={getBackupExportUrl()}
                  className="download-btn"
                  download
                  onClick={() => {
                    setBackupStatus({ type: 'success', message: 'Đang tải file sao lưu JSON về máy...' });
                  }}
                >
                  Tải xuống bản sao lưu (.json)
                </a>
              </div>

              <div className="backup-box">
                <h4>Khôi phục dữ liệu</h4>
                <p>Chọn file sao lưu JSON đã tải trước đó để khôi phục lại toàn bộ dữ liệu học tập.</p>
                {sessionActive && <p className="inline-warning">Kết thúc phiên học trước khi khôi phục dữ liệu.</p>}
                <div className="backup-restore-zone">
                  <label className="backup-file-picker-label">
                    <span>{backupLoading ? 'Đang khôi phục dữ liệu...' : 'Chọn file sao lưu (.json)'}</span>
                    <input
                      type="file"
                      aria-label="Chọn file sao lưu (.json)"
                      accept=".json,application/json"
                      disabled={backupLoading || sessionActive}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!await askConfirmation(`Khôi phục dữ liệu từ “${file.name}”? Các từ và tiến độ có trong file sẽ được cập nhật; các bộ khác vẫn được giữ. App tạo bản sao dữ liệu dự phòng trước khi khôi phục.`, 'Khôi phục', 'Khôi phục dữ liệu')) {
                          e.target.value = '';
                          return;
                        }
                        setBackupLoading(true);
                        setBackupStatus(null);
                        try {
                          const result = await importBackupFile(file);
                          setBackupStatus({ type: 'success', message: result.message || 'Khôi phục thành công!' });
                          setSelectedDeckId('all');
                          setQuizSession(null);
                          setQuizDone(false);
                          try {
                            await refreshDecks('all');
                            await loadCards('all');
                            await refreshDictionary();
                            const custom = await api('/api/study/cards?deckId=custom&mode=all');
                            setCustomCards(custom.cards || []);
                          } catch {
                            setBackupStatus({ type: 'success', message: 'Đã khôi phục dữ liệu. Chưa tải lại được danh sách; hãy tải lại trang.' });
                          }
                        } catch (err) {
                          setBackupStatus({ type: 'error', message: `Lỗi khôi phục: ${err.message}` });
                        } finally {
                          setBackupLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>

                  <div className="backup-safety-notice">
                    <Icon name="check"/>
                    <div>
                      <b>Bảo vệ dữ liệu:</b> Hệ thống luôn tự động tạo một file CSDL dự phòng (<code>.bak</code>) trước mỗi lần khôi phục.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {backupStatus && (
              <div className={`backup-result-box ${backupStatus.type}`}>
                {backupStatus.type === 'success' ? '✓ ' : '⚠️ '}
                {backupStatus.message}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={backupLoading}
                onClick={() => setIsBackupModalOpen(false)}
              >
                Đóng
              </button>
            </div>
        </DialogFrame>
      )}

      {confirmation && <DialogFrame label={confirmation.title} onClose={() => resolveConfirmation(false)} className="confirmation-dialog"><h2>{confirmation.title}</h2><p>{confirmation.description}</p><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => resolveConfirmation(false)}>Hủy</button><button type="button" className="button-primary" onClick={() => resolveConfirmation(true)}>{confirmation.confirmLabel}</button></div></DialogFrame>}
      <footer className="app-footer"><span>Marugoto · Học từng từ, nhớ lâu hơn</span><span>Tiến độ ôn FSRS · Dữ liệu trên máy này</span></footer>
    </div>
  );
}

const reactRoot = import.meta.hot?.data.reactRoot || createRoot(document.getElementById('root'));
reactRoot.render(<App />);
if (import.meta.hot) {
  import.meta.hot.data.reactRoot = reactRoot;
  import.meta.hot.accept();
}
