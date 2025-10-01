## PDF Coordinate Import v1 – Implementation Checklist (Temporary)

Short-term tracking doc for Phase 1 (OCR-first, JS-only). Delete after completion.

### Architecture

- [ ] Create importer worker (Utility Process/WorkerThread) and IPC contract
  - [ ] Input: ArrayBuffer, options
  - [ ] Output: parsed sheets (with source/conf), progress events
- [ ] Add detector to choose extractor per document/page
- [ ] Implement vendor profile: Pyware v1 headers/columns

### Extractors

- [ ] Refactor text extractor (from `parsePage.ts`) into strategy module
  - [ ] Header detection and X-band histogram columns
  - [ ] Y-bucketing with epsilon tolerance
- [ ] Implement OCR extractor with tesseract.js (TSV)
  - [ ] Rasterize pages at ~300–400 DPI (node-canvas/sharp)
  - [ ] TSV parsing to tokens (x,y,w,h,text,conf)
  - [ ] Column anchoring using learned X-bands

### Reconciliation + Validation

- [ ] Reconcile blanks/low-confidence non-critical fields
- [ ] Strict guards for `setId` & `counts` (no inference)
- [ ] Per-set counts consistency across performers
- [ ] Extend `dryRun` with new issue codes: MISSING_CRITICAL, LOW_CONFIDENCE, UNRECOGNIZED_HEADER, COLUMN_MISALIGNMENT
- [ ] Confidence scoring (row/page/document)

### Orchestration

- [ ] Update `pdfCoordinates/index.ts` to orchestrate detector → extractor → normalize → dryRun
- [ ] Preserve existing `normalizeSheets` grammar; add minor variants as needed

### UI (Import Dialog)

- [ ] Show detection mode (OCR/Text/Mixed) and confidence summary
- [ ] Gate commit when critical issues exist; clear messaging
- [ ] Extend CSV export with `source`, `conf`, `issueCodes`

### Types & Contracts

- [ ] Extend `ParsedRow`, `ParsedSheet` with `source?: "ocr" | "text"`, `conf?: number`
- [ ] Extend `DryRunIssue` with `field?: keyof ParsedRow`, `confidence?: number`

### Testing

- [ ] Add fixture PDFs: clean embedded text, blanks-rich text, image-only
- [ ] Unit tests: columns, header detection, grammar, reconciliation, dry-run
- [ ] Integration: end-to-end import + commit updates `MarcherPages` and optional beats/pages
- [ ] Performance test at scale (100 pages) and adjust concurrency/DPI

### Performance & Settings

- [ ] Concurrency controls and memory guardrails in worker
- [ ] OCR DPI and `psm` defaults; expose advanced toggles (optional)

### Docs & Cleanup

- [ ] Update developer README for importer architecture
- [ ] Remove this checklist after all tasks are completed
