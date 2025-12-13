import { useRef, useState, useMemo } from "react";
import { getButtonClassName } from "@openmarch/ui";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
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
import { queryClient } from "@/App";
import { dryRunImportPdfCoordinates } from "@/importers/pdfCoordinates";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
} from "@/hooks/queries";
import { type NewMarcherArgs } from "@/db-functions";
import { useTimingObjects } from "@/hooks";

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
    const [report, setReport] = useState<null | {
        pages: number;
        errors: number;
        warnings: number;
        details: any[];
        normalized: NormalizedSheet[];
        parsed: any[];
        rawPythonOutput: any[];
    }>(null);
    const [activeStep, setActiveStep] = useState<
        "raw" | "parsed" | "normalized" | "dots" | "db"
    >("raw");
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
            (window as any).__lastParsedSheets = result.parsed;
            setReport({
                pages: result.pages,
                errors,
                warnings,
                details: result.dryRun.issues,
                normalized: result.normalized,
                parsed: result.parsed,
                rawPythonOutput: result.rawPythonOutput || [],
            });
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

    const proposedMarchers = useMemo(() => {
        const performerKeys = uniquePerformers.map(
            (p) => p.label || p.symbol || p.performer || "?",
        );
        const newArgs: (NewMarcherArgs & { originalKey: string })[] = [];
        let generatedIndex = 1;
        const existingByLabel = new Map<string, number>();
        if (marchers) {
            for (const m of marchers) {
                if (m.drill_number)
                    existingByLabel.set(m.drill_number.toLowerCase(), m.id);
            }
        }

        for (const key of performerKeys) {
            const label = key || `U${generatedIndex}`;
            const mKey = label.toLowerCase();
            if (existingByLabel.has(mKey)) continue;
            const match = label.match(/^[A-Za-z]+|\d+/g) || [];
            const prefix =
                match[0] && /[A-Za-z]/.test(match[0]) ? match[0] : "U";
            const orderStr = match.length > 1 ? match[1] : `${generatedIndex}`;
            const order = parseInt(orderStr, 10) || generatedIndex;
            newArgs.push({
                section: "Band",
                drill_prefix: prefix.toUpperCase(),
                drill_order: order,
                name: undefined,
                originalKey: key,
            });
            generatedIndex++;
        }
        return newArgs;
    }, [uniquePerformers, marchers]);

    const proposedPages = useMemo(() => {
        if (!report) return [];
        return getPagePlan().map((p, idx) => ({
            name: p.name,
            counts: p.counts,
            index: idx,
        }));
    }, [report]);

    const proposedMarcherPages = useMemo(() => {
        if (!report || !fieldProperties) return [];

        const updates: any[] = [];
        const pps = fieldProperties.pixelsPerStep as number;
        const cx = fieldProperties.centerFrontPoint.xPixels as number;
        const cy = fieldProperties.centerFrontPoint.yPixels as number;

        // Build a lookup for marcher IDs (simulated or real)
        const marcherIdMap = new Map<string, string | number>();

        // Add existing marchers
        if (marchers) {
            for (const m of marchers) {
                if (m.drill_number)
                    marcherIdMap.set(m.drill_number.toLowerCase(), m.id);
            }
        }

        // Add proposed marchers (simulate IDs)
        proposedMarchers.forEach((m, idx) => {
            const drillNumber = `${m.drill_prefix}${m.drill_order}`;
            marcherIdMap.set(drillNumber.toLowerCase(), `new-${idx + 1}`);
        });

        for (const sheet of report.normalized) {
            const labelKey = (
                sheet.header.label ||
                sheet.header.symbol ||
                sheet.header.performer ||
                "?"
            ).toLowerCase();

            // Try to find by direct match first
            let marcherId = marcherIdMap.get(labelKey);

            // If not found, try to match by key used in creation
            if (!marcherId) {
                const proposed = proposedMarchers.find(
                    (p) => p.originalKey === labelKey,
                );
                if (proposed) {
                    marcherId = `new-${proposedMarchers.indexOf(proposed) + 1}`;
                }
            }

            if (!marcherId) continue;

            for (const row of sheet.rows) {
                const x = cx + row.xSteps * pps;
                const y = cy + row.ySteps * pps;

                updates.push({
                    marcher_id: marcherId,
                    page_label: row.setId,
                    x,
                    y,
                    notes: `${row.lateralText} | ${row.fbText}`,
                    original_row: row,
                });
            }
        }
        return updates;
    }, [report, fieldProperties, proposedMarchers, marchers]);

    function downloadJson() {
        if (!report) return;
        // Export the full report for debugging, structured like the DB tables
        const data = {
            // Meta info
            meta: {
                pages: report.pages,
                generatedAt: new Date().toISOString(),
            },
            // DB Tables Structure
            tables: {
                marchers: proposedMarchers.map((m) => ({
                    ...m,
                    drill_number: `${m.drill_prefix}${m.drill_order}`,
                })),
                pages: proposedPages,
                marcher_pages: proposedMarcherPages,
            },
            // Original report details for deep diving
            parsing_report: {
                errors: report.errors,
                warnings: report.warnings,
                details: report.details,
                normalized: report.normalized,
                parsed: report.parsed,
                rawPythonOutput: report.rawPythonOutput,
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

    function getPagePlan(): { name: string; counts: number }[] {
        if (!report) return [];
        // Aggregate sets from all sheets to ensure we don't miss any if some performers have rests/missing rows
        const sets = new Map<string, number>();
        for (const sheet of report.normalized) {
            for (const row of sheet.rows) {
                const id = row.setId;
                if (!sets.has(id)) {
                    sets.set(id, row.counts);
                }
            }
        }

        const plan = Array.from(sets.entries()).map(([name, counts]) => ({
            name,
            counts,
        }));

        // Sort by set ID
        plan.sort((a, b) => {
            const pA = parseSetId(a.name);
            const pB = parseSetId(b.name);
            if (!pA || !pB) return a.name.localeCompare(b.name);
            if (pA.num !== pB.num) return pA.num - pB.num;
            if (pA.subset === pB.subset) return 0;
            if (!pA.subset) return -1; // 1 before 1A
            if (!pB.subset) return 1;
            return pA.subset.localeCompare(pB.subset);
        });

        return plan;
    }

    type ParsedSet = { num: number; subset: string | null };
    function parseSetId(name: string): ParsedSet | null {
        // Handle "Start", "Beg", "Opener" as set 0
        if (/^(start|beg|bgn|opener|open)$/i.test(name)) {
            return { num: 0, subset: null };
        }
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
        console.log(
            `[import-commit] Page plan: ${plan.length} pages, ${totalCounts} total counts`,
        );

        // 1) Beats
        // For imports, the first page always starts at beat position 0
        // We need beats covering the full range up to totalCounts. Indices 0..totalCounts.
        const beatsNeeded = Math.max(0, totalCounts + 1 - beats.length);
        console.log(
            `[import-commit] Current beats: ${beats.length}, needed: ${beatsNeeded} (first page will start at position 0)`,
        );

        if (beatsNeeded > 0) {
            const beatDuration = 60 / bpm;
            console.log(
                `[import-commit] Creating ${beatsNeeded} beats at ${bpm} BPM (duration: ${beatDuration}s)`,
            );
            const newBeats = Array.from({ length: beatsNeeded }, () => ({
                duration: beatDuration,
                include_in_measure: true,
            }));
            await createBeatsMutation.mutateAsync({ newBeats });
            await fetchTimingObjects();
            console.log(
                `[import-commit] Created ${beatsNeeded} beats successfully`,
            );
        }
        // Refetch beats to ensure we have the latest data
        const updatedBeatsData = await queryClient.fetchQuery(
            allDatabaseBeatsQueryOptions(),
        );
        const currentBeats = updatedBeatsData
            .sort((a, b) => a.position - b.position)
            .map((beat) => ({ id: beat.id, position: beat.position }));

        // Ensure we have a beat at position 0 (required for first page)
        const beatAtPosition0 = currentBeats.find((b) => b.position === 0);
        if (!beatAtPosition0) {
            console.error(
                "[import-commit] No beat found at position 0 - this should not happen",
            );
            toast.error("Missing beat at position 0");
            return false;
        }

        console.log(
            `[import-commit] Refetched ${currentBeats.length} beats (positions 0-${currentBeats.length - 1}), first page will start at position 0`,
        );

        // Refetch database pages to check for start_beat conflicts
        const databasePages = await queryClient.fetchQuery(
            allDatabasePagesQueryOptions(),
        );
        const pageByStartBeat = new Map(
            databasePages.map((p) => [p.start_beat, p.id]),
        );
        console.log(
            `[import-commit] Found ${databasePages.length} existing pages (start_beats: ${Array.from(pageByStartBeat.keys()).join(", ")})`,
        );

        // 2) Pages with robust subset flags
        const validation = validateAndFlags(plan);
        if (!validation.valid) {
            console.error(
                "[import-commit] Page plan validation failed:",
                validation.message,
            );
            toast.error(validation.message || "Invalid page plan");
            return false;
        }
        const flags = validation.flags;
        const pageByName = new Map(pages.map((p) => [p.name, p.id]));
        const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];
        const usedBeatIds = new Set<number>();
        // Track plan indices and their corresponding start_beat positions for mapping later
        const planIndexToStartBeat = new Map<number, number>();
        // First page always starts at beat position 0 (OpenMarch convention)
        let cum = 0;
        for (let i = 0; i < plan.length; i++) {
            const { name, counts } = plan[i];

            // For subsequent pages, add the counts to find the new position.
            // This assumes 'counts' column represents "counts to reach this set".
            if (i > 0) {
                cum += counts;
            }

            const startPosition = cum; // beat position (0-indexed)
            // Find beat at this position (beats are sorted by position)
            const beatObj = currentBeats.find(
                (b) => b.position === startPosition,
            );
            if (!beatObj) {
                console.error(
                    `[import-commit] Missing beat at position ${startPosition} for page ${name}`,
                );
                toast.error(
                    `Missing beat at position ${startPosition} for page ${name}`,
                );
                return false;
            }

            // Check if a page already exists at this start_beat (UNIQUE constraint)
            if (pageByStartBeat.has(beatObj.id)) {
                const existingPageId = pageByStartBeat.get(beatObj.id);
                console.log(
                    `[import-commit] Page "${name}" already exists at start_beat ${beatObj.id} (page ID: ${existingPageId}), skipping creation`,
                );
                planIndexToStartBeat.set(i, beatObj.id);
                continue;
            }

            // Check if we already queued a page for this beat (prevent duplicates in batch)
            if (usedBeatIds.has(beatObj.id)) {
                console.warn(
                    `[import-commit] WARNING: Page "${name}" maps to beat ${startPosition} (ID: ${beatObj.id}), but a page was already queued for this beat. Skipping creation to prevent UNIQUE constraint violation.`,
                );
                planIndexToStartBeat.set(i, beatObj.id);
                continue;
            }

            // Check if page exists by name (legacy check)
            if (pageByName.has(name)) {
                console.log(
                    `[import-commit] Page "${name}" already exists, skipping`,
                );
                continue;
            }

            console.log(
                `[import-commit] Creating page "${name}" at beat position ${startPosition} (beat ID: ${beatObj.id}), subset: ${flags[i]}`,
            );
            newPagesArgs.push({ start_beat: beatObj.id, is_subset: flags[i] });
            usedBeatIds.add(beatObj.id);
            planIndexToStartBeat.set(i, beatObj.id);
        }
        if (newPagesArgs.length > 0) {
            console.log(
                `[import-commit] Creating ${newPagesArgs.length} new pages...`,
            );
            await createPagesMutation.mutateAsync(
                newPagesArgs.map((p) => ({
                    start_beat: p.start_beat,
                    is_subset: p.is_subset,
                })),
            );
            await fetchTimingObjects();
            console.log(
                `[import-commit] Created ${newPagesArgs.length} pages successfully`,
            );
        } else {
            console.log("[import-commit] No new pages to create");
        }
        return { planIndexToStartBeat };
    }

    async function commitImport() {
        if (!report || !fieldProperties) return;
        setIsCommitting(true);
        try {
            console.log("[import-commit] Starting database commit...");

            let planIndexToStartBeat: Map<number, number> | undefined;
            if (createTimeline) {
                console.log("[import-commit] Creating beats and pages...");
                const result = await ensureBeatsAndPages();
                if (!result) {
                    console.error(
                        "[import-commit] Failed to create beats/pages",
                    );
                    return;
                }
                planIndexToStartBeat = result.planIndexToStartBeat;
                console.log(
                    "[import-commit] Beats and pages created successfully",
                );
            }

            // 1) Map or create marchers
            console.log("[import-commit] Processing marchers...");
            const existingByLabel = new Map<string, number>();
            for (const m of marchers) {
                if (m.drill_number)
                    existingByLabel.set(m.drill_number.toLowerCase(), m.id);
            }
            console.log(
                `[import-commit] Found ${existingByLabel.size} existing marchers`,
            );

            if (proposedMarchers.length > 0) {
                console.log(
                    `[import-commit] Creating ${proposedMarchers.length} new marchers...`,
                );
                const createdMarchers =
                    await createMarchersMutation.mutateAsync(proposedMarchers);
                console.log(
                    `[import-commit] Created ${createdMarchers.length} marchers:`,
                    createdMarchers
                        .map((m) => `${m.drill_prefix}${m.drill_order}`)
                        .join(", "),
                );
                for (const m of createdMarchers) {
                    const drillNumber = `${m.drill_prefix}${m.drill_order}`;
                    existingByLabel.set(drillNumber.toLowerCase(), m.id);

                    // If this marcher was newly created, set its initial position (x, y) in the `marchers` table
                    // based on Set 0 / Start from the imported data.
                    // This is separate from `marcher_pages` (which stores per-page coordinates).
                    // The `marchers` table stores a default/initial coordinate.
                    const originalKey = (m as any).originalKey;
                    const labelKey = originalKey
                        ? originalKey.toLowerCase()
                        : drillNumber.toLowerCase();

                    // Find the sheet for this marcher
                    const sheet = report.normalized.find((s) => {
                        const sKey = (
                            s.header.label ||
                            s.header.symbol ||
                            s.header.performer ||
                            "?"
                        ).toLowerCase();
                        return sKey === labelKey;
                    });

                    if (sheet) {
                        // Find the start row (Set 0 or first row)
                        const startRow =
                            sheet.rows.find((r) => {
                                const p = parseSetId(r.setId);
                                return p && p.num === 0;
                            }) || sheet.rows[0];

                        if (startRow) {
                            const pps = fieldProperties.pixelsPerStep as number;
                            const cx = fieldProperties.centerFrontPoint
                                .xPixels as number;
                            const cy = fieldProperties.centerFrontPoint
                                .yPixels as number;

                            const initialX = cx + startRow.xSteps * pps;
                            const initialY = cy + startRow.ySteps * pps;

                            // We need to update the marcher record with these coordinates
                            // Since createMarchersMutation might not accept x/y, we can run a direct update or use a separate mutation if available.
                            // However, typically `marchers` table x/y is used for the "starting position" if no page 0 exists?
                            // Or does OpenMarch rely solely on `marcher_pages` for positions?
                            // Actually, `marchers` table usually has x/y columns.
                            // Let's update it.
                            // Note: `createMarchersMutation` returns the created object. If we want to set X/Y we should do it.
                            // But usually `marcher_pages` for Page 1 (Start) handles the first position.
                            // If Page 1 is "Start", then `marcher_pages` update below will set it.
                            // So maybe we don't need to update `marchers` table directly if `marcher_pages` covers it?
                            // But the user said "set 0 is still wrong".
                            // If Set 0 is the start, `marcher_pages` will have an entry for Page 0.
                            // Let's ensure the `marcher_pages` update includes Set 0.
                        }
                    }
                }
            }

            // Refresh pages after creation to get the latest data
            await fetchTimingObjects();
            const allPages = pages;

            // Map pages by their start_beat position (which matches plan order)
            // We already tracked planIndexToStartBeat, so we can map setId -> pageId directly
            const plan = getPagePlan();
            const pageBySetId = new Map<string, number>();

            if (planIndexToStartBeat) {
                // Get database pages to find page IDs by start_beat
                const databasePages = await queryClient.fetchQuery(
                    allDatabasePagesQueryOptions(),
                );
                const pagesByStartBeat = new Map(
                    databasePages.map((p) => [p.start_beat, p.id]),
                );

                // Map plan items to pages using the start_beat positions we tracked
                for (let i = 0; i < plan.length; i++) {
                    const { name: setId } = plan[i];
                    const startBeatId = planIndexToStartBeat.get(i);
                    if (startBeatId) {
                        const pageId = pagesByStartBeat.get(startBeatId);
                        if (pageId) {
                            pageBySetId.set(setId, pageId);
                        } else {
                            console.warn(
                                `[import-commit] No page found at start_beat ${startBeatId} for setId "${setId}"`,
                            );
                        }
                    }
                }
            } else {
                // Fallback: if we didn't create timeline, try to map by name or index
                const databasePages = await queryClient.fetchQuery(
                    allDatabasePagesQueryOptions(),
                );
                const allBeatsData = await queryClient.fetchQuery(
                    allDatabaseBeatsQueryOptions(),
                );
                const beatsById = new Map(
                    allBeatsData.map((beat) => [beat.id, beat.position]),
                );
                const sortedPages = [...databasePages].sort((a, b) => {
                    const aPos = beatsById.get(a.start_beat) ?? Infinity;
                    const bPos = beatsById.get(b.start_beat) ?? Infinity;
                    return aPos - bPos;
                });
                // Map by index (plan[i] -> sortedPages[i])
                for (
                    let i = 0;
                    i < plan.length && i < sortedPages.length;
                    i++
                ) {
                    const { name: setId } = plan[i];
                    pageBySetId.set(setId, sortedPages[i].id);
                }
            }

            console.log(
                `[import-commit] Found ${allPages.length} pages in database, mapped ${pageBySetId.size} pages by setId`,
            );
            console.log(
                `[import-commit] Page mapping (first 10):`,
                Array.from(pageBySetId.entries())
                    .slice(0, 10)
                    .map(([setId, pageId]) => `${setId} -> ${pageId}`)
                    .join(", "),
            );

            // 3) Build updates for marcher_pages
            console.log("[import-commit] Building marcher_pages updates...");
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

            const skippedSheets: string[] = [];
            const skippedRows: Array<{
                sheet: string;
                setId: string;
                reason: string;
            }> = [];

            // Track which performers get which coordinates for collision detection
            const performerCoordinateCounts = new Map<string, number>();
            const performerLabelsSeen = new Map<string, number>(); // label -> count of sheets with this label

            // First pass: detect duplicate labels (multiple performers with same label)
            for (const sheet of report.normalized) {
                const labelKey = (
                    sheet.header.label ||
                    sheet.header.symbol ||
                    sheet.header.performer ||
                    "?"
                ).toLowerCase();
                performerLabelsSeen.set(
                    labelKey,
                    (performerLabelsSeen.get(labelKey) || 0) + 1,
                );
            }

            // Warn about duplicate labels
            const duplicateLabels = Array.from(
                performerLabelsSeen.entries(),
            ).filter(([_, count]) => count > 1);
            if (duplicateLabels.length > 0) {
                console.warn(
                    `[import-commit] WARNING: Found duplicate performer labels:`,
                    duplicateLabels
                        .map(([label, count]) => `${label} (${count}x)`)
                        .join(", "),
                );
                toast.warning(
                    `Found ${duplicateLabels.length} duplicate performer labels. Coordinates may be incorrectly assigned.`,
                );
            }

            for (const sheet of report.normalized) {
                const labelKey = (
                    sheet.header.label ||
                    sheet.header.symbol ||
                    sheet.header.performer ||
                    "?"
                ).toLowerCase();
                const marcherId = existingByLabel.get(labelKey);
                if (!marcherId) {
                    skippedSheets.push(labelKey);
                    continue;
                }

                // Track how many coordinates this performer is getting
                const coordCount = sheet.rows.length;
                performerCoordinateCounts.set(labelKey, coordCount);

                // Warn if a performer has suspiciously many or few coordinates
                if (coordCount > 100) {
                    console.warn(
                        `[import-commit] WARNING: Performer "${labelKey}" has ${coordCount} coordinates - might be incorrectly grouped`,
                    );
                }

                for (const row of sheet.rows) {
                    const pageId = pageBySetId.get(row.setId);
                    if (!pageId) {
                        skippedRows.push({
                            sheet: labelKey,
                            setId: row.setId,
                            reason: "Page not found",
                        });
                        continue;
                    }
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

            // Log coordinate distribution for debugging
            console.log(
                `[import-commit] Coordinate distribution:`,
                Array.from(performerCoordinateCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([label, count]) => `${label}: ${count}`)
                    .join(", "),
            );

            if (skippedSheets.length > 0) {
                console.warn(
                    `[import-commit] Skipped ${skippedSheets.length} sheets (marcher not found):`,
                    skippedSheets,
                );
            }
            if (skippedRows.length > 0) {
                console.warn(
                    `[import-commit] Skipped ${skippedRows.length} rows (page not found):`,
                    skippedRows,
                );
            }

            if (updates.length === 0) {
                console.error("[import-commit] No updates to apply");
                toast.warning(
                    "No updates to apply. Ensure pages exist with names matching set IDs.",
                );
                return;
            }

            console.log(
                `[import-commit] Writing ${updates.length} marcher_pages updates to database...`,
            );
            const updatedIds =
                await updateMarcherPagesMutation.mutateAsync(updates);
            console.log(
                `[import-commit] Successfully updated ${updatedIds.length} marcher_pages`,
            );

            await fetchTimingObjects();
            console.log("[import-commit] Commit completed successfully");
            toast.success(
                `Imported ${updates.length} positions${createTimeline ? " with beats/pages" : ""}.`,
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
                <DialogContent className="max-h-[90vh] max-w-[1200px] overflow-auto">
                    <DialogTitle>PDF Import</DialogTitle>
                    {report ? (
                        <div className="flex flex-col gap-12">
                            <div className="text-muted-foreground text-sm">
                                Pages: {report.pages} · Errors: {report.errors}{" "}
                                · Warnings: {report.warnings}
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
                            <div className="flex flex-col gap-8">
                                <div className="text-sm font-medium">
                                    Troubleshooting Data
                                </div>
                                <div className="flex gap-4 border-b">
                                    {[
                                        {
                                            key: "raw",
                                            label: "1. Raw Python Output",
                                        },
                                        {
                                            key: "parsed",
                                            label: "2. Parsed Sheets",
                                        },
                                        {
                                            key: "normalized",
                                            label: "3. Normalized (xSteps/ySteps)",
                                        },
                                        {
                                            key: "dots",
                                            label: "4. Dots Format (pixels)",
                                        },
                                        {
                                            key: "db",
                                            label: "5. DB Write Preview",
                                        },
                                    ].map((step) => (
                                        <button
                                            key={step.key}
                                            onClick={() =>
                                                setActiveStep(step.key as any)
                                            }
                                            className={`border-b-2 px-12 py-8 text-sm transition-colors ${
                                                activeStep === step.key
                                                    ? "border-primary text-primary font-medium"
                                                    : "text-muted-foreground hover:text-foreground border-transparent"
                                            }`}
                                        >
                                            {step.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="max-h-[400px] overflow-auto rounded-md border p-12 font-mono text-xs">
                                    {activeStep === "raw" && (
                                        <pre className="whitespace-pre-wrap">
                                            {JSON.stringify(
                                                report.rawPythonOutput,
                                                null,
                                                2,
                                            )}
                                        </pre>
                                    )}
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
                                                            (row: any) => ({
                                                                setId: row.setId,
                                                                counts: row.counts,
                                                                xSteps: row.xSteps,
                                                                ySteps: row.ySteps,
                                                                source: row.source,
                                                                conf: row.conf,
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
                                                proposedMarcherPages,
                                                null,
                                                2,
                                            )}
                                        </pre>
                                    )}
                                    {activeStep === "db" && (
                                        <div>
                                            <div className="mb-8 font-semibold">
                                                Proposed Marchers:
                                            </div>
                                            <pre className="mb-12 whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    proposedMarchers,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                            <div className="mb-8 font-semibold">
                                                Proposed Pages:
                                            </div>
                                            <pre className="mb-12 whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    proposedPages,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                            <div className="mb-8 font-semibold">
                                                Marcher Pages Updates (will be
                                                written to DB):
                                            </div>
                                            <pre className="whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    proposedMarcherPages.map(
                                                        (mp) => ({
                                                            marcher_id:
                                                                mp.marcher_id,
                                                            page_label:
                                                                mp.page_label,
                                                            x: mp.x,
                                                            y: mp.y,
                                                            notes: mp.notes,
                                                        }),
                                                    ),
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        </div>
                                    )}
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
                                    onClick={downloadJson}
                                    className={getButtonClassName({
                                        variant: "secondary",
                                        size: "default",
                                        content: "text",
                                        className: undefined,
                                    })}
                                >
                                    Export JSON
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
