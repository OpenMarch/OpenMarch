// cspell:ignore lerp
/**
 * Ends along the way, pathways step 4b (spec R-13″, Appendix L): the resolver half of QA-DL-1,
 * QA-DL-2, QA-DL-5 and QA-DL-6, the validator, the cache, and agreement with the spec's own
 * reference oracle in `docs/timeline/ref`.
 *
 * Expected positions are worked by hand on corners (the way is a polyline there), never from
 * `../geom`.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import {
    walkedPath,
    walkedPathPointAt,
    WALKED_SAMPLE_TOLERANCE,
} from "../walkedPath";
import type {
    RouteGeometry,
    RoutePoint,
    RowImage,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { validatePathParams } from "../validate";
import { mulberry32 } from "./showGenerators";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { makeOracle } from "../../../../../docs/timeline/ref/oracle.mjs";

const refOracle = makeOracle as (db: TimelineSnapshot) => {
    positionAt(m: number, b: number): XY;
};

const clone = <T>(x: T): T => structuredClone(x);
const near = (a: XY, b: XY, eps = 1e-9) =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const same = (a: XY, b: XY) => Object.is(a[0], b[0]) && Object.is(a[1], b[1]);

/** A point at distance `d` along a polyline, by a linear scan (this file's own). */
function along(pts: XY[], d: number): XY {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= acc + len && len > 0) {
            const f = (d - acc) / len;
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        acc += len;
    }
    return pts[pts.length - 1]!;
}

const corners = (pts: XY[]): RoutePoint[] =>
    pts.map((at, i) => ({ id: `p${i}`, at }));

/**
 * `n` marchers on a line 2 apart from (0,0), slot order (the right end leads), over [0, 16), no
 * shape, ends along the way, spots `spots`, and a trail route through `points` (last = the end).
 */
function alongShow(
    n: number,
    points: RoutePoint[] | null,
    spots: XY[],
    over: Partial<TransitionRow> = {},
): TimelineSnapshot {
    const homes = Array.from({ length: n }, (_, i): XY => [2 * i, 0]);
    const last = points?.[points.length - 1]?.at ?? homes[n - 1]!;
    const geometry: RouteGeometry | null = points
        ? { v: 1, from: homes[n - 1]!, to: last, points }
        : null;
    return {
        marchers: homes.map((home, i) => ({ id: i + 1, home })),
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 16,
                dest: null,
                points: spots,
                slots: n,
                style: "follow_the_leader",
                order: "slot",
                params: { waypoints: [], ends: "along" },
                ...(geometry ? { route: 1 } : {}),
                ...over,
            },
        },
        routes: geometry ? { 1: { geometry } } : {},
        assignments: homes.map((_, i) => ({
            id: i + 1,
            marcher: i + 1,
            transition: 1,
            slot: i,
            start: 0,
            end: 16,
            layer: 0,
        })),
    };
}

/** QA-DL-1's way: six marchers 2 apart, then 10 right and 10 up from the leader at (10,0). */
const WAY: XY[] = [
    [0, 0],
    [10, 0],
    [20, 0],
    [20, 10],
];
const TRAIL = corners([
    [20, 0],
    [20, 10],
]);

describe("ends along the way (spec R-13″, pathways step 4b)", () => {
    it("QA-DL-1: Keep spacing, each member 20 along the way, at every quarter beat, matching both oracles", () => {
        // e_q = startDist[q] + 20 = 2q + 20; the spots are P(e_q), as the gesture writes them
        const spots = [0, 1, 2, 3, 4, 5].map((q) => along(WAY, 2 * q + 20));
        expect(spots[0]).toEqual([20, 0]); // the tail at the corner
        expect(spots[5]).toEqual([20, 10]); // the leader at the trail's end
        const db = alongShow(6, TRAIL, spots);
        const res = createCachedResolver(clone(db));
        const oracle = createOracle(clone(db));
        const ref = refOracle(clone(db));
        const e = res.ftlEntry(1);
        expect(e.members).toEqual([1, 2, 3, 4, 5, 6]);
        expect(e.startDist).toEqual([0, 2, 4, 6, 8, 10]);
        e.endDist.forEach((d, q) => expect(d).toBeCloseTo(2 * q + 20, 12));
        for (let b = 0; b <= 16; b += 0.25)
            for (let q = 0; q < 6; q++) {
                const x = res.positionAt(q + 1, b);
                const want = along(WAY, 2 * q + (20 * Math.min(b, 16)) / 16);
                expect(near(x, want), `M${q + 1}@${b}: ${x} vs ${want}`).toBe(
                    true,
                );
                expect(near(x, oracle.positionAt(q + 1, b))).toBe(true);
                expect(near(x, ref.positionAt(q + 1, b))).toBe(true);
            }
        // ends exact, bit for bit
        spots.forEach((s, q) =>
            expect(same(res.positionAt(q + 1, 16), s)).toBe(true),
        );
    });

    it("QA-DL-2: Even 1 step ends 1 apart from the leader back; each walks at its own steady speed", () => {
        // e_q = lineLen + W.L - (m - 1 - q) * 1 = 30 - (5 - q)
        const ends = [0, 1, 2, 3, 4, 5].map((q) => 30 - (5 - q));
        const spots = ends.map((d) => along(WAY, d));
        const db = alongShow(6, TRAIL, spots);
        const res = createCachedResolver(clone(db));
        res.ftlEntry(1).endDist.forEach((d, q) =>
            expect(d).toBeCloseTo(ends[q]!, 12),
        );
        for (let b = 0; b <= 16; b += 0.25)
            for (let q = 0; q < 6; q++) {
                const s = 2 * q;
                const want = along(WAY, s + ((ends[q]! - s) * b) / 16);
                expect(near(res.positionAt(q + 1, b), want)).toBe(true);
            }
    });

    it("QA-DL-5 (DL-10): a short trail leaves the tail on the old line, moved along it", () => {
        // eight marchers 2 apart (line 14 long), a trail of 6 straight on: Keep spacing puts the
        // five at the back on the old line, 6 further along it, and three on the trail
        const trail = corners([[20, 0]]);
        const way: XY[] = [
            [0, 0],
            [14, 0],
            [20, 0],
        ];
        const spots = Array.from({ length: 8 }, (_, q) =>
            along(way, 2 * q + 6),
        );
        const db = alongShow(8, trail, spots);
        const res = createCachedResolver(clone(db));
        for (let q = 0; q < 8; q++) {
            const end = res.positionAt(q + 1, 16);
            expect(same(end, spots[q]!)).toBe(true);
            expect(end[0] <= 14 ? "line" : "trail").toBe(
                q < 5 ? "line" : "trail",
            );
            // halfway, everyone is 3 along
            expect(near(res.positionAt(q + 1, 8), along(way, 2 * q + 3))).toBe(
                true,
            );
        }
    });

    it("QA-DL-6: the trail reshaped after: the spots stay, members walk the new way to their projection, then straight to their spot", () => {
        const spots = [0, 1, 2, 3, 4, 5].map((q) => along(WAY, 2 * q + 20));
        const db = alongShow(6, TRAIL, spots);
        // the corner dragged from (20,0) to (20,-4): the way is now (10,0) (20,-4) (20,10)
        db.routes![1]!.geometry.points[0]!.at = [20, -4];
        const way: XY[] = [
            [0, 0],
            [10, 0],
            [20, -4],
            [20, 10],
        ];
        const res = createCachedResolver(clone(db));
        const ref = refOracle(clone(db));
        const e = res.ftlEntry(1);
        const c = Math.hypot(10, 4);
        // each spot (20, y) with y >= 0 projects onto the last leg at 10 + c + 4 + y
        e.endDist.forEach((d, q) =>
            expect(d).toBeCloseTo(10 + c + 4 + spots[q]![1], 9),
        );
        for (let q = 0; q < 6; q++) {
            expect(same(res.positionAt(q + 1, 16), spots[q]!)).toBe(true);
            for (let b = 0; b <= 16; b += 0.25) {
                const x = res.positionAt(q + 1, b);
                expect(near(x, ref.positionAt(q + 1, b))).toBe(true);
                // on the way (the spots are on it, so there is no straight leg)
                const want = along(
                    way,
                    2 * q + ((e.endDist[q]! - 2 * q) * b) / 16,
                );
                expect(near(x, want, 1e-9)).toBe(true);
            }
        }
        // one spot moved off the way: only its member changes, walking straight at the end
        const moved = clone(db);
        moved.transitions[1]!.points![2] = [23, 4];
        const res2 = createCachedResolver(moved);
        for (const q of [0, 1, 3, 4, 5])
            for (let b = 0; b <= 16; b += 0.25)
                expect(
                    same(res2.positionAt(q + 1, b), res.positionAt(q + 1, b)),
                ).toBe(true);
        const e2 = res2.ftlEntry(1);
        expect(e2.endDist[2]).toBeCloseTo(10 + c + 4 + 4, 9); // projects onto (20,4)
        expect(e2.along!.straight[2]).toBeCloseTo(3, 12);
        expect(same(res2.positionAt(3, 16), [23, 4])).toBe(true);
        // the straight leg is the last 3 of a walk of (e - 4) + 3
        const a = e2.endDist[2]! - 4;
        const pTurn = a / (a + 3);
        expect(near(res2.positionAt(3, 16 * pTurn), [20, 4], 1e-9)).toBe(true);
        expect(
            near(res2.positionAt(3, (16 * (pTurn + 1)) / 2), [21.5, 4], 1e-9),
        ).toBe(true);
    });

    it("a spot behind its member's start: it waits on the way and walks straight (e_q ≥ startDist[q]); turn-offs stay in trail order (passing is allowed once a spot is off the way, owner 2026-11-10)", () => {
        const spots: XY[] = [
            [9, 0],
            [1, 0],
            [12, 0],
        ];
        const db = alongShow(3, corners([[14, 0]]), spots);
        const res = createCachedResolver(clone(db));
        const ref = refOracle(clone(db));
        const e = res.ftlEntry(1);
        // q=0 projects to 9; q=1 to 1, raised to 9 + eps so it never passes q=0 (P-5)
        expect(e.endDist[0]).toBe(9);
        expect(e.endDist[1]).toBe(9 + 1e-9);
        expect(e.endDist[2]).toBe(12);
        for (let q = 0; q < 3; q++)
            for (let b = 0; b <= 16; b += 0.5)
                expect(
                    near(res.positionAt(q + 1, b), ref.positionAt(q + 1, b)),
                ).toBe(true);
        // a leader whose spot is behind it: e = its start, a straight walk
        const back = alongShow(3, corners([[14, 0]]), [
            [0, 1],
            [1, 1],
            [2, 1],
        ]);
        const r2 = createCachedResolver(back);
        expect(r2.ftlEntry(1).endDist[2]).toBe(4);
        expect(near(r2.positionAt(3, 8), [3, 0.5])).toBe(true);
    });

    it("with no trail route the way is the line-up; reversed, the projection runs on the reversed way", () => {
        const db = alongShow(3, null, [
            [1, 0],
            [3, 0],
            [4, 0],
        ]);
        const res = createCachedResolver(clone(db));
        expect(res.ftlEntry(1).endDist).toEqual([1, 3, 4]);
        expect(near(res.positionAt(1, 8), [0.5, 0])).toBe(true);
        const rev = alongShow(3, corners([[-6, 0]]), [
            [0, 0],
            [2, 0],
            [4, 0],
        ]);
        rev.transitions[1]!.params = {
            waypoints: [],
            ends: "along",
            reverse: true,
        };
        const r2 = createCachedResolver(clone(rev));
        const ref = refOracle(clone(rev));
        const e = r2.ftlEntry(1);
        expect(e.members).toEqual([3, 2, 1]);
        // reversed way: (4,0) (2,0) (0,0) then on to (-6,0); M3's spot (4,0) is at 0, its start
        expect(e.endDist).toEqual([0, 2, 4]);
        for (let b = 0; b <= 16; b += 0.5)
            for (const m of [1, 2, 3])
                expect(near(r2.positionAt(m, b), ref.positionAt(m, b))).toBe(
                    true,
                );
    });

    it('validator: ends is "along" or absent; anything else is E-P1 (I-T2)', () => {
        expect(
            validatePathParams("follow_the_leader", {
                waypoints: [],
                ends: "along",
            }).ok,
        ).toBe(true);
        for (const ends of ["trail", true, null, 1]) {
            const r = validatePathParams("follow_the_leader", {
                waypoints: [],
                ends,
            });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.errors[0]!.code).toBe("E-P1");
        }
    });

    it("ends with a shape is not read: the move is R-9's, bit for bit", () => {
        const db = alongShow(3, null, [], { dest: 1, points: undefined });
        db.shapes[1] = { kind: "line", geometry: { points: [[20, 10], [20, 22]] } }; // prettier-ignore
        const plain = clone(db);
        plain.transitions[1]!.params = { waypoints: [] };
        const a = createCachedResolver(db);
        const b = createCachedResolver(plain);
        for (const m of [1, 2, 3])
            for (let t = 0; t <= 16; t += 0.25)
                expect(same(a.positionAt(m, t), b.positionAt(m, t))).toBe(true);
    });

    it("cache: ends turned on and off, and a route edit, each dirty the entry once; cached = fresh bit for bit", () => {
        const spots = [0, 1, 2, 3, 4, 5].map((q) => along(WAY, 2 * q + 20));
        const db = alongShow(6, TRAIL, spots);
        const res = createCachedResolver(db);
        res.warmAll();
        const image = (t: TransitionRow): RowImage => ({
            ...t,
            route: t.route ?? null,
        });
        const check = (label: string) => {
            const fresh = createCachedResolver(clone(db));
            for (let m = 1; m <= 6; m++)
                for (let b = -1; b <= 17; b += 0.5)
                    expect(
                        same(res.positionAt(m, b), fresh.positionAt(m, b)),
                        `${label} M${m}@${b}`,
                    ).toBe(true);
            expect(res.cacheClosureViolation(), label).toBeNull();
        };
        const edit = (label: string, change: (t: TransitionRow) => void) => {
            const before = image(db.transitions[1]!);
            change(db.transitions[1]!);
            const report = res.notify({
                changes: [
                    {
                        table: "transitions",
                        rowId: 1,
                        before,
                        after: image(db.transitions[1]!),
                    },
                ],
            });
            expect(report.ftlEntriesDirtied, label).toBe(1);
            check(label);
        };
        check("cold");
        edit("ends cleared", (t) => (t.params = { waypoints: [] }));
        edit(
            "ends along",
            (t) => (t.params = { waypoints: [], ends: "along" }),
        );
        const before = { id: 1, geometry: db.routes![1]!.geometry };
        db.routes![1] = { geometry: { ...before.geometry, points: corners([[20, -4], [20, 10]]) } }; // prettier-ignore
        expect(
            res.notify({
                changes: [
                    {
                        table: "routes",
                        rowId: 1,
                        before,
                        after: { id: 1, geometry: db.routes![1]!.geometry },
                    },
                ],
            }).ftlEntriesDirtied,
        ).toBe(1);
        check("route edited");
    });

    it("random along-ways (corners and smooth points, Reverse, gaps, joins, spots on and off the way): resolver, oracle and ref agree; no jumps", () => {
        for (let seed = 1; seed <= 60; seed++) {
            const R = mulberry32(4000 + seed);
            const n = 2 + Math.floor(R() * 4);
            const k = Math.floor(R() * 4);
            const points: RoutePoint[] = Array.from({ length: k }, (_, i) => ({
                id: `p${i}`,
                at: [Math.round(R() * 40) - 10, Math.round(R() * 40) - 10],
                ...(R() < 0.5 && i < k - 1
                    ? { tension: 0.25 + R() * 1.75 }
                    : {}),
            }));
            const spots = Array.from(
                { length: n },
                (): XY => [
                    Math.round(R() * 40) - 10,
                    Math.round(R() * 40) - 10,
                ],
            );
            const db = alongShow(n, k ? points : null, spots, {
                params:
                    R() < 0.4
                        ? { waypoints: [], ends: "along", reverse: true }
                        : { waypoints: [], ends: "along" },
            });
            const gap = R();
            if (gap < 0.2)
                db.assignments = db.assignments.filter((r) => r.marcher !== 2);
            else if (gap < 0.4)
                db.assignments[1] = { ...db.assignments[1]!, start: 6 };
            const res = createCachedResolver(clone(db));
            const oracle = createOracle(clone(db));
            const ref = refOracle(clone(db));
            for (let m = 1; m <= n; m++) {
                let prev = res.positionAt(m, 0);
                for (let b = 0; b <= 16; b += 1 / 8) {
                    const x = res.positionAt(m, b);
                    expect(
                        near(x, oracle.positionAt(m, b)),
                        `seed ${seed} M${m}@${b} oracle`,
                    ).toBe(true);
                    expect(
                        near(x, ref.positionAt(m, b)),
                        `seed ${seed} M${m}@${b} ref`,
                    ).toBe(true);
                    expect(
                        Math.hypot(x[0] - prev[0], x[1] - prev[1]),
                    ).toBeLessThan(25);
                    prev = x;
                }
            }
            // P-5: ends strictly increase along the trail order
            const e = res.ftlEntry(1);
            for (let q = 1; q < e.endDist.length; q++)
                expect(e.endDist[q]!).toBeGreaterThanOrEqual(e.endDist[q - 1]!);
        }
    }, 30_000);
});

describe("ends along the way with an arc leg (R-13″ with R-14″)", () => {
    // Three marchers at (0,0), (2,0), (4,0); the leader draws one arc leg from (4,0) to (12,0) with
    // bulge 1/4: apex (8,2), centre (8,−3), radius 5, sweeping clockwise from angle π − atan(3/4)
    const C: XY = [8, -3];
    const R5 = 5;
    const A0 = Math.PI - Math.atan(3 / 4);
    const ARC = R5 * 2 * (A0 - Math.PI / 2); // r·θ
    const onCircle = (r: number, a: number): XY => [
        C[0] + r * Math.cos(a),
        C[1] + r * Math.sin(a),
    ];
    /** The way at distance `d`, worked by hand: the line-up, then the circle */
    const wayAt = (d: number): XY =>
        d <= 4 ? [d, 0] : onCircle(R5, A0 - Math.min(d - 4, ARC) / R5);
    const ARC_TRAIL: RoutePoint[] = [{ id: "p0", at: [12, 0], bulge: 0.25 }];

    it("spots project onto the arc exactly; positions match both oracles at every quarter beat; R-20 draws the arc", () => {
        // q0 off the arc outside it, q1 inside it under the apex, q2 at the trail's end
        const a0 = Math.PI / 2 + 0.3;
        const spots: XY[] = [onCircle(7, a0), [8, 0], [12, 0]];
        const want = [4 + R5 * (A0 - a0), 4 + R5 * (A0 - Math.PI / 2), 4 + ARC];
        const db = alongShow(3, ARC_TRAIL, spots);
        const res = createCachedResolver(clone(db));
        const oracle = createOracle(clone(db));
        const ref = refOracle(clone(db));
        const e = res.ftlEntry(1);
        expect(e.members).toEqual([1, 2, 3]);
        e.endDist.forEach((d, q) => expect(d).toBeCloseTo(want[q]!, 9));
        const straight = [2, 2, 0];
        const walk = walkedPath(db, res, 1, 0, 16);
        expect(walk.segments.some((s) => s.kind === "arc")).toBe(true);
        for (let b = 0; b <= 16; b += 0.25)
            for (let q = 0; q < 3; q++) {
                const x = res.positionAt(q + 1, b);
                expect(Number.isFinite(x[0]) && Number.isFinite(x[1])).toBe(
                    true,
                );
                // along the way from 2q to e_q, then straight to the spot, at one speed
                const a = want[q]! - 2 * q;
                const d = ((a + straight[q]!) * b) / 16;
                const turn = wayAt(want[q]!);
                const hand: XY =
                    d <= a
                        ? wayAt(2 * q + d)
                        : [
                              turn[0] +
                                  ((spots[q]![0] - turn[0]) * (d - a)) /
                                      straight[q]!,
                              turn[1] +
                                  ((spots[q]![1] - turn[1]) * (d - a)) /
                                      straight[q]!,
                          ];
                expect(
                    near(x, hand, 1e-9),
                    `M${q + 1}@${b}: ${x} vs ${hand}`,
                ).toBe(true);
                expect(near(x, oracle.positionAt(q + 1, b))).toBe(true);
                expect(near(x, ref.positionAt(q + 1, b))).toBe(true);
            }
        for (let q = 0; q < 3; q++) {
            const path = walkedPath(db, res, q + 1, 0, 16);
            for (let b = 0; b <= 16; b += 1 / 32) {
                const at = walkedPathPointAt(path, b)!;
                const x = res.positionAt(q + 1, b);
                expect(Math.hypot(at[0] - x[0], at[1] - x[1])).toBeLessThan(
                    WALKED_SAMPLE_TOLERANCE,
                );
            }
        }
        // the leader's stretch is the whole arc: R-20 cuts it into arcs on the circle
        const leader = walkedPath(db, res, 3, 0, 16).segments;
        const arcs = leader.filter((s) => s.kind === "arc");
        expect(arcs.length).toBeGreaterThan(0);
        for (const s of arcs)
            if (s.kind === "arc") {
                expect(
                    Math.hypot(s.center[0] - C[0], s.center[1] - C[1]),
                ).toBeLessThan(1e-9);
                expect(s.radius).toBeCloseTo(R5, 9);
            }
    });

    it("random along-ways with arc legs (corners beside them, smooth elsewhere, Reverse, spots on and off the way): resolver, oracle, ref and R-20 agree", () => {
        for (let seed = 1; seed <= 60; seed++) {
            const R = mulberry32(9000 + seed);
            const n = 2 + Math.floor(R() * 4);
            const k = 1 + Math.floor(R() * 4);
            const arc = Array.from({ length: k }, () => R() < 0.6);
            const points: RoutePoint[] = Array.from({ length: k }, (_, i) => ({
                id: `p${i}`,
                at: [Math.round(R() * 40) - 10, Math.round(R() * 40) - 10],
                ...(arc[i]
                    ? {
                          bulge:
                              (R() < 0.5 ? -1 : 1) *
                              (R() < 0.15 ? 0.5 : 0.02 + R() * 0.48),
                      }
                    : {}),
            }));
            // R-14″: a point beside an arc leg is a corner
            points.forEach((p, i) => {
                if (i < k - 1 && !arc[i] && !arc[i + 1] && R() < 0.5)
                    p.tension = 0.25 + R() * 1.75;
            });
            const spots = Array.from(
                { length: n },
                (): XY => [
                    Math.round(R() * 40) - 10,
                    Math.round(R() * 40) - 10,
                ],
            );
            const db = alongShow(n, points, spots, {
                params:
                    R() < 0.4
                        ? { waypoints: [], ends: "along", reverse: true }
                        : { waypoints: [], ends: "along" },
            });
            const res = createCachedResolver(clone(db));
            const oracle = createOracle(clone(db));
            const ref = refOracle(clone(db));
            for (let m = 1; m <= n; m++) {
                const path = walkedPath(db, res, m, 0, 16);
                for (let b = 0; b <= 16; b += 1 / 4) {
                    const x = res.positionAt(m, b);
                    const label = `seed ${seed} M${m}@${b}`;
                    expect(
                        Number.isFinite(x[0]) && Number.isFinite(x[1]),
                        label,
                    ).toBe(true);
                    expect(
                        near(x, oracle.positionAt(m, b)),
                        `${label} oracle`,
                    ).toBe(true);
                    expect(near(x, ref.positionAt(m, b)), `${label} ref`).toBe(
                        true,
                    );
                    const at = walkedPathPointAt(path, b)!;
                    expect(
                        Math.hypot(at[0] - x[0], at[1] - x[1]),
                        `${label} R-20`,
                    ).toBeLessThan(WALKED_SAMPLE_TOLERANCE);
                }
            }
        }
    }, 30_000);
});
