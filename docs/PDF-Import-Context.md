# PDF Coordinate Import – Context for Agents

This document explains the PDF import tool so another agent can understand the architecture, data flow, and implementation details.

## Purpose

OpenMarch is a drill-writing application for marching band. Users can import coordinate data from PDF drill charts (e.g., exported from Pyware) instead of manual entry. The PDF import tool:

1. Extracts performer coordinates from PDF pages
2. Converts natural-language coordinates (“2.5 steps inside Side 1 50 yd ln”, “4.0 steps behind Front Hash”) into numeric `xSteps`/`ySteps`
3. Maps those to canvas pixels using the current field layout
4. Creates/updates `MarcherPages` (and optionally Beats/Pages) in the database

## High-Level Flow

```
PDF file → [Python: PyMuPDF/EasyOCR] → ParsedSheet[]
    → reconcile → normalize (text→xSteps/ySteps)
    → dryRun (validate)
    → UI (preview/commit)
    → MarcherPages + Beats + Pages
```

## Pipeline Stages

| Stage         | Module                                    | Purpose                                                                                            |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Extract**   | `parser.ts` → `parse_coordinate_sheet.py` | Parse PDF page(s) into rows with `setId`, `measureRange`, `counts`, `lateralText`, `fbText`        |
| **Reconcile** | `reconcile.ts`                            | Infer missing lateral/fb from previous row (hold), enforce per-set counts consistency              |
| **Normalize** | `normalize.ts`                            | Parse `lateralText`/`fbText` → `xSteps`/`ySteps` using `FieldProperties`                           |
| **Dry-run**   | `dryRun.ts`                               | Validate: label uniqueness, set/counts consistency, bounds, critical fields                        |
| **Commit**    | `ImportCoordinatesButton.tsx`             | Create Marchers, Beats, Pages; map setId→pageId; convert xSteps/ySteps→pixels; update MarcherPages |

## Key Data Structures

### ParsedRow (from Python / text extraction)

```ts
{ setId, measureRange, counts, lateralText, fbText, source?, conf? }
```

- `lateralText`: X-axis (side-to-side), e.g. `"2.5 steps inside Side 1 50 yd ln"`
- `fbText`: Y-axis (front-back), e.g. `"4.0 steps behind Front Hash (HS)"`

### NormalizedRow (after normalize.ts)

```ts
{ setId, counts, xSteps, ySteps, lateralText, fbText, source?, conf? }
```

- `xSteps`: Steps from center (0 = 50 yd line), negative = Side 1, positive = Side 2
- `ySteps`: Steps from center-front; positive = toward audience, negative = toward back

### ParsedSheet / NormalizedSheet

- `pageIndex`, `quadrant` (TL/TR/BL/BR), `header` (label, symbol, performer), `rows[]`

## Python Extraction (`apps/desktop/scripts/parse_coordinate_sheet.py`)

- **Input**: PDF binary on stdin, `page_index` and `dpi` as args
- **Output**: JSON `{ sheets: [...], debug: {...} }`

Each sheet:

```
{ performer_label, performer_name, printed_page_number, sets: [
  { set_id, measure_range, counts, side_text, fb_text, raw_coords }
], physical_pdf_page_index }
```

- Uses **PyMuPDF (fitz)** for embedded text extraction
- If page has little text (`< 200 chars`), falls back to **EasyOCR** (quadrant-by-quadrant)
- Splits page into quadrants TL/TR/BL/BR, sorts words by reading order
- Blocks split on `Performer:` and `Printed:`; stitched by label/page continuity
- Parses each line with `parse_set_row()` → `set_id`, measure/counts, then splits coord text into `side_text` and `fb_text` (split at `yd ln`)

**Dependencies**: `pymupdf`, `numpy`. OCR fallback: `easyocr`, `pdf2image`, `PIL`.

## Electron Bridge

- `electron/main/services/pdf-ocr-service.ts`: `runCoordinateParser(pdfArrayBuffer, pageIndex, dpi)`
- Spawns Python subprocess, pipes PDF to stdin, parses JSON from stdout
- IPC: `ocr:runCoordinateParser` (exposed via preload)
- `parser.ts` in renderer calls `window.electron.ocr.runCoordinateParser()` – requires Electron (not browser)

## Normalization (Text → xSteps/ySteps)

`normalize.ts` uses `FieldProperties`:

- `xCheckpoints`: yard lines (e.g. “45 yard line”) with `stepsFromCenterFront`
- `yCheckpoints`: hash marks, sidelines (Front Hash, Back Hash, etc.) with `stepsFromCenterFront`
- `parseLateral()`: handles “On X yd ln”, “X steps Inside/Outside X yd ln”, side detection (Side 1/2, A/B, Left/Right)
- `parseFrontBack()`: handles “On Front Hash”, “X steps In Front Of/Behind … Hash”, (HS)/(CH)/(PH) variants

## Commit Logic

In `ImportCoordinatesButton.tsx` `commitImport()`:

1. **Beats/Pages** (optional): Builds timeline from unique `setId`/`counts` in normalized sheets; creates Beats and Pages if `createTimeline` is enabled
2. **Marchers**: Creates marchers from sheet headers (label/symbol/performer); maps label → marcher id
3. **setId → pageId**: Maps each `setId` to a Page; first row → page 0 (FIRST_PAGE_ID)
4. **Coordinates**: For each normalized row, `x_pixels = centerFrontPoint.xPixels + xSteps * pixelsPerStep`, `y_pixels = centerFrontPoint.yPixels + ySteps * pixelsPerStep`
5. **MarcherPages**: Batch `updateMarcherPages` with `marcher_id`, `page_id`, `x`, `y`

## Vendor Profile

`profile.ts` defines `pywareProfile` – expected headers (Set, Measure, Counts, Side 1–Side 2, Front–Back), footer anchors, column order, regex for setId/counts, etc. Used for validation and future column detection; current Python parser does its own layout logic.

## Configuration

`src/config/importOptions.ts`:

- `ocr.dpi`: 300
- `ocr.minConfidence`: 0.5
- `gating.blockOnMissingCritical`, `blockOnSetMismatch`: true

## Key File Map

| Path                                                                | Role                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/desktop/src/importers/pdfCoordinates/index.ts`                | Orchestrator: loads PDF, iterates pages → parser → reconcile → normalize → dryRun |
| `apps/desktop/src/importers/pdfCoordinates/parser.ts`               | Calls Electron `runCoordinateParser`, maps Python output → ParsedSheet[]          |
| `apps/desktop/src/importers/pdfCoordinates/reconcile.ts`            | Holds, counts consistency                                                         |
| `apps/desktop/src/importers/pdfCoordinates/normalize.ts`            | lateralText/fbText → xSteps/ySteps                                                |
| `apps/desktop/src/importers/pdfCoordinates/dryRun.ts`               | Validation (DUPLICATE_LABEL, SET_MISMATCH, OUT_OF_BOUNDS, etc.)                   |
| `apps/desktop/src/importers/pdfCoordinates/types.ts`                | ParsedRow, ParsedSheet, NormalizedRow, NormalizedSheet, DryRunIssue               |
| `apps/desktop/src/components/importing/ImportCoordinatesButton.tsx` | UI, file picker, dry-run report, commit logic                                     |
| `apps/desktop/scripts/parse_coordinate_sheet.py`                    | Python extractor (PyMuPDF + EasyOCR)                                              |
| `apps/desktop/electron/main/services/pdf-ocr-service.ts`            | Spawns Python, IPC handlers                                                       |

## Phase 1 Roadmap (see `docs/PDF-Import-Phase1-Checklist.md`)

Planned improvements:

- Importer worker (Utility Process/WorkerThread) for heavy work
- Detector to choose text vs OCR extractor per page
- OCR extractor with tesseract.js (JS-only, no Python)
- More dry-run codes: LOW_CONFIDENCE, UNRECOGNIZED_HEADER, COLUMN_MISALIGNMENT
- Better UI: detection mode, confidence summary, gating on critical issues

## Constraints

- Import only allowed when **no performers exist** (`hasExistingPerformers` must be false)
- Requires **FieldProperties** (xCheckpoints, yCheckpoints, centerFrontPoint, pixelsPerStep)
- Python path: venv at `scripts/venv` or system `python3`/`python`
- Parser script path resolved relative to app root (dev vs packaged)

## Testing

- `apps/desktop/src/importers/pdfCoordinates/__test__/`: `parser.test.ts`, `integration.test.ts`, `grammar.test.ts`
- Fixtures: `__test__/pdf-import-raw-2.csv` (sample parsed output)
- Run: `npx vitest run pdfCoordinates`
