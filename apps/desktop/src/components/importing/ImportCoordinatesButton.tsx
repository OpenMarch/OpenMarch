import { useRef, useState, useMemo } from "react";
import { getButtonClassName } from "@openmarch/ui";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { toast } from "sonner";
import { useFieldProperties } from "@/hooks/queries";
import { useMarchersWithVisuals } from "@/global/classes/MarcherVisualGroup";
import { dryRunImportPdfCoordinates } from "@/importers/pdfCoordinates";
import Marcher, { type NewMarcherArgs } from "@/global/classes/Marcher";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useUpdateMarcherPages } from "@/hooks/queries";
import { createBeats as createBeatsRenderer } from "@/global/classes/Beat";
import { createPages as createPagesRenderer } from "@/global/classes/Page";

type NormalizedSheet =
    ReturnType<typeof dryRunImportPdfCoordinates> extends Promise<infer R>
        ? R extends { normalized: infer N }
            ? N extends any[]
                ? N[number]
                : never
            : never
        : never;

export default function ImportCoordinatesButton() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const { data: fieldProperties } = useFieldProperties();
    const { marchers } = useMarchersWithVisuals();
    const { pages, beats, fetchTimingObjects } = useTimingObjectsStore();
    const updateMarcherPages = useUpdateMarcherPages();
    const [open, setOpen] = useState(false);
    const [report, setReport] = useState<null | {
        pages: number;
        errors: number;
        warnings: number;
        details: any[];
        normalized: NormalizedSheet[];
        mode: "Text" | "OCR" | "Mixed";
    }>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [createTimeline, setCreateTimeline] = useState(true);
    const [bpm, setBpm] = useState(120);

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
        try {
            setIsLoading(true);
            const arrayBuffer = await file.arrayBuffer();
            const result = await dryRunImportPdfCoordinates(
                arrayBuffer,
                fieldProperties as any,
            );
            const errors = result.dryRun.issues.filter(
                (i) => i.type === "error",
            ).length;
            const warnings = result.dryRun.issues.filter(
                (i) => i.type === "warning",
            ).length;
            const mode = result.parsed.some((s: any) =>
                (s.rows || []).some((r: any) => r.source === "ocr"),
            )
                ? result.parsed.some((s: any) =>
                      (s.rows || []).some((r: any) => r.source === "text"),
                  )
                    ? "Mixed"
                    : "OCR"
                : "Text";
            // Store parsed sheets globally for the CSV raw export shortcut
            (window as any).__lastParsedSheets = result.parsed;
            setReport({
                pages: result.pages,
                errors,
                warnings,
                details: result.dryRun.issues,
                normalized: result.normalized,
                mode,
            } as any);
            setOpen(true);
        } catch (err: any) {
            console.error(err);
            toast.error(`Import failed: ${err?.message || "Unknown error"}`);
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
        // Export raw parsed data for inspection; conversions can be improved iteratively
        const blob = toCsvRaw((window as any).__lastParsedSheets || []);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pdf-import-raw.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const uniquePerformers = useMemo(() => {
        if (!report)
            return [] as {
                key: string;
                label?: string;
                symbol?: string;
                performer?: string;
            }[];
        const map = new Map<
            string,
            { key: string; label?: string; symbol?: string; performer?: string }
        >();
        report.normalized.forEach((s) => {
            const key = (
                s.header.label ||
                s.header.symbol ||
                s.header.performer ||
                "?"
            ).toLowerCase();
            if (!map.has(key))
                map.set(key, {
                    key,
                    label: s.header.label,
                    symbol: s.header.symbol,
                    performer: s.header.performer,
                });
        });
        return Array.from(map.values());
    }, [report]);

    const avgConfidence = useMemo(() => {
        if (!report) return null as null | number;
        let sum = 0;
        let n = 0;
        report.normalized.forEach((s) => {
            (s.rows || []).forEach((r: any) => {
                if (typeof r.conf === "number") {
                    sum += r.conf;
                    n++;
                }
            });
        });
        if (n === 0) return null;
        return sum / n;
    }, [report]);

    const hasCritical = useMemo(() => {
        if (!report) return false;
        return report.details.some(
            (i: any) =>
                i.type === "error" &&
                (i.code === "MISSING_CRITICAL" || i.code === "SET_MISMATCH"),
        );
    }, [report]);

    function getPagePlan(): { name: string; counts: number }[] {
        // Use the first sheet as canonical ordering; counts consistency is already validated in dry-run
        const first = report!.normalized[0];
        return first.rows.map((r) => ({ name: r.setId, counts: r.counts }));
    }

    type ParsedSet = { num: number; subset: string | null };
    function parseSetId(name: string): ParsedSet | null {
        const m = name.match(/^(\d+)([A-Za-z]*)$/);
        if (!m) return null;
        return {
            num: parseInt(m[1], 10),
            subset: m[2] ? m[2].toUpperCase() : null,
        };
    }

    function validateAndFlags(plan: { name: string; counts: number }[]): {
        valid: boolean;
        flags: boolean[];
        message?: string;
    } {
        let lastNum: number | null = null;
        let lastSubset: string | null = null; // retained for clarity though not used downstream
        const flags: boolean[] = [];
        for (let i = 0; i < plan.length; i++) {
            const p = plan[i];
            const parsed = parseSetId(p.name);
            if (!parsed)
                return {
                    valid: false,
                    flags: [],
                    message: `Unrecognized set id: ${p.name}`,
                };
            const { num, subset } = parsed;
            if (i === 0) {
                flags.push(false);
                lastNum = num;
                lastSubset = subset;
                continue;
            }
            if (subset) {
                if (num !== lastNum) {
                    return {
                        valid: false,
                        flags: [],
                        message: `Subset ${p.name} appears without prior base ${num}`,
                    };
                }
                // allow any subset letter progression; generator will increment A,B,C,…; we only mark subset=true
                flags.push(true);
            } else {
                // new base number
                if (lastNum !== null && num < lastNum) {
                    return {
                        valid: false,
                        flags: [],
                        message: `Page order not ascending near ${p.name}`,
                    };
                }
                flags.push(false);
                lastNum = num;
                lastSubset = null;
            }
        }
        return { valid: true, flags };
    }

    async function ensureBeatsAndPages() {
        const plan = getPagePlan();
        const totalCounts = plan.reduce((a, b) => a + b.counts, 0);
        // 1) Beats
        const beatsNeeded = totalCounts - beats.length + 1; // +1 because first beat exists at position 0
        if (beatsNeeded > 0) {
            const beatDuration = 60 / bpm;
            const newBeats = Array.from({ length: beatsNeeded }, () => ({
                duration: beatDuration,
                include_in_measure: 1 as 0 | 1,
            }));
            await createBeatsRenderer(newBeats as any, fetchTimingObjects);
            await fetchTimingObjects();
        }
        // 2) Pages with robust subset flags
        const validation = validateAndFlags(plan);
        if (!validation.valid) {
            toast.error(validation.message || "Invalid page plan");
            return false;
        }
        const flags = validation.flags;
        const pageByName = new Map(pages.map((p) => [p.name, p.id]));
        const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];
        let cum = 0;
        const currentBeats = useTimingObjectsStore.getState().beats;
        for (let i = 0; i < plan.length; i++) {
            const { name, counts } = plan[i];
            if (pageByName.has(name)) {
                cum += counts;
                continue;
            }
            const startIndex = cum; // beat index
            const beatObj = currentBeats[startIndex];
            if (!beatObj) {
                toast.error(
                    `Missing beat at index ${startIndex} for page ${name}`,
                );
                return false;
            }
            newPagesArgs.push({ start_beat: beatObj.id, is_subset: flags[i] });
            cum += counts;
        }
        if (newPagesArgs.length > 0) {
            const res = await createPagesRenderer(
                newPagesArgs as any,
                fetchTimingObjects,
            );
            if (!res.success)
                throw new Error(res.error?.message || "Failed to create pages");
            await fetchTimingObjects();
        }
        return true;
    }

    async function commitImport() {
        if (!report || !fieldProperties) return;
        setIsCommitting(true);
        try {
            if (createTimeline) {
                const ok = await ensureBeatsAndPages();
                if (!ok) return;
            }
            // 1) Map or create marchers
            const existingByLabel = new Map<string, number>();
            for (const m of marchers) {
                if (m.drill_number)
                    existingByLabel.set(m.drill_number.toLowerCase(), m.id);
            }

            const performerKeys = uniquePerformers.map(
                (p) => p.label || p.symbol || p.performer || "?",
            );
            const newArgs: NewMarcherArgs[] = [];
            let generatedIndex = 1;
            for (const key of performerKeys) {
                const label = key || `U${generatedIndex}`;
                const mKey = label.toLowerCase();
                if (existingByLabel.has(mKey)) continue;
                const match = label.match(/^[A-Za-z]+|\d+/g) || [];
                const prefix =
                    match[0] && /[A-Za-z]/.test(match[0]) ? match[0] : "U";
                const orderStr =
                    match.length > 1 ? match[1] : `${generatedIndex}`;
                const order = parseInt(orderStr, 10) || generatedIndex;
                newArgs.push({
                    section: "Band",
                    drill_prefix: prefix.toUpperCase(),
                    drill_order: order,
                    name: undefined,
                });
                generatedIndex++;
            }
            if (newArgs.length > 0) {
                const res = await Marcher.createMarchers(newArgs);
                if (!res.success)
                    throw new Error(
                        res.error?.message || "Failed to create marchers",
                    );
                for (const m of res.data)
                    existingByLabel.set(m.drill_number.toLowerCase(), m.id);
            }

            const allPages = useTimingObjectsStore.getState().pages;
            const pageByName = new Map(allPages.map((p) => [p.name, p.id]));

            // 3) Build updates for marcher_pages
            const updates: {
                marcher_id: number;
                page_id: number;
                x: number;
                y: number;
                notes?: string | null;
            }[] = [];
            const pps = fieldProperties.pixelsPerStep as number;
            const cx = fieldProperties.centerFrontPoint.xPixels as number;
            const cy = fieldProperties.centerFrontPoint.yPixels as number;
            for (const sheet of report.normalized) {
                const labelKey = (
                    sheet.header.label ||
                    sheet.header.symbol ||
                    sheet.header.performer ||
                    "?"
                ).toLowerCase();
                const marcherId = existingByLabel.get(labelKey);
                if (!marcherId) continue;
                for (const row of sheet.rows) {
                    const pageId = pageByName.get(row.setId);
                    if (!pageId) continue;
                    const x = cx + row.xSteps * pps;
                    const y = cy + row.ySteps * pps;
                    updates.push({
                        marcher_id: marcherId,
                        page_id: pageId,
                        x,
                        y,
                        notes: `${row.lateralText} | ${row.fbText}`,
                    });
                }
            }

            if (updates.length === 0) {
                toast.warning(
                    "No updates to apply. Ensure pages exist with names matching set IDs.",
                );
                return;
            }

            await updateMarcherPages.mutateAsync(updates);
            await fetchTimingObjects();
            toast.success(
                `Imported ${updates.length} positions${createTimeline ? " with beats/pages" : ""}.`,
            );
            setOpen(false);
        } catch (e: any) {
            console.error(e);
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
                accept="application/pdf"
                className="hidden"
                onChange={onFileSelected}
            />
            <button
                onClick={handleClick}
                disabled={isLoading}
                className={getButtonClassName({
                    variant: "primary",
                    size: "default",
                    content: "text",
                    className: undefined,
                })}
            >
                {isLoading ? "Importing…" : "Import"}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[800px]">
                    <DialogTitle>PDF Import</DialogTitle>
                    {report ? (
                        <div className="flex flex-col gap-12">
                            <div className="text-muted-foreground text-sm">
                                Pages: {report.pages} · Errors: {report.errors}{" "}
                                · Warnings: {report.warnings} · Mode:{" "}
                                {report.mode}
                                {avgConfidence !== null
                                    ? ` · Avg conf: ${Math.round((avgConfidence as number) * 100)}%`
                                    : ""}
                            </div>
                            <div className="flex items-center gap-16">
                                <label className="flex items-center gap-8">
                                    <input
                                        type="checkbox"
                                        checked={createTimeline}
                                        onChange={(e) =>
                                            setCreateTimeline(e.target.checked)
                                        }
                                    />
                                    <span>Create beats & pages</span>
                                </label>
                                <label className="flex items-center gap-8">
                                    <span>BPM</span>
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
                                        className="rounded-4 border-stroke bg-fg-1 w-80 border px-8 py-4"
                                    />
                                </label>
                            </div>
                            <div>
                                <div className="mb-4 font-medium">
                                    Detected performers
                                </div>
                                <div className="max-h-[180px] overflow-auto rounded-md border p-12 text-sm">
                                    <ul className="grid grid-cols-2 gap-x-24 gap-y-8">
                                        {uniquePerformers.map((p, idx) => (
                                            <li key={idx}>
                                                {p.label ||
                                                    p.symbol ||
                                                    p.performer}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <div className="flex gap-8">
                                <button
                                    onClick={downloadCsv}
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Export CSV
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
                            {hasCritical ? (
                                <div className="text-xs text-red-500">
                                    Resolve critical errors (missing set/counts
                                    or set mismatches) before committing.
                                </div>
                            ) : null}
                            <div className="max-h-[240px] overflow-auto">
                                <ul className="list-disc pl-16 text-sm">
                                    {report.details
                                        .slice(0, 200)
                                        .map((i, idx) => (
                                            <li
                                                key={idx}
                                                className={
                                                    i.type === "error"
                                                        ? "text-red-500"
                                                        : "text-yellow-600"
                                                }
                                            >
                                                [{i.type}] {i.code}: {i.message}
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            <div className="text-muted-foreground text-xs">
                                Prototype note: quadrant is ignored at commit
                                time; we keep it only for debugging and will
                                remove later.
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm">No report available.</div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
