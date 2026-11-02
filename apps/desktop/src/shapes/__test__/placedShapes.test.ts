import { describe, expect, it } from "vitest";
import { circleTool } from "../circle/circleTool";
import { radiusOf, type CircleParams } from "../circle/circleGeometry";
import {
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    releaseLive,
} from "../placed/liveBox";
import {
    boxesAt,
    membershipAfter,
    movedBox,
    withoutMembers,
    type PlacedBox,
    type PlacedRecipe,
} from "../placed/placedBox";
import { placedBoxSummary } from "../placed/placedBoxText";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../tool/toolMachine";
import { flipShape } from "../frame/gestures";
import type { ShapeContext, XY } from "../types";
import { padTool, type PadParams } from "./fakeRowKind";

/**
 * Placed shapes of any kind (#397, spec #385): a placed circle, and a fake closed kind the host
 * has never heard of, are read back from their recipes, selected and edited through their tool
 * kinds, the same way as a placed box.
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

/** What placing `t` saves, through JSON as the database keeps it */
function recipeOf(t: ToolState): PlacedRecipe {
    const placement = placementOf(t, ctx)!;
    return {
        ...placement.recipe,
        id: 1,
        timelineId: 10,
        members: placement.members,
        params: JSON.parse(JSON.stringify(placement.recipe.params)),
    };
}

/** The placed shapes read back from `recipes`, everyone on their spots */
function readBack(
    recipes: readonly PlacedRecipe[],
    kinds?: readonly AnyToolKind[],
): PlacedBox[] {
    const at = new Map(
        recipes.flatMap((r) => r.members.map((m) => [m.marcherId, m] as const)),
    );
    return boxesAt({
        recipes,
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
        ...(kinds ? { kinds } : {}),
    });
}

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

describe("a placed circle", () => {
    const N = 8;
    const placedCircle = () => {
        const t = drawn(circleTool, N, { x: 100, y: 100 }, { x: 126, y: 100 });
        const [placed] = readBack([recipeOf(t)]);
        return { t, placed: placed as PlacedBox<CircleParams> };
    };

    it("is read back from its recipe with its kind, numbers and spots", () => {
        const { t, placed } = placedCircle();
        expect(placed.kind).toBe(circleTool);
        expect(placed.spots).toBe(N);
        expect(placed.params).toEqual(
            JSON.parse(JSON.stringify(t.params)) as CircleParams,
        );
        expect(placed.params.distribution).toEqual({
            mode: "outline",
            oddGap: { side: "back", at: null, style: "spread" },
        });
        expect(placedBoxSummary(placed, STEP)).toBe("2 steps");
    });

    it("isn't read back by an app without the circle", () => {
        const { t } = placedCircle();
        expect(readBack([recipeOf(t)], [padTool])).toEqual([]);
    });

    it("its radius handle changes the interval, each member keeping their spot round it", () => {
        const { placed } = placedCircle();
        const handle = circleTool.handles(placed.params, N)[0]!;
        let live = pressLive(openLive(placed), handle.at, env)!;
        expect(live.gesture?.type).toBe("handle");
        live = moveLive(
            live,
            { x: placed.params.center.x + 40, y: placed.params.center.y },
            env,
        );
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        const params = out.live.params as CircleParams;
        expect(params.interval).toBe(30);
        expect(params.center).toEqual(placed.params.center);
        const { members, spots } = liveTargets(placed, params, ctx);
        expect(spots).toBe(N);
        // Everyone keeps their slot, now 3 steps from the next one round
        expect(members.map((m) => m.slot)).toEqual(
            placed.recipe.members.map((m) => m.slot),
        );
        const bySlot = [...members].sort((a, b) => a.slot - b.slot);
        for (let i = 0; i < N; i++)
            expect(dist(bySlot[i]!, bySlot[(i + 1) % N]!)).toBeCloseTo(30, 9);
    });

    it("goes inside on a double-click of its radius handle, which takes no double-click", () => {
        const { placed } = placedCircle();
        const handle = circleTool.handles(placed.params, N)[0]!;
        for (const ownFirst of [true, false]) {
            const out = releaseLive(
                pressLive(openLive(placed), handle.at, env)!,
                {
                    double: true,
                    ownFirst,
                },
            );
            expect(out.changed).toBe(false);
            expect(out.enter).toBe(true);
        }
    });

    it("moves from inside, and a press without a drag changes nothing", () => {
        const { placed } = placedCircle();
        // Off the center dot, which drags the center to the pointer
        const at = { x: placed.params.center.x + 8, y: placed.params.center.y };
        const still = releaseLive(pressLive(openLive(placed), at, env)!);
        expect(still.changed).toBe(false);
        let live = pressLive(openLive(placed), at, env)!;
        live = moveLive(live, { x: at.x + 20, y: at.y - 10 }, env);
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        expect((out.live.params as CircleParams).center).toEqual({
            x: placed.params.center.x + 20,
            y: placed.params.center.y - 10,
        });
    });

    it("moves with its members when they all move the same way", () => {
        const { placed } = placedCircle();
        const moved = new Map(
            placed.recipe.members.map((m) => [
                m.marcherId,
                { x: m.x + 5, y: m.y - 10 },
            ]),
        );
        const change = membershipAfter(placed, moved);
        expect(change).toEqual({ type: "move", delta: { x: 5, y: -10 } });
        if (change.type !== "move") return;
        const out = movedBox(placed, change.delta);
        expect((out.params as CircleParams).center).toEqual({
            x: placed.params.center.x + 5,
            y: placed.params.center.y - 10,
        });
        expect(out.params.spots).toBe(N);
    });

    it("keeps a hole when a member leaves, and the summary counts it", () => {
        const { placed } = placedCircle();
        const recipe = withoutMembers(placed.recipe, [3]);
        const [holed] = readBack([recipe]) as PlacedBox<CircleParams>[];
        expect(holed!.spots).toBe(N);
        expect(placedBoxSummary(holed!, STEP)).toBe("2 steps · 1 empty");
        const handle = circleTool.handles(holed!.params, N)[0]!;
        const live = moveLive(
            pressLive(openLive(holed!), handle.at, env)!,
            { x: handle.at.x + 20, y: handle.at.y },
            env,
        );
        const { members, spots } = liveTargets(
            holed!,
            releaseLive(live).live.params,
            ctx,
        );
        expect(spots).toBe(N);
        expect(members.map((m) => m.slot)).not.toContain(2);
    });

    it("a flip keeps everyone on their spot, and a bigger interval makes it bigger", () => {
        const { placed } = placedCircle();
        const flipped = flipShape(
            circleTool,
            placed.params,
            N,
            "across",
            "c",
            env,
        );
        const live = liveTargets(placed, flipped, ctx);
        expect(live.members.map((m) => m.slot)).toEqual(
            placed.recipe.members.map((m) => m.slot),
        );
        const bigger = { ...placed.params, interval: 30 };
        expect(radiusOf(bigger, N)).toBeGreaterThan(radiusOf(placed.params, N));
    });
});

describe("a placed fake kind", () => {
    const N = 5;
    const placedPad = () => {
        const t = drawn(padTool, N, { x: 100, y: 100 }, { x: 140, y: 100 });
        const [placed] = readBack([recipeOf(t)], [padTool]);
        return placed as PlacedBox<PadParams>;
    };

    it("is read back through the kinds it's given", () => {
        const placed = placedPad();
        expect(placed.kind).toBe(padTool);
        expect(placed.spots).toBe(N);
        expect(placedBoxSummary(placed, STEP)).toBe("2 steps");
    });

    it("moves from inside through its own kind, members keeping their slots", () => {
        const placed = placedPad();
        let live = pressLive(openLive(placed), placed.params.center, env)!;
        live = moveLive(
            live,
            { x: placed.params.center.x + 10, y: placed.params.center.y },
            env,
        );
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        const { members } = liveTargets(placed, out.live.params, ctx);
        for (const m of members) {
            const was = placed.recipe.members.find(
                (r) => r.marcherId === m.marcherId,
            )!;
            expect(m.slot).toBe(was.slot);
            expect(m.x).toBeCloseTo(was.x + 10);
            expect(m.y).toBeCloseTo(was.y);
        }
    });

    it("lays its members out again when its fill changes", () => {
        const placed = placedPad();
        const outline = padTool.closed!.withDistribution(
            placed.params,
            N,
            { mode: "outline" },
            env,
        );
        expect(liveTargets(placed, outline, ctx).spots).toBe(N);
    });
});
