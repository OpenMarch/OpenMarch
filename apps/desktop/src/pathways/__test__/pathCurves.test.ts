import { describe, expect, it } from "vitest";
import { smoothHandles, type XY as CoreXY } from "@openmarch/core";
import { catmullRomControls } from "@/shapes/geometry/catmullRom";
import { lineSegments, type LineParams } from "@/shapes/line/lineGeometry";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import {
    PATH_MENU,
    curveOf,
    dragNewPoint,
    dragPathHandle,
    legMidpoint,
    legStraight,
    pathHandles,
    pathOutline,
    setLegCurved,
    splitLeg,
    tangentHandle,
    toggleSmooth,
    type PathShape,
} from "../pathEdit";

/**
 * Pathways step 2 (fork #644, spec v0.9 R-14 and I.5): a path's curves are the Line's. The same
 * centripetal Catmull–Rom curve (QA-RT-14), the same handles (a midpoint on the curve, the
 * selected smooth point's tangent bar), the same roundness drag in tenths (Shift fine), a
 * double-click swap, the Line's rule for a point added on a leg, and its point and leg menus.
 */

const STEP = 10;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: false,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
    zoom: 1,
};
const fine: ToolEnv = { ...env, snap: false, fine: true };

const curved: PathShape = {
    from: { x: 0, y: 0 },
    to: { x: 80, y: 0 },
    points: [
        { id: "a", at: { x: 20, y: 30 }, tension: 1 },
        { id: "b", at: { x: 50, y: -20 } },
        { id: "c", at: { x: 65, y: 25 }, tension: 1.5 },
    ],
};

const near = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    e = 1e-9,
) => Math.hypot(p.x - q.x, p.y - q.y) < e;

describe("a path's curve is the Line's", () => {
    it("QA-RT-14: at roundness 1 a smooth point's handles are the Line's Catmull–Rom controls", () => {
        const pts: [CoreXY, CoreXY, CoreXY, CoreXY][] = [
            [
                [0, 0],
                [10, 20],
                [40, 5],
                [70, 30],
            ],
            [
                [-300000, 2],
                [5e5, 9e5],
                [9e5, -4e5],
                [1e6, 1e6],
            ],
            [
                [1, 1],
                [1.5, 7],
                [9, 2],
                [9.5, 2.5],
            ],
        ];
        for (const [p0, p1, p2, p3] of pts) {
            const scale = Math.max(1, ...[p0, p1, p2, p3].flat().map(Math.abs));
            const tol = 1e-12 * scale;
            const xy = ([x, y]: CoreXY) => ({ x, y });
            const line = catmullRomControls(xy(p0), xy(p1), xy(p2), xy(p3));
            // The Line's span p1 → p2: c1 is p1's out handle, c2 is p2's in handle
            const out = smoothHandles(p0, p1, p2, 1).out;
            const back = smoothHandles(p1, p2, p3, 1).in;
            expect(Math.abs(out[0] - line.c1.x)).toBeLessThan(tol);
            expect(Math.abs(out[1] - line.c1.y)).toBeLessThan(tol);
            expect(Math.abs(back[0] - line.c2.x)).toBeLessThan(tol);
            expect(Math.abs(back[1] - line.c2.y)).toBeLessThan(tol);
        }
    });

    it("draws the curve a Line with the same points would, its ends as a Curve's (roundness 1)", () => {
        const line: LineParams = {
            points: [
                { x: 0, y: 0, tension: 1 },
                { x: 20, y: 30, tension: 1 },
                { x: 50, y: -20, tension: 0 },
                { x: 65, y: 25, tension: 1.5 },
                { x: 80, y: 0, tension: 1 },
            ],
            spacing: { mode: "fit" },
        };
        const segments = lineSegments(line);
        const path = curveOf(curved);
        segments.forEach((segment, j) => {
            const piece = path.pieces[j]!;
            if (segment.type === "line") {
                expect(piece.kind).toBe("line");
                return;
            }
            if (segment.type !== "cubic" || piece.kind !== "cubic")
                throw new Error(`piece ${j} should be a curve`);
            expect(
                near(segment.c1, { x: piece.c1[0], y: piece.c1[1] }, 1e-9),
            ).toBe(true);
            expect(
                near(segment.c2, { x: piece.c2[0], y: piece.c2[1] }, 1e-9),
            ).toBe(true);
        });
    });

    it("its line follows the curve, through every point; with corners only it is just the points", () => {
        const outline = pathOutline(curved);
        expect(outline.length).toBeGreaterThan(50);
        for (const p of [
            curved.from,
            ...curved.points.map((c) => c.at),
            curved.to,
        ])
            expect(outline.some((q) => near(p, q))).toBe(true);
        const corners: PathShape = {
            ...curved,
            points: curved.points.map(({ id, at }) => ({ id, at })),
        };
        expect(pathOutline(corners)).toHaveLength(5);
    });
});

describe("handles on a curved path", () => {
    it("a leg's midpoint sits halfway along it, on its curve", () => {
        const path = curveOf(curved);
        const m = legMidpoint(curved, 0);
        const outline = pathOutline(curved);
        // On the drawn curve, not the chord's middle
        expect(outline.some((q) => near(q, m, 0.05))).toBe(true);
        expect(near(m, { x: 10, y: 15 }, 0.1)).toBe(false);
        expect(path.pieces[0]!.kind).toBe("cubic");
    });

    it("only the selected smooth point shows its tangent bar, whose ends are its handles", () => {
        expect(pathHandles(curved).some((h) => h.bar)).toBe(false);
        expect(pathHandles(curved, "p1").some((h) => h.bar)).toBe(false);
        const bar = pathHandles(curved, "p0").filter((h) => h.bar);
        expect(bar.map((h) => h.key).sort()).toEqual(["t0", "tb0"]);
        expect(bar.every((h) => near(h.bar!, curved.points[0]!.at))).toBe(true);
        expect(
            near(
                bar.find((h) => h.key === "t0")!.at,
                tangentHandle(curved, 0, 1)!,
            ),
        ).toBe(true);
    });

    it("a tangent bar's end drags the roundness in tenths, any amount with fine, a corner behind the point", () => {
        const q = curved.points[0]!.at;
        const h = tangentHandle(curved, 0, 1)!;
        const full = { x: q.x + (h.x - q.x) / 1, y: q.y + (h.y - q.y) / 1 };
        const at = (t: number) => ({
            x: q.x + (full.x - q.x) * t,
            y: q.y + (full.y - q.y) * t,
        });
        expect(
            dragPathHandle(curved, "t0", at(1.43), env).points[0]!.tension,
        ).toBe(1.4);
        expect(
            dragPathHandle(curved, "t0", at(1.43), fine).points[0]!.tension,
        ).toBeCloseTo(1.43, 9);
        expect(
            dragPathHandle(curved, "t0", at(5), env).points[0]!.tension,
        ).toBe(2);
        const behind = dragPathHandle(curved, "t0", at(-0.5), env).points[0]!;
        expect(behind.tension).toBeUndefined();
        expect(behind.id).toBe("a");
    });

    it("a double-click swaps corner and smooth", () => {
        expect(toggleSmooth(curved, 0)[0]!.tension).toBeUndefined();
        expect(toggleSmooth(curved, 1)[1]!.tension).toBe(1);
    });
});

describe("the pen's press-and-drag", () => {
    const placed: PathShape = {
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        points: [{ at: { x: 50, y: 40 } }],
    };
    it("makes the point just placed smooth, rounder the farther it's dragged, whichever way", () => {
        const small = dragNewPoint(placed, { x: 58, y: 40 }, env)[0]!.tension!;
        const big = dragNewPoint(placed, { x: 75, y: 40 }, env)[0]!.tension!;
        const back = dragNewPoint(placed, { x: 25, y: 40 }, env)[0]!.tension!;
        expect(small).toBeGreaterThan(0);
        expect(big).toBeGreaterThan(small);
        expect(back).toBe(big);
        expect(Math.round(big * 10)).toBe(big * 10);
    });
    it("is a corner again back on the point", () => {
        expect(
            dragNewPoint(placed, { x: 50, y: 40 }, env)[0]!.tension,
        ).toBeUndefined();
    });
});

describe("adding and straightening", () => {
    it("a point added on a leg: a corner between corners, else as smooth as the smoother end", () => {
        expect(splitLeg(curved, 0).points[0]!.tension).toBe(1); // A and a smooth point
        expect(splitLeg(curved, 2).points[2]!.tension).toBe(1.5); // a corner and 1.5
        const corners: PathShape = {
            ...curved,
            points: curved.points.map(({ id, at }) => ({ id, at })),
        };
        expect(splitLeg(corners, 1).points[1]!.tension).toBeUndefined();
    });

    it("Straight makes a leg's points corners; Curved makes them smooth; no curve between the ends alone", () => {
        expect(legStraight(curved, 1)).toBe(false);
        const straight = setLegCurved(curved, 1, false).points;
        expect(straight[0]!.tension).toBeUndefined();
        expect(straight[1]!.tension).toBeUndefined();
        expect(legStraight({ ...curved, points: straight }, 1)).toBe(true);
        const back = setLegCurved(
            { ...curved, points: straight },
            1,
            true,
        ).points;
        expect(back[0]!.tension).toBe(1);
        expect(back[1]!.tension).toBe(1);
        // Kept roundness stays
        expect(setLegCurved(curved, 3, true).points[2]!.tension).toBe(1.5);
        const bare: PathShape = {
            from: { x: 0, y: 0 },
            to: { x: 9, y: 9 },
            points: [],
        };
        const curvedItem = PATH_MENU.sections(bare, 1, "m0")!
            .flatMap((s) => s.items)
            .find((i) => i.value === "curved")!;
        expect(curvedItem.disabled).toBeTruthy();
    });
});
