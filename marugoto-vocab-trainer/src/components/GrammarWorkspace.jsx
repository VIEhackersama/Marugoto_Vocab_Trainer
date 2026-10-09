import React, { useState } from 'react';
import { GROUPS, GODAN_ROWS, conjugate } from '../grammar/conjugation.js';
import './grammar.css';

const ROWS = [
  ['Hiện tại / tương lai', 'Khẳng định'], ['Hiện tại / tương lai', 'Phủ định'],
  ['Quá khứ', 'Khẳng định'], ['Quá khứ', 'Phủ định'],
];

function Japanese({ text, reading }) {
  return <ruby lang="ja">{text}<rt>{reading}</rt></ruby>;
}

function connectionExamples(groupId, word, reading) {
  if (groupId === 'noun') return [
    ['Trước danh từ', '日本語の先生', 'にほんごのせんせい', 'Danh từ + の + danh từ: giáo viên tiếng Nhật. の nối hai danh từ, quan hệ tùy ngữ cảnh.'],
    ['Nối vị ngữ', `${word}で、…`, `${reading}で、…`, 'Là …, và …; dùng で để nối, phần sau sẽ kết thúc câu.'],
  ];
  if (groupId === 'na-adj') return [
    ['Trước danh từ', `${word}な人`, `${reading}なひと`, 'Dùng な giữa gốc tính từ và danh từ: người …'],
    ['Bổ nghĩa động từ', '静かに話します', 'しずかにはなします', 'Gốc tính từ + に + động từ: nói chuyện khẽ. Học cách kết hợp tự nhiên trong từng câu mẫu.'],
  ];
  if (groupId === 'i-adj') {
    const stem = word === 'いい' ? 'よ' : word.slice(0, -1);
    const kanaStem = reading === 'いい' ? 'よ' : reading.slice(0, -1);
    return [
      ['Trước danh từ', `${word}もの`, `${reading}もの`, 'Giữ い rồi thêm danh từ: thứ / đồ …; không thêm な.'],
      ['Bổ nghĩa động từ', `${stem}く`, `${kanaStem}く`, 'Bỏ い + く. Ví dụ: よく分かります — hiểu rõ.'],
    ];
  }
  if (word === 'ある') return [
    ['Có vật', '本があります', 'ほんがあります', 'Vật + が + あります → có vật đó. Người / động vật dùng います.'],
    ['Không có vật', '本がありません', 'ほんがありません', 'Vật + が + ありません → không có vật đó. が vẫn dùng được trong câu phủ định.'],
  ];
  const plain = conjugate(groupId, word);
  const kana = conjugate(groupId, reading);
  const stem = conjugate(groupId, word, true).forms[0].slice(0, -2);
  const kanaStem = conjugate(groupId, reading, true).forms[0].slice(0, -2);
  return [
    ['Yêu cầu lịch sự', `${plain.te}ください`, `${kana.te}ください`, 'Thể て + ください → hãy làm …'],
    ['Yêu cầu không làm', `${plain.forms[1]}でください`, `${kana.forms[1]}でください`, 'Thể ない + でください → xin đừng làm …'],
    ['Muốn làm', `${stem}たいです`, `${kanaStem}たいです`, 'Bỏ ます + たいです → muốn làm …; たい chia giống tính từ i.'],
  ];
}

export function GrammarWorkspace({ initialGroupId = 'noun' }) {
  const [groupId, setGroupId] = useState(() => GROUPS.some(g => g.id === initialGroupId) ? initialGroupId : 'noun');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [polite, setPolite] = useState(true);
  const group = GROUPS.find(x => x.id === groupId);
  const [word, reading, meaning] = group.examples[exampleIndex];
  const { forms, rules, te } = conjugate(groupId, word, polite);
  const kanaForms = conjugate(groupId, reading, polite);
  const verb = ['ichidan', 'godan', 'irregular'].includes(groupId);
  const connections = connectionExamples(groupId, word, reading);

  return <section className="grammar-workspace" aria-labelledby="grammar-heading">
    <div className="grammar-heading">
      <span className="eyebrow">Ngữ pháp · Nền tảng A1 → N5</span>
      <h1 id="grammar-heading">Chia động từ, danh từ & tính từ</h1>
      <p>Bắt đầu từ です / ます, rồi đối chiếu thể thường. Mỗi bảng có cách đọc và quy tắc để tự chia từ mới.</p>
    </div>
    <nav className="grammar-groups grammar-six-groups" aria-label="Nhóm từ">
      {GROUPS.map(item => <button type="button" key={item.id} aria-pressed={groupId === item.id}
        onClick={() => { setGroupId(item.id); setExampleIndex(0); }}>
        <span>{item.label}</span><small lang="ja">{item.ja}</small>
      </button>)}
    </nav>
    <div className="grammar-surface">
      <div className="grammar-intro"><h2>{group.title}</h2><p>{group.intro}</p></div>
      <div className="grammar-controls">
        <div className="grammar-example-field">
          <label htmlFor="grammar-example">Từ ví dụ</label>
          <select id="grammar-example" value={exampleIndex} onChange={event => setExampleIndex(Number(event.target.value))}>
            {group.examples.map(([jp, kana, vi], i) => <option key={jp} value={i}>{jp} · {kana} · {vi}</option>)}
          </select>
        </div>
        <fieldset><legend>Cách nói</legend><div className="grammar-register">
          <button type="button" aria-pressed={polite} onClick={() => setPolite(true)}>Thể lịch sự</button>
          <button type="button" aria-pressed={!polite} onClick={() => setPolite(false)}>Thể thường</button>
        </div></fieldset>
      </div>
      <div className="grammar-word"><Japanese text={word} reading={reading}/><span>{meaning}</span></div>
      <div className="grammar-table-scroll" role="region" aria-label="Bảng chia theo thì" tabIndex={0}>
        <table className="grammar-table">
          <caption>{word} · {polite ? 'Thể lịch sự' : 'Thể thường'}</caption>
          <thead><tr><th scope="col">Thì</th><th scope="col">Dạng</th><th scope="col">Cách chia</th><th scope="col">Kết quả</th></tr></thead>
          <tbody>{ROWS.map(([tense, polarity], i) => <tr key={i}>
            <th scope="row">{tense}</th><td>{polarity}</td><td>{rules[i]}</td>
            <td className="grammar-result"><Japanese text={forms[i]} reading={kanaForms.forms[i]}/></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="grammar-tense-note">Dạng <strong>không quá khứ</strong> dùng cho hiện tại và tương lai; ngữ cảnh hoặc từ như 今日（hôm nay）, 明日（ngày mai）cho biết thời điểm.</p>
      <div className="grammar-te"><span>Thể nối {groupId === 'i-adj' ? 'くて' : verb ? 'て' : 'で'}</span>
        <strong><Japanese text={te} reading={kanaForms.te}/></strong>
        <p>Để nối ý hoặc kết hợp mẫu ngữ pháp; bản thân dạng này không phải một thì riêng.</p>
      </div>
      <aside className="grammar-note"><h3>Lưu ý dễ nhầm</h3><p>{group.note}</p>
        {groupId === 'i-adj' && <p>Phủ định lịch sự cũng có ～くありません / ～くありませんでした. Quá khứ là 高かったです, không dùng 高いでした.</p>}
        {['na-adj', 'noun'].includes(groupId) && <p>Cũng dùng được ～じゃないです / ～じゃなかったです. Thay じゃ bằng では khi nói trang trọng hơn.</p>}
      </aside>
    </div>
    <section className="grammar-surface grammar-reference" aria-labelledby="grammar-connections">
      <h2 id="grammar-connections">{verb ? 'Từ dạng chia đến mẫu câu' : 'Khi nối ý và bổ nghĩa'}</h2>
      <p>{verb ? 'Tách dạng của động từ trước, rồi ghép phần còn lại của mẫu câu.' : 'Dạng cuối câu và dạng đứng trước từ khác có thể khác nhau.'}</p>
      <div className="grammar-patterns">{connections.map(([label, jp, kana, explanation]) => <article key={label}>
        <h3>{label}</h3><div className="grammar-pattern-result"><Japanese text={jp} reading={kana}/></div><p>{explanation}</p>
      </article>)}</div>
      {verb && word !== 'ある' && <details className="grammar-next"><summary>Học tiếp: ている, cho phép và cấm làm</summary>
        <p><Japanese text={`${te}います`} reading={`${kanaForms.te}います`}/> → て + います. Diễn tả việc đang làm hoặc trạng thái tùy động từ: 食べています = đang ăn; 知っています = biết.</p>
        <p><Japanese text={`${te}もいいです`} reading={`${kanaForms.te}もいいです`}/> → て + もいいです: được phép làm …</p>
        <p><Japanese text={`${te}はいけません`} reading={`${kanaForms.te}はいけません`}/> → て + はいけません: không được làm …</p>
        <p>Đây là mẫu ghép với dạng chia. Hãy nắm ます・ない・て・た trước, rồi học từng mẫu trong ngữ cảnh.</p>
      </details>}
    </section>
    {groupId === 'godan' && <section className="grammar-surface grammar-reference" aria-labelledby="godan-rules">
      <h2 id="godan-rules">Bảng đổi đuôi godan</h2><p>Thay âm cuối của dạng từ điển; không thêm trực tiếp đuôi mới vào cả từ.</p>
      <div className="grammar-table-scroll" role="region" aria-label="Bảng đổi đuôi godan" tabIndex={0}>
        <table className="grammar-table"><thead><tr><th scope="col">Đuôi</th><th scope="col">Trước ない</th><th scope="col">Trước ます</th><th scope="col">Thể て / た</th><th scope="col">Ví dụ</th></tr></thead>
          <tbody>{GODAN_ROWS.map(row => <tr key={row[0]}>{row.map((cell, i) => i === 0 ? <th scope="row" key={i} lang="ja">{cell}</th> : <td key={i} lang="ja">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>}
  </section>;
}
