// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assignSlots } from "../assign";
import { dist, polar, xy } from "../geometry/vec";
import { blockKind, type BlockParams } from "../kinds/block";
import { circleKind, type CircleParams } from "../kinds/circle";
import { curveKind, type CurveParams } from "../kinds/curve";
import type { ShapeContext, XY } from "../types";

const STEP = 10;
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const close = (a: number, b: number, eps = 1e-6) =>
    expect(Math.abs(a - b)).toBeLessThan(eps);
const closeXY = (a: XY, b: XY, eps = 1e-6) => {
    close(a.x, b.x, eps);
    close(a.y, b.y, eps);
};
const noConstrain = { constrain: false };

const ring = (n: number, center: XY, r: number): XY[] =>
    Array.from({ length: n }, (_, i) =>
        polar(center, r, (2 * Math.PI * i) / n + 0.3),
    );

describe("circle kind", () => {
    const base: CircleParams = {
        center: xy(100, 50),
        r: 40,
        start: Math.PI / 2,
        spacing: { mode: "fit" },
    };

    it("fits marchers on a ring, starting at the first one", () => {
        const current = ring(8, xy(30, -20), 50);
        const p = circleKind.fit({ current }, ctx);
        closeXY(p.center, xy(30, -20), 1e-6);
        close(p.r, 50);
        closeXY(polar(p.center, p.r, p.start), current[0]!);
        expect(circleKind.generate(p, 8, ctx)).toHaveLength(8);
    });

    it("falls back to the centroid for too few or straight points", () => {
        const two = circleKind.fit({ current: [xy(0, 0), xy(4, 0)] }, ctx);
        closeXY(two.center, xy(2, 0));
        close(two.r, 2 * STEP);
        close(two.start, Math.PI / 2);
        const row = [0, 1, 2, 3, 4].map((i) => xy(i * 3 * STEP, 0));
        const straight = circleKind.fit({ current: row }, ctx);
        closeXY(straight.center, xy(6 * STEP, 0));
        // Mean distance to the centroid: (60 + 30 + 0 + 30 + 60) / 5
        close(straight.r, 36);
    });

    it("spreads fit slots evenly around, all at the radius", () => {
        const n = 7;
        const slots = circleKind.generate(base, n, ctx);
        expect(slots).toHaveLength(n);
        closeXY(slots[0]!, polar(base.center, base.r, base.start));
        const chord = dist(slots[0]!, slots[1]!);
        for (let i = 0; i < n; i++) {
            close(dist(slots[i]!, base.center), base.r);
            close(dist(slots[i]!, slots[(i + 1) % n]!), chord);
        }
        expect(circleKind.generate(base, n, ctx)).toEqual(slots);
    });

    it("lays 2-step intervals around from the start", () => {
        const p: CircleParams = {
            ...base,
            spacing: {
                mode: "interval",
                runs: [{ steps: 2, count: 0 }],
                anchor: "start",
            },
        };
        const slots = circleKind.generate(p, 5, ctx);
        expect(slots).toHaveLength(5);
        slots.forEach((slot, i) => {
            close(dist(slot, base.center), base.r);
            if (i > 0) close(dist(slot, slots[i - 1]!), 2 * STEP, 1e-6);
        });
        expect(
            circleKind.validate!(p, slots, ctx).filter(
                (i) => i.level !== "info",
            ),
        ).toEqual([]);
        // 2 steps x 19 gaps is longer than the 2π·40 circumference: they lap it
        const lapped = circleKind.generate(p, 20, ctx);
        expect(
            circleKind.validate!(p, lapped, ctx).some(
                (i) => i.level === "warning",
            ),
        ).toBe(true);
    });

    it("drags the radius handle to set the radius and start", () => {
        const to = xy(base.center.x + 30, base.center.y);
        const p = circleKind.drag(base, "radius", to, noConstrain, 6, ctx);
        close(p.r, 30);
        close(p.start, 0);
        const snapped = circleKind.drag(
            base,
            "radius",
            xy(base.center.x + 30, base.center.y + 2),
            { constrain: true },
            6,
            ctx,
        );
        close(snapped.start, 0);
        const moved = circleKind.drag(
            base,
            "move",
            xy(0, 0),
            noConstrain,
            6,
            ctx,
        );
        closeXY(moved.center, xy(0, 0));
        expect(moved.r).toBe(base.r);
    });

    it("refuses a zero radius", () => {
        const p = { ...base, r: 0 };
        expect(
            circleKind.validate!(p, circleKind.generate(p, 3, ctx), ctx)[0]
                ?.level,
        ).toBe("error");
    });
});

describe("block kind", () => {
    const base: BlockParams = {
        center: xy(0, 0),
        rotation: 0,
        files: 4,
        across: 20,
        deep: 30,
        pattern: "grid",
        shortRank: "start",
    };

    it("fits a square-ish block, and a straight row as two ranks", () => {
        const current = Array.from({ length: 9 }, (_, i) =>
            xy((i % 3) * 20 + 0.1 * i, Math.floor(i / 3) * 15),
        );
        const p = blockKind.fit({ current }, ctx);
        expect(p.files).toBe(3);
        expect(p.rotation).toBe(0);
        expect(blockKind.generate(p, 9, ctx)).toHaveLength(9);
        const row = [0, 1, 2, 3, 4].map((i) => xy(i * 20, 5));
        const rowFit = blockKind.fit({ current: row }, ctx);
        expect(rowFit.files).toBe(3);
        expect(rowFit.rotation).toBe(0);
        const column = [0, 1, 2, 3, 4].map((i) => xy(5, i * 20));
        const columnFit = blockKind.fit({ current: column }, ctx);
        close(Math.abs(columnFit.rotation), Math.PI / 2);
        expect(columnFit.files).toBe(3);
    });

    it("lays ranks back to front, files left to right", () => {
        const slots = blockKind.generate(base, 10, ctx);
        expect(slots).toHaveLength(10);
        expect(new Set(slots.map((s) => s.row))).toEqual(new Set([0, 1, 2]));
        // Centered: files at -30,-10,10,30; ranks at -30,0,30
        closeXY(slots[0]!, xy(-30, -30));
        closeXY(slots[3]!, xy(30, -30));
        closeXY(slots[4]!, xy(-30, 0));
        expect(slots[4]).toMatchObject({ row: 1, col: 0 });
        // Short rank of 2, flush left
        closeXY(slots[8]!, xy(-30, 30));
        closeXY(slots[9]!, xy(-10, 30));
        expect(blockKind.generate(base, 10, ctx)).toEqual(slots);
        expect(blockKind.readouts!(base, 10, ctx)).toEqual([
            { label: "Ranks × files", value: "3 × 4" },
            { label: "Interval", value: "2 × 3 steps" },
        ]);
    });

    it("aligns the short rank center or right", () => {
        const centered = blockKind.generate(
            { ...base, shortRank: "center" },
            10,
            ctx,
        );
        closeXY(centered[8]!, xy(-10, 30));
        closeXY(centered[9]!, xy(10, 30));
        const right = blockKind.generate(
            { ...base, shortRank: "end" },
            10,
            ctx,
        );
        closeXY(right[8]!, xy(10, 30));
        closeXY(right[9]!, xy(30, 30));
        expect(right[9]).toMatchObject({ row: 2, col: 3 });
    });

    it("staggers every other rank by half the across interval, staying centered", () => {
        const grid = blockKind.generate(base, 12, ctx);
        const offset = blockKind.generate(
            { ...base, pattern: "offset" },
            12,
            ctx,
        );
        offset.forEach((slot, i) => {
            const shift = ((slot.row! % 2 === 1 ? 1 : -1) * base.across) / 4;
            closeXY(slot, xy(grid[i]!.x + shift, grid[i]!.y));
        });
        // The block's outline stays centered where the grid's was
        const middleX = (slots: typeof grid) => {
            const xs = slots.map((slot) => slot.x);
            return (Math.min(...xs) + Math.max(...xs)) / 2;
        };
        close(middleX(offset), middleX(grid));
    });

    it("rotates by 90° so local x runs along field y", () => {
        const turned = blockKind.generate(
            { ...base, rotation: Math.PI / 2 },
            4,
            ctx,
        );
        const flat = blockKind.generate(base, 4, ctx);
        turned.forEach((slot, i) => {
            close(slot.y, flat[i]!.x);
            close(slot.x, -flat[i]!.y);
        });
    });

    it("drags the across, deep and rotate handles", () => {
        const handles = blockKind.handles(base, 12, ctx);
        const across = handles.find((h) => h.key === "across")!;
        // Size handles stand 1.5 steps outside the edge marchers
        const out = 1.5 * ctx.stepPx;
        closeXY(across.at, xy(30 + out, 0));
        const wider = blockKind.drag(
            base,
            "across",
            xy(60 + out, 7),
            noConstrain,
            12,
            ctx,
        );
        close(wider.across, 40);
        const deeper = blockKind.drag(
            base,
            "deep",
            xy(3, -45 - out),
            noConstrain,
            12,
            ctx,
        );
        close(deeper.deep, 45);
        const rotate = handles.find((h) => h.key === "rotate")!;
        expect(rotate.at.y).toBeLessThan(-30);
        // The rotate handle where it already is keeps the rotation
        close(
            blockKind.drag(base, "rotate", rotate.at, noConstrain, 12, ctx)
                .rotation,
            0,
        );
        // Dragged to the block's right: a quarter turn
        close(
            blockKind.drag(base, "rotate", xy(50, 0), noConstrain, 12, ctx)
                .rotation,
            Math.PI / 2,
        );
        close(
            blockKind.drag(
                base,
                "rotate",
                xy(50, -12),
                { constrain: true },
                12,
                ctx,
            ).rotation,
            (5 * Math.PI) / 12,
        );
    });

    it("orders points by rank, then file", () => {
        const n = 8;
        const slots = blockKind.generate(base, n, ctx);
        const keys = slots.map((s) => blockKind.orderKey(base, s, ctx, n));
        expect(keys.map((k) => k[0])).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
        // A rough second rank still sorts after the whole first one
        const marchers = [
            xy(29, 14),
            xy(-31, 16),
            xy(-28, -14),
            xy(9, -18),
            xy(-11, 13),
            xy(32, -16),
            xy(11, 17),
            xy(-9, -12),
        ].map((at, id) => ({ id, at, drillRank: id }));
        const assignment = assignSlots({
            kind: blockKind,
            params: base,
            slots,
            marchers,
            mode: "keep",
            ctx,
        });
        expect(assignment).toEqual([7, 4, 0, 2, 5, 3, 6, 1]);
    });

    it("refuses fewer than 1 file", () => {
        const p = { ...base, files: 0 };
        expect(blockKind.validate!(p, [], ctx)[0]?.level).toBe("error");
    });
});

describe("curve kind", () => {
    const base: CurveParams = {
        points: [xy(0, 0), xy(50, 40), xy(100, 0)],
        spacing: { mode: "fit" },
    };

    it("fits control points from the marchers along their axis", () => {
        const current = [6, 0, 3, 1, 5, 2, 4].map((i) =>
            xy(i * 20, Math.sin(i) * 10),
        );
        const p = curveKind.fit({ current }, ctx);
        expect(p.points).toHaveLength(2);
        closeXY(p.points[0]!, current[1]!);
        closeXY(p.points[1]!, current[0]!);
        const many = Array.from({ length: 30 }, (_, i) => xy(i * 10, 0));
        expect(curveKind.fit({ current: many }, ctx).points).toHaveLength(6);
        expect(curveKind.generate(p, 7, ctx)).toHaveLength(7);
    });

    it("starts and ends on its end points, deterministically", () => {
        const slots = curveKind.generate(base, 9, ctx);
        expect(slots).toHaveLength(9);
        closeXY(slots[0]!, base.points[0]!);
        closeXY(slots[8]!, base.points[2]!, 1e-3);
        expect(curveKind.generate(base, 9, ctx)).toEqual(slots);
        // It passes through its middle control point
        const minD = Math.min(
            ...curveKind
                .outline(base, 9, ctx)[0]!
                .map((q) => dist(q, base.points[1]!)),
        );
        expect(minD).toBeLessThan(STEP / 2);
    });

    it("stays on the line through collinear points", () => {
        const p: CurveParams = {
            points: [xy(0, 10), xy(30, 10), xy(100, 10)],
            spacing: { mode: "fit" },
        };
        for (const slot of curveKind.generate(p, 11, ctx)) {
            close(slot.y, 10);
            expect(slot.x).toBeGreaterThanOrEqual(-1e-6);
            expect(slot.x).toBeLessThanOrEqual(100 + 1e-6);
        }
    });

    it("drags one control point and keeps the others", () => {
        const handles = curveKind.handles(base, 5, ctx);
        expect(handles.map((h) => h.key)).toEqual(["p0", "p1", "p2", "move"]);
        const p = curveKind.drag(base, "p1", xy(50, 80), noConstrain, 5, ctx);
        expect(p.points).toEqual([xy(0, 0), xy(50, 80), xy(100, 0)]);
        const moved = curveKind.drag(
            base,
            "move",
            xy(handles[3]!.at.x + 10, handles[3]!.at.y),
            noConstrain,
            5,
            ctx,
        );
        moved.points.forEach((q, i) =>
            closeXY(q, xy(base.points[i]!.x + 10, base.points[i]!.y)),
        );
    });

    it("drags a point with constrain to 45° steps from its neighbor", () => {
        // The middle point leans on the first; the first, on the second
        const leg = (from: XY, to: XY) =>
            Math.atan2(to.y - from.y, to.x - from.x);
        const to = xy(40, 13);
        const free = curveKind.drag(base, "p1", to, noConstrain, 5, ctx);
        expect(leg(free.points[0]!, free.points[1]!)).not.toBeCloseTo(0, 3);
        const snapped = curveKind.drag(
            base,
            "p1",
            to,
            { constrain: true },
            5,
            ctx,
        );
        close(leg(snapped.points[0]!, snapped.points[1]!), 0);
        closeXY(snapped.points[2]!, base.points[2]!);
        const first = curveKind.drag(
            base,
            "p0",
            xy(20, 12),
            { constrain: true },
            5,
            ctx,
        );
        close(leg(base.points[1]!, first.points[0]!), (-3 * Math.PI) / 4);
    });

    it("orders by distance along the curve", () => {
        const a = curveKind.orderKey(base, xy(10, 5), ctx, 3)[0]!;
        const b = curveKind.orderKey(base, xy(90, 5), ctx, 3)[0]!;
        expect(a).toBeLessThan(b);
    });

    it("refuses fewer than 2 different points", () => {
        const p = { ...base, points: [xy(1, 1), xy(1, 1)] };
        expect(curveKind.validate!(p, [], ctx)[0]?.level).toBe("error");
        expect(curveKind.validate!(base, [], ctx)).toEqual([]);
    });
});
