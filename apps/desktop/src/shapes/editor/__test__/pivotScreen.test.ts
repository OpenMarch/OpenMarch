// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    PIVOT_KEYS,
    pivotPoint,
    type PivotKey,
    type ShapeFrame,
} from "../../frame/frame";
import { quarterTurns, screenCellOf, shapeKeyAt } from "../pivotScreen";

/** The pivot grid in screen terms (#437): cells mapped through the shape's turn */

const DEG = Math.PI / 180;
const frame = (degrees: number, flipX = false, flipY = false): ShapeFrame => ({
    center: { x: 100, y: 50 },
    halfWidth: 30,
    halfDepth: 20,
    rotation: degrees * DEG,
    flipX,
    flipY,
});

/** The screen cell a field point is in, around the frame's center */
const cellOfPoint = (f: ShapeFrame, key: PivotKey): string => {
    const p = pivotPoint(f, key);
    const sign = (v: number) => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));
    const x = sign(p.x - f.center.x);
    const y = sign(p.y - f.center.y);
    return `${["n", "", "s"][y + 1]}${["w", "", "e"][x + 1]}` || "c";
};

describe("the pivot grid in screen terms", () => {
    for (const degrees of [0, 90, 180, 270])
        it(`maps every cell to the point on screen there, turned ${degrees}°`, () => {
            const f = frame(degrees);
            for (const key of PIVOT_KEYS) {
                expect(screenCellOf(f.rotation, key)).toBe(cellOfPoint(f, key));
                expect(
                    shapeKeyAt(f.rotation, screenCellOf(f.rotation, key)),
                ).toBe(key);
            }
        });

    it("after a half turn, the top-left cell is the shape's front right", () => {
        expect(shapeKeyAt(180 * DEG, "nw")).toBe("se");
        expect(screenCellOf(180 * DEG, "se")).toBe("nw");
    });

    it("a quarter turn clockwise puts the shape's back left at the top right", () => {
        expect(screenCellOf(90 * DEG, "nw")).toBe("ne");
        expect(shapeKeyAt(90 * DEG, "ne")).toBe("nw");
    });

    it("snaps a turn to the nearest quarter", () => {
        expect(quarterTurns(40 * DEG)).toBe(0);
        expect(quarterTurns(50 * DEG)).toBe(1);
        expect(quarterTurns(-90 * DEG)).toBe(3);
        expect(quarterTurns(400 * DEG)).toBe(0);
        expect(screenCellOf(170 * DEG, "nw")).toBe("se");
    });

    it("needs no mapping for a flip: the frame's points stay where the turn puts them", () => {
        for (const [fx, fy] of [
            [true, false],
            [false, true],
            [true, true],
        ] as const)
            for (const degrees of [0, 90, 180, 270]) {
                const f = frame(degrees, fx, fy);
                for (const key of PIVOT_KEYS)
                    expect(screenCellOf(f.rotation, key)).toBe(
                        cellOfPoint(f, key),
                    );
            }
    });
});
