export const EXAM_FONTS = {
  'MS Mincho': '"MS Mincho", "Noto Serif JP", serif',
  'Yu Mincho': '"Yu Mincho", "Noto Serif JP", serif',
  'Noto Serif JP': '"Noto Serif JP", "MS Mincho", serif',
  'Yu Gothic': '"Yu Gothic", "Noto Sans JP", sans-serif',
  'Mặc định': 'system-ui, sans-serif',
};

export function displayPreferences(value = {}) {
  return {
    font: Object.hasOwn(EXAM_FONTS, value.font) ? value.font : 'MS Mincho',
    size: Math.max(16, Math.min(32, Number(value.size) || 20)),
    lineHeight: Math.max(1.5, Math.min(2.2, Number(value.lineHeight) || 1.8)),
    furigana: value.furigana === true,
  };
}

export function isAnswered(question, answer) {
  if (question.type === 'fill_blank') return question.blanks.every(b => typeof answer?.[b.id] === 'string' && answer[b.id].trim());
  return typeof answer === 'string' && Boolean(answer.trim());
}

export function remainingTime(deadline, now) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export async function examRequest(path, body, method = 'POST') {
  let response;
  for (let retry = 0; retry <= 15; retry++) {
    response = await fetch(path, body === undefined ? undefined : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (body !== undefined || response.status !== 503 || !response.headers.has('Retry-After') || retry === 15) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Lỗi máy chủ (${response.status}).`);
    error.status = response.status; throw error;
  }
  return data;
}

/** Serializes writes and retains edits made while an autosave is in flight. */
export class ExamSession {
  constructor({ request = examRequest, onChange = () => {}, storage = null, draftScope = '' } = {}) {
    this.request = request; this.onChange = onChange; this.storage = storage; this.draftScope = draftScope;
    this.attempt = null; this.answers = {}; this.flagged = []; this.currentQuestionId = null; this.dirty = false;
    this.error = ''; this.conflict = false; this.busy = false; this.saveStatus = 'saved';
    this.generation = 0; this.queue = Promise.resolve(); this.timer = null; this.offset = 0;
  }
  key() { return `marugoto_exam_draft_${this.attempt.id}${this.draftScope ? `_${this.draftScope}` : ''}`; }
  notify() { this.onChange(); }
  backupDraft() {
    try {
      if (!this.dirty) this.storage?.removeItem(this.key());
      else this.storage?.setItem(this.key(), JSON.stringify({ revision: this.attempt.revision, answers: this.answers, flagged: this.flagged, currentQuestionId: this.currentQuestionId }));
    } catch { /* A backend save still works when browser storage is unavailable. */ }
  }
  open(attempt) {
    clearTimeout(this.timer); this.attempt = attempt; this.answers = attempt.answers; this.flagged = attempt.flagged;
    this.currentQuestionId = attempt.currentQuestionId || attempt.document?.sections[0]?.questions[0]?.id || null;
    this.offset = attempt.serverNow - Date.now(); this.dirty = false; this.conflict = false; this.error = ''; this.expiredDraft = null; this.saveStatus = 'saved'; this.generation++;
    try {
      const draft = JSON.parse(this.storage?.getItem(this.key()) || 'null');
      if (draft && draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers)
          && Array.isArray(draft.flagged) && Number.isInteger(draft.revision) && attempt.status !== 'SUBMITTED') {
        const draftQuestion = draft.currentQuestionId || this.currentQuestionId;
        const changed = JSON.stringify(draft.answers) !== JSON.stringify(attempt.answers) || JSON.stringify(draft.flagged) !== JSON.stringify(attempt.flagged) || draftQuestion !== this.currentQuestionId;
        if (changed) {
          this.answers = draft.answers; this.flagged = draft.flagged; this.currentQuestionId = draftQuestion; this.dirty = true;
          this.conflict = draft.revision !== attempt.revision || attempt.status === 'PAUSED';
          this.saveStatus = this.conflict ? 'error' : 'pending';
          if (this.conflict) this.error = 'Có bản nháp tại tab này khác phiên bản trên máy chủ. Tải bản nháp trước khi dùng bản đã lưu.';
        }
      }
    } catch { /* Ignore invalid browser drafts. */ }
    this.backupDraft(); this.notify();
    if (this.dirty && !this.conflict && attempt.status === 'IN_PROGRESS') this.schedule();
  }
  edit(questionId, answer) {
    if (!this.attempt || this.busy || this.conflict || this.attempt.status !== 'IN_PROGRESS' || Object.hasOwn(this.attempt.results, questionId)) return;
    this.answers = { ...this.answers, [questionId]: answer }; this.changed();
  }
  toggleFlag(questionId) {
    if (this.busy || this.conflict || this.attempt.status !== 'IN_PROGRESS') return;
    this.flagged = this.flagged.includes(questionId) ? this.flagged.filter(id => id !== questionId) : [...this.flagged, questionId]; this.changed();
  }
  selectQuestion(questionId) {
    if (!this.attempt || this.busy || this.conflict || this.attempt.status === 'PAUSED' || questionId === this.currentQuestionId) return;
    this.currentQuestionId = questionId;
    if (this.attempt.status === 'IN_PROGRESS') this.changed(); else this.notify();
  }
  changed() { this.generation++; this.dirty = true; this.saveStatus = 'pending'; this.error = ''; this.backupDraft(); this.notify(); this.schedule(); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.save().catch(() => {}), 650); }
  enqueue(action) { this.queue = this.queue.catch(() => {}).then(action); return this.queue; }
  async sync(suffix, method) {
    if (this.conflict) throw new Error(this.error);
    const generation = this.generation;
    const payload = suffix === 'resume' ? { revision: this.attempt.revision }
      : { revision: this.attempt.revision, answers: this.answers, flagged: this.flagged,
          ...(this.currentQuestionId ? { currentQuestionId: this.currentQuestionId } : {}) };
    this.saveStatus = 'saving'; this.notify();
    try {
      const attempt = await this.request(`/api/exam-attempts/${this.attempt.id}/${suffix}`, payload, method);
      const lostOnExpiry = attempt.status === 'SUBMITTED' && JSON.stringify(this.answers) !== JSON.stringify(attempt.answers);
      if (lostOnExpiry) this.expiredDraft = { answers: this.answers, flagged: this.flagged };
      this.attempt = attempt; this.offset = attempt.serverNow - Date.now();
      if (generation === this.generation || attempt.status === 'SUBMITTED') {
        this.answers = attempt.answers; this.flagged = attempt.flagged; this.currentQuestionId = attempt.currentQuestionId || this.currentQuestionId; this.dirty = false;
      }
      this.error = lostOnExpiry ? 'Bài đã hết giờ. Kết quả dùng câu trả lời lưu trước hạn; bản gõ chưa lưu có thể tải xuống.' : '';
      this.saveStatus = this.dirty ? 'pending' : 'saved'; this.backupDraft(); this.notify();
      return attempt;
    } catch (error) {
      this.error = error.message; this.conflict = error.status === 409; this.saveStatus = 'error'; this.backupDraft(); this.notify(); throw error;
    }
  }
  save() {
    clearTimeout(this.timer);
    return this.enqueue(() => this.dirty && this.attempt?.status === 'IN_PROGRESS' ? this.sync('answers', 'PUT') : this.attempt);
  }
  action(suffix) {
    clearTimeout(this.timer); this.busy = true; this.notify();
    return this.enqueue(() => this.sync(suffix, 'POST')).finally(() => { this.busy = false; this.notify(); });
  }
  check(questionId) { return this.action(`questions/${questionId}/check`); }
  submit() { return this.action('submit'); }
  pause() {
    return this.action('pause').catch(error => {
      if (!this.conflict && this.attempt?.status === 'IN_PROGRESS') {
        this.error = `Chưa tạm dừng: ${error.message} Đồng hồ vẫn đang chạy.`; this.notify();
      }
      throw error;
    });
  }
  resume() { return this.action('resume'); }
  async refresh() {
    return this.enqueue(async () => {
      const attempt = await this.request(`/api/exam-attempts/${this.attempt.id}`);
      // Explicit reload is the only path that discards a conflicting local draft.
      try { this.storage?.removeItem(this.key()); } catch {}
      this.open(attempt); return attempt;
    });
  }
  async pollExpiry() {
    return this.enqueue(async () => {
      const attempt = await this.request(`/api/exam-attempts/${this.attempt.id}`);
      if (attempt.status === 'PAUSED') {
        this.open(attempt);
      } else if (attempt.status === 'SUBMITTED') {
        const expiredDraft = this.dirty ? { answers: this.answers, flagged: this.flagged } : null;
        this.open(attempt);
        this.expiredDraft = expiredDraft;
        if (this.expiredDraft) { this.error = 'Bài đã hết giờ. Kết quả dùng câu trả lời lưu trước hạn; bản gõ chưa lưu có thể tải xuống.'; this.notify(); }
      }
      return attempt;
    });
  }
}
