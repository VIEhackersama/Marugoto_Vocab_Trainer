package vn.marugoto.trainer;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.time.Instant;
import java.util.*;

@RestController
class DictionaryController {
    private final JdbcTemplate jdbc;
    DictionaryController(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @GetMapping("/api/dictionary")
    @Transactional(readOnly=true)
    public StudyResponseWithSources entries() {
        Map<String,List<DictionarySource>> sources=new HashMap<>();
        jdbc.query("SELECT DISTINCT vs.vocabulary_id, d.id, d.title FROM vocabulary_sources vs JOIN decks d ON d.id=vs.deck_id ORDER BY d.created_at,d.id",
                rs -> { sources.computeIfAbsent(rs.getString("vocabulary_id"), k->new ArrayList<>()).add(new DictionarySource(rs.getString("id"),rs.getString("title"))); });
        var cards=jdbc.query("""
            SELECT v.*,s.id AS card_id,s.due_at,s.review_count,s.wrong_count FROM vocabularies v
            LEFT JOIN study_cards s ON s.id=(SELECT id FROM study_cards WHERE vocabulary_id=v.id
              ORDER BY CASE WHEN card_type='JP_TO_VI' THEN 0 ELSE 1 END,created_at,id LIMIT 1)
            ORDER BY v.created_at,v.id
            """,(rs,i) -> {
            var all=sources.getOrDefault(rs.getString("id"),List.of());
            var first=all.isEmpty()?new DictionarySource("","Không có nguồn"):all.getFirst();
            int reviewed=rs.getInt("review_count"),wrong=rs.getInt("wrong_count");
            return new DictionaryEntry(rs.getString("card_id"),rs.getString("id"),first.deckId(),first.title(),rs.getString("spelling"),rs.getString("reading"),
                rs.getString("romaji"),rs.getString("meanings_vi"),rs.getObject("due_at")==null?null:Instant.ofEpochMilli(rs.getLong("due_at")),reviewed,wrong,
                wrong>=3 || (reviewed>=3 && (double)wrong/reviewed>=0.35),all);
        });
        int due=(int)cards.stream().filter(c->c.dueAt()!=null && !c.dueAt().isAfter(Instant.now())).count();
        return new StudyResponseWithSources(cards,due);
    }
    record StudyResponseWithSources(List<DictionaryEntry> cards,int dueCount) {}
}
