import { describe, expect, it } from "vitest";
import {
    LASSO_CLOSE_DISTANCE,
    lassoCloses,
    marchersInPolygon,
    pointInPolygon,
    rectBetween,
    selectionAfterArea,
} from "../selectionArea";

describe("lassoCloses", () => {
    it("closes within 50 screen px of the start, the same on screen at every zoom", () => {
        for (const zoom of [0.25, 0.5, 1, 2, 4, 8]) {
            const justInside = (LASSO_CLOSE_DISTANCE - 1) / zoom;
            const atLimit = LASSO_CLOSE_DISTANCE / zoom;
            const start = { x: 100, y: 200 };
            expect(
                lassoCloses(start, { x: 100 + justInside, y: 200 }, zoom),
            ).toBe(true);
            expect(lassoCloses(start, { x: 100, y: 200 - atLimit }, zoom)).toBe(
                false,
            );
            // Diagonally: 30, 40 → 50
            expect(
                lassoCloses(
                    start,
                    { x: 100 + 30 / zoom, y: 200 + 39.9 / zoom },
                    zoom,
                ),
            ).toBe(true);
            expect(
                lassoCloses(
                    start,
                    { x: 100 + 30 / zoom, y: 200 + 40 / zoom },
                    zoom,
                ),
            ).toBe(false);
        }
    });

    it("is 50 screen px, not 50 field units", () => {
        const start = { x: 0, y: 0 };
        // Zoomed out, 60 field units is 30 px: it closes
        expect(lassoCloses(start, { x: 60, y: 0 }, 0.5)).toBe(true);
        // Zoomed in, 30 field units is 120 px: it doesn't
        expect(lassoCloses(start, { x: 30, y: 0 }, 4)).toBe(false);
    });
});

describe("pointInPolygon", () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ];

    it("is inside a square, whichever way it was drawn", () => {
        expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
        expect(pointInPolygon({ x: 5, y: 5 }, [...square].reverse())).toBe(
            true,
        );
        expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
        expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
    });

    it("follows a curved, concave shape: the inside of a U, not its gap", () => {
        const u = [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 7 },
            { x: 7, y: 7 },
            { x: 7, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        expect(pointInPolygon({ x: 1, y: 1 }, u)).toBe(true);
        expect(pointInPolygon({ x: 9, y: 1 }, u)).toBe(true);
        expect(pointInPolygon({ x: 5, y: 9 }, u)).toBe(true);
        expect(pointInPolygon({ x: 5, y: 3 }, u)).toBe(false);
    });

    it("closes an open line back to its start", () => {
        // Three sides of the square: the fourth is implied
        expect(pointInPolygon({ x: 5, y: 5 }, square.slice(0, 3))).toBe(true);
        expect(pointInPolygon({ x: 2, y: 8 }, square.slice(0, 3))).toBe(false);
    });

    it("uses the even-odd rule where the line crosses itself", () => {
        // A figure 8 (bow tie): both loops are inside, the crossing's sides aren't
        const figure8 = [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 10, y: 0 },
            { x: 0, y: 10 },
        ];
        expect(pointInPolygon({ x: 2, y: 5 }, figure8)).toBe(true);
        expect(pointInPolygon({ x: 8, y: 5 }, figure8)).toBe(true);
        expect(pointInPolygon({ x: 5, y: 2 }, figure8)).toBe(false);
        expect(pointInPolygon({ x: 5, y: 8 }, figure8)).toBe(false);
        // Around the same square twice: covered twice is outside
        expect(pointInPolygon({ x: 5, y: 5 }, [...square, ...square])).toBe(
            false,
        );
    });

    it("has no inside with under three points", () => {
        expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
        expect(pointInPolygon({ x: 5, y: 0 }, square.slice(0, 2))).toBe(false);
    });
});

describe("marchersInPolygon", () => {
    it("takes marchers by their centers, skipping hidden ones and ones it can't select", () => {
        const marchers = {
            ids: [1, 2, 3, 4],
            positions: [5, 5, 9, 9, 11, 5, 2, 2],
            hidden: [0, 0, 0, 1],
        };
        const square = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        expect(marchersInPolygon(marchers, square, () => true)).toEqual([1, 2]);
        expect(marchersInPolygon(marchers, square, (id) => id !== 1)).toEqual([
            2,
        ]);
    });
});

describe("rectBetween", () => {
    it("is the same rectangle whichever corner the drag started at", () => {
        const rect = { left: 1, top: 2, right: 5, bottom: 8 };
        expect(rectBetween({ x: 1, y: 2 }, { x: 5, y: 8 })).toEqual(rect);
        expect(rectBetween({ x: 5, y: 8 }, { x: 1, y: 2 })).toEqual(rect);
        expect(rectBetween({ x: 1, y: 8 }, { x: 5, y: 2 })).toEqual(rect);
    });
});

describe("selectionAfterArea", () => {
    it("replaces the selection, or with Shift adds what's new to it", () => {
        expect(selectionAfterArea([1, 2], [3], false)).toEqual([3]);
        expect(selectionAfterArea([1, 2], [], false)).toEqual([]);
        expect(selectionAfterArea([1, 2], [2, 3], true)).toEqual([1, 2, 3]);
        const current = [1, 2];
        expect(selectionAfterArea(current, [2], true)).toBe(current);
    });
});
