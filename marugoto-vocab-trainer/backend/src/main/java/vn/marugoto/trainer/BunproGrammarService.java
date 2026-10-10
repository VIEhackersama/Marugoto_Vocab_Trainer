package vn.marugoto.trainer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
class BunproGrammarService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final BunproService catalog;
    private final Clock clock;
    private final BunproProgress progress;
    @Autowired BunproGrammarService(JdbcTemplate jdbc,ObjectMapper json,BunproService catalog) {
        this(jdbc,json,catalog,Clock.systemUTC());
    }
    BunproGrammarService(JdbcTemplate jdbc,ObjectMapper json,BunproService catalog,Clock clock) {
        this.jdbc=jdbc; this.json=json; this.catalog=catalog; this.clock=clock;
        progress=new BunproProgress(jdbc,json,clock,"GRAMMAR",this::requireReady);
    }
    private static final String SELECT="""
        SELECT e.*,c.tier,c.due_at,c.review_count,c.wrong_count,c.revision
        FROM bunpro_entries e LEFT JOIN bunpro_grammar_cards c ON c.entry_id=e.id
        """;
    private VocabCatalogEntry map(java.sql.ResultSet rs,boolean full) throws java.sql.SQLException {
        var content=json.readValue(rs.getString("content_json"),CatalogContent.class);
        int count=content.sentences()==null?0:content.sentences().size();
        if(!full) content=new CatalogContent(content.title(),content.reading(),content.romaji(),content.meaningEn(),
            content.meaningVi(),content.status(),content.structure(),content.explanationVi(),content.conjugationGroup(),List.of());
        String tier=rs.getString("tier"); Long due=rs.getObject("due_at")==null?null:rs.getLong("due_at");
        return new VocabCatalogEntry(rs.getString("id"),"GRAMMAR",rs.getString("level"),rs.getInt("lesson"),rs.getInt("position"),
            rs.getString("source_url"),content,tier==null?"NEW":due<=clock.millis()?"DUE":"LEARNING",rs.getInt("edited")!=0,
            tier,due==null?null:Instant.ofEpochMilli(due),rs.getInt("review_count"),rs.getInt("wrong_count"),rs.getLong("revision"),
            count,List.of(),"VERIFIED".equals(content.status())?"REVIEWED":"NEEDS_REVIEW");
    }
    List<VocabCatalogEntry> entries(String level) {
        return jdbc.query(SELECT+" WHERE e.kind='GRAMMAR' AND e.level=? ORDER BY e.lesson,e.position,e.id",(rs,i)->map(rs,false),level);
    }
    VocabCatalogEntry detail(String id) {
        var rows=jdbc.query(SELECT+" WHERE e.kind='GRAMMAR' AND e.id=?",(rs,i)->map(rs,true),id);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Không tìm thấy ngữ pháp Bunpro.");
        return rows.getFirst();
    }
    private boolean ready(CatalogContent c) {
        return "VERIFIED".equals(c.status()) && !BunproService.key(c.meaningVi()).isEmpty()
            && !BunproService.key(c.structure()).isEmpty() && !BunproService.key(c.explanationVi()).isEmpty();
    }
    private void requireReady(String id) {
        var e=detail(id);
        if(!ready(e.content())) throw new ResponseStatusException(BAD_REQUEST,e.content().title()+": cần kiểm tra nghĩa, cấu trúc và cách dùng trước khi học.");
    }
    @Transactional public void edit(String id,CatalogContent content) { detail(id); catalog.edit(id,content); }
    @Transactional public void assign(VocabTierRequest request) { progress.assign(request); }
    @Transactional public void learn(String id) { progress.learn(id); }
    VocabIntervals intervals() { return progress.intervals(); }
    @Transactional public VocabIntervals setIntervals(VocabIntervals input) { return progress.setIntervals(input); }
    List<VocabCatalogEntry> queue(String level) {
        return jdbc.query(SELECT+" WHERE e.kind='GRAMMAR' AND e.level=? AND c.due_at<=? ORDER BY c.due_at,e.id",(rs,i)->map(rs,false),level,clock.millis())
            .stream().filter(e->ready(e.content())).toList();
    }
    @Transactional public VocabReviewResult review(String id,VocabReviewRequest request) { return progress.review(id,request); }
}
