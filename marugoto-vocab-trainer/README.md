# Marugoto Vocab Trainer

Local React + Vite app for studying Japanese vocabulary imported from selectable Marugoto-style PDFs. Spring Boot stores each PDF deck and the FSRS review progress locally.

## Run locally

Requirements: Java 24 and Node.js. Maven is not required; use the Maven Wrapper in `backend/`.

Terminal 1, start the API:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Terminal 2, start the UI from the repository root:

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Vite proxies `/api` requests to Spring on `127.0.0.1:8080`.

## Data and backups

By default the backend stores `data/trainer.db` and PDF files in `data/pdfs/` relative to `backend/`. Back up the complete data directory together. To use another location, set `APP_DATA_DIR` before starting Spring; `APP_PDF_DIR` can separately override the PDF directory.

This version starts with a clean backend. Previously stored browser statistics cannot be matched reliably because the old app did not persist the vocabulary cards or stable card IDs. Import the PDFs again; new review progress will then persist across restarts.

## Study flow

- Each imported PDF creates a separate deck. Select one deck or **Tất cả bộ** to study their cards together.
- Flashcard recall and Test use five choices when the selected card pool has at least five cards.
- Test and **Ôn đến hạn** let you choose the initial number of cards. Test prioritizes due cards, then fills from the rest of the selected deck scope.
- A wrong response is recorded as FSRS **Again** and returns to the active session after its due step. After a correct response, choose **Hard**, **Good**, or **Easy**.
- **Ôn đến hạn** presents only cards whose FSRS due time has arrived. The scheduler uses its default parameters, 90% desired retention, 1- and 10-minute learning steps, and a 10-minute relearning step.

## Checks

```powershell
cd backend
.\mvnw.cmd test
cd ..
npm test
npm run build
```

PDF parsing remains client-side. Scanned PDFs need OCR; scanned/image-only documents are not supported by the importer.
