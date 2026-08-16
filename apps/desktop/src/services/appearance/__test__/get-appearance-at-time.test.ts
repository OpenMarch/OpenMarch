import { describe, expect, it } from "vitest";
import type { ResolvedPerformerAppearance } from "@/entity-components/appearance";
import type { MarcherAppearanceTimeline } from "../type";
import {
    getAppearanceAtTime,
    getAllAppearancesAtTime,
} from "../get-appearance-at-time";

const appearance = (
    overrides: Partial<ResolvedPerformerAppearance> = {},
): ResolvedPerformerAppearance => ({
    fillRgba: "rgba(0,0,0,1)",
    strokeRgba: "rgba(0,0,0,1)",
    strokeWidth: 1,
    visible: true,
    textVisible: true,
    shape: "circle",
    ...overrides,
});

const timeline = (
    timestamps: number[],
    appearances: ResolvedPerformerAppearance[],
): MarcherAppearanceTimeline => ({
    timestamps: new Float32Array(timestamps),
    appearances,
});

describe("getAppearanceAtTime", () => {
    const circle = appearance({ shape: "circle" });
    const square = appearance({ shape: "square" });
    const triangle = appearance({ shape: "triangle" });
    const marcherTimeline = timeline(
        [0, 1000, 2000],
        [circle, square, triangle],
    );

    it("returns the first appearance at the first timestamp", () => {
        expect(getAppearanceAtTime(marcherTimeline, 0)).toBe(circle);
    });

    it("holds the previous appearance until the next keyframe (no tweening)", () => {
        expect(getAppearanceAtTime(marcherTimeline, 500)).toBe(circle);
        expect(getAppearanceAtTime(marcherTimeline, 999)).toBe(circle);
    });

    it("returns the new appearance exactly at its keyframe", () => {
        expect(getAppearanceAtTime(marcherTimeline, 1000)).toBe(square);
    });

    it("holds the last appearance after the last timestamp", () => {
        expect(getAppearanceAtTime(marcherTimeline, 5000)).toBe(triangle);
    });

    it("returns the only appearance for a single-keyframe timeline", () => {
        const single = timeline([100], [circle]);
        expect(getAppearanceAtTime(single, 100)).toBe(circle);
        expect(getAppearanceAtTime(single, 9999)).toBe(circle);
    });

    it("returns the same object reference across repeated calls in an interval", () => {
        // Callers rely on this to skip re-applying an unchanged appearance every frame.
        const first = getAppearanceAtTime(marcherTimeline, 500);
        const second = getAppearanceAtTime(marcherTimeline, 750);
        expect(first).toBe(second);
    });

    it("matches a keyframe even when float64→float32 rounding nudges it above the query time", () => {
        // Regression test: page timestamps are computed at full float64 precision (e.g.
        // by the frame clock, when paused exactly on a page boundary), but keyframe
        // timestamps are stored in a Float32Array and silently rounded. Pick a
        // realistic show timestamp whose Float32 rounding lands *above* the exact
        // float64 value, and confirm querying at that exact float64 value still finds
        // the keyframe it's bit-identical to, instead of falling back one keyframe early.
        const exactMs = 47.891234 * 1000;
        expect(Math.fround(exactMs)).toBeGreaterThan(exactMs);

        const rounded = timeline([0, exactMs], [circle, square]);
        expect(getAppearanceAtTime(rounded, exactMs)).toBe(square);
    });

    it("throws when timeMs is negative", () => {
        expect(() => getAppearanceAtTime(marcherTimeline, -1)).toThrow(
            "timeMs must be non-negative",
        );
    });

    it("throws when the timeline is empty", () => {
        expect(() => getAppearanceAtTime(timeline([], []), 0)).toThrow(
            "timestamps must not be empty",
        );
    });
});

describe("getAllAppearancesAtTime", () => {
    it("samples every marcher's timeline in order at the given time", () => {
        const hidden = appearance({ visible: false });
        const visible = appearance({ visible: true });
        const timelines = [
            timeline([0, 1000], [visible, hidden]),
            timeline([0], [visible]),
        ];

        expect(getAllAppearancesAtTime(timelines, 1000)).toEqual([
            hidden,
            visible,
        ]);
    });

    it("returns an empty array for an empty list of timelines", () => {
        expect(getAllAppearancesAtTime([], 0)).toEqual([]);
    });
});
