/**
 * Differential fuzz harness (QA-INV-08), ported from `docs/timeline/ref/fuzz.mjs`.
 *
 * A seed builds a random show and then random batches of 1 to 3 edits. Every
 * edit is applied to the host snapshot the way a committed transaction would
 * be, and its change-log images (spec 5.1 triggers, 10.2) are collected into a
 * `ChangeBatch`. After each batch the incremental resolver must
 *
 * - keep its caches closed (P-4, I-C1),
 * - agree bit for bit with a freshly built resolver on the same state (P-3), and
 * - agree with the uncached oracle to `EPS` (P-3).
 *
 * The show generator and the edit kinds follow the reference, plus marcher
 * insert and delete. No v0.1 rules.
 */
import { createOracle } from "../oracle";
import { createCachedResolver } from "../resolver";
import type {
    AssignmentRow,
    ChangeBatch,
    PathParams,
    RowImage,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { mulberry32, type Rand } from "./showGenerators";

/** Tolerance against the oracle (the reference fuzzer's). */
export const EPS = 1e-6;
const SHOW = 32;
const SHAPE_IDS = 6;

type Change = ChangeBatch["changes"][number];
const clone = <T>(x: T): T => structuredClone(x);

const aImg = (r: AssignmentRow): RowImage => ({ ...r });
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
const sImg = (id: number, s: ShapeRow): RowImage => ({ id, ...clone(s) });
const ptsOf = (t: TransitionRow): XY[] =>
    t.dest == null ? (t.points ?? []) : [];

/** slot_destinations images under the transition id (spec 10.2). */
function pointChanges(tid: number, before: XY[], after: XY[]): Change[] {
    const out: Change[] = [];
    const img = (slot: number, p: XY): RowImage => ({
        transition: tid,
        slot,
        x: p[0],
        y: p[1],
    });
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
        const b = before[i];
        const a = after[i];
        if (b && a && b[0] === a[0] && b[1] === a[1]) continue;
        out.push({
            table: "slot_destinations",
            rowId: tid,
            before: b ? img(i, b) : null,
            after: a ? img(i, a) : null,
        });
    }
    return out;
}

/** The changes of updating transition `t` from `before` (its prior copy). */
function transitionUpdate(before: TransitionRow, t: TransitionRow): Change[] {
    return [
        {
            table: "transitions",
            rowId: t.id,
            before: tImg(before),
            after: tImg(t),
        },
        ...pointChanges(t.id, ptsOf(before), ptsOf(t)),
    ];
}

export interface FuzzWorld {
    db: TimelineSnapshot;
    R: Rand;
    /** A random batch of 1 to 3 edits, applied to `db`, or null if none applied */
    randomBatch(): { batch: ChangeBatch; names: string[] } | null;
    opNames: string[];
}

// One long function keeps the order of PRNG draws close to fuzz.mjs.
// eslint-disable-next-line max-lines-per-function
export function makeFuzzWorld(seed: number): FuzzWorld {
    const R = mulberry32(seed);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)]!;
    const pt = (): XY => [ri(-10, 10), ri(-10, 10)];
    const db: TimelineSnapshot = {
        marchers: [],
        shapes: {},
        transitions: {},
        assignments: [],
    };
    let nextRow = 1;
    let nextT = 1;
    let nextMarcher = 1;

    const randShape = (): ShapeRow => {
        const k = pick(["line", "freehand", "circle", "box"] as const);
        if (k === "line") {
            const a = pt();
            let b = pt();
            if (b[0] === a[0] && b[1] === a[1]) b = [a[0] + 1, a[1]];
            return { kind: k, geometry: { points: [a, b] } };
        }
        if (k === "freehand") {
            const pts: XY[] = [pt()];
            const n = ri(1, 4);
            for (let i = 0; i < n; i++) {
                const last = pts[pts.length - 1]!;
                pts.push(R() < 0.15 ? [last[0], last[1]] : pt());
            }
            if (pts.every((p) => p[0] === pts[0]![0] && p[1] === pts[0]![1]))
                pts.push([pts[0]![0] + 1, pts[0]![1]]);
            return { kind: k, geometry: { points: pts } };
        }
        if (k === "circle")
            return {
                kind: k,
                geometry: {
                    center: pt(),
                    radius: ri(1, 6),
                    start_angle: R() * 6,
                    clockwise: R() < 0.5,
                },
            };
        return {
            kind: k,
            geometry: {
                origin: pt(),
                width: ri(1, 6),
                height: ri(1, 6),
            },
        };
    };
    for (let i = 1; i <= SHAPE_IDS; i++) db.shapes[i] = randShape();
    const nMarchers = ri(4, 7);
    for (let i = 0; i < nMarchers; i++)
        db.marchers.push({ id: nextMarcher++, home: pt() });

    const randParams = (style: TransitionRow["style"]): PathParams | null =>
        style === "arc"
            ? { bulge: +(R() - 0.5).toFixed(3) }
            : style === "follow_the_leader"
              ? { waypoints: Array.from({ length: ri(0, 2) }, pt) }
              : null;
    const newTransition = (): TransitionRow => {
        const s = ri(0, SHOW - 2);
        const e = ri(s + 1, Math.min(SHOW, s + 12));
        const style = pick([
            "direct",
            "direct",
            "arc",
            "follow_the_leader",
            "follow_the_leader",
        ] as const);
        const t: TransitionRow = {
            id: nextT++,
            start: s,
            end: e,
            dest: ri(1, SHAPE_IDS),
            slots: ri(1, 5),
            style,
            order: R() < 0.8 ? "inherit" : "slot",
            params: randParams(style),
        };
        if (style !== "follow_the_leader" && R() < 0.3) {
            t.dest = null;
            t.points = Array.from({ length: t.slots }, pt);
        }
        db.transitions[t.id] = t;
        return t;
    };
    const nInitial = ri(6, 10);
    for (let i = 0; i < nInitial; i++) newTransition();

    // Invariant checks mirroring spec 6 (the database would reject these).
    const overlaps = (a: AssignmentRow, b: AssignmentRow) =>
        a.start < b.end && b.start < a.end;
    const validRow = (
        r: AssignmentRow,
        ignoreId?: number,
        ts: Record<number, TransitionRow> = db.transitions,
        rows: AssignmentRow[] = db.assignments,
    ) => {
        const t = ts[r.transition];
        if (
            !t ||
            r.start < t.start ||
            r.end > t.end ||
            r.end <= r.start ||
            r.slot < 0 ||
            r.slot >= t.slots
        )
            return false;
        for (const o of rows) {
            if (o.id === ignoreId || o.id === r.id) continue;
            if (
                o.transition === r.transition &&
                (o.slot === r.slot || o.marcher === r.marcher)
            )
                return false; // I-A4, I-A5
            if (
                o.marcher === r.marcher &&
                o.layer === r.layer &&
                overlaps(o, r)
            )
                return false; // I-A3
        }
        return true;
    };
    const randRow = (): AssignmentRow | null => {
        const ts = Object.values(db.transitions);
        if (!ts.length || !db.marchers.length) return null;
        const t = pick(ts);
        const full = R() < 0.6;
        const s = full ? t.start : ri(t.start, t.end - 1);
        const e = full ? t.end : ri(s + 1, t.end);
        return {
            id: nextRow,
            marcher: pick(db.marchers).id,
            transition: t.id,
            slot: ri(0, t.slots - 1),
            start: s,
            end: e,
            layer: pick([0, 0, 0, 1, 2]),
        };
    };
    for (let i = 0; i < 60; i++) {
        const r = randRow();
        if (r && validRow(r)) {
            db.assignments.push(r);
            nextRow++;
        }
    }

    const insertedRow = (r: AssignmentRow): Change => ({
        table: "assignments",
        rowId: r.id,
        before: null,
        after: aImg(r),
    });
    const deletedRow = (r: AssignmentRow): Change => ({
        table: "assignments",
        rowId: r.id,
        before: aImg(r),
        after: null,
    });
    const shiftXY = (p: XY, d: XY): XY => [p[0] + d[0], p[1] + d[1]];

    // Edit operations: each mutates `db` and returns its change-log images,
    // or null if the edit would be rejected (and then has changed nothing).
    const ops: Record<string, () => Change[] | null> = {
        insertRow() {
            for (let i = 0; i < 20; i++) {
                const r = randRow();
                if (r && validRow(r)) {
                    nextRow++;
                    db.assignments.push(r);
                    return [insertedRow(r)];
                }
            }
            return null;
        },
        deleteRow() {
            if (!db.assignments.length) return null;
            const i = ri(0, db.assignments.length - 1);
            const [r] = db.assignments.splice(i, 1);
            return [deletedRow(r!)];
        },
        updateRow() {
            if (!db.assignments.length) return null;
            const r = pick(db.assignments);
            const t = db.transitions[r.transition]!;
            const n = { ...r };
            const f = pick(["layer", "range", "slot"]);
            if (f === "layer") n.layer = pick([0, 1, 2]);
            if (f === "range") {
                n.start = ri(t.start, t.end - 1);
                n.end = ri(n.start + 1, t.end);
            }
            if (f === "slot") n.slot = ri(0, t.slots - 1);
            if (!validRow(n, r.id)) return null;
            const before = { ...r };
            Object.assign(r, n);
            return [
                {
                    table: "assignments",
                    rowId: r.id,
                    before: aImg(before),
                    after: aImg(r),
                },
            ];
        },
        moveShape() {
            const id = ri(1, SHAPE_IDS);
            const s = db.shapes[id]!;
            const d: XY = [ri(-4, 4), ri(-4, 4)];
            const before = sImg(id, s);
            const g = clone(s.geometry) as unknown as Record<string, unknown>;
            if ("points" in g)
                g.points = (g.points as XY[]).map((p) => shiftXY(p, d));
            if ("center" in g) g.center = shiftXY(g.center as XY, d);
            if ("origin" in g) g.origin = shiftXY(g.origin as XY, d);
            s.geometry = g as unknown as typeof s.geometry;
            return [
                {
                    table: "shapes",
                    rowId: id,
                    before,
                    after: sImg(id, s),
                },
            ];
        },
        reshape() {
            const id = ri(1, SHAPE_IDS);
            const before = sImg(id, db.shapes[id]!);
            db.shapes[id] = randShape();
            return [
                {
                    table: "shapes",
                    rowId: id,
                    before,
                    after: sImg(id, db.shapes[id]!),
                },
            ];
        },
        style() {
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            const before = clone(t);
            t.style = pick(["direct", "arc", "follow_the_leader"] as const);
            t.params = randParams(t.style);
            if (t.style === "follow_the_leader" && t.dest == null) {
                t.dest = ri(1, SHAPE_IDS); // I-T5: FTL needs a shape
                delete t.points;
            }
            return transitionUpdate(before, t);
        },
        params() {
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            if (t.style === "direct") return null;
            const before = clone(t);
            t.params = randParams(t.style);
            return transitionUpdate(before, t);
        },
        order() {
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            const before = clone(t);
            t.order = t.order === "inherit" ? "slot" : "inherit";
            return transitionUpdate(before, t);
        },
        slots() {
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            const used = Math.max(
                -1,
                ...db.assignments
                    .filter((r) => r.transition === t.id)
                    .map((r) => r.slot),
            );
            const n = ri(used + 1, 6);
            if (n < 1 || n === t.slots) return null;
            const before = clone(t);
            t.slots = n;
            if (t.dest == null) {
                // place new slots in the same edit
                const pts = (t.points ?? []).slice(0, n);
                while (pts.length < n) pts.push(pt());
                t.points = pts;
            }
            return transitionUpdate(before, t);
        },
        dest() {
            // Switch between a shape and individual placement (both ways), or
            // re-point to another shape.
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            const before = clone(t);
            if (
                t.dest != null &&
                t.style !== "follow_the_leader" &&
                R() < 0.5
            ) {
                t.dest = null;
                t.points = Array.from({ length: t.slots }, pt);
            } else {
                t.dest = ri(1, SHAPE_IDS);
                delete t.points;
            }
            return transitionUpdate(before, t);
        },
        movePoint() {
            // One individually placed destination: a slot_destinations change.
            const ts = Object.values(db.transitions).filter(
                (t) => t.dest == null,
            );
            if (!ts.length) return null;
            const t = pick(ts);
            const before = (t.points ?? []).map((q): XY => [q[0], q[1]]);
            const pts = before.map((q): XY => [q[0], q[1]]);
            pts[ri(0, t.slots - 1)] = pt();
            t.points = pts;
            return pointChanges(t.id, before, pts);
        },
        range() {
            // R-E1 anchored rewrite; the whole edit is rejected if any
            // invariant fails, and then changes nothing.
            const ts = Object.values(db.transitions);
            if (!ts.length) return null;
            const t = pick(ts);
            const ns = ri(Math.max(0, t.start - 3), t.start + 3);
            const ne = ri(Math.max(ns + 1, t.end - 3), t.end + 3);
            if (ne > SHOW || ns >= ne || (ns === t.start && ne === t.end))
                return null;
            const moved: Array<{
                before: AssignmentRow;
                after: AssignmentRow;
            }> = [];
            const rows = db.assignments.map((r) => {
                if (r.transition !== t.id) return r;
                const n = { ...r };
                if (r.start === t.start) n.start = ns;
                if (r.end === t.end) n.end = ne;
                if (n.start !== r.start || n.end !== r.end)
                    moved.push({ before: r, after: n });
                return n;
            });
            const neu = { ...t, start: ns, end: ne };
            const ts2 = { ...db.transitions, [t.id]: neu };
            const ok = rows
                .filter((r) => r.transition === t.id)
                .every((r) => validRow(r, r.id, ts2, rows));
            if (!ok) return null;
            const before = clone(t);
            db.transitions[t.id] = neu;
            db.assignments = rows;
            return [
                ...transitionUpdate(before, neu),
                ...moved.map(
                    ({ before: b, after: a }): Change => ({
                        table: "assignments",
                        rowId: a.id,
                        before: aImg(b),
                        after: aImg(a),
                    }),
                ),
            ];
        },
        deleteTransition() {
            // FK cascade
            const ids = Object.keys(db.transitions);
            if (ids.length < 3) return null;
            const t = db.transitions[Number(pick(ids))]!;
            const gone = db.assignments.filter((r) => r.transition === t.id);
            db.assignments = db.assignments.filter(
                (r) => r.transition !== t.id,
            );
            delete db.transitions[t.id];
            return [
                ...gone.map(deletedRow),
                ...pointChanges(t.id, ptsOf(t), []),
                {
                    table: "transitions",
                    rowId: t.id,
                    before: tImg(t),
                    after: null,
                },
            ];
        },
        addTransition() {
            const t = newTransition();
            return [
                {
                    table: "transitions",
                    rowId: t.id,
                    before: null,
                    after: tImg(t),
                },
                ...pointChanges(t.id, [], ptsOf(t)),
            ];
        },
        home() {
            if (!db.marchers.length) return null;
            const m = pick(db.marchers);
            const before = { id: m.id, home: [m.home[0], m.home[1]] };
            m.home = pt();
            return [
                {
                    table: "marchers",
                    rowId: m.id,
                    before,
                    after: { id: m.id, home: [m.home[0], m.home[1]] },
                },
            ];
        },
        insertMarcher() {
            if (db.marchers.length >= 9) return null;
            const m = { id: nextMarcher++, home: pt() };
            db.marchers.push(m);
            return [
                {
                    table: "marchers",
                    rowId: m.id,
                    before: null,
                    after: { id: m.id, home: [m.home[0], m.home[1]] },
                },
            ];
        },
        deleteMarcher() {
            // FK cascade
            if (db.marchers.length <= 2) return null;
            const i = ri(0, db.marchers.length - 1);
            const m = db.marchers[i]!;
            const gone = db.assignments.filter((r) => r.marcher === m.id);
            db.assignments = db.assignments.filter((r) => r.marcher !== m.id);
            db.marchers.splice(i, 1);
            return [
                ...gone.map(deletedRow),
                {
                    table: "marchers",
                    rowId: m.id,
                    before: { id: m.id, home: [m.home[0], m.home[1]] },
                    after: null,
                },
            ];
        },
        steal() {
            // A higher-layer row that splits someone's existing span (the #2 pattern).
            if (!db.assignments.length) return null;
            const victim = pick(db.assignments);
            const t = pick(Object.values(db.transitions));
            const s = Math.max(t.start, victim.start);
            const e = Math.min(t.end, victim.end);
            if (e - s < 1) return null;
            const a = ri(s, e - 1);
            const b = ri(a + 1, e);
            const r: AssignmentRow = {
                id: nextRow,
                marcher: victim.marcher,
                transition: t.id,
                slot: ri(0, t.slots - 1),
                start: a,
                end: b,
                layer: victim.layer + 1,
            };
            if (!validRow(r)) return null;
            nextRow++;
            db.assignments.push(r);
            return [insertedRow(r)];
        },
    };
    const opNames = Object.keys(ops);

    function randomBatch() {
        const n = R() < 0.7 ? 1 : ri(2, 3);
        const changes: Change[] = [];
        const names: string[] = [];
        for (let i = 0; i < n; i++) {
            const name = pick(opNames);
            const c = ops[name]!();
            if (c && c.length) {
                changes.push(...c);
                names.push(name);
            }
        }
        return names.length ? { batch: { changes }, names } : null;
    }
    return { db, R, randomBatch, opNames };
}

export interface FuzzStats {
    seeds: number;
    batches: number;
    divergent: number;
    closure: number;
    exceptions: number;
    ops: Record<string, number>;
    firstFailures: Array<Record<string, unknown>>;
}

interface Divergence {
    marcher: number;
    beat: number;
    kind: "fresh" | "oracle" | "marchers";
    resolver?: readonly number[];
    other?: readonly number[];
}

function compare(
    res: ReturnType<typeof createCachedResolver>,
    db: TimelineSnapshot,
    R: Rand,
    fraction: number,
): Divergence | null {
    const fresh = createCachedResolver(clone(db));
    const oracle = createOracle(clone(db));
    const ids = db.marchers.map((m) => m.id).sort((a, b) => a - b);
    const got = [...res.marcherIds()];
    if (JSON.stringify(got) !== JSON.stringify(ids))
        return { marcher: -1, beat: 0, kind: "marchers", resolver: got };
    for (const m of ids)
        for (let b = -1; b <= SHOW + 2; b += 0.5) {
            if (R() > fraction) continue;
            const x = res.positionAt(m, b);
            const f = fresh.positionAt(m, b);
            if (!Object.is(x[0], f[0]) || !Object.is(x[1], f[1]))
                return {
                    marcher: m,
                    beat: b,
                    kind: "fresh",
                    resolver: x,
                    other: f,
                };
            const y = oracle.positionAt(m, b);
            if (!(Math.abs(x[0] - y[0]) < EPS && Math.abs(x[1] - y[1]) < EPS))
                return {
                    marcher: m,
                    beat: b,
                    kind: "oracle",
                    resolver: x,
                    other: y,
                };
        }
    return null;
}

/** Runs seeds `first` to `first + seeds - 1`, `steps` batches each. */
export function runFuzz(seeds: number, steps: number, first = 1): FuzzStats {
    const stats: FuzzStats = {
        seeds: 0,
        batches: 0,
        divergent: 0,
        closure: 0,
        exceptions: 0,
        ops: {},
        firstFailures: [],
    };
    for (let seed = first; seed < first + seeds; seed++) {
        const w = makeFuzzWorld(seed);
        const res = createCachedResolver(w.db);
        stats.seeds++;
        res.warmAll();
        for (let step = 0; step < steps; step++) {
            const rb = w.randomBatch();
            if (!rb) continue;
            stats.batches++;
            for (const n of rb.names) stats.ops[n] = (stats.ops[n] ?? 0) + 1;
            let closure: string | null = null;
            let bad: Divergence | { exception: string } | null = null;
            try {
                res.notify(rb.batch);
                closure = res.cacheClosureViolation();
                if (closure === null && !res.checkCacheClosure())
                    closure = "checkCacheClosure() returned false";
                // A third of the batches check everything; the rest sample,
                // so that part of the cache stays cold between batches.
                bad = compare(res, w.db, w.R, w.R() < 0.4 ? 0.25 : 1);
                if (closure === null) {
                    closure = res.cacheClosureViolation(); // after the queries
                }
            } catch (e) {
                bad = { exception: String((e as Error).message).slice(0, 120) };
                stats.exceptions++;
            }
            if (closure !== null || bad) {
                if (bad && !("exception" in bad)) stats.divergent++;
                if (closure !== null) stats.closure++;
                if (stats.firstFailures.length < 4)
                    stats.firstFailures.push({
                        seed,
                        step,
                        ops: rb.names,
                        closure,
                        divergence: bad,
                    });
                break; // one failure per seed; move on
            }
        }
    }
    return stats;
}
