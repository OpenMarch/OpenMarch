/**
 * The cached resolver's regression, invalidation and complexity suites (spec
 * 12.6 QA-REG-1 to -4 and QA-INV-02 to -07, 12.7 QA-CX-01 to -05), the P-8
 * and P-10 properties (12.5), and the follow-ups from the PR #6 review: the
 * pull-compile guard, negative closure checks and notify() edge cases.
 *
 * Complexity is asserted on counters only, never on wall-clock time (12.7).
 * The golden vectors G1 to G13 already run on the resolver in
 * `resolver.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver, type CachedResolver } from "../resolver";
import type {
    Counters,
    DestPath,
    InvalidationReport,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { GOLDEN, P, g6, row, tr } from "./fixtures";
import { expectPositions } from "./goldenSuite";
import {
    Editor,
    NOTIFY_CASES,
    beatsOf,
    clone,
    expectAgrees,
    expectClosed,
    richShow,
    tImg,
} from "./resolverHarness";

const FTL = "follow_the_leader" as const;
const ftl = (
    id: number,
    start: number,
    end: number,
    dest: number,
    extra: Partial<TransitionRow> = {},
): TransitionRow =>
    tr(id, start, end, dest, {
        style: FTL,
        params: { waypoints: [] },
        ...extra,
    });
const line = (a: XY, b: XY): ShapeRow => ({
    kind: "line",
    geometry: { points: [a, b] },
});
/** The destination line that QA-REG-1 to -4 share: p0 = (6,2) … p_{n-1} = (6,8). */
const REG_LINE = line([6, 2], [6, 8]);

const g6Flat = () =>
    g6([
        [0, 0],
        [6, 0],
    ]);
const golden = (prefix: string) =>
    GOLDEN.find((g) => g.name.startsWith(`${prefix}:`))!;

const EMPTY_REPORT: InvalidationReport = {
    marchersRebuilt: [],
    originsDirtied: 0,
    ftlEntriesDirtied: 0,
    localRecomputed: { destinations: [], ftlGeometry: [] },
};

function warmed(host: TimelineSnapshot): CachedResolver {
    const r = createCachedResolver(host);
    r.warmAll();
    expectClosed(r);
    return r;
}

/** Queries every marcher at every probe beat, as playback would (ref/regress.mjs `warm`). */
function query(r: CachedResolver, host: TimelineSnapshot) {
    for (const b of beatsOf(host))
        for (const m of r.marcherIds()) r.positionAt(m, b);
}

const spanCount = (r: CachedResolver) =>
    r.marcherIds().reduce((n, m) => n + r.spanInfos(m).length, 0);

/** FTL transitions of the show, split by whether any span uses them. */
function ftlTransitions(r: CachedResolver, host: TimelineSnapshot) {
    const used = new Set<number>();
    for (const m of r.marcherIds())
        for (const s of r.spanInfos(m))
            if (s.transitionId != null) used.add(s.transitionId);
    const all = Object.values(host.transitions).filter((t) => t.style === FTL);
    return {
        withSpans: all.filter((t) => used.has(t.id)).length,
        withoutSpans: all.filter((t) => !used.has(t.id)).length,
    };
}

function near(p: XY, x: number, y: number, eps = 1e-9) {
    expect(
        Math.abs(p[0] - x) + Math.abs(p[1] - y),
        `(${p}) vs (${x},${y})`,
    ).toBeLessThan(eps);
}

/** Runs one batch on a warm resolver; returns the report and the counters it moved. */
function notifyMeasured(r: CachedResolver, e: Editor) {
    r.resetCounters();
    const report = r.notify(e.batch());
    return { report, counters: r.counters() };
}

/**
 * QA-CX-05's ladder: 2 marchers through `K` consecutive 2-slot FTL
 * transitions (ref/cx.mjs). Each FTL inherits its order from the previous
 * one, so the dependency graph has about 2^K paths.
 */
function ladder(K: number): TimelineSnapshot {
    const host: TimelineSnapshot = {
        marchers: [
            { id: 1, home: [0, 0] },
            { id: 2, home: [1, 0] },
        ],
        shapes: {},
        transitions: {},
        assignments: [],
    };
    for (let i = 1; i <= K; i++) {
        host.shapes[i] = line([i * 3, 0], [i * 3 + 1, 1]);
        host.transitions[i] = ftl(i, (i - 1) * 4, i * 4, i, { slots: 2 });
        host.assignments.push(
            row(1, i, 0, (i - 1) * 4, i * 4),
            row(2, i, 1, (i - 1) * 4, i * 4),
        );
    }
    return host;
}

/**
 * QA-CX-04: the show followed by `copies - 1` copies of itself, each shifted
 * later in time, with fresh transition, shape and row ids. The marchers stay
 * the same, so the chain gets longer.
 */
function repeated(
    show: () => TimelineSnapshot,
    copies: number,
): TimelineSnapshot {
    const base = show();
    let end = 0;
    for (const t of Object.values(base.transitions)) end = Math.max(end, t.end);
    const period = end + 2;
    const out: TimelineSnapshot = clone(base);
    let nextRow = Math.max(...base.assignments.map((a) => a.id)) + 1;
    for (let k = 1; k < copies; k++) {
        const dt = k * period;
        const id = (x: number) => x + 1000 * k;
        for (const [sid, s] of Object.entries(base.shapes))
            out.shapes[id(Number(sid))] = clone(s);
        for (const t of Object.values(base.transitions))
            out.transitions[id(t.id)] = {
                ...clone(t),
                id: id(t.id),
                dest: t.dest == null ? null : id(t.dest),
                start: t.start + dt,
                end: t.end + dt,
            };
        for (const a of base.assignments)
            out.assignments.push({
                ...a,
                id: nextRow++,
                transition: id(a.transition),
                start: a.start + dt,
                end: a.end + dt,
            });
    }
    return out;
}

/** A shape moved by (dx, dy), whatever its kind. */
function translated(s: ShapeRow, dx: number, dy: number): ShapeRow {
    const mv = (p: XY): XY => [p[0] + dx, p[1] + dy];
    switch (s.kind) {
        case "circle":
            return {
                ...s,
                geometry: { ...s.geometry, center: mv(s.geometry.center) },
            };
        case "box":
            return {
                ...s,
                geometry: { ...s.geometry, origin: mv(s.geometry.origin) },
            };
        case "block":
            return {
                ...s,
                geometry: { ...s.geometry, origin: mv(s.geometry.origin) },
            };
        default:
            return {
                ...s,
                geometry: { ...s.geometry, points: s.geometry.points.map(mv) },
            };
    }
}

// ---------------------------------------------------------------------------
// QA-REG-1 to -4 (spec 12.6, ref/regress.mjs), under the current (v0.2+) rules
// ---------------------------------------------------------------------------

describe("QA-REG (spec 12.6): review regressions under the current rules", () => {
    it("QA-REG-1: inserting a lower-slot FTL joiner re-targets the existing joiner", () => {
        const host: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [2, 0] },
                { id: 3, home: [4, 0] },
                { id: 4, home: [-2, 0] },
            ],
            shapes: { 1: REG_LINE },
            transitions: { 1: ftl(1, 4, 12, 1, { slots: 4, order: "slot" }) },
            // founders M2, M3; joiner M1 in slot 3
            assignments: [
                row(2, 1, 0, 4, 12),
                row(3, 1, 1, 4, 12),
                row(1, 1, 3, 8, 12),
            ],
        };
        const r = createCachedResolver(host);
        query(r, host);
        near(r.positionAt(1, 12), 6, 4); // M1 alone as a joiner: p1
        const e = new Editor(host);
        e.insertRow({
            marcher: 4,
            transition: 1,
            slot: 2,
            start: 8,
            end: 12,
            layer: 0,
        });
        const report = r.notify(e.batch());
        expect(report.ftlEntriesDirtied).toBeGreaterThanOrEqual(1);
        near(r.positionAt(1, 12), 6, 2); // M1 re-targets to p0
        near(r.positionAt(4, 12), 6, 4);
        expectAgrees(r, host);
    });

    it("QA-REG-2: a founder turned joiner by a higher layer leaves the founding set", () => {
        const host: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [2, 0] },
                { id: 3, home: [4, 0] },
            ],
            shapes: { 1: REG_LINE, 2: P(20, 20) },
            transitions: {
                1: ftl(1, 0, 8, 1, { slots: 3, order: "slot" }),
                2: tr(2, 0, 4, 2),
            },
            assignments: [
                row(1, 1, 0, 0, 8),
                row(2, 1, 1, 0, 8),
                row(3, 1, 2, 0, 8),
            ],
        };
        const r = createCachedResolver(host);
        query(r, host);
        expect(r.ftlEntry(1).members).toEqual([1, 2, 3]);
        const e = new Editor(host);
        // steal M1 at T1's start: its T1 span becomes a join
        e.insertRow({
            marcher: 1,
            transition: 2,
            slot: 0,
            start: 0,
            end: 4,
            layer: 1,
        });
        r.notify(e.batch());
        expect(r.ftlEntry(1).members).toEqual([2, 3]);
        expect(r.spanInfos(1).map((s) => s.kind)).toEqual([
            "hold",
            "founding",
            "join",
            "hold",
        ]);
        expectAgrees(r, host);
    });

    it("QA-REG-3: deleting a marcher with a fully overridden FTL row re-targets the remaining joiner", () => {
        const host: TimelineSnapshot = {
            marchers: [1, 2, 3, 5].map((id) => ({ id, home: [id, 0] as XY })),
            shapes: { 1: REG_LINE, 2: P(20, 20) },
            transitions: {
                1: ftl(1, 4, 12, 1, { slots: 4, order: "slot" }),
                2: tr(2, 8, 12, 2),
            },
            assignments: [
                row(2, 1, 0, 4, 12),
                row(3, 1, 1, 4, 12),
                row(5, 1, 2, 8, 12), // fully overridden by the layer-1 row below
                row(1, 1, 3, 8, 12),
                row(5, 2, 0, 8, 12, 1),
            ],
        };
        const r = createCachedResolver(host);
        query(r, host);
        // M5's slot-2 row produces no span but still reserves p1, so M1 gets p0
        near(r.positionAt(1, 12), 6, 2);
        const e = new Editor(host);
        e.deleteMarcher(5);
        r.notify(e.batch());
        near(r.positionAt(1, 12), 6, 4);
        expectAgrees(r, host);
    });

    it("QA-REG-4: layering elsewhere re-allocates FTL targets though T's rows are unchanged", () => {
        const host: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [2, 0] },
            ],
            shapes: { 1: REG_LINE, 2: P(20, 20) },
            transitions: {
                1: ftl(1, 0, 8, 1, { slots: 2, order: "slot" }),
                2: tr(2, 0, 4, 2),
            },
            assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)],
        };
        const r = createCachedResolver(host);
        query(r, host);
        near(r.positionAt(1, 8), 6, 2); // founders M1, M2: M1 -> p0
        const e = new Editor(host);
        e.insertRow({
            marcher: 2,
            transition: 2,
            slot: 0,
            start: 0,
            end: 4,
            layer: 1,
        });
        r.notify(e.batch());
        near(r.positionAt(1, 8), 6, 8); // M1 is the sole founder -> p1
        expect(r.ftlEntry(1).members).toEqual([1]);
        expectAgrees(r, host);
    });
});

// ---------------------------------------------------------------------------
// QA-INV-02 to -07 (spec 12.6)
// ---------------------------------------------------------------------------

describe("QA-INV (spec 12.6): what a batch dirties and recomputes", () => {
    it("QA-INV-02: editing B's shape in A → B → C → D dirties C and D, not what precedes B", () => {
        const host: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [0, 1] },
            ],
            shapes: {},
            transitions: {},
            assignments: [],
        };
        for (let i = 1; i <= 4; i++) {
            host.shapes[i] = line([4 * i, 0], [4 * i, 4]);
            host.transitions[i] = tr(i, 4 * (i - 1), 4 * i, i, { slots: 2 });
            host.assignments.push(
                row(1, i, 0, 4 * (i - 1), 4 * i),
                row(2, i, 1, 4 * (i - 1), 4 * i),
            );
        }
        const r = warmed(host);
        const e = new Editor(host);
        e.updateShape(2, line([5, 5], [9, 9])); // B = transition 2, [4, 8)
        const { report, counters } = notifyMeasured(r, e);
        expect(report.marchersRebuilt).toEqual([]);
        expect(report.localRecomputed).toEqual({
            destinations: [2],
            ftlGeometry: [],
        });
        // per marcher: the origins of C, D and the trailing hold
        expect(report.originsDirtied).toBe(2 * 3);
        expect(report.ftlEntriesDirtied).toBe(0);
        expect(counters.dirtyVisits).toBe(6);

        // Origins of spans starting before B.start (and B's own) are still
        // cached: querying them computes nothing.
        r.resetCounters();
        for (const m of [1, 2])
            for (const b of [-1, 0, 2, 4, 6, 7.9]) r.positionAt(m, b);
        expect(r.counters().originsComputed).toBe(0);
        expect(r.counters().cacheMisses).toBe(0);
        // C's origin was dirtied
        r.positionAt(1, 9);
        expect(r.counters().originsComputed).toBe(1);
        r.resetCounters();
        r.warmAll();
        expect(r.counters().originsComputed).toBe(5); // the other 5 dirtied origins
        expectAgrees(r, host);
    });

    it("QA-INV-03: G6 → G7 recomputes ftlEntry(T2) once and neither of T2's local caches", () => {
        const host = g6Flat();
        const r = warmed(host);
        const before = r.testOnly.localCaches(2);
        expect(before.destinations).toBeDefined();
        expect(before.ftlGeometry).toBeDefined();
        const e = new Editor(host);
        e.updateShape(1, line([0, -4], [6, -4])); // the upstream shape moves: G7
        const { report, counters } = notifyMeasured(r, e);
        expect(report.localRecomputed).toEqual({
            destinations: [1],
            ftlGeometry: [],
        });
        expect(counters.destinationsComputed).toBe(1);
        expect(counters.ftlGeometryComputed).toBe(0);
        const after = r.testOnly.localCaches(2);
        expect(after.destinations).toBe(before.destinations);
        expect(after.ftlGeometry).toBe(before.ftlGeometry);
        expect(report.ftlEntriesDirtied).toBe(1);

        r.resetCounters();
        const out = new Float64Array(8);
        for (let b = -1; b <= 14; b += 0.25) r.positionsAt(b, out);
        r.warmAll();
        expect(r.counters().ftlEntriesComputed).toBe(1);
        expectPositions(r, golden("G7").expected);
        expectAgrees(r, host);
    });

    it("QA-INV-04: deleting M1's T2 row in G6 leaves 3 members re-targeted to p1…p3", () => {
        const host = g6Flat();
        const r = warmed(host);
        const e = new Editor(host);
        e.deleteRow(e.findRow(1, 2).id);
        const report = r.notify(e.batch());
        expect(report.marchersRebuilt).toEqual([1]);
        const entry = r.ftlEntry(2);
        expect(entry.members).toEqual([2, 3, 4]);
        const target = new Map(entry.targets);
        near(target.get(2)!, 6, 4);
        near(target.get(3)!, 6, 6);
        near(target.get(4)!, 6, 8);
        near(r.positionAt(2, 12), 6, 4);
        near(r.positionAt(3, 12), 6, 6);
        near(r.positionAt(4, 12), 6, 8);
        expectAgrees(r, host);
    });

    it("QA-INV-05: toggling T2's order_mode in G6 dirties only ftlEntry(T2) and what it reaches", () => {
        const host = g6Flat();
        const r = warmed(host);
        const e = new Editor(host);
        for (const order of ["slot", "inherit"] as const) {
            e.updateTransition(2, { order });
            const { report, counters } = notifyMeasured(r, e);
            expect(report.marchersRebuilt).toEqual([]);
            // order_mode has no local recompute (spec 9.4 table)
            expect(report.localRecomputed).toEqual({
                destinations: [],
                ftlGeometry: [],
            });
            expect(report.ftlEntriesDirtied).toBe(1);
            // W-2: only the trailing holds that follow T2's spans
            expect(report.originsDirtied).toBe(4);
            expect(counters.dirtyVisits).toBe(5);
            r.resetCounters();
            r.warmAll();
            expect(r.counters().originsComputed).toBe(4);
            expect(r.counters().ftlEntriesComputed).toBe(1);
            expect(r.ftlEntry(2).orderSource.kind).toBe(order);
            expectAgrees(r, host);
        }
    });

    it("QA-INV-06: edits on G3 (a transition cycle) terminate and agree", () => {
        const edits: Array<(e: Editor) => void> = [
            (e) => e.updateShape(2, P(5, 9)),
            (e) => e.updateRow(e.findRow(1, 2).id, { start: 5 }),
            (e) => e.updateRow(e.findRow(1, 3).id, { layer: 3 }),
            (e) => e.deleteRow(e.findRow(1, 3).id),
            (e) => e.moveMarcher(1, [3, -3]),
            (e) =>
                e.updateTransition(1, { style: "arc", params: { bulge: 0.4 } }),
        ];
        // each edit alone, from a warm G3
        for (const edit of edits) {
            const host = golden("G3").db();
            const r = warmed(host);
            const e = new Editor(host);
            edit(e);
            const { report, counters } = notifyMeasured(r, e);
            expect(counters.dirtyVisits).toBe(
                report.originsDirtied + report.ftlEntriesDirtied,
            );
            expectAgrees(r, host);
        }
        // and all of them in sequence on one resolver
        const host = golden("G3").db();
        const r = warmed(host);
        const e = new Editor(host);
        for (const edit of edits) {
            edit(e);
            r.notify(e.batch());
            expectAgrees(r, host);
        }
    });

    it("QA-INV-07: a home change dirties only that marcher's origins and the FTL entries they reach", () => {
        const host = g6Flat();
        const r = warmed(host);
        const e = new Editor(host);
        e.moveMarcher(3, [-7, 4]);
        const { report, counters } = notifyMeasured(r, e);
        expect(report.marchersRebuilt).toEqual([3]);
        expect(report.localRecomputed).toEqual({
            destinations: [],
            ftlGeometry: [],
        });
        // M3's 4 origins; M3 founds T2, so ftlEntry(T2) and, by W-2, the
        // trailing holds of M1, M2 and M4
        expect(report.ftlEntriesDirtied).toBe(1);
        expect(report.originsDirtied).toBe(4 + 3);
        expect(counters.dirtyVisits).toBe(8);
        // the other marchers' origins up to T2 are still cached
        r.resetCounters();
        for (const m of [1, 2, 4])
            for (const b of [-1, 0, 2, 3.9]) r.positionAt(m, b);
        expect(r.counters().originsComputed).toBe(0);
        r.warmAll();
        expect(r.counters().originsComputed).toBe(7);
        expect(r.counters().ftlEntriesComputed).toBe(1);
        expectAgrees(r, host);
    });
});

// ---------------------------------------------------------------------------
// QA-CX-01 to -05 (spec 12.7): counters only
// ---------------------------------------------------------------------------

const CX_SHOWS: Array<[string, () => TimelineSnapshot]> = [
    ...GOLDEN.map((g): [string, () => TimelineSnapshot] => [g.name, g.db]),
    ["richShow", richShow],
    ["ladder(20)", () => ladder(20)],
];

describe("QA-CX (spec 12.7): complexity on counters", () => {
    for (const [name, show] of CX_SHOWS)
        it(`QA-CX-01 and -02: ${name}`, () => {
            const host = show();
            const r = createCachedResolver(host);
            r.resetCounters();
            r.warmAll();
            const c = r.counters();
            // CX-01: every origin and FTL entry computed exactly once. warmAll
            // also compiles the entry of an FTL that no span uses (P2.4).
            const f = ftlTransitions(r, host);
            expect(c.originsComputed).toBe(spanCount(r));
            expect(c.ftlEntriesComputed).toBe(f.withSpans + f.withoutSpans);
            r.warmAll();
            expect(r.counters().originsComputed).toBe(c.originsComputed);
            expect(r.counters().ftlEntriesComputed).toBe(c.ftlEntriesComputed);

            // CX-02: a second warm positionsAt computes nothing and does one
            // span lookup per marcher
            const M = r.marcherIds().length;
            const out = new Float64Array(2 * M);
            for (const b of beatsOf(host).filter((_, i) => i % 7 === 0)) {
                r.positionsAt(b, out);
                r.resetCounters();
                r.positionsAt(b, out);
                const w = r.counters();
                expect(w.originsComputed).toBe(0);
                expect(w.ftlEntriesComputed).toBe(0);
                expect(w.cacheMisses).toBe(0);
                expect(w.spanLookups).toBe(M);
            }
        });

    // CX-03 on every notify() case, from a warm cache and from a partly warm one
    for (const c of NOTIFY_CASES)
        it(`QA-CX-03: ${c.name}`, () => {
            for (const warm of [true, false]) {
                const host = richShow();
                const r = createCachedResolver(host);
                if (warm) r.warmAll();
                else for (const m of r.marcherIds()) r.positionAt(m, 10);
                const cachedBefore = r.testOnly.cachedNodeCount();
                const e = new Editor(host);
                c.edit(e);
                const { report, counters } = notifyMeasured(r, e);
                expect(counters.dirtyVisits).toBe(
                    report.originsDirtied + report.ftlEntriesDirtied,
                );
                // Every visit evicts one cached node and notify computes none,
                // so no node was visited twice.
                expect(cachedBefore - r.testOnly.cachedNodeCount()).toBe(
                    counters.dirtyVisits,
                );
                expect(
                    counters.originsComputed + counters.ftlEntriesComputed,
                ).toBe(0);
                expectClosed(r);
            }
        });

    it("QA-CX-04: doubling the chain doubles the cold-compile counters, not quadruples them", () => {
        const COUNTED: Array<keyof Counters> = [
            "originsComputed",
            "ftlEntriesComputed",
            "destinationsComputed",
            "ftlGeometryComputed",
            "cacheHits",
            "cacheMisses",
            "spanLookups",
        ];
        const cold = (host: TimelineSnapshot) => {
            // construction plus warmAll, then one cold query at the far end
            const r = createCachedResolver(host);
            r.warmAll();
            const w = r.counters();
            const q = createCachedResolver(host);
            q.resetCounters();
            let end = 0;
            for (const t of Object.values(host.transitions))
                end = Math.max(end, t.end);
            for (const m of q.marcherIds()) q.positionAt(m, end + 1);
            return { warm: w, query: q.counters(), spans: spanCount(r), r };
        };
        type Cold = ReturnType<typeof cold>;
        for (const [name, show] of [
            ["richShow", richShow],
            ["ladder(10)", () => ladder(10)],
        ] as const) {
            const [x1, x2, x3, x4] = [1, 2, 3, 4].map((n) =>
                cold(repeated(show, n)),
            ) as [Cold, Cold, Cold, Cold];
            const f1 = ftlTransitions(x1.r, repeated(show, 1)).withSpans;
            expect(x2.warm.originsComputed, name).toBe(x2.spans);
            expect(x2.warm.ftlEntriesComputed, name).toBe(2 * f1);
            expect(x4.warm.ftlEntriesComputed, name).toBe(4 * f1);
            for (const k of COUNTED)
                for (const phase of ["warm", "query"] as const) {
                    const [c1, c2, c3, c4] = [x1, x2, x3, x4].map(
                        (x) => x[phase][k],
                    ) as [number, number, number, number];
                    const what = `${name} ${phase} ${k}: ${c1}, ${c2}, ${c3}, ${c4}`;
                    // Linear in the chain length: every further copy adds
                    // the same work. (The first copy can differ by a
                    // constant, since the original starts from home.)
                    expect(c4 - c3, what).toBe(c3 - c2);
                    // so doubling about doubles, and never quadruples
                    expect(c2, what).toBeLessThanOrEqual(Math.ceil(2.1 * c1));
                }
            // and it did grow: the copy really was compiled
            expect(x2.warm.originsComputed).toBeGreaterThan(
                x1.warm.originsComputed,
            );
        }
    });

    it("the ladder fixture resolves as the oracle does", () => {
        const host = ladder(6);
        const r = createCachedResolver(host);
        const o = createOracle(clone(host));
        for (const b of beatsOf(host))
            for (const m of [1, 2]) {
                const p = r.positionAt(m, b);
                const q = o.positionAt(m, b);
                expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeLessThan(1e-9);
            }
    });

    it("QA-CX-05: a 20-FTL ladder edit visits at most the node count (60 of 64)", () => {
        const K = 20;
        const host = ladder(K);
        const r = warmed(host);
        const nodes = spanCount(r) + K;
        expect(nodes).toBe(64);
        expect(r.testOnly.cachedNodeCount()).toBe(nodes);
        const e = new Editor(host);
        e.updateShape(1, line([3, 5], [4, 6])); // the first FTL's destination
        const { report, counters } = notifyMeasured(r, e);
        expect(counters.dirtyVisits).toBe(
            report.originsDirtied + report.ftlEntriesDirtied,
        );
        expect(counters.dirtyVisits).toBeLessThanOrEqual(nodes);
        // everything from T2's origins on: 2 × (19 FTL spans + trailing hold)
        // origins and all 20 entries; the leading holds and T1's origins stay
        expect(report.originsDirtied).toBe(40);
        expect(report.ftlEntriesDirtied).toBe(20);
        expect(counters.dirtyVisits).toBe(60);
        r.resetCounters();
        r.warmAll();
        expect(r.counters().originsComputed).toBe(40);
        expect(r.counters().ftlEntriesComputed).toBe(20);
        expectClosed(r);
    });
});

// ---------------------------------------------------------------------------
// P-8 and P-10 (spec 12.5)
// ---------------------------------------------------------------------------

/** A value snapshot of a DestPath (it holds a function, so sample it). */
const pathSample = (p: DestPath | undefined) =>
    p && {
        closed: p.closed,
        L: p.L,
        at: [0, 0.25, 0.5, 0.75, 1].map((f) => p.at(f * p.L)),
    };

describe("P-8 (spec 12.5): a shape edit leaves other transitions' local caches bit-identical", () => {
    const shows: Array<[string, () => TimelineSnapshot]> = [
        ["richShow", richShow],
        ["G6", g6Flat],
        ["ladder(4)", () => ladder(4)],
    ];
    for (const [name, show] of shows)
        it(name, () => {
            for (const sid of Object.keys(show().shapes).map(Number)) {
                const host = show();
                const r = warmed(host);
                const transitionIds = Object.keys(host.transitions).map(Number);
                const before = new Map(
                    transitionIds.map((t) => {
                        const c = r.testOnly.localCaches(t);
                        return [
                            t,
                            {
                                ...c,
                                values: clone(c.destinations),
                                path: pathSample(c.ftlGeometry),
                            },
                        ];
                    }),
                );
                const users = transitionIds
                    .filter((t) => host.transitions[t]!.dest === sid)
                    .sort((a, b) => a - b);
                const e = new Editor(host);
                e.updateShape(sid, translated(host.shapes[sid]!, 1.5, -2.25));
                const report = r.notify(e.batch());
                expect(
                    [...report.localRecomputed.destinations].sort(
                        (a, b) => a - b,
                    ),
                    `shape ${sid}`,
                ).toEqual(users);
                for (const t of transitionIds) {
                    const now = r.testOnly.localCaches(t);
                    const was = before.get(t)!;
                    if (users.includes(t)) {
                        expect(now.destinations).not.toBe(was.destinations);
                        continue;
                    }
                    // same objects, and the same values bit for bit
                    expect(
                        now.destinations,
                        `T${t} after editing shape ${sid}`,
                    ).toBe(was.destinations);
                    expect(now.ftlGeometry).toBe(was.ftlGeometry);
                    expect(now.destinations).toEqual(was.values);
                    expect(pathSample(now.ftlGeometry)).toEqual(was.path);
                }
                expectAgrees(r, host);
            }
        });

    it("an edit to a shape no transition uses recomputes nothing", () => {
        const host = richShow(); // shape 8 is unused
        const r = warmed(host);
        const e = new Editor(host);
        e.updateShape(8, translated(host.shapes[8]!, 3, 3));
        const { report, counters } = notifyMeasured(r, e);
        expect(report).toEqual(EMPTY_REPORT);
        expect(
            counters.destinationsComputed + counters.ftlGeometryComputed,
        ).toBe(0);
    });
});

describe("P-10 (spec 12.5): timeline name and range edits never change a position", () => {
    /**
     * Timelines are not a resolver input: `TimelineSnapshot` has no timelines,
     * and the change log has no timelines trigger (spec 10.2; the storage
     * suite checks this in `timelineTriggers.test.ts`). So renaming a timeline
     * or changing its range within I-T1 commits an empty batch.
     */
    it("a timeline rename or range change reaches the resolver as an empty batch", () => {
        const base = richShow();
        const host = Object.assign(base, {
            timelines: {
                1: {
                    name: "Opener",
                    start: 0,
                    end: 16,
                    transitions: [1, 2, 5, 6],
                },
                2: { name: "Ballad", start: 16, end: 32, transitions: [7, 8] },
            },
        });
        const r = warmed(host);
        const probes = beatsOf(host);
        const before = probes.map((b) =>
            r.marcherIds().map((m) => r.positionAt(m, b)),
        );
        // rename, then widen and narrow ranges that still contain every transition
        host.timelines[1].name = "Opener (revised)";
        host.timelines[1].start = -8;
        host.timelines[2].end = 40;
        host.timelines[2].start = 15;
        r.resetCounters();
        const report = r.notify({ changes: [] });
        expect(report).toEqual(EMPTY_REPORT);
        const after = probes.map((b) =>
            r.marcherIds().map((m) => r.positionAt(m, b)),
        );
        expect(after).toEqual(before);
        const c = r.counters();
        expect(c.dirtyVisits + c.originsComputed + c.ftlEntriesComputed).toBe(
            0,
        );
        expect(c.destinationsComputed + c.ftlGeometryComputed).toBe(0);
    });

    it("moving a transition to another timeline logs identical images and changes no position", () => {
        // log_transitions_upd fires on any column, but its image has no
        // timeline_id, so a move between timelines logs before = after.
        const host = richShow();
        const r = warmed(host);
        const probes = beatsOf(host);
        const before = probes.map((b) =>
            r.marcherIds().map((m) => r.positionAt(m, b)),
        );
        const t = host.transitions[7]!;
        const report = r.notify({
            changes: [
                {
                    table: "transitions",
                    rowId: 7,
                    before: tImg(t),
                    after: tImg(t),
                },
            ],
        });
        expect(report.marchersRebuilt).toEqual([]);
        expect(report.localRecomputed).toEqual({
            destinations: [],
            ftlGeometry: [],
        });
        const after = probes.map((b) =>
            r.marcherIds().map((m) => r.positionAt(m, b)),
        );
        expect(after).toEqual(before);
        expectAgrees(r, host);
    });
});

// ---------------------------------------------------------------------------
// PR #6 review follow-ups
// ---------------------------------------------------------------------------

describe("pull-compile guard (spec 9.3)", () => {
    it("a cache miss during a compute throws an internal error instead of recursing", () => {
        const host = g6Flat();
        const r = createCachedResolver(host);
        // Fake a dependency list that no longer names what the compute reads:
        // the trailing hold's origin reads ftlEntry(2) but won't list it.
        r.testOnly.hideDependencies((k) => k === "ftlEntry 2");
        expect(() => r.positionAt(1, 13)).toThrow(
            /internal error: cache miss on ftlEntry 2 while computing origin 1\|12/,
        );
        // the failed compile left nothing half-built
        expectClosed(r);
        r.testOnly.hideDependencies((k) => k === "origin 3|4");
        expect(() => r.ftlEntry(2)).toThrow(
            /internal error: cache miss on origin 3\|4 while computing ftlEntry 2/,
        );
        expectClosed(r);
        r.testOnly.hideDependencies(null);
        expectAgrees(r, host);
    });

    it("the dependency cycle check still fires on inconsistent state", () => {
        const db = golden("G12").db();
        const r = createCachedResolver(db);
        db.transitions[2] = { ...db.transitions[2]!, start: 8 };
        expect(() => r.ftlEntry(2)).toThrow(/dependency cycle/);
    });
});

describe("checkCacheClosure (I-C1) detects violations", () => {
    it("a stale origin key", () => {
        const host = g6Flat();
        const r = warmed(host);
        r.testOnly.putOrigin(1, 99, [0, 0]);
        expect(r.checkCacheClosure()).toBe(false);
        expect(r.cacheClosureViolation()).toMatch(/stale origin key 1\|99/);
    });

    it("a stale origin key left at a span start that no longer exists", () => {
        const host = g6Flat();
        const r = warmed(host);
        const e = new Editor(host);
        e.deleteRow(e.findRow(1, 2).id); // M1's trailing hold now starts at 4, not 12
        r.notify(e.batch());
        expectClosed(r);
        r.testOnly.putOrigin(1, 12, [1, 1]);
        expect(r.cacheClosureViolation()).toMatch(/stale origin key 1\|12/);
    });

    it("an FTL entry cached without one of its founders' origins", () => {
        const host = g6Flat();
        const r = createCachedResolver(host);
        r.ftlEntry(2); // compiles the entry and its founders' chains only
        expectClosed(r);
        expect(r.testOnly.dropOrigin(1, 4)).toBe(true);
        expect(r.checkCacheClosure()).toBe(false);
        expect(r.cacheClosureViolation()).toMatch(
            /ftlEntry 2 cached but origin 1\|4 not/,
        );
    });

    it("an origin cached without the origin before it", () => {
        const host = g6Flat();
        const r = createCachedResolver(host);
        r.positionAt(1, 2); // M1's T1 span: origins 1|-Infinity and 1|0
        expectClosed(r);
        expect(r.testOnly.dropOrigin(1, -Infinity)).toBe(true);
        expect(r.cacheClosureViolation()).toMatch(
            /origin 1\|0 cached but origin 1\|-Infinity not/,
        );
    });
});

describe("notify() edge cases", () => {
    it("a slot_destinations change whose rowId differs from its image's transition recomputes both", () => {
        // log_slot_destinations_upd logs under NEW.transition_id, with the
        // before image naming the old transition. Only that one change is
        // sent, so only the before image names T6.
        const host = richShow();
        host.transitions[9] = tr(9, 30, 32, null, { points: [[9, 9]] });
        host.assignments.push(row(5, 9, 0, 30, 32));
        const r = warmed(host);
        const moved = host.transitions[6]!.points![2]!;
        const replaced = host.transitions[9]!.points![0]!;
        host.transitions[6] = {
            ...host.transitions[6]!,
            points: host.transitions[6]!.points!.map((p, i) =>
                i === 2 ? replaced : p,
            ),
        };
        host.transitions[9] = { ...host.transitions[9]!, points: [moved] };
        const report = r.notify({
            changes: [
                {
                    table: "slot_destinations",
                    rowId: 9,
                    before: {
                        transition: 6,
                        slot: 2,
                        x: moved[0],
                        y: moved[1],
                    },
                    after: { transition: 9, slot: 0, x: moved[0], y: moved[1] },
                },
            ],
        });
        expect([...report.localRecomputed.destinations].sort()).toEqual([6, 9]);
        expectAgrees(r, host);
    });

    /** Two marchers join an FTL late (DG-4 shape), plus an FTL that no row uses. */
    const noFounders = (): TimelineSnapshot => ({
        marchers: [
            { id: 1, home: [0, 0] },
            { id: 2, home: [0, 2] },
        ],
        shapes: { 1: line([4, 0], [4, 6]), 2: line([8, 0], [8, 6]) },
        transitions: {
            1: ftl(1, 0, 8, 1, { slots: 2, order: "slot" }),
            2: ftl(2, 8, 12, 2, { slots: 2 }),
        },
        assignments: [row(1, 1, 0, 4, 8), row(2, 1, 1, 4, 8)],
    });

    it("warmAll compiles an FTL with no founding spans, and one with no spans at all", () => {
        const host = noFounders();
        const r = createCachedResolver(host);
        r.resetCounters();
        r.warmAll();
        expect(r.counters().ftlEntriesComputed).toBe(2);
        expect(r.ftlEntry(1).members).toEqual([]);
        expect(r.ftlEntry(2).members).toEqual([]);
        expect(r.ftlEntry(2).targets).toEqual([]);
        expect(
            r
                .diagnostics()
                .filter((d) => d.code === "D-FTL-EMPTY")
                .map((d) => d.transitionId),
        ).toEqual([1, 2]);
        expectAgrees(r, host);
    });

    it("notify on FTLs with no founding spans", () => {
        const host = noFounders();
        const r = warmed(host);
        const e = new Editor(host);
        const steps: Array<(e: Editor) => void> = [
            (e) => e.updateShape(1, line([5, 1], [5, 9])),
            (e) => e.updateShape(2, line([9, 1], [9, 9])),
            (e) => e.updateTransition(2, { params: { waypoints: [[6, 6]] } }),
            (e) => e.updateRow(e.findRow(2, 1).id, { start: 6 }),
            // a founder appears in T1, then a joiner in the unused T2
            (e) => e.updateRow(e.findRow(1, 1).id, { start: 0 }),
            (e) =>
                e.insertRow({
                    marcher: 2,
                    transition: 2,
                    slot: 0,
                    start: 10,
                    end: 12,
                    layer: 0,
                }),
            // and T1 loses its founder again
            (e) => e.updateRow(e.findRow(1, 1).id, { start: 4 }),
        ];
        for (const step of steps) {
            step(e);
            r.notify(e.batch());
            expectAgrees(r, host);
        }
        expect(r.ftlEntry(1).members).toEqual([]);
    });

    it("a row deleted and reinserted under the same id in one batch", () => {
        for (const change of [{ start: 6 }, {}, { layer: 1 }]) {
            const host = richShow();
            const r = warmed(host);
            const e = new Editor(host);
            const old = { ...e.findRow(1, 2) };
            e.deleteRow(old.id);
            e.insertRowWithId({ ...old, ...change });
            const report = r.notify(e.batch());
            // coalesced to one update: the first before, the last after
            expect(report.marchersRebuilt).toEqual([1]);
            expectAgrees(r, host);
        }
    });

    it("a marcher inserted and deleted in one batch leaves no trace", () => {
        const host = richShow();
        const r = warmed(host);
        const ids = [...r.marcherIds()];
        const e = new Editor(host);
        e.insertMarcher(9, [1, 1]);
        e.insertRow({
            marcher: 9,
            transition: 8,
            slot: 5,
            start: 26,
            end: 30,
            layer: 0,
        });
        e.deleteMarcher(9);
        r.resetCounters();
        const report = r.notify(e.batch());
        expect(report).toEqual(EMPTY_REPORT);
        expect(r.counters().dirtyVisits).toBe(0);
        expect(r.marcherIds()).toEqual(ids);
        expectAgrees(r, host);
    });

    it("a marcher deleted and reinserted under the same id in one batch", () => {
        const host = richShow();
        const r = warmed(host);
        const e = new Editor(host);
        e.deleteMarcher(5); // its rows cascade
        e.insertMarcher(5, [7, 7]);
        const report = r.notify(e.batch());
        expect(report.marchersRebuilt).toEqual([5]);
        expect(r.spanInfos(5).map((s) => s.kind)).toEqual(["hold"]);
        expectAgrees(r, host);
    });

    it("a home moved and moved back in one batch evicts nothing", () => {
        const host = richShow();
        const r = warmed(host);
        const e = new Editor(host);
        e.moveMarcher(3, [-7, 4]);
        e.moveMarcher(3, [6, -1]); // richShow's home for M3
        r.resetCounters();
        const report = r.notify(e.batch());
        expect(report).toEqual(EMPTY_REPORT);
        expect(r.counters().dirtyVisits).toBe(0);
        expectAgrees(r, host);
    });

    it("a range change turns founding spans into joins", () => {
        const cases: Array<[string, (e: Editor) => void, number]> = [
            // T7's start moves before its rows: all five become joiners, and
            // T8 (which inherits from T7) falls back to slot order
            ["FTL T7", (e) => e.updateTransition(7, { start: 15 }), 7],
            // T5's start moves before M4's steal row
            ["direct T5", (e) => e.updateTransition(5, { start: 5 }), 5],
            // T2 starts earlier than its founders' rows
            ["FTL T2", (e) => e.updateTransition(2, { start: 3 }), 2],
        ];
        for (const [name, edit, tid] of cases) {
            const host = richShow();
            const r = warmed(host);
            const e = new Editor(host);
            edit(e);
            const report = r.notify(e.batch());
            expect(report.marchersRebuilt.length, name).toBeGreaterThan(0);
            const kinds = r
                .marcherIds()
                .flatMap((m) => r.spanInfos(m))
                .filter((s) => s.transitionId === tid);
            expect(
                kinds.filter((s) => s.kind === "founding"),
                name,
            ).toEqual([]);
            expect(
                kinds.some((s) => s.kind === "join"),
                name,
            ).toBe(true);
            if (host.transitions[tid]!.style === FTL)
                expect(r.ftlEntry(tid).members, name).toEqual([]);
            expectAgrees(r, host);
        }
        const host = richShow();
        const r = warmed(host);
        const e = new Editor(host);
        e.updateTransition(7, { start: 15 });
        r.notify(e.batch());
        expect(r.ftlEntry(8).orderSource).toEqual({
            kind: "slot",
            fallback: true,
        });
    });

    it("the spec 9.4 table: which transition fields recompute local caches", () => {
        const cases: Array<[string, (e: Editor) => void, number[], number[]]> =
            [
                [
                    "order_mode",
                    (e) => e.updateTransition(7, { order: "slot" }),
                    [],
                    [],
                ],
                [
                    "range",
                    (e) => e.updateTransition(5, { start: 5.5, end: 8.5 }),
                    [],
                    [],
                ],
                [
                    "path_params (FTL)",
                    (e) => e.updateTransition(7, { params: { waypoints: [] } }),
                    [7],
                    [7],
                ],
                // path_style and path_params recompute destinations as well as
                // ftlGeometry: more than the 9.4 table requires, deliberately (see
                // localInputsChanged in resolver.ts).
                [
                    "path_params (arc)",
                    (e) => e.updateTransition(6, { params: { bulge: 0.1 } }),
                    [6],
                    [],
                ],
                [
                    "path_style",
                    (e) =>
                        e.updateTransition(7, {
                            style: "direct",
                            params: null,
                        }),
                    [7],
                    [],
                ],
                [
                    "slot_count",
                    (e) => e.updateTransition(2, { slots: 6 }),
                    [2],
                    [2],
                ],
                [
                    "dest_shape_id",
                    (e) => e.updateTransition(7, { dest: 8 }),
                    [7],
                    [7],
                ],
            ];
        for (const [name, edit, destIds, geometryIds] of cases) {
            const host = richShow();
            const r = warmed(host);
            const e = new Editor(host);
            edit(e);
            const report = r.notify(e.batch());
            expect(report.localRecomputed, name).toEqual({
                destinations: destIds,
                ftlGeometry: geometryIds,
            });
            expectAgrees(r, host);
        }
    });

    it("a range-only update and a destination change on one transition in one batch recompute its destinations", () => {
        const host = richShow();
        const r = createCachedResolver(host);
        r.warmAll();
        const e = new Editor(host);
        e.updateTransition(6, { start: 11 });
        e.updateTransition(6, {
            points: (host.transitions[6].points ?? []).map(
                ([x, y]) => [x + 1, y] as XY,
            ),
        });
        const report = r.notify(e.batch());
        expect(report.localRecomputed.destinations).toContain(6);
        expectAgrees(r, host);
    });
});
