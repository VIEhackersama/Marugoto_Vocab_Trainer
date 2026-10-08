import React from 'react';
import { parseKanjiReading } from '../kanji.js';
import { removeDiacritics } from '../dictionary.js';

export function Highlight({ text = '', query = '' }) {
  const value = String(text);
  const search = removeDiacritics(query.trim());
  const index = search ? removeDiacritics(value).indexOf(search) : -1;
  if (index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark>{value.slice(index, index + query.trim().length)}</mark>
      {value.slice(index + query.trim().length)}
    </>
  );
}

export function JapaneseTerm({ text, query = '' }) {
  const parsed = parseKanjiReading(text || '');
  return (
    <span className="vocab-japanese" lang="ja">
      {parsed.hasKanji && parsed.reading ? (
        <ruby>
          <Highlight text={parsed.kanji} query={query} />
          <rp>（</rp>
          <rt>
            <Highlight text={parsed.reading} query={query} />
          </rt>
          <rp>）</rp>
        </ruby>
      ) : (
        <Highlight text={text} query={query} />
      )}
    </span>
  );
}
