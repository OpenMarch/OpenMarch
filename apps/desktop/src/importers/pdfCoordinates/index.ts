/**
 * PDF coordinate sheet importer adapter.
 *
 * Implements the two-phase ImporterAdapter interface:
 *   preprocess() — heavy PDF text extraction via pdfjs (called once per file)
 *   parse()      — fast reconcile → normalize → validate → manifest (re-runs on config changes)
 */

import type { ParsedSheet, NormalizedSheet } from "./types";
import { getNormalizedSheetKeys, keyToDrillPrefixAndOrder } from "./types";
import { extractSheetsFromPage } from "./parsePage";
import { normalizeSheets } from "./normalize";
import { reconcileSheets } from "./reconcile";
import { dryRunValidate } from "./dryRun";
import { buildPagePlan, validatePlan } from "./planBuilder";
import type { SourceHashType } from "./coordParser";
import type {
    ImportManifest,
    ImporterAdapter,
    ImportIssue,
    AdapterConfig,
    AdapterParseResult,
    AdapterConfigStep,
} from "../types";
import {
    FieldTypeStep,
    HashTypeStep,
    IndoorTemplateStep,
    IndoorReferencesStep,
} from "./PdfConfigSteps";
import IndoorTemplates from "@/global/classes/fieldTemplates/Indoor";

export type { SourceHashType } from "./coordParser";

// ── Types ────────────────────────────────────────────────────────────

export type PdfPreprocessed = {
    pageCount: number;
    sheets: ParsedSheet[];
};

type FieldCheckpoints = {
    xCheckpoints: {
        name: string;
        stepsFromCenterFront: number;
        useAsReference: boolean;
    }[];
    yCheckpoints: {
        name: string;
        stepsFromCenterFront: number;
        useAsReference: boolean;
    }[];
};

// ── PDF worker setup ─────────────────────────────────────────────────

async function configurePdfWorker(pdfjs: any) {
    try {
        const workerModule =
            await import("pdfjs-dist/build/pdf.worker.min.mjs?raw");
        const blob = new Blob([workerModule.default as string], {
            type: "application/javascript",
        });
        (pdfjs as any).GlobalWorkerOptions.workerSrc =
            URL.createObjectURL(blob);
    } catch {
        try {
            const workerModule =
                await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
            (pdfjs as any).GlobalWorkerOptions.workerSrc = workerModule.default;
        } catch {
            (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
        }
    }
}

// ── Heavy preprocessing ──────────────────────────────────────────────

export async function parsePdfToSheets(
    arrayBuffer: ArrayBuffer,
): Promise<PdfPreprocessed> {
    const pdfjs = await import("pdfjs-dist");
    await configurePdfWorker(pdfjs as any);
    const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer.slice(0) })
        .promise;

    const sheets: ParsedSheet[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
        const pageSheets = await extractSheetsFromPage(pdf, i);
        if (pageSheets.length > 0) sheets.push(...pageSheets);
    }

    return { pageCount: pdf.numPages, sheets };
}

// ── Alias helpers ────────────────────────────────────────────────────

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyIndoorAliases(
    sheets: ParsedSheet[],
    aliases: Record<string, string>,
): ParsedSheet[] {
    const replacements = Object.entries(aliases)
        .filter(([, pdfLabel]) => pdfLabel.trim() !== "")
        .map(([systemName, pdfLabel]) => ({
            pattern: new RegExp(`\\b${escapeRegex(pdfLabel.trim())}\\b`, "gi"),
            replacement: systemName,
        }));
    if (replacements.length === 0) return sheets;
    return sheets.map((sheet) => ({
        ...sheet,
        rows: sheet.rows.map((row) => {
            let lateralText = row.lateralText;
            let fbText = row.fbText;
            for (const { pattern, replacement } of replacements) {
                lateralText = lateralText.replace(pattern, replacement);
                fbText = fbText.replace(pattern, replacement);
            }
            return { ...row, lateralText, fbText };
        }),
    }));
}

// ── Detect hash type from field checkpoints ──────────────────────────

export function detectFieldHashType(
    yCheckpoints: { name: string }[],
): SourceHashType {
    for (const checkpoint of yCheckpoints) {
        if (/\bhs\b/i.test(checkpoint.name)) return "HS";
        if (/\b(ncaa|college)\b/i.test(checkpoint.name)) return "CH";
        if (/\b(nfl|pro)\b/i.test(checkpoint.name)) return "PH";
    }
    return "HS";
}

// ── Convert normalized sheets to ImportManifest ──────────────────────

export function toManifest(
    normalized: NormalizedSheet[],
    filename: string,
): ImportManifest {
    const sheetKeys = getNormalizedSheetKeys(normalized);

    const seenKeys = new Set<string>();
    const marchers: ImportManifest["marchers"] = [];
    for (let i = 0; i < normalized.length; i++) {
        const key = sheetKeys[i];
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const { prefix, order } = keyToDrillPrefixAndOrder(key, i + 1);
        marchers.push({
            key,
            drillPrefix: prefix,
            drillOrder: order,
            label: normalized[i].header.label,
            name: normalized[i].header.performer,
        });
    }

    const plan = buildPagePlan(normalized);
    const validation = validatePlan(plan);
    const subsetFlags = validation.valid
        ? validation.flags
        : plan.map(() => false);
    const sets: ImportManifest["sets"] = plan.map((entry, index) => ({
        setId: entry.name,
        counts: entry.counts,
        order: index,
        isSubset: subsetFlags[index],
    }));

    const positions: ImportManifest["positions"] = [];
    for (let i = 0; i < normalized.length; i++) {
        const key = sheetKeys[i];
        for (const row of normalized[i].rows) {
            positions.push({
                marcherKey: key,
                setId: row.setId,
                xSteps: row.xSteps,
                ySteps: row.ySteps,
                confidence: row.conf,
            });
        }
    }

    const confidences = positions
        .map((p) => p.confidence)
        .filter((c): c is number => c !== undefined);

    return {
        source: { format: "pdf-coordinates", filename },
        marchers,
        sets,
        positions,
        confidence:
            confidences.length > 0
                ? confidences.reduce((a, b) => a + b, 0) / confidences.length
                : undefined,
    };
}

// ── Resolve field properties from config ─────────────────────────────

type ResolvedField = FieldCheckpoints & {
    pixelsPerStep: number;
    centerFrontPoint: { xPixels: number; yPixels: number };
};

const EMPTY_CHECKPOINTS: FieldCheckpoints = {
    xCheckpoints: [],
    yCheckpoints: [],
};

/**
 * Resolves the full field properties (checkpoints + pixel conversion data)
 * from the adapter config. Returns null only when no field is available.
 *
 * The same resolved field MUST be used for both parsing (checkpoints) and
 * commit (pixelsPerStep / centerFrontPoint) to keep positions consistent.
 */
function resolveField(config: AdapterConfig): ResolvedField | null {
    if (config.useCurrentField) {
        return (config.fieldProperties as ResolvedField) ?? null;
    }
    if (config.fieldType === "indoor") {
        const templateKey =
            (config.indoorTemplate as string) ?? "INDOOR_50x80_8to5";
        return (
            (IndoorTemplates as Record<string, ResolvedField>)[templateKey] ??
            null
        );
    }
    return (config.fieldProperties as ResolvedField) ?? null;
}

// ── Build manifest from preprocessed data + config ───────────────────

function buildManifest(
    preprocessed: PdfPreprocessed,
    config: AdapterConfig,
): AdapterParseResult {
    const field = resolveField(config);
    const fieldCheckpoints: FieldCheckpoints = field ?? EMPTY_CHECKPOINTS;
    const hashType = (config.sourceHashType as SourceHashType) ?? "HS";
    const forceIndoor = config.useCurrentField
        ? undefined
        : config.fieldType === "indoor";
    const flipAxes = (config.flipIndoorAxes as boolean) ?? false;

    let sheetsToProcess = preprocessed.sheets;
    if (
        !config.useCurrentField &&
        config.fieldType === "indoor" &&
        config.indoorAliases
    ) {
        sheetsToProcess = applyIndoorAliases(
            sheetsToProcess,
            config.indoorAliases as Record<string, string>,
        );
    }

    const reconciled = reconcileSheets(sheetsToProcess);
    const normalized = normalizeSheets(
        reconciled,
        fieldCheckpoints,
        hashType,
        forceIndoor,
        flipAxes,
    );
    const dryRun = dryRunValidate(normalized, fieldCheckpoints);
    const manifest = toManifest(normalized, "import.pdf");

    const issues: ImportIssue[] = dryRun.issues.map((issue) => ({
        type: issue.type,
        code: issue.code,
        message: issue.message,
        setId: issue.setId,
        field: issue.field,
        confidence: issue.confidence,
    }));

    const fieldForCommit = field
        ? {
              pixelsPerStep: field.pixelsPerStep,
              centerFrontPoint: field.centerFrontPoint,
          }
        : undefined;

    return { manifest, issues, fieldForCommit };
}

// ── Config steps ─────────────────────────────────────────────────────

const configSteps: AdapterConfigStep[] = [
    {
        id: "field-type",
        label: "Field Type",
        component: FieldTypeStep,
    },
    {
        id: "hash-type",
        label: "Hash Type",
        component: HashTypeStep,
        shouldShow: (config) =>
            !config.useCurrentField && config.fieldType !== "indoor",
    },
    {
        id: "indoor-template",
        label: "Indoor Template",
        component: IndoorTemplateStep,
        shouldShow: (config) =>
            !config.useCurrentField && config.fieldType === "indoor",
    },
    {
        id: "indoor-references",
        label: "Indoor References",
        component: IndoorReferencesStep,
        shouldShow: (config) =>
            !config.useCurrentField && config.fieldType === "indoor",
    },
];

// ── Adapter export ───────────────────────────────────────────────────

export const pdfAdapter: ImporterAdapter = {
    id: "pdf-coordinates",
    name: "PDF Drill Coordinates",
    extensions: [".pdf"],
    accepts: (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    configSteps,
    preprocess: async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        return parsePdfToSheets(arrayBuffer);
    },
    parse: (preprocessed, config) =>
        buildManifest(preprocessed as PdfPreprocessed, config),
};
