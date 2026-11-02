// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../../box/boxTool";
import { circleTool } from "../../circle/circleTool";
import { rowTool } from "../../__test__/fakeRowKind";
import { curveTool, lineTool } from "../../line/lineTool";
import { savedToolKind } from "../../library/savedShapes";
import {
    PREVIEW_SPOTS,
    PREVIEW_VIEW,
    shapePreview,
    type ShapePreview,
} from "../shapePreview";

const inView = ({ x, y }: { x: number; y: number }) =>
    x >= 0 && x <= PREVIEW_VIEW && y >= 0 && y <= PREVIEW_VIEW;

/** Distance from `p` to the segment from `a` to `b` */
const distToSegment = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
};

const openOutlineMatchesDots = ({ spots, outline }: ShapePreview) => {
    const xs = spots.map((s) => s.x);
    const ys = spots.map((s) => s.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const tol = 0.6;
    for (const p of outline!) {
        expect(p.x).toBeGreaterThanOrEqual(minX - tol);
        expect(p.x).toBeLessThanOrEqual(maxX + tol);
        expect(p.y).toBeGreaterThanOrEqual(minY - tol);
        expect(p.y).toBeLessThanOrEqual(maxY + tol);
    }
    const first = outline![0]!;
    const last = outline![outline!.length - 1]!;
    expect(first.x).toBeCloseTo(spots[0]!.x, 1);
    expect(first.y).toBeCloseTo(spots[0]!.y, 1);
    expect(last.x).toBeCloseTo(spots[spots.length - 1]!.x, 1);
    expect(last.y).toBeCloseTo(spots[spots.length - 1]!.y, 1);
};

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

    it("draws the line as a zigzag from the top down (owner, 2026-11-01)", () => {
        const preview = shapePreview(lineTool);
        expect(preview.spots).toHaveLength(PREVIEW_SPOTS);
        expect(preview.openOutline).toBe(true);
        expect(preview.spots.every(inView)).toBe(true);
        expect(preview.outline!.every(inView)).toBe(true);
        // Its corners: the outline turns back left and right going down the picture
        const outline = preview.outline!;
        expect(outline[0]!.y).toBeLessThan(outline[outline.length - 1]!.y);
        const xs = outline.map((p) => p.x);
        const turns = xs.filter(
            (x, i) =>
                i > 0 &&
                i < xs.length - 1 &&
                (x - xs[i - 1]!) * (xs[i + 1]! - x) < 0,
        );
        expect(turns).toHaveLength(2);
    });

    it("draws the curve as a round wave from the top down", () => {
        const curve = shapePreview(curveTool);
        const line = shapePreview(lineTool);
        expect(curve.openOutline).toBe(true);
        expect(curve.outline!.every(inView)).toBe(true);
        // Smooth: drawn through many more points than the zigzag's corners
        expect(curve.outline!.length).toBeGreaterThan(line.outline!.length * 2);
        // The same run from the top down, its turns rounded
        const o = curve.outline!;
        expect(o[0]!.y).toBeLessThan(o[o.length - 1]!.y);
    });

    it("keeps open outlines on the dots, without the closed-shape stand-off", () => {
        openOutlineMatchesDots(shapePreview(lineTool));
        openOutlineMatchesDots(shapePreview(curveTool));
    });

    it("still stands closed previews off their dots (#382)", () => {
        const closed = [shapePreview(boxTool), shapePreview(circleTool)];
        for (const preview of closed) {
            expect(preview.openOutline).toBeUndefined();
            const xs = preview.outline!.map((p) => p.x);
            const ys = preview.outline!.map((p) => p.y);
            for (const { x, y } of preview.spots) {
                expect(x - Math.min(...xs)).toBeGreaterThan(2);
                expect(Math.max(...xs) - x).toBeGreaterThan(2);
                expect(y - Math.min(...ys)).toBeGreaterThan(2);
                expect(Math.max(...ys) - y).toBeGreaterThan(2);
            }
        }
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
