export const LEARNING_LABELS = { NEW: 'Chưa học', LEARNING: 'Đang học', DUE: 'Đến hạn' };
export const CONTENT_LABELS = { MISSING: 'Thiếu bản Việt', DRAFT: 'Cần kiểm tra', VERIFIED: 'Đã kiểm tra' };
export function searchKey(value) {
  return String(value || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
}
export function filterCatalog(entries, { search = '', lesson = 'all', state = 'all' }) {
  const query = searchKey(search);
  return entries.filter(e => (lesson === 'all' || String(e.lesson) === lesson) &&
    (state === 'all' || (state === 'incomplete' ? !contentReady(e.content, e.kind) : e.learningStatus === state)) &&
    (!query || searchKey([e.content.title, e.content.reading, e.content.romaji, e.content.meaningVi, e.content.meaningEn].join(' ')).includes(query)));
}
export function sentenceReady(s) {
  return Boolean(s?.status === 'VERIFIED' && s.id && s.prompt?.split('{{blank}}').length === 2 && s.answers?.length > 0 &&
    s.answers.every(a => a?.trim()) && s.answers.some(a => s.prompt.replace('{{blank}}', a).trim() === s.sentence?.trim()) &&
    s.reading?.trim() && s.translationVi?.trim() && s.explanationVi?.trim());
}
export function contentReady(c, kind = 'VOCAB') {
  return c?.status === 'VERIFIED' && Boolean(c.meaningVi?.trim()) && (kind !== 'GRAMMAR' ||
    Boolean(c.structure?.trim() && c.explanationVi?.trim() && c.sentences?.some(sentenceReady)));
}
export function sentencePrompt(prompt) { return String(prompt || '').split('{{blank}}'); }
export function isImeInput(event, composing = false) {
  return composing || Boolean(event?.isComposing) || event?.keyCode === 229;
}
