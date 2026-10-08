import { findDuplicates, toHiragana } from '../dictionary.js';
import { formatKanjiTerm, parseKanjiReading } from '../kanji.js';
import { romajiToHiragana } from './japaneseInput.js';

const syllables = Object.fromEntries(
  [
    ['あいうえお', ['a', 'i', 'u', 'e', 'o']],
    ['かきくけこ', ['ka', 'ki', 'ku', 'ke', 'ko']],
    ['さしすせそ', ['sa', 'shi', 'su', 'se', 'so']],
    ['たちつてと', ['ta', 'chi', 'tsu', 'te', 'to']],
    ['なにぬねの', ['na', 'ni', 'nu', 'ne', 'no']],
    ['はひふへほ', ['ha', 'hi', 'fu', 'he', 'ho']],
    ['まみむめも', ['ma', 'mi', 'mu', 'me', 'mo']],
    ['やゆよ', ['ya', 'yu', 'yo']],
    ['らりるれろ', ['ra', 'ri', 'ru', 're', 'ro']],
    ['わゐゑを', ['wa', 'wi', 'we', 'wo']],
    ['がぎぐげご', ['ga', 'gi', 'gu', 'ge', 'go']],
    ['ざじずぜぞ', ['za', 'ji', 'zu', 'ze', 'zo']],
    ['だぢづでど', ['da', 'ji', 'zu', 'de', 'do']],
    ['ばびぶべぼ', ['ba', 'bi', 'bu', 'be', 'bo']],
    ['ぱぴぷぺぽ', ['pa', 'pi', 'pu', 'pe', 'po']],
    [
      'ぁぃぅぇぉゃゅょゎゔ',
      ['a', 'i', 'u', 'e', 'o', 'ya', 'yu', 'yo', 'wa', 'vu'],
    ],
  ].flatMap(([kana, values]) => [...kana].map((char, i) => [char, values[i]])),
);

const pairs = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  ぢゃ: 'ja',
  ぢゅ: 'ju',
  ぢょ: 'jo',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  ふゅ: 'fyu',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  ゔゅ: 'vyu',
  てぃ: 'ti',
  でぃ: 'di',
  とぅ: 'tu',
  どぅ: 'du',
  てゅ: 'tyu',
  でゅ: 'dyu',
  しぇ: 'she',
  じぇ: 'je',
  ちぇ: 'che',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  つぁ: 'tsa',
  つぃ: 'tsi',
  つぇ: 'tse',
  つぉ: 'tso',
  くぁ: 'kwa',
  くぃ: 'kwi',
  くぇ: 'kwe',
  くぉ: 'kwo',
};

// Long vowels stay explicit (こう -> kou; コー -> koo). Users can edit the result.
// Unknown characters return no suggestion instead of guessing a Kanji reading.
export function kanaToRomaji(value = '') {
  const kana = toHiragana(value.normalize('NFKC'));
  let result = '';
  for (let i = 0; i < kana.length; i++) {
    const char = kana[i];
    const pair = pairs[kana.slice(i, i + 2)];
    if (pair) {
      result += pair;
      i++;
      continue;
    }
    if (char === 'っ') {
      const next = pairs[kana.slice(i + 1, i + 3)] || syllables[kana[i + 1]];
      if (!next || /^[aeiou]/.test(next)) return '';
      result += next.startsWith('ch') ? 't' : next[0];
    } else if (char === 'ん') {
      const next =
        pairs[kana.slice(i + 1, i + 3)] || syllables[kana[i + 1]] || '';
      result += /^[aeiouy]/.test(next) ? "n'" : 'n';
    } else if (char === 'ー') {
      const vowel = result.match(/[aeiou]$/)?.[0];
      if (!vowel) return '';
      result += vowel;
    } else if (syllables[char]) {
      result += syllables[char];
    } else if (/[\s・〜～~.,!?()（）\-]/.test(char)) {
      result += char === '・' ? ' ' : char;
    } else {
      return '';
    }
  }
  return result;
}

export function createVocabularyDraft(card) {
  const parsed = parseKanjiReading(card?.jp || '');
  return {
    spelling: parsed.hasKanji ? parsed.kanji : '',
    reading: parsed.hasKanji ? parsed.reading : card?.jp || '',
    romaji: card?.romaji || '',
    meaning: card?.vi || '',
  };
}

export function finalizeVocabularyDraft(draft) {
  return {
    spelling: draft.spelling.trim(),
    reading: romajiToHiragana(draft.reading.trim(), { isFinal: true }),
    romaji: draft.romaji.trim(),
    meaning: draft.meaning.trim(),
  };
}

export function vocabularyDraftToInput(draft) {
  const clean = finalizeVocabularyDraft(draft);
  return {
    jp: formatKanjiTerm(clean.spelling, clean.reading, 'ruby'),
    romaji: clean.romaji,
    vi: clean.meaning,
  };
}

export function validateVocabularyDraft(draft, originalCard = null) {
  const clean = finalizeVocabularyDraft(draft);
  const errors = {};
  const original = createVocabularyDraft(originalCard);
  if (
    !clean.reading &&
    !(originalCard && original.spelling && !original.reading && clean.spelling)
  ) {
    errors.reading = 'Nhập cách đọc Kana để lưu đầy đủ cách phát âm.';
  } else if (
    clean.reading &&
    !/^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・〜～~.,!?()（）\-]+$/u.test(
      clean.reading,
    ) &&
    !(originalCard && clean.reading === original.reading)
  ) {
    errors.reading =
      'Dùng Hiragana hoặc Katakana; bạn cũng có thể gõ Romaji để chuyển sang Hiragana.';
  }
  if (!clean.spelling && !clean.reading)
    errors.reading = 'Nhập từ và cách đọc trước khi lưu.';
  if (!clean.meaning) errors.meaning = 'Nhập nghĩa tiếng Việt.';
  return errors;
}

export function findVocabularyConflict(draft, cards, originalCard = null) {
  const candidate = vocabularyDraftToInput(draft);
  const existing = cards.filter((card) => card.id !== originalCard?.id);
  return findDuplicates([candidate], existing).duplicates[0] || null;
}
