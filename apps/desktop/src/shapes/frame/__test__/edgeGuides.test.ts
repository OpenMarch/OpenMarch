// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edgeGuides } from "../edgeGuides";

/** The guides along the field's lines a shape's snap points are on (#425, #446) */
describe("edgeGuides", () => {
    const field = { width: 300, height: 200 };
    const lines = { x: [0, 80, 160], y: [0, -100] };
    // A box from x 80 to 160 and y -40 to -10: its left and right edges on yard lines
    const outline = [
        { x: 80, y: -40 },
        { x: 160, y: -40 },
        { x: 160, y: -10 },
        { x: 80, y: -10 },
    ];
    const spots = [
        { x: 80, y: -40 },
        { x: 120, y: -40 },
        { x: 160, y: -40 },
        { x: 80, y: -10 },
        { x: 120, y: -10 },
        { x: 160, y: -10 },
    ];
    /** A box's guides with its corners as the snap points, as a stretch or a draw has them */
    const corners = (
        o: { x: number; y: number }[],
        s = spots,
        l: typeof lines | null = lines,
    ) => edgeGuides(o, o, s, l ?? undefined, field);

    it("draws a guide across the field along each line an edge is on, and tints its spots", () => {
        const { guides, edges, marks, on } = corners(outline);
        expect(guides).toEqual([
            { axis: "x", at: 80, from: { x: 80, y: 0 }, to: { x: 80, y: 200 } },
            {
                axis: "x",
                at: 160,
                from: { x: 160, y: 0 },
                to: { x: 160, y: 200 },
            },
        ]);
        expect(edges).toEqual([
            { from: { x: 160, y: -40 }, to: { x: 160, y: -10 } },
            { from: { x: 80, y: -10 }, to: { x: 80, y: -40 } },
        ]);
        // Every corner on a line is on a thick side, so none is ringed
        expect(marks).toEqual([]);
        expect(on).toEqual([
            { x: 80, y: -40 },
            { x: 160, y: -40 },
            { x: 80, y: -10 },
            { x: 160, y: -10 },
        ]);
    });

    it("draws none for edges between lines or no lines", () => {
        const off = outline.map((p) => ({ x: p.x + 2, y: p.y }));
        expect(corners(off).guides).toEqual([]);
        expect(corners(off).edges).toEqual([]);
        expect(corners(outline, spots, null).guides).toEqual([]);
    });

    it("draws a turned box's corner on a line with a guide and a ring, and no thick side (#446)", () => {
        const turned = [
            { x: 80, y: -45 },
            { x: 103, y: -25 },
            { x: 85, y: -5 },
            { x: 62, y: -25 },
        ];
        const { guides, edges, marks } = corners(turned, []);
        expect(guides).toEqual([
            { axis: "x", at: 80, from: { x: 80, y: 0 }, to: { x: 80, y: 200 } },
        ]);
        expect(edges).toEqual([]);
        expect(marks).toEqual([{ x: 80, y: -45 }]);
    });

    it("guides both lines at a crossing a turned corner stands on (#446)", () => {
        const turned = [
            { x: 80, y: -100 },
            { x: 100, y: -80 },
            { x: 85, y: -60 },
            { x: 65, y: -80 },
        ];
        const { guides, marks } = corners(turned, []);
        expect(guides.map((g) => [g.axis, g.at])).toEqual([
            ["x", 80],
            ["y", -100],
        ]);
        expect(marks).toEqual([{ x: 80, y: -100 }]);
    });

    it("draws a front-to-back line's guide side to side", () => {
        const back = [
            { x: 10, y: -100 },
            { x: 50, y: -100 },
            { x: 50, y: -60 },
            { x: 10, y: -60 },
        ];
        expect(corners(back, []).guides).toEqual([
            {
                axis: "y",
                at: -100,
                from: { x: 0, y: -100 },
                to: { x: 300, y: -100 },
            },
        ]);
    });

    it("draws a guide along a line a moved shape's center is on, ringing the center", () => {
        // Centered on the 80 front to back, its sides between lines
        const centered = [
            { x: 60, y: -40 },
            { x: 100, y: -40 },
            { x: 100, y: -10 },
            { x: 60, y: -10 },
        ];
        const center = { x: 80, y: -25 };
        const { guides, edges, marks } = edgeGuides(
            centered,
            [...centered, center],
            [],
            lines,
            field,
        );
        expect(guides).toEqual([
            { axis: "x", at: 80, from: { x: 80, y: 0 }, to: { x: 80, y: 200 } },
        ]);
        expect(edges).toEqual([]);
        expect(marks).toEqual([center]);
        // Without the center among the points (a stretch), nothing
        expect(corners(centered, []).guides).toEqual([]);
    });
});
