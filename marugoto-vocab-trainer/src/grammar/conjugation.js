export const GODAN_ROWS = [
  ['う', 'わ', 'い', 'って / った', '買う → 買って'],
  ['つ', 'た', 'ち', 'って / った', '待つ → 待って'],
  ['る', 'ら', 'り', 'って / った', '帰る → 帰って'],
  ['む', 'ま', 'み', 'んで / んだ', '読む → 読んで'],
  ['ぶ', 'ば', 'び', 'んで / んだ', '遊ぶ → 遊んで'],
  ['ぬ', 'な', 'に', 'んで / んだ', '死ぬ → 死んで'],
  ['く', 'か', 'き', 'いて / いた', '書く → 書いて'],
  ['ぐ', 'が', 'ぎ', 'いで / いだ', '泳ぐ → 泳いで'],
  ['す', 'さ', 'し', 'して / した', '話す → 話して'],
];

export const GROUPS = [
  { id: 'noun', label: 'Danh từ', ja: '名詞', title: 'Danh từ + だ / です',
    intro: 'Danh từ không đổi gốc. Khi làm vị ngữ (phần nói điều gì về chủ đề), ta chia だ / です để nói khẳng định, phủ định và quá khứ.',
    note: '学生です = là học sinh / sinh viên. Không thêm ます vào danh từ. Trước danh từ khác, thường dùng の: 日本語の先生（giáo viên tiếng Nhật）.',
    examples: [ ['学生', 'がくせい', 'học sinh / sinh viên'], ['先生', 'せんせい', 'giáo viên'], ['ベトナム人', 'ベトナムじん', 'người Việt Nam'], ['休み', 'やすみ', 'ngày nghỉ / nghỉ'] ] },
  { id: 'ichidan', label: 'Ichidan', ja: '一段動詞', title: 'Động từ nhóm 2',
    intro: 'Bỏ る ở dạng từ điển rồi thêm đuôi. Thường có âm i/e trước る, nhưng không phải mọi từ có đuôi này đều là ichidan.',
    note: '帰る（かえる）, 入る（はいる）, 走る（はしる）, 切る（きる）, 知る（しる）là godan. Học nhóm động từ cùng từ mới; đừng chỉ đoán từ đuôi る.',
    examples: [ ['食べる', 'たべる', 'ăn'], ['見る', 'みる', 'xem'], ['起きる', 'おきる', 'thức dậy'], ['寝る', 'ねる', 'ngủ'] ] },
  { id: 'godan', label: 'Godan', ja: '五段動詞', title: 'Động từ nhóm 1',
    intro: 'Đổi âm cuối sang hàng a để thêm ない, hàng i để thêm ます. Thể て và quá khứ た có quy tắc biến âm riêng.',
    note: 'う → わない: 買う → 買わない. 行く có thể て/た đặc biệt: 行って / 行った. ある phủ định thường là ない, quá khứ phủ định là なかった.',
    examples: [ ['書く', 'かく', 'viết'], ['買う', 'かう', 'mua'], ['待つ', 'まつ', 'đợi'], ['帰る', 'かえる', 'về'], ['読む', 'よむ', 'đọc'], ['遊ぶ', 'あそぶ', 'chơi'], ['死ぬ', 'しぬ', 'chết'], ['泳ぐ', 'およぐ', 'bơi'], ['話す', 'はなす', 'nói'], ['行く', 'いく', 'đi'], ['ある', 'ある', 'có (vật)'] ] },
  { id: 'irregular', label: 'Bất quy tắc', ja: 'する・来る', title: 'Động từ nhóm 3',
    intro: 'する（làm）và 来る（đến）có cách chia riêng. Học cả dạng chữ lẫn cách đọc; 来る đổi cách đọc thành き hoặc こ tùy dạng.',
    note: '来る（くる）→ 来ます（きます）→ 来ない（こない）→ 来た（きた）. Với 勉強する, giữ 勉強 rồi chia する: 勉強します.',
    examples: [ ['する', 'する', 'làm'], ['来る', 'くる', 'đến'], ['勉強する', 'べんきょうする', 'học'] ] },
  { id: 'i-adj', label: 'Tính từ i', ja: 'い形容詞', title: 'Tính từ đuôi い',
    intro: 'Giữ い ở dạng khẳng định không quá khứ. Các dạng còn lại bỏ い rồi thêm くない, かった hoặc くなかった. Dạng lịch sự thêm です.',
    note: 'いい（tốt）dùng gốc よ khi biến đổi: よくない, よかった, よくなかった. きれい và 嫌い（きらい）là tính từ na dù tận cùng bằng âm い.',
    examples: [ ['高い', 'たかい', 'cao / đắt'], ['寒い', 'さむい', 'lạnh'], ['おいしい', 'おいしい', 'ngon'], ['いい', 'いい', 'tốt'] ] },
  { id: 'na-adj', label: 'Tính từ na', ja: 'な形容詞', title: 'Tính từ đuôi な',
    intro: 'Giữ nguyên gốc tính từ rồi chia phần だ / です. な dùng khi đứng trước danh từ: 静かな部屋（căn phòng yên tĩnh）.',
    note: 'Dạng từ điển thường ghi 静か hoặc 静かだ. Không thêm な trước です: 静かです. Phủ định có thể dùng じゃない hoặc ではない; では trang trọng hơn.',
    examples: [ ['静か', 'しずか', 'yên tĩnh'], ['元気', 'げんき', 'khỏe / đầy năng lượng'], ['きれい', 'きれい', 'đẹp / sạch'], ['好き', 'すき', 'thích'] ] },
];

// Forms are ordered: non-past positive, non-past negative, past positive, past negative.
export function conjugate(group, word, polite = false) {
  let forms;
  let rules;
  let te;
  if (group === 'irregular') {
    if (word === '来る' || word === 'くる') {
      const kanji = word === '来る';
      forms = polite ? (kanji ? ['来ます', '来ません', '来ました', '来ませんでした'] : ['きます', 'きません', 'きました', 'きませんでした'])
        : (kanji ? ['来る', '来ない', '来た', '来なかった'] : ['くる', 'こない', 'きた', 'こなかった']);
      te = kanji ? '来て' : 'きて';
      rules = polite ? ['来る → き + ます', '来る → き + ません', '来る → き + ました', '来る → き + ませんでした']
        : ['来る đọc là くる', '来 + ない, đọc là こない', '来 + た, đọc là きた', '来 + なかった, đọc là こなかった'];
    } else {
      const stem = word.slice(0, -2);
      const endings = polite ? ['します', 'しません', 'しました', 'しませんでした'] : ['する', 'しない', 'した', 'しなかった'];
      forms = endings.map(x => stem + x);
      rules = endings.map(x => `する → ${x}`);
      te = stem + 'して';
    }
  } else if (group === 'ichidan') {
    const stem = word.slice(0, -1);
    forms = polite ? ['ます', 'ません', 'ました', 'ませんでした'].map(x => stem + x)
      : [word, stem + 'ない', stem + 'た', stem + 'なかった'];
    rules = polite ? ['Bỏ る + ます', 'Bỏ る + ません', 'Bỏ る + ました', 'Bỏ る + ませんでした']
      : ['Giữ dạng từ điển', 'Bỏ る + ない', 'Bỏ る + た', 'Bỏ る + なかった'];
    te = stem + 'て';
  } else if (group === 'godan') {
    const row = GODAN_ROWS.find(x => x[0] === word.slice(-1));
    if (!row) throw new Error('Đuôi godan không hợp lệ');
    const stem = word.slice(0, -1);
    const [teEnding, pastEnding] = row[3].split(' / ');
    te = ['行く', 'いく'].includes(word) ? stem + 'って' : stem + teEnding;
    const negative = word === 'ある' ? 'ない' : stem + row[1] + 'ない';
    forms = polite ? ['ます', 'ません', 'ました', 'ませんでした'].map(x => stem + row[2] + x)
      : [word, negative, ['行く', 'いく'].includes(word) ? stem + 'った' : stem + pastEnding, negative.slice(0, -1) + 'かった'];
    rules = polite ? ['ます', 'ません', 'ました', 'ませんでした'].map(x => `Âm cuối → hàng i + ${x}`)
      : ['Giữ dạng từ điển', word === 'ある' ? 'ある → ない (ngoại lệ)' : `Đổi ${row[0]} → ${row[1]} + ない`, word === '行く' ? '行く → 行った (ngoại lệ)' : `Bỏ ${row[0]} + ${pastEnding}`, 'Bỏ い của ない + かった'];
  } else if (group === 'i-adj') {
    const stem = word === 'いい' ? 'よ' : word.slice(0, -1);
    forms = [word, stem + 'くない', stem + 'かった', stem + 'くなかった'].map(x => x + (polite ? 'です' : ''));
    rules = ['Giữ い', 'Bỏ い + くない', 'Bỏ い + かった', 'Bỏ い + くなかった'].map(x => x + (polite ? ' + です' : ''));
    if (word === 'いい') rules = rules.map((x, i) => i ? x.replace('Bỏ い', 'Dùng gốc よ') : x);
    te = stem + 'くて';
  } else if (group === 'na-adj' || group === 'noun') {
    const endings = polite ? ['です', 'じゃありません', 'でした', 'じゃありませんでした'] : ['だ', 'じゃない', 'だった', 'じゃなかった'];
    forms = endings.map(x => word + x);
    rules = endings.map(x => `${group === 'noun' ? 'Danh từ' : 'Gốc tính từ'} + ${x}`);
    te = word + 'で';
  } else throw new Error('Nhóm từ không hợp lệ');
  return { forms, rules, te };
}
