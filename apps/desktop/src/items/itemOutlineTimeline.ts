/**
 * Items' Outlines over the show, for the field: their stored geometry changes keyed by marcher
 * and counted by beat index, the same beat numbers the timeline resolver and playhead use.
 */
import { endlessIdOf } from "@/timeline/endlessTimeline";
import { type GeometryChange, type ItemGeometry } from "@openmarch/core";
import type { DatabaseItem, DatabaseItemGeometry } from "@/db-functions/items";
import type { SetItemGeometryArgs } from "@/hooks/queries/useItems";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";

/** An Outline's size and turn as drawn on the field, in meters and degrees */
export interface DrawnItemGeometry {
    width: number;
    depth: number;
    rotation: number;
}

/** Each item's Outline changes, by its marcher id */
export type ItemOutlineChanges = ReadonlyMap<number, readonly GeometryChange[]>;

/** The beats' indexes by id */
export type BeatIndexes = ReadonlyMap<number, number>;

export const beatIndexesById = (
    beats: readonly { id: number; index: number }[],
): BeatIndexes => new Map(beats.map((b) => [b.id, b.index]));

/**
 * Groups the stored Outline changes by item, as `itemGeometryAt` reads them. A change on a beat
 * that isn't loaded yet is left out until it is.
 */
export function itemOutlineChanges({
    items,
    geometry,
    beatIndexes,
}: {
    items: readonly Pick<DatabaseItem, "id" | "marcher_id">[];
    geometry: readonly DatabaseItemGeometry[];
    beatIndexes: BeatIndexes;
}): ItemOutlineChanges {
    const marcherByItem = new Map(items.map((i) => [i.id, i.marcher_id]));
    const changes = new Map<number, GeometryChange[]>();
    for (const row of geometry) {
        const marcherId = marcherByItem.get(row.item_id);
        const beat = beatIndexes.get(row.beat_id);
        if (marcherId === undefined || beat === undefined) continue;
        let list = changes.get(marcherId);
        if (!list) changes.set(marcherId, (list = []));
        list.push({
            beat,
            outlineType: row.outline_type,
            width: row.width,
            depth: row.depth,
            height: row.height,
            rotation: row.rotation,
            customOutline: parseStoredJson(row.custom_outline),
            transitionLength: row.transition_length,
            rollsOut: row.rolls_out === 1,
            leadingEdge: row.leading_edge,
        });
    }
    return changes;
}

/** A stored JSON column's value, or null when there is none or it doesn't parse */
function parseStoredJson(text: string | null): unknown {
    if (text === null) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

/**
 * The beat a change made with the playhead at `playheadBeat` is written on: the beat at or
 * before the playhead, so it is in place where the user is looking. Past the stored counts it is
 * an endless beat (`endlessIdOf`), which the write stores first (endless counts).
 */
export function outlineWriteBeat(
    beats: readonly { readonly id: number; readonly index: number }[],
    playheadBeat: number,
): { readonly id: number; readonly index: number } | undefined {
    if (beats.length === 0) return undefined;
    const index = Math.max(0, Math.floor(playheadBeat + 1e-9));
    return beats[index] ?? { id: endlessIdOf(index), index };
}

/**
 * The geometry write for an Outline resized or turned on the field: the drawn size and turn,
 * on `beatId`, keeping the rest of the Outline as shown. A change already on that beat keeps its
 * transition length; a new one is instant. An imported model's prop resizes evenly (fork #1078):
 * given `heightScalesFrom`, its width before the edit, the height scales by as much as the width
 * did, so a turn alone keeps it.
 */
export function fieldOutlineWrite({
    itemId,
    beatId,
    drawn,
    shown,
    rows,
    heightScalesFrom,
}: {
    itemId: number;
    beatId: number;
    drawn: DrawnItemGeometry;
    /** The Outline drawn before the edit */
    shown: ItemGeometry;
    rows: readonly DatabaseItemGeometry[];
    /** The stored width before the edit, for an Outline whose height follows its width */
    heightScalesFrom?: number;
}): SetItemGeometryArgs {
    const existing = rows.find(
        (r) => r.item_id === itemId && r.beat_id === beatId,
    );
    return {
        itemId,
        beatId,
        geometry: {
            outlineType: shown.outlineType,
            customOutline: shown.customOutline ?? null,
            width: drawn.width,
            depth: drawn.depth,
            height:
                heightScalesFrom && heightScalesFrom > 0
                    ? shown.height * (drawn.width / heightScalesFrom)
                    : shown.height,
            rotation: drawn.rotation,
            transitionLength: existing?.transition_length ?? 1,
            rollsOutFrom: shown.rollsOut ? shown.leadingEdge : null,
        },
    };
}

/** `outlineWriteBeat` at the beat the timeline shows now (the paused playhead or a held frame) */
export const outlineWriteBeatNow = (
    beats: readonly { readonly id: number; readonly index: number }[],
): { readonly id: number; readonly index: number } | undefined =>
    outlineWriteBeat(
        beats,
        displayedBeat(useTimelineSelectionStore.getState()),
    );
