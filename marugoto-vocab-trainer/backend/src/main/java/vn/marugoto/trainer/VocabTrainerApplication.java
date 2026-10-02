package vn.marugoto.trainer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@EnableScheduling
@SpringBootApplication
public class VocabTrainerApplication {
    public static void main(String[] args) throws IOException {
        String dataDir = System.getenv().getOrDefault("APP_DATA_DIR", "./data");
        String pdfDir = System.getenv().getOrDefault("APP_PDF_DIR", dataDir + "/pdfs");
        Files.createDirectories(Path.of(dataDir));
        Files.createDirectories(Path.of(pdfDir));
        SpringApplication.run(VocabTrainerApplication.class, args);
    }
}
