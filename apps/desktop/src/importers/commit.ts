/**
 * Shared commit logic for all import adapters.
 * Takes an ImportManifest + field properties and writes marchers,
 * beats, pages, and marcher_pages to the database.
 *
 * Format-agnostic: no adapter-specific imports.
 */

import type { ImportManifest, ImportMarcher } from "./types";
import { queryClient } from "@/App";
import {
    allDatabaseBeatsQueryOptions,
    allDatabasePagesQueryOptions,
} from "@/hooks/queries";
import { db } from "@/global/database/db";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { updateUtility } from "@/db-functions/utility";

// ── Types ────────────────────────────────────────────────────────────

export type CommitManifestInput = {
    manifest: ImportManifest;
    field: {
        pixelsPerStep: number;
        centerFrontPoint: { xPixels: number; yPixels: number };
    };
    mutations: CommitMutations;
    existingMarchers: ExistingMarcher[];
    existingPages: { id: number; name: string }[];
    existingBeats: { id: number; position: number }[];
    createTimeline: boolean;
    bpm: number;
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

export type CommitResult = {
    success: boolean;
    updatedCount: number;
    skippedInvalid: number;
    error?: string;
};

// ── Set ID utilities ─────────────────────────────────────────────────

const START_SET_PATTERN = /^(start|beg|bgn|opener|open)$/i;
const PAGE_0_VARIANTS = ["0", "Start", "Beg", "Bgn", "Opener", "Open"];

type SetIdParts = { num: number; subset: string | null };

function parseSetId(name: string): SetIdParts | null {
    if (START_SET_PATTERN.test(name)) return { num: 0, subset: null };
    const match = name.match(/^(\d+)([A-Za-z]*)$/);
    if (!match) return null;
    return {
        num: parseInt(match[1], 10),
        subset: match[2] ? match[2].toUpperCase() : null,
    };
}

/** Maps all known "set 0" aliases (Start, Beg, 0, etc.) to a single page ID. */
function buildPage0Map(
    firstSetName: string,
    pageId: number,
): Map<string, number> {
    const map = new Map<string, number>();
    for (const variant of PAGE_0_VARIANTS) map.set(variant, pageId);
    map.set(firstSetName, pageId);
    return map;
}

// ── Main commit ──────────────────────────────────────────────────────

export async function commitManifest(
    input: CommitManifestInput,
): Promise<CommitResult> {
    const { manifest, field, mutations, createTimeline, bpm } = input;
    const { pixelsPerStep, centerFrontPoint } = field;

    const sortedSets = [...manifest.sets].sort((a, b) => a.order - b.order);
    const setEntries = sortedSets.map((s) => ({
        name: s.setId,
        counts: s.counts,
        isSubset: s.isSubset ?? false,
    }));

    let beatIdBySetIndex: Map<number, number> | undefined;

    if (createTimeline) {
        const timelineResult = await ensureBeatsAndPages(
            setEntries,
            input.existingBeats,
            input.existingPages,
            mutations,
            bpm,
        );
        if (!timelineResult) {
            return {
                success: false,
                updatedCount: 0,
                skippedInvalid: 0,
                error: "Failed to create beats/pages",
            };
        }
        beatIdBySetIndex = timelineResult.beatIdBySetIndex;

        const firstSetParts = parseSetId(setEntries[0].name);
        if (firstSetParts) {
            const settings = await getWorkspaceSettingsParsed({ db });
            if (settings.pageNumberOffset !== firstSetParts.num) {
                await updateWorkspaceSettingsParsed({
                    db,
                    settings: {
                        ...settings,
                        pageNumberOffset: firstSetParts.num,
                    },
                });
            }
        }

        const lastSetCounts = setEntries[setEntries.length - 1].counts;
        if (lastSetCounts > 0) {
            await updateUtility({
                db,
                args: { last_page_counts: lastSetCounts },
            });
        }
    }

    // ── Create marchers ──────────────────────────────────────────────

    const existingDrillToId = new Map<string, number>();
    for (const marcher of input.existingMarchers) {
        if (marcher.drill_number)
            existingDrillToId.set(
                marcher.drill_number.toLowerCase(),
                marcher.id,
            );
    }

    const marcherKeyToDbId = new Map<string, number>();
    const newMarcherArgs: (ImportMarcher & { originalKey: string })[] = [];
    const usedDrillKeys = new Set(existingDrillToId.keys());

    for (const importedMarcher of manifest.marchers) {
        const drillKey =
            `${importedMarcher.drillPrefix}${importedMarcher.drillOrder}`.toLowerCase();
        const existingId = existingDrillToId.get(drillKey);

        if (existingId !== undefined) {
            marcherKeyToDbId.set(importedMarcher.key, existingId);
        } else {
            let order = importedMarcher.drillOrder;
            let candidateKey =
                `${importedMarcher.drillPrefix}${order}`.toLowerCase();
            while (usedDrillKeys.has(candidateKey)) {
                order++;
                candidateKey =
                    `${importedMarcher.drillPrefix}${order}`.toLowerCase();
            }
            usedDrillKeys.add(candidateKey);
            newMarcherArgs.push({
                ...importedMarcher,
                drillOrder: order,
                originalKey: importedMarcher.key,
            });
        }
    }

    if (newMarcherArgs.length > 0) {
        const created = await mutations.createMarchers(
            newMarcherArgs.map((marcher) => ({
                section: marcher.section || "Band",
                drill_prefix: marcher.drillPrefix,
                drill_order: marcher.drillOrder,
                name: marcher.name,
            })),
        );
        for (let i = 0; i < created.length; i++) {
            marcherKeyToDbId.set(newMarcherArgs[i].originalKey, created[i].id);
        }
    }

    // ── Map setId → pageId ───────────────────────────────────────────

    await mutations.fetchTimingObjects();
    const dbPages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const dbBeats = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );

    const pageIdByStartBeat = new Map(dbPages.map((p) => [p.start_beat, p.id]));
    const beatPositionById = new Map(dbBeats.map((b) => [b.id, b.position]));

    const firstBeat = dbBeats.find((b) => b.position === 0);
    const firstPageId = firstBeat ? pageIdByStartBeat.get(firstBeat.id) : null;

    const pageIdBySetId = new Map<string, number>();

    if (firstPageId != null && setEntries.length > 0) {
        buildPage0Map(setEntries[0].name, firstPageId).forEach((id, setId) =>
            pageIdBySetId.set(setId, id),
        );
    }

    if (beatIdBySetIndex) {
        for (let i = 1; i < setEntries.length; i++) {
            const setId = setEntries[i].name;
            const parts = parseSetId(setId);
            if (parts && parts.num === 0) continue;
            const startBeatId = beatIdBySetIndex.get(i);
            if (startBeatId) {
                const pageId = pageIdByStartBeat.get(startBeatId);
                if (pageId) pageIdBySetId.set(setId, pageId);
            }
        }
    } else {
        const pagesSortedByBeatPosition = [...dbPages].sort((a, b) => {
            const posA = beatPositionById.get(a.start_beat) ?? Infinity;
            const posB = beatPositionById.get(b.start_beat) ?? Infinity;
            return posA - posB;
        });
        for (let i = 0; i < setEntries.length; i++) {
            if (pageIdBySetId.has(setEntries[i].name)) continue;
            const page = pagesSortedByBeatPosition[i];
            if (page) pageIdBySetId.set(setEntries[i].name, page.id);
        }
    }

    // ── Convert positions to pixel updates ───────────────────────────

    const marcherPageUpdates: {
        marcher_id: number;
        page_id: number;
        x: number;
        y: number;
        notes: string;
    }[] = [];
    let skippedInvalid = 0;

    for (const position of manifest.positions) {
        const marcherId = marcherKeyToDbId.get(position.marcherKey);
        if (marcherId === undefined) continue;

        let pageId = pageIdBySetId.get(position.setId);
        if (pageId === undefined) {
            const parts = parseSetId(position.setId);
            if (parts && parts.num === 0) {
                pageId = pageIdBySetId.get("0") ?? pageIdBySetId.get("Start");
            }
        }
        if (pageId === undefined) continue;

        if (
            !Number.isFinite(position.xSteps) ||
            !Number.isFinite(position.ySteps)
        ) {
            skippedInvalid++;
            continue;
        }

        marcherPageUpdates.push({
            marcher_id: marcherId,
            page_id: pageId,
            x: centerFrontPoint.xPixels + position.xSteps * pixelsPerStep,
            y: centerFrontPoint.yPixels + position.ySteps * pixelsPerStep,
            notes: "",
        });
    }

    if (marcherPageUpdates.length === 0) {
        return {
            success: false,
            updatedCount: 0,
            skippedInvalid,
            error: "No updates to apply",
        };
    }

    const updatedIds = await mutations.updateMarcherPages(marcherPageUpdates);
    await mutations.fetchTimingObjects();

    return { success: true, updatedCount: updatedIds.length, skippedInvalid };
}

// ── Timeline creation ────────────────────────────────────────────────

type SetEntry = { name: string; counts: number; isSubset: boolean };

async function ensureBeatsAndPages(
    setEntries: SetEntry[],
    existingBeats: { id: number; position: number }[],
    existingPages: { id: number; name: string }[],
    mutations: CommitMutations,
    bpm: number,
): Promise<{ beatIdBySetIndex: Map<number, number> } | false> {
    const totalCounts = setEntries.reduce((sum, s) => sum + s.counts, 0);
    const beatsNeeded = Math.max(0, totalCounts + 1 - existingBeats.length);

    if (beatsNeeded > 0) {
        const beatDuration = 60 / bpm;
        await mutations.createBeats({
            newBeats: Array.from({ length: beatsNeeded }, () => ({
                duration: beatDuration,
                include_in_measure: true,
            })),
        });
        await mutations.fetchTimingObjects();
    }

    const allBeats = await queryClient.fetchQuery(
        allDatabaseBeatsQueryOptions(),
    );
    const sortedBeats = [...allBeats]
        .sort((a, b) => a.position - b.position)
        .map((b) => ({ id: b.id, position: b.position }));

    if (!sortedBeats.some((b) => b.position === 0)) return false;

    const dbPages = await queryClient.fetchQuery(
        allDatabasePagesQueryOptions(),
    );
    const existingPageByBeatId = new Map(
        dbPages.map((p) => [p.start_beat, p.id]),
    );
    const existingPageByName = new Map(
        existingPages.map((p) => [p.name, p.id]),
    );

    const pagesToCreate: { start_beat: number; is_subset: boolean }[] = [];
    const usedBeatIds = new Set<number>();
    const beatIdBySetIndex = new Map<number, number>();

    let cumulativePosition = 0;

    for (let i = 0; i < setEntries.length; i++) {
        if (i === 1) cumulativePosition = 1;
        else if (i > 1) cumulativePosition += setEntries[i - 1].counts;

        const beat = sortedBeats.find((b) => b.position === cumulativePosition);
        if (!beat) return false;

        const alreadyHasPage =
            existingPageByBeatId.has(beat.id) ||
            (i === 0 &&
                cumulativePosition === 0 &&
                dbPages.some((p) => p.id === 0)) ||
            usedBeatIds.has(beat.id) ||
            existingPageByName.has(setEntries[i].name);

        if (!alreadyHasPage) {
            pagesToCreate.push({
                start_beat: beat.id,
                is_subset: setEntries[i].isSubset,
            });
            usedBeatIds.add(beat.id);
        }

        beatIdBySetIndex.set(i, beat.id);
    }

    if (pagesToCreate.length > 0) {
        await mutations.createPages(pagesToCreate);
        await mutations.fetchTimingObjects();
    }

    return { beatIdBySetIndex };
}
