import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxBlock, boxDistribution, type BoxParams } from "../box/boxGeometry";
import { circleTool } from "../circle/circleTool";
import type { CircleParams } from "../circle/circleGeometry";
import type { FilesLayout } from "../distribute/distribution";
import { withLayout, withMode } from "../distribute/modes";
import {
    boxesAt,
    canCloseUp,
    closeUp,
    closedUpParams,
    withoutMembers,
    type PlacedBox,
    type PlacedRecipe,
} from "../placed/placedBox";
import { liveTargets } from "../placed/liveBox";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";
import { padTool } from "./fakeRowKind";

/**
 * Close up (#392, spec #385): a placed closed shape that lost members is laid out again for the
 * ones left, in its mode and settings, by least travel. Driven with the box in each mode, the
 * circle and a fake closed kind the host has never heard of.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
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

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

/** `t` placed, read back, then with `left` gone: their spots stay as holes */
function placedWithout(
    t: ToolState,
    left: readonly number[],
    kinds?: readonly AnyToolKind[],
): PlacedBox {
    const placement = placementOf(t, ctx)!;
    const recipe: PlacedRecipe = withoutMembers(
        {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        },
        left,
    );
    const at = new Map(recipe.members.map((m) => [m.marcherId, m] as const));
    const [box] = boxesAt({
        recipes: [recipe],
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
        ...(kinds ? { kinds } : {}),
    });
    return box!;
}

const membersOf = (box: PlacedBox) =>
    box.recipe.members.map((m) => ({
        id: m.marcherId,
        at: { x: m.x, y: m.y },
        drillRank: m.marcherId,
    }));

const dist = (a: XY, b: XY) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const closest = (spots: readonly XY[]) =>
    Math.min(
        ...spots.flatMap((p, i) => spots.slice(i + 1).map((q) => dist(p, q))),
    );

/** Every member on a spot of its own in the shape the recipe saves */
function expectOnOwnSpots(
    kind: AnyToolKind,
    out: NonNullable<ReturnType<typeof closeUp>>,
) {
    const spots = kind.shape.generate(out.params, out.spots, ctx);
    expect(spots).toHaveLength(out.spots);
    expect(new Set(out.members.map((m) => m.slot)).size).toBe(
        out.members.length,
    );
    for (const m of out.members) {
        expect(m.x).toBeCloseTo(spots[m.slot]!.x, 9);
        expect(m.y).toBeCloseTo(spots[m.slot]!.y, 9);
    }
}

const inLayout = (t: ToolState, layout: FilesLayout) =>
    edit(t, withLayout(boxTool, t.params, t.spots, layout, env), ctx);

describe("Close up, a box in Files", () => {
    // 6 × 4, Full
    const full = () =>
        inLayout(drawn(boxTool, 24, { x: 0, y: 0 }, { x: 100, y: 60 }), {
            family: "full",
            files: 6,
            byFile: false,
        });

    it("is offered only with holes", () => {
        const t = full();
        expect(canCloseUp(placedWithout(t, []))).toBe(false);
        expect(closedUpParams(placedWithout(t, []), 24, env)).toBeNull();
        expect(canCloseUp(placedWithout(t, [3, 9]))).toBe(true);
    });

    it("after four leave, closes up to the layout's version for the new count", () => {
        const box = placedWithout(full(), [1, 2, 3, 4]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(20);
        expect(out.members).toHaveLength(20);
        const block = boxBlock(out.params as BoxParams, 20);
        expect(block.layout.family).toBe("full");
        expect(block.fellBack).toBeNull();
        expect(block.across * block.deep).toBe(20);
        expectOnOwnSpots(boxTool, out);
    });

    it("after two leave, Short back stands in for a layout that can't make the count, kept as asked so the chip notes it", () => {
        const box = placedWithout(full(), [5, 17]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(22);
        const params = out.params as BoxParams;
        const d = boxDistribution(params);
        expect(d.mode === "files" && d.layout.family).toBe("full");
        expect(boxBlock(params, 22).fellBack).toBe("full");
        expectOnOwnSpots(boxTool, out);
    });

    it("keeps its intervals and its center (the pivot), and moves only who must", () => {
        // 5 × 4 Short back; one leaves the front rank
        const t = drawn(boxTool, 20, { x: 0, y: 0 }, { x: 80, y: 60 });
        const box = placedWithout(t, [20]);
        const before = box.params as BoxParams;
        const out = closeUp(box, membersOf(box), env, ctx)!;
        const params = out.params as BoxParams;
        expect(params.across).toBe(before.across);
        expect(params.deep).toBe(before.deep);
        expect(params.center).toEqual(before.center);
        // Still 4 ranks of 5, 1 short at the back: at most the back rank and the hole's file move
        const moved = out.members.filter((m) => {
            const was = box.recipe.members.find(
                (r) => r.marcherId === m.marcherId,
            )!;
            return dist(was, m) > 1e-9;
        });
        expect(moved.length).toBeLessThanOrEqual(5);
    });

    it("is laid out by least travel, whatever order it was placed in", () => {
        const box = placedWithout(full(), [1, 2]);
        const params = closedUpParams(box, 22, env);
        const live = liveTargets(box, params, ctx, true);
        expect(live.spots).toBe(22);
        expect(live.members).toHaveLength(22);
    });

    it("is least travel when asked for, even on a kind with an order saved as Reverse", () => {
        const ordered: AnyToolKind = { ...boxTool, ordered: true };
        const placed = placedWithout(full(), [1, 2], [ordered]);
        const box: PlacedBox = {
            ...placed,
            recipe: { ...placed.recipe, orderMode: "keep", reverse: true },
        };
        expect(box.kind.ordered).toBe(true);
        const params = closedUpParams(box, 22, env);
        const live = liveTargets(box, params, ctx, true, undefined, "nearest");
        const out = closeUp(placed, membersOf(placed), env, ctx)!;
        expect(live.members.map((m) => m.slot)).toEqual(
            out.members.map((m) => m.slot),
        );
    });
});

describe("Close up, a box in Outline", () => {
    it("spreads round again with a spot on every corner", () => {
        let t = drawn(boxTool, 12, { x: 0, y: 0 }, { x: 60, y: 40 });
        t = edit(t, withMode(boxTool, t.params, t.spots, "outline", env), ctx);
        const box = placedWithout(t, [2, 7, 11]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(9);
        expect(boxDistribution(out.params as BoxParams).mode).toBe("outline");
        expectOnOwnSpots(boxTool, out);
        // The frame's four corners each have a member
        const frame = boxTool.frameOf(out.params, 9);
        const corners = boxTool.outline!(out.params, 9);
        expect(frame.halfWidth).toBeGreaterThan(0);
        for (const c of corners)
            expect(out.members.some((m) => dist(m, c) < 1e-6)).toBe(true);
    });
});

describe("Close up, a spread", () => {
    it("relaxes into the gap from the layout it had, no pair closer than the interval", () => {
        let t = drawn(boxTool, 16, { x: 0, y: 0 }, { x: 60, y: 60 });
        t = edit(t, withMode(boxTool, t.params, t.spots, "spread", env), ctx);
        const box = placedWithout(t, [4, 9]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(14);
        const d = boxDistribution(out.params as BoxParams);
        // The seed and the count it was laid out for stay: 14 relax from that layout
        expect(d).toMatchObject({ mode: "spread", seed: 1, count: 16 });
        expectOnOwnSpots(boxTool, out);
        const across = (out.params as BoxParams).across;
        expect(closest(out.members)).toBeGreaterThanOrEqual(
            across * (1 - 1e-6),
        );
        expect(closest(out.members)).toBeLessThan(across * 1.2);
        // The same every time
        expect(closeUp(box, membersOf(box), env, ctx)).toEqual(out);
    });

    it("a circle's spread closes up too", () => {
        let t = drawn(circleTool, 12, { x: 100, y: 100 }, { x: 130, y: 100 });
        t = edit(
            t,
            withMode(circleTool, t.params, t.spots, "spread", env),
            ctx,
        );
        const box = placedWithout(t, [1]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(11);
        expectOnOwnSpots(circleTool, out);
    });
});

describe("Close up, a circle in Outline", () => {
    it("goes round again with neighbors one interval apart, the center kept", () => {
        const t = drawn(circleTool, 8, { x: 100, y: 100 }, { x: 126, y: 100 });
        const box = placedWithout(t, [3, 6]);
        const before = box.params as CircleParams;
        const out = closeUp(box, membersOf(box), env, ctx)!;
        const params = out.params as CircleParams;
        expect(out.spots).toBe(6);
        expect(params.center).toEqual(before.center);
        expectOnOwnSpots(circleTool, out);
        const spots = circleTool.shape.generate(params, 6, ctx);
        for (let i = 0; i < 6; i++)
            expect(dist(spots[i]!, spots[(i + 1) % 6]!)).toBeCloseTo(
                params.interval,
                9,
            );
    });
});

describe("Close up, a closed kind the host has never heard of", () => {
    it("lays the fake pad out again for the members left", () => {
        const t = drawn(padTool, 9, { x: 100, y: 100 }, { x: 140, y: 100 });
        const box = placedWithout(t, [5], [padTool]);
        expect(canCloseUp(box)).toBe(true);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(8);
        expectOnOwnSpots(padTool, out);
    });

    it("its outline closes up too", () => {
        let t = drawn(padTool, 9, { x: 100, y: 100 }, { x: 140, y: 100 });
        t = edit(t, withMode(padTool, t.params, t.spots, "outline", env), ctx);
        const box = placedWithout(t, [1, 2], [padTool]);
        const out = closeUp(box, membersOf(box), env, ctx)!;
        expect(out.spots).toBe(7);
        expectOnOwnSpots(padTool, out);
    });
});
