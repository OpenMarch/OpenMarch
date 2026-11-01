// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../../box/boxTool";
import { rowTool } from "../../__test__/fakeRowKind";
import { savedToolKind } from "../../library/savedShapes";
import { PREVIEW_SPOTS, PREVIEW_VIEW, shapePreview } from "../shapePreview";

const inView = ({ x, y }: { x: number; y: number }) =>
    x >= 0 && x <= PREVIEW_VIEW && y >= 0 && y <= PREVIEW_VIEW;

const size = (points: readonly { x: number; y: number }[]) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...ys) - Math.min(...ys),
    };
};

describe("a shape's preview (#378)", () => {
    it("draws the box from its own spots and outline, inside the picture", () => {
        const preview = shapePreview(boxTool);
        expect(preview.spots).toHaveLength(PREVIEW_SPOTS);
        expect(preview.outline).not.toBeNull();
        expect(preview.outline!.length).toBeGreaterThanOrEqual(4);
        expect(preview.spots.every(inView)).toBe(true);
        expect(preview.outline!.every(inView)).toBe(true);
        // A square box: as wide as it is deep, and filling the picture one way
        const box = size(preview.spots);
        expect(box.width).toBeCloseTo(box.depth);
    });

    it("draws a kind with no icon and no outline of its own as its spots alone", () => {
        const preview = shapePreview(rowTool);
        expect(preview.spots).toHaveLength(PREVIEW_SPOTS);
        expect(preview.outline).toBeNull();
        expect(preview.spots.every(inView)).toBe(true);
        // A row: one line across, centered top to bottom
        const row = size(preview.spots);
        expect(row.depth).toBeCloseTo(0);
        expect(row.width).toBeGreaterThan(PREVIEW_VIEW / 2);
        expect(preview.spots[0].y).toBeCloseTo(PREVIEW_VIEW / 2);
    });

    it("draws a saved shape at its own intervals, so a wide box looks wide", () => {
        const wide = savedToolKind(boxTool, {
            id: "wide",
            name: "Wide box",
            kind: "block",
            kindVersion: 1,
            intervals: { across: 4, deep: 1 },
        });
        const preview = shapePreview(wide);
        expect(preview.spots).toHaveLength(PREVIEW_SPOTS);
        const box = size(preview.spots);
        expect(box.width).toBeGreaterThan(box.depth * 2);
    });

    it("gives the same picture for the same kind, so pickers don't redraw it", () => {
        expect(shapePreview(boxTool)).toBe(shapePreview(boxTool));
    });

    it("keeps the dots clear of the outline, so the line reads as the shape (#382)", () => {
        const wide = savedToolKind(boxTool, {
            id: "wide",
            name: "Wide box",
            kind: "block",
            kindVersion: 1,
            intervals: { across: 4, deep: 1 },
        });
        for (const kind of [boxTool, wide]) {
            const { spots, outline } = shapePreview(kind);
            const xs = outline!.map((p) => p.x);
            const ys = outline!.map((p) => p.y);
            for (const { x, y } of spots) {
                // The box's outline is a rectangle: every dot is well inside it
                expect(x - Math.min(...xs)).toBeGreaterThan(2);
                expect(Math.max(...xs) - x).toBeGreaterThan(2);
                expect(y - Math.min(...ys)).toBeGreaterThan(2);
                expect(Math.max(...ys) - y).toBeGreaterThan(2);
            }
        }
    });
});
