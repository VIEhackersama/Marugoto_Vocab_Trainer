import { searchKey } from './bunpro.js';

export const TIERS = ['BEGINNER', 'ADEPT', 'SEASONED', 'EXPERT', 'MASTER'];
export const TIER_LABELS = { BEGINNER: 'Beginner', ADEPT: 'Adept', SEASONED: 'Seasoned', EXPERT: 'Expert', MASTER: 'Master', NEW: 'Chưa học' };
export const POS_LABELS = {
  NOUN: 'Danh từ', PRONOUN: 'Đại từ', I_ADJECTIVE: 'Tính từ i', NA_ADJECTIVE: 'Tính từ na', NO_ADJECTIVE: 'Tính từ no',
  ICHIDAN: 'Động từ ichidan', GODAN: 'Động từ godan', SURU: 'Động từ suru', KURU: 'Động từ kuru',
  TRANSITIVE: 'Tha động từ', INTRANSITIVE: 'Tự động từ', ADVERB: 'Trạng từ', EXPRESSION: 'Cụm diễn đạt',
  INTERJECTION: 'Thán từ', CONJUNCTION: 'Liên từ', COUNTER: 'Từ đếm', PREFIX: 'Tiền tố', SUFFIX: 'Hậu tố',
  AUXILIARY_VERB: 'Trợ động từ', PRENOMINAL: 'Định ngữ', PARTICLE: 'Trợ từ',
};
export function filterVocab(entries, { search = '', lesson = 'all', tier = 'all', pos = 'all', state = 'all' }) {
  const query = searchKey(search);
  return entries.filter(e => (lesson === 'all' || String(e.lesson) === lesson) &&
    (tier === 'all' || (e.tier || 'NEW') === tier) && (pos === 'all' || (pos === 'unknown' ? !e.partsOfSpeech?.length : e.partsOfSpeech?.includes(pos))) &&
    (state === 'all' || (state === 'incomplete' ? e.content.status !== 'VERIFIED' || e.completeness === 'NEEDS_REVIEW' : e.learningStatus === state)) &&
    (!query || searchKey([e.content.title, e.content.reading, e.content.meaningVi, e.content.meaningEn, e.content.romaji, e.content.structure, e.content.explanationVi].join(' ')).includes(query)));
}
export function validIntervals(days) {
  return days.length === 5 && days.every((day, i) => Number.isInteger(day) && day > 0 && day <= 36500 && (!i || day > days[i - 1]));
}
export function sourceLabel(value) {
  return value === 'REVIEWED' ? 'Đã đối chiếu nguồn' : value ? 'Nguồn cần đối chiếu' : 'Chưa nhập nguồn chi tiết';
}
