package vn.marugoto.trainer;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.util.*;

/** Parses offline capture HTML only; never fetches URLs or executes captured markup. */
@Component
class BunproCaptureParser {
    record Parsed(String url, int lesson, int position, String title, String reading, String meaning, VocabData data) {}
    record Result(List<Parsed> entries, CapturePreview preview) {}

    static String tag(String source) {
        String s=source.strip();
        if(s.startsWith("う-verb")) return "GODAN";
        if(s.equals("る-verb")) return "ICHIDAN";
        if(s.startsWith("する-verb")) return "SURU";
        if(s.startsWith("くる-verb")) return "KURU";
        return switch(s) {
            case "Noun" -> "NOUN"; case "Pronoun" -> "PRONOUN";
            case "い-adjective" -> "I_ADJECTIVE"; case "な-adjective" -> "NA_ADJECTIVE";
            case "の-adjective" -> "NO_ADJECTIVE";
            case "Transitive verb" -> "TRANSITIVE"; case "Intransitive verb" -> "INTRANSITIVE";
            case "Adverb" -> "ADVERB"; case "Expression" -> "EXPRESSION";
            case "Interjection" -> "INTERJECTION"; case "Conjunction" -> "CONJUNCTION";
            case "Counter" -> "COUNTER"; case "Suffix", "Noun suffix" -> "SUFFIX";
            case "Prefix", "Noun prefix" -> "PREFIX"; case "Auxiliary verb" -> "AUXILIARY_VERB";
            case "Pre-noun adjectival", "Prenominal noun/verb" -> "PRENOMINAL";
            case "Particle" -> "PARTICLE"; default -> null;
        };
    }
    static List<String> labels(String value) {
        // Commas inside parentheses belong to a source label.
        return Arrays.stream(value.split(",\\s*(?![^()]*\\))")).map(String::strip).filter(s->!s.isEmpty()).toList();
    }
    static String str(JsonNode node, String name) { return node.path(name).asText(""); }
    static String section(JsonNode result, String name) {
        for(var s:result.path("sections")) if(name.equals(str(s,"name"))) return str(s,"html");
        return "";
    }
    Result parse(JsonNode root, Set<String> existingUrls) {
        List<String> errors=new ArrayList<>(); List<Parsed> parsed=new ArrayList<>();
        Set<String> urls=new HashSet<>(); Map<Integer,Integer> positions=new HashMap<>();
        int examples=0, matched=0, unclassified=0, unknown=0;
        if(root.path("version").asInt()!=1 || !root.path("entries").isArray() ||
                !str(root,"purpose").startsWith("bunpro-source-capture"))
            errors.add("Tệp không phải JSON capture Bunpro phiên bản 1.");
        for(var entry:root.path("entries")) {
            String title=str(entry,"title");
            try {
                if(!"VOCAB".equals(str(entry,"kind")) || !"CAPTURED".equals(str(entry,"status")))
                    throw new IllegalArgumentException("Mục chưa thu thập thành công hoặc không phải từ vựng.");
                String url=BunproService.sourceUrl(str(entry,"sourceUrl"));
                if(!url.contains("/vocabs/")) throw new IllegalArgumentException("URL không phải từ vựng.");
                if(!urls.add(url)) throw new IllegalArgumentException("URL trùng.");
                var r=entry.path("result");
                if(!r.isObject() || str(r,"title").isBlank() || str(r,"meaning").isBlank())
                    throw new IllegalArgumentException("Thiếu tiêu đề hoặc nghĩa.");
                int lesson=entry.path("lesson").asInt();
                if(lesson<1) throw new IllegalArgumentException("Lesson không hợp lệ.");
                var data=data(r);
                if(entry.path("exampleCount").asInt(-1)!=data.examples().size() ||
                        r.path("exampleCount").asInt(-1)!=data.examples().size())
                    throw new IllegalArgumentException("Số ví dụ không khớp số đã khai báo.");
                parsed.add(new Parsed(url,lesson,positions.merge(lesson,1,Integer::sum),str(r,"title"),str(r,"reading"),str(r,"meaning"),data));
                examples+=data.examples().size();
                if(existingUrls.contains(url)) matched++;
                if(data.partsOfSpeech().isEmpty()) unclassified++;
                unknown+=data.unknownLabels().size();
            } catch(Exception ex) { errors.add(title+": "+ex.getMessage()); }
        }
        int declared=root.path("counts").path("total").asInt(-1);
        int declaredExamples=root.path("counts").path("examples").asInt(-1);
        if(declared!=parsed.size()) errors.add("Kiểm kê từ: khai báo "+declared+", hợp lệ "+parsed.size()+".");
        if(declaredExamples!=examples) errors.add("Kiểm kê ví dụ: khai báo "+declaredExamples+", hợp lệ "+examples+".");
        if(parsed.size()!=1100 || examples!=11205)
            errors.add("Bản N5 yêu cầu 1.100 từ / 11.205 ví dụ; tệp có "+parsed.size()+" / "+examples+".");
        return new Result(parsed,new CapturePreview(parsed.size(),examples,matched,parsed.size()-matched,unclassified,unknown,declared,declaredExamples,errors));
    }

    VocabData data(JsonNode r) {
        var doc=Jsoup.parseBodyFragment(section(r,"dictionary-definition"));
        doc.select("script,style,iframe").remove();
        List<VocabSense> senses=new ArrayList<>(); Set<String> allTags=new LinkedHashSet<>(), unknown=new LinkedHashSet<>();
        for(Element group:doc.select("ol > li")) {
            Element pos=child(group,"p"), definitions=child(group,"ol");
            if(pos==null || definitions==null) continue;
            List<String> sourceLabels=labels(pos.text());
            List<String> tags=new ArrayList<>();
            for(String label:sourceLabels) { String code=tag(label); if(code==null) unknown.add(label); else if(!tags.contains(code)) tags.add(code); }
            allTags.addAll(tags);
            for(Element definition:definitions.children()) {
                Element body=child(definition,"div"); if(body==null) continue;
                Element meaning=child(body,"p"), notes=child(body,"div");
                if(meaning!=null) senses.add(new VocabSense("sense-"+(senses.size()+1),meaning.text(),tags,sourceLabels,notes==null?"":notes.text()));
            }
        }
        List<Element> japanese=new ArrayList<>(); List<String> levels=new ArrayList<>();
        var exDoc=Jsoup.parseBodyFragment(section(r,"examples"));
        for(Element li:exDoc.select("li")) {
            Element div=child(li,"div");
            if(div==null) continue;
            List<Element> ps=div.children().stream().filter(e->e.normalName().equals("p")).toList();
            if(ps.size()<2) continue;
            japanese.add(ps.getFirst());
            String level="";
            for(Element ul:li.children().stream().filter(e->e.normalName().equals("ul")).toList())
                for(Element badge:ul.children()) if(badge.text().matches("N[1-5]")) level=badge.text();
            levels.add(level);
        }
        if(!r.path("examples").isArray()) throw new IllegalArgumentException("Thiếu mảng ví dụ.");
        List<VocabExample> examples=new ArrayList<>(); Set<String> ids=new HashSet<>(); int i=0;
        for(var ex:r.path("examples")) {
            String sentence=str(ex,"sentence"), translation=str(ex,"translation"), id=str(ex,"sourceId");
            if(sentence.isBlank() || translation.isBlank()) throw new IllegalArgumentException("Ví dụ thiếu câu hoặc bản dịch.");
            if(id.isBlank()) id="example-"+UUID.nameUUIDFromBytes((sentence+"\n"+translation).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            if(!ids.add(id)) throw new IllegalArgumentException("ID ví dụ trùng: "+id);
            List<RubyToken> tokens=new ArrayList<>();
            if(i<japanese.size()) tokens(japanese.get(i),tokens);
            if(!sentence.equals(tokens.stream().map(RubyToken::text).reduce("",String::concat))) tokens=fallbackTokens(sentence,ex.path("furigana"));
            examples.add(new VocabExample(id,sentence,str(ex,"reading"),tokens,translation,"",str(ex,"notes"),i<levels.size()?levels.get(i):"")); i++;
        }
        List<String> issues=new ArrayList<>(); for(var issue:r.path("issues")) issues.add(issue.asText());
        // Preserve unstructured summary/all forms as plain text alongside the parsed senses.
        String notes=str(r,"dictionaryDefinition");
        return new VocabData(senses,List.copyOf(allTags),List.copyOf(unknown),examples,notes,
                str(r,"completeness").isBlank()?"NEEDS_REVIEW":str(r,"completeness"),str(r,"capturedAt"),issues);
    }
    private static Element child(Element e,String tag) { return e.children().stream().filter(c->c.normalName().equals(tag)).findFirst().orElse(null); }
    private static void tokens(Node node,List<RubyToken> out) {
        if(node instanceof TextNode text) { if(!text.getWholeText().isEmpty()) out.add(new RubyToken(text.getWholeText(),"")); return; }
        if(node instanceof Element e) {
            if(Set.of("script","style","rt","rp").contains(e.normalName())) return;
            if(e.normalName().equals("ruby")) {
                var base=e.clone(); base.select("rt,rp").remove();
                out.add(new RubyToken(base.text(),e.select("rt").text())); return;
            }
        }
        for(var child:node.childNodes()) tokens(child,out);
    }
    static List<RubyToken> fallbackTokens(String sentence,JsonNode furigana) {
        List<RubyToken> out=new ArrayList<>(); int offset=0;
        for(var f:furigana) {
            String text=str(f,"text"), reading=str(f,"reading"); if(text.isBlank()) continue;
            int next=sentence.indexOf(text,offset); if(next<0) continue;
            if(next>offset) out.add(new RubyToken(sentence.substring(offset,next),""));
            out.add(new RubyToken(text,reading)); offset=next+text.length();
        }
        if(offset<sentence.length()) out.add(new RubyToken(sentence.substring(offset),""));
        return out;
    }
}
