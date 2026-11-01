// @vitest-environment node
import { endlessIdOf } from "@/timeline/endlessTimeline";
import { describe, expect, it } from "vitest";
import type { DatabaseItemGeometry } from "@/db-functions/items";
import {
    beatIndexesById,
    fieldOutlineWrite,
    itemOutlineChanges,
    outlineWriteBeat,
} from "../itemOutlineTimeline";

// Beat ids aren't their indexes, as in a show with deleted beats
const beats = [10, 11, 12, 13, 14, 15].map((id, index) => ({ id, index }));

const row = (
    beat_id: number,
    patch: Partial<DatabaseItemGeometry> = {},
): DatabaseItemGeometry => ({
    id: beat_id,
    item_id: 7,
    beat_id,
    outline_type: "rectangle",
    width: 2,
    depth: 1,
    height: 0,
    rotation: 0,
    custom_outline: null,
    transition_length: 1,
    rolls_out: 0,
    leading_edge: null,
    created_at: "",
    updated_at: "",
    ...patch,
});

const changesFor = (rows: DatabaseItemGeometry[]) =>
    itemOutlineChanges({
        items: [{ id: 7, marcher_id: 3 }],
        geometry: rows,
        beatIndexes: beatIndexesById(beats),
    });

describe("itemOutlineChanges", () => {
    it("keys changes by marcher and counts them by beat index", () => {
        const changes = changesFor([
            row(12, { rolls_out: 1, leading_edge: "front" }),
        ]);
        expect(changes.get(3)).toEqual([
            expect.objectContaining({
                beat: 2,
                outlineType: "rectangle",
                rollsOut: true,
                leadingEdge: "front",
            }),
        ]);
    });

    it("leaves out a change on a beat that isn't loaded", () => {
        expect(changesFor([row(99)]).get(3)).toBeUndefined();
    });
});

describe("outlineWriteBeat", () => {
    it("writes on the beat at or before the playhead", () => {
        expect(outlineWriteBeat(beats, 3.6)?.id).toBe(13);
        expect(outlineWriteBeat(beats, 3)?.id).toBe(13);
        expect(outlineWriteBeat(beats, 0)?.id).toBe(10);
        // Past the stored counts: the endless beat there, which the write stores (endless counts)
        expect(outlineWriteBeat(beats, 40)).toEqual({
            id: endlessIdOf(40),
            index: 40,
        });
        expect(outlineWriteBeat([], 2)).toBeUndefined();
    });
});

describe("fieldOutlineWrite", () => {
    const shown = {
        outlineType: "polygon" as const,
        width: 2,
        depth: 1,
        height: 0.5,
        rotation: 0,
        customOutline: { points: [{ x: 0, y: 0 }] },
        rollsOut: true,
        leadingEdge: "back" as const,
        progress: 1,
    };
    const drawn = { width: 3, depth: 1.5, rotation: 45 };

    it("writes the drawn size and turn, keeping the rest of the Outline", () => {
        expect(
            fieldOutlineWrite({
                itemId: 7,
                beatId: 13,
                drawn,
                shown,
                rows: [],
            }),
        ).toEqual({
            itemId: 7,
            beatId: 13,
            geometry: {
                outlineType: "polygon",
                customOutline: { points: [{ x: 0, y: 0 }] },
                width: 3,
                depth: 1.5,
                height: 0.5,
                rotation: 45,
                transitionLength: 1,
                rollsOutFrom: "back",
            },
        });
    });

    it("keeps the transition of a change already on the beat", () => {
        expect(
            fieldOutlineWrite({
                itemId: 7,
                beatId: 13,
                drawn,
                shown,
                rows: [row(13, { transition_length: 4 }), row(12)],
            }).geometry.transitionLength,
        ).toBe(4);
    });

    it("reads a stored custom outline as data, so it isn't written back as a string", () => {
        const stored = { points: [{ x: -0.5, y: 0.5 }] };
        const [change] = changesFor([
            row(10, { custom_outline: JSON.stringify(stored) }),
        ]).get(3)!;
        expect(change.customOutline).toEqual(stored);
    });
});
