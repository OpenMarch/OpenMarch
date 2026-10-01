import { describe, expect, it } from "vitest";
import { validateShapeGeometry, type ShapeRow, type XY } from "@openmarch/core";
import {
    CIRCLE_OUTLINE_SEGMENTS,
    dragHandle,
    shapeHandles,
    shapeOutline,
    translateShape,
} from "../timelineShapeCanvas";

/**
 * P7.11: the pure half of drawing and dragging a spec shape on the canvas. What each kind draws,
 * where its handles sit, and the shape a drag of each handle makes.
 */

const LINE: ShapeRow = {
    kind: "line",
    geometry: {
        points: [
            [0, 0],
            [10, 0],
        ],
    },
};
const FREEHAND: ShapeRow = {
    kind: "freehand",
    geometry: {
        points: [
            [0, 0],
            [4, 4],
            [8, 0],
        ],
    },
};
const CIRCLE: ShapeRow = {
    kind: "circle",
    geometry: {
        center: [5, 5],
        radius: 3,
        start_angle: Math.PI / 2,
        clockwise: false,
    },
};
const BOX: ShapeRow = {
    kind: "box",
    geometry: { origin: [1, 2], width: 8, height: 4 },
};
const BLOCK: ShapeRow = {
    kind: "block",
    geometry: { origin: [0, 0], rows: 2, cols: 3, spacing: [2, 5] },
};
const ALL = [LINE, FREEHAND, CIRCLE, BOX, BLOCK];

const close = (a: XY, b: XY) => {
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
};

describe("shapeOutline", () => {
    it("draws a line and a freehand path open, through their points", () => {
        expect(shapeOutline(LINE)).toEqual({
            points: LINE.geometry.points,
            closed: false,
            cells: [],
        });
        expect(shapeOutline(FREEHAND).points).toEqual(FREEHAND.geometry.points);
    });

    it("draws a circle closed, from its start angle, on its radius", () => {
        const outline = shapeOutline(CIRCLE);
        expect(outline.closed).toBe(true);
        expect(outline.points).toHaveLength(CIRCLE_OUTLINE_SEGMENTS);
        close(outline.points[0]!, [5, 8]);
        for (const [x, y] of outline.points)
            expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(3, 9);
        // Counterclockwise in the shape's angle: the second point is past the start angle
        expect(outline.points[1]![0]).toBeLessThan(5);
    });

    it("draws a box's corners in traversal order, closed", () => {
        expect(shapeOutline(BOX)).toEqual({
            points: [
                [1, 2],
                [9, 2],
                [9, 6],
                [1, 6],
            ],
            closed: true,
            cells: [],
        });
    });

    it("draws a block's cells row-major, inside the box around them", () => {
        const outline = shapeOutline(BLOCK);
        expect(outline.cells).toEqual([
            [0, 0],
            [2, 0],
            [4, 0],
            [0, 5],
            [2, 5],
            [4, 5],
        ]);
        expect(outline.points).toEqual([
            [0, 0],
            [4, 0],
            [4, 5],
            [0, 5],
        ]);
    });
});

describe("shapeHandles", () => {
    it("puts a handle on each path point and a move handle in the middle", () => {
        expect(shapeHandles(FREEHAND)).toEqual([
            { id: 0, role: "point", at: [0, 0] },
            { id: 1, role: "point", at: [4, 4] },
            { id: 2, role: "point", at: [8, 0] },
            { id: 3, role: "move", at: [4, 2] },
        ]);
    });

    it("gives a circle a center and a rim at its start angle", () => {
        const [center, rim] = shapeHandles(CIRCLE);
        expect(center).toEqual({ id: 0, role: "move", at: [5, 5] });
        expect(rim!.role).toBe("rim");
        close(rim!.at, [5, 8]);
    });

    it("gives a box its origin, its far corner and a move handle", () => {
        expect(shapeHandles(BOX)).toEqual([
            { id: 0, role: "origin", at: [1, 2] },
            { id: 1, role: "corner", at: [9, 6] },
            { id: 2, role: "move", at: [5, 4] },
        ]);
    });

    it("gives a block a move handle at its origin and a spacing handle on its last cell", () => {
        expect(shapeHandles(BLOCK)).toEqual([
            { id: 0, role: "move", at: [0, 0] },
            { id: 1, role: "spacing", at: [4, 5] },
        ]);
        const single: ShapeRow = {
            kind: "block",
            geometry: { origin: [0, 0], rows: 1, cols: 1, spacing: [2, 2] },
        };
        expect(shapeHandles(single).map((h) => h.role)).toEqual(["move"]);
    });
});

describe("dragHandle", () => {
    it("moves one point of a line or freehand path", () => {
        expect(dragHandle(LINE, 1, [10, 6])).toEqual({
            kind: "line",
            geometry: {
                points: [
                    [0, 0],
                    [10, 6],
                ],
            },
        });
        expect(dragHandle(FREEHAND, 1, [4, -4]).geometry).toEqual({
            points: [
                [0, 0],
                [4, -4],
                [8, 0],
            ],
        });
    });

    it("sets a circle's radius and start angle from its rim, keeping its center", () => {
        const dragged = dragHandle(CIRCLE, 1, [5, 1]);
        expect(dragged).toEqual({
            kind: "circle",
            geometry: {
                center: [5, 5],
                radius: 4,
                start_angle: (3 * Math.PI) / 2,
                clockwise: false,
            },
        });
        // A rim dropped on the center keeps its angle; the zero radius is refused on commit
        const collapsed = dragHandle(CIRCLE, 1, [5, 5]);
        expect(collapsed.geometry).toMatchObject({
            radius: 0,
            start_angle: Math.PI / 2,
        });
        expect(validateShapeGeometry("circle", collapsed.geometry).ok).toBe(
            false,
        );
    });

    it("resizes a box from either corner, keeping the other where it was", () => {
        expect(dragHandle(BOX, 0, [0, 0]).geometry).toEqual({
            origin: [0, 0],
            width: 9,
            height: 6,
        });
        expect(dragHandle(BOX, 1, [11, 3]).geometry).toEqual({
            origin: [1, 2],
            width: 10,
            height: 1,
        });
        // Dragged past the origin: inside out, which the database refuses (E-S1)
        const inverted = dragHandle(BOX, 1, [0, 0]);
        expect(validateShapeGeometry("box", inverted.geometry).ok).toBe(false);
    });

    it("sets a block's spacing from its last cell, keeping a single row's or column's", () => {
        expect(dragHandle(BLOCK, 1, [8, -5]).geometry).toEqual({
            origin: [0, 0],
            rows: 2,
            cols: 3,
            spacing: [4, -5],
        });
        const row: ShapeRow = {
            kind: "block",
            geometry: { origin: [0, 0], rows: 1, cols: 3, spacing: [2, 7] },
        };
        expect(dragHandle(row, 1, [6, 30]).geometry).toEqual({
            origin: [0, 0],
            rows: 1,
            cols: 3,
            spacing: [3, 7],
        });
    });

    it.each(ALL.map((shape) => [shape.kind, shape] as const))(
        "the move handle of a %s translates the whole shape",
        (_, shape) => {
            const handles = shapeHandles(shape);
            const move = handles.find((h) => h.role === "move")!;
            const to: XY = [move.at[0] + 3, move.at[1] - 2];
            expect(dragHandle(shape, move.id, to)).toEqual(
                translateShape(shape, [3, -2]),
            );
            // Every handle moves with it
            const after = shapeHandles(dragHandle(shape, move.id, to));
            after.forEach((h, i) =>
                close(h.at, [handles[i]!.at[0] + 3, handles[i]!.at[1] - 2]),
            );
        },
    );

    it.each(ALL.map((shape) => [shape.kind, shape] as const))(
        "every drag of a %s by a little keeps it valid and its kind",
        (_, shape) => {
            for (const handle of shapeHandles(shape)) {
                const dragged = dragHandle(shape, handle.id, [
                    handle.at[0] + 0.5,
                    handle.at[1] + 0.25,
                ]);
                expect(dragged.kind).toBe(shape.kind);
                expect(
                    validateShapeGeometry(dragged.kind, dragged.geometry).ok,
                ).toBe(true);
            }
        },
    );

    it("an unknown handle changes nothing", () => {
        expect(dragHandle(BOX, 9, [0, 0])).toBe(BOX);
    });

    it("never changes the shape it was given", () => {
        const before = JSON.stringify(ALL);
        for (const shape of ALL)
            for (const handle of shapeHandles(shape))
                dragHandle(shape, handle.id, [1, 1]);
        expect(JSON.stringify(ALL)).toBe(before);
    });
});
