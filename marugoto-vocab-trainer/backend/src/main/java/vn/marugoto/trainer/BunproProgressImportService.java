package vn.marugoto.trainer;

import io.github.openspacedrepetition.Card;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.file.*;
import java.text.Normalizer;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static org.springframework.http.HttpStatus.*;

record ProgressRow(String kind,String entryId,String sourceUrl,Integer stage,Instant dueAt,String title,String reading) {}
record ProgressInput(List<ProgressRow> rows) {}
record ProgressPreviewRow(int index,ProgressRow input,String entryId,String title,String status,String message,
                          String beforeTier,Integer beforeStage,Instant beforeDueAt,Integer stage,Instant dueAt,
                          String dueSource,Long revision,boolean needsReview) {
    boolean valid() { return !status.equals("ERROR"); }
}
record ProgressPreview(String previewId,Instant expiresAt,List<ProgressPreviewRow> rows) {}
record ProgressApply(String previewId,List<Integer> indexes) {}
record ProgressApplied(String importId,String backupPath,List<ProgressPreviewRow> rows) {}
record StageAssignment(String kind,List<String> entryIds,Integer stage) {}
record StageIntervals(List<Long> seconds) {}

@Service
class BunproProgressImportService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final BackupService backups;
    private final Path backupDir;
    private final Map<String,Pending> pending=new ConcurrentHashMap<>();
    private record Pending(Instant expires,List<ProgressPreviewRow> rows,Map<Integer,String> fingerprints) {}
    BunproProgressImportService(JdbcTemplate jdbc,ObjectMapper json,BackupService backups,
                                @Value("${app.data-dir:./data}") String dataDir) {
        this.jdbc=jdbc; this.json=json; this.backups=backups;
        backupDir=Path.of(dataDir).toAbsolutePath().normalize().resolve("progress-backups");
    }
    static String canonicalUrl(String value) {
        try {
            URI uri=URI.create(value.trim());
            if(!Set.of("http","https").contains(uri.getScheme()) || uri.getHost()==null ||
               !Set.of("bunpro.jp","www.bunpro.jp").contains(uri.getHost().toLowerCase(Locale.ROOT)) ||
               uri.getUserInfo()!=null || (uri.getPort()!=-1 && uri.getPort()!=443)) throw new IllegalArgumentException();
            return Normalizer.normalize(uri.getPath().replaceAll("/+$",""),Normalizer.Form.NFC);
        } catch(Exception ex) { throw new ResponseStatusException(BAD_REQUEST,"Link phải thuộc bunpro.jp."); }
    }
    private Map<String,Object> card(String kind,String id) {
        var rows=jdbc.queryForList("SELECT * FROM "+BunproStages.prefix(kind)+"_cards WHERE entry_id=?",id);
        return rows.isEmpty()?Map.of():rows.getFirst();
    }
    private String fingerprint(String kind,String id) { return json.writeValueAsString(card(kind,id)); }
    private static Integer integer(Object value) { return value==null?null:((Number)value).intValue(); }
    private static Instant visibleDue(Map<String,Object> state) {
        return state.isEmpty() || Integer.valueOf(12).equals(integer(state.get("stage"))) ? null : Instant.ofEpochMilli(((Number)state.get("due_at")).longValue());
    }
    @Transactional(readOnly=true)
    public ProgressPreview preview(ProgressInput input) {
        if(input==null || input.rows()==null || input.rows().isEmpty() || input.rows().size()>10000)
            throw new ResponseStatusException(BAD_REQUEST,"Cần từ 1 đến 10.000 dòng tiến độ.");
        Instant now=Instant.now();
        pending.entrySet().removeIf(e->e.getValue().expires().isBefore(now));
        if(pending.size()>=100) throw new ResponseStatusException(TOO_MANY_REQUESTS,"Có quá nhiều bản xem trước; thử lại sau.");
        var catalog=jdbc.queryForList("SELECT id,kind,source_url,content_json FROM bunpro_entries");
        var byId=new HashMap<String,Map<String,Object>>();
        var byUrl=new HashMap<String,List<Map<String,Object>>>();
        for(var entry:catalog) {
            byId.put(entry.get("kind")+":"+entry.get("id"),entry);
            String key=entry.get("kind")+":"+canonicalUrl((String)entry.get("source_url"));
            byUrl.computeIfAbsent(key,k->new ArrayList<>()).add(entry);
        }
        var result=new ArrayList<ProgressPreviewRow>();
        var fingerprints=new HashMap<Integer,String>();
        for(int i=0;i<input.rows().size();i++) {
            ProgressRow row=input.rows().get(i);
            try {
                if(row==null) throw new ResponseStatusException(BAD_REQUEST,"Dòng rỗng.");
                BunproStages.prefix(row.kind()); BunproStages.validate(row.stage());
                if(row.dueAt()!=null && (row.dueAt().isBefore(Instant.parse("1970-01-01T00:00:00Z")) || row.dueAt().isAfter(BunproStages.MASTER_DUE)))
                    throw new ResponseStatusException(BAD_REQUEST,"Hạn ôn ngoài khoảng hỗ trợ.");
                boolean hasId=row.entryId()!=null && !row.entryId().isBlank();
                boolean hasUrl=row.sourceUrl()!=null && !row.sourceUrl().isBlank();
                if(!hasId && !hasUrl) throw new ResponseStatusException(BAD_REQUEST,"Thiếu ID hoặc link Bunpro; không ghép theo kana.");
                String url=hasUrl?canonicalUrl(row.sourceUrl()):null;
                var candidate=hasId?byId.get(row.kind()+":"+row.entryId().trim()):null;
                List<Map<String,Object>> matches=hasId?(candidate==null?List.of():List.of(candidate)):byUrl.getOrDefault(row.kind()+":"+url,List.of());
                if(hasId && hasUrl) matches=matches.stream().filter(e->url.equals(canonicalUrl((String)e.get("source_url")))).toList();
                if(matches.size()!=1) throw new ResponseStatusException(BAD_REQUEST,matches.isEmpty()?"Không khớp ID/link và loại mục.":"Link khớp nhiều mục; cần ID local.");
                var entry=matches.getFirst(); String id=(String)entry.get("id");
                var content=json.readValue((String)entry.get("content_json"),CatalogContent.class);
                var old=card(row.kind(),id);
                Instant due; String dueSource;
                if(row.stage()==12) { due=null; dueSource="MASTER"; }
                else if(row.dueAt()!=null) { due=row.dueAt().truncatedTo(java.time.temporal.ChronoUnit.MILLIS); dueSource="WEB"; }
                else if(visibleDue(old)!=null) { due=visibleDue(old); dueSource="LOCAL"; }
                else { due=BunproStages.due(jdbc,json,row.kind(),row.stage(),now).truncatedTo(java.time.temporal.ChronoUnit.MILLIS); dueSource="CALCULATED"; }
                String status=old.isEmpty()?"NEW":Objects.equals(integer(old.get("stage")),row.stage()) && Objects.equals(visibleDue(old),due)?"UNCHANGED":"UPDATE";
                boolean needsReview=!"VERIFIED".equals(content.status()) || content.meaningVi()==null || content.meaningVi().isBlank() ||
                    row.kind().equals("GRAMMAR") && (content.structure()==null || content.structure().isBlank() || content.explanationVi()==null || content.explanationVi().isBlank());
                result.add(new ProgressPreviewRow(i,row,id,content.title(),status,"",(String)old.get("tier"),integer(old.get("stage")),visibleDue(old),row.stage(),due,dueSource,
                    old.isEmpty()?null:((Number)old.get("revision")).longValue(),needsReview));
                fingerprints.put(i,json.writeValueAsString(old));
            } catch(ResponseStatusException ex) {
                result.add(new ProgressPreviewRow(i,row,null,row==null?"":row.title(),"ERROR",ex.getReason(),null,null,null,null,null,null,null,false));
            }
        }
        var counts=new HashMap<String,Integer>();
        for(var r:result) if(r.valid()) counts.merge(r.input().kind()+":"+r.entryId(),1,Integer::sum);
        for(int i=0;i<result.size();i++) {
            var r=result.get(i);
            if(r.valid() && counts.get(r.input().kind()+":"+r.entryId())>1)
                result.set(i,new ProgressPreviewRow(r.index(),r.input(),r.entryId(),r.title(),"ERROR","Mục xuất hiện nhiều lần; gộp thành một dòng.",r.beforeTier(),r.beforeStage(),r.beforeDueAt(),r.stage(),r.dueAt(),r.dueSource(),r.revision(),r.needsReview()));
        }
        String token=UUID.randomUUID().toString(); Instant expires=now.plusSeconds(1800);
        pending.put(token,new Pending(expires,List.copyOf(result),Map.copyOf(fingerprints)));
        return new ProgressPreview(token,expires,result);
    }
    @Transactional
    public ProgressApplied apply(ProgressApply request) {
        if(request==null || request.previewId()==null || request.indexes()==null || request.indexes().isEmpty()) throw new ResponseStatusException(BAD_REQUEST,"Chọn các dòng cần nhập.");
        if(request.indexes().stream().anyMatch(Objects::isNull)) throw new ResponseStatusException(BAD_REQUEST,"Chỉ số dòng không hợp lệ.");
        var indexes=new TreeSet<>(request.indexes());
        var prior=jdbc.queryForList("SELECT changes_json FROM bunpro_progress_imports WHERE id=?",String.class,request.previewId());
        if(!prior.isEmpty()) {
            ProgressApplied applied=json.readValue(prior.getFirst(),ProgressApplied.class);
            if(!new TreeSet<>(applied.rows().stream().map(ProgressPreviewRow::index).toList()).equals(indexes))
                throw new ResponseStatusException(CONFLICT,"Mã nhập đã dùng với lựa chọn khác.");
            return applied;
        }
        Pending plan=pending.get(request.previewId());
        if(plan==null || plan.expires().isBefore(Instant.now())) throw new ResponseStatusException(CONFLICT,"Bản xem trước hết hạn; xem trước lại.");
        var selected=new ArrayList<ProgressPreviewRow>();
        for(Integer index:indexes) {
            if(index==null || index<0 || index>=plan.rows().size() || !plan.rows().get(index).valid()) throw new ResponseStatusException(BAD_REQUEST,"Có dòng chưa hợp lệ.");
            var row=plan.rows().get(index);
            if(!Objects.equals(plan.fingerprints().get(index),fingerprint(row.input().kind(),row.entryId())))
                throw new ResponseStatusException(CONFLICT,"Tiến độ đã đổi: "+row.title()+". Xem trước lại.");
            selected.add(row);
        }
        // Export on the same transactional connection before any writes: the JSON is
        // a consistent, restorable snapshot including WAL-backed SQLite data.
        String backup;
        try {
            byte[] snapshot=json.writeValueAsBytes(backups.exportBackup());
            Files.createDirectories(backupDir);
            Path path=Files.createTempFile(backupDir,request.previewId()+"-",".json");
            Files.write(path,snapshot,StandardOpenOption.TRUNCATE_EXISTING,StandardOpenOption.WRITE);
            backup=path.toString();
        } catch(Exception ex) { throw new ResponseStatusException(INTERNAL_SERVER_ERROR,"Không tạo được sao lưu; chưa nhập tiến độ.",ex); }
        for(var row:selected) if(!row.status().equals("UNCHANGED")) write(row.input().kind(),row.entryId(),row.stage(),row.dueAt(),row.revision());
        var applied=new ProgressApplied(request.previewId(),backup,List.copyOf(selected));
        jdbc.update("INSERT INTO bunpro_progress_imports(id,imported_at,backup_path,changes_json) VALUES(?,?,?,?)",request.previewId(),System.currentTimeMillis(),backup,json.writeValueAsString(applied));
        return applied;
    }
    private void write(String kind,String id,int stage,Instant visibleDue,Long revision) {
        String table=BunproStages.prefix(kind)+"_cards";
        Instant due=stage==12?BunproStages.MASTER_DUE:visibleDue;
        var old=card(kind,id);
        Card state=old.isEmpty()?Card.builder().build():Card.fromJson((String)old.get("fsrs_card_json"));
        state.setDue(due);
        if(revision==null) {
            jdbc.update("INSERT INTO "+table+"(entry_id,tier,stage,fsrs_card_json,due_at,created_at) VALUES(?,?,?,?,?,?)",id,BunproStages.tier(stage),stage,state.toJson(),due.toEpochMilli(),System.currentTimeMillis());
        } else {
            int changed=jdbc.update("UPDATE "+table+" SET tier=?,stage=?,fsrs_card_json=?,due_at=?,revision=revision+1 WHERE entry_id=? AND revision=?",BunproStages.tier(stage),stage,state.toJson(),due.toEpochMilli(),id,revision);
            if(changed!=1) throw new ResponseStatusException(CONFLICT,"Tiến độ đã đổi; xem trước lại.");
        }
    }
    @Transactional
    public void assign(StageAssignment request) {
        if(request==null || request.entryIds()==null || request.entryIds().isEmpty()) throw new ResponseStatusException(BAD_REQUEST,"Chọn mục cần gán.");
        BunproStages.prefix(request.kind()); BunproStages.validate(request.stage());
        var ids=new LinkedHashSet<>(request.entryIds());
        for(String id:ids) if(jdbc.queryForObject("SELECT COUNT(*) FROM bunpro_entries WHERE id=? AND kind=?",Integer.class,id,request.kind())!=1)
            throw new ResponseStatusException(BAD_REQUEST,"Không tìm thấy mục: "+id);
        Instant due=BunproStages.due(jdbc,json,request.kind(),request.stage(),Instant.now());
        for(String id:ids) {
            var old=card(request.kind(),id);
            write(request.kind(),id,request.stage(),due,old.isEmpty()?null:((Number)old.get("revision")).longValue());
        }
    }
    StageIntervals intervals(String kind) { return new StageIntervals(BunproStages.intervals(jdbc,json,kind)); }
    @Transactional public StageIntervals intervals(String kind,StageIntervals request) {
        BunproStages.prefix(kind); BunproStages.validateIntervals(request==null?null:request.seconds());
        jdbc.update("UPDATE bunpro_stage_settings SET seconds_json=? WHERE kind=?",json.writeValueAsString(request.seconds()),kind); return request;
    }
    List<ProgressRow> export() {
        var result=new ArrayList<ProgressRow>();
        for(String kind:List.of("VOCAB","GRAMMAR")) result.addAll(jdbc.query("SELECT e.*,c.stage,c.due_at FROM bunpro_entries e JOIN "+BunproStages.prefix(kind)+"_cards c ON e.id=c.entry_id WHERE e.kind=? ORDER BY e.level,e.lesson,e.position",(rs,i)-> {
            var c=json.readValue(rs.getString("content_json"),CatalogContent.class);
            Integer stage=BunproStages.readStage(rs);
            return new ProgressRow(kind,rs.getString("id"),rs.getString("source_url"),stage,Integer.valueOf(12).equals(stage)?null:Instant.ofEpochMilli(rs.getLong("due_at")),c.title(),c.reading());
        },kind));
        return result;
    }
}
