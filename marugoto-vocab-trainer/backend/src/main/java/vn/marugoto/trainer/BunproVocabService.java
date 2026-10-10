package vn.marugoto.trainer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.*;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
class BunproVocabService {
    static final List<String> TIERS=BunproProgress.TIERS;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final BunproService catalog;
    private final BunproCaptureParser parser;
    private final Clock clock;
    private final BunproProgress progress;

    @Autowired
    BunproVocabService(JdbcTemplate jdbc,ObjectMapper json,BunproService catalog,BunproCaptureParser parser) {
        this(jdbc,json,catalog,parser,Clock.systemUTC());
    }
    BunproVocabService(JdbcTemplate jdbc,ObjectMapper json,BunproService catalog,BunproCaptureParser parser,Clock clock) {
        this.jdbc=jdbc; this.json=json; this.catalog=catalog; this.parser=parser; this.clock=clock;
        this.progress=new BunproProgress(jdbc,json,clock,"VOCAB",this::requireReady);
    }
    private String write(Object value) { return json.writeValueAsString(value); }
    private Instant now() { return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS); }
    private Set<String> urls() { return new HashSet<>(jdbc.queryForList("SELECT source_url FROM bunpro_entries WHERE kind='VOCAB' AND level='N5'",String.class)); }
    CapturePreview preview(JsonNode capture) { return parser.parse(capture,urls()).preview(); }

    @Transactional
    public CapturePreview importCapture(JsonNode capture) {
        var parsed=parser.parse(capture,urls());
        if(!parsed.preview().errors().isEmpty()) throw new ResponseStatusException(BAD_REQUEST,String.join("\n",parsed.preview().errors()));
        for(var item:parsed.entries()) {
            var matches=jdbc.queryForList("SELECT id,kind,level FROM bunpro_entries WHERE source_url=?",item.url());
            String id;
            if(matches.isEmpty()) {
                id=sourceId(item.url());
                var c=new CatalogContent(item.title(),item.reading(),"",item.meaning(),"","MISSING","","",null,List.of());
                jdbc.update("INSERT INTO bunpro_entries(id,kind,level,lesson,position,source_url,content_json,snapshot_version) VALUES(?,'VOCAB','N5',?,?,?,?,?)",
                        id,item.lesson(),item.position(),item.url(),write(c),BunproCaptureParser.str(capture,"runId"));
            } else {
                var match=matches.getFirst(); id=(String)match.get("id");
                if(!"VOCAB".equals(match.get("kind")) || !"N5".equals(match.get("level")))
                    throw new ResponseStatusException(CONFLICT,"Nguồn đã được dùng bởi kho khác: "+item.url());
            }
            jdbc.update("""
                INSERT INTO bunpro_vocab_content(entry_id,data_json,capture_version) VALUES(?,?,?)
                ON CONFLICT(entry_id) DO UPDATE SET
                data_json=CASE WHEN bunpro_vocab_content.edited=0 THEN excluded.data_json ELSE bunpro_vocab_content.data_json END,
                capture_version=excluded.capture_version
                """,id,write(item.data()),BunproCaptureParser.str(capture,"runId"));
        }
        return parsed.preview();
    }
    private static String sourceId(String url) {
        try { return "bunpro-vocab-"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(url.getBytes(java.nio.charset.StandardCharsets.UTF_8))).substring(0,24); }
        catch(java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    private static final String SELECT="""
        SELECT e.*, d.edited AS detail_edited,
        json_array_length(d.data_json,'$.examples') AS example_count,
        json_extract(d.data_json,'$.partsOfSpeech') AS parts,
        json_extract(d.data_json,'$.completeness') AS completeness,
        c.tier,c.due_at,c.review_count,c.wrong_count,c.revision
        FROM bunpro_entries e LEFT JOIN bunpro_vocab_content d ON d.entry_id=e.id
        LEFT JOIN bunpro_vocab_cards c ON c.entry_id=e.id
        """;
    private VocabCatalogEntry map(java.sql.ResultSet rs) throws java.sql.SQLException {
        String tier=rs.getString("tier"), parts=rs.getString("parts");
        Long due=rs.getObject("due_at")==null?null:rs.getLong("due_at");
        List<String> tags=new ArrayList<>(); if(parts!=null) for(var tag:json.readTree(parts)) tags.add(tag.asText());
        return new VocabCatalogEntry(rs.getString("id"),rs.getString("kind"),rs.getString("level"),rs.getInt("lesson"),rs.getInt("position"),
                rs.getString("source_url"),json.readValue(rs.getString("content_json"),CatalogContent.class).withVocab(null),
                tier==null?"NEW":due<=clock.millis()?"DUE":"LEARNING",rs.getInt("edited")!=0 || rs.getInt("detail_edited")!=0,
                tier,due==null?null:Instant.ofEpochMilli(due),rs.getInt("review_count"),rs.getInt("wrong_count"),rs.getLong("revision"),
                rs.getInt("example_count"),tags,rs.getString("completeness"));
    }
    List<VocabCatalogEntry> entries(String level) {
        return jdbc.query(SELECT+" WHERE e.kind='VOCAB' AND e.level=? ORDER BY e.lesson,e.position,e.id",(rs,i)->map(rs),level);
    }
    VocabCatalogEntry detail(String id) {
        var rows=jdbc.query(SELECT+" WHERE e.kind='VOCAB' AND e.id=?",(rs,i)->map(rs),id);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Không tìm thấy từ Bunpro.");
        var e=rows.getFirst();
        var data=jdbc.queryForList("SELECT data_json FROM bunpro_vocab_content WHERE entry_id=?",String.class,id);
        return new VocabCatalogEntry(e.id(),e.kind(),e.level(),e.lesson(),e.position(),e.sourceUrl(),
                e.content().withVocab(data.isEmpty()?null:json.readValue(data.getFirst(),VocabData.class)),
                e.learningStatus(),e.edited(),e.tier(),e.dueAt(),e.reviewCount(),e.wrongCount(),e.revision(),e.exampleCount(),e.partsOfSpeech(),e.completeness());
    }
    @Transactional
    public void edit(String id,CatalogContent content) {
        detail(id);
        if(content==null) throw new ResponseStatusException(BAD_REQUEST,"Thiếu nội dung.");
        if(content.vocab()!=null) {
            validateData(content.vocab());
            jdbc.update("""
                INSERT INTO bunpro_vocab_content(entry_id,data_json,edited,capture_version) VALUES(?,?,1,'personal')
                ON CONFLICT(entry_id) DO UPDATE SET data_json=excluded.data_json,edited=1
                """,id,write(content.vocab()));
        }
        catalog.edit(id,content.withVocab(null));
    }
    static void validateData(VocabData data) {
        if(data.senses()==null || data.partsOfSpeech()==null || data.unknownLabels()==null || data.examples()==null ||
                !Set.of("NEEDS_REVIEW","REVIEWED","NOT_CHECKED").contains(data.completeness()==null?"":data.completeness()))
            throw new ResponseStatusException(BAD_REQUEST,"Nội dung nguồn không hợp lệ.");
        Set<String> ids=new HashSet<>();
        for(var ex:data.examples()) {
            if(ex==null || ex.id()==null || ex.id().isBlank() || !ids.add(ex.id()) || ex.sentence()==null || ex.sentence().isBlank() || ex.tokens()==null)
                throw new ResponseStatusException(BAD_REQUEST,"Ví dụ thiếu nội dung hoặc trùng ID.");
            for(var t:ex.tokens()) if(t==null || t.text()==null) throw new ResponseStatusException(BAD_REQUEST,"Furigana không hợp lệ.");
            if(!ex.sentence().equals(ex.tokens().stream().map(RubyToken::text).reduce("",String::concat)))
                throw new ResponseStatusException(BAD_REQUEST,"Furigana không khớp câu.");
        }
        for(var s:data.senses()) if(s==null || s.meaning()==null || s.partsOfSpeech()==null || s.sourceLabels()==null)
            throw new ResponseStatusException(BAD_REQUEST,"Định nghĩa không hợp lệ.");
    }
    VocabIntervals intervals() { return progress.intervals(); }
    @Transactional public VocabIntervals setIntervals(VocabIntervals input) { return progress.setIntervals(input); }
    static void validateIntervals(VocabIntervals input) { BunproProgress.validateIntervals(input); }
    private void requireReady(String id) {
        var e=detail(id);
        if(!"VERIFIED".equals(e.content().status()) || e.content().meaningVi()==null || e.content().meaningVi().isBlank())
            throw new ResponseStatusException(BAD_REQUEST,e.content().title()+": cần kiểm tra nghĩa Việt trước khi học.");
    }
    @Transactional public void assign(VocabTierRequest request) { progress.assign(request); }
    @Transactional public void learn(String id) { progress.learn(id); }
    List<VocabCatalogEntry> queue(String level) {
        return jdbc.query(SELECT+" WHERE e.kind='VOCAB' AND e.level=? AND c.due_at<=? ORDER BY c.due_at,e.id",(rs,i)->map(rs),level,clock.millis())
                .stream().filter(e->"VERIFIED".equals(e.content().status()) && e.content().meaningVi()!=null && !e.content().meaningVi().isBlank()).toList();
    }
    @Transactional public VocabReviewResult review(String id,VocabReviewRequest request) { return progress.review(id,request); }
}
