import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Authoring source: [[surface|reading]] becomes schema-v1 ruby tokens.
function rich(source) {
  const matches = [...source.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)];
  if (!matches.length) return source;
  const tokens = []; let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) {
      const text = source.slice(cursor, match.index);
      assert.ok(text.trim(), `Whitespace-only token before ${match[0]}`);
      tokens.push({ text });
    }
    tokens.push({ text: match[1], reading: match[2] }); cursor = match.index + match[0].length;
  }
  if (cursor < source.length) { const text = source.slice(cursor); assert.ok(text.trim()); tokens.push({ text }); }
  return tokens;
}

let randomState = 20261028;
function random() { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; }
function shuffle(items) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
let positions = [];
const id = n => `q${String(n).padStart(2, '0')}`;
const coverage = [];
function choice(n, topic, prompt, correct, distractors, explanation) {
  assert.equal(distractors.length, 3); assert.equal(new Set([correct, ...distractors]).size, 4);
  if (!positions.length) positions = shuffle([0, 1, 2, 3]);
  const position = positions.pop(); const texts = shuffle(distractors); texts.splice(position, 0, correct);
  coverage.push({ question: n, type: 'single_choice', topic });
  return { id: id(n), type: 'single_choice', prompt: rich(prompt), options: texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text: rich(text) })), correctOptionId: String.fromCharCode(97 + position), points: 2, explanation: rich(explanation) };
}
function fill(n, topic, prompt, blanks, explanation) {
  assert.ok(blanks.length === 1 || blanks.length === 2);
  coverage.push({ question: n, type: 'fill_blank', topic });
  return { id: id(n), type: 'fill_blank', prompt: rich(prompt), blanks: blanks.map(([name, acceptedAnswers]) => ({ id: name, acceptedAnswers, points: 2 / blanks.length })), explanation: rich(explanation) };
}
function essay(n, topic, prompt, modelAnswer, explanation) {
  coverage.push({ question: n, type: 'essay', topic });
  return { id: id(n), type: 'essay', prompt: rich(prompt), modelAnswer: rich(modelAnswer), explanation: rich(explanation) };
}

const sections = [
  {
    id: 'particles', title: 'I · Câu 01–10 — Trợ từ, thông tin và ý định giao tiếp',
    instructions: 'Mỗi câu 2 điểm. Chọn cách phân tích đúng nhất trong đúng tình huống đã cho. Không dùng mẹo máy móc như “phủ định thì đổi sang は”.',
    questions: [
      choice(1, 'が trong câu phủ định',
        'Một bạn sửa câu 「この[[部屋|へや]]にテレビがありません。」 thành câu có は, với lý do “phủ định bắt buộc đổi が thành は”. Nhận định nào chính xác?',
        'Câu có が vẫn đúng. は có thể đưa テレビ thành đề tài/đối chiếu, nhưng bản thân phủ định không bắt buộc đổi trợ từ.',
        ['Bạn ấy đúng: が chỉ được dùng với あります, không được dùng với ありません.', 'が phải đổi thành を vì テレビ là đồ vật.', 'Cả が và は đều sai; phải bỏ trợ từ trước ありません.'],
        'が đánh dấu thứ được nói là có/không có trong mẫu tồn tại. あります → ありません là thay đổi ở vị ngữ; nó không tự động viết lại vai trò của テレビ. テレビはありません cũng dùng được, thường khi lấy TV làm đề tài hoặc đối chiếu với thứ khác. Không nên chấm một câu が là sai chỉ vì vị ngữ phủ định.'),
      choice(2, 'は đối chiếu',
        'Chủ nhà nói 「この[[部屋|へや]]にはテレビはあります。でも、ベッドはありません。」 Hai は gắn sau テレビ và ベッド chủ yếu giúp làm gì?',
        'Đặt hai món đồ thành hai mục đối chiếu: TV thì có, còn giường thì không.',
        ['Biến cả hai đồ vật thành đối tượng trực tiếp của hành động.', 'Đánh dấu hai thời điểm khác nhau.', 'Chỉ làm câu lịch sự hơn, không tác động đến cách tổ chức thông tin.'],
        'Người nói đặt テレビ và ベッド lên cùng một trục để đối chiếu “có/không có”. Đây là chức năng tổ chức thông tin của は. Nó không phải dạng lịch sự của が, không chỉ thời gian và cũng không thay cho を theo quy tắc đồ vật.'),
      choice(3, 'に tồn tại và で hoạt động',
        'Bạn muốn nói hai điều: “Trong thư viện có sinh viên” và “Các sinh viên học trong thư viện”. Cặp câu nào thể hiện đúng sự khác nhau về vai trò địa điểm?',
        '[[図書館|としょかん]]に[[学生|がくせい]]がいます。／[[図書館|としょかん]]で[[学生|がくせい]]が[[勉強|べんきょう]]しています。',
        ['[[図書館|としょかん]]で[[学生|がくせい]]がいます。／[[図書館|としょかん]]に[[学生|がくせい]]が[[勉強|べんきょう]]しています。', '[[図書館|としょかん]]を[[学生|がくせい]]がいます。／[[図書館|としょかん]]を[[学生|がくせい]]が[[勉強|べんきょう]]しています。', '[[図書館|としょかん]]が[[学生|がくせい]]にいます。／[[図書館|としょかん]]が[[学生|がくせい]]で[[勉強|べんきょう]]しています。'],
        'います mô tả sự tồn tại/hiện diện, nên địa điểm hiện diện dùng に. 勉強しています mô tả hoạt động, nên nơi diễn ra hoạt động dùng で. Cùng một thư viện nhưng quan hệ với vị ngữ khác nhau; không chọn trợ từ chỉ bằng nghĩa tiếng Việt “ở”.'),
      choice(4, 'hai chức năng của で',
        'Trong câu 「バスで[[学校|がっこう]]に[[行って|いって]]、[[教室|きょうしつ]]で[[日本語|にほんご]]を[[勉強|べんきょう]]します。」, hai で lần lượt biểu thị gì?',
        'で thứ nhất: phương tiện di chuyển; で thứ hai: nơi diễn ra hoạt động học.',
        ['Cả hai đều chỉ đích đến.', 'で thứ nhất: nơi tồn tại; で thứ hai: thời điểm bắt đầu.', 'で thứ nhất đánh dấu người đi; で thứ hai đánh dấu môn học.'],
        'バスで thuộc cụm di chuyển, trả lời “đi bằng gì?”. 教室で thuộc cụm hoạt động học, trả lời “học ở đâu?”. 学校に mới là đích đến; 日本語を là nội dung/đối tượng của việc học. Không cần ép mọi で trong cùng câu vào một nghĩa duy nhất.'),
      choice(5, 'に và へ với 行く',
        'Chỉ xét câu đơn chỉ đích đến 「[[明日|あした]]、[[学校|がっこう]]へ[[行きます|いきます]]。」 Nếu thay へ bằng に thì nhận định nào phù hợp nhất?',
        'Câu với に cũng tự nhiên. Hai cách nói có thể cùng chỉ việc đến trường, dù へ thiên về hướng đến và に thiên về điểm đến.',
        ['Câu lập tức sai vì 行く chỉ đi với へ.', 'Câu bắt buộc chuyển nghĩa thành “chỉ đi đến tận cổng, không vào trường”.', 'に chỉ được dùng cho người, nên không dùng với 学校.'],
        'Với một câu 行く chỉ đích đến như ở đây, 学校へ行きます và 学校に行きます đều dùng được. Khác biệt sắc thái không phải một luật cứng về việc có bước vào trường hay không. まで nhấn mạnh giới hạn/điểm tận cùng là quan hệ khác; cũng không được suy ra rằng に và へ thay thế nhau trong mọi mẫu câu.'),
      choice(6, 'から điểm bắt đầu và lý do',
        'So sánh: (1) 「[[九時|くじ]]から[[勉強|べんきょう]]します。」 (2) 「[[明日|あした]]は[[試験|しけん]]があるから、[[今夜|こんや]]は[[早く|はやく]][[寝ます|ねます]]。」 Cách đọc nào đúng?',
        'から ở (1) chỉ mốc bắt đầu; から ở (2) nối mệnh đề nêu lý do với điều được giải thích.',
        ['Cả hai から đều có nghĩa “vì”.', 'Cả hai から đều chỉ nơi xuất phát.', 'から ở (1) chỉ kết thúc; から ở (2) liệt kê hai danh từ.'],
        '九時 là danh ngữ thời gian nên 九時から là “từ 9 giờ”. 試験がある là một mệnh đề hoàn chỉnh; đặt から sau nó tạo phần “vì có kỳ thi”. Đừng dò một bản dịch cố định cho から: hãy xác định đơn vị đứng trước và quan hệ với phần sau.'),
      choice(7, 'と liệt kê và か lựa chọn',
        'Bạn đưa cho khách hai lựa chọn, chỉ cần lấy một loại: trà hoặc cà phê. Cụm nào thể hiện đúng lựa chọn đó?',
        'お[[茶|ちゃ]]かコーヒー',
        ['お[[茶|ちゃ]]とコーヒー', 'お[[茶|ちゃ]]がコーヒー', 'お[[茶|ちゃ]]のコーヒー'],
        'AかB là “A hoặc B”. AとB thường liệt kê cả A và B, không tự mang ý chọn một trong hai. が không phải “hoặc”; の tạo quan hệ bổ nghĩa giữa các danh từ. Đây là đúng kiểu nhầm “お茶がコーヒー” từng cần sửa: lỗi ở quan hệ lựa chọn, không phải ở tên đồ uống.'),
      choice(8, 'の bổ nghĩa và の hỏi',
        'Trong câu thân mật 「[[先生|せんせい]]の[[本|ほん]]を[[読んで|よんで]]いるの？」, hai の có vai trò giống nhau không?',
        'Không. の đầu nối 先生 với 本; の cuối tạo cách hỏi theo ngữ cảnh, không phải sở hữu thêm một danh từ.',
        ['Giống nhau: cả hai đều dịch thành “của”.', 'Giống nhau: cả hai đều là dấu hỏi thay cho か.', 'Không: の đầu đánh dấu chủ ngữ, の cuối đánh dấu tân ngữ.'],
        '先生の本 là một cụm danh từ: quyển sách của thầy/cô. Sau đó 本を読んでいる là mệnh đề “đang đọc quyển sách”; の ở cuối được dùng để hỏi/xác nhận điều đó trong lời nói thân mật. Cùng mặt chữ không có nghĩa là cùng chức năng. Câu này cũng không có một danh từ bị bắt buộc phải thêm sau の cuối.'),
      choice(9, 'ある và いる',
        'Trong lớp có một giáo viên đang sống và một chiếc bàn. Chọn cặp từ điền theo thứ tự: 「[[教室|きょうしつ]]に[[先生|せんせい]]が（①）。[[机|つくえ]]も（②）。」',
        '① います ／ ② あります',
        ['① あります ／ ② います', '① います ／ ② います', '① あります ／ ② あります'],
        'Trong tình huống đã mô tả, người sống dùng いる và chiếc bàn dùng ある. います/あります đều là thể lịch sự không quá khứ. も ở câu sau thêm thông tin “cũng có bàn”; nó không quyết định việc chọn ある hay いる.'),
      choice(10, 'する nhận nghĩa từ ngữ cảnh',
        'So sánh 「[[運動|うんどう]]をします」「[[仕事|しごと]]をします」「テニスをします」. Phân tích nào đúng về します?',
        'Đều là thể lịch sự của する. Hoạt động cụ thể được xác định bởi danh từ/ngữ cảnh: tập thể dục, làm việc, chơi quần vợt.',
        ['Chúng là ba động từ bất quy tắc khác nhau, chỉ tình cờ cùng viết します.', 'します luôn có nghĩa “chế tạo”, nên hai cụm đầu không tự nhiên.', 'を biến します thành thì quá khứ; bỏ を thì không còn động từ.'],
        'する là động từ mang nghĩa khái quát “làm”; します là dạng lịch sự. Danh từ đi cùng giúp xác định “làm hoạt động gì”, vì vậy bản dịch tự nhiên thay đổi. Với nhiều danh từ hoạt động, còn gặp dạng Nする như 運動する; không phải mọi danh từ trong tiếng Nhật đều tự do ghép theo cách này.'),
    ],
  },
  {
    id: 'forms', title: 'II · Câu 11–20 — Tự chia từ và chọn đúng hình thức',
    instructions: 'Mỗi câu 2 điểm; câu có hai ô chia đều 1 điểm mỗi ô. Chỉ nhập phần được yêu cầu, không chép cả câu. Ngoài câu ghi rõ yêu cầu kana/kanji, các cách viết kanji và kana đã liệt kê đều được nhận.',
    questions: [
      fill(11, 'godan う → わない',
        'Đổi động từ かう (mua) sang thể thường, phủ định không quá khứ. Viết hoàn toàn bằng hiragana; không thêm です, dấu câu hoặc phiên âm Latin.\nかう → {{negative}}',
        [['negative', ['かわない']]],
        'かう là godan kết thúc bằng う. Khi tạo dạng ない, hàng này đổi thành わ: かう → かわない, không phải かあない. Đây là dạng phủ định thường; かいません là phủ định lịch sự nên không đúng yêu cầu hình thức của câu này.'),
      fill(12, '会う và 合う: chọn kanji theo nghĩa',
        'Câu này kiểm tra chọn kanji, không chỉ phát âm. Cả hai ô đều đọc là あう. Viết dạng từ điển có kanji, không thêm dấu câu.\n(1) [[明日|あした]]、[[友達|ともだち]]に{{meet}}。— Ngày mai gặp bạn.\n(2) この[[靴|くつ]]は[[足|あし]]に{{fit}}。— Đôi giày này vừa chân.',
        [['meet', ['会う']], ['fit', ['合う']]],
        '会う（あう）là gặp người; 合う（あう）là vừa, hợp, khớp. Cùng cách đọc nhưng khác từ và khác chữ Hán. Ở câu (1), 友達に chỉ người gặp; ở câu (2), 足に là thứ mà đôi giày phù hợp. Nếu chỉ nhớ âm あう mà đổi nhầm kanji, hãy ghi lỗi này vào nhóm từ vựng/kanji, không kết luận rằng mình không biết chia động từ.'),
      fill(13, 'ngoại lệ て của 行く',
        'Viết thể て đầy đủ của [[行く|いく]]. Chỉ viết động từ đã chia, không thêm いる hoặc ください.\n[[行く|いく]] → {{te}}',
        [['te', ['行って', 'いって']]],
        '行く tạo thể て là 行って, không phải 行いて. Đây là ngoại lệ thường gặp so với nhiều động từ godan kết thúc bằng く. 行きます là dạng ます; 行った là dạng quá khứ thường; chúng không thay thế cho thể て đang được yêu cầu.'),
      fill(14, 'godan む → んで',
        'Bạn muốn nói “uống nước rồi đi ra ngoài”, dùng て nối hai hành động. Điền dạng て của [[飲む|のむ]]; phần còn lại đã có sẵn.\n[[水|みず]]を{{drink}}、[[出かけます|でかけます]]。',
        [['drink', ['飲んで', 'のんで']]],
        'Godan kết thúc bằng む đổi sang んで trong thể て: 飲む → 飲んで. Đuôi ở đây là で, không phải て, nhưng vẫn thuộc hệ thể て. 出かけます là vị ngữ cuối, mang mức lịch sự/không quá khứ của lời kể này; không cần chèn ます vào động từ nối phía trước.'),
      fill(15, 'không phân loại mọi động từ る giống nhau',
        'Đổi cả hai động từ sang thể thường, phủ định không quá khứ. Không thêm です.\n(1) [[覚える|おぼえる]] → {{remember}}\n(2) [[帰る|かえる]] → {{return}}',
        [['remember', ['覚えない', 'おぼえない']], ['return', ['帰らない', 'かえらない']]],
        '覚える thuộc ichidan: bỏ る rồi thêm ない → 覚えない. 帰る thuộc godan dù kết thúc bằng える: る đổi sang ら rồi thêm ない → 帰らない. Hình thức kết thúc là dấu hiệu hỗ trợ chứ không phải thuật toán không có ngoại lệ để xác định nhóm động từ.'),
      fill(16, 'い-adjective phủ định quá khứ',
        'Đổi [[高い|たかい]] (đắt) sang thể thường, phủ định quá khứ. Chỉ viết tính từ đã chia; không dùng です hoặc dạng lịch sự ありませんでした.\n[[高い|たかい]] → {{adjective}}',
        [['adjective', ['高くなかった', 'たかくなかった']]],
        '高い → 高くない → 高くなかった. Phần ない tiếp tục biến đổi thành なかった để thể hiện quá khứ. 高いだった và 高いじゃなかった không phải cách chia chuẩn của い-adjective này. Thể lịch sự có thể có cách diễn đạt khác, nhưng câu đang đo đúng dạng thường được yêu cầu.'),
      fill(17, 'な-adjective quá khứ lịch sự',
        'Bây giờ thị trấn rất ồn, nhưng trước kia yên tĩnh. Dùng [[静か|しずか]] và viết cả vị ngữ quá khứ khẳng định lịch sự vào ô. Không thêm dấu chấm.\nその[[町|まち]]は[[昔|むかし]]{{predicate}}。',
        [['predicate', ['静かでした', 'しずかでした']]],
        '静か là な-adjective. Khi kết câu lịch sự ở quá khứ, dùng 静かでした. な xuất hiện khi trực tiếp bổ nghĩa cho danh từ như 静かな町; không đặt nó trước でした. 静かだった là quá khứ thường, đúng ở ngữ cảnh khác nhưng không đáp ứng yêu cầu lịch sự của câu này.'),
      fill(18, 'な trước danh từ và の nối danh từ',
        'Mỗi ô đúng một hiragana. Ô (1) diễn đạt “một thị trấn yên tĩnh”; ô (2) diễn đạt “giáo viên tiếng Nhật”.\n(1) [[静か|しずか]]{{adjectiveLink}}[[町|まち]]\n(2) [[日本語|にほんご]]{{nounLink}}[[先生|せんせい]]',
        [['adjectiveLink', ['な']], ['nounLink', ['の']]],
        '静かな町: な nối な-adjective với danh từ mà nó bổ nghĩa. 日本語の先生: の nối hai danh từ. Không chọn đuôi bằng bản dịch “... của ...” một cách máy móc; trước hết cần biết từ phía trước đang là tính từ hay danh từ.'),
      fill(19, '細い và ngoại lệ いい',
        'Đổi cả hai tính từ sang thể thường, phủ định không quá khứ; không thêm です.\n(1) [[細い|ほそい]] → {{thin}}\n(2) いい → {{good}}',
        [['thin', ['細くない', 'ほそくない']], ['good', ['よくない']]],
        '細い（mảnh/thon/mỏng theo dạng dài, hẹp）chia đều: 細くない. いい dùng gốc よい trong các dạng biến đổi thông thường: よくない, không phải いくない. Đúng dạng phủ định không đồng nghĩa biết mọi nghĩa của từ; hãy ghi riêng nếu bạn chia được nhưng chưa hiểu 細い trong ngữ cảnh.'),
      fill(20, 'する và 来る ở thể て',
        'Viết thể て đầy đủ, không thêm いる.\n(1) [[勉強|べんきょう]]する → {{study}}\n(2) [[来る|くる]] → {{come}}',
        [['study', ['勉強して', 'べんきょうして']], ['come', ['来て', 'きて']]],
        'する → して, nên 勉強する → 勉強して. 来る → 来て, đọc là きて. Đừng giữ cách đọc くる rồi ghép máy móc thành くて. Hai dạng て này còn phải kết hợp với cấu trúc phía sau mới quyết định chức năng cụ thể: nối hành động, ている, てから...'),
    ],
  },
  {
    id: 'scope', title: 'III · Câu 21–30 — Phạm vi mệnh đề, trích dẫn và đuôi câu',
    instructions: 'Mỗi câu 2 điểm. Xác định ai làm gì, nội dung nào nằm trong mệnh đề nào và từ cuối cụm đang đóng vai trò gì. Câu lịch sự không có nghĩa mọi động từ bên trong đều phải mang ます.',
    questions: [
      choice(21, 'chủ thể trong mệnh đề bổ nghĩa',
        'Đọc câu 「[[私|わたし]]は[[友達|ともだち]]が[[昨日|きのう]][[買った|かった]][[本|ほん]]を[[読みました|よみました]]。」 Phân tích nào đúng?',
        '友達 là người mua; 私 là người đọc. Cụm 友達が昨日買った bổ nghĩa cho 本.',
        ['私 là người mua; 友達 là người đọc vì が luôn thắng は.', 'Cả mua và đọc đều do 友達 làm; 私 chỉ là người sở hữu sách.', 'Câu sai vì không được có は và が trong cùng một câu.'],
        'Có hai tầng: 私は［友達が昨日買った本］を読みました. 友達が là chủ thể của hành động 買った ở trong cụm bổ nghĩa; 私は là đề tài, và trong cách hiểu đang xét là người thực hiện 読みました ở mệnh đề chính. Không có luật “trợ từ gần cuối hơn sẽ chiếm tất cả các động từ”.'),
      choice(22, 'người nói, người nghe và người trong nội dung nói',
        '「[[田中|たなか]]さんはアンさんに『[[山田|やまだ]]さんは[[毎朝|まいあさ]][[三キロ|さんキロ]][[歩く|あるく]]』と[[言いました|いいました]]。」 Theo đúng nội dung câu, ai đi bộ ba kilômét mỗi sáng?',
        '山田さん',
        ['田中さん', 'アンさん', 'Cả ba người vì と có nghĩa “cùng với”.'],
        'Mệnh đề chính: 田中さんはアンさんに［nội dung］と言いました — Tanaka nói với Ann. Bên trong nội dung được dẫn, 山田さんは...歩く xác định Yamada là người đi bộ. に đánh dấu người tiếp nhận lời nói; と sau dấu ngoặc đóng đánh dấu nội dung dẫn, không liệt kê những người cùng đi.'),
      fill(23, 'だ trong nội dung dẫn và と đánh dấu trích dẫn',
        'Dẫn lại ý “tôi là sinh viên” bằng một câu danh từ ở thể thường bên trong 『 』. Mỗi ô đúng một hiragana.\nアンさんは『[[私|わたし]]は[[学生|がくせい]]{{copula}}』{{quote}}[[言いました|いいました]]。',
        [['copula', ['だ']], ['quote', ['と']]],
        '学生だ là câu danh từ ở thể thường: 学生 cần hệ từ だ khi làm vị ngữ khẳng định kiểu này. と đứng sau toàn bộ nội dung trích dẫn và nối nó với 言いました. Lịch sự của câu ngoài nằm ở 言いました; không vì vậy mà bắt câu bên trong dùng です. Nếu trích nguyên văn một người nói 学生です thì cũng có thể dẫn nguyên văn như thế, nhưng đề đã yêu cầu nội dung bên trong ở thể thường.'),
      choice(24, 'thể thường trong mệnh đề bổ nghĩa, lịch sự ở cuối',
        'Bạn đã mua sách hôm qua và muốn kể lịch sự rằng hôm nay đọc quyển sách ấy. Chọn câu đúng cấu trúc và đúng quan hệ thời gian đã nêu.',
        '[[今日|きょう]]、[[昨日|きのう]][[買った|かった]][[本|ほん]]を[[読みました|よみました]]。',
        ['[[今日|きょう]]、[[昨日|きのう]][[買いました|かいました]][[本|ほん]]を[[読みました|よみました]]。', '[[今日|きょう]]、[[昨日|きのう]][[買う|かう]][[本|ほん]]を[[読みました|よみました]]。', '[[今日|きょう]]、[[昨日|きのう]][[買って|かって]][[本|ほん]]を[[読みました|よみました]]。'],
        '昨日買った gắn trực tiếp trước 本 để chỉ “quyển sách đã mua hôm qua”. Dạng lịch sự của lời kể chính là 読みました. Không dùng 買いました gắn trực tiếp trước 本 theo cấu trúc bổ nghĩa cơ bản này. 買って là dạng nối, không thay cho 買った để tự tạo nghĩa “đã mua” trước danh từ. Với sự kiện mua đã hoàn tất hôm qua trong tình huống này, chọn 買った.'),
      choice(25, 'んだ của 住んだ không phải hệ từ だ',
        'Trong cụm 「[[東京|とうきょう]]に[[住んだ|すんだ]][[人|ひと]]」, vì sao không được phân tích máy móc thành “住ん + hệ từ だ” như 学生だ?',
        '住んだ là dạng quá khứ thường của động từ 住む; んだ ở đây là kết quả chia động từ, không phải thêm hệ từ vào một danh từ.',
        ['Vì mọi chữ だ sau ん đều chỉ là âm đệm, không có ngữ pháp.', 'Vì 住む đã trở thành な-adjective và phải thêm だ.', 'Vì 人 làm mọi động từ phía trước chuyển sang hiện tại.'],
        '住む → 住んだ theo hệ biến âm của godan kết thúc bằng む khi tạo dạng た. Cả 住んだ là một động từ đã chia, bổ nghĩa cho 人. 学生だ có cấu tạo khác: danh từ 学生 + hệ từ だ. Nhìn trùng một kana ở cuối chưa đủ để kết luận là cùng một thành phần ngữ pháp.'),
      fill(26, 'の hỏi sau động từ và なの sau danh từ',
        'Tạo hai câu hỏi thân mật theo đúng mẫu の mang sắc thái hỏi/xác nhận theo ngữ cảnh; không dùng か. Ô (1) một kana, ô (2) hai kana.\n(1) [[今|いま]]から[[行く|いく]]{{verbQuestion}}？\n(2) アンさんは[[大学生|だいがくせい]]{{nounQuestion}}？',
        [['verbQuestion', ['の']], ['nounQuestion', ['なの']]],
        'Động từ dạng thường nối trực tiếp với の: 行くの？ Danh từ ở kiểu khẳng định này dùng なの: 大学生なの？ Không dùng 大学生だの？ theo cùng mẫu hỏi đang xét. Đây là khác biệt cấu tạo theo loại vị ngữ, không phải tùy thích thêm な để tăng lịch sự.'),
      choice(27, 'よ cung cấp thông tin và ね hướng đến chia sẻ',
        'Bạn biết cửa hàng hôm nay nghỉ, người kia chưa biết và đang định tới đó. Bạn muốn thông báo điều mình biết, không hỏi họ xác nhận. Đuôi nào sát ý định này nhất trong các câu sau?',
        'あの[[店|みせ]]は[[今日|きょう]][[休み|やすみ]]ですよ。',
        ['あの[[店|みせ]]は[[今日|きょう]][[休み|やすみ]]ですね。', 'あの[[店|みせ]]は[[今日|きょう]][[休み|やすみ]]ですか。', 'あの[[店|みせ]]は[[昨日|きのう]][[休み|やすみ]]でした。'],
        'よ phù hợp với việc đưa/cảnh báo thông tin cho người nghe trong tình huống này. ね thường hướng đến sự chia sẻ, đồng tình hoặc xác nhận; か đặt câu hỏi, còn câu dùng 昨日...でした đổi mất ngày cần nói. Không coi よ/ね là hai nhãn cứng có một nghĩa duy nhất trong mọi hội thoại; câu hỏi đã nêu rõ ý định để chọn cách phù hợp nhất.'),
      fill(28, 'これ độc lập và この trước danh từ',
        'Người nói đang cầm đúng quyển sách trên tay mình. Dùng nhóm từ chỉ “cái này” gần người nói. Mỗi ô hai hiragana.\n(1) {{independent}}は[[私|わたし]]の[[本|ほん]]です。\n(2) {{modifier}}[[本|ほん]]は[[私|わたし]]のです。',
        [['independent', ['これ']], ['modifier', ['この']]],
        'これ đứng độc lập như một danh ngữ, còn この phải đi cùng danh từ: この本. Ở câu (2), 私の dùng の thay cho danh từ đã rõ trong ngữ cảnh, hiểu là “quyển của tôi”. Không viết このは hoặc これ本 trong các cấu trúc cơ bản này.'),
      choice(29, 'って trích dẫn trong lời nói thân mật',
        'Trong cuộc nói chuyện thân mật, bạn nghe 「アンさんは『[[明日|あした]]は[[休み|やすみ]]だ』って[[言って|いって]]いたよ。」 って ở đúng câu này làm gì?',
        'Đánh dấu nội dung lời nói được dẫn lại, gần với と trích dẫn trong cách nói thân mật.',
        ['Nối hai hành động theo thứ tự như thể て của động từ.', 'Đánh dấu nơi diễn ra việc nghỉ.', 'Bắt buộc có nghĩa “cùng với Ann”, giống mọi と sau tên người.'],
        '『明日は休みだ』 là toàn bộ nội dung được thuật lại; って gắn sau nội dung đó và trước 言っていた. Đây là cách dùng trích dẫn trong lời nói thân mật, không phải thể て của 言う bị viết lặp. って còn có các cách dùng khác, nên kết luận này dựa vào cấu trúc của chính câu đang xét, không phải quy tắc cho mọi って.'),
      choice(30, 'cụm danh từ không đồng nghĩa một câu hoàn chỉnh',
        'So sánh (A) 「[[昨日|きのう]][[買った|かった]][[本|ほん]]」 và (B) 「[[昨日|きのう]]、[[本|ほん]]を[[買った|かった]]。」 Phân tích nào chính xác nhất khi chúng đứng độc lập như đang viết?',
        'A là cụm danh từ có 本 làm trung tâm; B là một câu kể với 買った làm vị ngữ.',
        ['A và B luôn có cùng cấu trúc vì chứa đúng các từ như nhau.', 'A là câu hỏi còn B là câu phủ định.', 'A có vị ngữ chính là 本, nên đã có nghĩa “tôi đã mua sách” đầy đủ hệt B.'],
        'Trong A, 昨日買った nằm trước 本 và bổ nghĩa cho nó: “quyển sách đã mua hôm qua”. Trong B, 本を là đối tượng của 買った và 買った kết thúc câu kể; chủ thể có thể được hiểu từ ngữ cảnh. Một cụm danh từ vẫn có thể được dùng làm câu trả lời rút gọn trong hội thoại, nhưng điều đó không biến cấu trúc nội bộ của nó thành câu B.'),
    ],
  },
  {
    id: 'te-aspect', title: 'IV · Câu 31–40 — て, ている, てから và mốc もう／まだ',
    instructions: 'Mỗi câu 2 điểm. Phân biệt hình thức với chức năng: nhìn vào động từ, tình huống và phần đi sau て. Chỉ kiểm tra những ứng dụng đã có buổi phân tích cụ thể, không mặc định mọi mẫu chứa て đều đã học.',
    questions: [
      choice(31, 'phạm vi chia của cụm ている',
        'Xét 「[[読んで|よんで]]います」 trong một lời kể lịch sự không quá khứ. Phân tích nào đúng về cấu tạo?',
        '読んで là thể て của 読む; phía sau là いる được chia thành います. Cả cụm tạo thành một vị ngữ.',
        ['読んで tự mang lịch sự, còn います chỉ để nối sang danh từ.', 'います phải là một hành động độc lập “ở” với chủ thể khác người đọc.', 'Cứ xuất hiện て thì mọi phần phía sau đều không còn chia được nữa.'],
        '読む → 読んで; いる → います, kết hợp thành 読んでいます. Khi đổi thời gian/lịch sự/phủ định của cụm này, phần いる có thể tiếp tục biến đổi: 読んでいた, 読んでいません... Không cần dịch いる thành một hành động “ở” riêng biệt của một người khác.'),
      choice(32, 'ている diễn tiến',
        'Bạn nhìn vào bếp đúng lúc mẹ đang cắt rau và nấu bữa tối. Câu 「[[母|はは]]は[[今|いま]]、[[台所|だいどころ]]で[[晩ご飯|ばんごはん]]を[[作って|つくって]]います。」 đang mô tả gì?',
        'Hoạt động nấu bữa tối đang diễn ra tại thời điểm quan sát.',
        ['Một lời hứa rằng ngày mai mới bắt đầu nấu.', 'Một lời khẳng định rằng mẹ chưa từng nấu ăn.', 'Một quy tắc bắt buộc mọi câu có ている đều chỉ thói quen hằng ngày.'],
        'Động từ 作る cùng bối cảnh quan sát hành động đang diễn ra và từ 今 cho cách hiểu diễn tiến. Không phải chỉ thấy 今 là máy móc dịch “đang”, nhưng ở tình huống này bằng chứng đã rõ. ている không tự mang một nhãn duy nhất áp dụng giống nhau cho mọi động từ.'),
      choice(33, 'ている trạng thái sau biến đổi',
        'Bác sĩ thú y xác nhận con chó đã chết từ hôm qua. Hôm nay người ta nói 「あの[[犬|いぬ]]は[[死んで|しんで]]います。」 Trong bối cảnh đó, cách hiểu nào đúng?',
        'Con chó đang ở trạng thái đã chết; không phải quá trình chết đang tiếp tục diễn ra.',
        ['Con chó vẫn chưa chết, chỉ mới sắp chết.', 'Con chó thực hiện thói quen chết nhiều lần mỗi ngày.', 'Câu bắt buộc sai vì việc xảy ra hôm qua chỉ được dùng ました.'],
        '死ぬ chỉ biến cố chuyển sang trạng thái chết; 死んでいる trong bối cảnh này mô tả trạng thái còn tồn tại sau biến cố đó. Thời điểm biến cố là hôm qua không bắt buộc vị ngữ nói về trạng thái hiện tại phải dùng quá khứ. Muốn hiểu đúng cần xét loại sự việc và ngữ cảnh; không lấy một mẹo như “có làm hai lần được không” làm quy tắc tuyệt đối cho mọi ている.'),
      choice(34, 'thói quen có thể diễn đạt bằng hai hình thức',
        'Hai câu (A) 「[[妹|いもうと]]は[[毎日|まいにち]][[料理|りょうり]]をします。」 (B) 「[[妹|いもうと]]は[[毎日|まいにち]][[料理|りょうり]]をしています。」 Trong ngữ cảnh giới thiệu sinh hoạt thường ngày, nhận định nào phù hợp?',
        'Cả hai đều có thể diễn đạt thói quen; B cũng có thể nhấn vào hoạt động được duy trì như một nếp hiện tại.',
        ['Chỉ B được dùng cho thói quen; A chỉ có thể là tương lai.', 'Chỉ A đúng ngữ pháp; ている không bao giờ dùng cho thói quen.', 'B bắt buộc có nghĩa em gái đang nấu liên tục không ngừng suốt mọi ngày.'],
        'Dạng không quá khứ 料理をします có thể nói thói quen. 料理をしています cũng có cách hiểu hoạt động lặp lại/được duy trì, nhất là khi có 毎日 và bối cảnh sinh hoạt. Vì vậy không được coi “thói quen” là tài sản riêng của ている, cũng không được dịch B thành một hành động duy nhất kéo dài liên tục.'),
      fill(35, 'chia phần いる sang quá khứ lịch sự',
        'Ngữ cảnh: hôm qua, đúng 8 giờ, bạn đang đọc sách. Dùng mẫu ている và viết cả động từ “đang đọc” ở quá khứ khẳng định lịch sự.\n[[昨日|きのう]]の[[八時|はちじ]]、[[私|わたし]]は[[本|ほん]]を{{reading}}。',
        [['reading', ['読んでいました', 'よんでいました']]],
        '読む → 読んで, rồi いる → いました: 読んでいました. Mốc 昨日の八時 đặt điểm quan sát trong quá khứ. 読みました chỉ kể đã đọc, không tự giữ ý đang trong quá trình tại mốc quan sát như yêu cầu. 読んでいます giữ không quá khứ nên không phải hình thức đang được hỏi.'),
      choice(36, 'もう + hoàn tất',
        'Bây giờ 13 giờ. Bạn đã ăn xong bữa trưa lúc 12 giờ 20 và chỉ muốn báo rằng việc ăn trưa đã xong. Câu nào sát thông tin đó nhất?',
        'もう[[昼ご飯|ひるごはん]]を[[食べました|たべました]]。',
        ['まだ[[昼ご飯|ひるごはん]]を[[食べて|たべて]]いません。', 'まだ[[昼ご飯|ひるごはん]]を[[食べて|たべて]]います。', 'もう[[昼ご飯|ひるごはん]]は[[食べません|たべません]]。'],
        'もう + 食べました diễn đạt “đã ăn rồi”, nhấn việc đã đạt mốc hoàn tất tính đến hiện tại. まだ...食べていません là chưa ăn; まだ...食べています là vẫn đang ăn; もう...食べません hướng đến “không ăn nữa”, khác hẳn thông báo việc đã hoàn tất. Đừng dịch もう thành “đã” mà bỏ qua dạng vị ngữ đi cùng.'),
      choice(37, 'まだ + trạng thái/hoạt động vẫn tiếp tục',
        'Bạn bắt đầu đọc lúc 8 giờ và lúc 9 giờ vẫn đang đọc. Với câu 「まだこの[[本|ほん]]を[[読んで|よんで]]います。」, cách diễn giải phù hợp nhất là gì?',
        'Đến mốc đang nói, việc đọc vẫn tiếp tục; chưa chuyển sang trạng thái ngừng/đọc xong như có thể được chờ đợi.',
        ['Tôi chưa từng bắt đầu đọc quyển này.', 'Tôi sẽ không đọc quyển này nữa.', 'まだ bắt buộc chỉ thời gian quá khứ nên câu này nói về hôm qua.'],
        'まだ + 読んでいます giữ trạng thái/hoạt động “đang đọc” tiếp diễn đến mốc tham chiếu: “vẫn còn đang đọc”. Nếu là まだ読んでいません thì có ý chưa đọc/chưa đạt việc đọc tính đến mốc đó; hai cách dùng không được gộp thành một bản dịch “chưa”. Trong câu đang xét, ngữ cảnh đã xác nhận người nói bắt đầu đọc.'),
      choice(38, 'もう + phủ định: không còn/nữa',
        'Một người trước đây uống cà phê nhưng hôm nay tuyên bố bỏ thói quen đó: 「もうコーヒーは[[飲みません|のみません]]。」 Ý chính là gì?',
        'Từ mốc này, tôi không uống cà phê nữa.',
        ['Tôi đã uống cà phê xong rồi.', 'Tôi vẫn chưa uống cà phê nhưng nhất định sẽ uống ngay.', 'Tôi chỉ phủ định việc uống trong một thời điểm đã được nêu ở quá khứ.'],
        'もう kết hợp với phủ định ở đây đánh dấu sự chuyển khỏi trạng thái/thói quen cũ: “không ... nữa”. Nghĩa này khác もう飲みました (đã uống rồi) và まだ飲んでいません (chưa uống). Đối chiếu cả trạng từ lẫn khẳng định/phủ định và bối cảnh; không gắn もう với một từ tiếng Việt duy nhất.'),
      fill(39, 'てから nhấn hoàn tất A trước B',
        'Bạn phải ăn tối xong rồi mới làm bài tập. Dùng đúng mẫu Vてから; nhập cả động từ 食べる đã chia và から, không gõ lại dấu phẩy.\n[[晩ご飯|ばんごはん]]を{{before}}、[[宿題|しゅくだい]]をします。',
        [['before', ['食べてから', 'たべてから']]],
        '食べる → 食べて + から → 食べてから. Mẫu đặt việc ăn tối hoàn tất làm mốc trước khi làm bài tập. 食べて có thể nối hai hành động trong nhiều ngữ cảnh, nhưng câu này yêu cầu riêng mẫu てから để nêu rõ quan hệ đó. 食べたから sẽ được đọc theo hướng “vì đã ăn”, không giữ nguyên cấu trúc thời gian đang hỏi.'),
      choice(40, 'て không tự mang thì',
        'Trong lời kể 「[[昨日|きのう]]、[[朝ご飯|あさごはん]]を[[食べて|たべて]]、[[学校|がっこう]]に[[行きました|いきました]]。」, việc ăn sáng được hiểu là đã xảy ra. Giải thích nào đúng nhất?',
        '食べて là dạng nối, không tự đánh dấu thì. Cách hiểu quá khứ của chuỗi sự việc ở câu này đến từ ngữ cảnh 昨日 và vị ngữ cuối 行きました.',
        ['て tự nó là đuôi quá khứ nên gặp て ở đâu cũng phải hiểu là quá khứ.', '食べて bắt buộc nói hiện tại, nên câu có hai mốc thời gian mâu thuẫn.', 'Phải sửa 食べて thành 食べましたて để đồng bộ độ lịch sự.'],
        'Ở câu kể này, hai hành động được nối trong một chuỗi quá khứ nhờ 昨日 và kết câu 行きました. Thể て tự nó không phải thì quá khứ hoặc hiện tại, cũng không có dạng 食べましたて. Kết luận đang áp dụng cho câu và bối cảnh đã cho; không suy rộng thành “mọi sự việc trong mọi mệnh đề trước một đuôi quá khứ đều luôn cùng thời điểm”.'),
    ],
  },
  {
    id: 'reading-a', title: 'V-A · Câu 41–45 — Đọc hiểu: ai làm gì trong thư viện?',
    instructions: 'Mỗi câu 2 điểm. Chỉ dùng thông tin đoạn văn; không gán việc của người trong lời dẫn cho người khác. Có thể bật furigana để đo đọc hiểu/ngữ pháp, thay vì biến toàn phần này thành kiểm tra nhớ kanji.',
    passage: rich('[[今日|きょう]]は[[土曜日|どようび]]です。アンさんは[[毎週|まいしゅう]][[土曜日|どようび]]、[[九時|くじ]]から[[図書館|としょかん]]で[[日本語|にほんご]]を[[勉強|べんきょう]]しています。[[今日|きょう]]は[[八時半|はちじはん]]に[[朝ご飯|あさごはん]]を[[食べて|たべて]]から、バスで[[図書館|としょかん]]に[[来ました|きました]]。\n[[図書館|としょかん]]で[[田中|たなか]]さんに[[会いました|あいました]]。[[田中|たなか]]さんは「[[私|わたし]]はもう[[宿題|しゅくだい]]をしました。でも、アンさんが[[昨日|きのう]][[買った|かった]][[本|ほん]]はまだ[[読んで|よんで]]いません」と[[言いました|いいました]]。\n[[今|いま]]、アンさんはその[[本|ほん]]を[[読んで|よんで]]います。[[田中|たなか]]さんは[[隣|となり]]で[[日本語|にほんご]]の[[言葉|ことば]]を[[覚えて|おぼえて]]います。'),
    questions: [
      choice(41, 'đọc trình tự てから',
        'Theo đoạn văn, việc gì đã diễn ra trước khi Ann đến thư viện hôm nay?',
        'Ann ăn sáng lúc 8 giờ 30.',
        ['Ann đọc xong quyển sách mua hôm qua.', 'Ann làm xong bài tập về nhà cùng Tanaka.', 'Ann gặp Tanaka ở thư viện rồi mới đi xe buýt đến thư viện.'],
        'Đoạn văn đặt 朝ご飯を食べてから trước バスで図書館に来ました: ăn sáng xong rồi đến thư viện bằng xe buýt. Thông tin “đã làm bài tập” thuộc lời của Tanaka, không tự động áp dụng cho Ann. Đoạn văn cũng không nói Ann đã đọc xong sách; ở cuối, Ann đang đọc nó.'),
      choice(42, 'đọc もう và まだ trong lời dẫn',
        'Điều nào được xác nhận trực tiếp về Tanaka tại thời điểm nói?',
        'Tanaka đã làm bài tập nhưng chưa đọc quyển sách Ann mua hôm qua.',
        ['Tanaka chưa làm bài tập và cũng chưa mua sách.', 'Tanaka đã đọc xong sách nhưng chưa làm bài tập.', 'Tanaka là người mua sách hôm qua và giờ đang đưa sách cho Ann.'],
        'Trong lời của Tanaka, 私は chỉ chính Tanaka: もう宿題をしました = đã làm bài tập. Sau でも, chủ thể của 読んでいません vẫn được hiểu là người nói ấy; アンさんが昨日買った là cụm bổ nghĩa cho 本, không đổi người đọc thành Ann. Không suy thêm việc mua/đưa sách không có trong văn bản.'),
      choice(43, 'tham chiếu その本',
        'その本 ở câu gần cuối chỉ quyển nào?',
        'Quyển sách Ann đã mua hôm qua.',
        ['Một quyển sách khác Tanaka vừa mua ở thư viện.', 'Bài tập mà Tanaka đã làm xong.', 'Tất cả sách có trong thư viện vào thứ bảy.'],
        'Cụm danh từ đã được nhắc rõ trước đó là アンさんが昨日買った本. その本 dùng その để trỏ lại đối tượng ấy trong mạch văn. Không có thông tin Tanaka mua quyển khác. Lời dẫn và câu kể bên ngoài có thể cùng nhắc một đối tượng, nhưng vai trò của người mua/người đang đọc cần được theo dõi riêng.'),
      fill(44, 'đọc phương tiện và địa điểm',
        'Điền theo đoạn văn, không thêm trợ từ hoặc です. Ô (1) ghi phương tiện bằng katakana; ô (2) ghi địa điểm bằng kanji hoặc hiragana.\n(1) Ann đến thư viện bằng gì? {{transport}}\n(2) Ann thường học tiếng Nhật ở đâu vào thứ bảy? {{place}}',
        [['transport', ['バス']], ['place', ['図書館', 'としょかん']]],
        'バスで図書館に来ました cho phương tiện là バス. 毎週土曜日、九時から図書館で日本語を勉強しています cho địa điểm học là 図書館. Ở lần xuất hiện đầu, 図書館 là nơi hoạt động học; ở câu di chuyển, nó là đích đến. Hai vai trò không được trộn với phương tiện バス.'),
      fill(45, 'đọc chủ thể ở cuối đoạn',
        'Theo câu cuối, ai đang học/ghi nhớ từ tiếng Nhật ở bên cạnh? Chỉ ghi họ của người ấy bằng kanji hoặc hiragana, không thêm さん.\n{{person}}',
        [['person', ['田中', 'たなか']]],
        'Câu cuối nêu trực tiếp 田中さんは...言葉を覚えています, nên đáp án là 田中. Câu ngay trước nói Ann đang đọc sách. Không lấy đề tài của một câu rồi mặc định giữ nó cho câu kế tiếp khi câu kế tiếp đã nêu một đề tài mới.'),
    ],
  },
  {
    id: 'reading-b', title: 'V-B · Câu 46–50 — Đọc hiểu: tin nhắn và phạm vi lời dẫn',
    instructions: 'Mỗi câu 2 điểm. Phân biệt giờ kết thúc học, giờ hẹn, nơi gặp và nơi trò chuyện; theo dõi nguồn của thông tin trong lời dẫn lồng bên trong tin nhắn.',
    passage: rich('[[土曜日|どようび]]の[[朝|あさ]]、ミンさんからメッセージが[[来ました|きました]]。\n「[[今日|きょう]]は[[十時|じゅうじ]]に[[駅|えき]]で[[会いましょう|あいましょう]]。[[私|わたし]]は[[今|いま]]、[[家|いえ]]で[[日本語|にほんご]]を[[勉強|べんきょう]]しています。[[九時半|くじはん]]まで[[勉強|べんきょう]]して、それから[[駅|えき]]に[[行きます|いきます]]。\nアンさんは[[昨日|きのう]]、[[私|わたし]]に『[[駅|えき]]の[[前|まえ]]の[[喫茶店|きっさてん]]は[[静か|しずか]]だ』と[[言いました|いいました]]。だから、そこで[[話しましょう|はなしましょう]]。[[切符|きっぷ]]はもう[[買いました|かいました]]。でも、[[朝ご飯|あさごはん]]はまだ[[食べて|たべて]]いません。」\nこのメッセージの[[後|あと]]で、ミンさんは[[朝ご飯|あさごはん]]を[[食べて|たべて]]から[[駅|えき]]に[[行きます|いきます]]。'),
    questions: [
      choice(46, 'đọc tách thời gian và địa điểm',
        'Theo lời hẹn trong tin nhắn, hai người gặp nhau khi nào và ở đâu?',
        '10 giờ ở nhà ga.',
        ['9 giờ 30 ở nhà của Min.', '10 giờ ở thư viện.', '9 giờ ở quán cà phê trước ga.'],
        'Lời hẹn là 今日は十時に駅で会いましょう. 九時半まで thuộc phần nói về thời gian Min học ở nhà; 喫茶店 là nơi đề xuất trò chuyện sau đó, không thay thế tự động cho điểm hẹn 駅. Cần gắn mỗi cụm thời gian/địa điểm với đúng vị ngữ mà nó phụ thuộc.'),
      choice(47, 'nguồn phát biểu trong lời dẫn lồng',
        'Trong câu nói về quán cà phê yên tĩnh, ai là người đã nói thông tin ấy cho Min vào hôm qua?',
        'Ann.',
        ['Min nói thông tin ấy cho Ann.', 'Người viết đề nói trực tiếp cho cả hai.', 'Nhân viên nhà ga, vì 駅 đứng trước 喫茶店.'],
        'Trong tin nhắn do Min viết, 私 chỉ Min. Câu アンさんは昨日、私に『...』と言いました nghĩa là Ann đã nói với Min nội dung trong ngoặc. Nguồn phát biểu là Ann; người hiện đang thuật lại trong tin nhắn là Min. 駅の前 chỉ vị trí của quán, không phải một người phát ngôn.'),
      choice(48, 'đọc そこで và lý do',
        'そこで trong 「だから、そこで話しましょう」 ở đoạn này chỉ nơi nào?',
        'Quán cà phê trước nhà ga vừa được nhắc đến.',
        ['Nhà Min, vì Min đang ở nhà.', 'Chính bên trong đoạn tin nhắn, không phải địa điểm ngoài đời.', 'Thư viện nơi Ann từng mua sách ở đoạn đọc trước.'],
        'Trong そこで話しましょう, そこ + で tạo cụm địa điểm của hoạt động nói chuyện. Đối tượng được nhắc ngay trước là 駅の前の喫茶店, và だから nối lý do “quán yên tĩnh” với đề xuất nói chuyện ở đó. Không kéo dữ kiện từ đoạn đọc trước sang vì hai đoạn là hai tình huống độc lập.'),
      fill(49, 'đọc mốc kết thúc với まで',
        'Min nói sẽ học đến mấy giờ? Nhập bằng chữ số theo dạng h:mm; không thêm tiếng Nhật hoặc đơn vị giờ/phút.\n{{time}}',
        [['time', ['9:30', '09:30', '９：３０', '０９：３０']]],
        '九時半まで勉強して nghĩa là học đến 9 giờ 30; まで nêu mốc kết thúc của khoảng học. 十時 là giờ hẹn gặp ở ga. Không lấy giờ của mệnh đề đầu để trả lời về một hoạt động khác ở mệnh đề sau.'),
      fill(50, 'đọc và tái tạo trình tự bằng てから',
        'Dựa câu kể cuối đoạn, hoàn thành câu với đúng mẫu てから ở ô (1) và động từ 行く khẳng định lịch sự không quá khứ ở ô (2). Không gõ lại dấu phẩy/dấu chấm.\nミンさんは[[朝ご飯|あさごはん]]を{{eat}}、[[駅|えき]]に{{go}}。',
        [['eat', ['食べてから', 'たべてから']], ['go', ['行きます', 'いきます']]],
        'Câu cuối xác nhận thứ tự: ăn sáng xong → đi đến ga. Vì đề yêu cầu mẫu てから, ô đầu là 食べてから; ô cuối là 行きます theo yêu cầu lịch sự không quá khứ. Tin nhắn nói “chưa ăn” ở thời điểm gửi không mâu thuẫn với việc người kể cho biết Min sẽ ăn trước khi đi: cần giữ đúng mốc thời gian tham chiếu.'),
    ],
  },
  {
    id: 'analysis', title: 'VI · Câu 51–55 — Phân tích và tự sản xuất câu',
    instructions: 'Phần này không tính vào 100 điểm tự động. Trả lời bằng tiếng Việt kèm ví dụ tiếng Nhật khi được yêu cầu. Sau khi nộp, dùng đáp án tham khảo/checklist để đối chiếu; không cần trùng nguyên văn. Ưu tiên phân tích quan hệ và phạm vi, không chỉ dịch nghĩa.',
    questions: [
      essay(51, 'phản biện quy tắc phủ định → は',
        'Một bạn nói: “テレビがありません sai vì phủ định phải dùng は.”\nHãy (a) đánh giá nhận định; (b) tách vai trò của trợ từ khỏi biến đổi của vị ngữ; (c) tự viết một cặp câu đối chiếu dùng は; (d) nêu một điều không thể suy ra chỉ từ việc có は. Có thể trả lời bằng sơ đồ nếu hữu ích.',
        'Nhận định là sai. テレビがありません vẫn là câu tồn tại phủ định hợp lệ: が gắn với thứ được nói là không hiện diện; ありません là vị ngữ phủ định của あります.\nCó thể hình dung hai trục độc lập: vai trò/tổ chức thông tin của テレビ → が hoặc は; trạng thái tồn tại → あります hoặc ありません. Đổi trục khẳng định/phủ định không tự ép đổi trục trợ từ.\nVí dụ đối chiếu: この部屋にはテレビはあります。でも、ベッドはありません。 Ở đây lấy TV và giường làm hai mục để so sánh “có/không có”.\nChỉ thấy は không đủ để kết luận câu phủ định, cũng không đủ để kết luận vật đó không tồn tại: テレビはあります là câu khẳng định. Tùy ngữ cảnh, は còn làm đề tài, không chỉ đối chiếu.',
        'Checklist: bác bỏ đúng quy tắc tuyệt đối; xác định được が và vị ngữ nằm ở hai tầng khác nhau; ví dụ đối chiếu tự tạo tự nhiên; không gán は = phủ định hoặc が = khẳng định. Nếu bạn chỉ dịch hai câu sang tiếng Việt mà chưa giải thích vì sao thay đổi trợ từ không bắt buộc, phần phân tích vẫn còn thiếu.'),
      essay(52, 'trích dẫn và thay đổi người thuật lại',
        'Nguồn ban đầu: Kimura nói với bạn 「[[私|わたし]]は[[毎朝|まいあさ]][[三キロ|さんキロ]][[歩きます|あるきます]]。」\nBây giờ chính bạn nói với Mai rằng Kimura đi bộ ba kilômét mỗi sáng.\nViết một câu tường thuật có tên người rõ ràng và と; nội dung được dẫn dùng thể thường, câu ngoài dùng lịch sự quá khứ. Sau đó chỉ rõ người nói hiện tại, người nghe, người đi bộ và vì sao không được giữ 私 trong nội dung một cách máy móc. Không bắt buộc dùng đúng cách viết tên Mai trong đáp án mẫu.',
        'Một cách viết: 私はマイさんに「木村さんは毎朝三キロ歩く」と言いました。\nKhung ngoài: 私は／マイさんに／［nội dung］と／言いました. Người nói trong lần thuật lại này là tôi; người nghe là Mai.\nNội dung bên trong: 木村さんは毎朝三キロ歩く. Người đi bộ là Kimura. 歩く ở thể thường đáp ứng yêu cầu, còn 言いました mang lịch sự/quá khứ của hành động thuật lại.\nỞ phát ngôn nguồn, 私 do Kimura nói nên trỏ Kimura. Khi đổi người đang thuật lại và tái diễn đạt nội dung, phải giữ đúng đối tượng được nói đến; nếu để 私 mà không làm rõ đang dẫn nguyên văn lời của Kimura, rất dễ biến người đi bộ thành chính người thuật lại. Giữ nguyên một trích dẫn nguyên văn có lời giới thiệu rõ là một lựa chọn khác, nhưng không phải kiểu tái diễn đạt câu này đang yêu cầu.',
        'Checklist: に gắn đúng người nhận; と gắn đúng toàn bộ nội dung; người đi bộ vẫn là Kimura; phân biệt nguyên văn lời nguồn với nội dung được diễn đạt lại; thể thường bên trong và lịch sự bên ngoài không bị ép đồng nhất. Không cần dịch từng từ nếu sơ đồ của bạn đã theo dõi đúng các vai trò.'),
      essay(53, 'diễn tiến, thói quen, trạng thái và chia phần いる',
        'Phân tích từng trường hợp, không chỉ dịch chữ “đang”: \n(A) Bạn nhìn thấy người đó cầm sách đọc ngay lúc này: 「[[今|いま]]、[[本|ほん]]を[[読んで|よんで]]います。」\n(B) Người đó giới thiệu nếp sinh hoạt: 「[[毎朝|まいあさ]][[公園|こうえん]]で[[走って|はしって]]います。」\n(C) Chị đã về đến nhà từ 10 phút trước và hiện vẫn ở nhà: 「[[姉|あね]]はもう[[家|いえ]]に[[帰って|かえって]]います。」\nChỉ rõ vì sao cùng ている mà cách hiểu khác nhau. Đổi (A) sang quá khứ phủ định lịch sự của cả cụm ている, rồi chỉ phần nào đã được chia.',
        '(A) Diễn tiến: hoạt động đọc đang xảy ra ở điểm quan sát. Bằng chứng đến từ hành động quan sát được, 今 và loại hoạt động 読む.\n(B) Hoạt động lặp lại/thói quen được duy trì: 毎朝 và ngữ cảnh giới thiệu sinh hoạt không mô tả một lần chạy liên tục từ hôm trước đến giờ. 毎朝公園で走ります cũng có thể diễn đạt thói quen.\n(C) Trong ngữ cảnh đã về đến nhà và còn ở đó, 帰っている nêu trạng thái sau việc trở về, không phải chị đang trên đường về. Chính ngữ cảnh “đã tới nơi” giúp chọn cách đọc này.\nĐiểm chung là dạng Vて + いる; không có một phép dịch cứng ている = “đang”. Cần xét loại sự việc, mốc quan sát, từ chỉ thời gian/tần suất và thông tin ngữ cảnh.\nQuá khứ phủ định lịch sự của (A): 本を読んでいませんでした。 Giữ 読んで; chia phần いる thành いませんでした. Cụm này là một vị ngữ đã biến đổi, không phải hai hành động của hai chủ thể.',
        'Checklist: phân biệt đủ ba cách đọc dựa trên bằng chứng; không dùng dấu hiệu đơn lẻ làm quy tắc tuyệt đối; biết thói quen cũng có thể dùng dạng không quá khứ đơn giản; giữ đúng phạm vi biến đổi trong 読んでいませんでした. Không giải thích bằng mẹo “không thể làm lại hai lần” như một quy tắc tổng quát.'),
      essay(54, 'phân tích câu nhiều thành phần',
        'Phân tích câu: 「[[私|わたし]]は[[昨日|きのう]]、[[友達|ともだち]]が[[学校|がっこう]]で[[書いた|かいた]][[手紙|てがみ]]を[[家|いえ]]でゆっくり[[読みました|よみました]]。」\nHãy dùng ngoặc hoặc sơ đồ để chỉ: đề tài ngoài, mệnh đề bổ nghĩa, danh từ trung tâm, người viết, người đọc, nơi viết, nơi đọc, phần chỉ cách thức và vị ngữ chính. Nêu vì sao 友達が không trở thành người thực hiện mọi động từ trong câu và vì sao 書いた không phải 書きました dù câu ngoài lịch sự.',
        'Khung: 私は／昨日／［友達が学校で書いた手紙］を／家で／ゆっくり／読みました。\nTrong cụm danh từ: ［友達が／学校で／書いた］ → 手紙. Danh từ trung tâm là 手紙; người viết là 友達, nơi viết là 学校. Dạng 書いた bổ nghĩa trực tiếp cho 手紙.\nỞ câu ngoài: 私は là đề tài, trong cách hiểu này tôi là người đọc; ［...手紙］を là đối tượng được đọc; 家で là nơi đọc; ゆっくり mô tả cách đọc; 読みました là vị ngữ chính, mang lịch sự/quá khứ. 昨日 tự nhiên đặt thời điểm của lời kể đọc thư; đừng tự suy một ngày viết chính xác nếu ngữ cảnh chưa nêu.\n友達が nằm trong mệnh đề bổ nghĩa chứ không có quyền chi phối mọi động từ ở ngoài cụm. Lịch sự của mệnh đề chính không bắt mệnh đề bổ nghĩa chuyển sang ます; ở cấu trúc này không gắn 書きました trực tiếp trước 手紙.',
        'Checklist: ranh giới cụm danh từ phải chứa đúng 友達が学校で書いた; tách hai で về đúng hai hoạt động; không đảo người viết/người đọc; nhận diện được 手紙を là một khối tân ngữ của mệnh đề ngoài; giải thích hình thức thường bên trong và lịch sự bên ngoài. Dịch xuôi cả câu mà thiếu ranh giới cú pháp chưa đủ.'),
      essay(55, 'tự viết kết hợp các phần đã học',
        'Viết một đoạn 5–7 câu tiếng Nhật về buổi học hôm nay và kế hoạch tối nay. Cần có: (1) một thói quen; (2) một việc đã xong với もう; (3) một việc chưa xong/chưa làm với まだ～ていません; (4) một trình tự Vてから; (5) một nội dung dẫn với と; (6) một lý do với から.\nGiữ rõ ai làm gì và mốc thời gian. Dùng từ quen thuộc; có thể viết kana khi không nhớ kanji. Sau đoạn văn, chọn một câu của mình và tự phân tích các khối của nó bằng tiếng Việt. Không dùng cấu trúc nâng cao chỉ để làm câu dài.',
        'Một đáp án có thể chấp nhận:\n私は毎朝、家で日本語を勉強しています。\n今日はもう新しい言葉を覚えました。\nでも、今日の宿題はまだしていません。\n晩ご飯を食べてから、宿題をします。\nアンさんは「明日は休みだ」と言いました。\n明日は休みだから、今夜は少し長く勉強します。\n宿題が終わってから、本を読みます。\n\nVí dụ tự phân tích: ［晩ご飯を食べてから］／［宿題をします］. Khối đầu xác lập việc ăn tối xong làm mốc trước hoạt động làm bài; を trong mỗi khối gắn với đối tượng của đúng động từ trong khối ấy. します kết thúc lời kể lịch sự không quá khứ.\nKhông cần viết giống câu mẫu. Có thể thay người, nơi, hoạt động và từ vựng miễn giữ đúng các quan hệ và không tự mâu thuẫn về thời gian.',
        'Checklist: đủ 5–7 câu; các thành phần bắt buộc có nghĩa phù hợp chứ không chỉ xuất hiện như từ khóa; もう/まだ gắn đúng trạng thái tại mốc nói; てから đúng thứ tự; nội dung trước と có ranh giới rõ; から giải thích được phần sau; tự phân tích được ít nhất một câu. Đừng coi đoạn này là “đúng” chỉ vì giống mẫu hoặc chứa nhiều kanji.'),
    ],
  },
];

const exam = {
  schemaVersion: 1,
  id: 'jp-deep-review-01-20261028',
  title: 'Đề 01 · Kiểm tra phân tích tiếng Nhật — Phạm vi đã đào sâu',
  description: '55 câu: 50 câu tự chấm / 100 điểm và 5 câu phân tích có đáp án tham khảo. Dựa trên các buổi trao đổi đã xác định đến 28/10/2026, gồm trợ từ, chia từ, mệnh đề, trích dẫn, て・ている・てから và もう／まだ. Đây là bài chẩn đoán theo phạm vi học cá nhân, không phải đề chứng nhận trình độ JLPT.',
  instructions: 'Thời lượng gợi ý: 110 phút (câu 01–20: 25 phút; 21–40: 30 phút; đọc 41–50: 20 phút; phân tích 51–55: 35 phút). Chọn “Sau khi nộp đề” cho lần làm đầu, không tra tài liệu. Mỗi câu 01–50 có tối đa 2 điểm; hai ô thì mỗi ô 1 điểm. Câu 51–55 không tính điểm tự động. Furigana có thể bật khi bị kẹt đọc để tránh nhầm lỗi giải mã kanji với lỗi ngữ pháp; riêng câu 12 cố ý kiểm tra chọn kanji. Ghi riêng số câu phải dùng hỗ trợ đọc nếu bạn muốn đánh giá thuần ngữ pháp. Ngoài yêu cầu riêng từng câu, ô điền chấp nhận các cách viết kanji/kana đã khai báo; không gõ lại dấu câu hoặc phần đã in. Nếu sai, sau khi nộp hãy phân loại: ngữ pháp/phạm vi mệnh đề, ngữ cảnh, từ vựng, hoặc kanji. Không suy ra rằng mọi mẫu N5/N4 hay mọi trạng từ trong danh sách tổng hợp đều đã học.',
  timeLimitMinutes: 110,
  sections,
};

const questions = sections.flatMap(s => s.questions);
assert.equal(questions.length, 55);
assert.deepEqual(questions.map(q => q.id), Array.from({ length: 55 }, (_, i) => id(i + 1)));
const score = questions.reduce((sum, q) => sum + (q.type === 'single_choice' ? q.points : q.type === 'fill_blank' ? q.blanks.reduce((n, b) => n + b.points, 0) : 0), 0);
assert.equal(score, 100);
const filename = 'de-01-phan-tich-2026-10-28.json';
const out = new URL('../../public/exams/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL(filename, out), JSON.stringify(exam, null, 2) + '\n', 'utf8');
const report = { filename, questions: questions.length, score, types: Object.fromEntries(['single_choice', 'fill_blank', 'essay'].map(t => [t, questions.filter(q => q.type === t).length])), answerPositions: Object.fromEntries(['a', 'b', 'c', 'd'].map(p => [p, questions.filter(q => q.correctOptionId === p).length])), coverage };
await mkdir(new URL('../../../artifacts/exams/de-01-20261028/', import.meta.url), { recursive: true });
await writeFile(new URL('../../../artifacts/exams/de-01-20261028/structure-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(new URL(filename, out)), questions: questions.length, score, types: report.types, answerPositions: report.answerPositions }, null, 2));
