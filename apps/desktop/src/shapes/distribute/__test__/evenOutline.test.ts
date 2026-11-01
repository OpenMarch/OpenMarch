// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../../box/boxTool";
import {
    boxCorners,
    boxDistribution,
    boxFrame,
    drawBox,
    onField,
    resizeFiles,
    stretchBox,
    type BoxParams,
} from "../../box/boxGeometry";
import { withSpacing } from "../../editor/boxEdits";
import { chipLayout } from "../../editor/chip";
import { DEFAULT_ODD_GAP, savedDistributionOf } from "../distribution";
import { shapeSteps } from "../../command/shapeSteps";
import { withMode } from "../modes";
import { acrossRange } from "../outline";
import { leftoverSpacing } from "../outlineGap";
import { distribute } from "../distribute";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    targetsOf,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Outline (#458, owner on #459): both spacings are the designer's and stay exactly as set, as
 * in Grid. A drag moves the dragged edge in whole spacings, marchers moving between the sides,
 * the opposite edge kept; Even out spreads them as evenly as the box allows.
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

/** `n` marchers drawn in a `w` × `d` box, switched to Outline */
function outline(n: number, w: number, d: number): BoxParams {
    const files = drawBox({ x: 0, y: 0 }, { x: w, y: d }, n, env)!;
    return withMode(boxTool, files, n, "outline", env) as BoxParams;
}

/** The spots, in the box's own frame (x across, y deep) */
const spotsOf = (p: BoxParams, n: number) =>
    boxTool.closed!.layouts!.resolved(p, n) === null
        ? distribute({
              n,
              region: boxTool.closed!.region(p, n),
              across: p.across,
              deep: p.deep,
              distribution: boxDistribution(p),
          })
        : [];

/** How many spots stand on each side, corners counted on both */
function sideCounts(p: BoxParams, n: number) {
    const spots = spotsOf(p, n);
    const xs = spots.map((s) => s.x);
    const ys = spots.map((s) => s.y);
    const [l, r, t, b] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
    ];
    const on = (f: (s: XY) => boolean) => spots.filter(f).length;
    const near = (u: number, v: number) => Math.abs(u - v) < 1e-6;
    return {
        back: on((s) => near(s.y, t)),
        front: on((s) => near(s.y, b)),
        left: on((s) => near(s.x, l)),
        right: on((s) => near(s.x, r)),
        spots,
        bounds: { l, r, t, b },
    };
}

const LINES = { x: [-160, -80, 0, 80, 160, 240], y: [0, -280, -560] };
const lined = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    ...env,
    fieldLines: LINES,
    pullRadius: 6,
    ...over,
});
const onHalves = (v: number) =>
    Math.abs(v / half - Math.round(v / half)) < 1e-9;
const edgesOf = (q: BoxParams, n: number) => {
    const cs = boxCorners(q, n);
    return {
        left: Math.min(...cs.map((c) => c.x)),
        right: Math.max(...cs.map((c) => c.x)),
        top: Math.min(...cs.map((c) => c.y)),
        bottom: Math.max(...cs.map((c) => c.y)),
    };
};
/** The frame's length one way: gaps times that way's spacing */
const lengthOf = (q: BoxParams, n: number, way: "across" | "deep") =>
    (onField(q, n)[way] - 1) * q[way];

describe("an outline: both spacings are the designer's, held exactly (owner on #459)", () => {
    it("a 2:1 rectangle of 100 switched to Outline keeps its frame, about twice as many on its long sides", () => {
        const files = drawBox({ x: 0, y: 0 }, { x: 400, y: 200 }, 100, env)!;
        const frame = boxTool.frameOf(files, 100);
        const aspect = frame.halfWidth / frame.halfDepth;
        expect(aspect).toBeGreaterThan(1.9);
        expect(aspect).toBeLessThan(2.3);
        const p = withMode(boxTool, files, 100, "outline", env) as BoxParams;
        const { back, front, left, right } = sideCounts(p, 100);
        expect(back).toBe(front);
        expect(left).toBe(right);
        expect(Math.abs((back - 1) / (left - 1) / aspect - 1)).toBeLessThan(
            0.15,
        );
        const kept = boxTool.frameOf(p, 100);
        expect(kept.halfWidth).toBeCloseTo(frame.halfWidth, 9);
        expect(kept.halfDepth).toBeCloseTo(frame.halfDepth, 9);
    });

    it("spaces the back and front at across and the sides at deep, with a marcher on every corner", () => {
        for (const [n, w, d] of [
            [100, 400, 200],
            [24, 120, 50],
            [40, 90, 90],
            [31, 70, 60],
        ] as const) {
            const p = outline(n, w, d);
            const { spots, bounds } = sideCounts(p, n);
            for (const c of [
                { x: bounds.l, y: bounds.t },
                { x: bounds.r, y: bounds.t },
                { x: bounds.l, y: bounds.b },
                { x: bounds.r, y: bounds.b },
            ])
                expect(
                    spots.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 1e-6),
                    `${n}: corner`,
                ).toBe(true);
        }
    });

    for (const order of [
        ["across", "deep"],
        ["deep", "across"],
    ] as const)
        it(`2 steps across and 3 deep stay exactly as set, set ${order.join(" then ")}; the size follows, and doing it again changes nothing`, () => {
            const p = outline(24, 120, 50);
            const counts = onField(p, 24);
            const value = { across: 2, deep: 3 };
            let q = withSpacing(p, order[0], value[order[0]], 24, env);
            q = withSpacing(q, order[1], value[order[1]], 24, env);
            expect([q.across, q.deep]).toEqual([20, 30]);
            expect(onField(q, 24)).toMatchObject({
                across: counts.across,
                deep: counts.deep,
            });
            expect(lengthOf(q, 24, "across")).toBeCloseTo(
                (counts.across - 1) * 20,
                9,
            );
            expect(lengthOf(q, 24, "deep")).toBeCloseTo(
                (counts.deep - 1) * 30,
                9,
            );
            expect(withSpacing(q, order[1], value[order[1]], 24, env)).toBe(q);
            expect(withSpacing(q, order[0], value[order[0]], 24, env)).toBe(q);
        });

    describe("dragging a handle sets that way's spacing, the counts kept (owner on #459)", () => {
        /** 24 round 8 × 6, 2 steps apart both ways, its back-left corner at 0, -200 */
        const box = (over: Partial<BoxParams> = {}): BoxParams => ({
            center: { x: 70, y: -150 },
            rotation: 0,
            files: 8,
            across: 20,
            deep: 20,
            distribution: { mode: "outline", oddGap: DEFAULT_ODD_GAP },
            ...over,
        });
        const handle = (p: BoxParams, key: string) =>
            boxTool.handles(p, 24).find((h) => h.key === key)!.at;
        const countsOf = (q: BoxParams) => {
            const c = onField(q, 24);
            return [c.across, c.deep];
        };

        for (const key of ["e", "w", "n", "s"] as const)
            for (const way of [1, -1])
                it(`the ${key} edge dragged ${way > 0 ? "out" : "in"} follows the pointer by half steps of its spacing; the opposite edge, the other spacing and the counts stay`, () => {
                    const p = box();
                    const was = edgesOf(p, 24);
                    const h = handle(p, key);
                    const across = key === "e" || key === "w";
                    const dir = across
                        ? { x: (key === "e" ? 1 : -1) * way, y: 0 }
                        : { x: 0, y: (key === "s" ? 1 : -1) * way };
                    const opposite = {
                        e: "left",
                        w: "right",
                        s: "top",
                        n: "bottom",
                    }[key] as keyof typeof was;
                    const gaps = across ? 7 : 5;
                    let moved = false;
                    for (let px = 0.5; px <= 60; px += 0.5) {
                        const q = stretchBox(
                            p,
                            24,
                            key,
                            { x: h.x + dir.x * px, y: h.y + dir.y * px },
                            env,
                        );
                        expect(countsOf(q)).toEqual([8, 6]);
                        expect(across ? q.deep : q.across).toBe(20);
                        const now = edgesOf(q, 24);
                        expect(
                            Math.abs(now[opposite] - was[opposite]),
                        ).toBeLessThan(1e-6);
                        // The spacing nearest the pointer on the half steps, never under half a step
                        const spacing = across ? q.across : q.deep;
                        const wanted = Math.max(
                            half,
                            snapHalf((gaps * 20 + way * px) / gaps),
                        );
                        expect(spacing).toBeCloseTo(wanted, 9);
                        if (spacing !== 20) moved = true;
                    }
                    expect(moved).toBe(true);
                });

        it("an e drag of 60 px moves the e edge by the nearest 7 × half-step amount", () => {
            const p = box();
            const h = handle(p, "e");
            const q = stretchBox(p, 24, "e", { x: h.x + 60, y: h.y }, env);
            const moved = edgesOf(q, 24).right - edgesOf(p, 24).right;
            // 60 / 7 is 8.57: the nearest half-step spacing change is 10, so 70
            expect(moved).toBeCloseTo(70, 9);
            expect(q.across).toBe(30);
        });

        it("with fine the edge follows smoothly, in hundredths; with the Snap toggle off too, with no pull", () => {
            const p = box();
            const h = handle(p, "e");
            for (const over of [
                { snap: false, fine: true },
                { snap: false, pull: false },
            ]) {
                const seen = new Set<number>();
                for (let px = 0; px <= 20; px += 0.5) {
                    const q = stretchBox(
                        p,
                        24,
                        "e",
                        { x: h.x + px, y: h.y },
                        { ...env, ...over },
                    );
                    expect(q.across).toBeCloseTo(
                        Math.round(((140 + px) / 7) * 10) / 10,
                        9,
                    );
                    seen.add(q.across);
                }
                expect(seen.size).toBeGreaterThan(20);
            }
        });

        it("a corner drag sets both spacings, one per way, and a diagonal sweep never flickers", () => {
            const p = box();
            const se = handle(p, "se");
            let last = { across: 0, deep: 0 };
            for (let t = 0; t <= 80; t += 0.5) {
                const q = stretchBox(
                    p,
                    24,
                    "se",
                    { x: se.x + t, y: se.y + t },
                    env,
                );
                expect(countsOf(q)).toEqual([8, 6]);
                expect(q.across).toBeCloseTo(snapHalf((140 + t) / 7), 9);
                expect(q.deep).toBeCloseTo(snapHalf((100 + t) / 5), 9);
                expect(q.across).toBeGreaterThanOrEqual(last.across);
                expect(q.deep).toBeGreaterThanOrEqual(last.deep);
                last = q;
                const e = edgesOf(q, 24);
                expect(e.left).toBeCloseTo(0, 9);
                expect(e.top).toBeCloseTo(-200, 9);
            }
            expect(last.across).toBeGreaterThan(20);
            expect(last.deep).toBeGreaterThan(20);
        });

        it("an edge near a line the pointer is near lands on it, within the radius, the counts kept", () => {
            // The right edge at 140; the pointer 3 past the 160 lands it on the 160
            const p = box();
            const h = handle(p, "e");
            const free = stretchBox(
                p,
                24,
                "e",
                { x: 163, y: h.y },
                lined({ pull: false, snap: false }),
            );
            const pulled = stretchBox(p, 24, "e", { x: 163, y: h.y }, lined());
            expect(edgesOf(free, 24).right).toBeCloseTo(163, 0);
            expect(edgesOf(pulled, 24).right).toBeCloseTo(160, 9);
            expect(pulled.across).toBeCloseTo(160 / 7, 9);
            expect(countsOf(pulled)).toEqual([8, 6]);
            expect(pulled.deep).toBe(20);
        });

        it("with fine, an edge still lands on a line", () => {
            const p = box();
            const h = handle(p, "e");
            const q = stretchBox(
                p,
                24,
                "e",
                { x: 157, y: h.y },
                lined({ snap: false, fine: true }),
            );
            expect(edgesOf(q, 24).right).toBeCloseTo(160, 9);
        });

        it("an s drag ignores the pointer's sideways drift", () => {
            const p = box();
            const s = handle(p, "s");
            for (let t = 0; t <= 30; t += 0.5) {
                const at = (dx: number) =>
                    stretchBox(
                        p,
                        24,
                        "s",
                        { x: s.x + dx, y: s.y + t },
                        lined(),
                    );
                const straight = at(0);
                for (const dx of [-7, -2, 3, 7])
                    expect(at(dx), `${t}`).toEqual(straight);
            }
        });

        it("ignores the ratio lock", () => {
            const p = box();
            const h = handle(p, "e");
            const q = stretchBox(
                p,
                24,
                "e",
                { x: h.x + 70, y: h.y },
                { ...env, ratioLocked: true },
            );
            expect([q.across, q.deep]).toEqual([30, 20]);
        });

        for (const key of ["e", "n"] as const)
            it(`a turned box's ${key} side drag keeps its opposite edge, the other spacing and the counts`, () => {
                const p = box({ rotation: (30 * Math.PI) / 180 });
                const corner = (q: BoxParams, sx: number, sy: number) => {
                    const f = boxFrame(q, 24);
                    const [c, s] = [Math.cos(f.rotation), Math.sin(f.rotation)];
                    const x = sx * f.halfWidth;
                    const y = sy * f.halfDepth;
                    return {
                        x: f.center.x + x * c - y * s,
                        y: f.center.y + x * s + y * c,
                    };
                };
                // e keeps the left edge; n the front
                const ends =
                    key === "e"
                        ? ([
                              [-1, -1],
                              [-1, 1],
                          ] as const)
                        : ([
                              [-1, 1],
                              [1, 1],
                          ] as const);
                const h = handle(p, key);
                const out =
                    key === "e"
                        ? { x: Math.cos(p.rotation), y: Math.sin(p.rotation) }
                        : { x: Math.sin(p.rotation), y: -Math.cos(p.rotation) };
                let moved = false;
                for (let t = -30; t <= 60; t += 1.5) {
                    const q = stretchBox(
                        p,
                        24,
                        key,
                        { x: h.x + out.x * t, y: h.y + out.y * t },
                        lined(),
                    );
                    expect(q.rotation).toBe(p.rotation);
                    expect(countsOf(q)).toEqual([8, 6]);
                    expect(key === "e" ? q.deep : q.across).toBe(20);
                    for (const [sx, sy] of ends) {
                        const was = corner(p, sx, sy);
                        const now = corner(q, sx, sy);
                        expect(now.x).toBeCloseTo(was.x, 6);
                        expect(now.y).toBeCloseTo(was.y, 6);
                    }
                    if ((key === "e" ? q.across : q.deep) !== 20) moved = true;
                }
                expect(moved).toBe(true);
            });
    });

    it("shows a spacing off the half steps (after a switch) as about so much; pressing it puts it on the nearest half step", () => {
        const p = outline(31, 70, 60);
        expect(onHalves(p.across)).toBe(false);
        const layout = chipLayout(boxTool, p, 31, env);
        const across = layout.intervals.find((x) => x.param.key === "across")!;
        expect(across.derived).toBe(true);
        expect(layout.ratioLock).toBe(false);
        const snapped = across.param.snap!(p, 31, env) as BoxParams;
        expect(onHalves(snapped.across)).toBe(true);
        expect(snapped.deep).toBe(p.deep);
        expect(across.param.snap!(snapped, 31, env)).toBe(snapped);
    });

    it("a count changed keeps both spacings, the lengths following", () => {
        const p = outline(24, 120, 50);
        const q = resizeFiles(p, 24, onField(p, 24).across - 1, env);
        expect([q.across, q.deep]).toEqual([p.across, p.deep]);
    });

    it('opens an outline stored before unchanged, the exact: "deep" a build of #459 wrote too', () => {
        const stored: BoxParams = {
            center: { x: 0, y: 0 },
            rotation: 0,
            files: 6,
            across: 15,
            deep: 25,
            distribution: { mode: "outline", oddGap: DEFAULT_ODD_GAP },
        };
        const withExact = {
            ...stored,
            distribution: { ...stored.distribution!, exact: "deep" },
        } as unknown as BoxParams;
        for (const q of [stored, withExact]) {
            const { spots } = sideCounts(q, 16);
            const xs = spots.map((s) => s.x);
            const ys = spots.map((s) => s.y);
            expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(75, 9);
            expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(75, 9);
            expect(boxDistribution(q)).not.toHaveProperty("exact");
        }
        expect(
            savedDistributionOf(boxDistribution(withExact)),
        ).not.toHaveProperty("exact");
    });

    describe("Even out", () => {
        /** The least uneven any split of `n` round a `w` × `d` frame can be */
        const bestScore = (n: number, w: number, d: number) => {
            const sum = Math.ceil(n / 2);
            const { min, max } = acrossRange(n, DEFAULT_ODD_GAP.side);
            let best = Infinity;
            for (let a = min; a <= max; a++) {
                const across = w / a;
                const deep = d / (sum - a);
                if (Math.min(across, deep) < half - 1e-9) continue;
                best = Math.min(best, Math.abs(Math.log(deep / across)));
            }
            return best;
        };
        for (const [n, w, d] of [
            [24, 120, 50],
            [40, 100, 100],
            [31, 70, 60],
            [100, 400, 200],
            [15, 160, 60],
        ] as const)
            it(`spreads ${n} round a ${w} × ${d} box as evenly as its frame allows, keeps the frame, and pressed again changes nothing`, () => {
                // Uneven first: set spacings the frame doesn't suit
                const p = withSpacing(
                    withSpacing(outline(n, w, d), "across", 2, n, env),
                    "deep",
                    4,
                    n,
                    env,
                );
                const width = lengthOf(p, n, "across");
                const depth = lengthOf(p, n, "deep");
                const q = boxTool.closed!.evenOut!(p, n, env) as BoxParams;
                expect(q).not.toBe(p);
                expect(lengthOf(q, n, "across")).toBeCloseTo(width, 6);
                expect(lengthOf(q, n, "deep")).toBeCloseTo(depth, 6);
                expect(
                    Math.abs(Math.log(q.deep / q.across)),
                ).toBeLessThanOrEqual(bestScore(n, width, depth) + 1e-9);
                expect(boxTool.closed!.evenOut!(q, n, env)).toBe(q);
            });

        it("has nothing to do for a box in Grid", () => {
            const files = drawBox({ x: 0, y: 0 }, { x: 120, y: 50 }, 24, env)!;
            expect(boxTool.closed!.evenOut!(files, 24, env)).toBeUndefined();
        });
    });

    it("never takes a spacing under half a step, whatever the edit", () => {
        let q = outline(24, 120, 30);
        for (const [which, v] of [
            ["across", 0.5],
            ["deep", 4],
            ["across", 6],
            ["deep", 0.5],
        ] as const) {
            q = withSpacing(q, which, v, 24, env);
            expect(Math.min(q.across, q.deep)).toBeGreaterThanOrEqual(
                half - 1e-9,
            );
        }
        for (const key of ["s", "e", "se", "n", "w"] as const) {
            const c = boxTool.frameOf(q, 24).center;
            const out = stretchBox(q, 24, key, { x: c.x, y: c.y }, env);
            expect(Math.min(out.across, out.deep), key).toBeGreaterThanOrEqual(
                half - 1e-9,
            );
        }
        const evened = boxTool.closed!.evenOut!(q, 24, env) as BoxParams;
        expect(Math.min(evened.across, evened.deep)).toBeGreaterThanOrEqual(
            half - 1e-9,
        );
    });

    it("Even out after a drag moves marchers between sides and works out who goes where again: no walks cross", () => {
        const marchers = Array.from({ length: 24 }, (_, i) => ({
            id: i + 1,
            at: { x: -200 + (i % 8) * 30, y: 200 + Math.floor(i / 8) * 30 },
            drillRank: i,
        }));
        let t = openTool(boxTool, marchers);
        t = press(t, { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 70, y: 50 }, env);
        t = release(t, ctx);
        t = edit(t, withMode(boxTool, t.params, 24, "outline", env), ctx);
        const before = onField(t.params as BoxParams, 24);
        const e = boxTool.handles(t.params, 24).find((h) => h.key === "e")!.at;
        t = press(t, e, env);
        t = pointerMove(t, { x: e.x + 90, y: e.y }, env);
        t = release(t, ctx);
        // A drag keeps the counts; Even out moves marchers onto the now longer back and front
        expect(onField(t.params as BoxParams, 24).across).toBe(before.across);
        t = edit(t, boxTool.closed!.evenOut!(t.params, 24, env)!, ctx);
        const after = onField(t.params as BoxParams, 24);
        expect(after.across).toBeGreaterThan(before.across);
        const walks = targetsOf(t, ctx);
        const cross = (a: { from: XY; to: XY }, b: { from: XY; to: XY }) => {
            const side = (p: XY, q: XY, r: XY) =>
                Math.sign(
                    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x),
                );
            return (
                side(a.from, a.to, b.from) * side(a.from, a.to, b.to) < 0 &&
                side(b.from, b.to, a.from) * side(b.from, b.to, a.to) < 0
            );
        };
        for (let i = 0; i < walks.length; i++)
            for (let j = i + 1; j < walks.length; j++)
                expect(cross(walks[i]!, walks[j]!), `${i} × ${j}`).toBe(false);
    });

    it("the command bar asks both spacings", () => {
        const p = outline(24, 120, 50);
        const keys = shapeSteps(boxTool, p, 24, env, []).steps.map(
            (st) => st.param.key,
        );
        expect(keys).toEqual(expect.arrayContaining(["across", "deep"]));
    });
});

describe("an odd outline: the full sides are the reference, the leftover side adjusts (owner on #459)", () => {
    /** 15 round 6 × 4 (5 gaps across, 3 deep), the back leaving its spot out */
    const fifteen = (
        across: number,
        side: "back" | "front" | "left" | "right" = "back",
        style: "spread" | "gap" = "spread",
    ): BoxParams => ({
        center: { x: 0, y: 0 },
        rotation: 0,
        files: 6,
        across,
        deep: 30,
        distribution: { mode: "outline", oddGap: { side, at: null, style } },
    });
    /** The spots along one side, in order */
    const sideSpots = (q: BoxParams, n: number, side: string) => {
        const { spots, bounds } = sideCounts(q, n);
        const near = (u: number, v: number) => Math.abs(u - v) < 1e-6;
        const on =
            side === "back"
                ? (s: XY) => near(s.y, bounds.t)
                : side === "front"
                  ? (s: XY) => near(s.y, bounds.b)
                  : side === "left"
                    ? (s: XY) => near(s.x, bounds.l)
                    : (s: XY) => near(s.x, bounds.r);
        const across = side === "back" || side === "front";
        return spots
            .filter(on)
            .map((s) => (across ? s.x : s.y))
            .sort((a, b) => a - b);
    };
    const gapsOf = (xs: number[]) => xs.slice(1).map((v, i) => v - xs[i]!);

    it("the chip has the full sides' spacing (the front's ≈3.2), the back a clean 4 that the Leftover pill shows", () => {
        const p = fifteen(32);
        const across = chipLayout(boxTool, p, 15, env).intervals.find(
            (x) => x.param.key === "across",
        )!;
        expect(across.display).toBe("3.2");
        expect(across.derived).toBe(true);
        for (const g of gapsOf(sideSpots(p, 15, "front")))
            expect(g).toBeCloseTo(32, 9);
        for (const g of gapsOf(sideSpots(p, 15, "back")))
            expect(g).toBeCloseTo(40, 9);
        expect(leftoverSpacing(boxTool, p, 15)).toBeCloseTo(40, 9);
    });

    it("an across edit holds the full sides' spacing on its half step, the back following (≈3¾), and again changes nothing", () => {
        const p = fifteen(32);
        const q = withSpacing(p, "across", 3, 15, env);
        expect(q.across).toBe(30);
        for (const g of gapsOf(sideSpots(q, 15, "front")))
            expect(g).toBeCloseTo(30, 9);
        const left = leftoverSpacing(boxTool, q, 15)!;
        expect(left).toBeCloseTo(
            (30 * onFieldGaps(q)) / (onFieldGaps(q) - 1),
            9,
        );
        expect(left).toBeGreaterThanOrEqual(half - 1e-9);
        expect(withSpacing(q, "across", 3, 15, env)).toEqual(q);
    });

    it("leaving a gap, the back's marchers keep the full spacing and one spot is empty", () => {
        const p = fifteen(30, "back", "gap");
        expect(leftoverSpacing(boxTool, p, 15)).toBeNull();
        const back = sideSpots(p, 15, "back");
        expect(back).toHaveLength(5);
        const gaps = gapsOf(back);
        // Every gap the full spacing, but for the one spot left out (twice as wide)
        expect(gaps.filter((g) => Math.abs(g - 30) < 1e-6)).toHaveLength(3);
        expect(gaps.filter((g) => Math.abs(g - 60) < 1e-6)).toHaveLength(1);
    });

    for (const side of ["back", "front", "left", "right"] as const)
        it(`spreading on the ${side}, that side's marchers share its length and the rest keep the full spacing`, () => {
            const p = fifteen(30, side);
            const across = side === "back" || side === "front";
            const len = across ? 5 : 3;
            const full = across ? 30 : 30;
            const spread = leftoverSpacing(boxTool, p, 15)!;
            expect(spread).toBeCloseTo((len * full) / (len - 1), 9);
            for (const g of gapsOf(sideSpots(p, 15, side)))
                expect(g).toBeCloseTo(spread, 9);
            const opposite =
                side === "back"
                    ? "front"
                    : side === "front"
                      ? "back"
                      : side === "left"
                        ? "right"
                        : "left";
            for (const g of gapsOf(sideSpots(p, 15, opposite)))
                expect(g).toBeCloseTo(full, 9);
        });

    it("an even count (22) has no leftover side", () => {
        const p = outline(22, 160, 100);
        expect(leftoverSpacing(boxTool, p, 22)).toBeNull();
        expect(sideCounts(p, 22).back).toBe(sideCounts(p, 22).front);
    });
});

/** Gaps along the back and front of a 15-spot outline (a) */
function onFieldGaps(q: BoxParams): number {
    return onField(q, 15).across - 1;
}
