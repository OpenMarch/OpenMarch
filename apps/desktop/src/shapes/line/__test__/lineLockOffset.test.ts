import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import {
    intervalUnit,
    isLineParams,
    lineFrame,
    offsetOf,
    type LineParams,
} from "../lineGeometry";
import { frameControls, shapeTurn } from "../../frame/gestures";
import { DEGREE, rotationDegrees } from "../../frame/frame";
import { chipLayout } from "../../editor/chip";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import { placedBoxSummary } from "../../placed/placedBoxText";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * The Line's interval lock, Offset and drag modifiers (owner decisions on #522, #527, for #568):
 * unlocked, a typed interval is only where the line starts from and a drag changes the interval,
 * snapping to whole steps (half zoomed in); locked, a drag changes only what the interval doesn't
 * pin. Offset sets both ways at once on a one-segment line. Shift is fine, Cmd/Ctrl keeps the
 * direction and Alt goes from the center. Driven through the shape session as a user does.
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
    pullRadius: 2,
    // Half a step is 5 px on screen: under 8, so drags snap to whole steps
    zoom: 1,
};
/** Zoomed in so half a step is 10 px on screen: drags snap to half steps */
const zoomed: ToolEnv = { ...env, zoom: 2 };
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const constrain: ToolEnv = { ...env, constrain: true };
const fromCenter: ToolEnv = { ...env, fromCenter: true };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY, e: ToolEnv = env): ToolState {
    let t = openTool(lineTool, marchers(n));
    t = press(t, from, e);
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

/** A handle pressed and moved to `to`, not yet let go: the drag's preview */
function midDrag(t: ToolState, key: string, to: XY, e: ToolEnv = env) {
    const at = lineTool
        .handles(t.params as LineParams, t.spots)
        .find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture?.type).toBe("handle");
    return pointerMove(t, to, e);
}
const dragHandle = (t: ToolState, key: string, to: XY, e: ToolEnv = env) =>
    release(midDrag(t, key, to, e), ctx);

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const param = (key: string) => lineTool.params.find((p) => p.key === key)!;
const choice = (key: string) => lineTool.choices!.find((c) => c.key === key)!;
/** The editor's interval numbers as shown */
const readout = (t: ToolState) =>
    chipLayout(lineTool, t.params, t.spots, env).intervals.map(
        (x) => x.display,
    );
const typed = (t: ToolState, text: string, key = "interval") =>
    edit(t, param(key).type(t.params, t.spots, text, env), ctx);
const picked = (t: ToolState, key: string, value: string) =>
    edit(t, choice(key).pick(t.params, t.spots, value, env), ctx);
const lock = lineTool.lock!;
const toggled = (t: ToolState) =>
    edit(t, lock.toggle(t.params, t.spots, env), ctx);
const menuPick = (t: ToolState, key: string, value: string) =>
    edit(
        t,
        lineTool.menu!.pick(t.params, t.spots, key, value, env)!.params,
        ctx,
    );
const gaps = (xs: readonly number[]) => xs.slice(1).map((x, i) => x - xs[i]!);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("the interval unlocked (the default)", () => {
    // 5 marchers from 100 to 150: 1¼ steps apart
    const fitLine = () => drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });

    it("starts unlocked, the lock offered beside the interval", () => {
        const t = fitLine();
        expect(lock.shown(t.params, t.spots)).toBe(true);
        expect(lock.locked(t.params, t.spots)).toBe(false);
        expect(chipLayout(lineTool, t.params, t.spots, env).lock).toBe(false);
    });

    it("snaps a dragged end where the interval is whole steps, the readout following mid-drag", () => {
        const t = fitLine();
        // 4 gaps from the far end: 66 long is 1.65 a gap, nearest 2 steps
        const moving = midDrag(t, "p1", { x: 166, y: 101 });
        expect(pointsOf(moving)[1]).toEqual({ x: 180, y: 100 });
        expect(readout(moving)).toEqual(["2"]);
        const further = pointerMove(moving, { x: 214, y: 100 }, env);
        expect(readout(further)).toEqual(["3"]);
        const done = release(further, ctx);
        expect(paramsOf(done).spacing.mode).toBe("fit");
        expect(pointsOf(done)[1]).toEqual({ x: 220, y: 100 });
    });

    it("snaps to half steps once half a step is 8 px or more on screen", () => {
        expect(intervalUnit(env)).toBe(STEP);
        expect(intervalUnit(zoomed)).toBe(half);
        const t = dragHandle(fitLine(), "p1", { x: 166, y: 100 }, zoomed);
        expect(pointsOf(t)[1]).toEqual({ x: 160, y: 100 });
        expect(readout(t)).toEqual(["1½"]);
    });

    it("drags freely with fine", () => {
        const t = dragHandle(fitLine(), "p1", { x: 166.3, y: 100 }, fine);
        expect(pointsOf(t)[1]).toEqual({ x: 166.3, y: 100 });
    });

    it("snaps a dragged end measured ↔ by its side-to-side distance, the other way where it lands", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 140, y: 140 });
        t = picked(t, "measured", "x");
        t = dragHandle(t, "p1", { x: 177, y: 152 });
        // 77 across over 4 gaps, nearest 2 steps: 80 across; front to back where it landed
        expect(pointsOf(t)[1]).toEqual({ x: 180, y: 150 });
        expect(gaps(spotsOf(t).map((p) => p.x))).toEqual([20, 20, 20, 20]);
    });

    it("no longer locks when an interval is typed: the line is sized to it, the interval kept as where it started", () => {
        const t = typed(fitLine(), "2");
        expect(paramsOf(t).spacing).toEqual({
            mode: "fit",
            groups: [{ interval: 20 }],
        });
        expect(isLineParams(paramsOf(t))).toBe(true);
        // 4 gaps of 2 steps, grown from the left end, the line's pivot (#596)
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 180, y: 100 },
        ]);
        // A drag still changes it
        const dragged = dragHandle(t, "p1", { x: 219, y: 100 });
        expect(pointsOf(dragged)[1]).toEqual({ x: 220, y: 100 });
        expect(readout(dragged)).toEqual(["3"]);
    });

    it("keeps typed groups' proportions, scaled to fit as an end is dragged", () => {
        let t = drawn(6, { x: 100, y: 100 }, { x: 150, y: 100 });
        t = typed(t, "2*3+4*2");
        expect(paramsOf(t).spacing.mode).toBe("fit");
        // 3, 2, 2, 2 … the line sized to them: 3·1 + 2·3 = 14 steps... as laid out
        const before = gaps(spotsOf(t).map((p) => p.x));
        t = dragHandle(t, "p1", { x: 400, y: 100 }, fine);
        const after = gaps(spotsOf(t).map((p) => p.x));
        const k = after[0]! / before[0]!;
        after.forEach((g, i) => near(g, before[i]! * k));
        expect(k).toBeGreaterThan(1);
    });
});

describe("the lock", () => {
    const fitLine = () => drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });

    it("locks and unlocks in one undo step each, the line kept as it is", () => {
        const t = typed(fitLine(), "2");
        const locked = toggled(t);
        expect(paramsOf(locked).spacing).toEqual({
            mode: "keep",
            groups: [{ interval: 20 }],
        });
        expect(pointsOf(locked)).toEqual(pointsOf(t));
        expect(locked.past.length).toBe(t.past.length + 1);
        expect(undo(locked).params).toBe(t.params);
        const unlocked = toggled(locked);
        expect(paramsOf(unlocked).spacing.mode).toBe("fit");
        expect(pointsOf(unlocked)).toEqual(pointsOf(t));
        expect(unlocked.past.length).toBe(locked.past.length + 1);
    });

    it("locks a drawn interval off the half steps as it is", () => {
        const t = toggled(fitLine());
        const spacing = paramsOf(t).spacing;
        expect(spacing.mode).toBe("keep");
        near(
            (spacing as { groups: { interval: number }[] }).groups[0]!.interval,
            12.5,
        );
        expect(pointsOf(t)).toEqual(pointsOf(fitLine()));
    });

    it("shows locked on the path, and unlocking it is Fit", () => {
        const t = picked(fitLine(), "spacing", "path-start");
        expect(lock.locked(t.params, t.spots)).toBe(true);
        expect(paramsOf(toggled(t)).spacing.mode).toBe("fit");
    });

    it("isn't offered on a filled line or with one marcher", () => {
        const one = drawn(1, { x: 100, y: 100 }, { x: 150, y: 100 });
        expect(lock.shown(one.params, one.spots)).toBe(false);
        expect(
            chipLayout(lineTool, one.params, one.spots, env).lock,
        ).toBeNull();
    });

    it("swings an end round, locked along the path, its length kept", () => {
        const t = dragHandle(toggled(typed(fitLine(), "2")), "p1", {
            x: 101,
            y: 160,
        });
        const [a, b] = pointsOf(t);
        expect(a).toEqual({ x: 100, y: 100 });
        near(b!.x, 100);
        near(b!.y, 180);
    });

    it("moves an end only front to back, locked ↔", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 140, y: 140 });
        t = toggled(picked(t, "measured", "x"));
        t = dragHandle(t, "p1", { x: 172, y: 201 });
        expect(pointsOf(t)[1]).toEqual({ x: 140, y: 200 });
        expect(gaps(spotsOf(t).map((p) => p.x))).toEqual([10, 10, 10, 10]);
    });

    it("moves an end only side to side, locked ↕", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 140, y: 140 });
        t = toggled(picked(t, "measured", "y"));
        t = dragHandle(t, "p1", { x: 172, y: 201 });
        expect(pointsOf(t)[1]).toEqual({ x: 170, y: 140 });
        expect(gaps(spotsOf(t).map((p) => p.y))).toEqual([10, 10, 10, 10]);
    });

    it("moves a corner in whole intervals, constrained that way, locked ↔", () => {
        let t = openTool(lineTool, marchers(7));
        t = edit(
            t,
            {
                points: [
                    { x: 0, y: 0, tension: 0 },
                    { x: 30, y: 40, tension: 0 },
                    { x: 60, y: 0, tension: 0 },
                ],
                spacing: { mode: "keep", groups: [{ interval: 10 }] },
                measured: "x",
            } satisfies LineParams,
            ctx,
        );
        t = dragHandle(t, "p1", { x: 41, y: 30 });
        const corner = pointsOf(t)[1]!;
        // A whole number of 1-step gaps side to side from the first point
        expect(corner.x % 10).toBe(0);
        expect(corner.y).toBe(30);
    });
});

describe("Offset (rise over run)", () => {
    // 5 marchers from (100, 100) to (140, 120): each 1 step right and ½ down the screen (toward
    // the front) from the next, so ↕ reads −½
    const diagonal = () => drawn(5, { x: 100, y: 100 }, { x: 140, y: 120 });
    const offsetLine = () => picked(diagonal(), "measured", "offset");

    it("is the Measured menu's fifth choice, showing two numbers side by side", () => {
        const t = offsetLine();
        expect(choice("measured").current(t.params, t.spots)).toBe("offset");
        expect(paramsOf(t).offset).toEqual({ x: 10, y: 5 });
        expect(isLineParams(paramsOf(t))).toBe(true);
        expect(readout(t)).toEqual(["1", "−½"]);
        const keys = chipLayout(lineTool, t.params, t.spots, env).intervals.map(
            (x) => [x.param.key, x.param.glyph, x.param.glyphAfter],
        );
        expect(keys).toEqual([
            ["offsetX", "↔", true],
            ["offsetY", "↕", true],
        ]);
        expect(spotsOf(t)).toEqual(
            [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i * 10, y: 100 + i * 5 })),
        );
    });

    it("types each number, growing the line from its pivot, one undo step each", () => {
        let t = offsetLine();
        const steps = t.past.length;
        t = typed(t, "2", "offsetX");
        expect(paramsOf(t).offset).toEqual({ x: 20, y: 5 });
        // Grown from the left end, where the line's pivot is (#596)
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 180, y: 120 },
        ]);
        // Up the screen is more: 1 ↕ is each marcher a step toward the back, field y going down
        t = typed(t, "1", "offsetY");
        expect(paramsOf(t).offset).toEqual({ x: 20, y: -10 });
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 180, y: 60 },
        ]);
        expect(readout(t)).toEqual(["2", "1"]);
        expect(t.past.length).toBe(steps + 2);
        // Still unlocked: typing doesn't lock
        expect(paramsOf(t).spacing.mode).toBe("fit");
        // Not a list: `2x1` isn't read
        expect(param("offsetX").type(t.params, t.spots, "2x1", env)).toBeNull();
        // Both nought is no line
        const flat = typed(t, "0", "offsetY");
        expect(paramsOf(flat).offset).toEqual({ x: 20, y: 0 });
        expect(
            param("offsetX").type(flat.params, flat.spots, "0", env),
        ).toBeNull();
    });

    it("drags a number", () => {
        const t = offsetLine();
        const x = param("offsetX");
        const next = x.scrub(
            t.params,
            t.spots,
            { dx: 400, dy: 0 } as never,
            env,
        );
        expect((next as LineParams).offset!.x).toBeGreaterThan(10);
        expect((next as LineParams).offset!.y).toBe(5);
    });

    it("snaps both ways on a dragged end unlocked, the readout following", () => {
        const t = midDrag(offsetLine(), "p1", { x: 162, y: 131 });
        // 60 × 30 over 4 gaps: 1½ × ¾, each nearest a whole step
        expect(paramsOf(t).offset).toEqual({ x: 20, y: 10 });
        expect(readout(t)).toEqual(["2", "−1"]);
        // Zoomed in, each nearest a half step
        const zoomedIn = midDrag(
            offsetLine(),
            "p1",
            { x: 162, y: 124 },
            zoomed,
        );
        expect(paramsOf(zoomedIn).offset).toEqual({ x: 15, y: 5 });
        expect(readout(zoomedIn)).toEqual(["1½", "−½"]);
    });

    it("can't be changed by dragging an end when locked: only moving the whole line", () => {
        const t = toggled(offsetLine());
        expect(paramsOf(t).spacing.mode).toBe("keep");
        const dragged = dragHandle(t, "p1", { x: 200, y: 200 });
        expect(dragged.params).toBe(t.params);
        expect(
            lineTool.honors!.handle!("p1", false, t.params, t.spots),
        ).toEqual({});
    });

    it("is greyed out with why: more than one segment, mixed groups, on the path", () => {
        const reason = (t: ToolState) =>
            choice("measured")
                .options(t.params, t.spots)
                .find((o) => o.value === "offset")!.disabled;
        expect(reason(diagonal())).toBeUndefined();
        const bent = menuPick(diagonal(), "m0", "add");
        expect(reason(bent)).toBe("Only on a one-segment line");
        const grouped = typed(diagonal(), "2*2+3");
        expect(reason(grouped)).toBe("Only with one interval for everyone");
        const path = picked(diagonal(), "spacing", "path-start");
        expect(reason(path)).toBe("Not with Interval on the path");
        // A disabled pick changes nothing
        expect(picked(bent, "measured", "offset").params).toBe(bent.params);
        // And Interval on the path is greyed out while it's an offset
        const t = offsetLine();
        expect(
            choice("spacing")
                .options(t.params, t.spots)
                .filter((o) => o.value.startsWith("path"))
                .every((o) => o.disabled === "Offset sets the line's length"),
        ).toBe(true);
    });

    it("falls back to along the path when a point is added, noting it, and comes back when it's one segment again", () => {
        const t = toggled(typed(offsetLine(), "2", "offsetX"));
        const spacingWas = paramsOf(t).spacing;
        const bent = menuPick(t, "m0", "add");
        expect(paramsOf(bent).points).toHaveLength(3);
        // Stored as it was, laid out along the path at the same spacing
        expect(paramsOf(bent).measured).toBe("offset");
        expect(paramsOf(bent).offset).toEqual({ x: 20, y: 5 });
        expect(paramsOf(bent).spacing).toEqual(spacingWas);
        expect(offsetOf(paramsOf(bent))).toBeNull();
        expect(choice("measured").current(bent.params, bent.spots)).toBe(
            "along",
        );
        const chip = chipLayout(lineTool, bent.params, bent.spots, env);
        expect(chip.intervals.map((x) => x.param.key)).toEqual(["interval"]);
        expect(chip.intervals[0]!.note).toBe(
            "along the path until it's one segment (Offset)",
        );
        // The middle point bent off the line, then deleted: the offset again
        const moved = dragHandle(bent, "p1", { x: 100, y: 140 }, fine);
        const straight = menuPick(moved, "p1", "delete");
        expect(paramsOf(straight).points).toHaveLength(2);
        expect(
            choice("measured").current(straight.params, straight.spots),
        ).toBe("offset");
        const [a, b] = pointsOf(straight);
        near(b!.x - a!.x, 4 * 20);
        near(b!.y - a!.y, 4 * 5);
        expect(readout(straight)).toEqual(["2", "−½"]);
    });

    it("drops the offset when another measure is picked", () => {
        const t = picked(offsetLine(), "measured", "along");
        expect(paramsOf(t).measured).toBeUndefined();
        expect(paramsOf(t).offset).toBeUndefined();
        expect(isLineParams(paramsOf(t))).toBe(true);
    });

    it("is placed and reads back exactly, labelled by its two numbers", () => {
        const t = toggled(typed(offsetLine(), "2", "offsetX"));
        const placement = placementOf(t, ctx)!;
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
        }) as PlacedBox<LineParams>[];
        expect(placed!.kind).toBe(lineTool);
        expect(placed!.params.offset).toEqual({ x: 20, y: 5 });
        expect(placed!.params.measured).toBe("offset");
        expect(placedBoxSummary(placed!, STEP)).toBe("2 × −½ steps");
    });
});

describe("drag modifiers on a Line's ends and corners", () => {
    it("names keep direction and from center on an end, keep direction on a corner, nothing on a midpoint", () => {
        const t = drawn(5, { x: 0, y: 0 }, { x: 40, y: 0 });
        const bent = menuPick(t, "m0", "add");
        const honors = (s: ToolState, key: string) =>
            lineTool.honors!.handle!(key, false, s.params, s.spots);
        expect(honors(bent, "p0")).toEqual({
            constrain: "keepDirection",
            fromCenter: "fromCenter",
        });
        expect(honors(bent, "p1")).toEqual({ constrain: "keepDirection" });
        expect(honors(bent, "m0")).toEqual({});
    });

    it("keeps the direction with constrain, only the length changing, on whole steps unlocked", () => {
        // 50 long over 4 gaps, pointing (0.8, 0.6)
        const t = drawn(5, { x: 100, y: 100 }, { x: 140, y: 130 });
        const dragged = dragHandle(t, "p1", { x: 200, y: 100 }, constrain);
        const [a, b] = pointsOf(dragged);
        expect(a).toEqual({ x: 100, y: 100 });
        // 80 along it: 2 steps a gap
        near(b!.x, 164);
        near(b!.y, 148);
        expect(readout(dragged)).toEqual(["2"]);
    });

    it("keeps an offset's ratio with constrain, both parts growing together", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 140, y: 120 });
        t = picked(t, "measured", "offset");
        const dragged = dragHandle(t, "p1", { x: 200, y: 150 }, constrain);
        const o = paramsOf(dragged).offset!;
        near(o.x / o.y, 2);
        near(o.x / 10, Math.round(o.x / 10));
    });

    it("changes nothing with constrain when locked along the path: direction and length are both kept", () => {
        const t = toggled(drawn(5, { x: 100, y: 100 }, { x: 140, y: 130 }));
        expect(dragHandle(t, "p1", { x: 200, y: 100 }, constrain).params).toBe(
            t.params,
        );
    });

    it("mirrors the other end about the center with from center", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const dragged = dragHandle(t, "p1", { x: 199, y: 100 }, fromCenter);
        // 2 × 59 = 118 long, nearest 3 steps a gap: 120, about the center at 140
        expect(pointsOf(dragged)).toEqual([
            { x: 80, y: 100 },
            { x: 200, y: 100 },
        ]);
    });

    it("swings round the center with from center when locked", () => {
        const t = toggled(drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 }));
        const dragged = dragHandle(t, "p1", { x: 140, y: 141 }, fromCenter);
        const [a, b] = pointsOf(dragged);
        near(a!.x, 140);
        near(a!.y, 60);
        near(b!.x, 140);
        near(b!.y, 140);
    });

    it("moves the far end the other way on a line of more points, with from center", () => {
        const t = menuPick(
            drawn(5, { x: 0, y: 0 }, { x: 80, y: 0 }),
            "m0",
            "add",
        );
        const dragged = dragHandle(
            t,
            "p2",
            { x: 90, y: 3 },
            { ...fine, fromCenter: true },
        );
        const points = pointsOf(dragged);
        expect(points[2]).toEqual({ x: 90, y: 3 });
        expect(points[0]).toEqual({ x: -10, y: -3 });
        expect(points[1]).toEqual({ x: 40, y: 0 });
    });

    it("keeps a corner on its segment's direction with constrain", () => {
        const t = openTool(lineTool, marchers(5));
        const bent = edit(
            t,
            {
                points: [
                    { x: 0, y: 0, tension: 0 },
                    { x: 30, y: 40, tension: 0 },
                    { x: 80, y: 40, tension: 0 },
                ],
                spacing: { mode: "fit" },
                corners: false,
            } satisfies LineParams,
            ctx,
        );
        const dragged = dragHandle(
            bent,
            "p1",
            { x: 60, y: 60 },
            {
                ...constrain,
                snap: false,
                gridSnap: (p) => p,
            },
        );
        const corner = pointsOf(dragged)[1]!;
        // Still along (0.6, 0.8) from the first point
        near(corner.x / corner.y, 30 / 40);
    });
});

describe("what a Line stores", () => {
    const base: LineParams = {
        points: [
            { x: 0, y: 0, tension: 0 },
            { x: 40, y: 20, tension: 0 },
        ],
        spacing: { mode: "fit" },
    };

    it("reads Fit's typed groups and an offset with its measure", () => {
        expect(
            isLineParams({
                ...base,
                spacing: { mode: "fit", groups: [{ interval: 20 }] },
            }),
        ).toBe(true);
        expect(
            isLineParams({
                ...base,
                spacing: {
                    mode: "fit",
                    groups: [{ interval: 20, count: 2 }, { interval: 30 }],
                },
            }),
        ).toBe(true);
        expect(
            isLineParams({
                ...base,
                measured: "offset",
                offset: { x: 10, y: 5 },
            }),
        ).toBe(true);
    });

    it.each([
        ["an offset with no measure", { ...base, offset: { x: 10, y: 5 } }],
        ["measured as an offset with none", { ...base, measured: "offset" }],
        [
            "a nought offset",
            { ...base, measured: "offset", offset: { x: 0, y: 0 } },
        ],
        [
            "an offset with another field",
            { ...base, measured: "offset", offset: { x: 10, y: 5, z: 1 } },
        ],
        [
            "Fit's groups with two rests",
            {
                ...base,
                spacing: {
                    mode: "fit",
                    groups: [{ interval: 20 }, { interval: 30 }],
                },
            },
        ],
        [
            "Fit's empty groups",
            { ...base, spacing: { mode: "fit", groups: [] } },
        ],
    ])("refuses %s", (_name, params) => {
        expect(isLineParams(params)).toBe(false);
    });
});

describe("Offset kept through other edits (review on #596)", () => {
    const offsetLine = () =>
        picked(
            drawn(5, { x: 100, y: 100 }, { x: 140, y: 120 }),
            "measured",
            "offset",
        );

    it("locks a Fit line at the offset it shows, after it was bent and straightened again", () => {
        const t = offsetLine();
        expect(readout(t)).toEqual(["1", "−½"]);
        const bent = menuPick(t, "m0", "add");
        const moved = dragHandle(bent, "p2", { x: 200, y: 100 }, fine);
        const straight = menuPick(moved, "p1", "delete");
        expect(readout(straight)).toEqual(["2½", "0"]);
        const locked = toggled(straight);
        expect(lock.locked(paramsOf(locked))).toBe(true);
        expect(pointsOf(locked)).toEqual(pointsOf(straight));
        expect(readout(locked)).toEqual(["2½", "0"]);
        expect(paramsOf(locked).offset).toEqual({ x: 25, y: 0 });
    });

    /** The line turned `by` degrees clockwise with the knob */
    const knobTurned = (t: ToolState, by: number) => {
        const { knob } = frameControls(lineTool, t.params, t.spots, env);
        const pressed = press(t, knob, env);
        const { pivot } = pressed.gesture as unknown as { pivot: XY };
        const r = Math.hypot(knob.x - pivot.x, knob.y - pivot.y);
        const a = Math.atan2(knob.y - pivot.y, knob.x - pivot.x) + by * DEGREE;
        const to = {
            x: pivot.x + r * Math.cos(a),
            y: pivot.y + r * Math.sin(a),
        };
        return release(pointerMove(pressed, to, env), ctx);
    };

    it.each([15, 30, 45])(
        "keeps a locked line's interval and direction turned %i°, the offset then fractions",
        (by) => {
            const t = picked(
                toggled(drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 })),
                "measured",
                "offset",
            );
            expect(readout(t)).toEqual(["2", "0"]);
            const turned = knobTurned(t, by);
            const p = paramsOf(turned);
            expect(
                rotationDegrees(
                    shapeTurn(lineTool, turned.params, turned.spots),
                ),
            ).toBeCloseTo(by, 9);
            expect(rotationDegrees(lineFrame(p).rotation)).toBeCloseTo(by, 9);
            const o = offsetOf(p)!;
            near(Math.hypot(o.x, o.y), 20);
            const ends = p.points.map(({ x, y }) => ({ x, y }));
            near(
                Math.hypot(ends[1]!.x - ends[0]!.x, ends[1]!.y - ends[0]!.y),
                80,
            );
            expect(ends[0]).toEqual({ x: 100, y: 100 });
        },
    );

    it("puts a locked line turned square to the field back on half steps", () => {
        const t = picked(
            toggled(drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 })),
            "measured",
            "offset",
        );
        const turned = knobTurned(t, 90);
        expect(offsetOf(paramsOf(turned))).toEqual({ x: 0, y: 20 });
        expect(readout(turned)).toEqual(["0", "−2"]);
    });
});
