// cspell:ignore lerp
/**
 * Routes, v0.9 step 1 (spec R-14, Appendix I.3): QA-RT-1 to QA-RT-7, and a route-edit fuzz, whose
 * routes have smooth points since step 2
 * (QA-RT-8 at the resolver seam: draw, redraw, Remove path, delete, steals and origin moves,
 * with each batch's inverse applied as undo).
 *
 * Distances along the path are recomputed here from first principles (a leg-by-leg walk), not
 * with the resolver's `routePath`, so a walk that ignores the corners fails.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import type {
    AssignmentRow,
    ChangeBatch,
    LaneRow,
    RouteGeometry,
    RowImage,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { mulberry32 } from "./showGenerators";

const EPS_GEOM = 1e-9;
const clone = <T>(x: T): T => structuredClone(x);

const routeGeometry = (points: XY[], from: XY = [0, 0], to: XY = [0, 0]) =>
    ({
        v: 1,
        from,
        to,
        points: points.map((at, i) => ({ id: `p${i}`, at })),
    }) satisfies RouteGeometry;

/** One marcher at `home` walking `points` to `dest` over [start, end). */
function oneRoute(
    points: XY[],
    opts: { home?: XY; dest?: XY; start?: number; end?: number } = {},
): TimelineSnapshot {
    const { home = [0, 0], dest = [9, 10], start = 0, end = 8 } = opts;
    return {
        marchers: [{ id: 1, home }],
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start,
                end,
                dest: null,
                points: [dest],
                slots: 1,
                style: "direct",
                order: "inherit",
                params: null,
            },
        },
        // an own lane (v0.10): step 15's `route` transition, migrated
        lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        routes: { 1: { geometry: routeGeometry(points, home, dest) } },
        assignments: [
            {
                id: 1,
                marcher: 1,
                transition: 1,
                slot: 0,
                start,
                end,
                layer: 0,
            },
        ],
    };
}

const bothImplementations = (db: TimelineSnapshot) =>
    [
        ["resolver", createCachedResolver(clone(db))],
        ["oracle", createOracle(clone(db))],
    ] as const;

const probes = Array.from({ length: 97 }, (_, i) => -2 + i * 0.125);

/**
 * Whether `q` lies on some leg of `V`, and, of the legs it lies on (a path can cross itself),
 * the distance from `A` along the path that is nearest `want`.
 */
function alongPath(
    V: XY[],
    q: XY,
    want: number,
): { d: number; onLeg: boolean } {
    let acc = 0;
    let best = { d: NaN, off: Infinity };
    let onLeg = false;
    for (let j = 0; j + 1 < V.length; j++) {
        const [a, b] = [V[j]!, V[j + 1]!];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t =
            len === 0
                ? 0
                : ((q[0] - a[0]) * (b[0] - a[0]) +
                      (q[1] - a[1]) * (b[1] - a[1])) /
                  (len * len);
        const tc = Math.max(0, Math.min(1, t));
        const off = Math.hypot(
            a[0] + (b[0] - a[0]) * tc - q[0],
            a[1] + (b[1] - a[1]) * tc - q[1],
        );
        const d = acc + tc * len;
        if (off < 1e-7) {
            if (!onLeg || Math.abs(d - want) < Math.abs(best.d - want))
                best = { d, off };
            onLeg = true;
        } else if (!onLeg && off < best.off) best = { d, off };
        acc += len;
    }
    return { d: best.d, onLeg };
}

/** The spec's cleaning (R-14), restated for the tests. */
function cleaned(A: XY, inner: XY[], B: XY): XY[] {
    const d = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    const V: XY[] = [A];
    for (const P of inner) if (d(P, V[V.length - 1]!) >= EPS_GEOM) V.push(P);
    while (V.length > 1 && d(V[V.length - 1]!, B) < EPS_GEOM) V.pop();
    return [...V, B];
}
const lengthOf = (V: XY[]) =>
    V.slice(1).reduce(
        (s, p, i) => s + Math.hypot(p[0] - V[i]![0], p[1] - V[i]![1]),
        0,
    );

describe("routes (spec R-14, v0.9 step 1)", () => {
    it("QA-RT-1: two corners over 8 beats, constant speed, exact ends", () => {
        // legs 5, 6, 6: L = 17, 17/8 a beat
        const expected: Array<[number, XY]> = [
            [1, [1.275, 1.7]],
            [2, [2.55, 3.4]],
            [3, [3, 5.375]],
            [4, [3, 7.5]],
            [5, [3, 9.625]],
            [6, [4.75, 10]],
            [7, [6.875, 10]],
        ];
        for (const [, r] of bothImplementations(
            oneRoute([
                [3, 4],
                [3, 10],
            ]),
        )) {
            for (const [b, xy] of expected) {
                const p = r.positionAt(1, b);
                expect(Math.abs(p[0] - xy[0])).toBeLessThan(1e-9);
                expect(Math.abs(p[1] - xy[1])).toBeLessThan(1e-9);
            }
            expect(r.positionAt(1, 0)).toEqual([0, 0]);
            expect(r.positionAt(1, 8)).toEqual([9, 10]);
            expect(r.positionAt(1, 100)).toEqual([9, 10]);
        }
    });

    it("QA-RT-2: a route with no points is bit-identical to direct", () => {
        const route = oneRoute([], { home: [0.3, -7.1], dest: [13.7, 2.9] });
        const direct = clone(route);
        delete direct.lanes;
        delete direct.routes;
        const a = createCachedResolver(route);
        const b = createCachedResolver(direct);
        const o = createOracle(clone(route));
        for (const t of probes) {
            const [p, q, r] = [
                a.positionAt(1, t),
                b.positionAt(1, t),
                o.positionAt(1, t),
            ];
            expect(Object.is(p[0], q[0]) && Object.is(p[1], q[1])).toBe(true);
            expect(Object.is(r[0], q[0]) && Object.is(r[1], q[1])).toBe(true);
        }
    });

    it("QA-RT-3: random routes walk the polyline at constant speed; P-1 and the bound hold", () => {
        const R = mulberry32(643);
        const pt = (s = 50): XY => [(R() - 0.5) * s, (R() - 0.5) * s];
        for (let n = 0; n < 200; n++) {
            const inner = Array.from({ length: Math.floor(R() * 6) }, () =>
                R() < 0.1 ? [0, 0] : pt(),
            ) as XY[];
            const home = pt();
            const dest = pt();
            const start = Math.floor(R() * 4);
            const end = start + 1 + Math.floor(R() * 12);
            const db = oneRoute(inner, { home, dest, start, end });
            // a direct move after, so P-1 is checked across the boundary
            db.transitions[2] = {
                id: 2,
                start: end,
                end: end + 4,
                dest: null,
                points: [pt()],
                slots: 1,
                style: "direct",
                order: "inherit",
                params: null,
            };
            db.assignments.push({
                id: 2,
                marcher: 1,
                transition: 2,
                slot: 0,
                start: end,
                end: end + 4,
                layer: 0,
            });
            const V = cleaned(home, inner, dest);
            const L = lengthOf(V);
            const beta = Math.max(
                ...[home, dest, ...inner, db.transitions[2].points![0]!].map(
                    (p) => Math.hypot(p[0], p[1]),
                ),
            );
            for (const [, r] of bothImplementations(db)) {
                for (let b = start; b <= end; b += 0.25) {
                    const p = (b - start) / (end - start);
                    const q = r.positionAt(1, b);
                    expect(Number.isFinite(q[0]) && Number.isFinite(q[1])).toBe(
                        true,
                    );
                    expect(Math.hypot(q[0], q[1])).toBeLessThanOrEqual(
                        beta * (1 + 1e-12),
                    );
                    if (L < EPS_GEOM) continue;
                    const { d, onLeg } = alongPath(V, q, p * L);
                    expect(onLeg).toBe(true);
                    expect(Math.abs(d - p * L)).toBeLessThanOrEqual(
                        1e-9 * Math.max(1, L),
                    );
                }
                // P-1: continuity where the route hands over to the next move
                const before = r.positionAt(1, end - 1e-9);
                const at = r.positionAt(1, end);
                expect(
                    Math.hypot(at[0] - before[0], at[1] - before[1]),
                ).toBeLessThan(1e-6 * Math.max(1, L));
            }
        }
    });

    /** A route [0, 8) with a steal [4, 6) at layer 1 that sends the marcher to (20, 0). */
    const stolen = () => {
        const db = oneRoute([
            [3, 4],
            [3, 10],
        ]);
        db.transitions[2] = {
            id: 2,
            start: 4,
            end: 6,
            dest: null,
            points: [[20, 0]],
            slots: 1,
            style: "direct",
            order: "inherit",
            params: null,
        };
        db.assignments.push({
            id: 2,
            marcher: 1,
            transition: 2,
            slot: 0,
            start: 4,
            end: 6,
            layer: 1,
        });
        return db;
    };

    it("QA-RT-4: a steal at c leaves the path at p(s, c) * L and starts exactly there", () => {
        for (const [, r] of bothImplementations(stolen())) {
            // p(s, 4) = 1/2, so 8.5 of 17 along: (3, 7.5)
            const exitAt = r.positionAt(1, 4);
            expect(exitAt[0]).toBeCloseTo(3, 12);
            expect(exitAt[1]).toBeCloseTo(7.5, 12);
            const justBefore = r.positionAt(1, 4 - 1e-9);
            expect(Math.abs(justBefore[1] - 7.5)).toBeLessThan(1e-6);
            expect(r.positionAt(1, 6)).toEqual([20, 0]);
        }
    });

    it("QA-RT-5: the resume after a steal walks straight and raises D-REBASE", () => {
        const db = stolen();
        for (const [, r] of bothImplementations(db)) {
            // from (20, 0) at beat 6 straight to (9, 10) by beat 8
            const q = r.positionAt(1, 7);
            expect(q[0]).toBeCloseTo(14.5, 12);
            expect(q[1]).toBeCloseTo(5, 12);
            expect(
                r
                    .diagnostics()
                    .some(
                        (d) =>
                            d.code === "D-REBASE" &&
                            d.transitionId === 1 &&
                            d.marcherId === 1,
                    ),
            ).toBe(true);
        }
    });

    it("QA-RT-6: points within EPS_GEOM of A, B or each other change nothing; ends exact; finite", () => {
        const base: XY[] = [
            [3, 4],
            [3, 10],
        ];
        const variants: XY[][] = [
            [[4e-10, 0], ...base],
            [...base, [9, 10 - 5e-10], [9 + 3e-10, 10]],
            [
                [3, 4],
                [3, 4],
                [3 + 1e-10, 4],
                [3, 10],
            ],
        ];
        const ref = createCachedResolver(oneRoute(base));
        for (const v of variants)
            for (const [, r] of bothImplementations(oneRoute(v)))
                for (const t of probes) {
                    const p = r.positionAt(1, t);
                    const q = ref.positionAt(1, t);
                    expect(Object.is(p[0], q[0]) && Object.is(p[1], q[1])).toBe(
                        true,
                    );
                }
        // every point within EPS_GEOM, and A = B
        for (const db of [
            oneRoute([
                [1e-10, 0],
                [9, 10 - 1e-10],
            ]),
            oneRoute(
                [
                    [5, 5],
                    [2, 2],
                ],
                { home: [1, 1], dest: [1, 1] },
            ),
            oneRoute([[1, 1 + 1e-10]], { home: [1, 1], dest: [1, 1] }),
        ])
            for (const [, r] of bothImplementations(db)) {
                const home = db.marchers[0]!.home;
                const dest = db.transitions[1]!.points![0]!;
                expect(r.positionAt(1, 0)).toEqual(home);
                expect(r.positionAt(1, 8)).toEqual(dest);
                for (const t of probes) {
                    const p = r.positionAt(1, t);
                    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(
                        true,
                    );
                }
            }
    });
});

// ---------------------------------------------------------------------------
// QA-RT-7 and the route fuzz (QA-RT-8 at the resolver seam)
// ---------------------------------------------------------------------------

type Change = ChangeBatch["changes"][number];
const tImg = (t: TransitionRow): RowImage => ({
    id: t.id,
    dest: t.dest,
    style: t.style,
    params: t.params ? clone(t.params) : null,
    order: t.order,
    slots: t.slots,
    start: t.start,
    end: t.end,
});
const lImg = (id: number, l: LaneRow): RowImage => ({ id, ...clone(l) });
const aImg = (r: AssignmentRow): RowImage => ({ ...r });
const rImg = (id: number, g: RouteGeometry): RowImage => ({
    id,
    geometry: clone(g),
});
const ptImg = (tid: number, p: XY): RowImage => ({
    transition: tid,
    slot: 0,
    x: p[0],
    y: p[1],
});

/**
 * A show of 3 marchers, each with three one-slot moves in a row ([0, 8), [8, 16), [16, 24)),
 * plus edits that a write path would make, each returning its change-log batch and the batch
 * of its inverse (what undo replays).
 */
function routeWorld(seed: number) {
    const R = mulberry32(seed);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const pt = (): XY => [ri(-20, 20), ri(-20, 20)];
    const db: TimelineSnapshot = {
        marchers: [1, 2, 3].map((id) => ({ id, home: pt() })),
        shapes: {},
        transitions: {},
        assignments: [],
        routes: {},
        lanes: {},
    };
    let nextT = 1;
    let nextA = 1;
    let nextR = 1;
    let nextL = 1;
    /** The own lane on slot 0 of `t`, as [lane id, lane] */
    const laneOf = (t: TransitionRow) =>
        Object.entries(db.lanes!)
            .map(([id, l]) => [Number(id), l] as const)
            .find(([, l]) => l.transition === t.id);
    for (const m of [1, 2, 3])
        for (const start of [0, 8, 16]) {
            const id = nextT++;
            db.transitions[id] = {
                id,
                start,
                end: start + 8,
                dest: null,
                points: [pt()],
                slots: 1,
                style: R() < 0.2 ? "arc" : "direct",
                order: "inherit",
                params: null,
            };
            if (db.transitions[id].style === "arc")
                db.transitions[id].params = { bulge: (R() - 0.5) * 0.9 };
            db.assignments.push({
                id: nextA++,
                marcher: m,
                transition: id,
                slot: 0,
                start,
                end: start + 8,
                layer: 0,
            });
        }

    const ownTransitions = () =>
        Object.values(db.transitions).filter((t) =>
            db.assignments.some((a) => a.transition === t.id && a.layer === 0),
        );
    const pick = <T>(xs: T[]): T | undefined => xs[ri(0, xs.length - 1)];
    const randPoints = (): XY[] => Array.from({ length: ri(0, 4) }, pt);
    // Step 2 (QA-RT-8 with curves): about half the points smooth, at a random roundness
    const curvy = (g: RouteGeometry): RouteGeometry => ({
        ...g,
        points: g.points.map((q) =>
            R() < 0.5 ? q : { ...q, tension: Math.round(R() * 20) / 10 || 1 },
        ),
    });

    const ops: Record<string, () => Change[] | null> = {
        draw() {
            const t = pick(ownTransitions().filter((x) => !laneOf(x)));
            if (!t) return null;
            const rid = nextR++;
            const g = curvy(routeGeometry(randPoints(), pt(), pt()));
            db.routes![rid] = { geometry: g };
            const lid = nextL++;
            const lane: LaneRow = {
                transition: t.id,
                slot: 0,
                route: rid,
                offset: null,
            };
            db.lanes![lid] = lane;
            return [
                {
                    table: "routes",
                    rowId: rid,
                    before: null,
                    after: rImg(rid, g),
                },
                {
                    table: "lanes",
                    rowId: lid,
                    before: null,
                    after: lImg(lid, lane),
                },
            ];
        },
        redraw() {
            const t = pick(ownTransitions().filter((x) => !!laneOf(x)));
            if (!t) return null;
            const rid = laneOf(t)![1].route;
            const before = rImg(rid, db.routes![rid]!.geometry);
            const g = curvy(routeGeometry(randPoints(), pt(), pt()));
            db.routes![rid] = { geometry: g };
            return [
                { table: "routes", rowId: rid, before, after: rImg(rid, g) },
            ];
        },
        removePath() {
            const t = pick(ownTransitions().filter((x) => !!laneOf(x)));
            if (!t) return null;
            const [lid, lane] = laneOf(t)!;
            const rid = lane.route;
            const g = db.routes![rid]!.geometry;
            delete db.lanes![lid];
            delete db.routes![rid];
            return [
                {
                    table: "lanes",
                    rowId: lid,
                    before: lImg(lid, lane),
                    after: null,
                },
                {
                    table: "routes",
                    rowId: rid,
                    before: rImg(rid, g),
                    after: null,
                },
            ];
        },
        moveDestination() {
            const t = pick(Object.values(db.transitions));
            if (!t) return null;
            const p = pt();
            const before = ptImg(t.id, t.points![0]!);
            db.transitions[t.id] = { ...t, points: [p] };
            return [
                {
                    table: "slot_destinations",
                    rowId: t.id,
                    before,
                    after: ptImg(t.id, p),
                },
            ];
        },
        moveHome() {
            const m = pick(db.marchers)!;
            const before = { id: m.id, home: m.home };
            m.home = pt();
            return [
                {
                    table: "marchers",
                    rowId: m.id,
                    before,
                    after: { id: m.id, home: m.home },
                },
            ];
        },
        steal() {
            const m = ri(1, 3);
            const start = ri(0, 22);
            const end = Math.min(24, start + ri(1, 6));
            if (
                db.assignments.some(
                    (a) =>
                        a.marcher === m &&
                        a.layer === 1 &&
                        a.start < end &&
                        start < a.end,
                )
            )
                return null;
            const id = nextT++;
            const t: TransitionRow = {
                id,
                start,
                end,
                dest: null,
                points: [pt()],
                slots: 1,
                style: "direct",
                order: "inherit",
                params: null,
            };
            db.transitions[id] = t;
            const a: AssignmentRow = {
                id: nextA++,
                marcher: m,
                transition: id,
                slot: 0,
                start,
                end,
                layer: 1,
            };
            db.assignments.push(a);
            return [
                {
                    table: "transitions",
                    rowId: id,
                    before: null,
                    after: tImg(t),
                },
                {
                    table: "slot_destinations",
                    rowId: id,
                    before: null,
                    after: ptImg(id, t.points![0]!),
                },
                {
                    table: "assignments",
                    rowId: a.id,
                    before: null,
                    after: aImg(a),
                },
            ];
        },
        deleteMove() {
            const t = pick(Object.values(db.transitions));
            if (!t) return null;
            const rows = db.assignments.filter((a) => a.transition === t.id);
            const laned = laneOf(t);
            db.assignments = db.assignments.filter(
                (a) => a.transition !== t.id,
            );
            delete db.transitions[t.id];
            if (laned) delete db.lanes![laned[0]];
            const out: Change[] = [];
            // AP-R3: the lane goes before its transition, the route after
            if (laned)
                out.push({
                    table: "lanes",
                    rowId: laned[0],
                    before: lImg(laned[0], laned[1]),
                    after: null,
                });
            out.push(
                ...rows.map(
                    (a): Change => ({
                        table: "assignments",
                        rowId: a.id,
                        before: aImg(a),
                        after: null,
                    }),
                ),
            );
            out.push(
                {
                    table: "slot_destinations",
                    rowId: t.id,
                    before: ptImg(t.id, t.points![0]!),
                    after: null,
                },
                {
                    table: "transitions",
                    rowId: t.id,
                    before: tImg(t),
                    after: null,
                },
            );
            if (laned) {
                const rid = laned[1].route;
                out.push({
                    table: "routes",
                    rowId: rid,
                    before: rImg(rid, db.routes![rid]!.geometry),
                    after: null,
                });
                delete db.routes![rid];
            }
            return out;
        },
    };

    /** Rebuilds `db` from a saved copy, returning the inverse batch (undo). */
    function restore(saved: TimelineSnapshot, forward: Change[]): Change[] {
        db.marchers = saved.marchers;
        db.transitions = saved.transitions;
        db.assignments = saved.assignments;
        db.routes = saved.routes;
        db.lanes = saved.lanes;
        return [...forward]
            .reverse()
            .map((c) => ({ ...c, before: c.after, after: c.before }));
    }

    return { db, R, ops, restore };
}

describe("route invalidation and fuzz (QA-RT-7, QA-RT-8)", () => {
    it("after every edit and every undo the resolver matches a fresh build and the oracle", () => {
        const counts: Record<string, number> = {};
        for (let seed = 1; seed <= 24; seed++) {
            const w = routeWorld(seed);
            const res = createCachedResolver(w.db);
            res.warmAll();
            const check = (label: string) => {
                expect(res.cacheClosureViolation(), label).toBeNull();
                const fresh = createCachedResolver(clone(w.db));
                const oracle = createOracle(clone(w.db));
                for (const m of [1, 2, 3])
                    for (let b = -1; b <= 26; b += 0.75) {
                        const x = res.positionAt(m, b);
                        const f = fresh.positionAt(m, b);
                        expect(
                            Object.is(x[0], f[0]) && Object.is(x[1], f[1]),
                            `${label}: M${m}@${b} resolver ${x} fresh ${f}`,
                        ).toBe(true);
                        const y = oracle.positionAt(m, b);
                        expect(
                            Math.abs(x[0] - y[0]) < 1e-6 &&
                                Math.abs(x[1] - y[1]) < 1e-6,
                            `${label}: M${m}@${b} resolver ${x} oracle ${y}`,
                        ).toBe(true);
                    }
                expect(res.cacheClosureViolation(), label).toBeNull();
            };
            const names = Object.keys(w.ops);
            for (let step = 0; step < 30; step++) {
                const name = names[Math.floor(w.R() * names.length)]!;
                const saved = clone(w.db);
                const forward = w.ops[name]!();
                if (!forward) continue;
                counts[name] = (counts[name] ?? 0) + 1;
                res.notify({ changes: forward });
                check(`seed ${seed} step ${step} ${name}`);
                if (w.R() < 0.3) {
                    // undo, then redo
                    const after = clone(w.db);
                    const inverse = w.restore(saved, forward);
                    res.notify({ changes: inverse });
                    check(`seed ${seed} step ${step} undo ${name}`);
                    w.restore(after, inverse);
                    res.notify({ changes: forward });
                    check(`seed ${seed} step ${step} redo ${name}`);
                }
            }
        }
        for (const n of [
            "draw",
            "redraw",
            "removePath",
            "moveDestination",
            "moveHome",
            "steal",
            "deleteMove",
        ])
            expect(counts[n] ?? 0, n).toBeGreaterThan(5);
    }, 120_000);
});
