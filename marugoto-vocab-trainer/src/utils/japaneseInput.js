import { extractReading, toHiragana, removeDiacritics } from '../dictionary.js';

// Table mapping romaji sequences to Hiragana.
// Longer patterns come first in matching.
const ROMAJI_TO_HIRAGANA = [
  // 3-letter combinations
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'],
  ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'],
  ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['zya', 'じゃ'], ['zyu', 'じゅ'], ['zyo', 'じょ'],
  ['tsu', 'つ'],

  // 2-letter combinations
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
  ['sa', 'さ'], ['si', 'し'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['ta', 'た'], ['ti', 'ち'], ['tu', 'つ'], ['te', 'て'], ['to', 'と'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
  ['ha', 'は'], ['hi', 'ひ'], ['hu', 'ふ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
  ['wa', 'わ'], ['wo', 'を'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['za', 'ざ'], ['zi', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['da', 'だ'], ['di', 'ぢ'], ['du', 'づ'], ['de', 'de'], ['do', 'ど'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  ['shi', 'し'], ['chi', 'ち'], ['fu', 'ふ'],
  ['ja', 'じゃ'], ['ji', 'じ'], ['ju', 'じゅ'], ['jo', 'じょ'],
  ['fa', 'ふぁ'], ['fi', 'ふぃ'], ['fe', 'ふぇ'], ['fo', 'ふぉ'],
  ['nn', 'ん'], ["n'", 'ん'],

  // 1-letter vowels
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
  ['-', 'ー']
];

/**
 * Converts romaji input string to Hiragana.
 * Handles sokuon (double consonants like 'tt' -> 'っt') and 'n' before consonants/end.
 * Non-romaji characters (kanji, kana, punctuation, digits) are preserved.
 */
export function romajiToHiragana(text, { isFinal = false } = {}) {
  if (!text) return '';
  let str = text;
  let result = '';
  let i = 0;

  while (i < str.length) {
    const remaining = str.slice(i);
    const lowerRemaining = remaining.toLowerCase();

    // Check double consonants (sokuon) e.g., 'kk', 'tt', 'pp', 'ss', 'cch'
    if (
      remaining.length >= 2 &&
      /[bcdfghjklmpqrstvwxyz]/i.test(remaining[0]) &&
      remaining[0].toLowerCase() !== 'n'
    ) {
      if (
        remaining[0].toLowerCase() === remaining[1].toLowerCase() ||
        (remaining[0].toLowerCase() === 't' && remaining[1].toLowerCase() === 'c')
      ) {
        result += 'っ';
        i += 1;
        continue;
      }
    }

    // Check 'n' before consonants (except y) or punctuation/whitespace/non-alphabetic
    if (lowerRemaining[0] === 'n') {
      if (lowerRemaining.length === 1) {
        if (isFinal) {
          result += 'ん';
          i += 1;
          continue;
        }
      } else {
        const nextChar = lowerRemaining[1];
        if (nextChar === "'" || nextChar === 'n') {
          result += 'ん';
          i += 2;
          continue;
        }
        if (!/[aiueoy]/i.test(nextChar) && /[bcdfghjklmpqrstvwxyz]/i.test(nextChar)) {
          result += 'ん';
          i += 1;
          continue;
        }
        if (!/[a-z]/i.test(nextChar)) {
          result += 'ん';
          i += 1;
          continue;
        }
      }
    }

    // Lookup matching romaji pattern
    let matched = false;
    for (const [pattern, kana] of ROMAJI_TO_HIRAGANA) {
      if (lowerRemaining.startsWith(pattern)) {
        result += kana;
        i += pattern.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Pass-through current char
      result += remaining[0];
      i += 1;
    }
  }

  return result;
}

/**
 * Normalizes Japanese text for comparison:
 * - Converts Katakana to Hiragana
 * - Removes whitespace and punctuation marks
 */
export function normalizeJp(str) {
  if (!str) return '';
  return toHiragana(str)
    .replace(/[\s\(\)（）\[\]【】～~・\.\,\!\?ー\-—]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normalizes Vietnamese text for lenient comparison:
 * - Strips diacritics
 * - Removes punctuation and collapses whitespace
 */
export function normalizeVi(str) {
  if (!str) return '';
  return removeDiacritics(str)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts possible acceptable Japanese answers from a card.
 */
export function getAcceptableJapaneseAnswers(card) {
  if (!card) return [];
  const answers = new Set();

  const add = (val) => {
    if (!val) return;
    const clean = val.trim();
    if (clean) {
      answers.add(clean);
      answers.add(clean.toLowerCase());
      answers.add(normalizeJp(clean));
    }
  };

  const jp = card.jp || '';
  add(jp);

  // Extract kana reading
  const reading = extractReading(card);
  if (reading) {
    add(reading);
  }

  // Inside parentheses: e.g. 学生（がくせい） -> がくせい
  const parenMatch = jp.match(/[\(（]([^\)）]+)[\)）]/);
  if (parenMatch) {
    add(parenMatch[1]);
  }

  // Before parentheses: e.g. 学生（がくせい） -> 学生, or がくせい（学生） -> がくせい
  const beforeParen = jp.split(/[\(（]/)[0];
  if (beforeParen) {
    add(beforeParen);
  }

  // Pure kanji if present
  const kanjiOnly = (jp.match(/[\u4e00-\u9faf]/g) || []).join('');
  if (kanjiOnly) {
    add(kanjiOnly);
  }

  // Romaji
  if (card.romaji) {
    add(card.romaji);
    const convertedRomaji = romajiToHiragana(card.romaji, { isFinal: true });
    add(convertedRomaji);
  }

  return Array.from(answers).filter(Boolean);
}

/**
 * Checks a user's typed answer against a study card.
 * @param {string} input - User typed input
 * @param {object} card - The card object ({ jp, vi, romaji })
 * @param {string} direction - 'JP' (prompt was VI, answer is JP) or 'VI' (prompt was JP, answer is VI)
 * @returns {{ isCorrect: boolean, expected: string, normalizedInput: string }}
 */
export function checkTypedAnswer(input, card, direction = 'JP') {
  if (!card) return { isCorrect: false, expected: '', normalizedInput: '' };
  const rawInput = (input || '').trim();

  if (direction === 'JP') {
    const expected = card.jp || '';
    if (!rawInput) return { isCorrect: false, expected, normalizedInput: '' };

    const inputHiragana = romajiToHiragana(rawInput, { isFinal: true });
    const normInputRaw = normalizeJp(rawInput);
    const normInputKana = normalizeJp(inputHiragana);
    const acceptable = getAcceptableJapaneseAnswers(card);

    const normAcceptable = new Set(acceptable.map(normalizeJp));

    // Direct string match against raw or converted input
    const isCorrect =
      acceptable.includes(rawInput) ||
      acceptable.includes(rawInput.toLowerCase()) ||
      acceptable.includes(inputHiragana) ||
      normAcceptable.has(normInputRaw) ||
      normAcceptable.has(normInputKana);

    return {
      isCorrect,
      expected,
      normalizedInput: inputHiragana || rawInput
    };
  }

  // Direction: 'VI' (User typing Vietnamese)
  const expected = card.vi || '';
  if (!rawInput) return { isCorrect: false, expected, normalizedInput: '' };

  const normInput = normalizeVi(rawInput);
  if (!normInput) return { isCorrect: false, expected, normalizedInput: '' };

  // Split Vietnamese definitions by '/', ',', ';', '\n'
  const viDefinitions = expected
    .split(/[\/,;\n\(\)（）]+/)
    .map(s => normalizeVi(s))
    .filter(Boolean);

  const fullNormVi = normalizeVi(expected);

  const isCorrect =
    normInput === fullNormVi ||
    viDefinitions.includes(normInput) ||
    viDefinitions.some(def => def === normInput || (normInput.length >= 3 && def.includes(normInput)));

  return {
    isCorrect,
    expected,
    normalizedInput: normInput
  };
}
