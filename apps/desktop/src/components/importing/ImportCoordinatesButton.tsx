import { useRef, useState, useMemo, useEffect } from "react";
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
import {
    parsePdfToSheets,
    normalizeParsedSheets,
    detectFieldHashType,
    type SourceHashType,
} from "@/importers/pdfCoordinates";
import type {
    NormalizedSheet,
    ParsedSheet,
} from "@/importers/pdfCoordinates/types";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
} from "@/hooks/queries";
import { type NewMarcherArgs } from "@/db-functions";
import { useTimingObjects } from "@/hooks";
import {
    parseSetId,
    buildPagePlan,
    validatePlan,
    computeBeatPositions,
    buildMarcherPageUpdates,
    mapPage0Variants,
} from "@/importers/pdfCoordinates/planBuilder";

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
    const [sourceHashType, setSourceHashType] = useState<SourceHashType>("HS");
    const [activeStep, setActiveStep] = useState<
        "parsed" | "normalized" | "dots" | "db"
    >("parsed");
    const [isLoading, setIsLoading] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [createTimeline, setCreateTimeline] = useState(true);
    const [bpm, setBpm] = useState(120);

    // Default hash type from the user's field properties
    useEffect(() => {
        if (fieldProperties?.yCheckpoints) {
            setSourceHashType(
                detectFieldHashType(fieldProperties.yCheckpoints as any),
            );
        }
    }, [fieldProperties]);

    // Re-normalize reactively when hash type or parsed data changes
    const report = useMemo(() => {
        if (!parsedPdf || !fieldProperties) return null;
        const result = normalizeParsedSheets(
            parsedPdf.parsed,
            fieldProperties as any,
            sourceHashType,
        );
        return {
            pages: parsedPdf.pages,
            errors: result.dryRun.issues.filter((i) => i.type === "error")
                .length,
            warnings: result.dryRun.issues.filter((i) => i.type === "warning")
                .length,
            details: result.dryRun.issues,
            normalized: result.normalized,
            parsed: result.parsed,
        };
    }, [parsedPdf, fieldProperties, sourceHashType]);

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
            const result = await parsePdfToSheets(arrayBuffer);
            setParsedPdf(result);
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

    function getPagePlan() {
        if (!report) return [];
        return buildPagePlan(report.normalized as any);
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
        const validation = validatePlan(plan);
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
        // The first row in the PDF is the initial position (no movement before it) -> page 0
        // The second row represents where they move TO (first movement) -> page 1 (starts at counts[0])
        // The third row represents the second movement -> page 2 (starts at counts[0] + counts[1])
        // The counts column represents "counts to reach this set"
        let cumulativeBeatPosition = 0;
        console.log(
            `[import-commit] Processing ${plan.length} plan items to create/verify pages`,
        );
        for (let i = 0; i < plan.length; i++) {
            const { name, counts } = plan[i];

            // Row 0 = initial position -> page 0 (beat 0)
            // Row 1 = first movement destination -> page 1 (beat = counts[1])
            // The counts column represents "counts to reach this set"
            // So we accumulate the current row's counts to get the start position
            if (i > 0) {
                cumulativeBeatPosition += counts;
            }

            const startPosition = cumulativeBeatPosition; // beat position (0-indexed)
            const parsedSet = parseSetId(name);
            const isSet2 =
                parsedSet && parsedSet.num === 2 && !parsedSet.subset;
            console.log(
                `[import-commit] Plan[${i}]: "${name}" -> counts=${counts}, cumulative=${cumulativeBeatPosition}, beat position=${startPosition}${isSet2 ? " [SET 2 - DEBUGGING]" : ""}`,
            );
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
            console.log(
                `[import-commit] Found beat ID ${beatObj.id} at position ${startPosition} for "${name}"${isSet2 ? " [SET 2 - DEBUGGING]" : ""}`,
            );

            // Check if a page already exists at this start_beat (UNIQUE constraint)
            if (pageByStartBeat.has(beatObj.id)) {
                const existingPageId = pageByStartBeat.get(beatObj.id);
                console.log(
                    `[import-commit] Page "${name}" already exists at start_beat ${beatObj.id} (page ID: ${existingPageId}), skipping creation${isSet2 ? " [SET 2 - DEBUGGING: Page exists, will map to this page]" : ""}`,
                );
                planIndexToStartBeat.set(i, beatObj.id);
                continue;
            }

            // CRITICAL: The first row (i === 0) should map to page ID 0 (FIRST_PAGE_ID)
            // Page 0 always exists and is at beat position 0, so we should use it instead of creating a new page
            if (i === 0 && startPosition === 0) {
                const existingPage0 = databasePages.find((p) => p.id === 0);
                if (existingPage0) {
                    console.log(
                        `[import-commit] First row "${name}" maps to existing page 0 (FIRST_PAGE_ID) at beat position 0`,
                    );
                    planIndexToStartBeat.set(i, beatObj.id);
                    continue; // Don't create a new page, use existing page 0
                }
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
                const existingPageId = pageByName.get(name);
                console.log(
                    `[import-commit] Page "${name}" already exists (page ID: ${existingPageId}), skipping creation but tracking mapping`,
                );
                // Still track the mapping even if page already exists
                planIndexToStartBeat.set(i, beatObj.id);
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

            // Get database pages to find page IDs by start_beat
            const databasePages = await queryClient.fetchQuery(
                allDatabasePagesQueryOptions(),
            );
            console.log(
                `[import-commit] Found ${databasePages.length} total pages in database`,
            );
            console.log(
                `[import-commit] First 5 pages:`,
                databasePages
                    .slice(0, 5)
                    .map((p) => `page ${p.id} at beat ${p.start_beat}`)
                    .join(", "),
            );
            const pagesByStartBeat = new Map(
                databasePages.map((p) => [p.start_beat, p.id]),
            );
            console.log(
                `[import-commit] Built pagesByStartBeat map with ${pagesByStartBeat.size} entries`,
            );

            // Get beat at position 0 to find page 0 (FIRST_PAGE_ID)
            const allBeatsData = await queryClient.fetchQuery(
                allDatabaseBeatsQueryOptions(),
            );
            const beatAtPosition0 = allBeatsData.find((b) => b.position === 0);
            const page0Id = beatAtPosition0
                ? pagesByStartBeat.get(beatAtPosition0.id)
                : null;

            if (page0Id === null || page0Id === undefined) {
                console.error(
                    "[import-commit] Page 0 (FIRST_PAGE_ID) not found - this should never happen",
                );
                toast.error("Page 0 not found. Cannot proceed with import.");
                return;
            }
            mapPage0Variants(plan, page0Id).forEach((id, setId) =>
                pageBySetId.set(setId, id),
            );

            if (planIndexToStartBeat) {
                // Map plan items to pages using the start_beat positions we tracked
                console.log(
                    `[import-commit] Mapping ${plan.length} plan items to pages using planIndexToStartBeat`,
                );
                console.log(
                    `[import-commit] planIndexToStartBeat entries:`,
                    Array.from(planIndexToStartBeat.entries())
                        .slice(0, 5)
                        .map(
                            ([idx, beatId]) => `plan[${idx}] -> beat ${beatId}`,
                        )
                        .join(", "),
                );
                console.log(
                    `[import-commit] Available pages by start_beat:`,
                    Array.from(pagesByStartBeat.entries())
                        .slice(0, 5)
                        .map(
                            ([beatId, pageId]) =>
                                `beat ${beatId} -> page ${pageId}`,
                        )
                        .join(", "),
                );

                for (let i = 0; i < plan.length; i++) {
                    if (i === 0) continue;
                    const { name: setId, counts } = plan[i];
                    const parsedSet = parseSetId(setId);
                    if (parsedSet && parsedSet.num === 0) continue;

                    const startBeatId = planIndexToStartBeat.get(i);
                    const isSet2Mapping =
                        parsedSet && parsedSet.num === 2 && !parsedSet.subset;
                    if (startBeatId) {
                        const pageId = pagesByStartBeat.get(startBeatId);
                        if (pageId) {
                            pageBySetId.set(setId, pageId);
                            console.log(
                                `[import-commit] Mapped "${setId}" (plan index ${i}, counts=${counts}) -> beat ${startBeatId} -> page ${pageId}${isSet2Mapping ? " [SET 2 - DEBUGGING: Successfully mapped]" : ""}`,
                            );
                        } else {
                            console.error(
                                `[import-commit] ERROR: No page found at start_beat ${startBeatId} for setId "${setId}" (plan index ${i}, counts=${counts})${isSet2Mapping ? " [SET 2 - DEBUGGING: MAPPING FAILED]" : ""}`,
                            );
                            console.error(
                                `[import-commit] Available beat IDs in pagesByStartBeat:`,
                                Array.from(pagesByStartBeat.keys()).slice(
                                    0,
                                    10,
                                ),
                            );
                            if (isSet2Mapping) {
                                console.error(
                                    `[import-commit] SET 2 DEBUG: Looking for beat ID ${startBeatId} at position 32`,
                                );
                                console.error(
                                    `[import-commit] SET 2 DEBUG: All pages:`,
                                    databasePages
                                        .slice(0, 10)
                                        .map(
                                            (p) =>
                                                `page ${p.id} at beat ${p.start_beat}`,
                                        )
                                        .join(", "),
                                );
                            }
                        }
                    } else {
                        console.error(
                            `[import-commit] ERROR: No start_beat found in planIndexToStartBeat for plan index ${i} (setId="${setId}")${isSet2Mapping ? " [SET 2 - DEBUGGING: NO BEAT ID TRACKED]" : ""}`,
                        );
                    }
                }
            } else {
                // Fallback: if we didn't create timeline, try to map by name or index
                const beatsById = new Map(
                    allBeatsData.map((beat) => [beat.id, beat.position]),
                );
                const sortedPages = [...databasePages].sort((a, b) => {
                    const aPos = beatsById.get(a.start_beat) ?? Infinity;
                    const bPos = beatsById.get(b.start_beat) ?? Infinity;
                    return aPos - bPos;
                });
                // Map by index (plan[i] -> sortedPages[i]); page-0 already in pageBySetId
                for (
                    let i = 0;
                    i < plan.length && i < sortedPages.length;
                    i++
                ) {
                    const { name: setId } = plan[i];
                    if (pageBySetId.has(setId)) continue;
                    pageBySetId.set(setId, sortedPages[i].id);
                }
            }

            const pps = fieldProperties.pixelsPerStep as number;
            const cx = fieldProperties.centerFrontPoint.xPixels as number;
            const cy = fieldProperties.centerFrontPoint.yPixels as number;

            const { updates, stats } = buildMarcherPageUpdates(
                report.normalized,
                pageBySetId,
                existingByLabel,
                pps,
                cx,
                cy,
            );

            if (stats.skippedInvalid > 0) {
                toast.warning(
                    `Skipped ${stats.skippedInvalid} rows with invalid coordinates.`,
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
                            <div className="text-muted-foreground text-sm">
                                Total rows parsed:{" "}
                                {report.normalized.reduce(
                                    (sum, s) => sum + (s.rows?.length || 0),
                                    0,
                                )}{" "}
                                across {report.normalized.length} performer
                                sheets
                            </div>
                            <div className="flex items-center gap-16">
                                <label className="flex items-center gap-8">
                                    <span>Source hash type</span>
                                    <select
                                        value={sourceHashType}
                                        onChange={(e) =>
                                            setSourceHashType(
                                                e.target
                                                    .value as SourceHashType,
                                            )
                                        }
                                        className="rounded-4 border-stroke bg-fg-1 border px-8 py-4"
                                    >
                                        {(
                                            Object.entries(
                                                HASH_TYPE_LABELS,
                                            ) as [SourceHashType, string][]
                                        ).map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
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
                                            key: "parsed",
                                            label: "1. Parsed Sheets",
                                        },
                                        {
                                            key: "normalized",
                                            label: "2. Normalized (xSteps/ySteps)",
                                        },
                                        {
                                            key: "dots",
                                            label: "3. Dots Format (pixels)",
                                        },
                                        {
                                            key: "db",
                                            label: "4. DB Write Preview",
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
