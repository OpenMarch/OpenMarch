/**
 * Generic import wizard — format-agnostic.
 * Detects the adapter from the file, runs preprocess → config steps → review → commit.
 * All format-specific UI lives in adapter config step components.
 */

import { useRef, useState, useMemo, useCallback } from "react";
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
import { useTimingObjects } from "@/hooks";
import { commitManifest } from "@/importers/commit";
import { mergeIssues } from "@/importers/mergeIssues";
import { detectAdapter, getAcceptedExtensions } from "@/importers/registry";
import type {
    ImporterAdapter,
    AdapterConfig,
    AdapterParseResult,
    ImportIssue,
} from "@/importers/types";

export default function ImportButton() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const queryClient = useQueryClient();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marchersMap } = useQuery(
        marcherWithVisualsQueryOptions(queryClient),
    );
    const existingMarchers = useMemo(
        () =>
            marchersMap
                ? Object.values(marchersMap)
                      .map((mvg: any) => mvg.marcher)
                      .filter(Boolean)
                : [],
        [marchersMap],
    );
    const {
        pages: existingPages = [],
        beats: existingBeats = [],
        fetchTimingObjects,
    } = useTimingObjects() ?? {};

    const createMarchersMutation = useMutation(
        createMarchersMutationOptions(queryClient),
    );
    const createBeatsMutation = useMutation(
        createBeatsMutationOptions(queryClient),
    );
    const createPagesMutation = useMutation(
        createPagesMutationOptions(queryClient),
    );
    const updateMarcherPagesMutation = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );

    // ── Wizard state ──────────────────────────────────────────────────
    const [dialogOpen, setDialogOpen] = useState(false);
    const [adapter, setAdapter] = useState<ImporterAdapter | null>(null);
    const [preprocessed, setPreprocessed] = useState<unknown>(null);
    const [config, setConfig] = useState<AdapterConfig>({});
    const [stepIndex, setStepIndex] = useState(0);
    const [isPreprocessing, setIsPreprocessing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [shouldCreateTimeline, setShouldCreateTimeline] = useState(true);
    const [bpm, setBpm] = useState(120);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    const visibleSteps = useMemo(
        () =>
            adapter?.configSteps.filter(
                (step) => !step.shouldShow || step.shouldShow(config),
            ) ?? [],
        [adapter, config],
    );

    const isReviewStep = stepIndex >= visibleSteps.length;
    const ActiveStepComponent =
        !isReviewStep && !isPreprocessing
            ? visibleSteps[stepIndex]?.component
            : null;

    // ── Parse result (computed when review step is reached) ───────────
    const parseResult: AdapterParseResult | null = useMemo(() => {
        if (!adapter || !preprocessed || !isReviewStep) return null;
        return adapter.parse(preprocessed, { ...config, fieldProperties });
    }, [adapter, preprocessed, config, fieldProperties, isReviewStep]);

    const allIssues = useMemo(
        () => (parseResult ? mergeIssues(parseResult) : []),
        [parseResult],
    );

    const errorCount = allIssues.filter((i) => i.type === "error").length;
    const warningCount = allIssues.filter((i) => i.type === "warning").length;
    const hasCriticalErrors = allIssues.some(
        (i) =>
            i.type === "error" &&
            (i.code === "MISSING_CRITICAL" || i.code === "SET_MISMATCH"),
    );

    // ── Callbacks ─────────────────────────────────────────────────────
    const updateConfig = useCallback(
        (updates: AdapterConfig) =>
            setConfig((prev) => ({ ...prev, ...updates })),
        [],
    );
    const goNext = useCallback(() => setStepIndex((i) => i + 1), []);
    const goBack = useCallback(
        () => setStepIndex((i) => Math.max(0, i - 1)),
        [],
    );

    function handleImportClick() {
        if (!fieldProperties) {
            toast.error("Select field properties before importing.");
            return;
        }
        if (existingMarchers.length > 0) {
            toast.error(
                "Import is only supported on brand-new files with no performers.",
            );
            return;
        }
        fileInputRef.current?.click();
    }

    async function handleFileSelected(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0];
        if (!file) return;

        const detectedAdapter = detectAdapter(file);
        if (!detectedAdapter) {
            toast.error("Unsupported file format.");
            return;
        }

        setIsPreprocessing(true);
        setAdapter(detectedAdapter);
        setPreprocessed(null);
        setConfig({});
        setStepIndex(0);
        setShowDiagnostics(false);
        setDialogOpen(true);

        try {
            setPreprocessed(await detectedAdapter.preprocess(file));
        } catch (err: any) {
            console.error(err);
            toast.error(`Import failed: ${err?.message || "Unknown error"}`);
            setDialogOpen(false);
        } finally {
            setIsPreprocessing(false);
            event.target.value = "";
        }
    }

    async function handleCommit() {
        if (!parseResult?.manifest || !fieldProperties) return;
        setIsCommitting(true);
        try {
            const currentField = fieldProperties as {
                pixelsPerStep: number;
                centerFrontPoint: { xPixels: number; yPixels: number };
            };
            const field = parseResult.fieldForCommit ?? currentField;
            const result = await commitManifest({
                manifest: parseResult.manifest,
                field,
                mutations: {
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
                existingMarchers: existingMarchers.map((m: any) => ({
                    id: m.id,
                    drill_number: m.drill_number,
                    drill_prefix: m.drill_prefix,
                    drill_order: m.drill_order,
                })),
                existingPages: existingPages.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                })),
                existingBeats: existingBeats.map((b: any) => ({
                    id: b.id,
                    position: b.position,
                })),
                createTimeline: shouldCreateTimeline,
                bpm,
            });

            if (result.skippedInvalid > 0)
                toast.warning(
                    `Skipped ${result.skippedInvalid} rows with invalid coordinates.`,
                );
            if (!result.success) {
                toast.warning(result.error || "No updates to apply.");
                return;
            }
            toast.success(
                `Imported ${result.updatedCount} positions${shouldCreateTimeline ? " with beats/pages" : ""}.`,
            );
            setDialogOpen(false);
        } catch (error: any) {
            console.error("[import-commit] Commit failed:", error);
            toast.error(error?.message || "Commit failed");
        } finally {
            setIsCommitting(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="flex items-center gap-8">
            <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptedExtensions()}
                className="hidden"
                onChange={handleFileSelected}
            />
            <button
                onClick={handleImportClick}
                disabled={isPreprocessing}
                type="button"
                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <ArrowSquareInIcon size={24} />
                {isPreprocessing ? "Importing…" : "Import"}
            </button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-[640px] overflow-auto">
                    <DialogTitle>
                        Import {adapter?.name ?? "Coordinates"}
                    </DialogTitle>

                    {isPreprocessing && <LoadingSpinner />}

                    {ActiveStepComponent && preprocessed != null && (
                        <ActiveStepComponent
                            preprocessed={preprocessed}
                            config={config}
                            onConfigChange={updateConfig}
                            onNext={goNext}
                            onBack={goBack}
                        />
                    )}

                    {!isPreprocessing && isReviewStep && parseResult && (
                        <ReviewPanel
                            manifest={parseResult.manifest}
                            issues={allIssues}
                            errorCount={errorCount}
                            warningCount={warningCount}
                            hasCriticalErrors={hasCriticalErrors}
                            shouldCreateTimeline={shouldCreateTimeline}
                            onCreateTimelineChange={setShouldCreateTimeline}
                            bpm={bpm}
                            onBpmChange={setBpm}
                            showDiagnostics={showDiagnostics}
                            onToggleDiagnostics={() =>
                                setShowDiagnostics((v) => !v)
                            }
                            isCommitting={isCommitting}
                            onBack={goBack}
                            onCommit={handleCommit}
                        />
                    )}

                    {!isPreprocessing && isReviewStep && !parseResult && (
                        <p className="text-body text-text-subtitle">
                            No data available.
                        </p>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ── Loading spinner ──────────────────────────────────────────────────

function LoadingSpinner() {
    return (
        <div className="flex flex-col items-center justify-center gap-8 py-32">
            <div className="border-accent size-24 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="text-body text-text-subtitle">
                Processing file…
            </span>
        </div>
    );
}

// ── Review panel (format-agnostic) ───────────────────────────────────

function ReviewPanel({
    manifest,
    issues,
    errorCount,
    warningCount,
    hasCriticalErrors,
    shouldCreateTimeline,
    onCreateTimelineChange,
    bpm,
    onBpmChange,
    showDiagnostics,
    onToggleDiagnostics,
    isCommitting,
    onBack,
    onCommit,
}: {
    manifest: AdapterParseResult["manifest"];
    issues: ImportIssue[];
    errorCount: number;
    warningCount: number;
    hasCriticalErrors: boolean;
    shouldCreateTimeline: boolean;
    onCreateTimelineChange: (v: boolean) => void;
    bpm: number;
    onBpmChange: (v: number) => void;
    showDiagnostics: boolean;
    onToggleDiagnostics: () => void;
    isCommitting: boolean;
    onBack: () => void;
    onCommit: () => void;
}) {
    const pluralize = (n: number, word: string) =>
        `${n} ${word}${n !== 1 ? "s" : ""}`;

    return (
        <div className="flex flex-col gap-16">
            {/* Summary */}
            <div
                className={`rounded-6 text-body border px-16 py-12 ${
                    errorCount > 0
                        ? "border-red/30 text-red"
                        : "border-green/30 text-green"
                }`}
            >
                {manifest.marchers.length} performers · {manifest.sets.length}{" "}
                sets ·{" "}
                {errorCount === 0
                    ? "No errors"
                    : pluralize(errorCount, "error")}
                {warningCount > 0 && ` · ${pluralize(warningCount, "warning")}`}
            </div>

            {/* Issue list */}
            {issues.length > 0 && (
                <div className="border-stroke bg-fg-1 rounded-6 max-h-[180px] overflow-auto border p-12">
                    <ul className="flex flex-col gap-4">
                        {issues.slice(0, 200).map((issue, index) => (
                            <li
                                key={index}
                                className={`text-sub ${issue.type === "error" ? "text-red" : "text-yellow"}`}
                            >
                                <span className="font-medium">
                                    {issue.code}:
                                </span>{" "}
                                {issue.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Timeline options */}
            <div className="border-stroke flex items-center gap-16 border-t pt-12">
                <label className="flex cursor-pointer items-center gap-8">
                    <input
                        type="checkbox"
                        checked={shouldCreateTimeline}
                        onChange={(e) =>
                            onCreateTimelineChange(e.target.checked)
                        }
                        className="accent-accent size-[1rem]"
                    />
                    <span className="text-body">Create beats & pages</span>
                </label>
                {shouldCreateTimeline && (
                    <label className="flex items-center gap-8">
                        <span className="text-body">BPM</span>
                        <input
                            type="number"
                            min={40}
                            max={240}
                            value={bpm}
                            onChange={(e) =>
                                onBpmChange(
                                    parseInt(e.target.value || "120", 10),
                                )
                            }
                            className="border-stroke bg-fg-2 text-body rounded-6 focus:border-accent w-[5rem] border px-8 py-4 focus:outline-none"
                        />
                    </label>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
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
                    onClick={onCommit}
                    disabled={isCommitting || hasCriticalErrors}
                    className={getButtonClassName({
                        variant: "primary",
                        size: "default",
                        content: "text",
                        className: undefined,
                    })}
                >
                    {isCommitting ? "Committing…" : "Commit Import"}
                </button>
            </div>
            {hasCriticalErrors && (
                <p className="text-sub text-red">
                    Resolve critical errors before committing.
                </p>
            )}

            {/* Diagnostics */}
            <div className="border-stroke border-t pt-12">
                <button
                    onClick={onToggleDiagnostics}
                    className="text-sub text-text-subtitle hover:text-text flex items-center gap-6 duration-150 ease-out"
                >
                    <span>{showDiagnostics ? "▾" : "▸"}</span>
                    <span>Diagnostics</span>
                </button>
                {showDiagnostics && (
                    <div className="border-stroke bg-fg-1 rounded-6 text-sub mt-8 max-h-[360px] overflow-auto border p-12 font-mono">
                        <pre className="whitespace-pre-wrap">
                            {JSON.stringify(
                                {
                                    marchers: manifest.marchers,
                                    sets: manifest.sets,
                                    positions: manifest.positions.slice(0, 50),
                                },
                                null,
                                2,
                            )}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
