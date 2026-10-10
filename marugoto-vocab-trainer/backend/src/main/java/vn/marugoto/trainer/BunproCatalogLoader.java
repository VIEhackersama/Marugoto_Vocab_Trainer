package vn.marugoto.trainer;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
class BunproCatalogLoader implements ApplicationRunner {
    private final BunproService service;
    private final ObjectMapper json;
    private final BunproVocabService vocab;
    BunproCatalogLoader(BunproService service,ObjectMapper json,BunproVocabService vocab) { this.service=service; this.json=json; this.vocab=vocab; }
    @Override public void run(ApplicationArguments args) throws Exception {
        var resource=new ClassPathResource("bunpro/n5.json");
        if(resource.exists()) try(var stream=resource.getInputStream()) {
            service.importSnapshot(json.readValue(stream,CatalogSnapshot.class));
        }
        var capture=new ClassPathResource("bunpro/n5-vocab-capture.json");
        if(capture.exists()) try(var stream=capture.getInputStream()) {
            vocab.importCapture(json.readTree(stream));
        }
    }
}
