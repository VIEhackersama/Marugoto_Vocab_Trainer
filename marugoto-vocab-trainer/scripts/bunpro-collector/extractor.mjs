export const EXTRACTOR_VERSION = 'bunpro-dom-2-no-audio';

// Kept self-contained so the identical extractor runs in Chromium and fixture tests.
export function extractLesson({ kind, version }) {
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden],[aria-hidden="true"]'));
  const clean = value => (value || '').replace(/\u00a0/g, ' ').trim();
  const plain = element => {
    if (!element) return '';
    const copy = element.cloneNode(true);
    copy.querySelectorAll('rt,rp,button,svg,script,style,[aria-hidden="true"]').forEach(e => e.remove());
    return clean(copy.textContent);
  };
  const safeHtml = element => {
    const copy = element.cloneNode(true);
    const allowed = new Set(['DIV','SECTION','HEADER','H1','H2','H3','H4','H5','P','SPAN','STRONG','EM','B','I','UL','OL','LI','BR','RUBY','RT','RP','TABLE','TBODY','TR','TD','TH','BLOCKQUOTE','A']);
    const prune = (original, clone) => {
      const clonedChildren = [...clone.children];
      [...original.children].forEach((child, index) => {
        const clonedChild = clonedChildren[index];
        if (clonedChild) prune(child, clonedChild);
      });
      if (!allowed.has(original.tagName) || !official(original) || (!visible(original) && !['RT','RP'].includes(original.tagName))) { clone.remove(); return; }
      for (const attribute of [...clone.attributes]) clone.removeAttribute(attribute.name);
    };
    prune(element, copy);
    return copy.outerHTML;
  };
  const sectionFor = id => document.getElementById(id)?.closest('section');
  const header = document.querySelector('#js-rev-header h1');
  const titleNode = header?.querySelector('.bp-ddw') || header?.firstElementChild;
  const title = plain(titleNode || header);
  const meaning = plain(header?.lastElementChild !== titleNode ? header?.lastElementChild : null);
  const structureRoot = document.getElementById('js-struct-details');
  const about = sectionFor('about');
  const examplesSection = sectionFor('examples');
  const roots = [structureRoot, about, examplesSection].filter(Boolean);
  // Exclude user-authored self-study, discussions, and account/progress controls.
  const excluded = element => Boolean(element.closest('[id^="discourse-"],[id^="self-study"],#discussion'));
  const official = element => {
    if (excluded(element)) return false;
    if (examplesSection?.contains(element)) {
      const marker = examplesSection.querySelector('#self-study');
      if (marker && (marker.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    }
    return true;
  };
  const examples = [];
  const seen = new Map();
  let observed = 0;
  for (const root of roots) {
    for (const element of root.querySelectorAll('[id^="study-question-"]')) {
      if (!visible(element) || !official(element)) continue;
      observed++;
      const japanese = element.querySelector('p.bp-ddw') || element.querySelector('[data-force-furigana]');
      const translation = element.querySelector('p.bp-sdw');
      const sentence = plain(japanese);
      const translated = plain(translation);
      const type = root === about ? 'explanation' : 'examples';
      const identity = `${element.id}\n${sentence}\n${translated}`;
      if (seen.has(identity)) { seen.get(identity).occurrences.push({ type }); continue; }
      const furigana = [...(japanese?.querySelectorAll('ruby') || [])].map(ruby => ({ text: plain(ruby), reading: clean(ruby.querySelector('rt')?.textContent) }));
      let reading = null;
      if (japanese && furigana.length) {
        const copy = japanese.cloneNode(true);
        copy.querySelectorAll('ruby').forEach(ruby => ruby.replaceWith(ruby.querySelector('rt')?.textContent || plain(ruby)));
        reading = clean(copy.textContent);
      }
      const precedingHeading = root === about ? [...root.querySelectorAll('h3,h4')].filter(h => h.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1) : null;
      const example = { sourceId: element.id, sentence, reading, furigana, translation: translated,
        notes: precedingHeading ? plain(precedingHeading) : null, type, occurrences: [{ type }] };
      seen.set(identity, example); examples.push(example);
    }
  }
  const sections = [];
  const addSection = (name, element) => {
    if (!visible(element)) return;
    const clone = element.cloneNode(true);
    // Build content from visible source elements rather than hidden premium sentences.
    const scrub = (original, copy) => {
      const originals = [...original.children], copies = [...copy.children];
      originals.forEach((child, index) => {
        if (!visible(child) && !['RT','RP'].includes(child.tagName) || !official(child) || ['BUTTON','SVG','SCRIPT','STYLE','INPUT','IFRAME'].includes(child.tagName)) copies[index]?.remove();
        else if (copies[index]) scrub(child, copies[index]);
      });
    };
    scrub(element, clone);
    clone.querySelectorAll('rt,rp').forEach(e => e.remove());
    // safeHtml below additionally strips all attributes and executable markup.
    sections.push({ name, text: clean(clone.textContent), html: safeHtml(element) });
  };
  // For Examples, snapshot only heading and the official example list; never self-study.
  addSection('header', header);
  addSection('details', structureRoot);
  if (kind === 'VOCAB') {
    const definition = [...(structureRoot?.querySelectorAll('h2') || [])].find(e => /Dictionary Definition/i.test(e.textContent));
    addSection('dictionary-definition', definition?.closest('section'));
  }
  addSection('about', about);
  if (examplesSection) {
    const heading = document.getElementById('examples'); addSection('examples-heading', heading);
    for (const child of examplesSection.children) {
      if (child.querySelector?.('[id^="study-question-"]') && official(child.querySelector('[id^="study-question-"]'))) addSection('examples', child);
    }
  }
  const issues = [];
  if (!title) issues.push('Thiếu tiêu đề từ trang nguồn.');
  if (!meaning) issues.push('Thiếu nghĩa gốc.');
  if (!examplesSection) issues.push('Không nhận diện được vùng Examples.');
  if (!examples.length) issues.push('Chưa lấy được ví dụ nào.');
  if (examples.some(e => !e.sentence || !e.translation)) issues.push('Có ví dụ thiếu câu hoặc bản dịch.');
  const structure = plain(sectionFor('structure'));
  if (kind === 'GRAMMAR' && (!structure || !about)) issues.push('Thiếu cấu trúc hoặc giải thích ngữ pháp.');
  issues.push('Cần đối chiếu số ví dụ và nội dung với trang nguồn trước khi xác nhận đầy đủ.');
  return { extractorVersion: version, sourceUrl: location.href, capturedAt: new Date().toISOString(), title, meaning,
    dictionaryDefinition: sections.find(e => e.name === 'dictionary-definition')?.text || null,
    reading: titleNode ? [...titleNode.querySelectorAll('rt')].map(e => clean(e.textContent)).join('') || null : null,
    structure, explanation: sections.find(e => e.name === 'about')?.text || sections.find(e => e.name === 'details')?.text || '',
    sections, examples, observedExampleCount: observed, exampleCount: examples.length, issues,
    completeness: 'NEEDS_REVIEW', restricted: Boolean(examplesSection && /Get more example sentences|Premium users get access/.test(examplesSection.innerText)) };
}
