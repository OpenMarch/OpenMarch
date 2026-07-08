import { describe, expect, it } from "vitest";
import { Line, Path, sampleMarcherCoordinates } from "../..";

const baseBeats = [
    { id: 1, duration: 0.5, position: 0 },
    { id: 2, duration: 0.5, position: 1 },
    { id: 3, duration: 0.5, position: 2 },
];

const basePages = [
    { id: 1, start_beat: 1 },
    { id: 2, start_beat: 3 },
];

describe("sampleMarcherCoordinates", () => {
    it("samples linear coordinates into flat typed arrays", () => {
        const result = sampleMarcherCoordinates({
            fps: 2,
            beats: baseBeats,
            pages: basePages,
            marchers: [{ id: 1, drill_prefix: "B", drill_order: 1 }],
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 10, y: 20 },
            ],
        });

        expect(result.fps).toBe(2);
        expect(result.durationSeconds).toBe(1);
        expect(result.frameCount).toBe(3);
        expect(Array.from(result.coordinatesByMarcher.B1!)).toEqual([
            0, 0, 5, 10, 10, 20,
        ]);
    });

    it("includes a final frame when the duration does not land on a frame boundary", () => {
        const result = sampleMarcherCoordinates({
            fps: 2,
            beats: [
                { id: 1, duration: 0.4, position: 0 },
                { id: 2, duration: 0.35, position: 1 },
                { id: 3, duration: 0.25, position: 2 },
            ],
            pages: [
                { id: 1, start_beat: 1 },
                { id: 2, start_beat: 3 },
            ],
            marchers: [{ id: 1, drill_prefix: "B", drill_order: 1 }],
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 8, y: 16 },
            ],
        });

        expect(result.durationSeconds).toBe(0.75);
        expect(result.frameCount).toBe(3);
        expect(Array.from(result.coordinatesByMarcher.B1!)).toEqual([
            0, 0, 5.333333492279053, 10.666666984558105, 8, 16,
        ]);
    });

    it("keys output by drill number", () => {
        const result = sampleMarcherCoordinates({
            fps: 1,
            beats: baseBeats,
            pages: basePages,
            marchers: [
                { id: 1, drill_prefix: "B", drill_order: 1 },
                { id: 2, drill_prefix: "BD", drill_order: 12 },
            ],
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 1, y: 1 },
                { marcher_id: 2, page_id: 1, x: 2, y: 3 },
                { marcher_id: 2, page_id: 2, x: 4, y: 5 },
            ],
        });

        expect(Object.keys(result.coordinatesByMarcher).sort()).toEqual([
            "B1",
            "BD12",
        ]);
    });

    it("samples coordinates along a pathway range", () => {
        const path = new Path([new Line({ x: 0, y: 0 }, { x: 10, y: 0 })]);
        const result = sampleMarcherCoordinates({
            fps: 2,
            beats: baseBeats,
            pages: basePages,
            marchers: [{ id: 1, drill_prefix: "B", drill_order: 1 }],
            pathways: [{ id: 1, path_data: path.toJson() }],
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 2, y: 0 },
                {
                    marcher_id: 1,
                    page_id: 2,
                    x: 8,
                    y: 0,
                    path_data_id: 1,
                    path_start_position: 0.2,
                    path_end_position: 0.8,
                },
            ],
        });

        expect(Array.from(result.coordinatesByMarcher.B1!)).toEqual([
            2, 0, 5, 0, 8, 0,
        ]);
    });
});
