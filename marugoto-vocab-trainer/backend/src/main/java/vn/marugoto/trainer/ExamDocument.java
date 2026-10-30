package vn.marugoto.trainer;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** The import contract and grader. No vocabulary/SRS normalization is used here. */
@Component
class ExamDocument {
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}");
    private static final Pattern BLANK = Pattern.compile("\\{\\{([A-Za-z0-9][A-Za-z0-9_.:-]{0,119})}}");
    private final ObjectMapper json;

    ExamDocument(ObjectMapper json) { this.json = json; }

    static void require(boolean valid, String path, String message) {
        if (!valid) throw new IllegalArgumentException(path + ": " + message);
    }

    private void fields(JsonNode node, String path, String... allowed) {
        require(node != null && node.isObject(), path, "Cần một object.");
        var names = Set.of(allowed);
        node.properties().forEach(entry -> require(names.contains(entry.getKey()), path + "." + entry.getKey(), "Trường không được hỗ trợ."));
    }

    private void id(JsonNode node, String path) {
        require(node != null && node.isString() && ID.matcher(node.asText()).matches()
                && !Set.of("constructor", "prototype").contains(node.asText()), path,
                "ID dài 1–120 ký tự, bắt đầu bằng chữ/số, chỉ dùng chữ, số, _, ., :, -.");
    }

    private void array(JsonNode node, String path, int min, int max) {
        require(node != null && node.isArray() && node.size() >= min && node.size() <= max, path,
                "Cần mảng có " + min + "–" + max + " phần tử.");
    }

    private void text(JsonNode node, String path) {
        require(node != null && node.isString() && !node.asText().isBlank() && node.asText().length() <= 200000,
                path, "Cần chuỗi không trống, tối đa 200.000 ký tự.");
    }

    private void content(JsonNode node, String path) {
        if (node != null && node.isString()) { text(node, path); return; }
        array(node, path, 1, 10000);
        for (int i = 0; i < node.size(); i++) {
            var token = node.get(i); var p = path + "[" + i + "]";
            fields(token, p, "text", "reading");
            text(token.get("text"), p + ".text");
            if (token.has("reading")) text(token.get("reading"), p + ".reading");
        }
    }

    private void integer(JsonNode node, String path, int min, int max) {
        require(node != null && node.isIntegralNumber() && node.canConvertToInt()
                && node.asInt() >= min && node.asInt() <= max, path, "Cần số nguyên " + min + "–" + max + ".");
    }

    ObjectNode validate(JsonNode input) {
        fields(input, "$", "schemaVersion", "id", "title", "description", "instructions", "timeLimitMinutes", "sections");
        integer(input.get("schemaVersion"), "$.schemaVersion", 1, 1);
        id(input.get("id"), "$.id"); text(input.get("title"), "$.title");
        for (var key : List.of("description", "instructions")) if (input.has(key)) content(input.get(key), "$." + key);
        if (input.has("timeLimitMinutes")) integer(input.get("timeLimitMinutes"), "$.timeLimitMinutes", 1, 1440);
        array(input.get("sections"), "$.sections", 1, 100);
        var sectionIds = new HashSet<String>(); var questionIds = new HashSet<String>();
        for (int si = 0; si < input.path("sections").size(); si++) {
            var s = input.path("sections").get(si); var sp = "$.sections[" + si + "]";
            fields(s, sp, "id", "title", "instructions", "passage", "questions");
            id(s.get("id"), sp + ".id"); text(s.get("title"), sp + ".title");
            require(sectionIds.add(s.path("id").asText()), sp + ".id", "ID phần thi bị trùng.");
            for (var key : List.of("instructions", "passage")) if (s.has(key)) content(s.get(key), sp + "." + key);
            array(s.get("questions"), sp + ".questions", 1, 1000);
            for (int qi = 0; qi < s.path("questions").size(); qi++) {
                var q = s.path("questions").get(qi); var p = sp + ".questions[" + qi + "]";
                require(q.isObject(), p, "Cần một object.");
                var type = q.path("type").asText();
                switch (type) {
                    case "single_choice" -> fields(q, p, "id", "type", "prompt", "promptTranslationEn", "explanation", "options", "correctOptionId", "points");
                    case "fill_blank" -> fields(q, p, "id", "type", "prompt", "promptTranslationEn", "explanation", "blanks");
                    case "essay" -> fields(q, p, "id", "type", "prompt", "promptTranslationEn", "explanation", "modelAnswer");
                    default -> throw new IllegalArgumentException(p + ".type: Chỉ nhận single_choice, fill_blank, essay.");
                }
                id(q.get("id"), p + ".id");
                require(questionIds.add(q.path("id").asText()), p + ".id", "ID câu hỏi bị trùng trong đề.");
                require(questionIds.size() <= 1000, "$.sections", "Tối đa 1.000 câu hỏi mỗi đề.");
                content(q.get("prompt"), p + ".prompt"); content(q.get("explanation"), p + ".explanation");
                if (q.has("promptTranslationEn")) text(q.get("promptTranslationEn"), p + ".promptTranslationEn");
                if (q.has("points")) integer(q.get("points"), p + ".points", 1, 100000);
                if (type.equals("single_choice")) {
                    array(q.get("options"), p + ".options", 2, 20);
                    var optionIds = new HashSet<String>();
                    for (int oi = 0; oi < q.path("options").size(); oi++) {
                        var o = q.path("options").get(oi); var op = p + ".options[" + oi + "]";
                        fields(o, op, "id", "text"); id(o.get("id"), op + ".id"); content(o.get("text"), op + ".text");
                        require(optionIds.add(o.path("id").asText()), op + ".id", "ID lựa chọn bị trùng.");
                    }
                    id(q.get("correctOptionId"), p + ".correctOptionId");
                    require(optionIds.contains(q.path("correctOptionId").asText()), p + ".correctOptionId", "Không tìm thấy lựa chọn đúng.");
                } else if (type.equals("fill_blank")) {
                    array(q.get("blanks"), p + ".blanks", 1, 100);
                    var blankIds = new HashSet<String>();
                    for (int bi = 0; bi < q.path("blanks").size(); bi++) {
                        var b = q.path("blanks").get(bi); var bp = p + ".blanks[" + bi + "]";
                        fields(b, bp, "id", "acceptedAnswers", "points"); id(b.get("id"), bp + ".id");
                        require(blankIds.add(b.path("id").asText()), bp + ".id", "ID chỗ trống bị trùng.");
                        array(b.get("acceptedAnswers"), bp + ".acceptedAnswers", 1, 100);
                        for (int ai = 0; ai < b.path("acceptedAnswers").size(); ai++) text(b.path("acceptedAnswers").get(ai), bp + ".acceptedAnswers[" + ai + "]");
                        if (b.has("points")) integer(b.get("points"), bp + ".points", 1, 100000);
                    }
                    var found = new ArrayList<String>();
                    // Placeholders must be wholly inside one token; renderer never parses HTML.
                    List<String> parts = new ArrayList<>();
                    if (q.path("prompt").isString()) parts.add(q.path("prompt").asText());
                    else q.path("prompt").forEach(t -> parts.add(t.path("text").asText()));
                    for (var part : parts) {
                        var matcher = BLANK.matcher(part);
                        while (matcher.find()) found.add(matcher.group(1));
                        var rest = BLANK.matcher(part).replaceAll("");
                        require(!rest.contains("{{") && !rest.contains("}}"), p + ".prompt", "Placeholder sai hoặc bị chia giữa các token.");
                    }
                    require(found.size() == blankIds.size() && new HashSet<>(found).equals(blankIds), p + ".prompt", "Mỗi chỗ trống cần đúng một placeholder {{id}} tương ứng.");
                    if (q.path("prompt").isArray()) for (var token : q.path("prompt"))
                        require(!token.has("reading") || !token.path("text").asText().contains("{{"), p + ".prompt", "Không gắn reading vào token chứa chỗ trống.");
                } else content(q.get("modelAnswer"), p + ".modelAnswer");
            }
        }
        return (ObjectNode) input.deepCopy();
    }

    List<JsonNode> questions(JsonNode document) {
        var result = new ArrayList<JsonNode>();
        document.path("sections").forEach(s -> s.path("questions").forEach(result::add));
        return result;
    }

    String plain(JsonNode content) {
        if (content.isString()) return content.asText();
        var result = new StringBuilder(); content.forEach(t -> result.append(t.path("text").asText()));
        return result.toString();
    }

    private Object canonical(JsonNode node) {
        if (node.isObject()) {
            var map = new TreeMap<String, Object>(); node.properties().forEach(e -> map.put(e.getKey(), canonical(e.getValue()))); return map;
        }
        if (node.isArray()) { var list = new ArrayList<Object>(); node.forEach(n -> list.add(canonical(n))); return list; }
        if (node.isString()) return node.asText();
        if (node.isIntegralNumber()) return node.asLong();
        if (node.isBoolean()) return node.asBoolean();
        return null;
    }

    String hash(JsonNode document) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(canonical(document)).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException("Không tính được mã đề.", e); }
    }

    static String normalized(String value) { return Normalizer.normalize(value, Normalizer.Form.NFC).strip(); }

    ObjectNode grade(JsonNode question, JsonNode answer) {
        var result = json.createObjectNode();
        var type = question.path("type").asText();
        result.set("explanation", question.path("explanation"));
        if (type.equals("essay")) {
            result.put("kind", "REFERENCE"); result.set("modelAnswer", question.path("modelAnswer")); return result;
        }
        long score = 0, max = 0;
        int correctUnits = 0, totalUnits = 0;
        if (type.equals("single_choice")) {
            max = question.path("points").asInt(1); totalUnits = 1;
            if (answer != null && answer.isString() && answer.asText().equals(question.path("correctOptionId").asText())) { score = max; correctUnits = 1; }
            result.set("correctOptionId", question.path("correctOptionId"));
        } else {
            var blanks = json.createObjectNode();
            for (var b : question.path("blanks")) {
                var bid = b.path("id").asText(); var given = answer == null ? "" : answer.path(bid).asText("");
                boolean correct = false;
                for (var accepted : b.path("acceptedAnswers")) if (!normalized(given).isEmpty() && normalized(given).equals(normalized(accepted.asText()))) correct = true;
                int points = b.path("points").asInt(1); max += points; totalUnits++;
                if (correct) { score += points; correctUnits++; }
                var item = json.createObjectNode(); item.put("correct", correct); item.set("acceptedAnswers", b.path("acceptedAnswers")); blanks.set(bid, item);
            }
            result.set("blanks", blanks);
        }
        result.put("kind", "SCORED"); result.put("score", score); result.put("maxScore", max);
        result.put("correct", score == max); result.put("correctUnits", correctUnits); result.put("totalUnits", totalUnits);
        return result;
    }
}
