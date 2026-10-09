package vn.marugoto.trainer;

import io.github.openspacedrepetition.Rating;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;

import static org.springframework.http.HttpStatus.*;

@Service
class BunproService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final FsrsScheduler fsrs;

    BunproService(JdbcTemplate jdbc, ObjectMapper json, FsrsScheduler fsrs) {
        this.jdbc = jdbc; this.json = json; this.fsrs = fsrs;
    }

    static String key(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                .strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    static String sourceUrl(String value) {
        try {
            URI uri = URI.create(value);
            if (!"https".equals(uri.getScheme()) || !"bunpro.jp".equals(uri.getHost()) ||
                    !(uri.getPath().startsWith("/vocabs/") || uri.getPath().startsWith("/grammar_points/"))) {
                throw new IllegalArgumentException();
            }
            return "https://bunpro.jp" + uri.getRawPath();
        } catch (Exception e) { throw new ResponseStatusException(BAD_REQUEST, "Link nguồn Bunpro không hợp lệ."); }
    }

    private String write(Object value) { return json.writeValueAsString(value); }
    private CatalogContent read(String value) { return json.readValue(value, CatalogContent.class); }
    private static boolean ready(CatalogContent c) {
        return c != null && "VERIFIED".equals(c.status()) && !key(c.meaningVi()).isEmpty();
    }
    private static List<GrammarSentence> sentences(CatalogContent c) {
        return c.sentences() == null ? List.of() : c.sentences();
    }
    private static boolean exerciseReady(GrammarSentence s) {
        return s != null && "VERIFIED".equals(s.status()) && !key(s.id()).isEmpty() &&
                s.prompt() != null && s.prompt().contains("{{blank}}") &&
                s.prompt().indexOf("{{blank}}") == s.prompt().lastIndexOf("{{blank}}") &&
                s.answers() != null && !s.answers().isEmpty() && s.answers().stream().noneMatch(a -> key(a).isEmpty()) &&
                s.answers().stream().anyMatch(a -> key(s.prompt().replace("{{blank}}",a)).equals(key(s.sentence()))) &&
                !key(s.sentence()).isEmpty() && !key(s.reading()).isEmpty() &&
                !key(s.translationVi()).isEmpty() && !key(s.explanationVi()).isEmpty();
    }
    private static void validateContent(CatalogContent c) {
        if (c == null || key(c.title()).isEmpty() || !Set.of("MISSING", "DRAFT", "VERIFIED").contains(c.status() == null ? "" : c.status()))
            throw new ResponseStatusException(BAD_REQUEST, "Nội dung hoặc trạng thái kiểm tra không hợp lệ.");
        Set<String> ids = new HashSet<>();
        for (GrammarSentence s : sentences(c)) {
            if (s == null || key(s.id()).isEmpty() || !ids.add(s.id()) ||
                    !Set.of("MISSING", "DRAFT", "VERIFIED").contains(s.status() == null ? "" : s.status()) ||
                    ("VERIFIED".equals(s.status()) && !exerciseReady(s)))
                throw new ResponseStatusException(BAD_REQUEST, "Câu luyện tập không hợp lệ hoặc trùng mã.");
        }
        if ("VERIFIED".equals(c.status()) && key(c.meaningVi()).isEmpty())
            throw new ResponseStatusException(BAD_REQUEST, "Nội dung đã kiểm tra cần có nghĩa tiếng Việt.");
    }

    @Transactional
    public CatalogImportResult importSnapshot(CatalogSnapshot snapshot) {
        if (snapshot == null || snapshot.version() != 1 || key(snapshot.snapshotVersion()).isEmpty() || snapshot.entries() == null)
            throw new ResponseStatusException(BAD_REQUEST, "Bản dữ liệu Bunpro không hợp lệ.");
        Set<String> ids = new HashSet<>(), urls = new HashSet<>();
        int vocab = 0, grammar = 0;
        for (CatalogItem item : snapshot.entries()) {
            if (item == null || key(item.id()).isEmpty() || !ids.add(item.id()) ||
                    !Set.of("VOCAB","GRAMMAR").contains(item.kind() == null ? "" : item.kind()) || !Set.of("N5","N4").contains(item.level() == null ? "" : item.level()) ||
                    item.lesson() < 1 || item.position() < 1 || !urls.add(sourceUrl(item.sourceUrl())))
                throw new ResponseStatusException(BAD_REQUEST, "Mục nguồn không hợp lệ hoặc bị trùng.");
            validateContent(item.content());
            if (item.kind().equals("VOCAB")) vocab++; else grammar++;
        }
        if (vocab != snapshot.expectedVocab() || grammar != snapshot.expectedGrammar())
            throw new ResponseStatusException(BAD_REQUEST, "Số mục không khớp bản kiểm kê nguồn.");
        for (CatalogItem item : snapshot.entries()) {
            var conflict = jdbc.queryForList("SELECT id FROM bunpro_entries WHERE source_url=? AND id<>?", sourceUrl(item.sourceUrl()), item.id());
            if (!conflict.isEmpty()) throw new ResponseStatusException(CONFLICT, "Nguồn đã tồn tại với mã khác.");
            var prior = jdbc.queryForList("SELECT kind,source_url,edited FROM bunpro_entries WHERE id=?", item.id());
            if (!prior.isEmpty() && (!item.kind().equals(prior.getFirst().get("kind")) || !sourceUrl(item.sourceUrl()).equals(prior.getFirst().get("source_url"))))
                throw new ResponseStatusException(CONFLICT, "Không được thay đổi danh tính mục nguồn.");
            if (!prior.isEmpty() && ((Number)prior.getFirst().get("edited")).intValue() == 0) {
                Set<String> nextIds = new HashSet<>();
                sentences(item.content()).forEach(s -> nextIds.add(s.id()));
                var activeIds = jdbc.queryForList("SELECT sentence_id FROM grammar_cards WHERE entry_id=?", String.class, item.id());
                if (!nextIds.containsAll(activeIds)) throw new ResponseStatusException(CONFLICT, "Bản nhập không được xóa câu đang có lịch ôn.");
            }
            jdbc.update("""
                INSERT INTO bunpro_entries(id,kind,level,lesson,position,source_url,content_json,snapshot_version)
                VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                level=excluded.level,lesson=excluded.lesson,position=excluded.position,
                content_json=CASE WHEN bunpro_entries.edited=0 THEN excluded.content_json ELSE bunpro_entries.content_json END,
                snapshot_version=excluded.snapshot_version
                """, item.id(),item.kind(),item.level(),item.lesson(),item.position(),sourceUrl(item.sourceUrl()),write(item.content()),snapshot.snapshotVersion());
        }
        return inventory();
    }

    @Transactional(readOnly = true)
    public List<CatalogEntry> entries(String kind, String level) {
        return jdbc.query("""
            SELECT e.*, l.vocabulary_id,
                (SELECT MIN(due_at) FROM study_cards WHERE vocabulary_id=l.vocabulary_id) AS due,
                (SELECT MIN(due_at) FROM grammar_cards WHERE entry_id=e.id) AS grammar_due
            FROM bunpro_entries e LEFT JOIN bunpro_vocab_links l ON l.entry_id=e.id
            WHERE e.kind=? AND e.level=? ORDER BY e.lesson,e.position,e.id
            """, (rs,i) -> {
            String vocabId=rs.getString("vocabulary_id");
            Object due=rs.getObject(kind.equals("VOCAB") ? "due" : "grammar_due");
            String state=due == null ? (vocabId == null ? "NEW" : "LEARNING") :
                    (((Number)due).longValue() <= System.currentTimeMillis() ? "DUE" : "LEARNING");
            return new CatalogEntry(rs.getString("id"),rs.getString("kind"),rs.getString("level"),rs.getInt("lesson"),rs.getInt("position"),
                    rs.getString("source_url"),read(rs.getString("content_json")),vocabId,state,rs.getInt("edited") != 0);
        },kind,level);
    }

    private CatalogEntry entry(String id, String kind) {
        var rows=jdbc.query("SELECT * FROM bunpro_entries WHERE id=? AND kind=?", (rs,i) ->
                new CatalogEntry(rs.getString("id"),rs.getString("kind"),rs.getString("level"),rs.getInt("lesson"),rs.getInt("position"),
                        rs.getString("source_url"),read(rs.getString("content_json")),null,"NEW",rs.getInt("edited")!=0),id,kind);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Không tìm thấy mục Bunpro.");
        return rows.getFirst();
    }

    @Transactional
    public void edit(String id, CatalogContent content) {
        validateContent(content);
        var prior=jdbc.queryForList("SELECT content_json FROM bunpro_entries WHERE id=?",id);
        if(prior.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Không tìm thấy mục Bunpro.");
        // A scheduled sentence must retain its identity; editing its text is allowed.
        Set<String> nextIds=new HashSet<>(); sentences(content).forEach(s -> nextIds.add(s.id()));
        var activeIds=jdbc.queryForList("SELECT sentence_id FROM grammar_cards WHERE entry_id=?",String.class,id);
        if(!nextIds.containsAll(activeIds)) throw new ResponseStatusException(CONFLICT,"Không thể xóa câu đang có lịch ôn.");
        jdbc.update("UPDATE bunpro_entries SET content_json=?,edited=1 WHERE id=?",write(content),id);
    }

    public List<VocabCandidate> candidates(String entryId) {
        var c=entry(entryId,"VOCAB").content();
        return jdbc.query("SELECT id,spelling,reading,meanings_vi FROM vocabularies", (rs,i) ->
                new VocabCandidate(rs.getString("id"),rs.getString("spelling"),rs.getString("reading"),rs.getString("meanings_vi"))).stream()
                .filter(v -> key(spelling(v.spelling())).equals(key(c.title())) ||
                        (!key(c.reading()).isEmpty() && key(v.reading()).equals(key(c.reading())))).toList();
    }
    private static String spelling(String value) { return value == null ? "" : value.replaceAll("[（(][^）)]*[）)]", "").strip(); }

    @Transactional
    public CatalogLearnResult learnVocab(String id, CatalogLearnRequest request) {
        var e=entry(id,"VOCAB"); var c=e.content();
        var linked=jdbc.queryForList("SELECT vocabulary_id FROM bunpro_vocab_links WHERE entry_id=?",String.class,id);
        if(!linked.isEmpty()) return new CatalogLearnResult(id,linked.getFirst(),"LEARNING",List.of());
        if(!ready(c)) throw new ResponseStatusException(BAD_REQUEST,"Cần kiểm tra nghĩa tiếng Việt trước khi chọn học.");
        var candidates=candidates(id);
        String vocabId=request == null ? null : request.vocabularyId();
        if(vocabId != null && !vocabId.isBlank()) {
            final String chosen=vocabId;
            if(candidates.stream().noneMatch(v -> v.id().equals(chosen))) throw new ResponseStatusException(BAD_REQUEST,"Từ liên kết phải thuộc danh sách ứng viên.");
        } else if(request == null || !Boolean.TRUE.equals(request.createNew())) {
            var exact=candidates.stream().filter(v -> key(spelling(v.spelling())).equals(key(c.title())) &&
                    key(v.reading()).equals(key(c.reading())) && key(v.meaningVi()).equals(key(c.meaningVi()))).toList();
            if(exact.size()==1) vocabId=exact.getFirst().id();
            else if(!candidates.isEmpty()) return new CatalogLearnResult(id,null,"CONFLICT",candidates);
        }
        long now=System.currentTimeMillis();
        if(vocabId == null || vocabId.isBlank()) {
            vocabId=UUID.randomUUID().toString();
            String jp=c.title(); if(!key(c.reading()).isEmpty() && !key(c.title()).equals(key(c.reading()))) jp += "（"+c.reading()+"）";
            jdbc.update("INSERT INTO vocabularies(id,spelling,reading,romaji,meanings_vi,created_at) VALUES(?,?,?,?,?,?)",vocabId,jp,c.reading(),c.romaji()==null?"":c.romaji(),c.meaningVi(),now);
        }
        String deckId="bunpro_"+e.level().toLowerCase(Locale.ROOT);
        jdbc.update("INSERT OR IGNORE INTO decks(id,title,original_filename,stored_filename,file_size,created_at) VALUES(?,?, '', '',0,?)",deckId,"Bunpro "+e.level()+" Vocab",now);
        jdbc.update("""
            INSERT INTO vocabulary_sources(id,vocabulary_id,deck_id,lesson,created_at)
            SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM vocabulary_sources WHERE vocabulary_id=? AND deck_id=?)
            """,UUID.randomUUID().toString(),vocabId,deckId,String.valueOf(e.lesson()),now,vocabId,deckId);
        // Preserve the existing state when a direction is missing.
        var existing=jdbc.queryForList("SELECT * FROM study_cards WHERE vocabulary_id=? ORDER BY due_at DESC LIMIT 1",vocabId);
        for(String direction:List.of("JP_TO_VI","VI_TO_JP")) {
            if(jdbc.queryForObject("SELECT COUNT(*) FROM study_cards WHERE vocabulary_id=? AND card_type=?",Integer.class,vocabId,direction)>0) continue;
            var fresh=fsrs.newCard(); var state=existing.isEmpty()?null:existing.getFirst();
            jdbc.update("""
                INSERT INTO study_cards(id,vocabulary_id,card_type,fsrs_card_json,due_at,review_count,wrong_count,last_reviewed_at,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)
                """,UUID.randomUUID().toString(),vocabId,direction,state==null?fsrs.write(fresh):state.get("fsrs_card_json"),
                    state==null?fsrs.dueAt(fresh).toEpochMilli():state.get("due_at"),state==null?0:state.get("review_count"),state==null?0:state.get("wrong_count"),state==null?null:state.get("last_reviewed_at"),now);
        }
        jdbc.update("INSERT INTO bunpro_vocab_links(entry_id,vocabulary_id) VALUES(?,?)",id,vocabId);
        return new CatalogLearnResult(id,vocabId,"LEARNING",List.of());
    }

    @Transactional
    public LessonLearnResult learnLesson(String level,int lesson) {
        int learned=0,blocked=0; List<CatalogLearnResult> conflicts=new ArrayList<>();
        for(var e:entries("VOCAB",level)) if(e.lesson()==lesson && e.vocabularyId()==null) {
            if(!ready(e.content())) { blocked++; continue; }
            var result=learnVocab(e.id(),new CatalogLearnRequest(null,false));
            if(result.status().equals("CONFLICT")) conflicts.add(result); else learned++;
        }
        return new LessonLearnResult(learned,blocked,conflicts);
    }

    @Transactional
    public int learnGrammar(String id) {
        var c=entry(id,"GRAMMAR").content();
        var valid=sentences(c).stream().filter(BunproService::exerciseReady).toList();
        if(!ready(c) || key(c.structure()).isEmpty() || key(c.explanationVi()).isEmpty() || valid.isEmpty())
            throw new ResponseStatusException(BAD_REQUEST,"Mẫu câu cần nghĩa, cấu trúc, giải thích và câu luyện tập đã kiểm tra.");
        int created=0;
        for(var sentence:valid) {
            var card=fsrs.newCard();
            created+=jdbc.update("""
                INSERT OR IGNORE INTO grammar_cards(id,entry_id,sentence_id,fsrs_card_json,due_at,created_at) VALUES(?,?,?,?,?,?)
                """,UUID.randomUUID().toString(),id,sentence.id(),fsrs.write(card),fsrs.dueAt(card).toEpochMilli(),System.currentTimeMillis());
        }
        return created;
    }

    public List<GrammarStudyCard> grammarCards(String level,boolean dueOnly) {
        return jdbc.query("""
            SELECT g.*,e.content_json FROM grammar_cards g JOIN bunpro_entries e ON e.id=g.entry_id
            WHERE e.level=? ORDER BY g.due_at,g.created_at,g.id
            """,(rs,i) -> {
            var c=read(rs.getString("content_json"));
            var sentence=sentences(c).stream().filter(s -> s.id().equals(rsString(rs,"sentence_id")) && exerciseReady(s)).findFirst().orElse(null);
            if(!ready(c) || sentence==null) return null;
            return new GrammarStudyCard(rs.getString("id"),rs.getString("entry_id"),c.title(),sentence,Instant.ofEpochMilli(rs.getLong("due_at")),rs.getInt("review_count"),rs.getInt("wrong_count"));
        },level).stream().filter(Objects::nonNull).filter(c -> !dueOnly || !c.dueAt().isAfter(Instant.now())).toList();
    }
    private static String rsString(java.sql.ResultSet rs,String field) {
        try { return rs.getString(field); } catch(java.sql.SQLException e) { throw new IllegalStateException(e); }
    }

    @Transactional
    public ReviewResponse reviewGrammar(String cardId,GrammarReviewRequest request) {
        Rating rating;
        try { rating=Rating.valueOf(request.rating()); } catch(Exception e) { throw new ResponseStatusException(BAD_REQUEST,"Mức đánh giá không hợp lệ."); }
        var rows=jdbc.queryForList("SELECT * FROM grammar_cards WHERE id=?",cardId);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Không tìm thấy thẻ ngữ pháp.");
        var row=rows.getFirst(); var c=entry((String)row.get("entry_id"),"GRAMMAR").content();
        if(!ready(c) || sentences(c).stream().noneMatch(s -> s.id().equals(row.get("sentence_id")) && exerciseReady(s)))
            throw new ResponseStatusException(CONFLICT,"Nội dung thẻ chưa đủ điều kiện ôn.");
        var result=fsrs.review(fsrs.read((String)row.get("fsrs_card_json")),rating);
        Instant now=Instant.now(); long due=fsrs.dueAt(result.card()).toEpochMilli();
        int reviews=((Number)row.get("review_count")).intValue()+1;
        int wrong=((Number)row.get("wrong_count")).intValue()+(rating==Rating.AGAIN?1:0);
        jdbc.update("UPDATE grammar_cards SET fsrs_card_json=?,due_at=?,review_count=?,wrong_count=?,last_reviewed_at=? WHERE id=?",fsrs.write(result.card()),due,reviews,wrong,now.toEpochMilli(),cardId);
        jdbc.update("INSERT INTO grammar_review_logs(id,card_id,rating,reviewed_at,due_at_after,response_text) VALUES(?,?,?,?,?,?)",UUID.randomUUID().toString(),cardId,rating.name(),now.toEpochMilli(),due,request.responseText()==null?"":request.responseText());
        return new ReviewResponse(cardId,rating.name(),now,Instant.ofEpochMilli(due),reviews,wrong);
    }

    public CatalogImportResult inventory() {
        var vocab=entries("VOCAB","N5"); var grammar=entries("GRAMMAR","N5");
        int missing=(int)java.util.stream.Stream.concat(vocab.stream(),grammar.stream()).filter(e -> !ready(e.content())).count();
        int exercises=(int)grammar.stream().filter(e -> sentences(e.content()).stream().noneMatch(BunproService::exerciseReady)).count();
        return new CatalogImportResult(vocab.size(),grammar.size(),missing,exercises);
    }

    public LearningBackup exportBackup() {
        return new LearningBackup(jdbc.queryForList("SELECT * FROM bunpro_entries"),jdbc.queryForList("SELECT * FROM bunpro_vocab_links"),
                jdbc.queryForList("SELECT * FROM grammar_cards"),jdbc.queryForList("SELECT * FROM grammar_review_logs"));
    }

    @Transactional
    public void restore(LearningBackup backup) {
        if(backup==null) return;
        restoreRows("bunpro_entries",List.of("id","kind","level","lesson","position","source_url","content_json","edited","snapshot_version"),backup.entries());
        restoreRows("bunpro_vocab_links",List.of("entry_id","vocabulary_id"),backup.links());
        restoreRows("grammar_cards",List.of("id","entry_id","sentence_id","fsrs_card_json","due_at","review_count","wrong_count","last_reviewed_at","created_at"),backup.grammarCards());
        restoreRows("grammar_review_logs",List.of("id","card_id","rating","reviewed_at","due_at_after","response_text"),backup.grammarReviews());
    }
    private void restoreRows(String table,List<String> columns,List<Map<String,Object>> rows) {
        if(rows==null) return;
        String pk=columns.getFirst();
        String updates=String.join(",",columns.stream().skip(1).map(c -> c+"=excluded."+c).toList());
        String sql="INSERT INTO "+table+"("+String.join(",",columns)+") VALUES("+String.join(",",Collections.nCopies(columns.size(),"?"))+") ON CONFLICT("+pk+") DO UPDATE SET "+updates;
        for(var row:rows) {
            if(row==null || row.get(pk)==null) throw new ResponseStatusException(BAD_REQUEST,"Bản sao lưu thiếu mã dữ liệu.");
            if(table.equals("bunpro_entries")) validateContent(read((String)row.get("content_json")));
            jdbc.update(sql,columns.stream().map(row::get).toArray());
        }
    }
}
