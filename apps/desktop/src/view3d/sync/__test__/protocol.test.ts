import { describe, expect, it } from "vitest";
import {
    isView3dClock,
    isView3dInvalidate,
    isView3dSelection,
    newerClock,
    showTimeAt,
    type View3dClock,
} from "../protocol";

const clock = (overrides: Partial<View3dClock> = {}): View3dClock => ({
    seq: 1,
    playing: false,
    anchorShowMs: 12_000,
    anchorWallMs: 1_000_000,
    rate: 1,
    ...overrides,
});

describe("showTimeAt", () => {
    it("advances from the anchor while playing", () => {
        const playing = clock({ playing: true });
        expect(showTimeAt(playing, 1_000_000)).toBe(12_000);
        expect(showTimeAt(playing, 1_000_250)).toBe(12_250);
        expect(showTimeAt(playing, 1_003_000)).toBe(15_000);
    });

    it("holds the anchor while paused", () => {
        const paused = clock({ playing: false });
        expect(showTimeAt(paused, 1_000_000)).toBe(12_000);
        expect(showTimeAt(paused, 1_060_000)).toBe(12_000);
    });

    it("scales elapsed wall time by the rate", () => {
        expect(showTimeAt(clock({ playing: true, rate: 0.5 }), 1_002_000)).toBe(
            13_000,
        );
        expect(showTimeAt(clock({ playing: true, rate: 2 }), 1_002_000)).toBe(
            16_000,
        );
    });

    it("holds at the anchor when the wall time is before it", () => {
        expect(showTimeAt(clock({ playing: true }), 999_990)).toBe(12_000);
    });
});

describe("newerClock", () => {
    it("takes the first clock", () => {
        const first = clock({ seq: 5 });
        expect(newerClock(null, first)).toBe(first);
    });

    it("takes a newer seq", () => {
        const current = clock({ seq: 5 });
        const next = clock({ seq: 6, playing: true });
        expect(newerClock(current, next)).toBe(next);
    });

    it("ignores an older or repeated seq that arrives out of order", () => {
        const current = clock({ seq: 7, anchorShowMs: 20_000 });
        const late = clock({ seq: 6, anchorShowMs: 1_000 });
        expect(newerClock(current, late)).toBe(current);
        expect(newerClock(current, clock({ seq: 7 }))).toBe(current);
    });

    it("keeps the newest of a shuffled stream", () => {
        const stream = [3, 1, 4, 2, 5].map((seq) =>
            clock({ seq, anchorShowMs: seq * 1000 }),
        );
        const kept = stream.reduce<View3dClock | null>(newerClock, null);
        expect(kept?.seq).toBe(5);
        expect(kept?.anchorShowMs).toBe(5000);
    });
});

describe("payload guards", () => {
    it("accepts well-formed payloads", () => {
        expect(isView3dClock(clock())).toBe(true);
        expect(
            isView3dSelection({ selectedPageId: 3, selectedMarcherIds: [1] }),
        ).toBe(true);
        expect(
            isView3dSelection({ selectedPageId: null, selectedMarcherIds: [] }),
        ).toBe(true);
        expect(isView3dInvalidate({ queryKeys: [[]] })).toBe(true);
        expect(isView3dInvalidate({ queryKeys: [["pages"], ["x", 1]] })).toBe(
            true,
        );
    });

    it("rejects malformed payloads", () => {
        expect(isView3dClock(null)).toBe(false);
        expect(isView3dClock({ ...clock(), seq: "1" })).toBe(false);
        expect(isView3dClock({ ...clock(), anchorShowMs: NaN })).toBe(false);
        expect(
            isView3dSelection({ selectedPageId: 3, selectedMarcherIds: ["1"] }),
        ).toBe(false);
        expect(isView3dSelection({ selectedMarcherIds: [] })).toBe(false);
        expect(isView3dInvalidate({ queryKeys: ["pages"] })).toBe(false);
    });
});
