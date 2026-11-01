// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    ITEM_OUTLINES,
    insideOutline,
    normalizeOutlinePoints,
    outlineShape,
    parseCustomOutline,
    placeOutline,
    simplifyPath,
} from "../itemOutlines";

const TRIANGLE = {
    points: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0, y: 0.5 },
    ],
};

const extent = (points: readonly { x: number; y: number }[]) => ({
    width:
        Math.max(...points.map((p) => p.x)) -
        Math.min(...points.map((p) => p.x)),
    depth:
        Math.max(...points.map((p) => p.y)) -
        Math.min(...points.map((p) => p.y)),
});

describe("itemOutlines", () => {
    describe("drawing", () => {
        it("finishes a rectangle drag from either corner, centered between them", () => {
            expect(
                ITEM_OUTLINES.rectangle.finalize({
                    startPoint: { x: 100, y: 80 },
                    endPoint: { x: 40, y: 20 },
                    points: [],
                }),
            ).toEqual({
                outlineType: "rectangle",
                centerX: 70,
                centerY: 50,
                widthPixels: 60,
                depthPixels: 60,
            });
        });

        it("cancels a drag too small to be meant", () => {
            expect(
                ITEM_OUTLINES.rectangle.finalize({
                    startPoint: { x: 0, y: 0 },
                    endPoint: { x: 4, y: 40 },
                    points: [],
                }),
            ).toBeNull();
            expect(
                ITEM_OUTLINES.circle.finalize({
                    startPoint: { x: 0, y: 0 },
                    endPoint: { x: 3, y: 3 },
                    points: [],
                }),
            ).toBeNull();
        });

        it("draws a circle from its center, with the drag as radius", () => {
            expect(
                ITEM_OUTLINES.circle.finalize({
                    startPoint: { x: 10, y: 10 },
                    endPoint: { x: 40, y: 50 },
                    points: [],
                }),
            ).toMatchObject({ centerX: 10, centerY: 10, widthPixels: 100 });
        });

        it("stores an arc as end, control point, end", () => {
            const drawn = ITEM_OUTLINES.arc.finalize({
                startPoint: null,
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 50, y: 40 },
                ],
            });
            expect(drawn?.points).toEqual([
                { x: 0, y: 0 },
                { x: 50, y: 40 },
                { x: 100, y: 0 },
            ]);
        });

        it("cancels a flat polygon, which would have no depth", () => {
            expect(
                ITEM_OUTLINES.polygon.finalize({
                    startPoint: null,
                    points: [
                        { x: 0, y: 0 },
                        { x: 50, y: 0 },
                        { x: 100, y: 1 },
                    ],
                }),
            ).toBeNull();
        });

        it("simplifies a freehand stroke", () => {
            const line = Array.from({ length: 20 }, (_, i) => ({
                x: i * 5,
                y: 0,
            }));
            expect(simplifyPath(line, 5)).toEqual([line[0], line[19]]);
        });
    });

    describe("previews", () => {
        it("previews a rectangle drag as its four corners", () => {
            expect(
                ITEM_OUTLINES.rectangle.preview({
                    startPoint: { x: 0, y: 0 },
                    points: [],
                    currentPoint: { x: 20, y: 10 },
                }),
            ).toEqual({
                points: [
                    { x: 0, y: 0 },
                    { x: 20, y: 0 },
                    { x: 20, y: 10 },
                    { x: 0, y: 10 },
                ],
                closed: true,
            });
        });

        it("previews a circle around its center, out to the pointer", () => {
            const preview = ITEM_OUTLINES.circle.preview({
                startPoint: { x: 0, y: 0 },
                points: [],
                currentPoint: { x: 30, y: 40 },
            })!;
            expect(preview.closed).toBe(true);
            for (const p of preview.points)
                expect(Math.hypot(p.x, p.y)).toBeCloseTo(50);
        });

        it("previews a polygon with the pointer as its next corner", () => {
            expect(
                ITEM_OUTLINES.polygon.preview({
                    startPoint: null,
                    points: [{ x: 0, y: 0 }],
                    currentPoint: { x: 5, y: 5 },
                }),
            ).toEqual({
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 5 },
                ],
                closed: true,
            });
        });

        it("previews an arc's chord, then its curve through the pointer", () => {
            const chord = ITEM_OUTLINES.arc.preview({
                startPoint: null,
                points: [{ x: 0, y: 0 }],
                currentPoint: { x: 100, y: 0 },
            })!;
            expect(chord).toEqual({
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                ],
                closed: false,
            });
            const curve = ITEM_OUTLINES.arc.preview({
                startPoint: null,
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                ],
                currentPoint: { x: 50, y: 40 },
            })!;
            expect(curve.points[0]).toEqual({ x: 0, y: 0 });
            expect(curve.points.at(-1)).toEqual({ x: 100, y: 0 });
            // A quadratic's middle sits halfway to its control point
            expect(Math.max(...curve.points.map((p) => p.y))).toBeCloseTo(20);
        });

        it("previews nothing before there's input", () => {
            for (const type of ["rectangle", "circle"] as const)
                expect(
                    ITEM_OUTLINES[type].preview({
                        startPoint: null,
                        points: [],
                        currentPoint: { x: 1, y: 1 },
                    }),
                ).toBeNull();
        });
    });

    describe("stored outlines", () => {
        it("stores points as fractions of the Outline's size, around its center", () => {
            const drawn = ITEM_OUTLINES.polygon.finalize({
                startPoint: null,
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 50, y: 40 },
                ],
            })!;
            expect(normalizeOutlinePoints(drawn)).toEqual(TRIANGLE.points);
        });

        it("builds a stored outline at any size, around its center", () => {
            const shape = outlineShape("polygon", TRIANGLE, 200, 20);
            expect(shape.closed).toBe(true);
            expect(extent(shape.points)).toEqual({ width: 200, depth: 20 });
            expect(shape.points[0]).toEqual({ x: -100, y: -10 });
        });

        it("builds a rectangle and an ellipse at their size", () => {
            expect(outlineShape("rectangle", null, 30, 10).points).toEqual([
                { x: -15, y: -5 },
                { x: 15, y: -5 },
                { x: 15, y: 5 },
                { x: -15, y: 5 },
            ]);
            const ellipse = outlineShape("circle", null, 40, 20);
            expect(extent(ellipse.points).width).toBeCloseTo(40);
            expect(extent(ellipse.points).depth).toBeCloseTo(20);
        });

        it("keeps an open freehand path open", () => {
            expect(
                outlineShape(
                    "freehand",
                    { points: TRIANGLE.points, closed: false },
                    10,
                    10,
                ).closed,
            ).toBe(false);
        });

        it("falls back to a rectangle without a usable custom outline", () => {
            for (const type of ["polygon", "arc", "freehand", "unknown"]) {
                expect(outlineShape(type, null, 30, 10)).toEqual(
                    outlineShape("rectangle", null, 30, 10),
                );
            }
        });

        it("reads stored JSON and refuses anything else", () => {
            const outline = { points: [{ x: 0, y: 0 }], closed: false };
            expect(parseCustomOutline(JSON.stringify(outline))).toEqual(
                outline,
            );
            expect(parseCustomOutline(outline)).toEqual(outline);
            expect(parseCustomOutline("not json")).toBeNull();
            expect(parseCustomOutline({ points: [{ x: "1" }] })).toBeNull();
            expect(parseCustomOutline(null)).toBeNull();
        });
    });

    describe("on the field", () => {
        it("places a shape at its center, turned clockwise on screen", () => {
            const placed = placeOutline(
                outlineShape("rectangle", null, 20, 10),
                { x: 100, y: 50 },
                90,
            );
            // The top-left corner (-10, -5) turns to the top-right of the center
            expect(placed[0].x).toBeCloseTo(105);
            expect(placed[0].y).toBeCloseTo(40);
        });

        it("tells a point inside a turned outline from one outside", () => {
            const placed = placeOutline(
                outlineShape("rectangle", null, 40, 4),
                { x: 0, y: 0 },
                90,
            );
            expect(insideOutline(placed, { x: 0, y: 15 })).toBe(true);
            expect(insideOutline(placed, { x: 15, y: 0 })).toBe(false);
        });
    });
});
