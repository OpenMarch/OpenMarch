/**
 * Shared commit logic for all import adapters.
 * Takes an ImportManifest + field properties and writes marchers,
 * beats, pages, and marcher_pages to the database.
 */

import type { ImportManifest, ImportMarcher } from "./types";
import { queryClient } from "@/App";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
} from "@/hooks/queries";
import {
    parseSetId,
    buildPagePlan,
    validatePlan,
    mapPage0Variants,
    buildMarcherPageUpdates,
    type PlanEntry,
} from "./pdfCoordinates/planBuilder";
import type { NormalizedSheet } from "./pdfCoordinates/types";

type FieldPropsLike = {
    pixelsPerStep: number;
    centerFrontPoint: { xPixels: number; yPixels: number };
};

type CommitMutations = {
    createMarchers: (
        args: {
            section: string;
            drill_prefix: string;
            drill_order: number;
            name?: string | null;
        }[],
    ) => Promise<{ id: number; drill_prefix: string; drill_order: number }[]>;
    createBeats: (args: {
        newBeats: { duration: number; include_in_measure: boolean }[];
    }) => Promise<unknown>;
    createPages: (
        args: { start_beat: number; is_subset: boolean }[],
    ) => Promise<unknown>;
    updateMarcherPages: (
        args: {
            marcher_id: number;
            page_id: number;
            x: number;
            y: number;
            notes: string;
        }[],
    ) => Promise<number[]>;
    fetchTimingObjects: () => Promise<void>;
};

type ExistingMarcher = {
    id: number;
    drill_number?: string | null;
    drill_prefix: string;
    drill_order: number;
};

type CommitOptions = {
    createTimeline: boolean;
    bpm: number;
};

export type CommitResult = {
    success: boolean;
    updatedCount: number;
    skippedInvalid: number;
    error?: string;
};

/**
 * Commit an ImportManifest to the database.
 * Creates marchers, beats/pages (optional), converts steps to pixels,
 * and batch-updates marcher_pages.
 */
export async function commitManifest(
    manifest: ImportManifest,
    fieldProps: FieldPropsLike,
    mutations: CommitMutations,
    existingMarchers: ExistingMarcher[],
    existingPages: { id: number; name: string }[],
    existingBeats: { id: number; position: number }[],
    options: CommitOptions,
): Promise<CommitResult> {
    const { createTimeline, bpm } = options;
    const pps = fieldProps.pixelsPerStep;
    const cx = fieldProps.centerFrontPoint.xPixels;
    const cy = fieldProps.centerFrontPoint.yPixels;

    // Build page plan from manifest sets
    const plan: PlanEntry[] = manifest.sets.map((s) => ({
        name: s.setId,
        counts: s.counts,
    }));

    let planIndexToStartBeat: Map<number, number> | undefined;

    if (createTimeline) {
        const result = await ensureBeatsAndPages(
            plan,
            existingBeats,
            existingPages,
            mutations,
            bpm,
        );
        if (!result) {
            return {
                success: false,
                updatedCount: 0,
                skippedInvalid: 0,
                error: "Failed to create beats/pages",
            };
        }
        planIndexToStartBeat = result.planIndexToStartBeat;
    }

    // Create marchers
    const existingByDrill = new Map<string, number>();
    for (const m of existingMarchers) {
        if (m.drill_number)
            existingByDrill.set(m.drill_number.toLowerCase(), m.id);
    }

    const marcherKeyToId = new Map<string, number>();
    const newMarcherArgs: (ImportMarcher & { originalKey: string })[] = [];
    const usedDrillKeys = new Set(existingByDrill.keys());

    for (const im of manifest.marchers) {
        const drillKey = `${im.drillPrefix}${im.drillOrder}`.toLowerCase();
        const existing = existingByDrill.get(drillKey);
        if (existing !== undefined) {
            marcherKeyToId.set(im.key, existing);
        } else {
            let order = im.drillOrder;
            let dk = `${im.drillPrefix}${order}`.toLowerCase();
            while (usedDrillKeys.has(dk)) {
                order++;
                dk = `${im.drillPrefix}${order}`.toLowerCase();
            }
            usedDrillKeys.add(dk);
            newMarcherArgs.push({
                ...im,
                drillOrder: order,
                originalKey: im.key,
            });
        }
    }

    if (newMarcherArgs.length > 0) {
        const created = await mutations.createMarchers(
            newMarcherArgs.map((m) => ({
                section: m.section || "Band",
                drill_prefix: m.drillPrefix,
                drill_order: m.drillOrder,
                name: m.name,
            })),
        );
        for (let i = 0; i < created.length; i++) {
            const key = newMarcherArgs[i].originalKey;
            marcherKeyToId.set(key, created[i].id);
            existingByDrill.set(
                `${created[i].drill_prefix}${created[i].drill_order}`.toLowerCase(),
                created[i].id,
            );
        }
    }

    // Map setId -> pageId
    await mutations.fetchTimingObjects();
    const databasePages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const allBeatsData = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );

    const pagesByStartBeat = new Map(
        databasePages.map((p) => [p.start_beat, p.id]),
    );
    const beatsById = new Map(allBeatsData.map((b) => [b.id, b.position]));

    const beatAtPosition0 = allBeatsData.find((b) => b.position === 0);
    const page0Id = beatAtPosition0
        ? pagesByStartBeat.get(beatAtPosition0.id)
        : null;

    const pageBySetId = new Map<string, number>();

    if (page0Id !== null && page0Id !== undefined) {
        mapPage0Variants(plan, page0Id).forEach((id, setId) =>
            pageBySetId.set(setId, id),
        );
    }

    if (planIndexToStartBeat) {
        for (let i = 0; i < plan.length; i++) {
            if (i === 0) continue;
            const { name: setId } = plan[i];
            const parsed = parseSetId(setId);
            if (parsed && parsed.num === 0) continue;
            const startBeatId = planIndexToStartBeat.get(i);
            if (startBeatId) {
                const pageId = pagesByStartBeat.get(startBeatId);
                if (pageId) pageBySetId.set(setId, pageId);
            }
        }
    } else {
        const sortedPages = [...databasePages].sort((a, b) => {
            const aPos = beatsById.get(a.start_beat) ?? Infinity;
            const bPos = beatsById.get(b.start_beat) ?? Infinity;
            return aPos - bPos;
        });
        for (let i = 0; i < plan.length; i++) {
            if (pageBySetId.has(plan[i].name)) continue;
            const page = sortedPages[i];
            if (page) pageBySetId.set(plan[i].name, page.id);
        }
    }

    // Convert positions to pixel updates
    const updates: {
        marcher_id: number;
        page_id: number;
        x: number;
        y: number;
        notes: string;
    }[] = [];
    let skippedInvalid = 0;

    for (const pos of manifest.positions) {
        const marcherId = marcherKeyToId.get(pos.marcherKey);
        if (marcherId === undefined) continue;

        let pageId = pageBySetId.get(pos.setId);
        if (pageId === undefined) {
            const parsed = parseSetId(pos.setId);
            if (parsed && parsed.num === 0) {
                pageId = pageBySetId.get("0") ?? pageBySetId.get("Start");
            }
        }
        if (pageId === undefined) continue;

        if (!Number.isFinite(pos.xSteps) || !Number.isFinite(pos.ySteps)) {
            skippedInvalid++;
            continue;
        }

        updates.push({
            marcher_id: marcherId,
            page_id: pageId,
            x: cx + pos.xSteps * pps,
            y: cy + pos.ySteps * pps,
            notes: "",
        });
    }

    if (updates.length === 0) {
        return {
            success: false,
            updatedCount: 0,
            skippedInvalid,
            error: "No updates to apply",
        };
    }

    const updatedIds = await mutations.updateMarcherPages(updates);
    await mutations.fetchTimingObjects();

    return { success: true, updatedCount: updatedIds.length, skippedInvalid };
}

async function ensureBeatsAndPages(
    plan: PlanEntry[],
    existingBeats: { id: number; position: number }[],
    existingPages: { id: number; name: string }[],
    mutations: CommitMutations,
    bpm: number,
): Promise<{ planIndexToStartBeat: Map<number, number> } | false> {
    const totalCounts = plan.reduce((a, b) => a + b.counts, 0);
    const beatsNeeded = Math.max(0, totalCounts + 1 - existingBeats.length);

    if (beatsNeeded > 0) {
        const beatDuration = 60 / bpm;
        const newBeats = Array.from({ length: beatsNeeded }, () => ({
            duration: beatDuration,
            include_in_measure: true,
        }));
        await mutations.createBeats({ newBeats });
        await mutations.fetchTimingObjects();
    }

    const updatedBeatsData = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );
    const currentBeats = updatedBeatsData
        .sort((a, b) => a.position - b.position)
        .map((beat) => ({ id: beat.id, position: beat.position }));

    const beatAtPosition0 = currentBeats.find((b) => b.position === 0);
    if (!beatAtPosition0) return false;

    const databasePages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const pageByStartBeat = new Map(
        databasePages.map((p) => [p.start_beat, p.id]),
    );

    const validation = validatePlan(plan);
    if (!validation.valid) return false;

    const flags = validation.flags;
    const pageByName = new Map(existingPages.map((p) => [p.name, p.id]));
    const newPagesArgs: { start_beat: number; is_subset: boolean }[] = [];
    const usedBeatIds = new Set<number>();
    const planIndexToStartBeat = new Map<number, number>();

    let cumulativeBeatPosition = 0;

    for (let i = 0; i < plan.length; i++) {
        const { counts } = plan[i];
        if (i > 0) cumulativeBeatPosition += counts;

        const startPosition = cumulativeBeatPosition;
        const beatObj = currentBeats.find((b) => b.position === startPosition);
        if (!beatObj) return false;

        if (pageByStartBeat.has(beatObj.id)) {
            planIndexToStartBeat.set(i, beatObj.id);
            continue;
        }

        if (i === 0 && startPosition === 0) {
            const existingPage0 = databasePages.find((p) => p.id === 0);
            if (existingPage0) {
                planIndexToStartBeat.set(i, beatObj.id);
                continue;
            }
        }

        if (usedBeatIds.has(beatObj.id)) {
            planIndexToStartBeat.set(i, beatObj.id);
            continue;
        }

        if (pageByName.has(plan[i].name)) {
            planIndexToStartBeat.set(i, beatObj.id);
            continue;
        }

        newPagesArgs.push({ start_beat: beatObj.id, is_subset: flags[i] });
        usedBeatIds.add(beatObj.id);
        planIndexToStartBeat.set(i, beatObj.id);
    }

    if (newPagesArgs.length > 0) {
        await mutations.createPages(newPagesArgs);
        await mutations.fetchTimingObjects();
    }

    return { planIndexToStartBeat };
}
