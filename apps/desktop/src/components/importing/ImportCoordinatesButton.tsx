import { useRef, useState, useMemo, useEffect } from "react";
import { getButtonClassName } from "@openmarch/ui";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { ArrowSquareInIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fieldPropertiesQueryOptions,
    marcherWithVisualsQueryOptions,
    createMarchersMutationOptions,
    createBeatsMutationOptions,
    createPagesMutationOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import {
    parsePdfToSheets,
    normalizeParsedSheets,
    detectFieldHashType,
    toManifest,
    type SourceHashType,
} from "@/importers/pdfCoordinates";
import type { ParsedSheet } from "@/importers/pdfCoordinates/types";
import { getNormalizedSheetKeys } from "@/importers/pdfCoordinates/types";
import { useTimingObjects } from "@/hooks";
import { commitManifest } from "@/importers/commit";
import { validateManifest } from "@/importers/validate";
import { detectAdapter, getAcceptedExtensions } from "@/importers/registry";
import type { ImportManifest, ImportValidationReport } from "@/importers/types";
import IndoorTemplates from "@/global/classes/fieldTemplates/Indoor";

type IndoorTemplateKey = keyof typeof IndoorTemplates;

const INDOOR_TEMPLATE_LABELS: Record<IndoorTemplateKey, string> = {
    INDOOR_40x60_8to5: "40×60 — 8 to 5 (24″ steps)",
    INDOOR_50x70_8to5: "50×70 — 8 to 5 (24″ steps)",
    INDOOR_50x80_8to5: "50×80 — 8 to 5 (24″ steps)",
    INDOOR_50x90_8to5: "50×90 — 8 to 5 (24″ steps)",
    INDOOR_40x60_6to5: "40×60 — 6 to 5 (30″ steps)",
    INDOOR_50x70_6to5: "50×70 — 6 to 5 (30″ steps)",
    INDOOR_50x80_6to5: "50×80 — 6 to 5 (30″ steps)",
    INDOOR_50x90_6to5: "50×90 — 6 to 5 (30″ steps)",
};

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace PDF-label aliases with system checkpoint names before parsing. */
function applyIndoorAliases(
    parsed: ParsedSheet[],
    aliases: Record<string, string>,
): ParsedSheet[] {
    const replacements = Object.entries(aliases)
        .filter(([, pdfName]) => pdfName.trim() !== "")
        .map(([systemName, pdfName]) => ({
            pattern: new RegExp(`\\b${escapeRegex(pdfName.trim())}\\b`, "gi"),
            replacement: systemName,
        }));
    if (replacements.length === 0) return parsed;
    return parsed.map((sheet) => ({
        ...sheet,
        rows: sheet.rows.map((row) => {
            let lat = row.lateralText;
            let fb = row.fbText;
            for (const { pattern, replacement } of replacements) {
                lat = lat.replace(pattern, replacement);
                fb = fb.replace(pattern, replacement);
            }
            return { ...row, lateralText: lat, fbText: fb };
        }),
    }));
}

const HASH_TYPE_LABELS: Record<SourceHashType, string> = {
    HS: "High School",
    CH: "College / NCAA",
    PH: "Pro / NFL",
};

export default function ImportCoordinatesButton() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const qc = useQueryClient();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marchersMap } = useQuery(marcherWithVisualsQueryOptions(qc));
    const marchers = useMemo(
        () =>
            marchersMap
                ? Object.values(marchersMap)
                      .map((mvg: any) => mvg.marcher)
                      .filter((m: any) => !!m)
                : [],
        [marchersMap],
    );
    const {
        pages = [],
        beats = [],
        fetchTimingObjects,
    } = useTimingObjects() ?? {};
    const createMarchersMutation = useMutation(
        createMarchersMutationOptions(qc),
    );
    const createBeatsMutation = useMutation(createBeatsMutationOptions(qc));
    const createPagesMutation = useMutation(createPagesMutationOptions(qc));
    const updateMarcherPagesMutation = useMutation(
        updateMarcherPagesMutationOptions(qc),
    );
    const [open, setOpen] = useState(false);
    const [parsedPdf, setParsedPdf] = useState<{
        pages: number;
        parsed: ParsedSheet[];
    } | null>(null);
    const [wizardStep, setWizardStep] = useState<
        | "field-type"
        | "hash-type"
        | "indoor-template"
        | "indoor-references"
        | "review"
    >("field-type");
    const [useCurrentField, setUseCurrentField] = useState(true);
    // When useCurrentField=true: "auto" = detect from field checkpoints, else force outdoor/indoor
    const [useCurrentFieldMode, setUseCurrentFieldMode] = useState<
        "auto" | "outdoor" | "indoor"
    >("auto");
    const [flipIndoorAxes, setFlipIndoorAxes] = useState(false);
    const [fieldType, setFieldType] = useState<"outdoor" | "indoor">("outdoor");
    const [sourceHashType, setSourceHashType] = useState<SourceHashType>("HS");
    const [indoorTemplate, setIndoorTemplate] =
        useState<IndoorTemplateKey>("INDOOR_50x80_8to5");
    // systemName -> pdfLabel (what text the PDF uses for that checkpoint)
    const [indoorAliases, setIndoorAliases] = useState<Record<string, string>>(
        {},
    );
    const [showDebug, setShowDebug] = useState(false);
    const [activeStep, setActiveStep] = useState<
        "parsed" | "normalized" | "dots" | "db"
    >("parsed");
    const [isLoading, setIsLoading] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [createTimeline, setCreateTimeline] = useState(true);
    const [bpm, setBpm] = useState(120);

    // Auto-detect field type and hash type from field properties
    useEffect(() => {
        if (fieldProperties) {
            const indoor =
                fieldProperties.xCheckpoints?.length > 0 &&
                !(fieldProperties.xCheckpoints as any[]).some((c: any) =>
                    /\byard\s*line\b/i.test(c.name),
                );
            setFieldType(indoor ? "indoor" : "outdoor");
            if (!indoor && fieldProperties.yCheckpoints) {
                setSourceHashType(
                    detectFieldHashType(fieldProperties.yCheckpoints as any),
                );
            }
        }
    }, [fieldProperties]);

    // Only normalize once the user reaches the review step
    const report = useMemo(() => {
        if (!parsedPdf || !fieldProperties || wizardStep !== "review")
            return null;
        const effectiveFieldProps = useCurrentField
            ? (fieldProperties as any)
            : fieldType === "indoor"
              ? (IndoorTemplates[indoorTemplate] as any)
              : (fieldProperties as any);
        const forceIndoor = useCurrentField
            ? useCurrentFieldMode === "auto"
                ? undefined
                : useCurrentFieldMode === "indoor"
            : fieldType === "indoor";
        const parsedToUse =
            !useCurrentField && fieldType === "indoor"
                ? applyIndoorAliases(parsedPdf.parsed, indoorAliases)
                : parsedPdf.parsed;
        const result = normalizeParsedSheets(
            parsedToUse,
            effectiveFieldProps,
            sourceHashType,
            forceIndoor,
            flipIndoorAxes,
        );

        // Build ImportManifest from normalized data
        const manifest = toManifest(result.normalized, "import.pdf");
        const validation = validateManifest(manifest, effectiveFieldProps);

        // Merge PDF-specific dryRun issues with shared validation issues
        const allIssues = [
            ...result.dryRun.issues,
            ...validation.issues.filter(
                (vi) =>
                    !result.dryRun.issues.some(
                        (di) => di.code === vi.code && di.setId === vi.setId,
                    ),
            ),
        ];

        return {
            pages: parsedPdf.pages,
            errors: allIssues.filter((i) => i.type === "error").length,
            warnings: allIssues.filter((i) => i.type === "warning").length,
            details: allIssues,
            normalized: result.normalized,
            parsed: result.parsed,
            manifest,
        };
    }, [
        parsedPdf,
        fieldProperties,
        sourceHashType,
        fieldType,
        indoorTemplate,
        indoorAliases,
        useCurrentField,
        useCurrentFieldMode,
        flipIndoorAxes,
        wizardStep,
    ]);

    const hasExistingPerformers = useMemo(
        () => marchers && marchers.length > 0,
        [marchers],
    );

    function handleClick() {
        if (!fieldProperties) {
            toast.error("Select field properties before importing.");
            return;
        }
        if (hasExistingPerformers) {
            toast.error(
                "Import is only supported on brand-new files with no performers.",
            );
            return;
        }
        fileInputRef.current?.click();
    }

    async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        // Open dialog immediately so the user sees progress
        setIsLoading(true);
        setParsedPdf(null);
        setWizardStep("field-type");
        setShowDebug(false);
        setUseCurrentFieldMode("auto");
        setOpen(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await parsePdfToSheets(arrayBuffer);
            setParsedPdf(result);
        } catch (err: any) {
            console.error(err);
            toast.error(`Import failed: ${err?.message || "Unknown error"}`);
            setOpen(false);
        } finally {
            setIsLoading(false);
            e.target.value = "";
        }
    }

    function toCsvRaw(parsed: any[]) {
        const header = [
            "pageIndex",
            "label",
            "symbol",
            "performer",
            "setId",
            "measureRange",
            "counts",
            "lateralText",
            "fbText",
            "source",
            "conf",
            "issueCodes",
        ];
        const rows: string[] = [header.join(",")];
        parsed.forEach((s: any) => {
            (s.rows || []).forEach((r: any) => {
                const rowIssues = ((report?.details as any[]) || [])
                    .filter(
                        (i: any) =>
                            i.pageIndex === s.pageIndex && i.setId === r.setId,
                    )
                    .map((i: any) => i.code);
                rows.push(
                    [
                        s.pageIndex,
                        s.header?.label || "",
                        s.header?.symbol || "",
                        s.header?.performer || "",
                        r.setId || "",
                        r.measureRange || "",
                        r.counts ?? "",
                        JSON.stringify(r.lateralText || ""),
                        JSON.stringify(r.fbText || ""),
                        r.source || "",
                        r.conf ?? "",
                        JSON.stringify(
                            Array.from(new Set(rowIssues)).join("|"),
                        ),
                    ].join(","),
                );
            });
        });
        return new Blob([rows.join("\n")], { type: "text/csv" });
    }

    function downloadCsv() {
        if (!report) return;
        const blob = toCsvRaw(report.parsed || []);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pdf-import-raw.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const manifestMarchers = useMemo(() => {
        return report?.manifest?.marchers ?? [];
    }, [report]);

    const manifestSets = useMemo(() => {
        return report?.manifest?.sets ?? [];
    }, [report]);

    function downloadJson() {
        if (!report) return;
        const data = {
            meta: {
                pages: report.pages,
                generatedAt: new Date().toISOString(),
            },
            manifest: report.manifest,
            parsing_report: {
                errors: report.errors,
                warnings: report.warnings,
                details: report.details,
                normalized: report.normalized,
                parsed: report.parsed,
            },
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pdf-import-debug.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const hasCritical = useMemo(() => {
        if (!report) return false;
        return report.details.some(
            (i: any) =>
                i.type === "error" &&
                (i.code === "MISSING_CRITICAL" || i.code === "SET_MISMATCH"),
        );
    }, [report]);

    async function commitImport() {
        if (!report?.manifest || !fieldProperties) return;
        setIsCommitting(true);
        try {
            const effectiveProps = useCurrentField
                ? (fieldProperties as any)
                : fieldType === "indoor"
                  ? (IndoorTemplates[indoorTemplate] as any)
                  : (fieldProperties as any);

            const result = await commitManifest(
                report.manifest,
                {
                    pixelsPerStep: effectiveProps.pixelsPerStep,
                    centerFrontPoint: effectiveProps.centerFrontPoint,
                },
                {
                    createMarchers: (args) =>
                        createMarchersMutation.mutateAsync(args),
                    createBeats: (args) =>
                        createBeatsMutation.mutateAsync(args),
                    createPages: (args) =>
                        createPagesMutation.mutateAsync(args),
                    updateMarcherPages: (args) =>
                        updateMarcherPagesMutation.mutateAsync(args),
                    fetchTimingObjects,
                },
                marchers.map((m: any) => ({
                    id: m.id,
                    drill_number: m.drill_number,
                    drill_prefix: m.drill_prefix,
                    drill_order: m.drill_order,
                })),
                pages.map((p: any) => ({ id: p.id, name: p.name })),
                beats.map((b: any) => ({ id: b.id, position: b.position })),
                { createTimeline, bpm },
            );

            if (result.skippedInvalid > 0) {
                toast.warning(
                    `Skipped ${result.skippedInvalid} rows with invalid coordinates.`,
                );
            }

            if (!result.success) {
                toast.warning(result.error || "No updates to apply.");
                return;
            }

            toast.success(
                `Imported ${result.updatedCount} positions${createTimeline ? " with beats/pages" : ""}.`,
            );
            setOpen(false);
        } catch (e: any) {
            console.error("[import-commit] Commit failed:", e);
            toast.error(e?.message || "Commit failed");
        } finally {
            setIsCommitting(false);
        }
    }

    return (
        <div className="flex items-center gap-8">
            <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptedExtensions()}
                className="hidden"
                onChange={onFileSelected}
            />
            <button
                onClick={handleClick}
                disabled={isLoading}
                type="button"
                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <ArrowSquareInIcon size={24} />
                {isLoading ? "Importing…" : "Import"}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] max-w-[640px] overflow-auto">
                    <DialogTitle>Import Coordinates</DialogTitle>

                    {/* Loading indicator while PDF is being parsed */}
                    {isLoading && !parsedPdf && (
                        <div className="flex flex-col items-center justify-center gap-8 py-32">
                            <div className="border-accent size-24 animate-spin rounded-full border-2 border-t-transparent" />
                            <span className="text-body text-text-subtitle">
                                Parsing PDF…
                            </span>
                        </div>
                    )}

                    {/* ── Step 1: Field Type ─────────────────────────────── */}
                    {wizardStep === "field-type" && !isLoading && (
                        <div className="flex flex-col gap-16">
                            {/* Quick path: use current file's field */}
                            <button
                                onClick={() => {
                                    setUseCurrentField(true);
                                    setWizardStep("review");
                                }}
                                className={`rounded-6 border-accent bg-fg-2 flex flex-col gap-4 border p-16 text-left duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4`}
                            >
                                <span className="text-body font-medium">
                                    My file is already set up with the same
                                    field as the PDF
                                </span>
                                <span className="text-sub text-text-subtitle">
                                    Use the current file's field settings — skip
                                    straight to review
                                </span>
                            </button>

                            {/* Divider */}
                            <div className="flex items-center gap-8">
                                <div className="border-stroke h-px flex-1 border-t" />
                                <span className="text-sub text-text-subtitle">
                                    or choose manually
                                </span>
                                <div className="border-stroke h-px flex-1 border-t" />
                            </div>

                            <div className="flex gap-12">
                                {(
                                    [
                                        {
                                            value: "outdoor",
                                            label: "Outdoor / Football",
                                            desc: "Yard lines and hashes (e.g. 4 steps Inside 40 yd ln)",
                                        },
                                        {
                                            value: "indoor",
                                            label: "Indoor",
                                            desc: "Numbered or lettered lines (e.g. On 5 line, On A line)",
                                        },
                                    ] as const
                                ).map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setFieldType(opt.value)}
                                        className={`rounded-6 flex flex-1 flex-col gap-6 border p-16 text-left duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4 ${
                                            fieldType === opt.value
                                                ? "border-accent bg-fg-2"
                                                : "border-stroke bg-fg-1"
                                        }`}
                                    >
                                        <span className="text-body font-medium">
                                            {opt.label}
                                        </span>
                                        <span className="text-sub text-text-subtitle">
                                            {opt.desc}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        setUseCurrentField(false);
                                        setWizardStep(
                                            fieldType === "outdoor"
                                                ? "hash-type"
                                                : "indoor-template",
                                        );
                                    }}
                                    className={getButtonClassName({
                                        variant: "primary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Hash Type (outdoor only) ───────────────── */}
                    {wizardStep === "hash-type" && (
                        <div className="flex flex-col gap-16">
                            <p className="text-body text-text-subtitle">
                                What hash type does this PDF use?
                            </p>
                            <div className="flex flex-col gap-6">
                                {(
                                    Object.entries(HASH_TYPE_LABELS) as [
                                        SourceHashType,
                                        string,
                                    ][]
                                ).map(([value, label]) => (
                                    <label
                                        key={value}
                                        className={`rounded-6 flex cursor-pointer items-center gap-12 border px-16 py-12 duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4 ${
                                            sourceHashType === value
                                                ? "border-accent bg-fg-2"
                                                : "border-stroke bg-fg-1"
                                        }`}
                                    >
                                        <div
                                            className={`flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border ${
                                                sourceHashType === value
                                                    ? "border-accent bg-accent"
                                                    : "border-stroke bg-fg-2"
                                            }`}
                                        >
                                            {sourceHashType === value && (
                                                <div className="bg-text-invert size-[0.4375rem] rounded-full" />
                                            )}
                                        </div>
                                        <span className="text-body leading-none">
                                            {label}
                                        </span>
                                        <input
                                            type="radio"
                                            name="hashType"
                                            value={value}
                                            checked={sourceHashType === value}
                                            onChange={() =>
                                                setSourceHashType(value)
                                            }
                                            className="sr-only"
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-between">
                                <button
                                    onClick={() => setWizardStep("field-type")}
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() => setWizardStep("review")}
                                    className={getButtonClassName({
                                        variant: "primary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2b: Indoor Template ────────────────────────── */}
                    {wizardStep === "indoor-template" && (
                        <div className="flex flex-col gap-16">
                            <p className="text-body text-text-subtitle">
                                Which indoor field template does this PDF use?
                            </p>
                            <div className="flex flex-col gap-6">
                                {(
                                    Object.entries(INDOOR_TEMPLATE_LABELS) as [
                                        IndoorTemplateKey,
                                        string,
                                    ][]
                                ).map(([key, label]) => (
                                    <label
                                        key={key}
                                        className={`rounded-6 flex cursor-pointer items-center gap-12 border px-16 py-12 duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4 ${
                                            indoorTemplate === key
                                                ? "border-accent bg-fg-2"
                                                : "border-stroke bg-fg-1"
                                        }`}
                                    >
                                        <div
                                            className={`flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border ${
                                                indoorTemplate === key
                                                    ? "border-accent bg-accent"
                                                    : "border-stroke bg-fg-2"
                                            }`}
                                        >
                                            {indoorTemplate === key && (
                                                <div className="bg-text-invert size-[0.4375rem] rounded-full" />
                                            )}
                                        </div>
                                        <span className="text-body leading-none">
                                            {label}
                                        </span>
                                        <input
                                            type="radio"
                                            name="indoorTemplate"
                                            value={key}
                                            checked={indoorTemplate === key}
                                            onChange={() =>
                                                setIndoorTemplate(key)
                                            }
                                            className="sr-only"
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-between">
                                <button
                                    onClick={() => setWizardStep("field-type")}
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() =>
                                        setWizardStep("indoor-references")
                                    }
                                    className={getButtonClassName({
                                        variant: "primary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2c: Indoor Reference Labels ────────────────── */}
                    {wizardStep === "indoor-references" && (
                        <div className="flex flex-col gap-16">
                            <label className="flex cursor-pointer items-center gap-8">
                                <input
                                    type="checkbox"
                                    checked={flipIndoorAxes}
                                    onChange={(e) =>
                                        setFlipIndoorAxes(e.target.checked)
                                    }
                                    className="accent-accent size-[1rem]"
                                />
                                <span className="text-body">
                                    Letters (A–E) are lateral, numbers (1–5) are
                                    front-back
                                </span>
                            </label>
                            <p className="text-body text-text-subtitle">
                                For each field reference, enter the label your
                                PDF uses. Leave blank if unused or if it already
                                matches the name shown.
                            </p>
                            <div className="flex max-h-[420px] flex-col gap-16 overflow-y-auto pr-4">
                                {[
                                    {
                                        title: "Lateral (left-right)",
                                        checkpoints: Array.from(
                                            new Map(
                                                (
                                                    IndoorTemplates[
                                                        indoorTemplate
                                                    ].xCheckpoints as any[]
                                                )
                                                    .filter(
                                                        (c: any) =>
                                                            c.useAsReference,
                                                    )
                                                    .slice()
                                                    .sort(
                                                        (a: any, b: any) =>
                                                            a.stepsFromCenterFront -
                                                            b.stepsFromCenterFront,
                                                    )
                                                    .map((c: any) => [
                                                        c.name,
                                                        c,
                                                    ]),
                                            ).values(),
                                        ),
                                    },
                                    {
                                        title: "Front-back (depth)",
                                        checkpoints: (
                                            IndoorTemplates[indoorTemplate]
                                                .yCheckpoints as any[]
                                        )
                                            .filter(
                                                (c: any) => c.useAsReference,
                                            )
                                            .slice()
                                            .sort(
                                                (a: any, b: any) =>
                                                    b.stepsFromCenterFront -
                                                    a.stepsFromCenterFront,
                                            ),
                                    },
                                ].map(({ title, checkpoints }) => (
                                    <div
                                        key={title}
                                        className="flex flex-col gap-8"
                                    >
                                        <p className="text-sub text-text-subtitle font-medium tracking-wide uppercase">
                                            {title}
                                        </p>
                                        <div className="flex flex-col gap-6">
                                            {checkpoints.map((cp: any) => (
                                                <div
                                                    key={`${title}-${cp.name}`}
                                                    className="flex items-center gap-12"
                                                >
                                                    <span className="text-body w-[120px] shrink-0">
                                                        {cp.name}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        placeholder="blank = use default"
                                                        value={
                                                            indoorAliases[
                                                                cp.name
                                                            ] ?? ""
                                                        }
                                                        onChange={(e) =>
                                                            setIndoorAliases(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [cp.name]:
                                                                        e.target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        className="border-stroke bg-fg-2 text-body placeholder:text-text-subtitle rounded-6 focus:border-accent flex-1 border px-12 py-6 focus:outline-none"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between">
                                <button
                                    onClick={() =>
                                        setWizardStep("indoor-template")
                                    }
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() => setWizardStep("review")}
                                    className={getButtonClassName({
                                        variant: "primary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Review & Commit ─────────────────────────── */}
                    {wizardStep === "review" && report && (
                        <div className="flex flex-col gap-16">
                            {/* Summary */}
                            <div
                                className={`rounded-6 text-body border px-16 py-12 ${
                                    report.errors > 0
                                        ? "border-red/30 text-red"
                                        : "border-green/30 text-green"
                                }`}
                            >
                                {report.normalized.length} performers ·{" "}
                                {report.normalized[0]?.rows.length ?? 0} sets ·{" "}
                                {report.errors === 0 ? (
                                    <span>
                                        No errors
                                        {report.warnings > 0
                                            ? ` · ${report.warnings} warning${report.warnings > 1 ? "s" : ""}`
                                            : ""}
                                    </span>
                                ) : (
                                    <span>
                                        {report.errors} error
                                        {report.errors > 1 ? "s" : ""}
                                        {report.warnings > 0
                                            ? ` · ${report.warnings} warning${report.warnings > 1 ? "s" : ""}`
                                            : ""}
                                    </span>
                                )}
                            </div>

                            {/* Error / warning list */}
                            {report.details.length > 0 && (
                                <div className="border-stroke bg-fg-1 rounded-6 max-h-[180px] overflow-auto border p-12">
                                    <ul className="flex flex-col gap-4">
                                        {report.details
                                            .slice(0, 200)
                                            .map((i, idx) => (
                                                <li
                                                    key={idx}
                                                    className={`text-sub ${
                                                        i.type === "error"
                                                            ? "text-red"
                                                            : "text-yellow"
                                                    }`}
                                                >
                                                    <span className="font-medium">
                                                        {i.code}:
                                                    </span>{" "}
                                                    {i.message}
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}

                            {/* Parsing options */}
                            {useCurrentField
                                ? (() => {
                                      const detectedIndoor =
                                          (fieldProperties?.xCheckpoints
                                              ?.length ?? 0) > 0 &&
                                          !(
                                              (fieldProperties?.xCheckpoints as any[]) ??
                                              []
                                          ).some((c: any) =>
                                              /\byard\s*line\b/i.test(c.name),
                                          );
                                      const effectiveIndoor =
                                          useCurrentFieldMode === "auto"
                                              ? detectedIndoor
                                              : useCurrentFieldMode ===
                                                "indoor";
                                      return (
                                          <div className="border-stroke flex flex-col gap-10 border-t pt-12">
                                              <div className="flex items-center gap-10">
                                                  <span className="text-sub text-text-subtitle">
                                                      Coordinate format
                                                  </span>
                                                  {(
                                                      [
                                                          "outdoor",
                                                          "indoor",
                                                      ] as const
                                                  ).map((mode) => {
                                                      const isEffective =
                                                          effectiveIndoor ===
                                                          (mode === "indoor");
                                                      const isAutoSelected =
                                                          useCurrentFieldMode ===
                                                              "auto" &&
                                                          isEffective;
                                                      return (
                                                          <button
                                                              key={mode}
                                                              onClick={() =>
                                                                  setUseCurrentFieldMode(
                                                                      useCurrentFieldMode ===
                                                                          mode
                                                                          ? "auto"
                                                                          : mode,
                                                                  )
                                                              }
                                                              className={`rounded-4 text-sub border px-8 py-2 ${
                                                                  isEffective
                                                                      ? "border-accent text-accent"
                                                                      : "border-stroke text-text-subtitle"
                                                              }`}
                                                          >
                                                              {mode ===
                                                              "outdoor"
                                                                  ? "Outdoor"
                                                                  : "Indoor"}
                                                              {isAutoSelected && (
                                                                  <span className="ml-4 opacity-60">
                                                                      (auto)
                                                                  </span>
                                                              )}
                                                          </button>
                                                      );
                                                  })}
                                              </div>
                                              {!effectiveIndoor ? (
                                                  <div className="flex items-center gap-10">
                                                      <span className="text-sub text-text-subtitle">
                                                          Hash type
                                                      </span>
                                                      {(
                                                          Object.keys(
                                                              HASH_TYPE_LABELS,
                                                          ) as SourceHashType[]
                                                      ).map((ht) => (
                                                          <button
                                                              key={ht}
                                                              onClick={() =>
                                                                  setSourceHashType(
                                                                      ht,
                                                                  )
                                                              }
                                                              className={`rounded-4 text-sub border px-8 py-2 ${
                                                                  sourceHashType ===
                                                                  ht
                                                                      ? "border-accent text-accent"
                                                                      : "border-stroke text-text-subtitle"
                                                              }`}
                                                          >
                                                              {
                                                                  HASH_TYPE_LABELS[
                                                                      ht
                                                                  ]
                                                              }
                                                          </button>
                                                      ))}
                                                  </div>
                                              ) : (
                                                  <label className="flex cursor-pointer items-center gap-8">
                                                      <input
                                                          type="checkbox"
                                                          checked={
                                                              flipIndoorAxes
                                                          }
                                                          onChange={(e) =>
                                                              setFlipIndoorAxes(
                                                                  e.target
                                                                      .checked,
                                                              )
                                                          }
                                                          className="accent-accent size-[1rem]"
                                                      />
                                                      <span className="text-body">
                                                          Letters (A–E) are
                                                          lateral, numbers (1–5)
                                                          are front-back
                                                      </span>
                                                  </label>
                                              )}
                                          </div>
                                      );
                                  })()
                                : fieldType === "indoor" && (
                                      <div className="border-stroke border-t pt-12">
                                          <label className="flex cursor-pointer items-center gap-8">
                                              <input
                                                  type="checkbox"
                                                  checked={flipIndoorAxes}
                                                  onChange={(e) =>
                                                      setFlipIndoorAxes(
                                                          e.target.checked,
                                                      )
                                                  }
                                                  className="accent-accent size-[1rem]"
                                              />
                                              <span className="text-body">
                                                  Letters (A–E) are lateral,
                                                  numbers (1–5) are front-back
                                              </span>
                                          </label>
                                      </div>
                                  )}

                            {/* Timeline options */}
                            <div className="border-stroke flex items-center gap-16 border-t pt-12">
                                <label className="flex cursor-pointer items-center gap-8">
                                    <input
                                        type="checkbox"
                                        checked={createTimeline}
                                        onChange={(e) =>
                                            setCreateTimeline(e.target.checked)
                                        }
                                        className="accent-accent size-[1rem]"
                                    />
                                    <span className="text-body">
                                        Create beats & pages
                                    </span>
                                </label>
                                {createTimeline && (
                                    <label className="flex items-center gap-8">
                                        <span className="text-body">BPM</span>
                                        <input
                                            type="number"
                                            min={40}
                                            max={240}
                                            value={bpm}
                                            onChange={(e) =>
                                                setBpm(
                                                    parseInt(
                                                        e.target.value || "120",
                                                        10,
                                                    ),
                                                )
                                            }
                                            className="border-stroke bg-fg-2 text-body rounded-6 focus:border-accent w-[5rem] border px-8 py-4 focus:outline-none"
                                        />
                                    </label>
                                )}
                            </div>

                            {/* Action row */}
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() =>
                                        setWizardStep(
                                            useCurrentField
                                                ? "field-type"
                                                : fieldType === "outdoor"
                                                  ? "hash-type"
                                                  : "indoor-references",
                                        )
                                    }
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={commitImport}
                                    disabled={isCommitting || hasCritical}
                                    className={getButtonClassName({
                                        variant: "primary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    {isCommitting
                                        ? "Committing…"
                                        : "Commit Import"}
                                </button>
                            </div>
                            {hasCritical && (
                                <p className="text-sub text-red">
                                    Resolve critical errors before committing.
                                </p>
                            )}

                            {/* Diagnostics — collapsed by default */}
                            <div className="border-stroke border-t pt-12">
                                <button
                                    onClick={() => setShowDebug((v) => !v)}
                                    className="text-sub text-text-subtitle hover:text-text flex items-center gap-6 duration-150 ease-out"
                                >
                                    <span>{showDebug ? "▾" : "▸"}</span>
                                    <span>Diagnostics</span>
                                </button>
                                {showDebug && (
                                    <div className="mt-8 flex flex-col gap-8">
                                        <div className="border-stroke flex items-end gap-2 border-b pb-4">
                                            {[
                                                {
                                                    key: "parsed",
                                                    label: "1. Parsed",
                                                },
                                                {
                                                    key: "normalized",
                                                    label: "2. Normalized",
                                                },
                                                {
                                                    key: "dots",
                                                    label: "3. Pixels",
                                                },
                                                {
                                                    key: "db",
                                                    label: "4. DB Preview",
                                                },
                                            ].map((step) => (
                                                <button
                                                    key={step.key}
                                                    onClick={() =>
                                                        setActiveStep(
                                                            step.key as any,
                                                        )
                                                    }
                                                    className={`text-sub px-8 py-4 duration-150 ease-out ${
                                                        activeStep === step.key
                                                            ? "text-accent border-accent -mb-[5px] border-b-2"
                                                            : "text-text-subtitle hover:text-text"
                                                    }`}
                                                >
                                                    {step.label}
                                                </button>
                                            ))}
                                            <div className="ml-auto flex gap-6">
                                                <button
                                                    onClick={downloadCsv}
                                                    className={getButtonClassName(
                                                        {
                                                            variant:
                                                                "secondary",
                                                            size: "compact",
                                                            content: "text",
                                                            className:
                                                                undefined,
                                                        },
                                                    )}
                                                >
                                                    CSV
                                                </button>
                                                <button
                                                    onClick={downloadJson}
                                                    className={getButtonClassName(
                                                        {
                                                            variant:
                                                                "secondary",
                                                            size: "compact",
                                                            content: "text",
                                                            className:
                                                                undefined,
                                                        },
                                                    )}
                                                >
                                                    JSON
                                                </button>
                                            </div>
                                        </div>
                                        <div className="border-stroke bg-fg-1 rounded-6 text-sub max-h-[360px] overflow-auto border p-12 font-mono">
                                            {activeStep === "parsed" && (
                                                <pre className="whitespace-pre-wrap">
                                                    {JSON.stringify(
                                                        report.parsed,
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            )}
                                            {activeStep === "normalized" && (
                                                <pre className="whitespace-pre-wrap">
                                                    {JSON.stringify(
                                                        report.normalized.map(
                                                            (sheet) => ({
                                                                pageIndex:
                                                                    sheet.pageIndex,
                                                                quadrant:
                                                                    sheet.quadrant,
                                                                header: sheet.header,
                                                                rows: sheet.rows.map(
                                                                    (
                                                                        row: any,
                                                                    ) => ({
                                                                        setId: row.setId,
                                                                        counts: row.counts,
                                                                        xSteps: row.xSteps,
                                                                        ySteps: row.ySteps,
                                                                    }),
                                                                ),
                                                            }),
                                                        ),
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            )}
                                            {activeStep === "dots" && (
                                                <pre className="whitespace-pre-wrap">
                                                    {JSON.stringify(
                                                        report.manifest?.positions?.slice(
                                                            0,
                                                            50,
                                                        ),
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            )}
                                            {activeStep === "db" && (
                                                <div>
                                                    <p className="text-sub mb-8 font-semibold">
                                                        Manifest Marchers:
                                                    </p>
                                                    <pre className="mb-12 whitespace-pre-wrap">
                                                        {JSON.stringify(
                                                            manifestMarchers,
                                                            null,
                                                            2,
                                                        )}
                                                    </pre>
                                                    <p className="text-sub mb-8 font-semibold">
                                                        Manifest Sets:
                                                    </p>
                                                    <pre className="mb-12 whitespace-pre-wrap">
                                                        {JSON.stringify(
                                                            manifestSets,
                                                            null,
                                                            2,
                                                        )}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* No data fallback */}
                    {wizardStep === "review" && !report && (
                        <p className="text-body text-text-subtitle">
                            No data available.
                        </p>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
