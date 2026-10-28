package vn.marugoto.trainer;

import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

final class BunproStages {
    // Existing FSRS/backup tables require a due timestamp. Master is exposed as null
    // and excluded from queues; this sentinel keeps old card serialization valid.
    static final Instant MASTER_DUE = Instant.parse("9999-12-31T23:59:59Z");
    static Integer readStage(java.sql.ResultSet rs) throws java.sql.SQLException {
        Object stage=rs.getObject("stage");
        return stage==null?null:((Number)stage).intValue();
    }
    static String tier(int stage) {
        validate(stage);
        return stage <= 3 ? "BEGINNER" : stage <= 6 ? "ADEPT" : stage <= 9 ? "SEASONED" : stage <= 11 ? "EXPERT" : "MASTER";
    }
    static void validate(Integer stage) {
        if (stage == null || stage < 0 || stage > 12) throw new ResponseStatusException(BAD_REQUEST,"Cấp SRS phải từ 0 đến 12.");
    }
    static String prefix(String kind) {
        if (!"VOCAB".equals(kind) && !"GRAMMAR".equals(kind)) throw new ResponseStatusException(BAD_REQUEST,"Loại mục phải là VOCAB hoặc GRAMMAR.");
        return kind.equals("VOCAB") ? "bunpro_vocab" : "bunpro_grammar";
    }
    static List<Long> intervals(JdbcTemplate jdbc, ObjectMapper json, String kind) {
        prefix(kind);
        var nodes=json.readTree(jdbc.queryForObject("SELECT seconds_json FROM bunpro_stage_settings WHERE kind=?",String.class,kind));
        var values=new java.util.ArrayList<Long>();
        for(var n:nodes) values.add(n.asLong());
        return values;
    }
    static void validateIntervals(List<Long> seconds) {
        if(seconds==null || seconds.size()!=11) throw new ResponseStatusException(BAD_REQUEST,"Cần đủ 11 chu kỳ SRS (giây).");
        long prior=0;
        for(Long value:seconds) {
            if(value==null || value<=prior || value>3153600000L) throw new ResponseStatusException(BAD_REQUEST,"Chu kỳ phải tăng dần, nguyên dương, tối đa 100 năm.");
            prior=value;
        }
    }
    static Instant due(JdbcTemplate jdbc,ObjectMapper json,String kind,int stage,Instant now) {
        validate(stage);
        return stage==12 ? MASTER_DUE : stage==0 ? now.plusSeconds(600) : now.plusSeconds(intervals(jdbc,json,kind).get(stage-1));
    }
}
