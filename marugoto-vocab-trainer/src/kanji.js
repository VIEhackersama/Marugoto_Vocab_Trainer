import { canonicalKanaKey, toHiragana, removeDiacritics, isJapanese } from './dictionary.js';

/**
 * Comprehensive Japanese Kanji mapping dictionary for Marugoto (Starter A1, Elementary A2)
 * and essential daily vocabulary.
 */
export const KANJI_DICTIONARY = [
  // --- Marugoto A1 Lesson 5 & 6 (Food / Meals / たべもの) ---
  { kanji: '魚', reading: 'さかな', romaji: 'sakana', vi: 'cá', tag: 'A1-L5' },
  { kanji: '肉', reading: 'にく', romaji: 'niku', vi: 'thịt', tag: 'A1-L5' },
  { kanji: '卵', reading: 'たまご', romaji: 'tamago', vi: 'trứng', tag: 'A1-L5' },
  { kanji: '水', reading: 'みず', romaji: 'mizu', vi: 'nước', tag: 'A1-L5' },
  { kanji: 'お茶', reading: 'おちゃ', romaji: 'ocha', vi: 'trà, trà Nhật', tag: 'A1-L5' },
  { kanji: '茶', reading: 'ちゃ', romaji: 'cha', vi: 'trà', tag: 'A1-L5' },
  { kanji: 'ご飯', reading: 'ごはん', romaji: 'gohan', vi: 'cơm, bữa ăn', tag: 'A1-L5' },
  { kanji: '牛乳', reading: 'ぎゅうにゅう', romaji: 'gyuunyuu', vi: 'sữa bò', tag: 'A1-L5' },
  { kanji: '果物', reading: 'くだもの', romaji: 'kudamono', vi: 'hoa quả, trái cây', tag: 'A1-L5' },
  { kanji: '野菜', reading: 'やさい', romaji: 'yasai', vi: 'rau', tag: 'A1-L5' },
  { kanji: 'お酒', reading: 'おさけ', romaji: 'osake', vi: 'rượu sake, rượu', tag: 'A1-L5' },
  { kanji: '酒', reading: 'さけ', romaji: 'sake', vi: 'rượu', tag: 'A1-L5' },
  { kanji: '朝ご飯', reading: 'あさごはん', romaji: 'asagohan', vi: 'bữa sáng', tag: 'A1-L5' },
  { kanji: '昼ご飯', reading: 'ひるごはん', romaji: 'hirugohan', vi: 'bữa trưa', tag: 'A1-L5' },
  { kanji: '晩ご飯', reading: 'ばんごはん', romaji: 'bangohan', vi: 'bữa tối', tag: 'A1-L5' },
  { kanji: '食べます', reading: 'たべます', romaji: 'tabemasu', vi: 'ăn', tag: 'A1-L6' },
  { kanji: '食べる', reading: 'たべる', romaji: 'taberu', vi: 'ăn', tag: 'A1-L6' },
  { kanji: '飲みます', reading: 'のみます', romaji: 'nomimasu', vi: 'uống', tag: 'A1-L6' },
  { kanji: '飲む', reading: 'のむ', romaji: 'nomu', vi: 'uống', tag: 'A1-L6' },
  { kanji: '好き', reading: 'すき', romaji: 'suki', vi: 'thích, yêu thích', tag: 'A1-L6' },
  { kanji: '好きな', reading: 'すきな', romaji: 'suki na', vi: 'thích', tag: 'A1-L6' },

  // --- Marugoto A1 Lesson 7 & 8 (Home & Surroundings / いえ) ---
  { kanji: '東', reading: 'ひがし', romaji: 'higashi', vi: 'phía đông', tag: 'A1-L7' },
  { kanji: '西', reading: 'にし', romaji: 'nishi', vi: 'phía tây', tag: 'A1-L7' },
  { kanji: '南', reading: 'みなみ', romaji: 'minami', vi: 'phía nam', tag: 'A1-L7' },
  { kanji: '北', reading: 'きた', romaji: 'kita', vi: 'phía bắc', tag: 'A1-L7' },
  { kanji: '口', reading: 'くち', romaji: 'kuchi', vi: 'miệng, cửa', tag: 'A1-L7' },
  { kanji: '〜口', reading: '〜ぐち', romaji: '~guchi', vi: 'cửa, cổng', tag: 'A1-L7' },
  { kanji: '東口', reading: 'ひがしぐち', romaji: 'higashiguchi', vi: 'cửa đông', tag: 'A1-L7' },
  { kanji: '西口', reading: 'にしぐち', romaji: 'nishiguchi', vi: 'cửa tây', tag: 'A1-L7' },
  { kanji: '南口', reading: 'みなみぐち', romaji: 'minamiguchi', vi: 'cửa nam', tag: 'A1-L7' },
  { kanji: '北口', reading: 'きたぐち', romaji: 'kitaguchi', vi: 'cửa bắc', tag: 'A1-L7' },
  { kanji: '大きい', reading: 'おおきい', romaji: 'ookii', vi: 'to, lớn', tag: 'A1-L8' },
  { kanji: '小さい', reading: 'ちいさい', romaji: 'chiisai', vi: 'nhỏ, bé', tag: 'A1-L8' },
  { kanji: '新しい', reading: 'あたらしい', romaji: 'atarashii', vi: 'mới', tag: 'A1-L8' },
  { kanji: '古い', reading: 'ふるい', romaji: 'furui', vi: 'cũ', tag: 'A1-L8' },
  { kanji: '家', reading: 'いえ', romaji: 'ie', vi: 'nhà', tag: 'A1-L7' },
  { kanji: '家', reading: 'うち', romaji: 'uchi', vi: 'nhà', tag: 'A1-L7' },
  { kanji: '部屋', reading: 'へや', romaji: 'heya', vi: 'căn phòng', tag: 'A1-L7' },

  // --- Marugoto A1 Lesson 9 & 10 (Daily Life / せいかつ) ---
  { kanji: '時', reading: 'じ', romaji: 'ji', vi: 'giờ', tag: 'A1-L9' },
  { kanji: '〜時', reading: '〜じ', romaji: '~ji', vi: 'giờ', tag: 'A1-L9' },
  { kanji: '分', reading: 'ふん', romaji: 'fun', vi: 'phút', tag: 'A1-L9' },
  { kanji: '〜分', reading: '〜ふん', romaji: '~fun', vi: 'phút', tag: 'A1-L9' },
  { kanji: '〜分', reading: '〜ぷん', romaji: '~pun', vi: 'phút', tag: 'A1-L9' },
  { kanji: '半', reading: 'はん', romaji: 'han', vi: 'nửa, rưỡi', tag: 'A1-L9' },
  { kanji: '〜半', reading: '〜はん', romaji: '~han', vi: 'rưỡi, nửa', tag: 'A1-L9' },
  { kanji: '月', reading: 'つき', romaji: 'tsuki', vi: 'mặt trăng, tháng', tag: 'A1-L10' },
  { kanji: '火', reading: 'ひ', romaji: 'hi', vi: 'lửa', tag: 'A1-L10' },
  { kanji: '木', reading: 'き', romaji: 'ki', vi: 'cây, gỗ', tag: 'A1-L10' },
  { kanji: '金', reading: 'きん', romaji: 'kin', vi: 'vàng, tiền', tag: 'A1-L10' },
  { kanji: '土', reading: 'つち', romaji: 'tsuchi', vi: 'đất', tag: 'A1-L10' },
  { kanji: '日', reading: 'ひ', romaji: 'hi', vi: 'mặt trời, ngày', tag: 'A1-L10' },
  { kanji: '月曜日', reading: 'げつようび', romaji: 'getsuyoobi', vi: 'thứ hai', tag: 'A1-L10' },
  { kanji: '火曜日', reading: 'かようび', romaji: 'kayoobi', vi: 'thứ ba', tag: 'A1-L10' },
  { kanji: '水曜日', reading: 'すいようび', romaji: 'suiyoobi', vi: 'thứ tư', tag: 'A1-L10' },
  { kanji: '木曜日', reading: 'もくようび', romaji: 'mokuyoobi', vi: 'thứ năm', tag: 'A1-L10' },
  { kanji: '金曜日', reading: 'きんようび', romaji: 'kin\'yoobi', vi: 'thứ sáu', tag: 'A1-L10' },
  { kanji: '土曜日', reading: 'どようび', romaji: 'doyoobi', vi: 'thứ bảy', tag: 'A1-L10' },
  { kanji: '日曜日', reading: 'にちようび', romaji: 'nichiyoobi', vi: 'chủ nhật', tag: 'A1-L10' },
  { kanji: '朝', reading: 'あさ', romaji: 'asa', vi: 'buổi sáng', tag: 'A1-L9' },
  { kanji: '昼', reading: 'ひる', romaji: 'hiru', vi: 'buổi trưa', tag: 'A1-L9' },
  { kanji: '夜', reading: 'よる', romaji: 'yoru', vi: 'buổi tối, đêm', tag: 'A1-L9' },
  { kanji: '晩', reading: 'ばん', romaji: 'ban', vi: 'buổi tối', tag: 'A1-L9' },
  { kanji: '今', reading: 'いま', romaji: 'ima', vi: 'bây giờ', tag: 'A1-L9' },
  { kanji: '今日', reading: 'きょう', romaji: 'kyoo', vi: 'hôm nay', tag: 'A1-L9' },
  { kanji: '明日', reading: 'あした', romaji: 'ashita', vi: 'ngày mai', tag: 'A1-L9' },
  { kanji: '昨日', reading: 'きのう', romaji: 'kinoo', vi: 'hôm qua', tag: 'A1-L9' },
  { kanji: '起きます', reading: 'おきます', romaji: 'okimasu', vi: 'thức dậy', tag: 'A1-L9' },
  { kanji: '起きる', reading: 'おきる', romaji: 'okiru', vi: 'thức dậy', tag: 'A1-L9' },
  { kanji: '寝ます', reading: 'ねます', romaji: 'nemasu', vi: 'đi ngủ', tag: 'A1-L9' },
  { kanji: '寝る', reading: 'ねる', romaji: 'neru', vi: 'ngủ', tag: 'A1-L9' },

  // --- Marugoto A1 Lesson 11 & 12 (Holidays 1 / やすみのひ 1) ---
  { kanji: '言います', reading: 'いいます', romaji: 'iimasu', vi: 'nói', tag: 'A1-L11' },
  { kanji: '言う', reading: 'いう', romaji: 'iu', vi: 'nói', tag: 'A1-L11' },
  { kanji: '話します', reading: 'はなします', romaji: 'hanashimasu', vi: 'nói chuyện', tag: 'A1-L11' },
  { kanji: '話して', reading: 'はなして', romaji: 'hanashite', vi: 'nói đi, kể đi', tag: 'A1-L11' },
  { kanji: '話す', reading: 'はなす', romaji: 'hanasu', vi: 'nói chuyện', tag: 'A1-L11' },
  { kanji: '読みます', reading: 'よみます', romaji: 'yomimasu', vi: 'đọc', tag: 'A1-L11' },
  { kanji: '読んで', reading: 'よんで', romaji: 'yonde', vi: 'hãy đọc, đọc đi', tag: 'A1-L11' },
  { kanji: '読む', reading: 'よむ', romaji: 'yomu', vi: 'đọc', tag: 'A1-L11' },
  { kanji: '見ます', reading: 'みます', romaji: 'mimasu', vi: 'xem, nhìn', tag: 'A1-L11' },
  { kanji: '見て', reading: 'みて', romaji: 'mite', vi: 'hãy nhìn', tag: 'A1-L11' },
  { kanji: '見る', reading: 'みる', romaji: 'miru', vi: 'xem, nhìn', tag: 'A1-L11' },
  { kanji: '聞きます', reading: 'ききます', romaji: 'kikimasu', vi: 'nghe, hỏi', tag: 'A1-L11' },
  { kanji: '聞いて', reading: 'きいて', romaji: 'kiite', vi: 'hãy lắng nghe', tag: 'A1-L11' },
  { kanji: '聞く', reading: 'きく', romaji: 'kiku', vi: 'nghe', tag: 'A1-L11' },
  { kanji: '書きます', reading: 'かきます', romaji: 'kakimasu', vi: 'viết', tag: 'A1-L11' },
  { kanji: '書いて', reading: 'かいて', romaji: 'kaite', vi: 'hãy viết', tag: 'A1-L11' },
  { kanji: '書く', reading: 'かく', romaji: 'kaku', vi: 'viết', tag: 'A1-L11' },

  // Numbers 1-10 & Counters
  { kanji: '一', reading: 'いち', romaji: 'ichi', vi: 'một, 1', tag: 'A1-L12' },
  { kanji: '二', reading: 'に', romaji: 'ni', vi: 'hai, 2', tag: 'A1-L12' },
  { kanji: '三', reading: 'さん', romaji: 'san', vi: 'ba, 3', tag: 'A1-L12' },
  { kanji: '四', reading: 'よん', romaji: 'yon', vi: 'bốn, 4', tag: 'A1-L12' },
  { kanji: '四', reading: 'し', romaji: 'shi', vi: 'bốn, 4', tag: 'A1-L12' },
  { kanji: '五', reading: 'ご', romaji: 'go', vi: 'năm, 5', tag: 'A1-L12' },
  { kanji: '六', reading: 'ろく', romaji: 'roku', vi: 'sáu, 6', tag: 'A1-L12' },
  { kanji: '七', reading: 'なな', romaji: 'nana', vi: 'bảy, 7', tag: 'A1-L12' },
  { kanji: '七', reading: 'しち', romaji: 'shichi', vi: 'bảy, 7', tag: 'A1-L12' },
  { kanji: '八', reading: 'はち', romaji: 'hachi', vi: 'tám, 8', tag: 'A1-L12' },
  { kanji: '九', reading: 'きゅう', romaji: 'kyuu', vi: 'chín, 9', tag: 'A1-L12' },
  { kanji: '九', reading: 'く', romaji: 'ku', vi: 'chín, 9', tag: 'A1-L12' },
  { kanji: '十', reading: 'じゅう', romaji: 'juu', vi: 'mười, 10', tag: 'A1-L12' },
  { kanji: '年', reading: 'とし', romaji: 'toshi', vi: 'năm, tuổi tác', tag: 'A1-L12' },
  { kanji: '年', reading: 'ねん', romaji: 'nen', vi: 'năm', tag: 'A1-L12' },
  { kanji: '１人', reading: 'ひとり', romaji: 'hitori', vi: 'một người, 1 người', tag: 'A1-L12' },
  { kanji: '一人', reading: 'ひとり', romaji: 'hitori', vi: 'một người', tag: 'A1-L12' },
  { kanji: '２人', reading: 'ふたり', romaji: 'futari', vi: 'hai người, 2 người', tag: 'A1-L12' },
  { kanji: '二人', reading: 'ふたり', romaji: 'futari', vi: 'hai người', tag: 'A1-L12' },
  { kanji: '３人', reading: 'さんにん', romaji: 'san-nin', vi: 'ba người, 3 người', tag: 'A1-L12' },
  { kanji: '三人', reading: 'さんにん', romaji: 'san-nin', vi: 'ba người', tag: 'A1-L12' },
  { kanji: '４人', reading: 'よにん', romaji: 'yo-nin', vi: 'bốn người, 4 người', tag: 'A1-L12' },
  { kanji: '四人', reading: 'よにん', romaji: 'yo-nin', vi: 'bốn người', tag: 'A1-L12' },
  { kanji: '５人', reading: 'ごにん', romaji: 'go-nin', vi: 'năm người, 5 người', tag: 'A1-L12' },
  { kanji: '五人', reading: 'ごにん', romaji: 'go-nin', vi: 'năm người', tag: 'A1-L12' },
  { kanji: '６人', reading: 'ろくにん', romaji: 'roku-nin', vi: 'sáu người, 6 người', tag: 'A1-L12' },
  { kanji: '六人', reading: 'ろくにん', romaji: 'roku-nin', vi: 'sáu người', tag: 'A1-L12' },
  { kanji: '７人', reading: 'ななにん', romaji: 'nana-nin', vi: 'bảy người, 7 người', tag: 'A1-L12' },
  { kanji: '七人', reading: 'ななにん', romaji: 'nana-nin', vi: 'bảy người', tag: 'A1-L12' },
  { kanji: '８人', reading: 'はちにん', romaji: 'hachi-nin', vi: 'tám người, 8 người', tag: 'A1-L12' },
  { kanji: '八人', reading: 'はちにん', romaji: 'hachi-nin', vi: 'tám người', tag: 'A1-L12' },
  { kanji: '９人', reading: 'きゅうにん', romaji: 'kyuu-nin', vi: 'chín người, 9 người', tag: 'A1-L12' },
  { kanji: '九人', reading: 'きゅうにん', romaji: 'kyuu-nin', vi: 'chín người', tag: 'A1-L12' },
  { kanji: '10人', reading: 'じゅうにん', romaji: 'juu-nin', vi: 'mười người, 10 người', tag: 'A1-L12' },
  { kanji: '十人', reading: 'じゅうにん', romaji: 'juu-nin', vi: 'mười người', tag: 'A1-L12' },
  { kanji: '何人', reading: 'なんにん', romaji: 'nan-nin', vi: 'bao nhiêu người, mấy người', tag: 'A1-L12' },
  { kanji: '何歳', reading: 'なんさい', romaji: 'nan-sai', vi: 'mấy tuổi, bao nhiêu tuổi', tag: 'A1-L12' },
  { kanji: '歳', reading: 'さい', romaji: 'sai', vi: 'tuổi', tag: 'A1-L12' },
  { kanji: '〜歳', reading: '〜さい', romaji: '~sai', vi: 'tuổi', tag: 'A1-L12' },

  // --- Marugoto A1 Lesson 13 & 14 (Town / まち) ---
  { kanji: '町', reading: 'まち', romaji: 'machi', vi: 'thị trấn, thành phố', tag: 'A1-L13' },
  { kanji: '右', reading: 'みぎ', romaji: 'migi', vi: 'bên phải', tag: 'A1-L13' },
  { kanji: '左', reading: 'ひだり', romaji: 'hidari', vi: 'bên trái', tag: 'A1-L13' },
  { kanji: '上', reading: 'うえ', romaji: 'ue', vi: 'bên trên, trên', tag: 'A1-L13' },
  { kanji: '下', reading: 'した', romaji: 'shita', vi: 'bên dưới, dưới', tag: 'A1-L13' },
  { kanji: '前', reading: 'まえ', romaji: 'mae', vi: 'phía trước, trước', tag: 'A1-L13' },
  { kanji: '後ろ', reading: 'うしろ', romaji: 'ushiro', vi: 'phía sau, sau', tag: 'A1-L13' },
  { kanji: '中', reading: 'なか', romaji: 'naka', vi: 'bên trong, trong', tag: 'A1-L13' },
  { kanji: '間', reading: 'あいだ', romaji: 'aida', vi: 'ở giữa, khoảng giữa', tag: 'A1-L13' },
  { kanji: '近く', reading: 'ちかく', romaji: 'chikaku', vi: 'gần', tag: 'A1-L13' },
  { kanji: '駅', reading: 'えき', romaji: 'eki', vi: 'nhà ga', tag: 'A1-L13' },
  { kanji: '店', reading: 'みせ', romaji: 'mise', vi: 'cửa hàng, quán', tag: 'A1-L13' },
  { kanji: '川', reading: 'かわ', romaji: 'kawa', vi: 'sông, con sông', tag: 'A1-L13' },
  { kanji: '山', reading: 'やま', romaji: 'yama', vi: 'núi', tag: 'A1-L13' },
  { kanji: '富士山', reading: 'ふじさん', romaji: 'fujisan', vi: 'núi Phú Sĩ', tag: 'A1-L13' },
  { kanji: '海', reading: 'うみ', romaji: 'umi', vi: 'biển', tag: 'A1-L13' },
  { kanji: '空', reading: 'そら', romaji: 'sora', vi: 'bầu trời', tag: 'A1-L13' },

  // --- Marugoto A1 Lesson 15 & 16 (Shopping / かいもの) ---
  { kanji: '買います', reading: 'かいます', romaji: 'kaimasu', vi: 'mua', tag: 'A1-L15' },
  { kanji: '買う', reading: 'かう', romaji: 'kau', vi: 'mua', tag: 'A1-L15' },
  { kanji: 'お金', reading: 'おかね', romaji: 'okane', vi: 'tiền', tag: 'A1-L16' },
  { kanji: '金', reading: 'かね', romaji: 'kane', vi: 'tiền', tag: 'A1-L16' },
  { kanji: '百', reading: 'ひゃく', romaji: 'hyaku', vi: 'trăm, 100', tag: 'A1-L16' },
  { kanji: '千', reading: 'せん', romaji: 'sen', vi: 'nghìn, 1000', tag: 'A1-L16' },
  { kanji: '万', reading: 'まん', romaji: 'man', vi: 'vạn, mười nghìn, 10000', tag: 'A1-L16' },
  { kanji: '円', reading: 'えん', romaji: 'en', vi: 'đồng yên Nhật', tag: 'A1-L16' },
  { kanji: '高い', reading: 'たかい', romaji: 'takai', vi: 'đắt, cao', tag: 'A1-L15' },
  { kanji: '安い', reading: 'やすい', romaji: 'yasui', vi: 'rẻ', tag: 'A1-L15' },

  // --- Marugoto A1 Lesson 17 & 18 (Holidays 2 / やすみのひ 2) ---
  { kanji: '行きます', reading: 'いきます', romaji: 'ikimasu', vi: 'đi', tag: 'A1-L17' },
  { kanji: '行く', reading: 'いく', romaji: 'iku', vi: 'đi', tag: 'A1-L17' },
  { kanji: '来ます', reading: 'きます', romaji: 'kimasu', vi: 'đến', tag: 'A1-L17' },
  { kanji: '来る', reading: 'くる', romaji: 'kuru', vi: 'đến', tag: 'A1-L17' },
  { kanji: '会います', reading: 'あいます', romaji: 'aimasu', vi: 'gặp gỡ, gặp', tag: 'A1-L17' },
  { kanji: '会う', reading: 'あう', romaji: 'au', vi: 'gặp', tag: 'A1-L17' },
  { kanji: '休みます', reading: 'やすみます', romaji: 'yasumimasu', vi: 'nghỉ, nghỉ ngơi', tag: 'A1-L17' },
  { kanji: '休み', reading: 'やすみ', romaji: 'yasumi', vi: 'ngày nghỉ, giờ giải lao', tag: 'A1-L17' },
  { kanji: '日本', reading: 'にほん', romaji: 'nihon', vi: 'nước Nhật Bản, Nhật Bản', tag: 'A1-L1' },
  { kanji: '日本', reading: 'にっぽん', romaji: 'nippon', vi: 'nước Nhật Bản', tag: 'A1-L1' },
  { kanji: '日本語', reading: 'にほんご', romaji: 'nihongo', vi: 'tiếng Nhật', tag: 'A1-L1' },
  { kanji: '日本人', reading: 'にほんじん', romaji: 'nihonjin', vi: 'người Nhật Bản', tag: 'A1-L1' },
  { kanji: '東京', reading: 'とうきょう', romaji: 'tookyoo', vi: 'Tokyo', tag: 'A1-L1' },
  { kanji: '京都', reading: 'きょうと', romaji: 'kyooto', vi: 'Kyoto', tag: 'A1-L1' },
  { kanji: '大阪', reading: 'おおさか', romaji: 'oosaka', vi: 'Osaka', tag: 'A1-L1' },
  { kanji: '広島', reading: 'ひろしま', romaji: 'hiroshima', vi: 'Hiroshima', tag: 'A1-L1' },
  { kanji: '北海道', reading: 'ほっかいどう', romaji: 'hokkaidoo', vi: 'Hokkaido', tag: 'A1-L1' },
  { kanji: '沖縄', reading: 'おきなわ', romaji: 'okinawa', vi: 'Okinawa', tag: 'A1-L1' },
  { kanji: '車', reading: 'くるま', romaji: 'kuruma', vi: 'xe ô tô, xe hơi', tag: 'A1-L17' },
  { kanji: '電車', reading: 'でんしゃ', romaji: 'densha', vi: 'tàu điện', tag: 'A1-L17' },
  { kanji: '自転車', reading: 'じてんしゃ', romaji: 'jitensha', vi: 'xe đạp', tag: 'A1-L17' },
  { kanji: '地下鉄', reading: 'ちかてつ', romaji: 'chikatetsu', vi: 'tàu điện ngầm', tag: 'A1-L17' },
  { kanji: '飛行機', reading: 'ひこうき', romaji: 'hikooki', vi: 'máy bay', tag: 'A1-L17' },
  { kanji: '歩いて', reading: 'あるいて', romaji: 'aruite', vi: 'đi bộ', tag: 'A1-L17' },

  // --- People, Family, School & Jobs (Marugoto A1 Lessons 1 - 4) ---
  { kanji: '人', reading: 'ひと', romaji: 'hito', vi: 'người', tag: 'A1-L1' },
  { kanji: '男', reading: 'おとこ', romaji: 'otoko', vi: 'nam, con trai', tag: 'A1-L3' },
  { kanji: '女', reading: 'おんな', romaji: 'onna', vi: 'nữ, con gái', tag: 'A1-L3' },
  { kanji: '男の人', reading: 'おとこのひと', romaji: 'otoko-no-hito', vi: 'người đàn ông, con trai', tag: 'A1-L3' },
  { kanji: '女の人', reading: 'おんなのひと', romaji: 'onna-no-hito', vi: 'người phụ nữ, cô gái', tag: 'A1-L3' },
  { kanji: '男の子', reading: 'おとこのこ', romaji: 'otoko-no-ko', vi: 'cậu bé, bé trai', tag: 'A1-L3' },
  { kanji: '女の子', reading: 'おんなのこ', romaji: 'onna-no-ko', vi: 'bé gái', tag: 'A1-L3' },
  { kanji: '子', reading: 'こ', romaji: 'ko', vi: 'đứa trẻ, con', tag: 'A1-L3' },
  { kanji: '子供', reading: 'こども', romaji: 'kodomo', vi: 'trẻ em, trẻ con, con', tag: 'A1-L3' },
  { kanji: '家族', reading: 'かぞく', romaji: 'kazoku', vi: 'gia đình', tag: 'A1-L3' },
  { kanji: '父', reading: 'ちち', romaji: 'chichi', vi: 'bố (của mình)', tag: 'A1-L3' },
  { kanji: '母', reading: 'はは', romaji: 'haha', vi: 'mẹ (của mình)', tag: 'A1-L3' },
  { kanji: 'お父さん', reading: 'おとうさん', romaji: 'otoosan', vi: 'bố (của người khác)', tag: 'A1-L3' },
  { kanji: 'お母さん', reading: 'おかあさん', romaji: 'okaasan', vi: 'mẹ (của người khác)', tag: 'A1-L3' },
  { kanji: '兄', reading: 'あに', romaji: 'ani', vi: 'anh trai (của mình)', tag: 'A1-L3' },
  { kanji: '姉', reading: 'あね', romaji: 'ane', vi: 'chị gái (của mình)', tag: 'A1-L3' },
  { kanji: 'お兄さん', reading: 'おにいさん', romaji: 'oniisan', vi: 'anh trai (của người khác)', tag: 'A1-L3' },
  { kanji: 'お姉さん', reading: 'おねえさん', romaji: 'oneesan', vi: 'chị gái (của người khác)', tag: 'A1-L3' },
  { kanji: '弟', reading: 'おとうと', romaji: 'otooto', vi: 'em trai (của mình)', tag: 'A1-L3' },
  { kanji: '弟さん', reading: 'おとうとさん', romaji: 'otootosan', vi: 'em trai (của người khác)', tag: 'A1-L3' },
  { kanji: '妹', reading: 'いもうと', romaji: 'imooto', vi: 'em gái (của mình)', tag: 'A1-L3' },
  { kanji: '妹さん', reading: 'いもうとさん', romaji: 'imootosan', vi: 'em gái (của người khác)', tag: 'A1-L3' },
  { kanji: '夫', reading: 'おっと', romaji: 'otto', vi: 'chồng (của mình)', tag: 'A1-L3' },
  { kanji: '妻', reading: 'つま', romaji: 'tsuma', vi: 'vợ (của mình)', tag: 'A1-L3' },
  { kanji: 'ご主人', reading: 'ごしゅじん', romaji: 'goshujin', vi: 'chồng (của người khác)', tag: 'A1-L3' },
  { kanji: '奥さん', reading: 'おくさん', romaji: 'okusan', vi: 'vợ (của người khác)', tag: 'A1-L3' },
  { kanji: 'お子さん', reading: 'おこさん', romaji: 'okosan', vi: 'con (của người khác)', tag: 'A1-L3' },
  { kanji: '友達', reading: 'ともだち', romaji: 'tomodachi', vi: 'bạn bè', tag: 'A1-L3' },
  { kanji: '先生', reading: 'せんせい', romaji: 'sensee', vi: 'giáo viên, thầy giáo, cô giáo', tag: 'A1-L1' },
  { kanji: '学生', reading: 'がくせい', romaji: 'gakusee', vi: 'học sinh, sinh viên', tag: 'A1-L1' },
  { kanji: '会社', reading: 'かいしゃ', romaji: 'kaisha', vi: 'công ty', tag: 'A1-L2' },
  { kanji: '会社員', reading: 'かいしゃいん', romaji: 'kaishain', vi: 'nhân viên công ty', tag: 'A1-L2' },
  { kanji: '公務員', reading: 'こうむいん', romaji: 'koomuin', vi: 'viên chức nhà nước, công chức', tag: 'A1-L2' },
  { kanji: '教師', reading: 'きょうし', romaji: 'kyooshi', vi: 'giáo viên', tag: 'A1-L2' },
  { kanji: '教室', reading: 'きょうしつ', romaji: 'kyooshitsu', vi: 'phòng học', tag: 'A1-L2' },
  { kanji: '学校', reading: 'がっこう', romaji: 'gakkoo', vi: 'trường học', tag: 'A1-L2' },
  { kanji: '主婦', reading: 'しゅふ', romaji: 'shufu', vi: 'nội trợ', tag: 'A1-L2' },
  { kanji: '授業', reading: 'じゅぎょう', romaji: 'jugyoo', vi: 'giờ học, tiết học', tag: 'A1-L2' },
  { kanji: '質問', reading: 'しつもん', romaji: 'shitsumon', vi: 'câu hỏi', tag: 'A1-L2' },
  { kanji: '本', reading: 'ほん', romaji: 'hon', vi: 'sách', tag: 'A1-L2' },
  { kanji: '机', reading: 'つくえ', romaji: 'tsukue', vi: 'cái bàn', tag: 'A1-L2' },
  { kanji: '椅子', reading: 'いす', romaji: 'isu', vi: 'cái ghế', tag: 'A1-L2' },
  { kanji: '時計', reading: 'とけい', romaji: 'tokee', vi: 'đồng hồ', tag: 'A1-L2' },
  { kanji: '窓', reading: 'まど', romaji: 'mado', vi: 'cửa sổ', tag: 'A1-L2' },
  { kanji: '国', reading: 'くに', romaji: 'kuni', vi: 'đất nước, quốc gia', tag: 'A1-L1' },
  { kanji: '韓国', reading: 'かんこく', romaji: 'kankoku', vi: 'nước Hàn Quốc', tag: 'A1-L1' },
  { kanji: '韓国語', reading: 'かんこくご', romaji: 'kankokugo', vi: 'tiếng Hàn Quốc', tag: 'A1-L1' },
  { kanji: '韓国人', reading: 'かんこくじん', romaji: 'kankokujin', vi: 'người Hàn Quốc', tag: 'A1-L1' },
  { kanji: '中国', reading: 'ちゅうごく', romaji: 'chuugoku', vi: 'nước Trung Quốc', tag: 'A1-L1' },
  { kanji: '中国語', reading: 'ちゅうごくご', romaji: 'chuugokugo', vi: 'tiếng Trung Quốc', tag: 'A1-L1' },
  { kanji: '中国人', reading: 'ちゅうごくじん', romaji: 'chuugokujin', vi: 'người Trung Quốc', tag: 'A1-L1' },
  { kanji: '英語', reading: 'えいご', romaji: 'eego', vi: 'tiếng Anh', tag: 'A1-L1' },
  { kanji: '名前', reading: 'なまえ', romaji: 'namae', vi: 'tên', tag: 'A1-L1' },
  { kanji: '名刺', reading: 'めいし', romaji: 'meeshi', vi: 'danh thiếp', tag: 'A1-L1' },
  { kanji: '犬', reading: 'いぬ', romaji: 'inu', vi: 'con chó', tag: 'A1-L3' },
  { kanji: '猫', reading: 'ねこ', romaji: 'neko', vi: 'con mèo', tag: 'A1-L3' },
  { kanji: '鳥', reading: 'とり', romaji: 'tori', vi: 'con chim', tag: 'A1-L3' },
  { kanji: '私', reading: 'わたし', romaji: 'watashi', vi: 'tôi', tag: 'A1-L1' },
  { kanji: '私たち', reading: 'わたしたち', romaji: 'watashitachi', vi: 'chúng tôi, chúng ta', tag: 'A1-L1' },
  { kanji: '勉強', reading: 'べんきょう', romaji: 'benkyoo', vi: 'học tập, việc học', tag: 'A1-L2' },
  { kanji: '勉強中', reading: 'べんきょうちゅう', romaji: 'benkyoo-chuu', vi: 'đang học', tag: 'A1-L2' },
  { kanji: '仕事', reading: 'しごと', romaji: 'shigoto', vi: 'công việc', tag: 'A1-L2' },
  { kanji: 'お仕事', reading: 'おしごと', romaji: 'oshigoto', vi: 'công việc', tag: 'A1-L2' },
  { kanji: '例', reading: 'れい', romaji: 'ree', vi: 'ví dụ', tag: 'A1-L2' },
  { kanji: '若', reading: 'わか', romaji: 'waka', vi: 'trẻ', tag: 'A1-L3' },
  { kanji: '若い', reading: 'わかい', romaji: 'wakai', vi: 'trẻ, trẻ tuổi', tag: 'A1-L3' },
  { kanji: '同じ', reading: 'おなじ', romaji: 'onaji', vi: 'giống, tương tự', tag: 'A1-L2' },
  { kanji: '危険', reading: 'きけん', romaji: 'kiken', vi: 'nguy hiểm', tag: 'A1-L2' },
  { kanji: '風', reading: 'かぜ', romaji: 'kaze', vi: 'gió, cảm lạnh', tag: 'A1-L2' },
  { kanji: '綺麗', reading: 'きれい', romaji: 'kiree', vi: 'đẹp, sạch sẽ', tag: 'A1-L3' },
  { kanji: '綺麗(な)', reading: 'きれい(な)', romaji: 'kiree(na)', vi: 'xinh đẹp', tag: 'A1-L3' },
  { kanji: '大変', reading: 'たいへん', romaji: 'taihen', vi: 'vất vả, khó khăn', tag: 'A1-L2' },
  { kanji: '分かります', reading: 'わかります', romaji: 'wakarimasu', vi: 'hiểu, biết', tag: 'A1-L2' },
  { kanji: '分かりました', reading: 'わかりました', romaji: 'wakarimashita', vi: 'hiểu rồi, biết rồi', tag: 'A1-L2' },
  { kanji: '分かりません', reading: 'わかりません', romaji: 'wakarimasen', vi: 'không hiểu', tag: 'A1-L2' },
  { kanji: '何', reading: 'なに', romaji: 'nani', vi: 'cái gì', tag: 'A1-L1' },
  { kanji: '何', reading: 'なん', romaji: 'nan', vi: 'cái gì, mấy', tag: 'A1-L1' },
  { kanji: '誰', reading: 'だれ', romaji: 'dare', vi: 'ai', tag: 'A1-L1' },
  { kanji: '雨', reading: 'あめ', romaji: 'ame', vi: 'mưa', tag: 'A1-L10' },
  { kanji: '花', reading: 'はな', romaji: 'hana', vi: 'hoa', tag: 'A1-L10' },
  { kanji: '天気', reading: 'てんき', romaji: 'tenki', vi: 'thời tiết', tag: 'A1-L10' },
  { kanji: '手', reading: 'て', romaji: 'te', vi: 'bàn tay, tay', tag: 'A1' },
  { kanji: '足', reading: 'あし', romaji: 'ashi', vi: 'chân, bàn chân', tag: 'A1' },
  { kanji: '目', reading: 'め', romaji: 'me', vi: 'mắt', tag: 'A1' },
  { kanji: '耳', reading: 'みみ', romaji: 'mimi', vi: 'tai', tag: 'A1' },
  { kanji: '体', reading: 'からだ', romaji: 'karada', vi: 'cơ thể', tag: 'A1' },
  { kanji: '頭', reading: 'あたま', romaji: 'atama', vi: 'đầu', tag: 'A1' },
  { kanji: '電話', reading: 'でんわ', romaji: 'denwa', vi: 'điện thoại', tag: 'A1' },
  { kanji: '手紙', reading: 'てがみ', romaji: 'tegami', vi: 'thư, lá thư', tag: 'A1' },
  { kanji: '切符', reading: 'きっぷ', romaji: 'kippu', vi: 'vé', tag: 'A1' },
  { kanji: '切手', reading: 'きって', romaji: 'kitte', vi: 'con tem', tag: 'A1' },
  { kanji: '写真', reading: 'しゃしん', romaji: 'shashin', vi: 'bức ảnh, ảnh', tag: 'A1' },
  { kanji: '音楽', reading: 'おんがく', romaji: 'ongaku', vi: 'âm nhạc', tag: 'A1' },
  { kanji: '映画', reading: 'えいが', romaji: 'eega', vi: 'bộ phim, phim', tag: 'A1' },
  { kanji: '歌', reading: 'うた', romaji: 'uta', vi: 'bài hát', tag: 'A1' },
  { kanji: '歌います', reading: 'うたいます', romaji: 'utaimasu', vi: 'hát', tag: 'A1' },
  { kanji: '旅行', reading: 'りょこう', romaji: 'ryokoo', vi: 'du lịch', tag: 'A1' },
  { kanji: '病院', reading: 'びょういん', romaji: 'byooin', vi: 'bệnh viện', tag: 'A1' },
  { kanji: '薬', reading: 'くすり', romaji: 'kusuri', vi: 'thuốc', tag: 'A1' },
  { kanji: '銀行', reading: 'ぎんこう', romaji: 'ginkoo', vi: 'ngân hàng', tag: 'A1' },
  { kanji: '郵便局', reading: 'ゆうびんきょく', romaji: 'yuubinkyoku', vi: 'bưu điện', tag: 'A1' },
  { kanji: '図書館', reading: 'としょかん', romaji: 'toshokan', vi: 'thư viện', tag: 'A1' },
  { kanji: '公園', reading: 'こうえん', romaji: 'kooen', vi: 'công viên', tag: 'A1' },
  { kanji: '空港', reading: 'くうこう', romaji: 'kuukoo', vi: 'sân bay', tag: 'A1' },
  { kanji: 'お寺', reading: 'おてら', romaji: 'otera', vi: 'chùa', tag: 'A1' },
  { kanji: '寺', reading: 'てら', romaji: 'tera', vi: 'chùa', tag: 'A1' },
  { kanji: '神社', reading: 'じんじゃ', romaji: 'jinja', vi: 'đền thần đạo', tag: 'A1' },
  { kanji: '道', reading: 'みち', romaji: 'michi', vi: 'con đường, đường', tag: 'A1' },
  { kanji: '橋', reading: 'はし', romaji: 'hashi', vi: 'cây cầu', tag: 'A1' },
  { kanji: '地図', reading: 'ちず', romaji: 'chizu', vi: 'bản đồ', tag: 'A1' },
  { kanji: '場所', reading: 'ばしょ', romaji: 'basho', vi: 'địa điểm, nơi chốn', tag: 'A1' },
  { kanji: '所', reading: 'ところ', romaji: 'tokoro', vi: 'nơi, chỗ', tag: 'A1' },
  { kanji: '料理', reading: 'りょうり', romaji: 'ryoori', vi: 'món ăn, nấu ăn', tag: 'A1' },
  { kanji: '飲み物', reading: 'のみもの', romaji: 'nomimono', vi: 'đồ uống', tag: 'A1' },
  { kanji: '食べ物', reading: 'たべもの', romaji: 'tabemono', vi: 'đồ ăn, thức ăn', tag: 'A1' },
  { kanji: '買い物', reading: 'かいもの', romaji: 'kaimono', vi: 'mua sắm', tag: 'A1' },
  { kanji: '荷物', reading: 'にもつ', romaji: 'nimotsu', vi: 'hành lý', tag: 'A1' },
  { kanji: '動物', reading: 'どうぶつ', romaji: 'doobutsu', vi: 'động vật', tag: 'A1' },
  { kanji: '世界', reading: 'せかい', romaji: 'sekai', vi: 'thế giới', tag: 'A1' },
  { kanji: '言葉', reading: 'ことば', romaji: 'kotoba', vi: 'từ ngữ, lời nói', tag: 'A1' },
  { kanji: '辞書', reading: 'じしょ', romaji: 'jisho', vi: 'từ điển', tag: 'A1' },
  { kanji: '漢字', reading: 'かんじ', romaji: 'kanji', vi: 'chữ Hán, Kanji', tag: 'A1' },
  { kanji: '上手', reading: 'じょうず', romaji: 'joozu', vi: 'giỏi, khéo', tag: 'A1' },
  { kanji: '下手', reading: 'へた', romaji: 'heta', vi: 'kém, vụng', tag: 'A1' },
  { kanji: '元気', reading: 'げんき', romaji: 'genki', vi: 'khỏe mạnh', tag: 'A1' },
  { kanji: '元気な', reading: 'げんきな', romaji: 'genki na', vi: 'khỏe mạnh', tag: 'A1' },
  { kanji: '静か', reading: 'しずか', romaji: 'shizuka', vi: 'yên tĩnh', tag: 'A1' },
  { kanji: '静かな', reading: 'しずかな', romaji: 'shizuka na', vi: 'yên tĩnh', tag: 'A1' },
  { kanji: '有名', reading: 'ゆうめい', romaji: 'yuumei', vi: 'nổi tiếng', tag: 'A1' },
  { kanji: '便利', reading: 'べんり', romaji: 'benri', vi: 'tiện lợi', tag: 'A1' },
  { kanji: '暇', reading: 'ひま', romaji: 'hima', vi: 'rảnh rỗi', tag: 'A1' },
  { kanji: '忙しい', reading: 'いそがしい', romaji: 'isogashii', vi: 'bận rộn', tag: 'A1' },
  { kanji: '面白い', reading: 'おもしろい', romaji: 'omoshiroi', vi: 'thú vị, hay', tag: 'A1' },
  { kanji: '楽しい', reading: 'たのしい', romaji: 'tanoshii', vi: 'vui vẻ', tag: 'A1' },
  { kanji: '美味しい', reading: 'おいしい', romaji: 'oishii', vi: 'ngon', tag: 'A1' },
  { kanji: '早い', reading: 'はやい', romaji: 'hayai', vi: 'sớm', tag: 'A1' },
  { kanji: '速い', reading: 'はやい', romaji: 'hayai', vi: 'nhanh', tag: 'A1' },
  { kanji: '遅い', reading: 'おそい', romaji: 'osoi', vi: 'chậm, muộn', tag: 'A1' },
  { kanji: '近い', reading: 'ちかい', romaji: 'chikai', vi: 'gần', tag: 'A1' },
  { kanji: '遠い', reading: 'とおい', romaji: 'tooi', vi: 'xa', tag: 'A1' },
  { kanji: '明るい', reading: 'あかるい', romaji: 'akarui', vi: 'sáng sủa', tag: 'A1' },
  { kanji: '暗い', reading: 'くらい', romaji: 'kurai', vi: 'tối', tag: 'A1' },
  { kanji: '広い', reading: 'ひろい', romaji: 'hiroi', vi: 'rộng', tag: 'A1' },
  { kanji: '狭い', reading: 'せまい', romaji: 'semai', vi: 'hẹp', tag: 'A1' },
  { kanji: '長い', reading: 'ながい', romaji: 'nagai', vi: 'dài', tag: 'A1' },
  { kanji: '短い', reading: 'みじかい', romaji: 'mijikai', vi: 'ngắn', tag: 'A1' },
  { kanji: '多い', reading: 'おおい', romaji: 'ooi', vi: 'nhiều', tag: 'A1' },
  { kanji: '少ない', reading: 'すくない', romaji: 'sukunai', vi: 'ít', tag: 'A1' },
  { kanji: '暑い', reading: 'あつい', romaji: 'atsui', vi: 'nóng (thời tiết)', tag: 'A1' },
  { kanji: '寒い', reading: 'さむい', romaji: 'samui', vi: 'lạnh (thời tiết)', tag: 'A1' },
  { kanji: '暖かい', reading: 'あたたかい', romaji: 'atatakai', vi: 'ấm áp', tag: 'A1' },
  { kanji: '涼しい', reading: 'すずしい', romaji: 'suzushii', vi: 'mát mẻ', tag: 'A1' },
  { kanji: '良い', reading: 'いい', romaji: 'ii', vi: 'tốt, đẹp, hay', tag: 'A1' },
  { kanji: '良い', reading: 'よい', romaji: 'yoi', vi: 'tốt', tag: 'A1' },
  { kanji: '始まります', reading: 'はじまります', romaji: 'hajimarimasu', vi: 'bắt đầu', tag: 'A1' },
  { kanji: '始めます', reading: 'はじめます', romaji: 'hajimemasu', vi: 'bắt đầu', tag: 'A1' },
  { kanji: '終わります', reading: 'おわります', romaji: 'owarimasu', vi: 'kết thúc, hết, xong', tag: 'A1' },
  { kanji: '開けます', reading: 'あけます', romaji: 'akemasu', vi: 'mở', tag: 'A1' },
  { kanji: '閉めます', reading: 'しめます', romaji: 'shimemasu', vi: 'đóng', tag: 'A1' },
  { kanji: '待ちます', reading: 'まちます', romaji: 'machimasu', vi: 'chờ, đợi', tag: 'A1' },
  { kanji: '持ちます', reading: 'もちます', romaji: 'mochimasu', vi: 'cầm, mang theo', tag: 'A1' },
  { kanji: '住みます', reading: 'すみます', romaji: 'sumimasu', vi: 'sinh sống', tag: 'A1' },
  { kanji: '住んでいます', reading: 'すんでいます', romaji: 'sundeimasu', vi: 'đang sống', tag: 'A1' },
  { kanji: '働きます', reading: 'はたらきます', romaji: 'hatarakimasu', vi: 'làm việc', tag: 'A1' },
  { kanji: '作ります', reading: 'つくります', romaji: 'tsukurimasu', vi: 'chế tạo, nấu, làm', tag: 'A1' },
  { kanji: '使います', reading: 'つかいます', romaji: 'tsukaimasu', vi: 'dùng, sử dụng', tag: 'A1' },
  { kanji: '教えます', reading: 'おしえます', romaji: 'oshiemasu', vi: 'dạy học, chỉ bảo', tag: 'A1' },
  { kanji: '習います', reading: 'ならいます', romaji: 'naraimasu', vi: 'học tập, học', tag: 'A1' },
  { kanji: '知ります', reading: 'しります', romaji: 'shirimasu', vi: 'biết', tag: 'A1' },
];

/**
 * Check if a string contains Kanji (CJK Unified Ideographs).
 */
export function hasKanji(str) {
  return /[\u4e00-\u9faf\u3400-\u4dbf]/.test(str || '');
}

/**
 * Deconstructs a Japanese string like "魚（さかな）", "学生(がくせい)", "さかな", or "魚"
 * into kanji and reading parts.
 */
export function parseKanjiReading(str) {
  const text = (str || '').trim();
  if (!text) return { kanji: '', reading: '', hasKanji: false, formatted: '' };

  // Match Kanji（Kana） or Kana（Kanji）
  const parenMatch = text.match(/^([^\(（]+)[\(（]([^\)）]+)[\)）]$/);
  if (parenMatch) {
    const part1 = parenMatch[1].trim();
    const part2 = parenMatch[2].trim();
    if (hasKanji(part1)) {
      return {
        kanji: part1,
        reading: part2,
        hasKanji: true,
        formatted: `${part1}（${part2}）`,
      };
    }
    if (hasKanji(part2)) {
      // Kana(Kanji) variant: e.g. がくせい（学生）
      return {
        kanji: part2,
        reading: part1,
        hasKanji: true,
        formatted: `${part2}（${part1}）`,
      };
    }
  }

  // Pure Kanji or Kanji with Okurigana without paren (e.g. 魚, 食べます)
  if (hasKanji(text)) {
    return {
      kanji: text,
      reading: '',
      hasKanji: true,
      formatted: text,
    };
  }

  // Pure Kana
  return {
    kanji: '',
    reading: text,
    hasKanji: false,
    formatted: text,
  };
}

/**
 * Format Kanji and reading according to user's desired style:
 * - 'ruby': "魚（さかな）" (Kanji with Kana in parentheses)
 * - 'kanji-only': "魚"
 * - 'kana-only': "さかな"
 */
export function formatKanjiTerm(kanji, reading, style = 'ruby') {
  const cleanKanji = (kanji || '').trim();
  const cleanReading = (reading || '').trim();

  if (style === 'kana-only') return cleanReading || cleanKanji;
  if (!cleanKanji) return cleanReading;
  if (style === 'kanji-only') return cleanKanji;

  // 'ruby' style: Kanji（Kana）
  if (cleanReading && cleanReading !== cleanKanji) {
    return `${cleanKanji}（${cleanReading}）`;
  }
  return cleanKanji;
}

/**
 * Searches the Kanji dictionary to find matching Kanji suggestions for a word.
 * Matches by Kana, Romaji, or Vietnamese meaning keywords.
 */
export function findKanjiSuggestions(cardOrQuery) {
  let searchKana = '';
  let searchRomaji = '';
  let searchVi = '';
  let rawJp = '';

  if (typeof cardOrQuery === 'string') {
    const trimmed = cardOrQuery.trim();
    if (isJapanese(trimmed)) {
      searchKana = canonicalKanaKey(trimmed);
      rawJp = trimmed;
    } else {
      searchRomaji = trimmed.toLowerCase();
      searchVi = trimmed.toLowerCase();
    }
  } else if (cardOrQuery) {
    rawJp = (cardOrQuery.jp || '').trim();
    if (rawJp && isJapanese(rawJp)) {
      searchKana = canonicalKanaKey(cardOrQuery);
    }
    searchRomaji = (cardOrQuery.romaji || '').toLowerCase().trim();
    searchVi = (cardOrQuery.vi || '').toLowerCase().trim();
  }

  if (!searchKana && !searchRomaji && !searchVi) {
    return { bestMatch: null, suggestions: [] };
  }

  const cleanKana = (s) => (s || '')
    .replace(/^[\~\-\—\s\d\(\)\[\]"'`\.\/]+/, '')
    .replace(/[\~\-\—\s\d\(\)\[\]"'`\.\/]+$/, '')
    .replace(/[\(（]?[な\)]+$/, '')
    .trim();

  const searchKanaClean = cleanKana(searchKana);
  const searchHasAccents = searchVi !== removeDiacritics(searchVi);
  const searchViClean = removeDiacritics(searchVi);
  const searchWords = (searchHasAccents ? searchVi : searchViClean)
    .split(/[\s,./\(\)\-]+/)
    .filter((w) => w.length >= 2);

  const scored = [];

  for (const entry of KANJI_DICTIONARY) {
    const entryKana = cleanKana(canonicalKanaKey(entry.reading));
    const entryRomaji = (entry.romaji || '').toLowerCase().trim();
    const entryViRaw = (entry.vi || '').toLowerCase().trim();
    const entryViClean = removeDiacritics(entryViRaw);
    const entryTargetVi = searchHasAccents ? entryViRaw : entryViClean;

    let score = 0;
    let kanaMatched = false;
    let romajiMatched = false;
    let viMatched = false;

    // 1. Reading match
    if (searchKanaClean) {
      if (entryKana === searchKanaClean) {
        score += 100;
        kanaMatched = true;
      } else if (entryKana.startsWith(searchKanaClean) || searchKanaClean.startsWith(entryKana)) {
        if (Math.min(entryKana.length, searchKanaClean.length) >= 2) {
          score += 25;
        }
      } else {
        // Crucial rule: If Japanese Kana is provided and does not match this entry at all,
        // this entry CANNOT be a kanji representation of this word!
        continue;
      }
    }

    // 2. Romaji match
    if (searchRomaji) {
      if (entryRomaji === searchRomaji) {
        score += 50;
        romajiMatched = true;
      } else if (entryRomaji.includes(searchRomaji) || searchRomaji.includes(entryRomaji)) {
        score += 15;
      }
    }

    // 3. Meaning match
    if (searchWords.length > 0) {
      let viPoints = 0;
      for (const w of searchWords) {
        if (entryTargetVi.includes(w)) {
          viPoints += 40;
          viMatched = true;
        }
      }
      score += viPoints;
    }

    if (score > 0) {
      scored.push({
        entry,
        score,
        kanaMatched,
        romajiMatched,
        viMatched,
        kanji: entry.kanji,
        reading: entry.reading,
        formatted: formatKanjiTerm(entry.kanji, entry.reading, 'ruby'),
        vi: entry.vi,
        romaji: entry.romaji,
        tag: entry.tag,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const uniqueSuggestions = [];
  for (const item of scored) {
    const key = `${item.kanji}|${item.reading}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSuggestions.push(item);
    }
  }

  let bestMatch = null;
  if (uniqueSuggestions.length > 0) {
    const top = uniqueSuggestions[0];
    const isAffix = rawJp.startsWith('~') || rawJp.startsWith('～');
    const readingOk = searchKanaClean ? top.kanaMatched : (searchRomaji ? top.romajiMatched : true);
    const meaningOk = searchWords.length > 0 ? top.viMatched : true;

    if (readingOk && (!isAffix || top.viMatched)) {
      if (meaningOk && top.score >= 100) {
        bestMatch = top;
      } else if (!searchWords.length && top.score >= 100) {
        bestMatch = top;
      }
    }
  }

  return {
    bestMatch,
    suggestions: uniqueSuggestions.slice(0, 8),
  };
}

/**
 * Automates 1-1 Kanji mapping for a list of candidate cards (e.g. from PDF or dictionary).
 * Returns { mappedCards, mappedCount, previewList }
 */
export function autoMapKanjiForCards(cards, options = {}) {
  const { style = 'ruby', force = false } = options;
  let mappedCount = 0;
  const previewList = [];

  const mappedCards = cards.map((card) => {
    // If card already has kanji and !force, skip
    if (hasKanji(card.jp) && !force) {
      return card;
    }

    const { bestMatch } = findKanjiSuggestions(card);
    if (bestMatch) {
      const reading = card.jp?.includes('（') ? parseKanjiReading(card.jp).reading : (card.jp || bestMatch.reading);
      const newJp = formatKanjiTerm(bestMatch.kanji, reading || bestMatch.reading, style);

      if (newJp !== card.jp) {
        mappedCount++;
        previewList.push({
          id: card.id,
          originalJp: card.jp,
          mappedJp: newJp,
          kanji: bestMatch.kanji,
          reading: bestMatch.reading,
          vi: card.vi,
          romaji: card.romaji || bestMatch.romaji,
        });

        return {
          ...card,
          jp: newJp,
          romaji: card.romaji || bestMatch.romaji || '',
        };
      }
    }

    return card;
  });

  return {
    mappedCards,
    mappedCount,
    previewList,
  };
}

/**
 * Resolves Kanji and reading details for a card or text string.
 * - If the card already has Kanji (e.g. "父（ちち）" or "魚"), extracts kanji and reading.
 * - If the card has pure Kana (e.g. "ちち"), searches KANJI_DICTIONARY to find best match.
 * - Detects homophones (e.g. other Kanji with identical reading) to aid user validation and prevent confusion.
 */
export function resolveCardKanjiDetails(cardOrText) {
  const card = typeof cardOrText === 'string'
    ? { jp: cardOrText, vi: '', romaji: '' }
    : (cardOrText || { jp: '', vi: '', romaji: '' });

  const rawJp = (card.jp || '').trim();
  if (!rawJp) {
    return {
      kanji: '',
      reading: '',
      isFromCard: false,
      isSuggested: false,
      hasKanji: false,
      bestMatch: null,
      homophones: [],
    };
  }

  const parsed = parseKanjiReading(rawJp);

  if (parsed.hasKanji && parsed.kanji) {
    let reading = parsed.reading;
    if (!reading) {
      const dictMatch = KANJI_DICTIONARY.find((k) => k.kanji === parsed.kanji);
      if (dictMatch && dictMatch.reading) {
        reading = dictMatch.reading;
      }
    }
    reading = reading || rawJp;
    const { suggestions } = findKanjiSuggestions({ jp: reading, vi: card.vi });
    const homophones = suggestions.filter((s) => s.kanji !== parsed.kanji);

    return {
      kanji: parsed.kanji,
      reading: reading,
      isFromCard: true,
      isSuggested: false,
      hasKanji: true,
      homophones,
    };
  }

  // Card is pure Kana or missing Kanji in card.jp -> Look up in KANJI_DICTIONARY
  const { bestMatch, suggestions } = findKanjiSuggestions(card);
  if (bestMatch && bestMatch.kanji) {
    const reading = rawJp || bestMatch.reading;
    const homophones = suggestions.filter((s) => s.kanji !== bestMatch.kanji);

    return {
      kanji: bestMatch.kanji,
      reading: reading,
      isFromCard: false,
      isSuggested: true,
      hasKanji: true,
      bestMatch,
      homophones,
    };
  }

  // Pure Kana without known Kanji
  return {
    kanji: '',
    reading: rawJp,
    isFromCard: false,
    isSuggested: false,
    hasKanji: false,
    bestMatch: null,
    homophones: [],
  };
}

/**
 * Returns Japanese display text tailored for testing/quizzes:
 * - 'ruby': "魚（さかな）" (Kanji with Kana reading)
 * - 'kanji-only': "魚" (pure Kanji, reading hidden; or fallback to original text if no Kanji)
 * - 'kana-only': "さかな" (pure Kana, Kanji hidden/stripped; or fallback to dictionary reading)
 */
export function getTestJapaneseDisplay(cardOrText, mode = 'ruby') {
  if (!cardOrText) return '';
  const details = resolveCardKanjiDetails(cardOrText);

  if (mode === 'kanji-only') {
    return details.kanji || details.reading;
  }

  if (mode === 'kana-only') {
    return details.reading;
  }

  // 'ruby' mode or default
  if (details.kanji && details.reading && details.kanji !== details.reading) {
    return `${details.kanji}（${details.reading}）`;
  }
  return details.kanji || details.reading;
}

