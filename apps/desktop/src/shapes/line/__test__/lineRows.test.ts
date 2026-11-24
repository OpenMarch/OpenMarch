import { describe, expect, it } from "vitest";
import { lineTool, lineToolBase } from "../lineTool";
import { arcTool } from "../../arc/arcTool";
import { isLineParams, type LineParams } from "../lineGeometry";
import { boxesAt, type PlacedRecipe } from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";
import { flipShape } from "../../frame/gestures";
import { pivotOf } from "../../frame/pivot";
import { assignSlots } from "../../assign";

/**
 * Rows of a line (spec #1190): the selected marchers split into rows alongside the drawn line, in
 * its own frame, each row with its own marchers, place along the line and empty spots
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));
const rows = lineTool.rows!;

function drawn(n: number, from: XY, to: XY, kind = lineTool): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}
/** `n` marchers on an 80-unit line across the field from (100, 200), drawn left to right */
const across = (n: number) => drawn(n, { x: 100, y: 200 }, { x: 180, y: 200 });

const paramsOf = (t: ToolState) => t.params as LineParams;
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const rowAt = (t: ToolState, y: number) =>
    spotsOf(t)
        .filter((s) => near(s.y, y))
        .map((s) => s.x)
        .sort((a, b) => a - b);
const counts = (t: ToolState) =>
    rows.view(t.params, t.spots)!.rows.map((r) => r.count);
const names = (t: ToolState) =>
    rows.view(t.params, t.spots)!.rows.map((r) => [r.side, r.away]);

function added(t: ToolState, ...sides: ("far" | "near")[]): ToolState {
    for (const side of sides)
        t = edit(t, rows.add(t.params, t.spots, side, env), ctx);
    return t;
}
const step = (t: ToolState, index: number, by: -1 | 1) =>
    edit(t, rows.count(index).stepper!.by(t.params, t.spots, by, env), ctx);
const closeTo = (xs: readonly number[]) => xs.map((x) => expect.closeTo(x, 6));

describe("rows of a line", () => {
    it("lay out as before with none, the menu showing the drawn line alone", () => {
        const t = across(6);
        expect(paramsOf(t).rows).toBeUndefined();
        expect(spotsOf(t)).toEqual(
            lineToolBase.shape
                .generate(t.params, 6, ctx)
                .map(({ x, y }) => ({ x, y })),
        );
        const view = rows.view(t.params, 6)!;
        expect(view.words).toBe("across");
        expect(view.rows).toEqual([
            {
                index: 0,
                away: 0,
                side: null,
                count: 6,
                spots: [true, true, true, true, true, true],
                shift: 0,
                short: false,
            },
        ]);
    });

    it("split the marchers, a row behind 2 steps back at the drawn line's spacing", () => {
        const t = added(across(16), "far");
        expect(paramsOf(t).rows).toEqual({
            list: [{}, {}],
            drawn: 0,
            apart: 2 * STEP,
        });
        expect(spotsOf(t)).toHaveLength(16);
        const front = rowAt(t, 200);
        expect(front).toHaveLength(8);
        expect(front[0]).toBeCloseTo(100);
        expect(front[7]).toBeCloseTo(180);
        expect(rowAt(t, 180)).toEqual(closeTo(front));
        expect(names(t)).toEqual([
            ["far", 1],
            [null, 0],
        ]);
    });

    it("leave the back row short and centered", () => {
        const t = added(across(16), "far", "far");
        expect(counts(t)).toEqual([4, 6, 6]);
        const front = rowAt(t, 200);
        expect(rowAt(t, 160)).toEqual(closeTo(front.slice(1, 5)));
        expect(rows.view(t.params, 16)!.rows[0]!.short).toBe(true);
    });

    it("move a row half a spot into the gaps, and back to centered", () => {
        let t = added(across(16), "far", "far");
        const back = rows.view(t.params, 16)!.rows[0]!.index;
        t = edit(t, rows.shift(t.params, 16, back, 1), ctx);
        const front = rowAt(t, 200);
        const gap = front[1]! - front[0]!;
        expect(rowAt(t, 160)[0]).toBeCloseTo(front[1]! + gap / 2);
        expect(rows.view(t.params, 16)!.rows[0]!.shift).toBe(1);
        t = edit(t, rows.shift(t.params, 16, back, 0), ctx);
        expect(rowAt(t, 160)).toEqual(closeTo(front.slice(1, 5)));
    });

    it("make the front row the short one in one press, nobody left out", () => {
        let t = added(across(20), "far", "far");
        expect(counts(t)).toEqual([6, 7, 7]);
        // The drawn line's − hands its marcher to the shortest row, behind
        t = step(t, paramsOf(t).rows!.drawn, -1);
        expect(counts(t)).toEqual([7, 7, 6]);
        expect(spotsOf(t)).toHaveLength(20);
    });

    it("take one more from the longest row, and refuse when nobody can give", () => {
        let t = added(across(4), "far");
        t = step(t, 0, 1);
        expect(counts(t)).toEqual([1, 3]);
        expect(rows.count(0).stepper!.by(t.params, 4, 1, env)).toBeNull();
        expect(rows.count(1).stepper!.by(t.params, 4, -1, env)).toBeNull();
        expect(rows.count(1).stepper!.by(t.params, 4, 1, env)).not.toBeNull();
    });

    it("build both ways, the drawn line in the middle", () => {
        const t = added(across(12), "far", "near");
        expect(names(t)).toEqual([
            ["far", 1],
            [null, 0],
            ["near", 1],
        ]);
        expect(counts(t)).toEqual([4, 4, 4]);
        expect(rowAt(t, 180)).toHaveLength(4);
        expect(rowAt(t, 220)).toHaveLength(4);
    });

    it("lean with the slant, each row further right than the one in front", () => {
        let t = added(across(16), "far");
        t = edit(t, rows.slant.type(t.params, 16, "1", env), ctx);
        const front = rowAt(t, 200);
        expect(rowAt(t, 180).map((x) => x - STEP)).toEqual(closeTo(front));
        expect(rows.slant.display(t.params, 16, STEP)).toBe("1");
    });

    it("measure the gap at an end of the block, across then along by the slant", () => {
        let t = added(across(16), "far");
        const front = rowAt(t, 200);
        // No slant: at the right-hand end, pointing out of the block
        expect(rows.gap(t.params, 16)).toEqual({
            from: { x: expect.closeTo(180, 6), y: 200 },
            corner: { x: expect.closeTo(180, 6), y: 180 },
            to: { x: expect.closeTo(180, 6), y: 180 },
            outward: { x: 1, y: 0 },
        });
        // Leaning right: at the left-hand end, the slant running into the block to a spot
        t = edit(t, rows.slant.type(t.params, 16, "1", env), ctx);
        const gap = rows.gap(t.params, 16)!;
        expect(gap.from.x).toBeCloseTo(front[0]!);
        expect(gap.to.x).toBeCloseTo(front[0]! + STEP);
        expect(gap.to.y).toBeCloseTo(180);
        expect(gap.outward.x).toBeCloseTo(-1);
        expect(rowAt(t, 180)[0]).toBeCloseTo(gap.to.x);
        // With only a row in front, it goes forward
        const ahead = added(across(16), "near");
        expect(rows.gap(ahead.params, 16)!.corner.y).toBeCloseTo(220);
        expect(rows.gap(across(16).params, 16)).toBeNull();
    });

    it("change how far apart they are in steps", () => {
        let t = added(across(16), "far");
        t = edit(t, rows.apart.type(t.params, 16, "3", env), ctx);
        expect(rowAt(t, 170)).toHaveLength(8);
        expect(rows.apart.display(t.params, 16, STEP)).toBe("3");
    });

    it("leave a spot empty in place, its marcher going to the shortest row", () => {
        let t = across(30);
        t = edit(t, rows.pick(t.params, 30, 8, env), ctx);
        expect(counts(t)).toEqual([6, 8, 8, 8]);
        const second = rows.view(t.params, 30)!.rows[2]!;
        t = edit(t, rows.toggleSpot(t.params, 30, second.index, 3, env), ctx);
        t = edit(t, rows.toggleSpot(t.params, 30, second.index, 4, env), ctx);
        const view = rows.view(t.params, 30)!;
        expect(view.empty).toBe(2);
        expect(counts(t)).toEqual([8, 8, 6, 8]);
        expect(view.rows[2]!.spots).toEqual([
            true,
            true,
            true,
            false,
            false,
            true,
            true,
            true,
        ]);
        expect(spotsOf(t)).toHaveLength(30);
        expect(lineTool.emptySpots!(t.params, 30)).toHaveLength(2);
        // Pressed again, it's filled from the longest row
        t = edit(t, rows.toggleSpot(t.params, 30, second.index, 3, env), ctx);
        expect(rows.view(t.params, 30)!.empty).toBe(1);
        expect(counts(t)).toEqual([7, 8, 7, 8]);
    });

    it("grow the drawn line alone by a spot to leave one empty", () => {
        let t = across(6);
        t = edit(t, rows.toggleSpot(t.params, 6, 0, 2, env), ctx);
        const view = rows.view(t.params, 6)!;
        expect(view.rows[0]!.count).toBe(6);
        expect(view.rows[0]!.spots).toHaveLength(7);
        expect(spotsOf(t)).toHaveLength(6);
    });

    it("offer box sizes, keeping a row in front in front", () => {
        let t = added(across(12), "near");
        const view = rows.view(t.params, 12)!;
        expect(view.picks.map((x) => [x.perRow, x.rows, x.last])).toEqual([
            [6, 2, 6],
            [4, 3, 4],
            [3, 4, 3],
        ]);
        expect(view.picks[0]!.on).toBe(true);
        t = edit(t, rows.pick(t.params, 12, 4, env), ctx);
        expect(names(t)).toEqual([
            ["far", 1],
            [null, 0],
            ["near", 1],
        ]);
        expect(rows.view(t.params, 12)!.picks[1]!.on).toBe(true);
    });

    it("hand a removed row's marchers to the others, then go back to the drawn line alone", () => {
        let t = added(across(12), "far", "far");
        t = step(t, 0, -1);
        const back = () => rows.view(t.params, 12)!.rows[0]!.index;
        t = edit(t, rows.remove(t.params, 12, back()), ctx);
        expect(counts(t).reduce((a, b) => a + b, 0)).toBe(12);
        t = edit(t, rows.remove(t.params, 12, back()), ctx);
        expect(paramsOf(t).rows).toBeUndefined();
        expect(rowAt(t, 200)).toHaveLength(12);
    });

    it("go away with Remove rows", () => {
        let t = added(across(9), "far", "near");
        t = edit(t, rows.clear(t.params), ctx);
        expect(paramsOf(t).rows).toBeUndefined();
        expect(rowAt(t, 200)).toHaveLength(9);
    });

    it("follow the drawn line when an end is dragged", () => {
        let t = added(across(16), "far");
        const end = lineTool
            .handles(t.params, t.spots)
            .find((h) => h.key === "p1")!.at;
        t = press(t, end, env);
        t = pointerMove(t, { x: 200, y: 200 }, env);
        t = release(t, ctx);
        expect(paramsOf(t).rows?.list).toHaveLength(2);
        expect(rowAt(t, 180)).toEqual(closeTo(rowAt(t, 200)));
        // The end lands on a whole interval (a step): the row behind keeps up
        expect(Math.max(...rowAt(t, 200))).toBeCloseTo(170);
    });

    it("are grabbed by any row", () => {
        const t = added(across(16), "far");
        expect(lineTool.contains(t.params, 16, { x: 140, y: 180 }, env)).toBe(
            true,
        );
        expect(lineTool.contains(t.params, 16, { x: 140, y: 150 }, env)).toBe(
            false,
        );
    });
});

describe("rows of a line not across the field", () => {
    it("are left and right of a line up and down the field, whichever way it was drawn", () => {
        for (const [from, to] of [
            [
                { x: 100, y: 100 },
                { x: 100, y: 180 },
            ],
            [
                { x: 100, y: 180 },
                { x: 100, y: 100 },
            ],
        ] as const) {
            const t = added(drawn(16, from, to), "far");
            expect(rows.view(t.params, 16)!.words).toBe("upDown");
            const xs = [
                ...new Set(spotsOf(t).map((s) => Math.round(s.x))),
            ].sort((a, b) => a - b);
            // Left, as the audience sees it, is toward −x
            expect(xs).toEqual([80, 100]);
        }
    });

    it("stay alongside a slanted line, apart across it", () => {
        const t = added(
            drawn(16, { x: 100, y: 200 }, { x: 160, y: 140 }),
            "far",
        );
        const left = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
        const acrossIt = spotsOf(t).map((s) =>
            Math.round((s.x - 100) * left.x + (s.y - 200) * left.y),
        );
        expect([...new Set(acrossIt)].sort((a, b) => a - b)).toEqual([0, 20]);
    });
});

describe("rows stored", () => {
    it("are read back by this build, and only as an open line's", () => {
        const t = added(across(16), "far", "near");
        const p = paramsOf(t);
        expect(isLineParams(p)).toBe(true);
        expect(isLineParams({ ...p, closed: true })).toBe(false);
        expect(isLineParams({ ...p, rows: { ...p.rows, diagonal: 1 } })).toBe(
            false,
        );
        expect(
            isLineParams({
                ...p,
                rows: { ...p.rows, list: [{ count: 3 }, {}, {}] },
            }),
        ).toBe(false);
        expect(isLineParams({ ...p, rows: { ...p.rows, drawn: 3 } })).toBe(
            false,
        );
    });

    it("are placed with the line and reopen with it", () => {
        let t = added(across(16), "far");
        t = step(t, 0, -1);
        const placement = placementOf(t, ctx)!;
        const stored = paramsOf(t).rows;
        expect(placement.recipe.params).toMatchObject({ rows: stored });
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        expect(placed?.kind).toBe(lineTool);
        expect((placed?.params as LineParams).rows).toEqual(stored);
        expect(placed?.spots).toBe(16);
    });
});

describe("rows of an arc", () => {
    it("repeat the arc's spots across its chord", () => {
        let t = drawn(6, { x: 100, y: 200 }, { x: 180, y: 200 }, arcTool);
        t = edit(t, arcTool.rows!.add(t.params, 6, "far", env), ctx);
        expect(slotsOf(t, ctx)).toHaveLength(6);
        const { rows: _rows, ...plain } = paramsOf(t);
        const own = arcTool.shape
            .generate(plain, 3, ctx)
            .map(({ x, y }) => ({ x, y }));
        const spots = spotsOf(t);
        for (const s of own) {
            expect(spots).toContainEqual({
                x: expect.closeTo(s.x, 6),
                y: expect.closeTo(s.y, 6),
            });
            expect(spots).toContainEqual({
                x: expect.closeTo(s.x, 6),
                y: expect.closeTo(s.y - 2 * STEP, 6),
            });
        }
    });
});

describe("rows kept through other edits", () => {
    const flipped = (t: ToolState, axis: "across" | "deep") =>
        edit(
            t,
            flipShape(
                lineTool,
                t.params,
                t.spots,
                axis,
                pivotOf(t.params),
                env,
            ),
            ctx,
        );
    const slanted = (t: ToolState, steps: string) =>
        edit(t, rows.slant.type(t.params, t.spots, steps, env), ctx);

    it("stay on their side of the field when the line is flipped across, the slant mirrored", () => {
        const t = slanted(added(across(8), "far"), "1");
        // Behind, each row a step further right than the one in front
        expect(rowAt(t, 180)[0]! - rowAt(t, 200)[0]!).toBeCloseTo(STEP);
        const f = flipped(t, "across");
        expect(rowAt(f, 220)).toEqual([]);
        expect(rowAt(f, 180)).toHaveLength(4);
        expect(names(f)).toEqual(names(t));
        // A mirror: the row behind now a step further left
        expect(rowAt(f, 180)[0]! - rowAt(f, 200)[0]!).toBeCloseTo(-STEP);
    });

    it("go to the other side when the line is flipped front to back", () => {
        const f = flipped(added(across(8), "far"), "deep");
        expect(rowAt(f, 180)).toEqual([]);
        expect(rowAt(f, 220)).toHaveLength(4);
    });

    it("keep everyone in their row with Keep order", () => {
        const t = added(across(8), "far");
        const slots = lineTool.shape.generate(t.params, 8, ctx);
        const got = assignSlots({
            kind: lineTool.shape,
            params: t.params,
            slots,
            marchers: slots.map((_, i) => ({
                id: i + 1,
                at: { x: 0, y: 0 },
                drillRank: i,
                along: i,
            })),
            mode: "keep",
            ctx,
        });
        expect(got).toEqual(slots.map((_, i) => i));
    });

    it("order an arc's spots row by row however far it bows", () => {
        let t = drawn(12, { x: 100, y: 200 }, { x: 200, y: 200 }, arcTool);
        t = edit(t, arcTool.rows!.add(t.params, 12, "far", env), ctx);
        t = edit(t, arcTool.rows!.apart.type(t.params, 12, "1", env), ctx);
        const slots = arcTool.shape.generate(t.params, 12, ctx);
        const keys = slots.map((s) =>
            arcTool.shape.orderKey(t.params, s, ctx, 12),
        );
        const sorted = slots
            .map((s, i) => ({ row: s.row!, key: keys[i]! }))
            .sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]!)
            .map((e) => e.row);
        // Every spot of one row before the next: the row changes once
        const changes = sorted.filter((r, i) => i > 0 && r !== sorted[i - 1]);
        expect(changes).toHaveLength(1);
    });

    it("let the drawn line go back on its ends once the other rows are removed", () => {
        let t = added(drawn(4, { x: 100, y: 200 }, { x: 160, y: 200 }), "far");
        const view = rows.view(t.params, t.spots)!;
        const own = view.rows.find((r) => r.side === null)!.index;
        const other = view.rows.find((r) => r.side !== null)!.index;
        t = edit(t, rows.shift(t.params, t.spots, own, 1), ctx);
        t = edit(t, rows.remove(t.params, t.spots, other), ctx);
        expect(paramsOf(t).rows).toBeUndefined();
        expect(rowAt(t, 200)).toEqual(closeTo([100, 120, 140, 160]));
    });

    it("keep the short row where it was through a half turn", () => {
        const t = added(across(11), "far", "far");
        const turned = edit(
            t,
            lineTool.withFrame(t.params, t.spots, {
                ...lineTool.frameOf(t.params, t.spots),
                rotation:
                    lineTool.frameOf(t.params, t.spots).rotation + Math.PI,
            }),
            ctx,
        );
        // The short row was the back one, 2 rows from the drawn line: now 2 rows in front
        expect(rowAt(t, 160)).toHaveLength(3);
        expect(rowAt(turned, 240)).toHaveLength(3);
        expect(rowAt(turned, 200)).toHaveLength(4);
    });

    it("are grabbed on the drawn row where its half spots move it", () => {
        let t = added(across(8), "far");
        const own = rows
            .view(t.params, t.spots)!
            .rows.find((r) => r.side === null)!.index;
        for (let i = 0; i < 4; i++)
            t = edit(t, rows.shift(t.params, t.spots, own, 1), ctx);
        const last = rowAt(t, 200).at(-1)!;
        expect(last).toBeGreaterThan(200);
        expect(lineTool.contains(t.params, 8, { x: last, y: 200 }, env)).toBe(
            true,
        );
    });

    it("are grabbed where a slant moves them", () => {
        const t = slanted(added(across(8), "far"), "4");
        const back = rowAt(t, 180);
        expect(
            lineTool.contains(t.params, 8, { x: back.at(-1)!, y: 180 }, env),
        ).toBe(true);
        expect(
            lineTool.contains(
                t.params,
                8,
                { x: back.at(-1)! + 30, y: 180 },
                env,
            ),
        ).toBe(false);
    });
});
