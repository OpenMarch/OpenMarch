/**
 * Batch PDF Import Test Harness
 *
 * Drop PDF coordinate sheets into __test__/fixtures/pdfs/ and run:
 *   cd apps/desktop && npx vitest run batch-import
 *
 * Produces fixtures/batch-report.json with per-file and aggregate stats.
 */
import { describe, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractSheetsFromPage } from "../parsePage";
import { reconcileSheets } from "../reconcile";
import { normalizeSheets } from "../normalize";
import { dryRunValidate } from "../dryRun";
import type { ParsedSheet, NormalizedSheet, DryRunIssue } from "../types";
import FootballTemplates from "../../../global/classes/fieldTemplates/Football";

// pdfjs-dist v5 requires DOMMatrix which jsdom doesn't provide
if (typeof globalThis.DOMMatrix === "undefined") {
    (globalThis as any).DOMMatrix = class DOMMatrix {
        a = 1;
        b = 0;
        c = 0;
        d = 1;
        e = 0;
        f = 0;
        constructor(init?: any) {
            if (Array.isArray(init) && init.length >= 6) {
                [this.a, this.b, this.c, this.d, this.e, this.f] = init;
            }
        }
        isIdentity = true;
        is2D = true;
        inverse() {
            return new DOMMatrix();
        }
        multiply() {
            return new DOMMatrix();
        }
        translate() {
            return new DOMMatrix();
        }
        scale() {
            return new DOMMatrix();
        }
        rotate() {
            return new DOMMatrix();
        }
        transformPoint(p: any) {
            return p || { x: 0, y: 0, z: 0, w: 1 };
        }
    };
}

const FIXTURES_DIR = path.join(__dirname, "fixtures", "pdfs");
const REPORT_PATH = path.join(__dirname, "fixtures", "batch-report.json");

const fieldProps = FootballTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

type FileResult = {
    file: string;
    pages: number;
    sheetsExtracted: number;
    rowsParsed: number;
    rowsValid: number;
    rowsFailed: number;
    parseRate: number;
    performers: string[];
    errorsByCode: Record<string, number>;
    failingSamples: Array<{
        code: string;
        setId: string;
        text: string;
        message: string;
    }>;
    elapsedMs: number;
};

type AggregateStats = {
    files: number;
    totalPages: number;
    totalSheets: number;
    totalRows: number;
    totalValid: number;
    totalFailed: number;
    overallParseRate: number;
    errorsByCode: Record<string, number>;
    worstFiles: Array<{ file: string; parseRate: number; errors: number }>;
    failingPatterns: {
        lateral: Array<{ text: string; count: number }>;
        fb: Array<{ text: string; count: number }>;
    };
};

let pdfjsModule: any = null;
async function initPdfjs() {
    if (pdfjsModule) return pdfjsModule;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    (pdfjs as any).GlobalWorkerOptions.workerSrc = req.resolve(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
    pdfjsModule = pdfjs;
    return pdfjs;
}

async function loadPdf(filePath: string) {
    const pdfjs = await initPdfjs();
    const data = new Uint8Array(fs.readFileSync(filePath));
    // useSystemFonts avoids fetching bundled font files, suppressing
    // "standardFontDataUrl" warnings irrelevant for text extraction
    return (pdfjs as any).getDocument({
        data,
        useSystemFonts: true,
    }).promise;
}

async function processFile(filePath: string): Promise<FileResult> {
    const fileName = path.basename(filePath);
    const start = Date.now();

    const pdf = await loadPdf(filePath);
    const parsed: ParsedSheet[] = [];

    for (let i = 0; i < pdf.numPages; i++) {
        const sheets = await extractSheetsFromPage(pdf, i);
        parsed.push(...sheets);
    }

    const reconciled = reconcileSheets(parsed);
    const normalized = normalizeSheets(reconciled, fieldProps);
    const dryRun = dryRunValidate(normalized);

    const totalRows = normalized.reduce((s, sh) => s + sh.rows.length, 0);
    const failedRows = dryRun.issues.filter(
        (i) =>
            i.code === "LATERAL_PARSE_FAILED" ||
            i.code === "FB_PARSE_FAILED" ||
            i.code === "OUT_OF_BOUNDS" ||
            i.code === "MISSING_CRITICAL",
    );
    const failedSetIds = new Set(
        failedRows.map((i) => `${i.pageIndex}:${i.setId}`),
    );
    const validRows = totalRows - failedSetIds.size;

    const errorsByCode: Record<string, number> = {};
    for (const issue of dryRun.issues) {
        errorsByCode[issue.code] = (errorsByCode[issue.code] || 0) + 1;
    }

    const performers = Array.from(
        new Set(
            normalized.map(
                (s) =>
                    s.header.label ||
                    s.header.symbol ||
                    s.header.performer ||
                    "?",
            ),
        ),
    );

    const failingSamples = collectFailingSamples(dryRun.issues, normalized);

    return {
        file: fileName,
        pages: pdf.numPages,
        sheetsExtracted: parsed.length,
        rowsParsed: totalRows,
        rowsValid: validRows,
        rowsFailed: failedSetIds.size,
        parseRate: totalRows > 0 ? validRows / totalRows : 1,
        performers,
        errorsByCode,
        failingSamples,
        elapsedMs: Date.now() - start,
    };
}

function collectFailingSamples(
    issues: DryRunIssue[],
    normalized: NormalizedSheet[],
) {
    const samples: FileResult["failingSamples"] = [];
    const seenPerCode = new Map<string, number>();
    const MAX_PER_CODE = 5;

    const rowLookup = new Map<string, NormalizedSheet["rows"][number]>();
    for (const s of normalized) {
        for (const r of s.rows) {
            rowLookup.set(`${s.pageIndex}:${r.setId}`, r);
        }
    }

    for (const issue of issues) {
        const count = seenPerCode.get(issue.code) || 0;
        if (count >= MAX_PER_CODE) continue;
        seenPerCode.set(issue.code, count + 1);

        const row = rowLookup.get(`${issue.pageIndex}:${issue.setId}`);
        const text =
            issue.code === "LATERAL_PARSE_FAILED"
                ? row?.lateralText || ""
                : issue.code === "FB_PARSE_FAILED"
                  ? row?.fbText || ""
                  : `x=${row?.xSteps}, y=${row?.ySteps}`;

        samples.push({
            code: issue.code,
            setId: issue.setId || "?",
            text,
            message: issue.message,
        });
    }
    return samples;
}

function buildAggregate(results: FileResult[]): AggregateStats {
    const errorsByCode: Record<string, number> = {};
    const lateralFails = new Map<string, number>();
    const fbFails = new Map<string, number>();

    let totalPages = 0,
        totalSheets = 0,
        totalRows = 0,
        totalValid = 0,
        totalFailed = 0;

    for (const r of results) {
        totalPages += r.pages;
        totalSheets += r.sheetsExtracted;
        totalRows += r.rowsParsed;
        totalValid += r.rowsValid;
        totalFailed += r.rowsFailed;
        for (const [code, n] of Object.entries(r.errorsByCode)) {
            errorsByCode[code] = (errorsByCode[code] || 0) + n;
        }
        for (const s of r.failingSamples) {
            if (s.code === "LATERAL_PARSE_FAILED" && s.text) {
                lateralFails.set(s.text, (lateralFails.get(s.text) || 0) + 1);
            }
            if (s.code === "FB_PARSE_FAILED" && s.text) {
                fbFails.set(s.text, (fbFails.get(s.text) || 0) + 1);
            }
        }
    }

    const worstFiles = [...results]
        .sort((a, b) => a.parseRate - b.parseRate)
        .slice(0, 5)
        .map((r) => ({
            file: r.file,
            parseRate: r.parseRate,
            errors: r.rowsFailed,
        }));

    const toSorted = (m: Map<string, number>) =>
        [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([text, count]) => ({ text, count }));

    return {
        files: results.length,
        totalPages,
        totalSheets,
        totalRows,
        totalValid,
        totalFailed,
        overallParseRate: totalRows > 0 ? totalValid / totalRows : 1,
        errorsByCode,
        worstFiles,
        failingPatterns: {
            lateral: toSorted(lateralFails),
            fb: toSorted(fbFails),
        },
    };
}

function printSummary(agg: AggregateStats, results: FileResult[]) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║        BATCH PDF IMPORT REPORT               ║");
    console.log("╚══════════════════════════════════════════════╝\n");
    console.log(
        `  Files: ${agg.files}  |  Pages: ${agg.totalPages}  |  Sheets: ${agg.totalSheets}  |  Rows: ${agg.totalRows}`,
    );
    console.log(
        `  Valid: ${agg.totalValid}  |  Failed: ${agg.totalFailed}  |  Parse rate: ${(agg.overallParseRate * 100).toFixed(1)}%\n`,
    );

    if (Object.keys(agg.errorsByCode).length > 0) {
        console.log("  Errors by code:");
        for (const [code, n] of Object.entries(agg.errorsByCode).sort(
            (a, b) => b[1] - a[1],
        )) {
            console.log(`    ${code.padEnd(28)} ${n}`);
        }
        console.log();
    }

    if (results.length > 0) {
        console.log(
            "  Per-file breakdown:                                                  ",
        );
        console.log(
            "  ─────────────────────────────────────────────────────────────────────",
        );
        console.log(
            "  File                            Pages  Sheets  Rows   Rate    Time  ",
        );
        console.log(
            "  ─────────────────────────────────────────────────────────────────────",
        );
        for (const r of results) {
            const name =
                r.file.length > 30 ? r.file.slice(0, 27) + "..." : r.file;
            console.log(
                `  ${name.padEnd(33)} ${String(r.pages).padStart(3)}   ${String(r.sheetsExtracted).padStart(5)}  ${String(r.rowsParsed).padStart(5)}  ${(r.parseRate * 100).toFixed(0).padStart(4)}%  ${(r.elapsedMs / 1000).toFixed(1).padStart(5)}s`,
            );
        }
        console.log();
    }

    if (agg.worstFiles.length > 0 && agg.totalFailed > 0) {
        console.log("  Worst-performing files:");
        for (const w of agg.worstFiles) {
            if (w.errors === 0) continue;
            console.log(
                `    ${w.file.padEnd(30)} ${(w.parseRate * 100).toFixed(0)}% (${w.errors} errors)`,
            );
        }
        console.log();
    }

    if (agg.failingPatterns.lateral.length > 0) {
        console.log("  Top failing lateral patterns:");
        for (const p of agg.failingPatterns.lateral.slice(0, 5)) {
            console.log(`    "${p.text}" (${p.count}x)`);
        }
        console.log();
    }

    if (agg.failingPatterns.fb.length > 0) {
        console.log("  Top failing front-back patterns:");
        for (const p of agg.failingPatterns.fb.slice(0, 5)) {
            console.log(`    "${p.text}" (${p.count}x)`);
        }
        console.log();
    }
}

describe("batch PDF import", () => {
    it(
        "processes all PDFs in fixtures/pdfs/ and generates report",
        async () => {
            if (!fs.existsSync(FIXTURES_DIR)) {
                console.log(
                    `\n  [batch] No fixtures directory at ${FIXTURES_DIR}. Skipping.\n`,
                );
                return;
            }

            const pdfs = fs
                .readdirSync(FIXTURES_DIR)
                .filter((f) => f.toLowerCase().endsWith(".pdf"));

            if (pdfs.length === 0) {
                console.log(
                    `\n  [batch] No PDF files found in ${FIXTURES_DIR}. Drop PDFs there and re-run.\n`,
                );
                return;
            }

            console.log(
                `\n  [batch] Found ${pdfs.length} PDF(s) to process...\n`,
            );

            const results: FileResult[] = [];
            for (const pdf of pdfs) {
                const filePath = path.join(FIXTURES_DIR, pdf);
                try {
                    const result = await processFile(filePath);
                    results.push(result);
                    console.log(
                        `  [batch] ${pdf}: ${result.sheetsExtracted} sheets, ${result.rowsParsed} rows, ${(result.parseRate * 100).toFixed(0)}% valid (${result.elapsedMs}ms)`,
                    );
                } catch (err: any) {
                    console.error(`  [batch] FAILED ${pdf}: ${err.message}`);
                    results.push({
                        file: pdf,
                        pages: 0,
                        sheetsExtracted: 0,
                        rowsParsed: 0,
                        rowsValid: 0,
                        rowsFailed: 0,
                        parseRate: 0,
                        performers: [],
                        errorsByCode: { LOAD_FAILED: 1 },
                        failingSamples: [
                            {
                                code: "LOAD_FAILED",
                                setId: "-",
                                text: err.message,
                                message: err.message,
                            },
                        ],
                        elapsedMs: 0,
                    });
                }
            }

            const aggregate = buildAggregate(results);
            const report = { aggregate, files: results };

            fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
            console.log(`\n  [batch] Report written to ${REPORT_PATH}`);

            printSummary(aggregate, results);
        },
        5 * 60 * 1000,
    ); // 5 minute timeout for large batches
});
