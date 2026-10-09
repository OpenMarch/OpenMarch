import { describe, expect, it } from "vitest";
import { snapEdgeBeat, stepOffForbidden } from "../timelineEdgeSnap";

/** UI-15: the rules every dragged timeline edge follows (page flags and move edges). */

describe("snapEdgeBeat", () => {
    const base = {
        pageBeats: [16],
        downbeats: [12, 16, 20],
        pixelsPerBeat: 16,
    };

    it("lands on a page line or the playhead within 12 px", () => {
        expect(snapEdgeBeat({ ...base, beat: 16.7 })).toBe(16);
        expect(snapEdgeBeat({ ...base, beat: 17.3 })).toBe(17);
        expect(snapEdgeBeat({ ...base, beat: 9.3, playheadBeat: 10 })).toBe(10);
    });

    it("lands on a downbeat only within 6 px, else on the nearest whole beat", () => {
        expect(snapEdgeBeat({ ...base, beat: 12.3 })).toBe(12);
        expect(snapEdgeBeat({ ...base, beat: 12.6 })).toBe(13);
    });

    it("a page line or the playhead wins over a nearer downbeat", () => {
        expect(
            snapEdgeBeat({
                pageBeats: [16],
                downbeats: [15.5],
                pixelsPerBeat: 16,
                beat: 15.6,
            }),
        ).toBe(16);
    });

    it("Alt keeps only the whole beat", () => {
        expect(snapEdgeBeat({ ...base, beat: 16.7, snapDisabled: true })).toBe(
            17,
        );
    });
});

describe("stepOffForbidden", () => {
    it("moves back toward where the edge started, past a run of forbidden beats", () => {
        expect(stepOffForbidden(20, 16, new Set([20]))).toBe(19);
        expect(stepOffForbidden(20, 16, new Set([19, 20]))).toBe(18);
        expect(stepOffForbidden(10, 16, new Set([10, 11]))).toBe(12);
        expect(stepOffForbidden(20, 16, new Set([17]))).toBe(20);
        // Never past where it started
        expect(stepOffForbidden(17, 16, new Set([16, 17]))).toBe(16);
    });
});

describe("flagSnapBeat (review: zoomed out, page lines trapped a flag)", () => {
    // Imported here so the edge rules sit together
    it("ignores page lines: at 4 px per beat, near the next flag it lands where pointed", async () => {
        const { flagSnapBeat } = await import("../TimelinePageFlagGrips");
        const base = {
            downbeats: [],
            playheadBeat: null,
            pixelsPerBeat: 4,
            snapDisabled: false,
        };
        // The next flag is at 32 (a wall at 31): pointing at 30 lands on 30
        expect(flagSnapBeat({ ...base, beat: 30 })).toBe(30);
        // One beat from where it started (24) moves one beat
        expect(flagSnapBeat({ ...base, beat: 25 })).toBe(25);
        // The playhead still pulls from 12 px, downbeats from 6 px
        expect(flagSnapBeat({ ...base, beat: 27, playheadBeat: 29 })).toBe(29);
        expect(flagSnapBeat({ ...base, downbeats: [28], beat: 26.6 })).toBe(28);
        expect(flagSnapBeat({ ...base, downbeats: [28], beat: 26.4 })).toBe(26);
    });
});

describe("the edge's own start is never a snap target (review)", () => {
    it("a flag on a downbeat moves one count at 4 px per beat", async () => {
        const { flagSnapBeat } = await import("../TimelinePageFlagGrips");
        const base = {
            downbeats: [24, 28, 32],
            playheadBeat: null,
            pixelsPerBeat: 4,
            snapDisabled: false,
        };
        expect(flagSnapBeat({ ...base, beat: 25, from: 24 })).toBe(25);
        // Without `from` it was pulled back onto 24
        expect(flagSnapBeat({ ...base, beat: 25 })).toBe(24);
    });

    it("a move's edge on a page line moves one count when zoomed out", () => {
        expect(
            snapEdgeBeat({
                beat: 17,
                pageBeats: [16, 32],
                downbeats: [16, 20],
                pixelsPerBeat: 4,
                from: 16,
            }),
        ).toBe(17);
    });
});
