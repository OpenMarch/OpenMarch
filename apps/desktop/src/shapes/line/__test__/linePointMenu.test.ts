import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import {
    cornerOffInterval,
    holdsMarcher,
    isLineParams,
    lineSegments,
    lineSpots,
    openAt,
    openLine,
    setPointMarcher,
    SMOOTH,
    withInterval,
    type LineParams,
    type LinePoint,
} from "../lineGeometry";
import { openLive, pickLive } from "../../placed/liveBox";
import { filesDistribution } from "../../distribute/distribution";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv, ToolMenuItem } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pickMenu,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * A Line's point and segment menus, and the per-point marcher override (#569): a point can hold a
 * marcher whatever the corners switch says, or keep the spacing even through it, in Fit, Keep
 * interval, Measured and closed lines. The menus are driven through the shape session and a placed
 * Line with the real Line kind.
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

const corner = (x: number, y: number, more?: Partial<LinePoint>) => ({
    x,
    y,
    tension: 0,
    ...more,
});
/** An L, 40 along then 40 down: its corner is point 1 */
const L = (more: Partial<LineParams> = {}): LineParams => ({
    points: [corner(0, 0), corner(40, 0), corner(40, 40)],
    spacing: { mode: "fit" },
    ...more,
});
/** A closed square, 40 a side, from its top-left corner */
const square = (more: Partial<LineParams> = {}): LineParams => ({
    points: [corner(0, 0), corner(40, 0), corner(40, 40), corner(0, 40)],
    closed: true,
    spacing: { mode: "fit" },
    ...more,
});
/** `p` with point `index` holding a marcher always (true) or kept even through (false) */
const marcherAt = (p: LineParams, index: number, marcher: boolean) =>
    setPointMarcher(p, 8, index, marcher, {});

const spots = (p: LineParams, n: number) =>
    lineSpots(p, n).map(({ x, y }) => ({ x, y }));
const near = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const hasSpotOn = (p: LineParams, n: number, at: XY) =>
    spots(p, n).some((s) => near(s, at));
const expectSame = (a: readonly XY[], b: readonly XY[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((s, i) => {
        expect(s.x).toBeCloseTo(b[i]!.x, 6);
        expect(s.y).toBeCloseTo(b[i]!.y, 6);
    });
};

/** The open shape tool with `params` drawn for `n` marchers */
function opened(params: LineParams, n: number): ToolState {
    return edit(openTool(lineTool, marchers(n)), params, ctx);
}
const paramsOf = (t: ToolState) => t.params as LineParams;
const menuOf = (p: LineParams, key: string) =>
    lineTool.menu!.sections(p, 4, key) ?? [];
const itemsOf = (p: LineParams, key: string): ToolMenuItem[] =>
    menuOf(p, key).flatMap((s) => s.items);
const item = (p: LineParams, key: string, value: string) =>
    itemsOf(p, key).find((i) => i.value === value);

describe("a point's marcher override (#569)", () => {
    it("is stored only when set, and read back by this build", () => {
        expect(L().points.some((q) => "marcher" in q)).toBe(false);
        const out = marcherAt(L(), 1, false);
        expect(out.points[1]).toEqual(corner(40, 0, { marcher: false }));
        expect(isLineParams(out)).toBe(true);
        expect(isLineParams(marcherAt(L(), 1, true))).toBe(true);
        // Following the line again drops the field
        const back = setPointMarcher(out, 8, 1, undefined, {});
        expect("marcher" in back.points[1]!).toBe(false);
    });

    it("refuses a marcher that isn't true or false, and point fields it doesn't know", () => {
        const bad = (q: object) =>
            isLineParams({ ...L(), points: [corner(0, 0), q, corner(40, 40)] });
        expect(bad(corner(40, 0, { marcher: "yes" as never }))).toBe(false);
        expect(bad({ ...corner(40, 0), weight: 2 })).toBe(false);
        expect(bad(corner(40, 0))).toBe(true);
    });

    it("keeps the spacing even through a corner with every corner holding a marcher", () => {
        // 4 marchers on an L of 80: a marcher on the corner, else every 26⅔ round it
        expect(hasSpotOn(L(), 4, { x: 40, y: 0 })).toBe(true);
        const even = marcherAt(L(), 1, false);
        expect(holdsMarcher(even, 1)).toBe(false);
        expect(hasSpotOn(even, 4, { x: 40, y: 0 })).toBe(false);
        expectSame(spots(even, 4), spots(L({ corners: false }), 4));
    });

    it("puts a marcher on a corner with the corners switch off", () => {
        const off = L({ corners: false });
        expect(hasSpotOn(off, 4, { x: 40, y: 0 })).toBe(false);
        const always = marcherAt(off, 1, true);
        expect(holdsMarcher(always, 1)).toBe(true);
        expectSame(spots(always, 4), spots(L(), 4));
    });

    it("puts a marcher on a smooth point that asks for one", () => {
        const curve: LineParams = {
            points: [
                corner(0, 0),
                corner(40, 30, { tension: SMOOTH }),
                corner(80, 0),
            ],
            spacing: { mode: "fit" },
        };
        expect(hasSpotOn(curve, 4, { x: 40, y: 30 })).toBe(false);
        expect(hasSpotOn(marcherAt(curve, 1, true), 4, { x: 40, y: 30 })).toBe(
            true,
        );
    });

    it("ignores the override on the path, which runs past every point", () => {
        const path = L({
            spacing: {
                mode: "path",
                groups: [{ interval: 20 }],
                anchor: "start",
            },
        });
        expectSame(spots(marcherAt(path, 1, true), 4), spots(path, 4));
        expectSame(
            spots(marcherAt({ ...path, corners: true }, 1, false), 4),
            spots(path, 4),
        );
    });

    it("lets a closed line's corner opt out of holding a marcher", () => {
        const sq = square();
        const p2 = { x: 40, y: 40 };
        expect(hasSpotOn(sq, 6, p2)).toBe(true);
        const out = marcherAt(sq, 2, false);
        expect(hasSpotOn(out, 6, p2)).toBe(false);
        for (const at of [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 0, y: 40 },
        ])
            expect(hasSpotOn(out, 6, at)).toBe(true);
        expect(spots(out, 6)).toHaveLength(6);
    });

    it("lets a closed line's corner opt in with the switch off", () => {
        // 5 round 160 with the switch off: every 32 from the first point, none on the third
        const off = square({ corners: false });
        const p2 = { x: 40, y: 40 };
        expect(hasSpotOn(off, 5, p2)).toBe(false);
        const out = marcherAt(off, 2, true);
        expect(hasSpotOn(out, 5, p2)).toBe(true);
        expect(spots(out, 5)).toHaveLength(5);
    });

    it("holds a marcher on a point of a line measured side to side, its stretches even that way", () => {
        const zig: LineParams = {
            points: [corner(0, 0), corner(30, 20), corner(80, 0)],
            spacing: { mode: "fit" },
            measured: "x",
            corners: false,
        };
        // Every 20 side to side: none on the point at 30
        expect(hasSpotOn(zig, 5, { x: 30, y: 20 })).toBe(false);
        const out = marcherAt(zig, 1, true);
        const xs = spots(out, 5).map((s) => s.x);
        expect(hasSpotOn(out, 5, { x: 30, y: 20 })).toBe(true);
        // Each stretch's gaps even side to side
        const at = xs.indexOf(30);
        const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
        for (const run of [gaps.slice(0, at), gaps.slice(at)])
            run.forEach((g) => expect(g).toBeCloseTo(run[0]!, 6));
        // And opting out with the switch on is the switch off
        const on = { ...zig, corners: true };
        expectSame(spots(marcherAt(on, 1, false), 5), spots(zig, 5));
    });

    it("sizes a Keep interval line so a point that opts in is a whole number of intervals along", () => {
        const off: LineParams = {
            points: [corner(0, 0), corner(40, 0), corner(40, 45)],
            spacing: { mode: "fit" },
            corners: false,
        };
        const n = 10;
        const kept = withInterval(off, n, 10, {});
        const out = setPointMarcher(kept, n, 1, true, {});
        const lengths = lineSegments(out).map((s) =>
            Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y),
        );
        for (const l of lengths)
            expect(Math.abs(l / 10 - Math.round(l / 10))).toBeLessThan(1e-6);
        expect(hasSpotOn(out, n, out.points[1]!)).toBe(true);
        expect(cornerOffInterval(out, n)).toBe(false);
    });
});

describe("a Line's point menu (#569)", () => {
    it("offers the corner type as an either/or with its double-click hint, following the line's marchers, and delete", () => {
        const menu = menuOf(L(), "p1");
        expect(menu.map((s) => s.items.map((i) => i.value))).toEqual([
            ["corner", "smooth"],
            ["marcher-follow", "marcher-always", "marcher-even"],
            ["delete"],
        ]);
        expect(menu[0]).toMatchObject({
            label: "Corner type",
            look: "segmented",
            hint: "Double-click a point to swap",
        });
        expect(menu[1]).toMatchObject({
            label: "Marcher on this point",
            look: "follow",
        });
        expect(item(L(), "p1", "marcher-follow")).toMatchObject({
            label: "Follow line's marchers",
            toggle: true,
        });
        expect(item(L(), "p1", "marcher-always")?.label).toBe("Marcher");
        expect(item(L(), "p1", "marcher-even")?.label).toBe("Even spacing");
        expect(item(L(), "p1", "corner")?.checked).toBe(true);
        expect(item(L(), "p1", "smooth")?.checked).toBe(false);
        expect(item(L(), "p1", "delete")).toMatchObject({
            icon: "trash",
            destructive: true,
        });
    });

    it("follows the line while the point has no answer of its own, saying what the line does", () => {
        // A corner with every corner holding a marcher: the line puts one here
        expect(item(L(), "p1", "marcher-follow")?.checked).toBe(true);
        expect(menuOf(L(), "p1")[1]!.caption).toBe("Line puts a marcher here");
        expect(item(L(), "p1", "marcher-always")?.checked).toBe(true);
        expect(item(L(), "p1", "marcher-even")?.checked).toBe(false);
        // With the switch off, or on a smooth point, the line keeps the spacing even
        const off = L({ corners: false });
        expect(menuOf(off, "p1")[1]!.caption).toBe(
            "Line keeps spacing even here",
        );
        expect(item(off, "p1", "marcher-even")?.checked).toBe(true);
        expect(item(off, "p1", "marcher-always")?.checked).toBe(false);
        const smooth = {
            ...L(),
            points: L().points.map((q, i) =>
                i === 1 ? { ...q, tension: SMOOTH } : q,
            ),
        };
        expect(item(smooth, "p1", "marcher-even")?.checked).toBe(true);
    });

    it("greys the marcher answers out with why when too few marchers hold every point", () => {
        // Four stretches need at least four gaps: three marchers have two
        const zigzag = L({
            points: [
                corner(0, 0),
                corner(40, 0),
                corner(40, 40),
                corner(80, 40),
                corner(80, 80),
            ],
        });
        const section = lineTool.menu!.sections(zigzag, 3, "p1")![1]!;
        const reason = "Too few marchers for one on every point";
        expect(section.caption).toBe(reason);
        for (const value of ["marcher-always", "marcher-even"])
            expect(section.items.find((i) => i.value === value)).toMatchObject({
                disabled: reason,
                checked: false,
            });
        // With enough marchers the answers count again
        expect(lineTool.menu!.sections(zigzag, 8, "p1")![1]!.caption).toBe(
            "Line puts a marcher here",
        );
    });

    it("shows a point's own answer with following off, and what the line would do", () => {
        const even = marcherAt(L(), 1, false);
        expect(item(even, "p1", "marcher-follow")?.checked).toBe(false);
        expect(item(even, "p1", "marcher-even")?.checked).toBe(true);
        expect(item(even, "p1", "marcher-always")?.checked).toBe(false);
        expect(menuOf(even, "p1")[1]!.caption).toBe(
            "Line would put a marcher here",
        );
        // An answer that agrees with the line is still the point's own
        const always = marcherAt(L(), 1, true);
        expect(item(always, "p1", "marcher-follow")?.checked).toBe(false);
        expect(item(always, "p1", "marcher-always")?.checked).toBe(true);
        const offEven = marcherAt(L({ corners: false }), 1, true);
        expect(menuOf(offEven, "p1")[1]!.caption).toBe(
            "Line would keep spacing even here",
        );
        // Nothing hands the point back but the switch
        expect(itemsOf(even, "p1").map((i) => i.value)).not.toContain(
            "marcher-line",
        );
    });

    it("offers Roundness only on a smooth point", () => {
        const smooth = {
            ...L(),
            points: L().points.map((q, i) =>
                i === 1 ? { ...q, tension: SMOOTH } : q,
            ),
        };
        expect(item(smooth, "p1", "roundness")).toBeDefined();
        expect(item(L(), "p1", "roundness")).toBeUndefined();
    });

    it("leaves the marcher answers off an open line's ends, and offers Close line there", () => {
        const values = itemsOf(L(), "p0").map((i) => i.value);
        expect(values).not.toContain("marcher-always");
        expect(values).toContain("close");
        expect(item(L(), "p2", "close")?.disabled).toBeUndefined();
        expect(itemsOf(L(), "p1").map((i) => i.value)).not.toContain("close");
    });

    it("greys out Delete point at the fewest points, and Close line under three", () => {
        const two: LineParams = {
            points: [corner(0, 0), corner(40, 0)],
            spacing: { mode: "fit" },
        };
        expect(item(two, "p0", "delete")?.disabled).toBeTruthy();
        expect(item(two, "p0", "close")?.disabled).toBeTruthy();
        expect(item(square(), "p0", "delete")?.disabled).toBeUndefined();
        const triangle = { ...square(), points: square().points.slice(0, 3) };
        expect(item(triangle, "p0", "delete")?.disabled).toBeTruthy();
    });

    it("greys out the marcher section on the path and on a filled line, though a stored answer can be dropped", () => {
        const path = L({
            spacing: {
                mode: "path",
                groups: [{ interval: 20 }],
                anchor: "start",
            },
        });
        const reason = "Interval on the path runs past every point";
        expect(menuOf(path, "p1")[1]!.caption).toBe(reason);
        for (const value of [
            "marcher-follow",
            "marcher-always",
            "marcher-even",
        ])
            expect(item(path, "p1", value)?.disabled).toBe(reason);
        for (const value of [
            "marcher-follow",
            "marcher-always",
            "marcher-even",
        ])
            expect(lineTool.menu!.pick(path, 4, "p1", value, env)).toBe(null);
        const filled = square({ distribution: filesDistribution(2) });
        expect(item(filled, "p1", "marcher-always")?.disabled).toBeTruthy();
        // The line's setting counts for nothing there, so nothing is marked for it
        expect(item(filled, "p1", "marcher-always")?.checked).toBe(false);
        expect(item(filled, "p1", "marcher-even")?.checked).toBe(false);
        // A stored answer still shows, and following again drops it
        const set = marcherAt(L(), 1, false);
        const pathSet = { ...set, spacing: path.spacing };
        expect(item(pathSet, "p1", "marcher-even")).toMatchObject({
            checked: true,
            disabled: reason,
        });
        expect(item(pathSet, "p1", "marcher-follow")).toMatchObject({
            checked: false,
        });
        expect(item(pathSet, "p1", "marcher-follow")?.disabled).toBeUndefined();
        const back = lineTool.menu!.pick(
            pathSet,
            4,
            "p1",
            "marcher-follow",
            env,
        )!.params as LineParams;
        expect("marcher" in back.points[1]!).toBe(false);
    });

    it("offers Open here on a closed line's points, not Close line", () => {
        const values = itemsOf(square(), "p2").map((i) => i.value);
        expect(values).toContain("open");
        expect(values).not.toContain("close");
        expect(values).toContain("marcher-always");
    });

    it("turns a point smooth and selects it, as one undo step", () => {
        let t = opened(L(), 4);
        const past = t.past.length;
        t = pickMenu(t, "p1", "smooth", ctx, env);
        expect(paramsOf(t).points[1]!.tension).toBe(SMOOTH);
        expect(t.selected).toBe("p1");
        expect(t.past).toHaveLength(past + 1);
        t = pickMenu(t, "p1", "corner", ctx, env);
        expect(paramsOf(t).points[1]!.tension).toBe(0);
    });

    it("selects a smooth point for Roundness, changing nothing", () => {
        const smooth = {
            ...L(),
            points: L().points.map((q, i) =>
                i === 1 ? { ...q, tension: SMOOTH } : q,
            ),
        };
        let t = opened(smooth, 4);
        const past = t.past.length;
        t = pickMenu(t, "p1", "roundness", ctx, env);
        expect(t.selected).toBe("p1");
        expect(t.params).toBe(smooth);
        expect(t.past).toHaveLength(past);
    });

    it("keeps the spacing even through a point, undone in one step", () => {
        let t = opened(L(), 4);
        t = pickMenu(t, "p1", "marcher-even", ctx, env);
        expect(paramsOf(t).points[1]!.marcher).toBe(false);
        // Following the line again drops the point's answer
        t = pickMenu(t, "p1", "marcher-follow", ctx, env);
        expect("marcher" in paramsOf(t).points[1]!).toBe(false);
        t = undo(t);
        expect(paramsOf(t).points[1]!.marcher).toBe(false);
    });

    it("switches following off to the other answer than the line's, in one click", () => {
        let t = opened(L(), 4);
        const past = t.past.length;
        t = pickMenu(t, "p1", "marcher-follow", ctx, env);
        // The line puts a marcher on the corner: switched off, the point keeps the spacing even
        expect(paramsOf(t).points[1]!.marcher).toBe(false);
        expect(t.past).toHaveLength(past + 1);
        let off = opened(L({ corners: false }), 4);
        off = pickMenu(off, "p1", "marcher-follow", ctx, env);
        expect(paramsOf(off).points[1]!.marcher).toBe(true);
    });

    it("sets the line's own answer over it when picked while following", () => {
        let t = opened(L(), 4);
        const past = t.past.length;
        // The line puts a marcher here already: picked from the greyed answers, it's the point's
        t = pickMenu(t, "p1", "marcher-always", ctx, env);
        expect(paramsOf(t).points[1]!.marcher).toBe(true);
        expect(t.past).toHaveLength(past + 1);
    });

    it("does nothing for the answer the point has already: no undo step", () => {
        const set = marcherAt(L(), 1, false);
        expect(lineTool.menu!.pick(set, 4, "p1", "marcher-even", env)).toBe(
            null,
        );
        let t = opened(set, 4);
        const past = t.past.length;
        t = pickMenu(t, "p1", "marcher-even", ctx, env);
        expect(t.params).toBe(set);
        expect(t.past).toHaveLength(past);
    });

    it("deletes a point, never under the fewest, clearing the selection", () => {
        let t = opened(L(), 4);
        t = pickMenu(t, "p1", "smooth", ctx, env);
        t = pickMenu(t, "p1", "delete", ctx, env);
        expect(paramsOf(t).points).toEqual([corner(0, 0), corner(40, 40)]);
        expect(t.selected).toBeNull();
        const was = t.params;
        t = pickMenu(t, "p0", "delete", ctx, env);
        expect(t.params).toBe(was);
    });

    it("closes an open line from an end, and opens a closed one at a point", () => {
        let t = opened(L(), 4);
        t = pickMenu(t, "p2", "close", ctx, env);
        expect(paramsOf(t).closed).toBe(true);
        let s = opened(marcherAt(square(), 2, true), 6);
        s = pickMenu(s, "p2", "open", ctx, env);
        const open = paramsOf(s);
        expect(open.closed).toBeUndefined();
        expect(open.points.map(({ x, y }) => ({ x, y }))).toEqual([
            { x: 40, y: 40 },
            { x: 0, y: 40 },
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 20 },
        ]);
        // Its new ends hold a marcher anyway: they say nothing of their own
        expect("marcher" in open.points[0]!).toBe(false);
        expect(isLineParams(open)).toBe(true);
    });
});

describe("a Line's segment menu (#569)", () => {
    it("adds a point in the segment's middle and selects it", () => {
        let t = opened(L(), 4);
        expect(itemsOf(L(), "m0").map((i) => i.value)).toEqual([
            "add",
            "straight",
            "curved",
        ]);
        t = pickMenu(t, "m0", "add", ctx, env);
        expect(paramsOf(t).points).toHaveLength(4);
        expect(paramsOf(t).points[1]).toMatchObject({ x: 20, y: 0 });
        expect(t.selected).toBe("p1");
    });

    it("curves a straight segment and straightens it again", () => {
        expect(item(L(), "m0", "straight")?.checked).toBe(true);
        let t = opened(L(), 4);
        t = pickMenu(t, "m0", "curved", ctx, env);
        expect(lineSegments(paramsOf(t))[0]!.type).toBe("cubic");
        expect(item(paramsOf(t), "m0", "curved")?.checked).toBe(true);
        t = pickMenu(t, "m0", "straight", ctx, env);
        expect(lineSegments(paramsOf(t))[0]!.type).toBe("line");
    });

    it("greys out Curved where the line runs straight through", () => {
        const two: LineParams = {
            points: [corner(0, 0), corner(40, 0)],
            spacing: { mode: "fit" },
        };
        expect(item(two, "m0", "curved")?.disabled).toBeTruthy();
    });
});

describe("the menu on a placed Line (#569)", () => {
    const N = 4;
    function placed(params: LineParams): PlacedBox<LineParams> {
        const placement = placementOf(opened(params, N), ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [box] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return box as PlacedBox<LineParams>;
    }

    it("saves a point's override, read back as stored", () => {
        const box = placed(L());
        const out = pickLive(openLive(box), "p1", "marcher-even", env);
        expect(out.changed).toBe(true);
        const after = out.live.params as LineParams;
        expect(after.points[1]!.marcher).toBe(false);
        expect(placed(after).params.points[1]!.marcher).toBe(false);
        // The answer it has already saves nothing
        const again = pickLive(
            openLive(placed(after)),
            "p1",
            "marcher-even",
            env,
        );
        expect(again.changed).toBe(false);
    });

    it("selects the point Smooth turns, and saves nothing for Roundness", () => {
        const box = placed(L());
        const smooth = pickLive(openLive(box), "p1", "smooth", env);
        expect(smooth.changed).toBe(true);
        expect(smooth.live.selected).toBe("p1");
        const turned = placed(smooth.live.params as LineParams);
        const round = pickLive(openLive(turned), "p1", "roundness", env);
        expect(round.changed).toBe(false);
        expect(round.live.selected).toBe("p1");
    });
});

describe("Open here on a closed line (#569)", () => {
    /** The closed line's spots, as {@link lineSpots} lays them */
    const xy = (p: LineParams, n: number) =>
        lineSpots(p, n).map(({ x, y }) => ({ x, y }));
    const apart = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
    /** The closest two of `at` are */
    const closest = (at: readonly XY[]) =>
        Math.min(
            ...at.flatMap((a, i) => at.slice(i + 1).map((b) => apart(a, b))),
        );
    /** How far the furthest of `was` is from its nearest in `now` */
    const furthest = (was: readonly XY[], now: readonly XY[]) =>
        Math.max(...was.map((a) => Math.min(...now.map((b) => apart(a, b)))));
    /** A circle of radius 20 through four smooth points, from its top */
    const circle = (more: Partial<LineParams> = {}): LineParams => ({
        points: [
            corner(20, 0, { tension: SMOOTH }),
            corner(40, 20, { tension: SMOOTH }),
            corner(20, 40, { tension: SMOOTH }),
            corner(0, 20, { tension: SMOOTH }),
        ],
        closed: true,
        spacing: { mode: "fit" },
        ...more,
    });
    const keep = (p: LineParams, n: number, interval: number) =>
        withInterval(p, n, interval, {});

    /**
     * `closed` opened at point `index` for `n` marchers: an open line starting on that point, its
     * ends saying nothing of a marcher, nothing stacked, and every spot where it was within `within`
     */
    function expectOpensKeepingSpots(
        closed: LineParams,
        n: number,
        index: number,
        within = 1e-6,
    ): LineParams {
        const open = openAt(closed, n, index, {});
        expect(open.closed).toBeUndefined();
        expect(isLineParams(open)).toBe(true);
        expect(open.points[0]).toMatchObject({
            x: closed.points[index]!.x,
            y: closed.points[index]!.y,
        });
        expect("marcher" in open.points[0]!).toBe(false);
        expect("marcher" in open.points.at(-1)!).toBe(false);
        const was = xy(closed, n);
        const now = xy(open, n);
        expect(now).toHaveLength(n);
        expect(near(now[0]!, closed.points[index]!)).toBe(true);
        expect(closest(now)).toBeGreaterThan(closest(was) / 2);
        expect(furthest(was, now)).toBeLessThan(within);
        return open;
    }

    it("keeps a Fit square's spots at every corner, the end one gap back, nothing stacked", () => {
        for (const n of [8, 12])
            for (const index of [0, 1, 2, 3])
                expectOpensKeepingSpots(square(), n, index);
        const open = openAt(square(), 8, 1, {});
        expect(open.points.map(({ x, y }) => ({ x, y }))).toEqual([
            { x: 40, y: 0 },
            { x: 40, y: 40 },
            { x: 0, y: 40 },
            { x: 0, y: 0 },
            { x: 20, y: 0 },
        ]);
        // Uneven shares of the sides keep theirs where the open line shares them the same
        expectOpensKeepingSpots(square(), 7, 1);
        expectOpensKeepingSpots(square(), 11, 0);
    });

    it("shifts a Fit square's marchers along a side when an open line can't share its gaps the same", () => {
        // Seven round four even sides share 2, 2, 2, 1 from the first corner. Opened at the third,
        // the closed line has 2, 1, 2 from there, then one gap before the end; an open line shares
        // by its sides' lengths alone, 2, 2, 1, 1
        const open = openAt(square(), 7, 2, {});
        expect(open.points[0]).toMatchObject({ x: 40, y: 40 });
        const now = xy(open, 7);
        expect(now).toHaveLength(7);
        expect(near(now[0]!, { x: 40, y: 40 })).toBe(true);
        expect(closest(now)).toBeGreaterThan(19);
        // Every corner still holds one
        for (const q of square().points)
            expect(hasSpotOn(open, 7, q)).toBe(true);
    });

    it("keeps a Fit square's spots with the corners switch off", () => {
        expectOpensKeepingSpots(square({ corners: false }), 8, 1);
    });

    it("keeps a Keep interval square's spots and size", () => {
        const kept = keep(square(), 8, 5);
        const open = expectOpensKeepingSpots(kept, 8, 2);
        const s = lineSpots(open, 8);
        s.slice(1).forEach((spot, i) =>
            expect(apart(spot, s[i]!)).toBeCloseTo(5, 6),
        );
        expectOpensKeepingSpots(keep(square({ corners: false }), 8, 5), 8, 1);
    });

    it("keeps a square's spots measured side to side, which a closed line can't be", () => {
        expectOpensKeepingSpots(square({ measured: "x" }), 8, 1);
        expectOpensKeepingSpots(keep(square({ measured: "y" }), 8, 5), 8, 3);
    });

    it("keeps the spot of a corner that holds a marcher whatever it said, saying nothing as an end", () => {
        expectOpensKeepingSpots(marcherAt(square(), 1, true), 8, 1);
        expectOpensKeepingSpots(
            marcherAt(square({ corners: false }), 2, true),
            8,
            2,
        );
    });

    it("keeps a smooth circle's spots nearly, the new ends bending it a little, nothing stacked", () => {
        // A tenth of the interval, about 15
        expectOpensKeepingSpots(circle(), 8, 1, 2);
        // In Keep interval sized to its run again, from its pivot, so the point moves a little
        const ring = keep(circle(), 8, 8);
        const open = openAt(ring, 8, 1, {});
        expect(apart(open.points[0]!, ring.points[1]!)).toBeLessThan(0.1);
        const now = xy(open, 8);
        expect(furthest(xy(ring, 8), now)).toBeLessThan(1.5);
        // Each gap 8 along the line
        const along = lineSpots(open, 8);
        along
            .slice(1)
            .forEach((spot, i) =>
                expect(spot.s! - along[i]!.s!).toBeCloseTo(8, 3),
            );
    });

    it("moves the spots along to start on a point that holds none, gaps as they were", () => {
        // Six round a 160 square from its first corner: none on the next corner
        const off = square({ corners: false });
        expect(hasSpotOn(off, 6, { x: 40, y: 0 })).toBe(false);
        const open = openAt(off, 6, 1, {});
        expect(open.points[0]).toMatchObject({ x: 40, y: 0 });
        lineSpots(open, 6).forEach((spot, i) =>
            expect(spot.s).toBeCloseTo((160 * i) / 6, 6),
        );
        // A smooth point kept even through in Keep interval: the line sized to its run again
        const ring = keep(circle(), 6, 8);
        const opened = openAt(ring, 6, 1, {});
        expect(apart(opened.points[0]!, ring.points[1]!)).toBeLessThan(0.5);
        const s = lineSpots(opened, 6);
        // Nothing stacked: 8 along a ring this tight is a little under 7 straight across
        expect(closest(s)).toBeGreaterThan(6.5);
        s.slice(1).forEach((spot, i) =>
            expect(spot.s! - s[i]!.s!).toBeCloseTo(8, 3),
        );
    });

    it("opens from the menu as one undo step, the selection cleared", () => {
        let t = opened(square(), 8);
        const past = t.past.length;
        t = pickMenu(t, "p1", "open", ctx, env);
        expect(paramsOf(t).closed).toBeUndefined();
        expect(t.past).toHaveLength(past + 1);
        expect(t.selected).toBeNull();
        expectSame(xy(paramsOf(t), 8).slice(0, 1), [{ x: 40, y: 0 }]);
    });
});

describe("Close/Open from the line's ends switch (#529, #569)", () => {
    it("opens with ends that say nothing of a marcher", () => {
        const open = openLine(marcherAt(square(), 0, true), 8);
        expect(open.closed).toBeUndefined();
        expect(open.points[0]).toMatchObject({ x: 0, y: 0 });
        expect("marcher" in open.points[0]!).toBe(false);
        expect("marcher" in open.points.at(-1)!).toBe(false);
        expect(isLineParams(open)).toBe(true);
    });
});

describe("the ticked answer picked again (#569)", () => {
    /** A Keep interval L whose corner was dragged off its interval */
    const offInterval = (): LineParams => {
        const p = withInterval(L(), 4, 10, {});
        return {
            ...p,
            points: p.points.map((q, i) =>
                i === 1 ? { ...q, x: q.x + 3 } : q,
            ),
        };
    };

    it("changes nothing, not even a Keep interval line's size", () => {
        const p = offInterval();
        expect(cornerOffInterval(p, 4)).toBe(true);
        expect(lineTool.menu!.pick(p, 4, "p1", "corner", env)).toBe(null);
        expect(lineTool.menu!.pick(p, 4, "m0", "straight", env)).toBe(null);
        let t = opened(p, 4);
        const past = t.past.length;
        t = pickMenu(t, "p1", "corner", ctx, env);
        t = pickMenu(t, "m1", "straight", ctx, env);
        expect(t.params).toBe(p);
        expect(t.past).toHaveLength(past);
    });

    it("saves nothing on a placed Line", () => {
        const curved: LineParams = {
            ...L(),
            points: L().points.map((q) => ({ ...q, tension: SMOOTH })),
        };
        expect(lineTool.menu!.pick(curved, 4, "m0", "curved", env)).toBe(null);
    });
});
