const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const labels = { IDLE:'Sẵn sàng', RUNNING:'Đang thu thập', PAUSED:'Đã tạm dừng', AWAITING_USER:'Cần bạn xử lý', COMPLETED:'Đã kết thúc lượt', QUEUED:'Đang chờ', CAPTURED:'Đã lấy', FAILED:'Lỗi' };
let state, selected, lastReceived = 0, detailKey = '', polling = false, pendingAction = false, queuePage = 0;
async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options?.method ? 40_000 : 5_000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không kết nối được worker.'); return result;
}
function message(text, error = false) { $('#message').textContent = text; $('#message').classList.toggle('error', error); }
function renderItems() {
  if (!state) return;
  const filter = $('#filter').value;
  const query = $('#search').value.trim().toLocaleLowerCase();
  const matches = state.items.filter(item => (!query || item.title.toLocaleLowerCase().includes(query)) && (filter === 'all' || item.kind === filter || item.status === filter || filter === 'review' && item.status === 'CAPTURED' && item.completeness !== 'REVIEWED'));
  const pages = Math.max(1, Math.ceil(matches.length / 50)); queuePage = Math.min(queuePage, pages - 1);
  $('#page-label').textContent = `${matches.length} mục · Trang ${queuePage + 1}/${pages}`;
  $('#previous-page').disabled = queuePage === 0; $('#next-page').disabled = queuePage === pages - 1;
  $('#items').innerHTML = matches.slice(queuePage * 50, (queuePage + 1) * 50).map(item => `<button class="item ${item.id === selected ? 'selected' : ''}" data-id="${item.id}"><div class="item-meta"><span>${item.kind === 'GRAMMAR' ? 'Ngữ pháp' : 'Từ vựng'} · Lesson ${item.lesson}</span><span class="badge ${item.status === 'FAILED' ? 'failed' : ''}">${escape(item.retryAt ? "Chờ tự thử lại" : labels[item.status])}</span></div><div class="item-title">${escape(item.title)}</div><div class="item-meta"><span>${item.exampleCount} ví dụ${item.status === 'CAPTURED' ? item.completeness === 'REVIEWED' ? ' · Đã đối chiếu' : ' · Cần đối chiếu' : ''}</span><span>${item.attempts}/3 lượt thử${item.retryAt ? ` · ${escape(new Date(item.retryAt).toLocaleTimeString("vi-VN"))}` : ""}</span></div></button>`).join('') || '<p class="empty">Không có mục phù hợp.</p>';
}
function ruby(example) {
  // Retain the original sentence; reading is shown separately when boundaries are ambiguous.
  return escape(example.sentence);
}
async function renderDetail(force = false) {
  if (!selected) return;
  const item = state.items.find(e => e.id === selected);
  const key = JSON.stringify([state.id, selected, item.status, item.completeness, item.error, item.attempts]);
  if (!force && key === detailKey) return;
  const selection = selected;
  const { result } = await request(`/api/items/${selection}`);
  if (selection !== selected) return;
  detailKey = key;
  const sourceUrl = item.sourceUrl;
  let content = `<h2>${escape(result?.title || item.title)}</h2><a href="${escape(sourceUrl)}" target="_blank" rel="noreferrer">Mở trang nguồn Bunpro</a><p>${escape(item.error || (result ? result.meaning : 'Chưa có dữ liệu.'))}</p>`;
  if (result) {
    content += `<small>Lấy lúc ${escape(new Date(result.capturedAt).toLocaleString('vi-VN'))} · ${escape(result.extractorVersion)}</small><div><button class="review-button" data-review="${item.completeness === 'REVIEWED' ? 'unreview' : 'review'}">${item.completeness === 'REVIEWED' ? 'Bỏ xác nhận đối chiếu' : 'Tôi đã đối chiếu đầy đủ với nguồn'}</button></div><ul class="issues">${result.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>`;
    if (result.dictionaryDefinition) content += `<h3>Nghĩa đầy đủ từ nguồn</h3><div class="source-text">${escape(result.dictionaryDefinition)}</div>`;
    if (result.structure) content += `<h3>Cấu trúc</h3><p>${escape(result.structure)}</p>`;
    content += `<h3>Ví dụ · ${result.examples.length}</h3><ol class="examples">${result.examples.map((example, index) => `<li class="example"><small>${index + 1} · ${escape(example.type)} · ${escape(example.sourceId)}</small><p class="japanese" lang="ja">${ruby(example)}</p>${example.reading ? `<small lang="ja">${escape(example.reading)}</small>` : ''}<p class="translation">${escape(example.translation)}</p>${example.notes ? `<p>${escape(example.notes)}</p>` : ''}${example.furigana.length ? `<details><summary>Furigana</summary><p>${example.furigana.map(f => `${escape(f.text)}【${escape(f.reading)}】`).join(' · ')}</p></details>` : ''}</li>`).join('')}</ol>`;
    content += `<details><summary>Nội dung nguồn và ghi chú</summary>${result.sections.map(section => `<h3>${escape(section.name)}</h3><div class="source-text">${escape(section.text)}</div>`).join('')}<a href="/api/items/${item.id}/artifacts/source.json" target="_blank">Xem bản nguồn JSON</a></details><details class="screenshots"><summary>Ảnh đối chiếu · ${result.screenshots.length}</summary>${result.screenshots.map(file => `<a href="/api/items/${item.id}/artifacts/${file}" target="_blank">${escape(file)}</a><img src="/api/items/${item.id}/artifacts/${file}" alt="Ảnh vùng bài học ${escape(file)}" loading="lazy">`).join('')}</details>`;
  }
  $('#detail').innerHTML = content;
}
async function poll() {
  if (polling) return; polling = true;
  try {
    state = await request('/api/status'); lastReceived = Date.now();
    $('#connection').textContent = 'Worker kết nối'; $('#connection').classList.remove('offline');
    $('#heartbeat').textContent = `Nhận tiến độ: ${new Date(lastReceived).toLocaleTimeString('vi-VN')}`;
    $('#run-status').textContent = state.verificationBusy ? 'Đang đối chiếu 4 trang nguồn' : `${labels[state.status]} · ${state.workerConcurrency || 1} worker`;
    const finished = state.counts.captured + state.counts.failed;
    $('#progress').max = state.counts.total; $('#progress').value = finished;
    $('#progress-text').textContent = `${finished} / ${state.counts.total}`;
    $('#counts').innerHTML = [['Đã lấy',state.counts.captured],['Đang chạy',state.counts.running],['Cần đối chiếu',state.counts.needsReview],['Lỗi',state.counts.failed],['Ví dụ',state.counts.examples]].map(([label,count]) => `<span><b>${count}</b>${label}</span>`).join('');
    $('#reason').textContent = state.reason || ''; $('#run-id').textContent = state.id;
    for (const button of document.querySelectorAll('[data-action]')) {
      const action = button.dataset.action;
      button.disabled = pendingAction || state.verificationBusy || (action === 'pause' ? !state.workerBusy : ['login','new','full-vocab','retry','resume','workers/1','workers/2'].includes(action) ? state.workerBusy : action === 'start' ? state.workerBusy || state.status === 'COMPLETED' : false);
    }
    renderItems(); await renderDetail();
  } catch (error) {
    $('#connection').textContent = 'Mất kết nối worker'; $('#connection').classList.add('offline');
    $('#heartbeat').textContent = lastReceived ? `Lần cuối: ${new Date(lastReceived).toLocaleTimeString('vi-VN')} · Tiến độ bên dưới có thể đã cũ` : 'Chưa nhận được tiến độ';
    for (const button of document.querySelectorAll('[data-action]')) button.disabled = true;
  } finally { polling = false; }
}
$('.toolbar').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  button.disabled = true; pendingAction = true;
  try { const result = await request(`/api/${button.dataset.action}`, { method: 'POST' }); message(result.message); if (['new','full-vocab'].includes(button.dataset.action)) { selected = null; detailKey = ''; queuePage = 0; $('#detail').innerHTML = '<p class="empty">Chọn một mục để xem nội dung.</p>'; } }
  catch (error) { message(error.message, true); } finally { pendingAction = false; await poll(); }
});
$('#items').addEventListener('click', async event => { const button = event.target.closest('[data-id]'); if (!button) return; selected = button.dataset.id; renderItems(); try { await renderDetail(true); } catch (error) { message(error.message, true); } });
$('#detail').addEventListener('click', async event => { const button = event.target.closest('[data-review]'); if (!button) return; try { await request(`/api/items/${selected}/${button.dataset.review}`, { method:'POST' }); detailKey = ''; await poll(); } catch(error) { message(error.message,true); } });
$('#filter').addEventListener('change', () => { queuePage = 0; renderItems(); });
$('#search').addEventListener('input', () => { queuePage = 0; renderItems(); });
$('#previous-page').addEventListener('click', () => { queuePage--; renderItems(); });
$('#next-page').addEventListener('click', () => { queuePage++; renderItems(); });
await poll(); setInterval(poll, 2000);
