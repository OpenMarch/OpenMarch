import { describe, expect, it } from "vitest";
import { boxTool } from "../../box/boxTool";
import {
    boxCorners,
    boxDistribution,
    drawBox,
    onField,
    type BoxParams,
} from "../../box/boxGeometry";
import {
    flipBox,
    reoriented,
    withFieldCount,
    withSpacing,
} from "../../editor/boxEdits";
import {
    DEFAULT_ODD_GAP,
    type OddGap,
    type OutlineDistribution,
} from "../distribution";
import { withMode } from "../modes";
import {
    gapPickAt,
    outlineGapAt,
    outlineGapOf,
    withOddGap,
} from "../outlineGap";
import { boxesAt, type PlacedRecipe } from "../../placed/placedBox";
import { liveTargets } from "../../placed/liveBox";
import { placementOf } from "../../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
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
import { padTool } from "../../__test__/fakeRowKind";

/**
 * Outline mode for the box (#390, spec #385): spots around the edge at the interval with one on
 * every corner, an odd count leaving one spot between corners out where the designer picks.
 * Driven through the shape session with the box and the fake closed kind.
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

/** `n` marchers in a box drawn `w` × `d` field units, switched to Outline (one undo step) */
function outlined(n: number, w = 60, d = 40): ToolState {
    const t = drawn(boxTool, n, { x: 0, y: 0 }, { x: w, y: d });
    return edit(t, withMode(boxTool, t.params, n, "outline", env), ctx);
}

/** {@link outlined}, its odd count leaving a gap rather than spreading evenly */
const gapped = (n: number, w = 60, d = 40): ToolState =>
    withGap(outlined(n, w, d), { style: "gap" });

/** The box's outline with its gap set */
function withGap(t: ToolState, gap: Partial<OddGap>): ToolState {
    const d = boxDistribution(t.params as BoxParams) as OutlineDistribution;
    return edit(
        t,
        withOddGap(boxTool, t.params, t.spots, { ...d.oddGap, ...gap }, env),
        ctx,
    );
}

const near = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const has = (spots: readonly XY[], p: XY) => spots.some((s) => near(s, p));
const key = (p: XY) => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;

/** Spots across and deep, as the chip shows them */
const size = (t: ToolState) => {
    const f = onField(t.params as BoxParams, t.spots);
    return [f.across, f.deep];
};

/** The spots on the back edge (the box isn't turned), left to right */
const backRow = (t: ToolState) => {
    const spots = slotsOf(t, ctx);
    const top = Math.min(...spots.map((s) => s.y));
    return spots
        .filter((s) => Math.abs(s.y - top) < 1e-9)
        .map((s) => s.x)
        .sort((a, b) => a - b);
};

describe("Outline for the box", () => {
    it("places exactly n with every corner occupied, for 4–300 at several proportions", () => {
        const drags: [number, number][] = [
            [80, 20],
            [60, 40],
            [40, 40],
            [30, 70],
            [20, 90],
        ];
        for (let n = 4; n <= 300; n++)
            for (const [w, d] of drags) {
                // Straight from the kind: the session's least travel is slow at 300
                const files = drawBox({ x: 0, y: 0 }, { x: w, y: d }, n, env)!;
                const p = withMode(boxTool, files, n, "outline", env);
                const spots = boxTool.shape.generate(p, n, ctx);
                expect(spots).toHaveLength(n);
                expect(new Set(spots.map(key)).size).toBe(n);
                for (const corner of boxCorners(p as BoxParams, n))
                    expect(has(spots, corner)).toBe(true);
            }
    });

    it("spaces the spots by the interval around the edge, 2(a + b) = n for an even count", () => {
        // 6 × 4 steps go round 5 × 4 spots (#458): across 1½ steps, deep following the frame,
        // 1⅓ steps
        const t = gapped(14, 60, 40);
        const p = t.params as BoxParams;
        expect(p.across).toBe(15);
        expect(p.deep).toBeCloseTo(40 / 3, 9);
        const [across, deep] = size(t);
        expect(2 * (across! - 1 + deep! - 1)).toBe(14);
        // Round the loop in slot order, each spot is an interval on from the last
        const spots = slotsOf(t, ctx);
        spots.forEach((s, i) => {
            const next = spots[(i + 1) % spots.length]!;
            const dx = Math.abs(next.x - s.x);
            const dy = Math.abs(next.y - s.y);
            expect(
                (dy < 1e-9 && Math.abs(dx - p.across) < 1e-9) ||
                    (dx < 1e-9 && Math.abs(dy - p.deep) < 1e-9),
            ).toBe(true);
        });
    });

    it("keeps the space the box took up: across fits the width exactly, deep the depth (owner on #458, #459)", () => {
        for (const [n, w, d] of [
            [12, 60, 40],
            [16, 40, 40],
            [13, 60, 40],
            [20, 90, 30],
            [24, 50, 80],
            [31, 120, 60],
        ] as const) {
            const files = drawBox({ x: 0, y: 0 }, { x: w, y: d }, n, env)!;
            const before = boxTool.frameOf(files, n);
            const p = withMode(boxTool, files, n, "outline", env) as BoxParams;
            const after = boxTool.frameOf(p, n);
            const { across: a1 } = onField(p, n);
            // Across kept to 600ths of a step, so the width to that per interval
            expect(
                Math.abs(after.halfWidth - before.halfWidth) * 2,
                `${n} in ${w} × ${d}`,
            ).toBeLessThanOrEqual(((a1 - 1) * STEP) / 600 + 1e-9);
            expect(after.halfDepth).toBeCloseTo(before.halfDepth, 9);
            expect(after.center.x).toBeCloseTo(before.center.x, 9);
            expect(after.center.y).toBeCloseTo(before.center.y, 9);
        }
    });

    it("takes the proportions of the space: 12 round 6 × 4 steps go round 5 × 3, across 1½ and deep 2 (owner on #459)", () => {
        const t = gapped(12, 60, 40);
        expect(size(t)).toEqual([5, 3]);
        const p = t.params as BoxParams;
        expect([p.across, p.deep]).toEqual([15, 20]);
    });

    it("31 round 7 × 6 steps keep the frame with across off the half steps; setting a spacing or pressing its ≈ puts that one on half steps (owner on #458, #459)", () => {
        const t = outlined(31, 70, 60);
        const p = t.params as BoxParams;
        expect(p.across % half).not.toBe(0);
        // + on the spacing: onto half steps, the rest worked out
        const wider = withSpacing(p, "across", p.across / STEP + 0.5, 31, env);
        expect(wider.across % half).toBe(0);
        // Its ≈ pressed: the nearest half step
        const across = boxTool.params.find((q) => q.key === "across")!;
        const snapped = across.snap!(p, 31, env) as BoxParams;
        expect(snapped.across % half).toBe(0);
        // A count changed keeps both spacings as they are
        const more = withFieldCount(
            p,
            31,
            "across",
            onField(p, 31).across + 1,
            env,
        );
        expect([more.across, more.deep]).toEqual([p.across, p.deep]);
    });

    it("keeps the interval for a single rank or file, which has no space to keep, and goes round as wide as it can", () => {
        expect(size(gapped(16, 140, 10))).toEqual([8, 2]);
        expect(size(gapped(16, 10, 150))).toEqual([2, 8]);
    });

    it("spreads the short side evenly by default, with no gap to show (owner, lab)", () => {
        const t = outlined(13, 60, 40);
        expect(outlineGapOf(boxTool, t.params, 13)!.stored).toEqual({
            side: "back",
            at: null,
            style: "spread",
        });
        expect(outlineGapAt(boxTool, t.params, 13)).toBeNull();
        const xs = backRow(t);
        const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!);
    });

    it("leaves one spot out of the back, in the middle, for an odd count", () => {
        // 13: round 5 × 4 (14 spots), one short of the back's 5
        const t = gapped(13, 60, 40);
        expect(size(t)).toEqual([5, 4]);
        const p = t.params as BoxParams;
        expect(backRow(t)).toHaveLength(4);
        // The gap, drawn on the field, is the back's middle spot (4 intervals: 2 in)
        const [backLeft, backRight] = boxCorners(p, 13);
        const gap = outlineGapAt(boxTool, p, 13)!;
        expect(gap.y).toBeCloseTo(backLeft!.y);
        expect(gap.x).toBeCloseTo((backLeft!.x + backRight!.x) / 2);
        expect(has(slotsOf(t, ctx), gap)).toBe(false);
        // 5 intervals have no middle spot: the one 3 in, half an interval off
        const odd = withFieldCount(p, 13, "across", 6, env);
        const [l6, r6] = boxCorners(odd, 13);
        expect(onField(odd, 13).across).toBe(6);
        const oddGap = outlineGapAt(boxTool, odd, 13)!;
        expect(oddGap.x).toBeCloseTo(l6!.x + 3 * odd.across);
        expect(Math.abs(oddGap.x - (l6!.x + r6!.x) / 2)).toBeLessThanOrEqual(
            odd.across / 2,
        );
        // An even count has none
        expect(outlineGapAt(boxTool, gapped(14).params, 14)).toBeNull();
    });

    it("makes a line across the front with fewer than 4", () => {
        for (const n of [1, 2, 3]) {
            const t = gapped(n);
            const spots = slotsOf(t, ctx);
            expect(spots).toHaveLength(n);
            expect(new Set(spots.map((s) => s.y)).size).toBe(1);
            expect(size(t)).toEqual([n, 1]);
            expect(outlineGapAt(boxTool, t.params, n)).toBeNull();
        }
    });

    it("switches back to Files with its spots across, as one undo step each way", () => {
        const files = drawn(boxTool, 13, { x: 0, y: 0 }, { x: 60, y: 40 });
        const t = edit(
            files,
            withMode(boxTool, files.params, 13, "outline", env),
            ctx,
        );
        expect(undo(t).params).toBe(files.params);
        const back = edit(
            t,
            withMode(boxTool, t.params, 13, "files", env),
            ctx,
        );
        expect(boxDistribution(back.params as BoxParams).mode).toBe("files");
        expect(size(back)[0]).toBe(size(t)[0]);
    });

    it("keeps Outline through a change of spots across, and the count goes round", () => {
        const t = gapped(14, 60, 40);
        const wider = withFieldCount(
            t.params as BoxParams,
            14,
            "across",
            6,
            env,
        );
        const u = edit(t, wider, ctx);
        expect(size(u)).toEqual([6, 3]);
        expect(slotsOf(u, ctx)).toHaveLength(14);
        // More across than the count can go round stops at the widest
        const widest = withFieldCount(
            t.params as BoxParams,
            14,
            "across",
            30,
            env,
        );
        expect(onField(widest, 14).across).toBe(7);
    });

    it("keeps its gap's spot through a quarter turn back (the across count on a turned box)", () => {
        let t = gapped(13, 60, 40);
        t = withGap(t, { side: "left", at: 1 });
        const before = outlineGapAt(boxTool, t.params, 13)!;
        const turned = reoriented(t.params as BoxParams, 13);
        expect(near(outlineGapAt(boxTool, turned, 13)!, before)).toBe(true);
        expect(boxTool.shape.generate(turned, 13, ctx).map(key).sort()).toEqual(
            slotsOf(t, ctx).map(key).sort(),
        );
    });
});

describe("picking the gap", () => {
    it("a click on a spot between corners moves the gap there, as one undo step", () => {
        const t = gapped(13, 60, 40);
        const p = t.params as BoxParams;
        const was = outlineGapAt(boxTool, p, 13)!;
        const [, , frontRight] = boxCorners(p, 13);
        // The front's second spot from the right
        const spot = { x: frontRight!.x - p.across, y: frontRight!.y };
        let u = press(t, spot, env);
        expect(u.gesture?.type).toBe("move");
        u = release(u, ctx, { double: false });
        expect(has(slotsOf(u, ctx), spot)).toBe(false);
        expect(near(outlineGapAt(boxTool, u.params, 13)!, spot)).toBe(true);
        expect(slotsOf(u, ctx)).toHaveLength(13);
        // The old gap is filled again, and who goes where is worked out again
        expect(has(slotsOf(u, ctx), was)).toBe(true);
        expect(u.assignment).not.toEqual(t.assignment);
        expect(undo(u).params).toBe(t.params);
    });

    it("a click on a spot on a side handle moves the gap too", () => {
        // 5 × 4: the front's middle spot is under its handle
        const t = gapped(13, 60, 40);
        const p = t.params as BoxParams;
        const [backLeft, backRight, frontRight] = boxCorners(p, 13);
        const frontMiddle = {
            x: (backLeft!.x + backRight!.x) / 2,
            y: frontRight!.y,
        };
        let u = press(t, frontMiddle, env);
        expect(u.gesture?.type).toBe("handle");
        u = release(u, ctx, { double: false });
        expect(near(outlineGapAt(boxTool, u.params, 13)!, frontMiddle)).toBe(
            true,
        );
    });

    it("a click on a corner, inside, or on the gap itself changes nothing", () => {
        const t = gapped(13, 60, 40);
        const p = t.params as BoxParams;
        const corners = boxCorners(p, 13);
        const gap = outlineGapAt(boxTool, p, 13)!;
        const center = {
            x: (corners[0]!.x + corners[2]!.x) / 2,
            y: (corners[0]!.y + corners[2]!.y) / 2,
        };
        for (const at of [
            { x: corners[0]!.x + 1, y: corners[0]!.y + 1 },
            center,
            gap,
        ])
            expect(gapPickAt(boxTool, p, 13, at, env)).toBeNull();
    });

    it("a drag on a spot still moves the box", () => {
        const t = gapped(13, 60, 40);
        const p = t.params as BoxParams;
        const [, , frontRight] = boxCorners(p, 13);
        const spot = { x: frontRight!.x - p.across, y: frontRight!.y };
        let u = press(t, spot, env);
        u = pointerMove(u, { x: spot.x - 30, y: spot.y }, env);
        u = release(u, ctx, null);
        // Moved, and back on the half-step grid: the first edit after a switch to Outline
        // that kept the space off it (#458)
        expect(
            Math.abs((u.params as BoxParams).center.x - (p.center.x - 30)),
        ).toBeLessThanOrEqual(half / 2);
        // Its sides on the grid
        const moved = u.params as BoxParams;
        for (const c of boxCorners(moved, 13))
            expect(Math.abs(c.x / half - Math.round(c.x / half))).toBeLessThan(
                1e-9,
            );
        expect(outlineGapOf(boxTool, u.params, 13)!.gap).toMatchObject({
            side: "back",
        });
    });

    it("picks a side in the inspector at its middle, as seen on a flipped box", () => {
        let t = gapped(13, 60, 40);
        t = withGap(t, { side: "left", at: null });
        const left = outlineGapOf(boxTool, t.params, 13)!;
        // 3 intervals deep: the spot 2 in from the front
        expect(left.gap).toMatchObject({ side: "left", at: 2 });
        // Flipped side to side, the shape's left is on the field's right
        const flipped = flipBox(t.params as BoxParams, 13, "across", "c", env);
        const gapAt = outlineGapAt(boxTool, flipped, 13)!;
        const corners = boxCorners(flipped, 13);
        expect(gapAt.x).toBeCloseTo(Math.max(...corners.map((c) => c.x)));
    });

    it("a side picked on a box too short that way lengthens it", () => {
        // 13 round 6 × 3: 1 interval deep has nothing between its corners
        let t = gapped(13, 100, 10);
        expect(size(t)).toEqual([7, 2]);
        t = withGap(t, { side: "right", at: null });
        expect(size(t)[1]).toBe(3);
        expect(slotsOf(t, ctx)).toHaveLength(13);
        expect(outlineGapOf(boxTool, t.params, 13)!.gap.side).toBe("right");
    });

    it("spreads the gap's side evenly, off the half steps, with no gap to show", () => {
        let t = gapped(13, 60, 40);
        // 6 across: 5 intervals on the back
        t = edit(
            t,
            withFieldCount(t.params as BoxParams, 13, "across", 6, env),
            ctx,
        );
        t = withGap(t, { style: "spread" });
        const xs = backRow(t);
        expect(xs).toHaveLength(5);
        const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!);
        // 5 intervals of 1½ steps spread over 4 gaps
        expect(gaps[0]).toBeCloseTo(75 / 4);
        expect(outlineGapAt(boxTool, t.params, 13)).toBeNull();
        expect(slotsOf(t, ctx)).toHaveLength(13);
        // A click on another side's spot moves the spread there
        const p = t.params as BoxParams;
        const [, backRight, frontRight] = boxCorners(p, 13);
        const moved = gapPickAt(
            boxTool,
            p,
            13,
            { x: backRight!.x, y: frontRight!.y - p.deep },
            env,
        );
        expect(outlineGapOf(boxTool, moved, 13)!.gap).toMatchObject({
            side: "right",
            style: "spread",
        });
    });

    it("works the same on a kind the host has never heard of", () => {
        const t = drawn(padTool, 9, { x: 100, y: 100 }, { x: 140, y: 100 });
        const outline = withMode(padTool, t.params, 9, "outline", env);
        const o = edit(
            t,
            withOddGap(
                padTool,
                outline,
                9,
                { ...DEFAULT_ODD_GAP, style: "gap" },
                env,
            ),
            ctx,
        );
        const gap = outlineGapAt(padTool, o.params, 9);
        expect(gap).not.toBeNull();
        expect(has(slotsOf(o, ctx), gap!)).toBe(false);
        const spot = slotsOf(o, ctx).find(
            (s) => gapPickAt(padTool, o.params, 9, s, env) !== null,
        )!;
        let u = press(o, spot, env);
        u = release(u, ctx, { double: false });
        expect(near(outlineGapAt(padTool, u.params, 9)!, spot)).toBe(true);
    });
});

/** What placing `t` saves, through JSON as the database keeps it, read back as a placed box */
function reopened(t: ToolState) {
    const placement = placementOf(t, ctx)!;
    const recipe: PlacedRecipe = {
        ...placement.recipe,
        id: 1,
        timelineId: 10,
        members: placement.members,
        params: JSON.parse(JSON.stringify(placement.recipe.params)),
    };
    const at = new Map(placement.members.map((m) => [m.marcherId, m]));
    const [box] = boxesAt({
        recipes: [recipe],
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
    });
    return { box: box!, stored: recipe.params as Record<string, unknown> };
}

describe("the gap in recipes", () => {
    it("round-trips through the recipe", () => {
        let t = gapped(13, 60, 40);
        t = withGap(t, { side: "right", at: 1, style: "gap" });
        const { box, stored } = reopened(t);
        expect(stored.distribution).toEqual({
            mode: "outline",
            oddGap: { side: "right", at: 1, style: "gap" },
        });
        expect(boxTool.shape.generate(box.params, 13, ctx)).toEqual(
            slotsOf(t, ctx),
        );
    });

    it("goes back to the middle of its side when the count changes and its spot is gone", () => {
        // 5 × 4 has spots 1–3 along the back; picking 3, then 7 marchers (4 × 2) have 1–2
        let t = gapped(13, 60, 40);
        t = withGap(t, { side: "back", at: 3 });
        expect(outlineGapOf(boxTool, t.params, 13)!.gap.at).toBe(3);
        const fewer = outlineGapOf(boxTool, t.params, 7)!;
        expect(fewer.gap).toMatchObject({ side: "back", at: 2 });
        // A spot that still exists stays
        expect(outlineGapOf(boxTool, t.params, 15)!.gap.at).toBe(3);
    });

    it("reads a missing or broken gap as the back's middle, leaving a gap", () => {
        const t = gapped(13, 60, 40);
        for (const oddGap of [
            undefined,
            { side: "top", at: -2, style: "zigzag" },
        ]) {
            const p = {
                ...(t.params as BoxParams),
                distribution: { mode: "outline", oddGap },
            } as unknown as BoxParams;
            expect(boxDistribution(p)).toEqual({
                mode: "outline",
                oddGap: DEFAULT_ODD_GAP,
            });
        }
    });

    it("a placed box whose gap moves lays its members out on the new spots", () => {
        const t = gapped(13, 60, 40);
        const { box } = reopened(t);
        const p = box.params;
        const [, , frontRight] = boxCorners(p, 13);
        const spot = { x: frontRight!.x - p.across, y: frontRight!.y };
        const moved = gapPickAt(boxTool, p, 13, spot, env) as BoxParams;
        const { members } = liveTargets(box, moved, ctx);
        const spots = boxTool.shape.generate(moved, 13, ctx);
        expect(members).toHaveLength(13);
        expect(new Set(members.map(key)).size).toBe(13);
        for (const m of members) expect(has(spots, m)).toBe(true);
        expect(has(members, spot)).toBe(false);
    });
});
