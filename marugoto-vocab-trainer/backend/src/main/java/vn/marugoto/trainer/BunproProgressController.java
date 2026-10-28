package vn.marugoto.trainer;

import org.springframework.web.bind.annotation.*;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/bunpro/progress")
class BunproProgressController {
    private final BunproProgressImportService service;
    private final ObjectMapper json;
    BunproProgressController(BunproProgressImportService service,ObjectMapper json) { this.service=service; this.json=json; }
    private void validateStage(JsonNode row) {
        var stage=row.get("stage");
        // Jackson's normal Integer binding accepts 3.9 as 3. Never silently
        // truncate an imported SRS level or accept a numeric string here.
        if(stage!=null && !stage.isNull() && (!stage.isIntegralNumber() || !stage.canConvertToInt()))
            throw new ResponseStatusException(BAD_REQUEST,"Cấp SRS phải là số nguyên từ 0 đến 12.");
    }
    private <T> T read(JsonNode input,Class<T> type) {
        try { return json.readValue(input.toString(),type); }
        catch(Exception ex) { throw new ResponseStatusException(BAD_REQUEST,"Dữ liệu tiến độ không hợp lệ.",ex); }
    }
    @PostMapping("/preview") ProgressPreview preview(@RequestBody JsonNode input) {
        var rows=input.path("rows");
        if(!rows.isArray()) throw new ResponseStatusException(BAD_REQUEST,"Cần danh sách rows.");
        for(var row:rows) validateStage(row);
        return service.preview(read(input,ProgressInput.class));
    }
    @PostMapping("/apply") ProgressApplied apply(@RequestBody ProgressApply input) { return service.apply(input); }
    @PutMapping("/stages") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void assign(@RequestBody JsonNode input) { validateStage(input); service.assign(read(input,StageAssignment.class)); }
    @GetMapping("/export") List<ProgressRow> export() { return service.export(); }
    @GetMapping("/intervals") StageIntervals intervals(@RequestParam String kind) { return service.intervals(kind); }
    @PutMapping("/intervals") StageIntervals intervals(@RequestParam String kind,@RequestBody StageIntervals input) { return service.intervals(kind,input); }
}
