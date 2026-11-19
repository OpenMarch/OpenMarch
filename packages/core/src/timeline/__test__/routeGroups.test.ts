/**
 * Group paths, v0.9 step 15 (spec R-14 "Group schedule", Appendix I.9): QA-RT-15 to QA-RT-19,
 * stored as lanes since plan step 24 (spec v0.10 R-14′, D-20). The expected values are step 15's,
 * so these are also QA-RT-L1's bit-identity checks; QA-RT-L1 below adds the same group on one
 * shared transition, a lane per slot, which step 15 could only store broken out.
 *
 * Positions are checked against the `ref/` oracle (`docs/timeline/ref`, written separately from
 * this package) bit for bit, and rigidity, steady speed and landing on the end set from first
 * principles.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import {
    groupWalk,
    routeWalk,
} from "../../../../../docs/timeline/ref/geom.mjs";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { makeOracle } from "../../../../../docs/timeline/ref/oracle.mjs";
import { groupMemberWalk, groupSchedule, type RouteVertex } from "../geom";
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
import { validateLaneOffset } from "../validate";
import { offsetOn } from "./laneFixtures";
import { mulberry32 } from "./showGenerators";

type Change = ChangeBatch["changes"][number];
type Positions = { positionAt(m: number, b: number): XY };
type RefGroup = {
    at(p: number): XY;
    uFirst: number;
    uLast: number;
    W: { V: XY[]; L: number };
    first: { len: number } | null;
    last: { len: number } | null;
};
const refGroup = groupWalk as (
    A: XY,
    pts: readonly RouteVertex[],
    B: XY,
    F: XY,
    G: XY,
    o: XY,
) => RefGroup;
const refRoute = routeWalk as (
    A: XY,
    pts: readonly RouteVertex[],
    B: XY,
    F: XY,
    G: XY,
) => { at(p: number): XY };
const refOracle = makeOracle as (db: TimelineSnapshot) => Positions;

const clone = <T>(x: T): T => structuredClone(x);
const same = (p: XY, q: XY) => Object.is(p[0], q[0]) && Object.is(p[1], q[1]);
const dist = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const sub = (p: XY, q: XY): XY => [p[0] - q[0], p[1] - q[1]];

const HOMES: XY[] = [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
];
const mean = (ps: XY[]): XY => {
    let x = 0;
    let y = 0;
    for (const p of ps) {
        x += p[0];
        y += p[1];
    }
    return [x / ps.length, y / ps.length];
};
const PTS: RouteVertex[] = [{ at: [6, 6], tension: 1 }, { at: [12, 2] }];

/**
 * A block of `homes` walking one group path to `ends` over [0, 16): marcher `i + 1` alone in
 * transition `i + 1`, with lane `i + 1` on its slot 0 (step 15's breakout, migrated to lanes).
 */
function groupShow(
    points: RouteVertex[],
    ends: XY[],
    homes: XY[] = HOMES,
    offsets?: XY[],
): TimelineSnapshot {
    const from = mean(homes);
    const to = mean(ends);
    const offs = offsets ?? homes.map((h) => sub(h, from));
    return {
        marchers: homes.map((home, i) => ({ id: i + 1, home })),
        shapes: {},
        transitions: Object.fromEntries(
            homes.map((_, i) => [
                i + 1,
                {
                    id: i + 1,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [ends[i]!],
                    slots: 1,
                    style: "direct",
                    order: "inherit",
                    params: null,
                } satisfies TransitionRow,
            ]),
        ),
        lanes: Object.fromEntries(
            homes.map((_, i) => [
                i + 1,
                {
                    transition: i + 1,
                    slot: 0,
                    route: 1,
                    offset: offs[i]!,
                } satisfies LaneRow,
            ]),
        ),
        routes: {
            1: {
                geometry: {
                    v: 1,
                    from,
                    to,
                    points: points.map((q, i) => ({ id: `p${i}`, ...q })),
                },
            },
        },
        assignments: homes.map((_, i) => ({
            id: i + 1,
            marcher: i + 1,
            transition: i + 1,
            slot: 0,
            start: 0,
            end: 16,
            layer: 0,
        })),
    };
}

const probes = Array.from({ length: 177 }, (_, i) => -1 + i * 0.1 + 0.03125);

function expectAgreesWithRef(db: TimelineSnapshot) {
    const ref = refOracle(clone(db));
    const implementations: [string, Positions][] = [
        ["resolver", createCachedResolver(clone(db))],
        ["oracle", createOracle(clone(db))],
    ];
    for (const m of db.marchers.map((x) => x.id))
        for (const b of probes) {
            const want = ref.positionAt(m, b);
            for (const [name, impl] of implementations) {
                const got = impl.positionAt(m, b);
                expect(
                    same(got, want),
                    `${name} M${m}@${b}: ${got} vs ref ${want}`,
                ).toBe(true);
            }
        }
}

describe("group paths (spec R-14 group schedule, v0.9 step 15)", () => {
    it("QA-RT-15: a block whose end set is its start moved over is rigid and steady the whole move", () => {
        const G: XY = [16, 4];
        const from = mean(HOMES);
        const ends = HOMES.map(
            (h): XY => [h[0] + G[0] - from[0], h[1] + G[1] - from[1]],
        );
        const db = groupShow(PTS, ends);
        expectAgreesWithRef(db);
        const r = createCachedResolver(clone(db));
        const ref = refRoute(from, PTS, G, from, G);
        for (let m = 1; m <= 4; m++) {
            const o = offsetOn(db, m);
            for (const b of probes) {
                const p = r.positionAt(m, b);
                const w = ref.at(Math.min(1, Math.max(0, b / 16)));
                expect(dist(sub(p, o), w)).toBeLessThan(1e-9);
            }
            expect(same(r.positionAt(m, 16), ends[m - 1]!)).toBe(true);
            expect(same(r.positionAt(m, 0), HOMES[m - 1]!)).toBe(true);
        }
    });

    it("QA-RT-16: an end set of another shape: rigid between the first and last points, legs steady", () => {
        const ends: XY[] = [
            [10, 8],
            [12, 8],
            [14, 8],
            [16, 8],
        ];
        const db = groupShow(PTS, ends);
        expectAgreesWithRef(db);
        const r = createCachedResolver(clone(db));
        const schedule = groupSchedule(db.routes![1]!.geometry);
        const { uFirst, uLast, W } = schedule;
        const m1 = W.V.length - 2;
        const off = (m: number) => offsetOn(db, m);
        for (let m = 1; m <= 4; m++) {
            const o = off(m);
            expect(
                dist(r.positionAt(m, uFirst * 16), [
                    W.V[1]![0] + o[0],
                    W.V[1]![1] + o[1],
                ]),
            ).toBeLessThan(1e-9);
            expect(
                dist(r.positionAt(m, uLast * 16), [
                    W.V[m1]![0] + o[0],
                    W.V[m1]![1] + o[1],
                ]),
            ).toBeLessThan(1e-9);
            for (let k = 0; k <= 50; k++) {
                const b = 16 * (uFirst + ((uLast - uFirst) * k) / 50);
                const d = sub(r.positionAt(m, b), r.positionAt(1, b));
                expect(dist(d, sub(o, off(1)))).toBeLessThan(1e-9);
            }
            // the last leg is a line (W_m is a corner): equal distance per sub-step
            const steps = Array.from({ length: 12 }, (_, k) =>
                dist(
                    r.positionAt(m, 16 * (uLast + ((1 - uLast) * k) / 12)),
                    r.positionAt(
                        m,
                        16 * (uLast + ((1 - uLast) * (k + 1)) / 12),
                    ),
                ),
            );
            expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-6);
            expect(same(r.positionAt(m, 16), ends[m - 1]!)).toBe(true);
        }
        const lens = [1, 2, 3, 4].map(
            (m) =>
                groupMemberWalk(schedule, HOMES[m - 1]!, ends[m - 1]!, off(m))
                    .last!.length,
        );
        expect(Math.max(...lens) - Math.min(...lens)).toBeGreaterThan(1);
    });

    it("QA-RT-16: corner first, smooth last: the last leg is the cubic, still rigid in the middle", () => {
        const pts: RouteVertex[] = [
            { at: [6, 6] },
            { at: [12, 2], tension: 1.2 },
        ];
        const ends: XY[] = [
            [10, 8],
            [12, 8],
            [14, 8],
            [16, 8],
        ];
        const db = groupShow(pts, ends);
        expectAgreesWithRef(db);
        const schedule = groupSchedule(db.routes![1]!.geometry);
        const r = createCachedResolver(clone(db));
        const off = (m: number) => offsetOn(db, m);
        for (let m = 1; m <= 4; m++) {
            const walk = groupMemberWalk(
                schedule,
                HOMES[m - 1]!,
                ends[m - 1]!,
                off(m),
            );
            expect(walk.last!.path.pieces[0]!.kind).toBe("cubic");
            expect(walk.first!.path.pieces[0]!.kind).toBe("line");
            for (let k = 0; k <= 20; k++) {
                const b =
                    16 *
                    (schedule.uFirst +
                        ((schedule.uLast - schedule.uFirst) * k) / 20);
                expect(
                    dist(
                        sub(r.positionAt(m, b), r.positionAt(1, b)),
                        sub(off(m), off(1)),
                    ),
                ).toBeLessThan(1e-9);
            }
        }
    });

    it("QA-RT-20: random group shows: rigid between the moments, on the placed points, ends exact, app = oracle", () => {
        const R = mulberry32(20);
        for (let k = 0; k < 120; k++) {
            const scale = R() < 0.15 ? 2e5 : 50;
            const pt = (): XY => [
                Math.round((R() - 0.5) * scale * 4) / 4,
                Math.round((R() - 0.5) * scale * 4) / 4,
            ];
            const n = 2 + Math.floor(R() * 5);
            const homes = Array.from({ length: n }, pt);
            const ends = Array.from({ length: n }, pt);
            const pts: RouteVertex[] = Array.from(
                { length: Math.floor(R() * 6) },
                () =>
                    R() < 0.5
                        ? {
                              at: pt(),
                              tension: Math.max(0.1, Math.round(R() * 20) / 10),
                          }
                        : { at: pt() },
            );
            const offsets =
                R() < 0.2
                    ? homes.map(
                          (): XY => [(R() - 0.5) * 4e6, (R() - 0.5) * 4e6],
                      )
                    : undefined;
            const db = groupShow(pts, ends, homes, offsets);
            const geo = db.routes![1]!.geometry;
            const schedule = groupSchedule(geo);
            const r = createCachedResolver(clone(db));
            const ref = refOracle(clone(db));
            const m1 = schedule.W.V.length - 2;
            const tol = 1e-9 * Math.max(1, scale, offsets ? 4e6 : 0);
            for (let m = 1; m <= n; m++) {
                const o = offsetOn(db, m);
                const walk = groupMemberWalk(
                    schedule,
                    homes[m - 1]!,
                    ends[m - 1]!,
                    o,
                );
                const rw = refGroup(
                    homes[m - 1]!,
                    pts,
                    ends[m - 1]!,
                    geo.from,
                    geo.to,
                    o,
                );
                expect(
                    Object.is(schedule.uFirst, rw.uFirst) &&
                        Object.is(schedule.uLast, rw.uLast),
                ).toBe(true);
                expect(walk.first?.length ?? null).toBe(rw.first?.len ?? null);
                expect(walk.last?.length ?? null).toBe(rw.last?.len ?? null);
                expect(same(r.positionAt(m, 16), ends[m - 1]!)).toBe(true);
                expect(same(r.positionAt(m, 0), homes[m - 1]!)).toBe(true);
                for (const b of [1, 3.3, 7, 11.9, 15.5]) {
                    const p = r.positionAt(m, b);
                    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(
                        true,
                    );
                    expect(same(p, ref.positionAt(m, b))).toBe(true);
                }
                if (m1 < 1) continue;
                for (let q = 0; q <= 8; q++) {
                    const b =
                        16 *
                        (schedule.uFirst +
                            ((schedule.uLast - schedule.uFirst) * q) / 8);
                    const o1 = offsetOn(db, 1);
                    expect(
                        dist(
                            sub(r.positionAt(m, b), r.positionAt(1, b)),
                            sub(o, o1),
                        ),
                    ).toBeLessThan(tol);
                }
            }
        }
    });

    it("QA-RT-17: an own path is unchanged; offset [0, 0] on a block moved over walks the same within rounding", () => {
        const R = mulberry32(17);
        for (let k = 0; k < 120; k++) {
            const pt = (): XY => [
                Math.round((R() - 0.5) * 200) / 4,
                Math.round((R() - 0.5) * 200) / 4,
            ];
            const pts: RouteVertex[] = Array.from(
                { length: Math.floor(R() * 5) },
                () => (R() < 0.5 ? { at: pt(), tension: 1 } : { at: pt() }),
            );
            const [A, B] = [pt(), pt()];
            const own = groupShow(pts, [B], [A], [[0, 0]]);
            own.lanes![1]!.offset = null;
            const zero = groupShow(pts, [B], [A], [[0, 0]]);
            const ro = createCachedResolver(own);
            const rz = createCachedResolver(zero);
            const ref = refRoute(A, pts, B, A, B);
            for (const b of probes) {
                const p = ro.positionAt(1, b);
                expect(same(p, ref.at(Math.min(1, Math.max(0, b / 16))))).toBe(
                    true,
                );
                expect(dist(p, rz.positionAt(1, b))).toBeLessThan(1e-9);
            }
        }
    });

    it("QA-RT-19: no points, one point, a zero-length leg, a cleaned first point and offsets at the bound", () => {
        const ends = HOMES.map((h): XY => [h[0] + 15, h[1] + 3]);
        const none = groupShow([], ends);
        const one = groupShow([{ at: [8, 9], tension: 1 }], ends);
        const zero = groupShow(
            PTS,
            ends,
            [[5, 5], ...HOMES.slice(1)],
            HOMES.map((h) => sub(h, [1, 1])),
        );
        const near = groupShow([{ at: [1 + 1e-10, 1] }, ...PTS], ends);
        const big = groupShow(PTS, ends, HOMES, [
            [2e6, -2e6],
            [-2e6, 2e6],
            [2e6, 2e6],
            [-2e6, -2e6],
        ]);
        for (const db of [none, one, zero, near, big]) {
            expectAgreesWithRef(db);
            const r = createCachedResolver(clone(db));
            for (let m = 1; m <= 4; m++)
                for (const b of probes) {
                    const p = r.positionAt(m, b);
                    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(
                        true,
                    );
                }
        }
        const rn = createCachedResolver(none);
        const a = HOMES[0]!;
        const e = ends[0]!;
        expect(
            same(rn.positionAt(1, 5), [
                a[0] + (e[0] - a[0]) * (5 / 16),
                a[1] + (e[1] - a[1]) * (5 / 16),
            ]),
        ).toBe(true);
        const s1 = groupSchedule(one.routes![1]!.geometry);
        expect(s1.uFirst).toBe(s1.uLast);
        const rz = createCachedResolver(zero);
        const sz = groupSchedule(zero.routes![1]!.geometry);
        for (const b of [0.5, 2, sz.uFirst * 16 - 0.01])
            expect(same(rz.positionAt(1, b), [5, 5])).toBe(true);
        expect(validateLaneOffset([2e6, -2e6]).ok).toBe(true);
        expect(validateLaneOffset(null).ok).toBe(true);
        for (const bad of [
            [Number.NaN, 0],
            ["1", 0],
            [1, 2, 3],
            [2e6 + 1, 0],
            { offset: [0, 0] },
        ])
            expect(validateLaneOffset(bad).ok, JSON.stringify(bad)).toBe(false);
    });

    it("QA-RT-L1: the same group on one shared transition, a lane per slot, is bit-identical to step 15's breakout", () => {
        const R = mulberry32(241);
        for (let k = 0; k < 60; k++) {
            const pt = (): XY => [
                Math.round((R() - 0.5) * 200) / 4,
                Math.round((R() - 0.5) * 200) / 4,
            ];
            const n = 2 + Math.floor(R() * 6);
            const homes = Array.from({ length: n }, pt);
            const ends = Array.from({ length: n }, pt);
            const pts: RouteVertex[] = Array.from(
                { length: Math.floor(R() * 5) },
                () => (R() < 0.5 ? { at: pt(), tension: 1.3 } : { at: pt() }),
            );
            const broken = groupShow(pts, ends, homes);
            // One shared transition (as a block's move is), slot i holding marcher i + 1, and an
            // arc style that the lanes override (R-14′: lane first, whatever the style)
            const shared: TimelineSnapshot = {
                ...clone(broken),
                transitions: {
                    1: {
                        id: 1,
                        start: 0,
                        end: 16,
                        dest: null,
                        points: ends,
                        slots: n,
                        style: k % 2 ? "arc" : "direct",
                        order: "inherit",
                        params: k % 2 ? { bulge: 0.3 } : null,
                    },
                },
                assignments: homes.map((_, i) => ({
                    id: i + 1,
                    marcher: i + 1,
                    transition: 1,
                    slot: i,
                    start: 0,
                    end: 16,
                    layer: 0,
                })),
                lanes: Object.fromEntries(
                    homes.map((_, i) => [
                        i + 1,
                        { ...broken.lanes![i + 1]!, transition: 1, slot: i },
                    ]),
                ),
            };
            const a = createCachedResolver(clone(broken));
            const b = createCachedResolver(clone(shared));
            const o = createOracle(clone(shared));
            const ref = refOracle(clone(shared));
            for (let m = 1; m <= n; m++)
                for (const t of probes) {
                    const p = a.positionAt(m, t);
                    expect(same(p, b.positionAt(m, t)), `M${m}@${t}`).toBe(
                        true,
                    );
                    expect(same(p, o.positionAt(m, t))).toBe(true);
                    expect(same(p, ref.positionAt(m, t))).toBe(true);
                }
        }
    }, 60_000);
});

// ---------------------------------------------------------------------------
// QA-RT-18: invalidation. Every edit of a group path, then undo and redo.
// ---------------------------------------------------------------------------

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
const aImg = (r: AssignmentRow): RowImage => ({ ...r });

function groupWorld(seed: number) {
    const R = mulberry32(seed);
    const pt = (): XY => [
        Math.round((R() - 0.5) * 120) / 4,
        Math.round((R() - 0.5) * 120) / 4,
    ];
    const ends = HOMES.map(() => pt());
    const db = groupShow(PTS, ends);
    let nextRoute = 2;
    const route = (rid: number) => db.routes![rid]!;
    /** The lanes on route `rid`, as [lane id, lane] */
    const members = (rid: number) =>
        Object.entries(db.lanes!)
            .filter(([, l]) => l.route === rid)
            .map(([id, l]) => [Number(id), l] as const);
    const updL = (id: number, f: (l: LaneRow) => void): Change => {
        const lane = db.lanes![id]!;
        const before = lImg(id, lane);
        f(lane);
        return { table: "lanes", rowId: id, before, after: lImg(id, lane) };
    };
    const ops: Record<string, () => Change[] | null> = {
        editPoints() {
            const rid = members(1).length ? 1 : null;
            if (rid === null) return null;
            const before = rImg(rid, route(rid).geometry);
            route(rid).geometry.points = route(rid).geometry.points.map(
                (q) => ({
                    ...q,
                    at: [q.at[0] + R() - 0.5, q.at[1] + R() - 0.5] as XY,
                }),
            );
            return [
                {
                    table: "routes",
                    rowId: rid,
                    before,
                    after: rImg(rid, route(rid).geometry),
                },
            ];
        },
        changeOffset() {
            const t = members(1)[Math.floor(R() * members(1).length)];
            if (!t) return null;
            return [updL(t[0], (x) => (x.offset = [R() * 4 - 2, R() * 4 - 2]))];
        },
        ownPath() {
            const g = members(1);
            const t = g[Math.floor(R() * g.length)];
            if (!t) return null;
            const o = t[1].offset!;
            const src = route(1).geometry;
            const rid = nextRoute++;
            db.routes![rid] = {
                geometry: {
                    v: 1,
                    from: [src.from[0] + o[0], src.from[1] + o[1]],
                    to: [src.to[0] + o[0], src.to[1] + o[1]],
                    points: src.points.map((q) => ({
                        ...q,
                        at: [q.at[0] + o[0], q.at[1] + o[1]] as XY,
                    })),
                },
            };
            const out: Change[] = [
                {
                    table: "routes",
                    rowId: rid,
                    before: null,
                    after: rImg(rid, db.routes![rid]!.geometry),
                },
                updL(t[0], (x) => {
                    x.route = rid;
                    x.offset = null;
                }),
            ];
            if (g.length === 1) {
                out.push({
                    table: "routes",
                    rowId: 1,
                    before: rImg(1, src),
                    after: null,
                });
                delete db.routes![1];
            }
            return out;
        },
        rejoin() {
            if (!db.routes![1]) return null;
            const t = Object.entries(db.lanes!).find(([, x]) => x.route !== 1);
            if (!t) return null;
            const old = t[1].route;
            const A = db.marchers.find((m) => m.id === t[1].transition)!.home;
            const f = route(1).geometry.from;
            const out: Change[] = [
                updL(Number(t[0]), (x) => {
                    x.route = 1;
                    x.offset = [A[0] - f[0], A[1] - f[1]];
                }),
            ];
            if (old != null && !members(old).length) {
                out.push({
                    table: "routes",
                    rowId: old,
                    before: rImg(old, route(old).geometry),
                    after: null,
                });
                delete db.routes![old];
            }
            return out;
        },
        moveEnd() {
            const t = Object.values(db.transitions)[Math.floor(R() * 4)];
            if (!t) return null;
            const before = ptImg(t.id, t.points![0]!);
            t.points = [pt()];
            return [
                {
                    table: "slot_destinations",
                    rowId: t.id,
                    before,
                    after: ptImg(t.id, t.points[0]!),
                },
            ];
        },
        deleteMember() {
            const g = members(1);
            if (g.length < 2) return null;
            const [laneId, lane] = g[Math.floor(R() * g.length)]!;
            const t = db.transitions[lane.transition]!;
            const rows = db.assignments.filter((a) => a.transition === t.id);
            db.assignments = db.assignments.filter(
                (a) => a.transition !== t.id,
            );
            delete db.transitions[t.id];
            delete db.lanes![laneId];
            return [
                // the lane goes first (AP-R3: it references its transition)
                {
                    table: "lanes",
                    rowId: laneId,
                    before: lImg(laneId, lane),
                    after: null,
                },
                ...rows.map(
                    (a): Change => ({
                        table: "assignments",
                        rowId: a.id,
                        before: aImg(a),
                        after: null,
                    }),
                ),
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
            ];
        },
    };
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

describe("group path invalidation (QA-RT-18)", () => {
    it("after every edit, undo and redo the resolver matches a fresh build and the ref oracle", () => {
        const counts: Record<string, number> = {};
        for (let seed = 1; seed <= 10; seed++) {
            const w = groupWorld(seed);
            const res = createCachedResolver(w.db);
            res.warmAll();
            const check = (label: string) => {
                expect(res.cacheClosureViolation(), label).toBeNull();
                const fresh = createCachedResolver(clone(w.db));
                const ref = refOracle(clone(w.db));
                for (const m of w.db.marchers.map((x) => x.id))
                    for (let b = -1; b <= 17; b += 1.375) {
                        const x = res.positionAt(m, b);
                        expect(
                            same(x, fresh.positionAt(m, b)),
                            `${label}: M${m}@${b} vs fresh`,
                        ).toBe(true);
                        expect(
                            same(x, ref.positionAt(m, b)),
                            `${label}: M${m}@${b} vs ref`,
                        ).toBe(true);
                    }
            };
            const names = Object.keys(w.ops);
            for (let step = 0; step < 24; step++) {
                const name = names[Math.floor(w.R() * names.length)]!;
                const saved = clone(w.db);
                const forward = w.ops[name]!();
                if (!forward) continue;
                counts[name] = (counts[name] ?? 0) + 1;
                res.notify({ changes: forward });
                check(`seed ${seed} step ${step} ${name}`);
                const after = clone(w.db);
                const inverse = w.restore(saved, forward);
                res.notify({ changes: inverse });
                check(`seed ${seed} step ${step} undo ${name}`);
                w.restore(after, inverse);
                res.notify({ changes: forward });
                check(`seed ${seed} step ${step} redo ${name}`);
            }
        }
        for (const n of [
            "editPoints",
            "changeOffset",
            "ownPath",
            "rejoin",
            "moveEnd",
            "deleteMember",
        ])
            expect(counts[n] ?? 0, n).toBeGreaterThan(0);
    }, 120_000);
});
