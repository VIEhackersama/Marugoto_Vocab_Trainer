import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export function normalizeText(s) {
  return (s || '').normalize('NFKC').replace(/[\u3000\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isJapanese(s) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s || '');
}

export function isRomaji(s) {
  const letters = (s || '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters.length / Math.max((s || '').length, 1) > 0.55;
}

export function cleanLine(s) {
  return normalizeText(s).replace(/^[•·–—]+\s*/, '');
}

export async function extractPdfPages(file) {
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

export function parseVocabulary(pages) {
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
