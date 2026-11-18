// cspell:ignore lerp
/**
 * Follow a drawn trail, pathways step 4 (spec R-9′, R-12′, T-15, Appendix K.4): QA-TR-1 to
 * QA-TR-10.
 *
 * Expected positions are worked by hand for corners, and for curves they come from this file's
 * own Catmull–Rom and Bézier code (linear scans, written from the spec), never from `../geom`.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import type {
    ChangeBatch,
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

/** The spec's own reference oracle (`docs/timeline/ref`), written apart from this package */
const refOracle = makeOracle as (db: TimelineSnapshot) => {
    positionAt(m: number, b: number): XY;
};

const clone = <T>(x: T): T => structuredClone(x);
const near = (a: XY, b: XY, eps = 1e-9) =>
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const same = (a: XY, b: XY) => Object.is(a[0], b[0]) && Object.is(a[1], b[1]);

const HOMES: XY[] = [
    [0, 0],
    [4, 0],
    [8, 0],
];
const corners = (pts: XY[]): RoutePoint[] =>
    pts.map((at, i) => ({ id: `p${i}`, at }));
const geometry = (
    points: RoutePoint[],
    from: XY = [8, 0],
    to: XY = [20, 10],
): RouteGeometry => ({ v: 1, from, to, points });

/**
 * M1, M2, M3 stand on a line at (0,0), (4,0), (8,0) and follow the leader over [0, 16) into the
 * line (20,10) to (20,22). Slot order, so M3 leads. `points` are the trail route's.
 */
function trailShow(
    points: RoutePoint[] | null,
    over: Partial<TransitionRow> = {},
): TimelineSnapshot {
    return {
        marchers: HOMES.map((home, i) => ({ id: i + 1, home })),
        shapes: {
            1: {
                kind: "line",
                geometry: {
                    points: [
                        [20, 10],
                        [20, 22],
                    ],
                },
            },
        },
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 16,
                dest: 1,
                slots: 3,
                style: "follow_the_leader",
                order: "slot",
                params: { waypoints: [] },
                ...(points ? { route: 1 } : {}),
                ...over,
            },
        },
        routes: points ? { 1: { geometry: geometry(points) } } : {},
        assignments: HOMES.map((_, i) => ({
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

const both = (db: TimelineSnapshot) =>
    [
        ["resolver", createCachedResolver(clone(db))],
        ["oracle", createOracle(clone(db))],
    ] as const;

const TWO_CORNERS = corners([
    [14, 0],
    [14, 10],
]);

// ---------------------------------------------------------------------------
// This file's own geometry (spec R-14 and R-9′, written out again)
// ---------------------------------------------------------------------------

const bez = (p0: XY, c1: XY, c2: XY, p3: XY, t: number): XY => {
    const u = 1 - t;
    return [
        u * u * u * p0[0] +
            3 * u * u * t * c1[0] +
            3 * u * t * t * c2[0] +
            t * t * t * p3[0],
        u * u * u * p0[1] +
            3 * u * u * t * c1[1] +
            3 * u * t * t * c2[1] +
            t * t * t * p3[1],
    ];
};
const third = (p: XY, q: XY): XY => [
    p[0] + (q[0] - p[0]) / 3,
    p[1] + (q[1] - p[1]) / 3,
];
/** R-14 step 2: a smooth point's handles from its neighbors `a` and `c`. */
function handles(a: XY, q: XY, c: XY, tau: number) {
    const da: XY = [a[0] - q[0], a[1] - q[1]];
    const dc: XY = [c[0] - q[0], c[1] - q[1]];
    const ra = Math.hypot(...da);
    const rc = Math.hypot(...dc);
    const d1 = Math.sqrt(ra);
    const d2 = Math.sqrt(rc);
    const tangent: XY = [ra * dc[0] - rc * da[0], ra * dc[1] - rc * da[1]];
    return {
        out: [
            q[0] + (tau * tangent[0]) / (3 * d1 * (d1 + d2)),
            q[1] + (tau * tangent[1]) / (3 * d1 * (d1 + d2)),
        ] as XY,
        in: [
            q[0] - (tau * tangent[0]) / (3 * d2 * (d1 + d2)),
            q[1] - (tau * tangent[1]) / (3 * d2 * (d1 + d2)),
        ] as XY,
    };
}
/** A cubic measured on 64 samples: its cumulative lengths, and the point `x` along it. */
function cubic(p0: XY, c1: XY, c2: XY, p3: XY) {
    const e = [0];
    for (let i = 1; i <= 64; i++) {
        const a = bez(p0, c1, c2, p3, (i - 1) / 64);
        const b = i === 64 ? p3 : bez(p0, c1, c2, p3, i / 64);
        e.push(e[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return {
        length: e[64]!,
        at(x: number): XY {
            let i = 1;
            while (i <= 64 && !(x < e[i]!)) i++;
            if (i > 64) return p3;
            const f = (x - e[i - 1]!) / (e[i]! - e[i - 1]!);
            return bez(p0, c1, c2, p3, (i - 1 + f) / 64);
        },
    };
}

describe("follow a drawn trail (spec R-9′, pathways step 4)", () => {
    it("QA-TR-1: a line follows two corners into its end spots, each at its own steady speed", () => {
        // line-up 8, drawn part 6 + 10 + 6 = 22, so destOffset 30; ends 30, 36, 42
        const expected: Array<[number, XY, XY, XY]> = [
            [0, [0, 0], [4, 0], [8, 0]],
            [4, [7.5, 0], [12, 0], [14, 2.5]],
            [8, [14, 1], [14, 6], [15, 10]],
            [12, [14, 8.5], [18, 10], [20, 13.5]],
            [16, [20, 10], [20, 16], [20, 22]],
            [20, [20, 10], [20, 16], [20, 22]],
        ];
        for (const [name, r] of both(trailShow(TWO_CORNERS))) {
            for (const [b, ...want] of expected)
                want.forEach((xy, i) =>
                    expect(
                        near(r.positionAt(i + 1, b), xy),
                        `${name}: M${i + 1}@${b} = ${r.positionAt(i + 1, b)}, want ${xy}`,
                    ).toBe(true),
                );
            const e = r.ftlEntry(1);
            expect(e.members).toEqual([1, 2, 3]);
            expect(e.startDist).toEqual([0, 4, 8]);
            expect(e.endDist).toEqual([30, 36, 42]);
        }
    });

    it("QA-TR-1: ends are exact, bit for bit (P-7)", () => {
        for (const [, r] of both(trailShow(TWO_CORNERS))) {
            expect(same(r.positionAt(1, 0), [0, 0])).toBe(true);
            expect(same(r.positionAt(3, 16), [20, 22])).toBe(true);
            expect(same(r.positionAt(2, 16), [20, 16])).toBe(true);
        }
    });

    it("QA-TR-2: a trail route with no point kept is the same move with no route, bit for bit", () => {
        const plain = trailShow(null);
        const cases: Array<[string, RoutePoint[]]> = [
            ["no points", []],
            ["a point on the leader", corners([[8, 0]])],
            ["a point on the entrance", corners([[20, 10 + 1e-10]])],
        ];
        for (const [label, points] of cases)
            for (const [name, r] of both(trailShow(points))) {
                const ref = createOracle(clone(plain));
                for (let b = -1; b <= 17; b += 0.3125)
                    for (const m of [1, 2, 3])
                        expect(
                            same(r.positionAt(m, b), ref.positionAt(m, b)),
                            `${label} ${name}: M${m}@${b}`,
                        ).toBe(true);
            }
    });

    it("QA-TR-3: a smooth point is walked on its exact curve, measured as R-14 measures it", () => {
        const Q: XY = [14, -4];
        const A: XY = [8, 0];
        const B: XY = [20, 10];
        const h = handles(A, Q, B, 1);
        const first = cubic(A, third(A, Q), h.in, Q);
        const last = cubic(Q, h.out, third(B, Q), B);
        const L = first.length + last.length;
        const drawnAt = (x: number): XY =>
            x < first.length ? first.at(x) : last.at(x - first.length);
        const db = trailShow([{ id: "q", at: Q, tension: 1 }]);
        for (const [name, r] of both(db)) {
            const e = r.ftlEntry(1);
            expect(e.endDist[0]).toBeCloseTo(8 + L, 9);
            expect(e.endDist[2]).toBeCloseTo(8 + L + 12, 9);
            for (let b = 0.25; b < 16; b += 0.25) {
                // the leader starts on the drawn part
                const d = (b / 16) * (e.endDist[2]! - 8);
                const want: XY = d < L ? drawnAt(d) : [20, 10 + (d - L)];
                expect(
                    near(r.positionAt(3, b), want, 1e-9),
                    `${name}: M3@${b} = ${r.positionAt(3, b)}, want ${want}`,
                ).toBe(true);
            }
            // the curve bulges below the straight line from the leader to the entrance
            expect(r.positionAt(3, 4)[1]).toBeLessThan(0);
        }
    });

    it("QA-TR-4: Reverse makes the other end lead and enters the end line from its far end; everyone keeps their own end spot (R-12′)", () => {
        const db = trailShow(TWO_CORNERS, {
            params: { waypoints: [], reverse: true },
        });
        const plain = createOracle(trailShow(TWO_CORNERS));
        const last = Math.hypot(6, 12); // (14,10) to the far end (20,22)
        for (const [name, r] of both(db)) {
            const e = r.ftlEntry(1);
            expect(e.members, name).toEqual([3, 2, 1]);
            // line-up (8,0) to (0,0) is 8; drawn (0,0) (14,0) (14,10) (20,22)
            expect(e.startDist).toEqual([0, 4, 8]);
            [0, 6, 12].forEach((along, q) =>
                expect(e.endDist[q]).toBeCloseTo(8 + 24 + last + along, 9),
            );
            for (const m of [1, 2, 3])
                expect(
                    same(r.positionAt(m, 16), plain.positionAt(m, 16)),
                    `${name}: M${m} ends on its own spot`,
                ).toBe(true);
            // M3, now the tail, first walks back along the line to where M1 stood
            expect(
                near(r.positionAt(3, 2), [8 - (32 + last) / 8, 0]),
                name,
            ).toBe(true);
            // M1 leads: it is on the drawn part while M3 is still in the line-up
            expect(near(r.positionAt(1, 1), [(36 + last) / 16, 0])).toBe(true);
        }
        expect(
            validatePathParams("follow_the_leader", {
                waypoints: [],
                reverse: true,
            }).ok,
        ).toBe(true);
        expect(
            validatePathParams("follow_the_leader", {
                waypoints: [],
                reverse: false,
            }).ok,
        ).toBe(false);
    });

    it("QA-TR-5 (T-15): with a trail route, waypoints are not read", () => {
        const withWaypoints = trailShow(TWO_CORNERS, {
            params: { waypoints: [[100, 100]] },
        });
        for (const [name, r] of both(withWaypoints)) {
            const ref = createOracle(trailShow(TWO_CORNERS));
            for (let b = 0; b <= 16; b += 0.5)
                for (const m of [1, 2, 3])
                    expect(
                        same(r.positionAt(m, b), ref.positionAt(m, b)),
                        `${name}: M${m}@${b}`,
                    ).toBe(true);
        }
    });

    it("QA-TR-6: a join walks straight to its target, whatever the trail (R-11, T-12)", () => {
        const db = trailShow(TWO_CORNERS);
        db.assignments[0] = { ...db.assignments[0]!, start: 8 };
        for (const [name, r] of both(db)) {
            // M1 joins at 8 from home: the tail point p0, straight
            expect(near(r.positionAt(1, 12), [10, 5]), name).toBe(true);
            expect(r.ftlEntry(1).members).toEqual([2, 3]);
            // the founders' drawn part still starts at the leader
            expect(near(r.positionAt(3, 16), [20, 22])).toBe(true);
        }
    });

    it("QA-TR-7: no founders, with a trail route: D-FTL-EMPTY and straight walks", () => {
        const db = trailShow(TWO_CORNERS);
        db.assignments = db.assignments.map((r) => ({ ...r, start: 8 }));
        for (const [name, r] of both(db)) {
            expect(
                r.diagnostics().some((d) => d.code === "D-FTL-EMPTY"),
                name,
            ).toBe(true);
            for (const m of [1, 2, 3])
                expect(Number.isFinite(r.positionAt(m, 12)[0])).toBe(true);
        }
    });

    it("QA-TR-8: nobody overtakes, and everybody stays on the trail (P-5, P-6)", () => {
        const V: XY[] = [
            [0, 0],
            [4, 0],
            [8, 0],
            [14, 0],
            [14, 10],
            [20, 10],
            [20, 22],
        ];
        const along = (q: XY): number => {
            let acc = 0;
            let best = NaN;
            let off = Infinity;
            for (let j = 0; j + 1 < V.length; j++) {
                const [a, b] = [V[j]!, V[j + 1]!];
                const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                const t = Math.max(
                    0,
                    Math.min(
                        1,
                        ((q[0] - a[0]) * (b[0] - a[0]) +
                            (q[1] - a[1]) * (b[1] - a[1])) /
                            (len * len),
                    ),
                );
                const o = Math.hypot(
                    a[0] + (b[0] - a[0]) * t - q[0],
                    a[1] + (b[1] - a[1]) * t - q[1],
                );
                if (o < off) {
                    off = o;
                    best = acc + t * len;
                }
                acc += len;
            }
            expect(off).toBeLessThan(1e-9);
            return best;
        };
        for (const [, r] of both(trailShow(TWO_CORNERS)))
            for (let b = 0; b <= 16; b += 0.125) {
                const d = [1, 2, 3].map((m) => along(r.positionAt(m, b)));
                expect(d[0]!).toBeLessThanOrEqual(d[1]! + 1e-9);
                expect(d[1]!).toBeLessThanOrEqual(d[2]! + 1e-9);
            }
    });

    it("QA-TR-9: route edits, Follow, Reverse and Remove trail reach the cache, and undo restores it", () => {
        const db = trailShow(TWO_CORNERS);
        const res = createCachedResolver(db);
        res.warmAll();
        const image = (t: TransitionRow): RowImage => ({
            id: t.id,
            start: t.start,
            end: t.end,
            dest: t.dest,
            slots: t.slots,
            style: t.style,
            order: t.order,
            params: t.params,
            route: t.route ?? null,
        });
        const check = (label: string) => {
            const fresh = createCachedResolver(clone(db));
            const oracle = createOracle(clone(db));
            for (const m of [1, 2, 3])
                for (let b = -1; b <= 17; b += 0.5) {
                    const x = res.positionAt(m, b);
                    expect(
                        same(x, fresh.positionAt(m, b)),
                        `${label}: M${m}@${b} cached ${x} fresh ${fresh.positionAt(m, b)}`,
                    ).toBe(true);
                    expect(near(x, oracle.positionAt(m, b), 1e-9)).toBe(true);
                }
            expect(res.cacheClosureViolation(), label).toBeNull();
        };
        const editTransition = (
            label: string,
            change: (t: TransitionRow) => void,
        ) => {
            const before = image(db.transitions[1]!);
            change(db.transitions[1]!);
            const batch: ChangeBatch = {
                changes: [
                    {
                        table: "transitions",
                        rowId: 1,
                        before,
                        after: image(db.transitions[1]!),
                    },
                ],
            };
            expect(res.notify(batch).ftlEntriesDirtied, label).toBe(1);
            check(label);
        };
        const editRoute = (label: string, points: RoutePoint[]) => {
            const before = { id: 1, geometry: db.routes![1]!.geometry };
            db.routes![1] = { geometry: geometry(points) };
            const report = res.notify({
                changes: [
                    {
                        table: "routes",
                        rowId: 1,
                        before,
                        after: { id: 1, geometry: db.routes![1]!.geometry },
                    },
                ],
            });
            expect(report.ftlEntriesDirtied, label).toBe(1);
            check(label);
        };
        check("cold");
        editRoute("a corner dragged", corners([[14, -3], [14, 10]])); // prettier-ignore
        expect(near(res.positionAt(3, 16), [20, 22])).toBe(true);
        editRoute("a point made smooth", [
            { id: "p0", at: [14, -3], tension: 1 },
            { id: "p1", at: [14, 10] },
        ]);
        editTransition("Reverse", (t) => {
            t.params = { waypoints: [], reverse: true };
        });
        expect(res.ftlEntry(1).members).toEqual([3, 2, 1]);
        editTransition("Reverse undone", (t) => {
            t.params = { waypoints: [] };
        });
        editTransition("Remove trail", (t) => {
            t.route = null;
        });
        editTransition("Follow again", (t) => {
            t.route = 1;
        });
        editRoute("back to two corners", TWO_CORNERS);
        expect(near(res.positionAt(3, 8), [15, 10])).toBe(true);
        // an upstream change moves the leader: the drawn part starts where it now stands
        const before = { id: 3, home: [8, 0] };
        db.marchers[2] = { id: 3, home: [8, 3] };
        res.notify({
            changes: [
                {
                    table: "marchers",
                    rowId: 3,
                    before,
                    after: { id: 3, home: [8, 3] },
                },
            ],
        });
        check("the leader's start moved");
        expect(same(res.positionAt(3, 16), [20, 22])).toBe(true);
    });

    it("QA-TR-10: random trails (corners and smooth points, either end leading): the resolver and the oracle agree, with no jumps", () => {
        for (let seed = 1; seed <= 24; seed++) {
            const R = mulberry32(seed);
            const n = 1 + Math.floor(R() * 4);
            const points: RoutePoint[] = Array.from({ length: n }, (_, i) => ({
                id: `p${i}`,
                at: [Math.round(R() * 40) - 10, Math.round(R() * 40) - 10],
                ...(R() < 0.5 ? { tension: 0.25 + R() * 1.75 } : {}),
            }));
            const db = trailShow(points, {
                params:
                    R() < 0.5
                        ? { waypoints: [], reverse: true }
                        : { waypoints: [] },
                order: R() < 0.5 ? "slot" : "inherit",
            });
            const shape = R();
            if (shape < 0.3) {
                // no shape (R-13′): the end spots, unevenly spaced
                const t = db.transitions[1]!;
                t.dest = null;
                t.points = [
                    [20, 10],
                    [22, 13],
                    [20, 22],
                ];
            } else if (shape < 0.6)
                db.shapes[1] = {
                    kind: "circle",
                    geometry: {
                        center: [30, 20],
                        radius: 6,
                        start_angle: 1,
                        clockwise: R() < 0.5,
                    },
                };
            const res = createCachedResolver(clone(db));
            const oracle = createOracle(clone(db));
            const speed = 400 / 16; // far above any member's speed here
            for (const m of [1, 2, 3]) {
                let prev = res.positionAt(m, 0);
                for (let b = 0; b <= 16; b += 1 / 32) {
                    const x = res.positionAt(m, b);
                    const y = oracle.positionAt(m, b);
                    expect(
                        near(x, y, 1e-9),
                        `seed ${seed}: M${m}@${b} resolver ${x} oracle ${y}`,
                    ).toBe(true);
                    expect(
                        Math.hypot(x[0] - prev[0], x[1] - prev[1]),
                        `seed ${seed}: M${m} jumps at ${b}`,
                    ).toBeLessThan(speed / 32);
                    prev = x;
                }
            }
        }
    }, 30_000);

    it("QA-TR-14: random trails: the resolver agrees with the spec's own reference oracle in ref/, written apart from this package (review)", () => {
        for (let seed = 1; seed <= 40; seed++) {
            const R = mulberry32(1000 + seed);
            const n = 1 + Math.floor(R() * 4);
            const points: RoutePoint[] = Array.from({ length: n }, (_, i) => ({
                id: `p${i}`,
                at: [Math.round(R() * 40) - 10, Math.round(R() * 40) - 10],
                ...(R() < 0.5 ? { tension: 0.25 + R() * 1.75 } : {}),
            }));
            const db = trailShow(points, {
                params:
                    R() < 0.5
                        ? { waypoints: [], reverse: true }
                        : { waypoints: [] },
            });
            const shape = R();
            if (shape < 0.4) {
                const t = db.transitions[1]!;
                t.dest = null;
                t.points = [
                    [20, 10],
                    [22, 13],
                    [20, 22],
                ];
            } else if (shape < 0.7) {
                // a vacant slot, into the shape
                db.transitions[1]!.slots = 4;
            }
            // Sometimes a gap in the line, or a join partway
            const gap = R();
            if (gap < 0.25)
                db.assignments = db.assignments.filter((r) => r.marcher !== 2);
            else if (gap < 0.5)
                db.assignments[1] = { ...db.assignments[1]!, start: 6 };
            const res = createCachedResolver(clone(db));
            const ref = refOracle(clone(db));
            for (const m of [1, 2, 3])
                for (let b = 0; b <= 16; b += 1 / 8) {
                    const x = res.positionAt(m, b);
                    const y = ref.positionAt(m, b);
                    expect(
                        near(x, y, 1e-9),
                        `seed ${seed}: M${m}@${b} resolver ${x} ref ${y}`,
                    ).toBe(true);
                }
        }
    }, 30_000);

    it("QA-TR-15: Reverse into a shape with a vacant slot, worked by hand (R-12′)", () => {
        // QA-TR-1's line, trail and end line, with four slots for three marchers: the samples are
        // (20,10), (20,14), (20,18) and (20,22). Reversed, M1 leads from (0,0); the line-up runs
        // (8,0), (4,0), (0,0), so startDist is 0, 4, 8 for M3, M2, M1; the drawn part is 14 + 10
        // + √180 to the far end (20,22), the entrance, so destOffset = 32 + √180. Member q of
        // m = 3 takes sample 2 − q, entered from the far end: M3 sample 2 (4 in), M2 sample 1
        // (8 in), M1 sample 0 (12 in). The entrance's own spot, sample 3, is left vacant.
        const db = trailShow(TWO_CORNERS, {
            slots: 4,
            params: { waypoints: [], reverse: true },
        });
        const r180 = Math.sqrt(180);
        const destOffset = 32 + r180;
        for (const [name, r] of [
            ...both(db),
            ["ref", refOracle(clone(db))] as const,
        ]) {
            if ("ftlEntry" in r) {
                const e = r.ftlEntry(1);
                expect(e.members, name).toEqual([3, 2, 1]);
                expect(e.startDist, name).toEqual([0, 4, 8]);
                e.endDist.forEach((d, q) =>
                    expect(
                        Math.abs(d - (destOffset + [4, 8, 12][q]!)),
                        name,
                    ).toBeLessThan(1e-9),
                );
            }
            const ends: XY[] = [
                [20, 10],
                [20, 14],
                [20, 18],
            ];
            ends.forEach((xy, i) =>
                expect(near(r.positionAt(i + 1, 16), xy), name).toBe(true),
            );
            // Nobody ends on the vacant entrance spot
            for (const m of [1, 2, 3])
                expect(near(r.positionAt(m, 16), [20, 22]), name).toBe(false);
            // M1 halfway: d = 8 + (destOffset + 12 − 8) / 2, on the drawn part's last leg,
            // (14,10) to (20,22), u past its start
            const d = 8 + (destOffset + 4) / 2;
            const u = d - 8 - 24;
            expect(
                near(r.positionAt(1, 8), [
                    14 + (6 * u) / r180,
                    10 + (12 * u) / r180,
                ]),
                `${name}: ${r.positionAt(1, 8)}`,
            ).toBe(true);
            // M3, the tail, at a quarter: d = (destOffset + 4) / 4, past the line-up (8) on the
            // first corner's leg from (0,0)
            const d3 = (destOffset + 4) / 4;
            expect(
                near(r.positionAt(3, 4), [d3 - 8, 0]),
                `${name}: ${r.positionAt(3, 4)}`,
            ).toBe(true);
        }
    });

    const SPOTS: XY[] = [
        [20, 10],
        [20, 13],
        [26, 21],
    ];
    const spotsShow = (over: Partial<TransitionRow> = {}) =>
        trailShow(TWO_CORNERS, { dest: null, points: SPOTS, ...over });

    it("QA-TR-11: with no shape the line runs through the end spots, and each member lands on its own, bit for bit (R-13′)", () => {
        for (const [name, r] of both(spotsShow())) {
            const e = r.ftlEntry(1);
            // destOffset 30; the spots are 0, 3 and 13 along the line through them
            expect(e.endDist, name).toEqual([30, 33, 43]);
            SPOTS.forEach((xy, i) =>
                expect(same(r.positionAt(i + 1, 16), xy), name).toBe(true),
            );
            // the leader passes the second spot on its way to the third: 8 + 35 * 15/16 is
            // 40.8125, 7.8125 past the second spot, on the leg (20,13) to (26,21)
            expect(
                near(r.positionAt(3, 15), [20 + 4.6875, 13 + 6.25]),
                name,
            ).toBe(true);
            // M1 at count 8 is on the drawn part: 30 * 8/16 = 15, 7 past the leader's start
            expect(near(r.positionAt(1, 8), [14, 1])).toBe(true);
        }
        // Reverse: the far end spot is the entrance, and everyone still ends on their own
        for (const [name, r] of both(
            spotsShow({ params: { waypoints: [], reverse: true } }),
        )) {
            SPOTS.forEach((xy, i) =>
                expect(same(r.positionAt(i + 1, 16), xy), name).toBe(true),
            );
            expect(r.ftlEntry(1).members).toEqual([3, 2, 1]);
        }
    });

    it("QA-TR-12: one slot, coincident spots, and no trail route still give finite, exact ends (T-16)", () => {
        const one = spotsShow({ slots: 1, points: [[20, 10]] });
        one.marchers = [one.marchers[2]!];
        one.assignments = [{ ...one.assignments[2]!, slot: 0 }];
        for (const [name, r] of both(one)) {
            expect(same(r.positionAt(3, 16), [20, 10]), name).toBe(true);
            expect(near(r.positionAt(3, 8), [14, 5])).toBe(true);
        }
        const stacked = spotsShow({
            points: [
                [20, 10],
                [20, 10],
                [20, 10],
            ],
        });
        const noRoute = spotsShow({ route: null });
        for (const db of [stacked, noRoute])
            for (const [name, r] of both(db))
                for (const m of [1, 2, 3]) {
                    const end = r.positionAt(m, 16);
                    expect(
                        same(end, db.transitions[1]!.points![m - 1]!),
                        name,
                    ).toBe(true);
                    for (let b = 0; b <= 16; b += 0.5)
                        expect(Number.isFinite(r.positionAt(m, b)[0])).toBe(
                            true,
                        );
                }
    });

    it("QA-TR-13: with no shape every row ends on its own slot's spot, whoever is missing or joins late (R-13′)", () => {
        // M2 gone: its spot stays empty, the line-up skips it, nobody else's end moves
        const gap = spotsShow();
        gap.assignments = gap.assignments.filter((r) => r.marcher !== 2);
        for (const [name, r] of both(gap)) {
            expect(r.ftlEntry(1).members, name).toEqual([1, 3]);
            expect(r.ftlEntry(1).endDist).toEqual([30, 43]);
            expect(same(r.positionAt(1, 16), SPOTS[0]!)).toBe(true);
            expect(same(r.positionAt(3, 16), SPOTS[2]!)).toBe(true);
        }
        // M2 joins at count 8: it walks straight to its own spot, and the others are unmoved
        const late = spotsShow();
        late.assignments[1] = { ...late.assignments[1]!, start: 8 };
        for (const [name, r] of both(late)) {
            expect(same(r.positionAt(2, 16), SPOTS[1]!), name).toBe(true);
            expect(near(r.positionAt(2, 12), [12, 6.5])).toBe(true);
            expect(same(r.positionAt(1, 16), SPOTS[0]!)).toBe(true);
            expect(same(r.positionAt(3, 16), SPOTS[2]!)).toBe(true);
        }
        // `inherit` is not read with no shape: the order is the slots'
        const inherit = spotsShow({ order: "inherit" });
        for (const [, r] of both(inherit))
            expect(r.ftlEntry(1).orderSource).toEqual({
                kind: "slot",
                fallback: false,
            });
    });
});
