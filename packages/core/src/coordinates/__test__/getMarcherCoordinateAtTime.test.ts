import { describe, expect, it } from "vitest";
import { buildMarcherTimelines, getMarcherCoordinateAtTime } from "../..";

// Beat 1 starts at 0ms, beat 2 at 500ms, beat 3 at 1000ms (each beat is 0.5s).
const beats = [
    { id: 1, duration: 0.5, position: 0 },
    { id: 2, duration: 0.5, position: 1 },
    { id: 3, duration: 0.5, position: 2 },
];

// Page 1 starts at beat 1 (0ms); page 2 starts at beat 3 (1000ms).
const pages = [
    { id: 1, start_beat: 1 },
    { id: 2, start_beat: 3 },
];

const marchers = [{ id: 1, drill_prefix: "B", drill_order: 1 }];

describe("buildMarcherTimelines / getMarcherCoordinateAtTime", () => {
    it("interpolates linearly between two page keyframes", () => {
        const timelines = buildMarcherTimelines({
            beats,
            pages,
            marchers,
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 10, y: 20 },
            ],
        });

        expect(getMarcherCoordinateAtTime(1, timelines, 0)).toEqual({
            x: 0,
            y: 0,
        });
        expect(getMarcherCoordinateAtTime(1, timelines, 500)).toEqual({
            x: 5,
            y: 10,
        });
        expect(getMarcherCoordinateAtTime(1, timelines, 1000)).toEqual({
            x: 10,
            y: 20,
        });
    });

    it("clamps to the last keyframe after the marcher's final page", () => {
        const timelines = buildMarcherTimelines({
            beats,
            pages,
            marchers,
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 10, y: 20 },
            ],
        });

        expect(getMarcherCoordinateAtTime(1, timelines, 5000)).toEqual({
            x: 10,
            y: 20,
        });
    });

    it("clamps to the first keyframe before the marcher's first page", () => {
        const timelines = buildMarcherTimelines({
            beats,
            pages,
            marchers,
            marcherPages: [
                // Marcher only has a position starting at page 2 (1000ms).
                { marcher_id: 1, page_id: 2, x: 10, y: 20 },
            ],
        });

        expect(getMarcherCoordinateAtTime(1, timelines, 0)).toEqual({
            x: 10,
            y: 20,
        });
    });

    it("returns undefined for a marcher with no timeline", () => {
        const timelines = buildMarcherTimelines({
            beats,
            pages,
            marchers,
            marcherPages: [{ marcher_id: 1, page_id: 1, x: 0, y: 0 }],
        });

        expect(getMarcherCoordinateAtTime(999, timelines, 0)).toBeUndefined();
    });
});
