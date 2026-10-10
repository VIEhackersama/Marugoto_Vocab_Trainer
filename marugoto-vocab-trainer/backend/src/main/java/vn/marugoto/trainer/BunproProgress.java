package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import static org.springframework.http.HttpStatus.*;

/** Shared tier and FSRS rules; each catalog kind owns separate persisted state. */
final class BunproProgress {
    static final List<String> TIERS=List.of("BEGINNER","ADEPT","SEASONED","EXPERT","MASTER");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final Consumer<String> ready;
    private final String prefix;
    private final Scheduler scheduler=Scheduler.builder().desiredRetention(0.9)
        .learningSteps(new Duration[]{Duration.ofMinutes(1),Duration.ofMinutes(10)})
        .relearningSteps(new Duration[]{Duration.ofMinutes(10)}).enableFuzzing(false).build();
    BunproProgress(JdbcTemplate jdbc,ObjectMapper json,Clock clock,String kind,Consumer<String> ready) {
        this.jdbc=jdbc; this.json=json; this.clock=clock; this.ready=ready;
        if(!Set.of("VOCAB","GRAMMAR").contains(kind)) throw new IllegalArgumentException("Unknown catalog kind");
        prefix=kind.equals("GRAMMAR")?"bunpro_grammar":"bunpro_vocab";
    }
    private String sql(String value) { return value.replace("bunpro_vocab",prefix); }
    private String write(Object value) { return json.writeValueAsString(value); }
    private Instant now() { return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS); }
    VocabIntervals intervals() {
        List<Integer> days=new ArrayList<>();
        for(var n:json.readTree(jdbc.queryForObject(sql("SELECT days_json FROM bunpro_vocab_settings WHERE id='intervals'"),String.class))) days.add(n.asInt());
        return new VocabIntervals(days);
    }
    public VocabIntervals setIntervals(VocabIntervals input) {
        validateIntervals(input);
        jdbc.update(sql("UPDATE bunpro_vocab_settings SET days_json=? WHERE id='intervals'"),write(input.days())); return input;
    }
    static void validateIntervals(VocabIntervals input) {
        if(input==null || input.days()==null || input.days().size()!=5) throw new ResponseStatusException(BAD_REQUEST,"Cần chu kỳ cho đủ năm mức.");
        int prior=0; for(Integer day:input.days()) {
            if(day==null || day<=prior || day>36500) throw new ResponseStatusException(BAD_REQUEST,"Chu kỳ phải là số ngày nguyên dương, tăng dần, tối đa 36.500 ngày.");
            prior=day;
        }
    }
    public void assign(VocabTierRequest request) {
        if(request==null || request.entryIds()==null || request.entryIds().isEmpty() || !TIERS.contains(request.tier()))
            throw new ResponseStatusException(BAD_REQUEST,"Chọn mục và mức học hợp lệ.");
        var ids=new LinkedHashSet<>(request.entryIds());
        for(String id:ids) ready.accept(id);
        Instant now=now(), due=now.plus(Duration.ofDays(intervals().days().get(TIERS.indexOf(request.tier()))));
        for(String id:ids) saveAssignment(id,request.tier(),now,due,false);
    }
    public void learn(String id) {
        ready.accept(id);
        Instant now=now(); saveAssignment(id,"BEGINNER",now,now,true);
    }
    private void saveAssignment(String id,String tier,Instant now,Instant due,boolean onlyNew) {
        var prior=jdbc.queryForList(sql("SELECT fsrs_card_json FROM bunpro_vocab_cards WHERE entry_id=?"),String.class,id);
        if(onlyNew && !prior.isEmpty()) return;
        Card state=prior.isEmpty()?Card.builder().due(now).build():Card.fromJson(prior.getFirst());
        state.setDue(due);
        jdbc.update(sql("""
            INSERT INTO bunpro_vocab_cards(entry_id,tier,fsrs_card_json,due_at,created_at) VALUES(?,?,?,?,?)
            ON CONFLICT(entry_id) DO UPDATE SET tier=excluded.tier,fsrs_card_json=excluded.fsrs_card_json,
            due_at=excluded.due_at,revision=bunpro_vocab_cards.revision+1
            """),id,tier,state.toJson(),due.toEpochMilli(),now.toEpochMilli());
    }
    public VocabReviewResult review(String id,VocabReviewRequest request) {
        if(request==null || request.requestId()==null || request.requestId().isBlank() || request.requestId().length()>100 ||
                !Set.of("JP_TO_VI","VI_TO_JP").contains(request.direction()==null?"":request.direction()))
            throw new ResponseStatusException(BAD_REQUEST,"Thiếu mã lượt ôn hoặc chiều học.");
        Rating rating; try { rating=Rating.valueOf(request.rating()); } catch(Exception ex) { throw new ResponseStatusException(BAD_REQUEST,"Đánh giá không hợp lệ."); }
        if(!jdbc.queryForList(sql("SELECT id FROM bunpro_vocab_review_logs WHERE id=?"),String.class,request.requestId()).isEmpty())
            throw new ResponseStatusException(CONFLICT,"Kết quả này đã được ghi nhận; tải lại lượt ôn.");
        ready.accept(id);
        var rows=jdbc.queryForList(sql("SELECT * FROM bunpro_vocab_cards WHERE entry_id=?"),id);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Mục chưa được kích hoạt trong Bunpro.");
        var row=rows.getFirst(); long revision=((Number)row.get("revision")).longValue();
        if(revision!=request.revision()) throw new ResponseStatusException(CONFLICT,"Tiến độ đã đổi; tải lại lượt ôn.");
        Instant now=now();
        if(((Number)row.get("due_at")).longValue()>now.toEpochMilli()) throw new ResponseStatusException(CONFLICT,"Mục chưa đến hạn ôn.");
        String before=(String)row.get("tier"); int index=TIERS.indexOf(before);
        int next=rating==Rating.AGAIN?Math.max(0,index-1):rating==Rating.HARD?index:Math.min(4,index+1);
        String tier=TIERS.get(next);
        var result=scheduler.reviewCard(Card.fromJson((String)row.get("fsrs_card_json")),rating,now);
        Card card=result.card(); Instant cap=now.plus(Duration.ofDays(intervals().days().get(next)));
        Instant due=rating==Rating.AGAIN?now.plus(Duration.ofMinutes(10)):card.getDue().isAfter(cap)?cap:card.getDue();
        card.setDue(due);
        int reviews=((Number)row.get("review_count")).intValue()+1, wrong=((Number)row.get("wrong_count")).intValue()+(rating==Rating.AGAIN?1:0);
        int changed=jdbc.update(sql("""
            UPDATE bunpro_vocab_cards SET tier=?,fsrs_card_json=?,due_at=?,review_count=?,wrong_count=?,
            last_reviewed_at=?,revision=revision+1 WHERE entry_id=? AND revision=?
            """),tier,card.toJson(),due.toEpochMilli(),reviews,wrong,now.toEpochMilli(),id,revision);
        if(changed!=1) throw new ResponseStatusException(CONFLICT,"Tiến độ đã đổi; tải lại lượt ôn.");
        jdbc.update(sql("INSERT INTO bunpro_vocab_review_logs(id,entry_id,rating,direction,reviewed_at,due_at_after,tier_before,tier_after) VALUES(?,?,?,?,?,?,?,?)"),
                request.requestId(),id,rating.name(),request.direction(),now.toEpochMilli(),due.toEpochMilli(),before,tier);
        return new VocabReviewResult(id,tier,due,reviews,wrong,revision+1);
    }
}
