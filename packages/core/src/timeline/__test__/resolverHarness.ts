/**
 * Shared helpers for the cached resolver's tests: agreement checks (a fresh
 * build and the oracle), a show that exercises every cache (`richShow`), an
 * `Editor` that applies edits to a host snapshot and records the change-log
 * batch the triggers would write (spec 5.1, 10.2), and the notify() cases.
 */
import { expect } from "vitest";
import { createOracle } from "../oracle";
import { createCachedResolver, type CachedResolver } from "../resolver";
import type {
    AssignmentRow,
    ChangeBatch,
    InvalidationReport,
    RowImage,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { P, row, tr } from "./fixtures";

export const clone = <T>(x: T): T => structuredClone(x);

/** Every beat the checks probe: quarter beats across the show, past both ends. */
export function beatsOf(db: TimelineSnapshot): number[] {
    let lo = 0;
    let hi = 0;
    for (const t of Object.values(db.transitions)) {
        lo = Math.min(lo, t.start);
        hi = Math.max(hi, t.end);
    }
    const out: number[] = [];
    for (let b = lo - 1; b <= hi + 1; b += 0.25) out.push(b);
    return out;
}

export function expectClosed(r: CachedResolver) {
    expect(r.cacheClosureViolation()).toBeNull();
    expect(r.checkCacheClosure()).toBe(true);
}

export const sortDiagnostics = (d: ReturnType<CachedResolver["diagnostics"]>) =>
    d.map((x) => JSON.stringify(x)).sort();

/**
 * The resolver agrees with a fresh cold build of the same post-commit state
 * (bit for bit) and with the oracle (to 1e-9), and stays closed throughout.
 */
export function expectAgrees(r: CachedResolver, host: TimelineSnapshot) {
    expectClosed(r);
    const fresh = createCachedResolver(clone(host));
    const oracle = createOracle(clone(host));
    const ids = host.marchers.map((m) => m.id).sort((a, b) => a - b);
    expect(r.marcherIds()).toEqual(ids);
    for (const m of ids)
        expect(r.spanInfos(m), `spans of M${m}`).toEqual(fresh.spanInfos(m));
    for (const b of beatsOf(host))
        for (const m of ids) {
            const p = r.positionAt(m, b);
            expect(p, `M${m}@${b} vs fresh`).toEqual(fresh.positionAt(m, b));
            const q = oracle.positionAt(m, b);
            expect(
                Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]),
                `M${m}@${b} vs oracle`,
            ).toBeLessThan(1e-9);
        }
    for (const t of Object.values(host.transitions))
        if (t.style === "follow_the_leader") {
            expect(r.ftlEntry(t.id), `ftlEntry ${t.id}`).toEqual(
                fresh.ftlEntry(t.id),
            );
            const o = oracle.ftlEntry(t.id);
            expect(r.ftlEntry(t.id).members).toEqual(o.members);
            expect(r.ftlEntry(t.id).orderSource).toEqual(o.orderSource);
        }
    expect(sortDiagnostics(r.diagnostics())).toEqual(
        sortDiagnostics(oracle.diagnostics()),
    );
    expectClosed(r);
    r.warmAll();
    expectClosed(r);
}

// ---------------------------------------------------------------------------
// notify()
// ---------------------------------------------------------------------------

/**
 * A show that exercises every cache: an order-free box, an FTL that inherits
 * from it (with a steal, a resume and a late joiner), an arc to individual
 * destinations, an FTL onto a circle that inherits the arc's slot order, and
 * an FTL onto a box that inherits from that FTL.
 */
// The show is data, kept in one place so its comments stay next to it.
// eslint-disable-next-line max-lines-per-function
export function richShow(): TimelineSnapshot {
    const ids = [1, 2, 3, 4, 5];
    const shapes: Record<number, ShapeRow> = {
        1: {
            kind: "line",
            geometry: {
                points: [
                    [0, 0],
                    [6, 0],
                ],
            },
        },
        2: {
            kind: "line",
            geometry: {
                points: [
                    [6, 2],
                    [6, 8],
                ],
            },
        },
        5: P(10, 10),
        6: {
            kind: "circle",
            geometry: {
                center: [0, 20],
                radius: 4,
                start_angle: 1,
                clockwise: false,
            },
        },
        7: { kind: "box", geometry: { origin: [-5, -5], width: 4, height: 3 } },
        8: {
            kind: "freehand",
            geometry: {
                points: [
                    [-8, 0],
                    [-8, 6],
                    [-2, 6],
                ],
            },
        },
    };
    const transitions: Record<number, TransitionRow> = {
        1: tr(1, 0, 4, 1, { slots: 4 }),
        2: tr(2, 4, 12, 2, {
            slots: 5,
            style: "follow_the_leader",
            params: { waypoints: [] },
        }),
        5: tr(5, 6, 8, 5),
        6: tr(6, 12, 16, null, {
            slots: 5,
            style: "arc",
            params: { bulge: 0.3 },
            points: [
                [-2, 12],
                [0, 13],
                [2, 12],
                [4, 13],
                [6, 12],
            ],
        }),
        7: tr(7, 16, 24, 6, {
            slots: 5,
            style: "follow_the_leader",
            params: { waypoints: [[0, 14]] },
        }),
        8: tr(8, 24, 30, 7, {
            slots: 6,
            style: "follow_the_leader",
            params: { waypoints: [] },
        }),
    };
    const assignments: AssignmentRow[] = [
        ...[1, 2, 3, 4].flatMap((m, i) => [
            row(m, 1, i, 0, 4),
            row(m, 2, 3 - i, 4, 12),
        ]),
        row(4, 5, 0, 6, 8, 1), // steal out of the FTL, then resume
        row(5, 2, 4, 8, 12), // late joiner
        ...ids.flatMap((m, i) => [row(m, 6, i, 12, 16), row(m, 7, i, 16, 24)]),
        ...[1, 2, 3, 4].map((m, i) => row(m, 8, i, 24, 30)),
    ];
    return {
        marchers: ids.map((id) => ({ id, home: [2 * id, -1] as XY })),
        shapes,
        transitions,
        assignments,
    };
}

export type Change = ChangeBatch["changes"][number];
export const aImg = (r: AssignmentRow): RowImage => ({ ...r });
export const tImg = (t: TransitionRow): RowImage => ({
    id: t.id,
    dest: t.dest,
    style: t.style,
    params: t.params ? clone(t.params) : null,
    order: t.order,
    slots: t.slots,
    start: t.start,
    end: t.end,
});

/**
 * Edits a host snapshot in place, the way a committed transaction would, and
 * records the change-log images (spec 5.1 triggers) for `batch()`.
 */
export class Editor {
    private changes: Change[] = [];
    private nextRow: number;
    constructor(readonly host: TimelineSnapshot) {
        this.nextRow = Math.max(0, ...host.assignments.map((r) => r.id)) + 1;
    }

    batch(): ChangeBatch {
        const b = { changes: this.changes };
        this.changes = [];
        return b;
    }
    private rowIndex(id: number) {
        const i = this.host.assignments.findIndex((r) => r.id === id);
        if (i < 0) throw new Error(`row ${id} not found`);
        return i;
    }
    findRow(marcher: number, transition: number): AssignmentRow {
        const r = this.host.assignments.find(
            (x) => x.marcher === marcher && x.transition === transition,
        );
        if (!r) throw new Error(`no row for M${marcher} in T${transition}`);
        return r;
    }
    insertRow(r: Omit<AssignmentRow, "id">): AssignmentRow {
        return this.insertRowWithId({ ...r, id: this.nextRow++ });
    }
    /** Inserts a row under a given id, such as one deleted earlier in the batch. */
    insertRowWithId(full: AssignmentRow): AssignmentRow {
        this.host.assignments.push(full);
        this.changes.push({
            table: "assignments",
            rowId: full.id,
            before: null,
            after: aImg(full),
        });
        return full;
    }
    updateRow(id: number, patch: Partial<Omit<AssignmentRow, "id">>) {
        const i = this.rowIndex(id);
        const old = this.host.assignments[i]!;
        const neu = { ...old, ...patch };
        this.host.assignments[i] = neu;
        this.changes.push({
            table: "assignments",
            rowId: id,
            before: aImg(old),
            after: aImg(neu),
        });
    }
    deleteRow(id: number) {
        const [old] = this.host.assignments.splice(this.rowIndex(id), 1);
        this.changes.push({
            table: "assignments",
            rowId: id,
            before: aImg(old!),
            after: null,
        });
    }
    insertTransition(t: TransitionRow) {
        this.host.transitions[t.id] = t;
        this.changes.push({
            table: "transitions",
            rowId: t.id,
            before: null,
            after: tImg(t),
        });
        this.logPoints(t.id, [], t.dest == null ? (t.points ?? []) : []);
    }
    updateTransition(id: number, patch: Partial<Omit<TransitionRow, "id">>) {
        const old = this.host.transitions[id]!;
        const neu = { ...old, ...patch };
        this.host.transitions[id] = neu;
        this.changes.push({
            table: "transitions",
            rowId: id,
            before: tImg(old),
            after: tImg(neu),
        });
        const pts = (t: TransitionRow) =>
            t.dest == null ? (t.points ?? []) : [];
        this.logPoints(id, pts(old), pts(neu));
    }
    /** Deletes a transition and, as the foreign keys cascade, its rows. */
    deleteTransition(id: number) {
        for (const r of this.host.assignments.filter(
            (x) => x.transition === id,
        ))
            this.deleteRow(r.id);
        const old = this.host.transitions[id]!;
        delete this.host.transitions[id];
        this.logPoints(id, old.dest == null ? (old.points ?? []) : [], []);
        this.changes.push({
            table: "transitions",
            rowId: id,
            before: tImg(old),
            after: null,
        });
    }
    /** slot_destinations images, logged under the transition id (spec 10.2). */
    private logPoints(tid: number, before: XY[], after: XY[]) {
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
            this.changes.push({
                table: "slot_destinations",
                rowId: tid,
                before: b ? img(i, b) : null,
                after: a ? img(i, a) : null,
            });
        }
    }
    updateShape(id: number, shape: ShapeRow) {
        const old = this.host.shapes[id]!;
        this.host.shapes[id] = shape;
        this.changes.push({
            table: "shapes",
            rowId: id,
            before: { id, ...clone(old) },
            after: { id, ...clone(shape) },
        });
    }
    insertMarcher(id: number, home: XY) {
        this.host.marchers.push({ id, home });
        this.changes.push({
            table: "marchers",
            rowId: id,
            before: null,
            after: { id, home: [home[0], home[1]] },
        });
    }
    moveMarcher(id: number, home: XY) {
        const m = this.host.marchers.find((x) => x.id === id)!;
        const before = { id, home: [m.home[0], m.home[1]] };
        m.home = home;
        this.changes.push({
            table: "marchers",
            rowId: id,
            before,
            after: { id, home: [home[0], home[1]] },
        });
    }
    /** Deletes a marcher and, as the foreign keys cascade, its rows. */
    deleteMarcher(id: number) {
        for (const r of this.host.assignments.filter((x) => x.marcher === id))
            this.deleteRow(r.id);
        const i = this.host.marchers.findIndex((x) => x.id === id);
        const [m] = this.host.marchers.splice(i, 1);
        this.changes.push({
            table: "marchers",
            rowId: id,
            before: { id, home: [m!.home[0], m!.home[1]] },
            after: null,
        });
    }
}

export interface NotifyCase {
    name: string;
    edit: (e: Editor) => void;
    /** Left out of the long-sequence test */
    solo?: boolean;
    /** Checks on the report, beyond agreement */
    report?: (r: InvalidationReport) => void;
}

/**
 * Moves a transition's range and, as the R-E1 procedure does, its rows: rows
 * on the old boundary follow it, and the others are clamped inside.
 */
export function shiftRange(e: Editor, tid: number, start: number, end: number) {
    const t = e.host.transitions[tid]!;
    // widen first, so no intermediate state strands a row (I-A1)
    e.updateTransition(tid, {
        start: Math.min(start, t.start),
        end: Math.max(end, t.end),
    });
    for (const r of e.host.assignments.filter((x) => x.transition === tid)) {
        const s =
            r.start === t.start
                ? start
                : Math.max(start, Math.min(r.start, end - 0.5));
        const f =
            r.end === t.end ? end : Math.min(end, Math.max(r.end, s + 0.5));
        e.updateRow(r.id, { start: s, end: f });
    }
    e.updateTransition(tid, { start, end });
}

export const NOTIFY_CASES: NotifyCase[] = [
    {
        name: "assignment update: a steal moves later",
        edit: (e) => e.updateRow(e.findRow(4, 5).id, { start: 7 }),
        report: (r) => expect(r.marchersRebuilt).toEqual([4]),
    },
    {
        name: "assignment insert with a new transition: a founder is stolen mid-FTL",
        edit: (e) => {
            e.insertTransition(tr(9, 9, 11, null, { points: [[12, 3]] }));
            e.insertRow({
                marcher: 2,
                transition: 9,
                slot: 0,
                start: 9,
                end: 11,
                layer: 1,
            });
        },
    },
    {
        name: "assignment delete: a founder leaves the FTL (targets shift)",
        edit: (e) => e.deleteRow(e.findRow(1, 2).id),
    },
    {
        name: "a founder overridden at the FTL start becomes a joiner (QA-REG-4 shape)",
        edit: (e) => {
            e.insertTransition(tr(10, 4, 6, null, { points: [[1, 1]] }));
            e.insertRow({
                marcher: 3,
                transition: 10,
                slot: 0,
                start: 4,
                end: 6,
                layer: 1,
            });
        },
    },
    {
        name: "a fully overridden row still reserves an FTL target (QA-REG-3 shape)",
        // A new marcher, so no other span of it leads into T8: only the row
        // image (step 3.4) can dirty T8's entry.
        edit: (e) => {
            e.insertMarcher(7, [-9, -9]);
            e.insertTransition(tr(11, 24, 30, null, { points: [[9, 9]] }));
            e.insertRow({
                marcher: 7,
                transition: 11,
                slot: 0,
                start: 24,
                end: 30,
                layer: 1,
            });
            e.insertRow({
                marcher: 7,
                transition: 8,
                slot: 4,
                start: 24,
                end: 30,
                layer: 0,
            });
        },
    },
    {
        name: "a row moves to another marcher",
        edit: (e) => e.updateRow(e.findRow(4, 5).id, { marcher: 3 }),
        report: (r) => expect(r.marchersRebuilt).toEqual([3, 4]),
    },
    {
        name: "transition range shrinks (with its rows)",
        edit: (e) => shiftRange(e, 6, 12, 15),
    },
    {
        name: "FTL start moves later (with its rows)",
        edit: (e) => shiftRange(e, 7, 17, 24),
    },
    {
        name: "upstream FTL start moves earlier (with its rows)",
        edit: (e) => {
            shiftRange(e, 1, 0, 3);
            shiftRange(e, 2, 3, 12);
        },
    },
    {
        name: "shape geometry: the FTL destination line moves",
        edit: (e) =>
            e.updateShape(2, {
                kind: "line",
                geometry: {
                    points: [
                        [7, 1],
                        [9, 9],
                    ],
                },
            }),
        report: (r) =>
            expect(r.localRecomputed).toEqual({
                destinations: [2],
                ftlGeometry: [2],
            }),
    },
    {
        name: "shape geometry: the circle's radius and direction change",
        edit: (e) =>
            e.updateShape(6, {
                kind: "circle",
                geometry: {
                    center: [1, 21],
                    radius: 5,
                    start_angle: 4,
                    clockwise: true,
                },
            }),
    },
    {
        name: "shape kind: the box becomes a freehand path",
        edit: (e) =>
            e.updateShape(7, {
                kind: "freehand",
                geometry: {
                    points: [
                        [-5, -5],
                        [0, -8],
                        [3, -2],
                    ],
                },
            }),
    },
    {
        name: "upstream shape: the box's line moves (G7 lead-in)",
        edit: (e) =>
            e.updateShape(1, {
                kind: "line",
                geometry: {
                    points: [
                        [0, -4],
                        [6, -4],
                    ],
                },
            }),
    },
    {
        name: "slot_count grows",
        edit: (e) => e.updateTransition(2, { slots: 6 }),
    },
    {
        name: "dest_shape_id switches to another shape",
        edit: (e) => e.updateTransition(7, { dest: 8 }),
    },
    {
        name: "a shaped transition switches to individual destinations",
        edit: (e) =>
            e.updateTransition(1, {
                dest: null,
                points: [
                    [1, 1],
                    [2, 2],
                    [3, 3],
                    [4, 4],
                ],
            }),
    },
    {
        name: "one individual destination moves",
        edit: (e) => {
            const pts = [...e.host.transitions[6]!.points!];
            pts[2] = [3, 15];
            e.updateTransition(6, { points: pts });
        },
    },
    {
        name: "individual destinations switch to a shape",
        edit: (e) => e.updateTransition(6, { dest: 8, points: undefined }),
    },
    {
        name: "path_style: direct becomes FTL (the next FTL inherits from it)",
        solo: true, // the sequence has already made T1 shapeless (I-T5)
        edit: (e) =>
            e.updateTransition(1, {
                style: "follow_the_leader",
                params: { waypoints: [] },
            }),
    },
    {
        name: "path_style: FTL becomes direct",
        edit: (e) => e.updateTransition(7, { style: "direct", params: null }),
    },
    {
        name: "path_style: arc becomes direct",
        edit: (e) => e.updateTransition(6, { style: "direct", params: null }),
    },
    {
        name: "path_params: FTL waypoints and arc bulge change",
        edit: (e) => {
            e.updateTransition(7, {
                params: {
                    waypoints: [
                        [3, 14],
                        [0, 15],
                    ],
                },
            });
            e.updateTransition(6, { params: { bulge: -0.5 } });
        },
    },
    {
        name: "order_mode: inherit becomes slot",
        edit: (e) => e.updateTransition(2, { order: "slot" }),
    },
    {
        name: "order_mode on the downstream FTL",
        edit: (e) => e.updateTransition(8, { order: "slot" }),
    },
    {
        name: "marcher home changes",
        edit: (e) => e.moveMarcher(3, [-7, 4]),
        report: (r) => expect(r.marchersRebuilt).toEqual([3]),
    },
    {
        name: "marcher inserted with rows",
        edit: (e) => {
            e.insertMarcher(6, [15, 15]);
            e.insertRow({
                marcher: 6,
                transition: 8,
                slot: 5,
                start: 26,
                end: 30,
                layer: 0,
            });
        },
    },
    {
        name: "marcher deleted (its rows cascade)",
        solo: true,
        edit: (e) => e.deleteMarcher(2),
    },
    {
        name: "transition deleted (its rows cascade)",
        solo: true,
        edit: (e) => e.deleteTransition(5),
    },
    {
        name: "FTL transition deleted (its rows cascade)",
        solo: true,
        edit: (e) => e.deleteTransition(7),
    },
    {
        name: "coalescing: a row inserted then deleted in one batch vanishes",
        solo: true,
        edit: (e) => {
            const r = e.insertRow({
                marcher: 1,
                transition: 5,
                slot: 0,
                start: 6,
                end: 8,
                layer: 2,
            });
            e.deleteRow(r.id);
        },
        report: (r) => expect(r.marchersRebuilt).toEqual([]),
    },
    {
        name: "coalescing: a row updated twice keeps the first before and last after",
        solo: true,
        edit: (e) => {
            const id = e.findRow(4, 5).id;
            e.updateRow(id, { start: 7 });
            e.updateRow(id, { marcher: 1, start: 6 });
        },
        report: (r) => expect(r.marchersRebuilt).toEqual([1, 4]),
    },
    {
        name: "coalescing: a transition edited and then deleted in one batch",
        solo: true,
        edit: (e) => {
            e.updateTransition(5, { dest: 1, slots: 1 });
            e.deleteTransition(5);
        },
    },
    {
        name: "a timeline-only change produces an empty batch",
        edit: () => {},
        report: (r) =>
            expect(r).toEqual({
                marchersRebuilt: [],
                originsDirtied: 0,
                ftlEntriesDirtied: 0,
                localRecomputed: { destinations: [], ftlGeometry: [] },
            }),
    },
];
