import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only the explicitly supplied snapshot selects targets. Never infer progress
// from the app's catalog or mutate its learning database.
const sourcePath = process.argv[2];
assert.ok(sourcePath, 'Pass the bunpro-progress.json snapshot path.');
const source = await readFile(sourcePath);
const rows = JSON.parse(source.toString('utf8').replace(/^\uFEFF/, ''));
const vocab = rows.filter(row => row.kind === 'VOCAB');
assert.equal(vocab.length, 235, 'This authored assessment belongs to the supplied 235-word snapshot.');
assert.equal(new Set(vocab.map(row => row.entryId)).size, vocab.length);
const find = target => {
  const [title, reading] = target.split('|');
  const matches = vocab.filter(row => row.title === title && (!reading || row.reading === reading));
  assert.equal(matches.length, 1, `Target must match exactly one VOCAB row: ${target}`);
  assert.ok(Number.isInteger(matches[0].stage) && matches[0].stage >= 0 && matches[0].stage <= 12);
  return matches[0];
};
function rich(source) {
  const result = []; let cursor = 0;
  for (const match of source.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)) {
    if (match.index > cursor) result.push({ text: source.slice(cursor, match.index) });
    result.push({ text: match[1], reading: match[2] }); cursor = match.index + match[0].length;
  }
  if (!result.length) return source;
  if (cursor < source.length) result.push({ text: source.slice(cursor) });
  assert.ok(result.every(token => token.text.trim()), 'Do not emit whitespace-only tokens.');
  return result;
}
let seed = 20261030;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const shuffle = values => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
};
const coverage = []; let sequence = 0; let positions = [];
function choice(target, prompt, correct, distractors, explanation) {
  const row = find(target), id = `q${String(++sequence).padStart(2, '0')}`;
  assert.equal(new Set([correct, ...distractors]).size, 4, id);
  if (!positions.length) positions = shuffle([0, 1, 2, 3]);
  const position = positions.pop(), options = shuffle(distractors); options.splice(position, 0, correct);
  coverage.push({ questionId: id, entryId: row.entryId, target: row.title, reading: row.reading, stage: row.stage, sourceUrl: row.sourceUrl, skill: sequence <= 10 ? 'reading_recognition' : 'meaning_and_usage' });
  return { id, type: 'single_choice', prompt: rich(prompt), options: options.map((text, i) => ({ id: 'abcd'[i], text: rich(text) })), correctOptionId: 'abcd'[position], points: 1, explanation };
}
function reading(target, explanation) {
  const row = find(target), id = `q${String(++sequence).padStart(2, '0')}`;
  coverage.push({ questionId: id, entryId: row.entryId, target: row.title, reading: row.reading, stage: row.stage, sourceUrl: row.sourceUrl, skill: 'reading_production' });
  // Never attach ruby to the word whose reading is being assessed.
  return { id, type: 'fill_blank', prompt: `「${row.title}」の読み方をひらがなで書いてください。\n{{reading}}`, blanks: [{ id: 'reading', acceptedAnswers: [row.reading], points: 2 }], explanation };
}

const sections = [
  { id: 'reading-choice', title: '文字・読み方', questions: [
    choice('旅行', '「旅行」の読み方はどれですか。', 'りょこう', ['りょうこう', 'りょこ', 'りこう'], '旅行＝りょこう: du lịch/chuyến đi. Âm りょ là âm ghép; こう có trường âm. Không viết りょうこう hay rút ngắn thành りょこ.'),
    choice('夏休み', '「夏休み」の読み方はどれですか。', 'なつやすみ', ['なつやすむ', 'なつやすめ', 'なつやさみ'], '夏休み＝なつやすみ: kỳ nghỉ hè. 休み là danh từ kỳ nghỉ/nghỉ ngơi; không thay đuôi bằng 休む là động từ nghỉ.'),
    choice('初めて', '「初めて」の読み方はどれですか。', 'はじめて', ['はじまて', 'はしめて', 'はじめで'], '初めて＝はじめて: lần đầu tiên. Ghi nhớ cả cụm; không đổi じ thành し hoặc て thành で.'),
    choice('医者', '「医者」の読み方はどれですか。', 'いしゃ', ['いしや', 'いっしゃ', 'いしょう'], '医者＝いしゃ: bác sĩ. しゃ dùng ゃ nhỏ, không phải hai âm tách rời し・や; không có âm ngắt っ.'),
    choice('病院', '「病院」の読み方はどれですか。', 'びょういん', ['びよういん', 'びょいん', 'びょうにん'], '病院＝びょういん: bệnh viện. Phân biệt びょう (ょ nhỏ và có う) với びよう. Bỏ trường âm hoặc đổi いん thành にん đều không đúng từ này.'),
    choice('喫茶店', '「喫茶店」の読み方はどれですか。', 'きっさてん', ['きさてん', 'きっちゃてん', 'きっさてい'], '喫茶店＝きっさてん: quán cà phê/quán giải khát. Có っ trước さ; cả từ không đọc theo kiểu ghép máy móc từng âm chữ Hán.'),
    choice('留学生', '「留学生」の読み方はどれですか。', 'りゅうがくせい', ['りゅがくせい', 'りゆうがくせい', 'りゅうがくさい'], '留学生＝りゅうがくせい: du học sinh. りゅう có ゅ nhỏ và trường âm; phần cuối là せい.'),
    choice('外国人', '「外国人」の読み方はどれですか。', 'がいこくじん', ['がいごくじん', 'がいこくにん', 'がいこくひと'], '外国人＝がいこくじん: người nước ngoài. Trong từ này 人 đọc じん, không đọc にん hay ひと; 国 là こく.'),
    choice('誕生日', '「誕生日」の読み方はどれですか。', 'たんじょうび', ['たんじょび', 'たんしょうび', 'たんじょうにち'], '誕生日＝たんじょうび: sinh nhật. じょう có trường âm; 日 trong cả từ này đọc び.'),
    choice('図書館', '「図書館」の読み方はどれですか。', 'としょかん', ['としょうかん', 'としょがん', 'ずしょかん'], '図書館＝としょかん: thư viện. としょ không có trường âm sau しょ; 館 ở đây đọc かん.'),
  ] },
  { id: 'basic-meaning', title: '語彙', questions: [
    choice('教室', '[[学生|がくせい]]たちは、この[[部屋|へや]]で[[先生|せんせい]]と[[勉強|べんきょう]]します。ここは（　）です。', '[[教室|きょうしつ]]', ['[[台所|だいどころ]]', '[[玄関|げんかん]]', '[[映画館|えいがかん]]'], '教室: phòng học. 台所 là bếp, 玄関 là lối vào nhà, 映画館 là rạp chiếu phim. Câu hỏi yêu cầu nhận ra loại phòng, không yêu cầu chọn trợ từ.'),
    choice('新聞', '[[毎朝|まいあさ]]、（　）を[[読|よ]]んで、ニュースを[[知|し]]ります。', '[[新聞|しんぶん]]', ['[[帽子|ぼうし]]', '[[鞄|かばん]]', '[[時計|とけい]]'], '新聞: báo. Đọc báo để biết tin tức là cách dùng tự nhiên của từ này; 帽子 là mũ, 鞄 là túi, 時計 là đồng hồ.'),
    choice('日本語', '「日本語の[[授業|じゅぎょう]]」の[[意味|いみ]]はどれですか。', 'tiết học tiếng Nhật', ['du học sinh Nhật Bản', 'giáo viên người Nhật', 'quyển sách của Nhật Bản'], '日本語 nghĩa là tiếng Nhật, không phải người Nhật hay giáo viên. 授業 là tiết học/buổi học, nên 日本語の授業 là tiết học tiếng Nhật.'),
    choice('学校', '[[子|こ]]どもたちが[[毎日|まいにち]][[通|かよ]]って、[[先生|せんせい]]と[[勉強|べんきょう]]するところはどこですか。', '[[学校|がっこう]]', ['ホテル', '[[病院|びょういん]]', '[[映画館|えいがかん]]'], '学校: trường học. ホテル là khách sạn, 病院 là bệnh viện, 映画館 là rạp phim. 子どもたちが毎日通う nói đến sinh hoạt đi học, không phải một chuyến đến nơi bất kỳ.'),
    choice('番号', '[[電話|でんわ]]をしたいです。[[電話|でんわ]]の（　）を[[教|おし]]えてください。', '[[番号|ばんごう]]', ['[[名前|なまえ]]', '[[誕生日|たんじょうび]]', '[[半分|はんぶん]]'], '番号: số/số hiệu. 電話の番号 là số điện thoại; tên, sinh nhật và một nửa không cung cấp số để gọi.'),
    choice('写真', 'カメラで[[撮|と]]りました。[[旅行|りょこう]]の（　）を[[友達|ともだち]]に[[見|み]]せます。', '[[写真|しゃしん]]', ['[[砂糖|さとう]]', '[[鶏肉|とりにく]]', '[[文法|ぶんぽう]]'], '写真: ảnh. カメラで撮る và 写真を見せる là các kết hợp tự nhiên. 砂糖 là đường, 鶏肉 là thịt gà, 文法 là ngữ pháp.'),
    choice('動物', '[[猫|ねこ]]や[[犬|いぬ]]は（　）です。', '[[動物|どうぶつ]]', ['[[飲|の]]み[[物|もの]]', '[[食|た]]べ[[物|もの]]', '[[文法|ぶんぽう]]'], '動物: động vật. 猫 và 犬 thuộc nhóm động vật. 飲み物 là đồ uống; 食べ物 là thức ăn; 文法 là ngữ pháp.'),
    choice('飲み物', 'お[[茶|ちゃ]]やジュースは（　）です。', '[[飲|の]]み[[物|もの]]', ['[[動物|どうぶつ]]', '[[教室|きょうしつ]]', '[[新聞|しんぶん]]'], '飲み物: đồ uống, thứ để uống. Cả trà và nước trái cây đều thuộc nhóm này. Những lựa chọn còn lại lần lượt là động vật, phòng học và báo.'),
    choice('妹', '「[[私|わたし]]の妹」の[[意味|いみ]]はどれですか。', 'em gái của tôi', ['chị gái của tôi', 'anh trai của tôi', 'mẹ của tôi'], '妹＝いもうと: em gái của mình. 姉 là chị gái, 兄 là anh trai, お母さん là mẹ. Ở đây kiểm tra quan hệ gia đình, không kiểm tra mẫu の.'),
    choice('砂糖', 'コーヒーに（　）を[[少|すこ]]し[[入|い]]れます。[[甘|あま]]くなります。', '[[砂糖|さとう]]', ['[[紙|かみ]]', '[[魚|さかな]]', '[[鶏肉|とりにく]]'], '砂糖: đường. Cho một ít đường vào cà phê làm nó ngọt hơn. 紙 là giấy; 魚 là cá; 鶏肉 là thịt gà.'),
  ] },
  { id: 'basic-context', title: '文の中のことば', questions: [
    choice('明るい', 'この[[部屋|へや]]は（　）です。[[昼|ひる]]は[[電気|でんき]]をつけなくても、[[本|ほん]]がよく[[読|よ]]めます。', '[[明|あか]]るい', ['[[暗|くら]]い', '[[冷|つめ]]たい', '[[細|ほそ]]い'], '明るい: sáng, nhiều ánh sáng. Ngữ cảnh nói đọc được sách ban ngày mà không bật đèn. 暗い là tối, 冷たい là lạnh khi tiếp xúc, 細い là mảnh/hẹp; đây không phải các nghĩa đang được mô tả.'),
    choice('習う', '[[毎週|まいしゅう]]、[[先生|せんせい]]に[[日本語|にほんご]]を（　）。', '[[習|なら]]います', ['[[返|かえ]]します', '[[走|はし]]ります', '[[置|お]]きます'], '習う: học một kỹ năng/kiến thức từ người dạy; ở đây là học tiếng Nhật với giáo viên. 返す là trả lại, 走る là chạy, 置く là đặt/để. Các dạng lịch sự đã được cung cấp sẵn.'),
    choice('返す', '[[昨日|きのう]]、[[友達|ともだち]]に[[本|ほん]]を[[借|か]]りました。[[今日|きょう]]、その[[本|ほん]]を[[友達|ともだち]]に（　）。', '[[返|かえ]]します', ['[[習|なら]]います', '[[遊|あそ]]びます', '[[泳|およ]]ぎます'], '返す: trả lại vật cho người đã cho mượn. 借りる là mượn, còn hành động đưa lại cuốn sách là 返す. Phân biệt 返す với 帰る: 帰る là người trở về.'),
    choice('遊ぶ', '[[宿題|しゅくだい]]はもう[[終|お]]わりました。これから[[友達|ともだち]]と[[公園|こうえん]]で（　）。', '[[遊|あそ]]びます', ['[[返|かえ]]します', '[[置|お]]きます', '[[閉|し]]めます'], '遊ぶ: chơi, vui chơi; 友達と公園で遊ぶ là chơi cùng bạn ở công viên. Không dùng các động từ trả lại, đặt hay đóng để diễn tả hoạt động này.'),
    choice('曲がる', '[[次|つぎ]]の[[角|かど]]を[[右|みぎ]]に（　）ください。[[駅|えき]]はその[[道|みち]]にあります。', '[[曲|ま]]がって', ['[[借|か]]りて', '[[浴|あ]]びて', '[[食|た]]べて'], '曲がる: rẽ, đổi hướng. 角を右に曲がる là rẽ phải ở góc đường. Các lựa chọn đều đã cho dạng nối với ください; cần chọn đúng nghĩa của động từ.'),
    choice('置く', 'その[[鞄|かばん]]は、[[机|つくえ]]の[[上|うえ]]に（　）ください。', '[[置|お]]いて', ['[[泳|およ]]いで', '[[飛|と]]んで', '[[休|やす]]んで'], '置く: đặt/để một vật ở nơi nào đó. Trong câu này là đặt túi lên bàn. 泳ぐ là bơi, 飛ぶ là bay, 休む là nghỉ; không diễn tả việc đặt đồ vật.'),
    choice('走る', 'バスがすぐ[[出|で]]ます。[[歩|ある]]かないで、（　）ください。', '[[走|はし]]って', ['[[座|すわ]]って', '[[寝|ね]]て', '[[読|よ]]んで'], '走る: chạy. Xe buýt sắp đi nên người nói yêu cầu chạy thay vì đi bộ. 座る là ngồi, 寝る là ngủ/đi ngủ, 読む là đọc.'),
    choice('すみません', 'A：「（　）、[[駅|えき]]はどこですか。」\nB：「あそこです。」', 'すみません', ['[[大丈夫|だいじょうぶ]]です', '[[初|はじ]]めてです', 'そうです'], 'すみません ở đầu lời hỏi dùng để xin phép/thu hút sự chú ý một cách lịch sự, gần với “xin lỗi, cho tôi hỏi…”. Không chỉ dùng khi nhận lỗi. Những lựa chọn khác không mở lời hỏi đường tự nhiên trong đoạn hội thoại này.'),
    choice('僕', '「僕」と[[同|おな]]じ[[人|ひと]]を[[指|さ]]すことばはどれですか。', '[[私|わたし]]', ['[[彼|かれ]]', 'あなた', '[[彼女|かのじょ]]'], '僕＝ぼく là đại từ ngôi thứ nhất: người nói tự xưng, nên cùng chỉ người nói như 私 trong ngữ cảnh này. 彼/彼女 chỉ người thứ ba, あなた chỉ người nghe. 僕 thường có sắc thái nam giới/thân mật hơn, không phải từ thay thế 私 trong mọi hoàn cảnh.'),
    choice('ジュース', 'りんごの（　）を[[飲|の]]みます。', 'ジュース', ['[[鶏肉|とりにく]]', '[[砂糖|さとう]]', 'スポーツ'], 'ジュース: nước trái cây/nước ép. りんごのジュース là nước táo. Các lựa chọn khác không phải loại đồ uống phù hợp với câu này.'),
    choice('お弁当', '[[朝|あさ]]、ご[[飯|はん]]とおかずを[[箱|はこ]]に[[入|い]]れました。[[昼|ひる]]に[[学校|がっこう]]で、この（　）を[[食|た]]べます。', 'お[[弁当|べんとう]]', ['ノート', '[[帽子|ぼうし]]', '[[新聞|しんぶん]]'], 'お弁当: cơm hộp/bữa ăn được chuẩn bị trong hộp để mang đi. Ở đây là bữa trưa mang từ nhà tới trường. ノート là vở, 帽子 là mũ, 新聞 là báo.'),
    choice('右', '「右」の[[意味|いみ]]はどれですか。', 'bên phải', ['bên trái', 'bên ngoài', 'ở xa'], '右＝みぎ: bên phải. Ghi nhớ hướng của từ này; không phải bên trái, bên ngoài hoặc khoảng cách xa.'),
    choice('半分', 'ケーキを[[同|おな]]じ[[大|おお]]きさの[[二|ふた]]つに[[分|わ]]けます。[[一|ひと]]つは、ケーキの（　）です。', '[[半分|はんぶん]]', ['[[時間|じかん]]', '[[番号|ばんごう]]', '[[写真|しゃしん]]'], '半分: một nửa. Chia chiếc bánh thành hai phần bằng nhau thì mỗi phần là một nửa. Không phải cứ chia thành hai phần bất kỳ là hai nửa bằng nhau; dữ kiện 同じ大きさ làm rõ điều đó.'),
    choice('有る', '「有る」に[[最|もっと]]も[[近|ちか]]い[[意味|いみ]]はどれですか。', 'có, tồn tại (đồ vật/sự việc)', ['biết một thông tin', 'mang theo một vật', 'đặt một vật xuống'], '有る＝ある: có/tồn tại. Từ này thường được viết bằng hiragana ある. Không đồng nghĩa với 知る (biết), 持つ (cầm/có/mang theo theo ngữ cảnh) hoặc 置く (đặt/để).'),
    choice('時間', 'テストは[[九時|くじ]]から[[十時|じゅうじ]]までです。テストの（　）は[[一時間|いちじかん]]です。', '[[時間|じかん]]', ['[[番号|ばんごう]]', '[[名前|なまえ]]', '[[誕生日|たんじょうび]]'], '時間: thời gian/khoảng thời gian. Từ 9 giờ đến 10 giờ là một giờ. 番号 là số hiệu, 名前 là tên, 誕生日 là sinh nhật; không diễn tả độ dài buổi kiểm tra.'),
    choice('紙', 'この[[白|しろ]]い（　）に、[[名前|なまえ]]を[[書|か]]いてください。', '[[紙|かみ]]', ['[[水|みず]]', '[[橋|はし]]', '[[砂糖|さとう]]'], '紙: giấy, vật có thể dùng để viết tên lên. Đừng nhầm chỉ vì một đồ vật cũng có thể màu trắng; cần xét cả hành động 書く. 水 là nước, 橋 là cầu, 砂糖 là đường.'),
    choice('橋', 'この[[川|かわ]]の[[上|うえ]]に（　）があります。そこを[[歩|ある]]いて、[[向|む]]こうへ[[行|い]]きます。', '[[橋|はし]]', ['[[机|つくえ]]', '[[教室|きょうしつ]]', '[[鞄|かばん]]'], '橋: cây cầu. Nó bắc qua sông và cho người đi sang bờ bên kia. 机 là bàn, 教室 là phòng học, 鞄 là túi; không phù hợp chức năng được mô tả.'),
    choice('青', '「青」の[[意味|いみ]]はどれですか。', 'màu xanh lam', ['màu đỏ', 'màu trắng', 'màu đen'], '青＝あお: màu xanh lam/xanh dương trong cách gọi màu cơ bản này. Một số kết hợp cố định dùng 青 cho sắc xanh khác, nhưng không phải nghĩa đang hỏi ở đây.'),
    choice('ご飯', '「ご飯」の[[意味|いみ]]として[[正|ただ]]しいものはどれですか。', 'cơm; bữa ăn', ['bánh mì; đồ ngọt', 'thịt gà; thịt nói chung', 'nước uống; nước trái cây'], 'ご飯＝ごはん có thể chỉ cơm đã nấu hoặc bữa ăn, tùy ngữ cảnh. Không giới hạn từ này vào một món ăn phụ; các cặp nghĩa ở lựa chọn khác không phải nghĩa của ご飯.'),
    choice('外', '「外」の[[意味|いみ]]はどれですか。', 'bên ngoài', ['ở giữa', 'bên phải', 'một nửa'], '外＝そと: bên ngoài. Đây là từ chỉ phía/phạm vi ngoài, không phải hướng phải hay số lượng một nửa.'),
  ] },
  { id: 'usage', title: 'ことばの使い方', questions: [
    choice('閉める', '[[寒|さむ]]いです。ドアを（　）ください。', '[[閉|し]]めて', ['[[返|かえ]]して', '[[飛|と]]んで', '[[泳|およ]]いで'], '閉める: đóng một vật như cửa. Vì lạnh nên yêu cầu đóng cửa. 返す là trả lại, 飛ぶ là bay, 泳ぐ là bơi; không mang nghĩa đóng cửa.'),
    choice('教える', '[[私|わたし]]は[[先生|せんせい]]です。[[学生|がくせい]]に[[日本語|にほんご]]を（　）。', '[[教|おし]]えます', ['[[返|かえ]]します', '[[忘|わす]]れます', '[[借|か]]ります'], '教える: dạy/chỉ cho người khác. Người nói là giáo viên và truyền đạt tiếng Nhật cho học sinh. Phân biệt với 習う: học từ người dạy. Không yêu cầu bạn tự chia động từ.'),
    choice('会う', '[[明日|あした]]、[[駅|えき]]で[[友達|ともだち]]に（　）。', '[[会|あ]]います', ['[[座|すわ]]ります', '[[飲|の]]みます', '[[寝|ね]]ます'], '会う: gặp một người. 駅で友達に会う là gặp bạn ở ga. 座る/ngồi, 飲む/uống và 寝る/ngủ không diễn tả cuộc gặp ấy.'),
    choice('浴びる', '[[毎朝|まいあさ]]、シャワーを（　）。', '[[浴|あ]]びます', ['[[飲|の]]みます', '[[食|た]]べます', '[[泳|およ]]ぎます'], '浴びる: tắm/chịu dòng nước hoặc thứ chiếu/rơi vào người; シャワーを浴びる là tắm vòi sen. Không dùng 飲む hay 泳ぐ thay cho kết hợp này.'),
    choice('泳ぐ', '[[水|みず]]の[[中|なか]]で、[[手|て]]と[[足|あし]]を[[動|うご]]かして（　）。', '[[泳|およ]]ぎます', ['[[飛|と]]びます', '[[話|はな]]します', '[[書|か]]きます'], '泳ぐ: bơi, di chuyển trong nước bằng cơ thể. 飛ぶ là bay, 話す là nói, 書く là viết. Ngữ cảnh giúp phân biệt hoạt động trong nước với các hành động khác.'),
    choice('忘れる', '[[雨|あめ]]ですが、[[傘|かさ]]がありません。[[家|いえ]]に（　）。', '[[忘|わす]]れました', ['[[泳|およ]]ぎました', '[[習|なら]]いました', '[[会|あ]]いました'], '忘れる: quên. 家に傘を忘れる là để quên ô ở nhà. Không phải người nói đi bơi, học với ai hoặc gặp ai ở nhà.'),
    choice('出る', '「[[部屋|へや]]を出る」の[[意味|いみ]]はどれですか。', 'ra khỏi phòng', ['trở về phòng', 'đóng cửa phòng', 'ngồi trong phòng'], '出る: ra, đi ra/rời khỏi. 部屋を出る là ra khỏi phòng; không đồng nghĩa với 帰る (trở về), 閉める (đóng) hoặc 座る (ngồi).'),
    choice('台所', '[[母|はは]]は（　）で、[[今日|きょう]]のご[[飯|はん]]を[[作|つく]]っています。', '[[台所|だいどころ]]', ['[[玄関|げんかん]]', '[[教室|きょうしつ]]', '[[図書館|としょかん]]'], '台所: nhà bếp, nơi chuẩn bị/nấu bữa ăn. 玄関 là lối vào nhà, 教室 là phòng học, 図書館 là thư viện.'),
    choice('映画館', '[[大|おお]]きいスクリーンで[[映画|えいが]]を[[見|み]]たいです。これから（　）へ[[行|い]]きます。', '[[映画館|えいがかん]]', ['レストラン', '[[病院|びょういん]]', '[[図書館|としょかん]]'], '映画館: rạp chiếu phim. 映画 chỉ bộ phim; thêm 館 tạo tên địa điểm xem phim. Những địa điểm còn lại không phải nơi được mô tả.'),
    choice('怖い', 'このホラー[[映画|えいが]]は（　）です。[[一人|ひとり]]では[[見|み]]たくありません。', '[[怖|こわ]]い', ['[[熱|あつ]]い', '[[丸|まる]]い', '[[細|ほそ]]い'], '怖い: đáng sợ/sợ. Người nói không muốn xem phim kinh dị một mình vì nó đáng sợ. 熱い là nóng của vật, 丸い là tròn, 細い là mảnh/hẹp.'),
    choice('遠い', '[[家|いえ]]から[[学校|がっこう]]までバスで[[二時間|にじかん]]かかります。[[学校|がっこう]]は（　）です。', '[[遠|とお]]い', ['[[近|ちか]]い', '[[安|やす]]い', '[[丸|まる]]い'], '遠い: xa. Hai tiếng đi xe buýt từ nhà tới trường gợi khoảng cách xa; 近い là gần. 安い nói giá rẻ, 丸い nói hình tròn, không nói khoảng cách.'),
    choice('借りる', '[[図書館|としょかん]]の[[本|ほん]]を[[家|いえ]]へ[[持|も]]って[[帰|かえ]]ります。[[一週間|いっしゅうかん]]、その[[本|ほん]]を（　）。', '[[借|か]]ります', ['[[返|かえ]]します', '[[閉|し]]めます', '[[浴|あ]]びます'], '借りる: mượn/tạm sử dụng đồ của nơi khác. Mang sách thư viện về sử dụng một tuần là mượn sách; 返す là trả lại sau khi mượn, không phải hành động đang bắt đầu ở đây.'),
  ] },
  { id: 'context-apartment', title: '語彙・短い文 1',
    passage: 'このアパートは[[駅|えき]]から[[歩|ある]]いて[[三分|さんぷん]]です。コンビニも[[近|ちか]]く、[[買|か]]い[[物|もの]]に[[便利|べんり]]です。[[玄関|げんかん]]には[[靴|くつ]]や[[傘|かさ]]があります。\nAの[[部屋|へや]]は[[月|つき]][[十万円|じゅうまんえん]]、Bの[[部屋|へや]]は[[月|つき]][[六万円|ろくまんえん]]です。Aのほうが[[高|たか]]いです。[[見学|けんがく]]の[[後|あと]]で、[[冷|つめ]]たい[[牛乳|ぎゅうにゅう]]を[[飲|の]]みました。',
    questions: [
      choice('便利', 'この[[文|ぶん]]の「便利」の[[意味|いみ]]に[[最|もっと]]も[[近|ちか]]いものはどれですか。', 'thuận tiện cho việc mua sắm', ['mất nhiều thời gian để mua sắm', 'cảm thấy sợ khi mua sắm', 'không đi mua sắm'], '便利: tiện lợi. Ở đây ga và cửa hàng ở gần nên đi lại, mua sắm thuận tiện. 便利 không có nghĩa chỉ đơn thuần nổi tiếng, đắt hay đẹp.'),
      choice('玄関', '「玄関」はどこですか。', '家に入るところ', ['ご飯を作るところ', 'お風呂に入るところ', '授業をするところ'], '玄関: khu vực/lối vào nhà, thường là nơi để và thay giày. Không phải nhà bếp, phòng tắm hay phòng học. Các mô tả là nghĩa của địa điểm, không yêu cầu tính toán hay suy luận lịch trình.'),
      choice('高い', 'この[[文|ぶん]]の「高い」の[[意味|いみ]]はどれですか。', 'giá thuê đắt hơn', ['căn phòng ở tầng cao hơn', 'trần phòng cao hơn', 'ga ở xa hơn'], '高い có thể nói độ cao hoặc giá đắt. Ngay trước đó so sánh tiền thuê 10万円 và 6万円, nên ở đây là đắt hơn; không có thông tin về tầng hay trần phòng.'),
      choice('冷たい', '「冷たい[[牛乳|ぎゅうにゅう]]」の「冷たい」と[[同|おな]]じ[[使|つか]]い[[方|かた]]はどれですか。', '冷たい水を飲みます。', ['今日は寒いです。', 'このカレーは辛いです。', 'あの人は背が高いです。'], '冷たい ở đây là nhiệt độ lạnh của đồ uống/vật khi tiếp xúc. 冷たい水 cùng cách dùng đó; 寒い nói cảm giác lạnh/thời tiết, 辛い nói vị cay, 背が高い nói chiều cao của người.'),
    ],
  },
  { id: 'context-friends', title: '語彙・短い文 2',
    passage: 'A：「[[昨日|きのう]]は[[仕事|しごと]]が[[多|おお]]くて、[[大変|たいへん]]でした。[[今日|きょう]]は[[風邪|かぜ]]で、[[熱|ねつ]]もあります。」\nB：「[[一人|ひとり]]で[[病院|びょういん]]へ[[行|い]]きますか。」\nA：「はい、[[大丈夫|だいじょうぶ]]です。[[病院|びょういん]]は[[家|いえ]]から[[近|ちか]]いです。」\nB：「わかりました。[[私|わたし]]は[[明日|あした]]も[[今日|きょう]]と[[同|おな]]じ[[時間|じかん]]に[[電話|でんわ]]します。」',
    questions: [
      choice('大変', 'この[[文|ぶん]]の「大変でした」に[[最|もっと]]も[[近|ちか]]い[[意味|いみ]]はどれですか。', 'đã rất vất vả', ['đã rất rảnh rỗi', 'đã rất thuận tiện', 'đã rất giống nhau'], '大変: vất vả/khó khăn/nghiêm trọng tùy ngữ cảnh. Nói về nhiều công việc hôm qua thì “đã rất vất vả” phù hợp. Không đồng nghĩa với 暇 (rảnh), 便利 (tiện) hay 同じ (giống nhau).'),
      choice('同じ', '「[[今日|きょう]]と同じ[[時間|じかん]]」の[[意味|いみ]]はどれですか。', 'cùng một giờ như hôm nay', ['sớm hơn hôm nay', 'muộn hơn hôm nay', 'bất kỳ giờ nào hôm nay'], '同じ: giống/cùng. 今日と同じ時間 nghĩa là vào cùng giờ như hôm nay; không có nghĩa sớm hơn, muộn hơn hoặc chọn giờ tùy ý.'),
      choice('大丈夫', 'Aの「大丈夫です」に[[最|もっと]]も[[近|ちか]]い[[意味|いみ]]はどれですか。', 'Tôi tự đi được, không sao đâu.', ['Tôi không thể tự đi được.', 'Bệnh viện này nổi tiếng.', 'Ngày mai tôi hoàn toàn rảnh.'], '大丈夫 trong lời đáp trấn an rằng người nói có thể tự tới bệnh viện, không cần lo về việc đi một mình. Nó không khẳng định người nói đã khỏi bệnh: ngay trước đó vẫn nói đang sốt.'),
      choice('風邪', 'この[[文|ぶん]]の「風邪」の[[意味|いみ]]はどれですか。', 'bệnh cảm lạnh', ['cơn gió ngoài trời', 'một đợt nghỉ hè', 'công việc khó khăn'], '風邪＝かぜ: bệnh cảm/cảm lạnh. Dữ kiện bị sốt và đi bệnh viện xác định nghĩa bệnh, không phải gió. 大変 mô tả công việc vất vả nhưng không thay cho tên bệnh này.'),
    ],
  },
  { id: 'reading-write', title: '読み方の記入（ひらがな）', questions: [
    reading('明るい', '明るい＝あかるい: sáng/sáng sủa; trong ngữ cảnh khác còn có thể nói tính cách tươi sáng. Điền toàn bộ cách đọc gồm い cuối, không thêm です.'),
    reading('習う', '習う＝ならう: học từ người dạy. Cần ならう ở dạng từ điển của từ đã cho; không đổi sang ならいます vì câu này chỉ yêu cầu cách đọc.'),
    reading('返す', '返す＝かえす: trả lại. Phân biệt với 帰る＝かえる: người trở về. Đuôi す là một phần của từ cần ghi.'),
    reading('遊ぶ', '遊ぶ＝あそぶ: chơi. Cách đọc đầy đủ là あそぶ, không phải あそび hay あそびます. Đây là nhận diện từ vựng, không yêu cầu biến đổi sang dạng khác.'),
    reading('書く', '書く＝かく: viết. Không nhầm với 聞く＝きく: nghe/hỏi. Cần ghi đúng nguyên âm của động từ đã in.'),
    reading('歩く', '歩く＝あるく: đi bộ. Phân biệt với 走る＝はしる: chạy. Ghi đủ あるく, không thêm trợ từ hay câu văn.'),
    reading('持つ', '持つ＝もつ: cầm, giữ, mang/có tùy cách dùng. Ghi cách đọc dạng từ điển, không cần chia động từ.'),
    reading('知る', '知る＝しる: biết/biết được. Không viết ちる. Câu hỏi chỉ kiểm tra cách đọc, không yêu cầu phân biệt các dạng diễn tả trạng thái biết.'),
    reading('強い', '強い＝つよい: mạnh. Đọc phần 強 là つよ trong cả từ; い cuối vẫn phải điền.'),
    reading('読む', '読む＝よむ: đọc. Đừng bỏ む hoặc đổi thành cách đọc của 書く (かく).'),
    reading('机', '机＝つくえ: bàn. Đây là cách đọc của toàn từ, có ba kana つ・く・え.'),
    reading('鶏肉', '鶏肉＝とりにく: thịt gà. とり là gà/chim trong từ này, にく là thịt. Ghi cả bốn kana.'),
    reading('休む', '休む＝やすむ: nghỉ. 休み＝やすみ là danh từ nghỉ/kỳ nghỉ; đề đã in 休む nên cách đọc phải kết thúc bằng む.'),
    reading('食べ物', '食べ物＝たべもの: thức ăn. Phân biệt với 飲み物＝のみもの: đồ uống. Điền toàn bộ từ chứ không chỉ たべ.'),
    reading('文法', '文法＝ぶんぽう: ngữ pháp. 法 trong từ này đọc ぽう, có trường âm; không viết ぶんほう hay ぶんぽ.'),
    reading('自転車', '自転車＝じてんしゃ: xe đạp. しゃ có ゃ nhỏ; không viết thành しや hoặc đổi phần てん.'),
    reading('練習', '練習＝れんしゅう: luyện tập. しゅう có ゅ nhỏ và trường âm; không rút thành れんしゅ.'),
    reading('覚える', '覚える＝おぼえる: ghi nhớ/học thuộc. Khác với 忘れる＝わすれる: quên. Câu hỏi không yêu cầu chia sang 覚えます.'),
    reading('座る', '座る＝すわる: ngồi xuống/ngồi. Không nhầm với 触る＝さわる; cách đọc cần có す ở đầu.'),
    reading('出かける', '出かける＝でかける: ra ngoài/đi ra khỏi nơi đang ở. Giữ đủ でかける; không đổi thành 出る＝でる vì đó là từ khác.'),
  ] },
];
// Passage text supports ruby while question targets about reading stay plain.
for (const section of sections) if (section.passage) section.passage = rich(section.passage);

const questions = sections.flatMap(section => section.questions);
assert.equal(questions.length, 80);
assert.equal(coverage.length, 80);
// Turning furigana on must not disclose a reading assessed elsewhere in the
// same test. Keep support for other kanji, but omit ruby on the target kanji.
const readingKanji = new Set(coverage.filter(item => item.skill.startsWith('reading_')).flatMap(item => [...item.target].filter(char => /\p{Script=Han}/u.test(char))));
function removeReadingHints(value) {
  if (Array.isArray(value)) return value.map(removeReadingHints);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'reading' || ![...String(value.text || '')].some(char => readingKanji.has(char)))
    .map(([key, child]) => [key, removeReadingHints(child)]));
  return value;
}
for (const section of sections) {
  if (section.passage) section.passage = removeReadingHints(section.passage);
  for (const question of section.questions) {
    question.prompt = removeReadingHints(question.prompt);
    if (question.options) question.options = question.options.map(option => ({ ...option, text: removeReadingHints(option.text) }));
  }
}
const weak = vocab.filter(row => row.stage <= 3);
for (const row of weak) assert.ok(coverage.some(item => item.entryId === row.entryId), `Missing low-stage word: ${row.title}`);
for (const row of vocab.filter(row => row.stage === 0)) assert.equal(coverage.filter(item => item.entryId === row.entryId).length, 2, row.title);
const distribution = Object.fromEntries(['0-3', '4-6', '7+'].map(group => [group, coverage.filter(item => group === '0-3' ? item.stage <= 3 : group === '4-6' ? item.stage >= 4 && item.stage <= 6 : item.stage >= 7).length]));
assert.deepEqual(distribution, { '0-3': 51, '4-6': 25, '7+': 4 });
const score = questions.reduce((sum, q) => sum + (q.type === 'single_choice' ? q.points : q.blanks.reduce((n, blank) => n + blank.points, 0)), 0);
assert.equal(score, 100);

const exam = {
  schemaVersion: 1, id: 'vocab-progress-20261030-01',
  title: '語彙テスト 01 · Từ vựng theo tiến độ 30/10/2026',
  description: '80 câu, 100 điểm, 75 phút; chỉ kiểm tra từ vựng từ 235 mục VOCAB trong bunpro-progress.json. Ưu tiên 47 từ cấp 0–3; từ cấp cao hơn được kiểm tra chọn lọc trong ngữ cảnh. Gồm 60 câu trắc nghiệm và 20 câu ghi cách đọc bằng hiragana. Cách đọc cần kiểm tra không kèm furigana ở từ đích.',
  timeLimitMinutes: 75, sections,
};
const file = new URL('../../public/exams/de-tu-vung-ca-nhan-2026-10-30.json', import.meta.url);
const artifacts = new URL('../../../artifacts/exams/vocab-20261030/', import.meta.url);
await mkdir(new URL('.', file), { recursive: true }); await mkdir(artifacts, { recursive: true });
await writeFile(file, JSON.stringify(exam, null, 2) + '\n');
const stageCounts = Object.fromEntries([...new Set(vocab.map(row => row.stage))].sort((a, b) => a - b).map(stage => [stage, vocab.filter(row => row.stage === stage).length]));
await writeFile(new URL('coverage.json', artifacts), JSON.stringify({ sourceFile: 'bunpro-progress.json', sourceSha256: createHash('sha256').update(source).digest('hex'), totalRows: rows.length, vocabularyRows: vocab.length, excludedNonVocabularyRows: rows.length - vocab.length, stageCounts, questions: 80, score, distribution, uniqueTargets: new Set(coverage.map(item => item.entryId)).size, coverage }, null, 2) + '\n');
console.log(JSON.stringify({ file: fileURLToPath(file), questions: questions.length, score, stageCounts, distribution, uniqueTargets: new Set(coverage.map(item => item.entryId)).size }, null, 2));
