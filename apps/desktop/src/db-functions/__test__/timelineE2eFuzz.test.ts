// cspell:ignore undos unplace
/* eslint-disable max-lines-per-function */
import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import {
    createResolver,
    createTimelineOracleForTesting,
    type ChangeBatch,
    type OrderMode,
    type PathStyle,
    type ShapeGeometry,
    type ShapeKind,
    type XY,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    applyTimelineBatch,
    createTimelineHost,
    type TimelineHost,
} from "@/timeline/timelineHost";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    createUndoTriggers,
    dropUndoTriggers,
    performRedo,
    performUndo,
    transactionWithHistory,
} from "../history";
import {
    createMarchersInTransaction,
    createTimelineAssignmentsInTransaction,
    createTimelineShapesInTransaction,
    createTimelineTransitionsInTransaction,
    createTimelinesInTransaction,
    deleteTimelineAssignmentsInTransaction,
    deleteTimelineShapesInTransaction,
    deleteTimelineTransitionsInTransaction,
    deleteTimelinesInTransaction,
    mapDbErrors,
    setTimelineSlotDestinationsInTransaction,
    setTimelineTransitionDestinationInTransaction,
    setTimelineTransitionRangeInTransaction,
    subscribeTimelineChanges,
    TimelineCommitViolationError,
    TimelineWriteError,
    updateMarcherHomesInTransaction,
    updateTimelineAssignmentsInTransaction,
    updateTimelineShapesInTransaction,
    updateTimelineSlotDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
    updateTimelinesInTransaction,
    type TimelinePathParams,
} from "../index";
import type { DbTransaction } from "../types";

/**
 * End-to-end fuzz with the app's real write wrapper and real undo/redo (docs/timeline/phases/
 * 04-write-path-undo.md P4.9; spec §12.6 QA-INV-09 and §12.2 QA-UNDO-9). A port of
 * `docs/timeline/ref/e2e.mjs` onto the app:
 *
 * - Each seed builds a random valid show through the timeline db-functions, then runs random
 *   steps: edits of every kind through the db-functions inside `transactionWithHistory` (one to
 *   three per edit), deliberately invalid edits that the validators or the database must reject,
 *   and single undos, redos and bursts of both through `performUndo`/`performRedo`, with
 *   `group_limit` set low so pruning happens.
 * - The resolver host (`timelineHost.ts`, the one the app runs) is fed only by the batches
 *   delivered to `subscribeTimelineChanges`. Every committed edit, undo and redo must deliver
 *   exactly one batch if it changed data and none if it did not. After each, the host's mirror
 *   must equal a fresh read of the tables, its resolver must match a fresh cold build and the
 *   oracle at sampled beats, and its caches must be closed.
 * - After every undo and redo, the data must equal the snapshot recorded at that point in
 *   history, and the undo and redo stacks must hold the expected number of groups. No undo or
 *   redo may be rejected. A rejected edit must change nothing (data and history tables) and
 *   deliver no batch, and an `E-DB` rejection must be one of the expected database reasons.
 * - Every generator must commit, and every invalid change must be applied, at least once in a
 *   full run (the coverage test).
 * - Negative control (QA-UNDO-9, like `e2e.mjs --v06-anchor`): with the v0.6 row-rewriting range
 *   trigger restored, undo must break on at least one seed.
 *
 * Size, through environment variables (defaults keep it to a few seconds):
 *
 * - `TIMELINE_E2E_SEEDS` (5), `TIMELINE_E2E_FIRST_SEED` (1), `TIMELINE_E2E_STEPS` (80)
 * - `TIMELINE_E2E_V06_SEEDS` (12): the most seeds the negative control tries; it stops at the
 *   first that breaks. `0` skips it.
 * - `TIMELINE_E2E_TIMEOUT` (120000): per-seed timeout in ms
 * - `TIMELINE_E2E_REPORT`: a file to write the run's counts to, as JSON
 *
 * The spec's evidence run is `TIMELINE_E2E_SEEDS=600 TIMELINE_E2E_STEPS=80`.
 */

const envInt = (name: string, fallback: number) => {
    const raw = process.env[name];
    const value = raw === undefined || raw === "" ? NaN : Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
};

const SEEDS = envInt("TIMELINE_E2E_SEEDS", 5);
const FIRST_SEED = envInt("TIMELINE_E2E_FIRST_SEED", 1);
const STEPS = envInt("TIMELINE_E2E_STEPS", 80);
const V06_SEEDS = envInt("TIMELINE_E2E_V06_SEEDS", 12);
const TIMEOUT = envInt("TIMELINE_E2E_TIMEOUT", 120_000);
const REPORT = process.env.TIMELINE_E2E_REPORT;

/** Small, so pruning happens within a run (QA-UNDO-9) */
const GROUP_LIMIT = 20;
/** Tolerance against the oracle (the reference fuzzer's) */
const EPS = 1e-6;
const SHOW_END = 40;

/** The v0.6 trigger from spec Appendix G and `ref/e2e.mjs`, on the app's table names. */
const V06_ANCHOR = `CREATE TRIGGER v06_range_anchor AFTER UPDATE OF start_beat, end_beat ON timeline_transitions
BEGIN
  UPDATE timeline_assignments
     SET start_beat = CASE WHEN start_beat = OLD.start_beat THEN NEW.start_beat ELSE start_beat END,
         end_beat   = CASE WHEN end_beat   = OLD.end_beat   THEN NEW.end_beat   ELSE end_beat   END
   WHERE transition_id = NEW.id
     AND (start_beat = OLD.start_beat OR end_beat = OLD.end_beat);
  SELECT RAISE(ABORT, 'E-A1: range change strands an unanchored assignment')
   WHERE EXISTS (SELECT 1 FROM timeline_assignments a WHERE a.transition_id = NEW.id
                 AND (a.start_beat < NEW.start_beat OR a.end_beat > NEW.end_beat));
END`;

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

const newStats = () => ({
    seeds: 0,
    steps: 0,
    commits: 0,
    /** Committed edits whose batch changed individual destinations */
    individualCommits: 0,
    /** Committed edits that used the R-E1 procedure */
    rangeEditCommits: 0,
    /** Committed edits that switched a transition between a shape and individual points */
    switchCommits: 0,
    rejected: 0,
    rejectReasons: {} as Record<string, number>,
    /** Rejected edits whose deliberately invalid change was applied */
    invalidAttempts: 0,
    /** Applied invalid changes, by name */
    invalidApplied: {} as Partial<Record<InvalidName, number>>,
    /** Committed edits in which each generator wrote something, by name */
    opCommits: {} as Partial<Record<OpName, number>>,
    /** Edits in which no generator found anything to change */
    skipped: 0,
    undos: 0,
    redos: 0,
    undoEmpty: 0,
    redoEmpty: 0,
    undoBursts: 0,
    redoBursts: 0,
    /** Edits that committed with the undo stack already at `GROUP_LIMIT` (pruning) */
    commitsAtLimit: 0,
    /** Commits that changed no data and delivered a batch of no-op changes */
    noOpBatches: 0,
    verifications: 0,
    positionsCompared: 0,
    maxAssignments: 0,
    maxTransitions: 0,
});
type Stats = ReturnType<typeof newStats>;

/** A fuzz finding: the seed and step, and what went wrong. */
class FuzzFailure extends Error {
    /** Thrown by an undo or redo step, rather than by an edit */
    inHistoryStep = false;

    constructor(
        readonly kind:
            | "undo-rejected"
            | "redo-rejected"
            | "snapshot"
            | "history"
            | "empty-but-expected"
            | "unexpected-history-action"
            | "invalid-edit-committed"
            | "rejected-edit-changed-data"
            | "unexpected-error"
            | "batch"
            | "mirror"
            | "divergence"
            | "closure"
            | "listener",
        message: string,
    ) {
        super(`${kind}: ${message}`);
        this.name = "FuzzFailure";
    }
}

/** Thrown inside an edit whose generators found nothing to change, to roll it back */
class NothingToDo extends Error {}

// ---------------------------------------------------------------------------
// Random numbers (ref/e2e.mjs)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Rand = ReturnType<typeof makeRand>;
const makeRand = (seed: number) => {
    const R = mulberry32(seed);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)]!;
    const pt = (): XY => [ri(-10, 10), ri(-10, 10)];
    return { R, ri, pick, pt };
};

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

const DATA_TABLES = [
    schema.marchers,
    schema.marcher_pages,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
] as const;

/** Every row of the data tables the timeline touches, as one comparable string. */
const dumpData = async (db: DbConnection) => {
    const out: unknown[] = [];
    for (const table of DATA_TABLES)
        out.push(await db.select().from(table).orderBy(asc(table.id)).all());
    return JSON.stringify(out);
};

/**
 * The columns the change-log triggers image (`triggers.ts`), so a commit delivers a batch with a
 * real change exactly when this dump changes. Timelines and a marcher's other columns aren't
 * logged (R-1, C-5).
 */
const LOGGED_QUERIES = [
    "SELECT id, home_x, home_y FROM marchers ORDER BY id",
    "SELECT id, kind, geometry FROM timeline_shapes ORDER BY id",
    "SELECT id, dest_shape_id, path_style, path_params, order_mode, slot_count, start_beat, end_beat FROM timeline_transitions ORDER BY id",
    "SELECT id, marcher_id, transition_id, slot_index, start_beat, end_beat, layer FROM timeline_assignments ORDER BY id",
    "SELECT transition_id, slot_index, x, y FROM timeline_slot_destinations ORDER BY transition_id, slot_index",
];
const dumpLogged = async (db: DbConnection) => {
    const out: unknown[] = [];
    for (const query of LOGGED_QUERIES) out.push(await db.all(sql.raw(query)));
    return JSON.stringify(out);
};

/**
 * Whether a batch changes nothing overall: for each row, its first image before equals its last
 * image after. Batches aren't coalesced, so an edit that sets a value and sets it back logs two
 * changes. Destinations are logged under their transition id, so they are keyed by slot too.
 */
const isNetNoOp = (batch: ChangeBatch) => {
    const net = new Map<string, { before: unknown; after: unknown }>();
    for (const c of batch.changes) {
        const image = (c.before ?? c.after) as { slot?: number } | null;
        const key = `${c.table}:${c.rowId}:${c.table === "slot_destinations" ? image?.slot : ""}`;
        const entry = net.get(key);
        if (entry) entry.after = c.after;
        else net.set(key, { before: c.before, after: c.after });
    }
    return [...net.values()].every(({ before, after }) =>
        isDeepStrictEqual(before, after),
    );
};

const dumpHistory = async (db: DbConnection) =>
    JSON.stringify([
        await db
            .select()
            .from(schema.history_undo)
            .orderBy(asc(schema.history_undo.sequence))
            .all(),
        await db
            .select()
            .from(schema.history_redo)
            .orderBy(asc(schema.history_redo.sequence))
            .all(),
        await db.select().from(schema.history_stats).all(),
    ]);

const groupCount = async (db: DbConnection, table: "undo" | "redo") => {
    const name = table === "undo" ? "history_undo" : "history_redo";
    const row = (await db.get(
        sql.raw(`SELECT count(DISTINCT history_group) AS n FROM ${name}`),
    )) as { n: number } | unknown[];
    return Number(Array.isArray(row) ? row[0] : row.n);
};

/** The first difference between two dumps, for a readable failure. */
const firstDifference = (expected: string, actual: string) => {
    const e = JSON.parse(expected) as unknown[][];
    const a = JSON.parse(actual) as unknown[][];
    for (let t = 0; t < DATA_TABLES.length; t++) {
        const name = String(
            (DATA_TABLES[t] as unknown as Record<symbol, unknown>)[
                Symbol.for("drizzle:Name")
            ] ?? t,
        );
        const er = e[t] ?? [];
        const ar = a[t] ?? [];
        for (let i = 0; i < Math.max(er.length, ar.length); i++)
            if (!isDeepStrictEqual(er[i], ar[i]))
                return `${name} row ${i}: expected ${JSON.stringify(er[i])}, got ${JSON.stringify(ar[i])}`;
    }
    return "no difference in the data tables";
};

// ---------------------------------------------------------------------------
// Edit generators: each runs inside one edit and returns whether it wrote anything
// ---------------------------------------------------------------------------

type Op = (tx: DbTransaction) => Promise<boolean>;

/** The edit generators, by name; the coverage test requires each to commit at least once */
const OP_NAMES = [
    "add assignment",
    "steal",
    "delete assignment",
    "update assignment",
    "R-E1 range edit",
    "R-E1 range shift",
    "timeline range nudge",
    "raw range update",
    "path style",
    "order mode",
    "slot count",
    "set shape destination",
    "shape to individual",
    "move one point",
    "replace every point",
    "grow and place",
    "child-first transition delete",
    "add shaped transition",
    "add individual transition",
    "update shape",
    "add shape",
    "delete unused shape",
    "home edit",
    "add marcher",
    "marcher delete",
    "add timeline",
    "update timeline",
    "timeline delete",
] as const;
type OpName = (typeof OP_NAMES)[number];

/** The deliberately invalid changes, by name; the coverage test requires each to be applied */
const INVALID_NAMES = [
    "E-S1 coincident line",
    "E-P1 major arc",
    "E-N2 home out of bounds",
    "E-A1/E-A2 row after the end",
    "E-A1/E-A2 slot past the count",
    "E-A3 overlapping copy",
    "E-ARGS transition off its timeline's range",
    "E-T3/E-T4 block followed by the leader",
    "E-T6 unplaced point at commit",
    "E-T6 shape on a transition with points",
    "E-DB shape in use",
    "E-A1 range strands a row",
    "E-A2 slot count below an occupied slot",
    "E-T1 raw timeline drops a transition",
] as const;
type InvalidName = (typeof INVALID_NAMES)[number];

interface NamedOp<Name extends string> {
    name: Name;
    run: Op;
}
const op = (name: OpName, run: Op): NamedOp<OpName> => ({ name, run });
const invalidOp = (name: InvalidName, run: Op): NamedOp<InvalidName> => ({
    name,
    run,
});

interface EditTags {
    rangeEdit: boolean;
    switched: boolean;
}

const idsOf = async (
    tx: DbTransaction,
    table:
        | typeof schema.marchers
        | typeof schema.timelines
        | typeof schema.timeline_shapes
        | typeof schema.timeline_transitions
        | typeof schema.timeline_assignments,
) =>
    (
        await tx
            .select({ id: table.id })
            .from(table)
            .orderBy(asc(table.id))
            .all()
    ).map((r) => r.id);

const transitionsOf = (tx: DbTransaction) =>
    tx
        .select()
        .from(schema.timeline_transitions)
        .orderBy(asc(schema.timeline_transitions.id))
        .all();

const assignmentsOf = (tx: DbTransaction) =>
    tx
        .select()
        .from(schema.timeline_assignments)
        .orderBy(asc(schema.timeline_assignments.id))
        .all();

/** Runs raw SQL as part of an edit, with the write path's error mapping. */
const raw = (tx: DbTransaction, statement: SQL) =>
    mapDbErrors(() => tx.run(statement));

function makeGenerators(rand: Rand, v06: boolean, tags: EditTags) {
    const { R, ri, pick, pt } = rand;

    const shape = (): { kind: ShapeKind; geometry: ShapeGeometry } => {
        const kind = pick<ShapeKind>([
            "line",
            "freehand",
            "circle",
            "box",
            "line",
            "freehand",
            "circle",
            "box",
            "block",
        ]);
        if (kind === "line") {
            const a = pt();
            return {
                kind,
                geometry: { points: [a, [a[0] + ri(1, 6), a[1] + ri(-3, 3)]] },
            };
        }
        if (kind === "freehand") {
            const points: XY[] = [pt()];
            for (let i = ri(1, 3); i > 0; i--) points.push(pt());
            points.push([points[0]![0] + 1, points[0]![1]]);
            return { kind, geometry: { points } };
        }
        if (kind === "circle")
            return {
                kind,
                geometry: {
                    center: pt(),
                    radius: ri(1, 6),
                    start_angle: +(R() * 6).toFixed(3),
                    clockwise: R() < 0.5,
                },
            };
        if (kind === "box")
            return {
                kind,
                geometry: { origin: pt(), width: ri(1, 6), height: ri(1, 6) },
            };
        return {
            kind,
            geometry: {
                origin: pt(),
                rows: ri(1, 3),
                cols: ri(1, 3),
                spacing: [ri(1, 2), ri(1, 2)],
            },
        };
    };

    const params = (style: PathStyle): TimelinePathParams =>
        style === "arc"
            ? { bulge: +(R() - 0.5).toFixed(3) }
            : style === "follow_the_leader"
              ? { waypoints: Array.from({ length: ri(0, 2) }, pt) }
              : null;

    const points = (n: number): XY[] => Array.from({ length: n }, pt);

    const randomRange = () => {
        const s = ri(0, SHOW_END - 4);
        return { startBeat: s, endBeat: ri(s + 1, Math.min(SHOW_END, s + 12)) };
    };

    /**
     * A transition spans its timeline (C-11): an existing timeline, or about half the time a new
     * one over a random range, made in the same edit.
     */
    const timelineFor = async (tx: DbTransaction): Promise<number> => {
        const timelines = await idsOf(tx, schema.timelines);
        if (timelines.length && R() < 0.5) return pick(timelines);
        const [timeline] = await createTimelinesInTransaction({
            newTimelines: [{ name: "fuzz", ...randomRange() }],
            tx,
        });
        return timeline!.id;
    };

    const addShaped: Op = async (tx) => {
        const shapes = await idsOf(tx, schema.timeline_shapes);
        if (!shapes.length) return false;
        const style = pick<PathStyle>([
            "direct",
            "arc",
            "follow_the_leader",
            "follow_the_leader",
        ]);
        await createTimelineTransitionsInTransaction({
            newTransitions: [
                {
                    timelineId: await timelineFor(tx),
                    slotCount: ri(1, 5),
                    destination: { kind: "shape", shapeId: pick(shapes) },
                    pathStyle: style,
                    pathParams: params(style),
                    orderMode: R() < 0.8 ? "inherit" : "slot",
                },
            ],
            tx,
        });
        return true;
    };

    /** D-16: a shapeless transition and all its points, in one edit */
    const addIndividual: Op = async (tx) => {
        const style = pick<PathStyle>(["direct", "arc"]);
        const n = ri(1, 5);
        await createTimelineTransitionsInTransaction({
            newTransitions: [
                {
                    timelineId: await timelineFor(tx),
                    slotCount: n,
                    destination: { kind: "individual", points: points(n) },
                    pathStyle: style,
                    pathParams: params(style),
                },
            ],
            tx,
        });
        return true;
    };

    const addAssignment =
        (layer?: number): Op =>
        async (tx) => {
            const transitions = await transitionsOf(tx);
            const marchers = await idsOf(tx, schema.marchers);
            if (!transitions.length || !marchers.length) return false;
            const t = pick(transitions);
            const full = R() < 0.6;
            const s = full ? t.start_beat : ri(t.start_beat, t.end_beat - 1);
            const e = full ? t.end_beat : ri(s + 1, t.end_beat);
            await createTimelineAssignmentsInTransaction({
                newAssignments: [
                    {
                        marcherId: pick(marchers),
                        transitionId: t.id,
                        slotIndex: ri(0, t.slot_count - 1),
                        startBeat: s,
                        endBeat: e,
                        layer: layer ?? pick([0, 0, 0, 1, 2]),
                    },
                ],
                tx,
            });
            return true;
        };

    const pickTransition = async (
        tx: DbTransaction,
        filter: (
            t: typeof schema.timeline_transitions.$inferSelect,
        ) => boolean = () => true,
    ) => {
        const ts = (await transitionsOf(tx)).filter(filter);
        return ts.length ? pick(ts) : undefined;
    };

    /** R-E1 (spec §6): the anchored rows move with the range. v0.6 had no procedure. */
    const rangeEdit =
        (shift: boolean): Op =>
        async (tx) => {
            if (v06) return false;
            const t = await pickTransition(tx);
            if (!t) return false;
            let start: number;
            let end: number;
            if (shift) {
                const d = ri(-4, 4);
                start = Math.max(0, t.start_beat + d);
                end = start + (t.end_beat - t.start_beat);
            } else {
                start = Math.max(0, t.start_beat + ri(-4, 4));
                end = Math.max(start + 1, t.end_beat + ri(-4, 4));
            }
            // A target equal to the current range writes nothing (handoff notes)
            if (start === t.start_beat && end === t.end_beat) return false;
            await setTimelineTransitionRangeInTransaction({
                tx,
                transitionId: t.id,
                start,
                end,
            });
            tags.rangeEdit = true;
            return true;
        };

    const ops: NamedOp<OpName>[] = [
        op("add assignment", addAssignment()),
        op("add assignment", addAssignment()), // weighted: assignments are most edits
        op("steal", async (tx) => addAssignment(ri(1, 3))(tx)), // steal
        op("delete assignment", async (tx) => {
            const ids = await idsOf(tx, schema.timeline_assignments);
            if (!ids.length) return false;
            await deleteTimelineAssignmentsInTransaction({
                assignmentIds: new Set([pick(ids)]),
                tx,
            });
            return true;
        }),
        op("update assignment", async (tx) => {
            const rows = await assignmentsOf(tx);
            if (!rows.length) return false;
            const a = pick(rows);
            const d = pick([-2, -1, 1, 2]);
            const field = pick([
                "layer",
                "startBeat",
                "endBeat",
                "slotIndex",
            ] as const);
            const current = {
                layer: a.layer,
                startBeat: a.start_beat,
                endBeat: a.end_beat,
                slotIndex: a.slot_index,
            }[field];
            await updateTimelineAssignmentsInTransaction({
                modifiedAssignments: [{ id: a.id, [field]: current + d }],
                tx,
            });
            return true;
        }),
        op("R-E1 range edit", rangeEdit(false)),
        op("R-E1 range shift", rangeEdit(true)),
        // A timeline's range nudged: its transitions and anchored rows move with it (C-11), and
        // it is refused (E-A1) if it would strand a row
        op("timeline range nudge", async (tx) => {
            const timelines = await tx.select().from(schema.timelines).all();
            if (!timelines.length) return false;
            const l = pick(timelines);
            const start = Math.max(0, l.start_beat + ri(-3, 3));
            const end = Math.max(start + 1, l.end_beat + ri(-3, 3));
            if (start === l.start_beat && end === l.end_beat) return false;
            await updateTimelinesInTransaction({
                modifiedTimelines: [
                    { id: l.id, startBeat: start, endBeat: end },
                ],
                tx,
            });
            return true;
        }),
        // A raw range UPDATE, as in e2e.mjs: tr_range_check rejects a stranded row. Under the
        // v0.6 trigger it moves the anchored rows instead. The timeline moves with its transitions
        // (C-11): grown to the union first, settled on the new range last.
        op("raw range update", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            const l = (await tx
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, t.timeline_id))
                .get())!;
            const start = Math.max(0, l.start_beat + ri(-3, 3));
            const end = Math.max(start + 1, l.end_beat + ri(-3, 3));
            if (start === l.start_beat && end === l.end_beat) return false;
            await raw(
                tx,
                sql`UPDATE timelines SET start_beat = ${Math.min(start, l.start_beat)}, end_beat = ${Math.max(end, l.end_beat)} WHERE id = ${l.id}`,
            );
            await raw(
                tx,
                sql`UPDATE timeline_transitions SET start_beat = ${start}, end_beat = ${end} WHERE timeline_id = ${l.id}`,
            );
            await raw(
                tx,
                sql`UPDATE timelines SET start_beat = ${start}, end_beat = ${end} WHERE id = ${l.id}`,
            );
            return true;
        }),
        op("path style", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            const style = pick<PathStyle>([
                "direct",
                "arc",
                "follow_the_leader",
            ]);
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [
                    { id: t.id, pathStyle: style, pathParams: params(style) },
                ],
                tx,
            });
            return true;
        }),
        op("order mode", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            const order: OrderMode =
                t.order_mode === "inherit" ? "slot" : "inherit";
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [{ id: t.id, orderMode: order }],
                tx,
            });
            return true;
        }),
        // Slot count: a shaped transition alone; a shapeless one with its new points
        op("slot count", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            const n = ri(1, 6);
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [
                    t.dest_shape_id === null
                        ? { id: t.id, slotCount: n, points: points(n) }
                        : { id: t.id, slotCount: n },
                ],
                tx,
            });
            return true;
        }),
        // A new destination shape; from individual points this is a switch
        op("set shape destination", async (tx) => {
            const t = await pickTransition(tx);
            const shapes = await idsOf(tx, schema.timeline_shapes);
            if (!t || !shapes.length) return false;
            await setTimelineTransitionDestinationInTransaction({
                transitionId: t.id,
                destination: { kind: "shape", shapeId: pick(shapes) },
                tx,
            });
            if (t.dest_shape_id === null) tags.switched = true;
            return true;
        }),
        // Shape to individual points (E-T5 if it follows the leader)
        op("shape to individual", async (tx) => {
            // Mostly one that doesn't follow the leader, so the switch usually commits
            const shaped = (
                x: typeof schema.timeline_transitions.$inferSelect,
            ) => x.dest_shape_id !== null;
            const t =
                (R() < 0.7
                    ? await pickTransition(
                          tx,
                          (x) =>
                              shaped(x) && x.path_style !== "follow_the_leader",
                      )
                    : undefined) ?? (await pickTransition(tx, shaped));
            if (!t) return false;
            await setTimelineTransitionDestinationInTransaction({
                transitionId: t.id,
                destination: {
                    kind: "individual",
                    points: points(t.slot_count),
                },
                tx,
            });
            tags.switched = true;
            return true;
        }),
        // Move one placed point
        op("move one point", async (tx) => {
            const d = await tx
                .select()
                .from(schema.timeline_slot_destinations)
                .orderBy(asc(schema.timeline_slot_destinations.id))
                .all();
            if (!d.length) return false;
            const x = pick(d);
            await updateTimelineSlotDestinationInTransaction({
                transitionId: x.transition_id,
                slotIndex: x.slot_index,
                point: pt(),
                tx,
            });
            return true;
        }),
        // Replace every point
        op("replace every point", async (tx) => {
            const t = await pickTransition(tx, (x) => x.dest_shape_id === null);
            if (!t) return false;
            await setTimelineSlotDestinationsInTransaction({
                transitionId: t.id,
                points: points(t.slot_count),
                tx,
            });
            return true;
        }),
        // Grow and place (checked at commit, QA-UNDO-4)
        op("grow and place", async (tx) => {
            const t = await pickTransition(tx, (x) => x.dest_shape_id === null);
            if (!t) return false;
            const current = (
                await tx
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            t.id,
                        ),
                    )
                    .orderBy(asc(schema.timeline_slot_destinations.slot_index))
                    .all()
            ).map((d): XY => [d.x, d.y]);
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [
                    {
                        id: t.id,
                        slotCount: t.slot_count + 1,
                        points: [...current, pt()],
                    },
                ],
                tx,
            });
            return true;
        }),
        // Child-first delete (C-1)
        op("child-first transition delete", async (tx) => {
            const ids = await idsOf(tx, schema.timeline_transitions);
            if (ids.length <= 3) return false;
            await deleteTimelineTransitionsInTransaction({
                transitionIds: new Set([pick(ids)]),
                tx,
            });
            return true;
        }),
        op("add shaped transition", addShaped),
        op("add individual transition", addIndividual),
        op("update shape", async (tx) => {
            const ids = await idsOf(tx, schema.timeline_shapes);
            if (!ids.length) return false;
            await updateTimelineShapesInTransaction({
                modifiedShapes: [{ id: pick(ids), ...shape() }],
                tx,
            });
            return true;
        }),
        op("add shape", async (tx) => {
            await createTimelineShapesInTransaction({
                newShapes: [shape()],
                tx,
            });
            return true;
        }),
        // Delete a shape no transition uses
        op("delete unused shape", async (tx) => {
            const used = new Set(
                (await transitionsOf(tx)).map((t) => t.dest_shape_id),
            );
            const unused = (await idsOf(tx, schema.timeline_shapes)).filter(
                (id) => !used.has(id),
            );
            if (!unused.length) return false;
            await deleteTimelineShapesInTransaction({
                shapeIds: new Set([pick(unused)]),
                tx,
            });
            return true;
        }),
        op("home edit", async (tx) => {
            const ids = await idsOf(tx, schema.marchers);
            if (!ids.length) return false;
            await updateMarcherHomesInTransaction({
                modifiedHomes: [{ marcherId: pick(ids), home: pt() }],
                tx,
            });
            return true;
        }),
        op("add marcher", async (tx) => {
            await addMarcher(tx, pt());
            return true;
        }),
        // Delete a marcher: its assignments cascade (the C-1 exception)
        op("marcher delete", async (tx) => {
            const ids = await idsOf(tx, schema.marchers);
            if (ids.length <= 2) return false;
            await mapDbErrors(() =>
                tx
                    .delete(schema.marchers)
                    .where(eq(schema.marchers.id, pick(ids)))
                    .run(),
            );
            return true;
        }),
        // Timelines: add, change the range (moving their transitions, C-11), delete
        op("add timeline", async (tx) => {
            await createTimelinesInTransaction({
                newTimelines: [{ name: "fuzz", ...randomRange() }],
                tx,
            });
            return true;
        }),
        op("update timeline", async (tx) => {
            const ids = await idsOf(tx, schema.timelines);
            if (!ids.length) return false;
            await updateTimelinesInTransaction({
                modifiedTimelines: [
                    {
                        id: pick(ids),
                        startBeat: ri(0, 6),
                        endBeat: ri(SHOW_END - 6, SHOW_END),
                    },
                ],
                tx,
            });
            return true;
        }),
        op("timeline delete", async (tx) => {
            const ids = await idsOf(tx, schema.timelines);
            // Rare, and never the last timeline
            if (ids.length <= 1 || R() < 0.7) return false;
            await deleteTimelinesInTransaction({
                timelineIds: new Set([pick(ids)]),
                tx,
            });
            return true;
        }),
    ];

    /**
     * Deliberately invalid changes, each run last in its edit. Each one either throws (the
     * validators or a trigger reject it) or returns true when the commit-time check must reject
     * the edit; false means it found nothing to break.
     */
    const invalid: NamedOp<InvalidName>[] = [
        // E-S1: a line whose endpoints coincide
        invalidOp("E-S1 coincident line", async (tx) => {
            const a = pt();
            await createTimelineShapesInTransaction({
                newShapes: [{ kind: "line", geometry: { points: [a, a] } }],
                tx,
            });
            return true;
        }),
        // E-P1: a major arc
        invalidOp("E-P1 major arc", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [
                    {
                        id: t.id,
                        pathStyle: "arc",
                        pathParams: { bulge: pick([-0.9, 0.75, 2]) },
                    },
                ],
                tx,
            });
            return true;
        }),
        // E-N2: a home outside the bound
        invalidOp("E-N2 home out of bounds", async (tx) => {
            const ids = await idsOf(tx, schema.marchers);
            if (!ids.length) return false;
            await updateMarcherHomesInTransaction({
                modifiedHomes: [{ marcherId: pick(ids), home: [2e6, 0] }],
                tx,
            });
            return true;
        }),
        // E-A1/E-A2: a row after its transition's end
        invalidOp("E-A1/E-A2 row after the end", async (tx) => {
            const t = await pickTransition(tx);
            const marchers = await idsOf(tx, schema.marchers);
            if (!t || !marchers.length) return false;
            await createTimelineAssignmentsInTransaction({
                newAssignments: [
                    {
                        marcherId: pick(marchers),
                        transitionId: t.id,
                        slotIndex: 0,
                        startBeat: t.end_beat,
                        endBeat: t.end_beat + 1,
                    },
                ],
                tx,
            });
            return true;
        }),
        // E-A1/E-A2: a slot past the slot count
        invalidOp("E-A1/E-A2 slot past the count", async (tx) => {
            const t = await pickTransition(tx);
            const marchers = await idsOf(tx, schema.marchers);
            if (!t || !marchers.length) return false;
            await createTimelineAssignmentsInTransaction({
                newAssignments: [
                    {
                        marcherId: pick(marchers),
                        transitionId: t.id,
                        slotIndex: t.slot_count,
                        startBeat: t.start_beat,
                        endBeat: t.end_beat,
                    },
                ],
                tx,
            });
            return true;
        }),
        // E-A3: an exact copy of a row overlaps it
        invalidOp("E-A3 overlapping copy", async (tx) => {
            const rows = await assignmentsOf(tx);
            if (!rows.length) return false;
            const a = pick(rows);
            await createTimelineAssignmentsInTransaction({
                newAssignments: [
                    {
                        marcherId: a.marcher_id,
                        transitionId: a.transition_id,
                        slotIndex: a.slot_index,
                        startBeat: a.start_beat,
                        endBeat: a.end_beat,
                        layer: a.layer,
                    },
                ],
                tx,
            });
            return true;
        }),
        // C-11: a transition that doesn't span its timeline (refused by the app, E-ARGS)
        invalidOp("E-ARGS transition off its timeline's range", async (tx) => {
            const timelines = await tx.select().from(schema.timelines).all();
            if (!timelines.length) return false;
            const tl = pick(timelines);
            await createTimelineTransitionsInTransaction({
                newTransitions: [
                    {
                        timelineId: tl.id,
                        startBeat: tl.end_beat,
                        endBeat: tl.end_beat + 2,
                        slotCount: 1,
                        destination: { kind: "individual", points: [pt()] },
                    },
                ],
                tx,
            });
            return true;
        }),
        // E-T3/E-T4: a block shape as a follow-the-leader destination
        invalidOp("E-T3/E-T4 block followed by the leader", async (tx) => {
            const blocks = (
                await tx.select().from(schema.timeline_shapes).all()
            ).filter((s) => s.kind === "block");
            const timelines = await idsOf(tx, schema.timelines);
            if (!blocks.length || !timelines.length) return false;
            await createTimelineTransitionsInTransaction({
                newTransitions: [
                    {
                        timelineId: pick(timelines),
                        slotCount: 1,
                        destination: {
                            kind: "shape",
                            shapeId: pick(blocks).id,
                        },
                        pathStyle: "follow_the_leader",
                        pathParams: { waypoints: [] },
                    },
                ],
                tx,
            });
            return true;
        }),
        // E-T6 at commit: unplace one point of a shapeless transition
        invalidOp("E-T6 unplaced point at commit", async (tx) => {
            const d = await tx
                .select()
                .from(schema.timeline_slot_destinations)
                .orderBy(asc(schema.timeline_slot_destinations.id))
                .all();
            if (!d.length) return false;
            await raw(
                tx,
                sql`DELETE FROM timeline_slot_destinations WHERE id = ${pick(d).id}`,
            );
            return true;
        }),
        // E-T6 (row trigger): a shape on a transition that still has points
        invalidOp("E-T6 shape on a transition with points", async (tx) => {
            const t = await pickTransition(tx, (x) => x.dest_shape_id === null);
            const shapes = await idsOf(tx, schema.timeline_shapes);
            if (!t || !shapes.length) return false;
            await raw(
                tx,
                sql`UPDATE timeline_transitions SET dest_shape_id = ${pick(shapes)} WHERE id = ${t.id}`,
            );
            return true;
        }),
        // E-DB (RESTRICT): delete a shape a transition uses
        invalidOp("E-DB shape in use", async (tx) => {
            const used = [
                ...new Set(
                    (await transitionsOf(tx))
                        .map((t) => t.dest_shape_id)
                        .filter((id): id is number => id !== null),
                ),
            ];
            if (!used.length) return false;
            await deleteTimelineShapesInTransaction({
                shapeIds: new Set([pick(used)]),
                tx,
            });
            return true;
        }),
        // E-A1: a raw range update that strands a row (the app moves ranges only with their
        // timeline, C-11)
        invalidOp("E-A1 range strands a row", async (tx) => {
            const rows = await assignmentsOf(tx);
            if (!rows.length) return false;
            const a = pick(rows);
            await raw(
                tx,
                sql`UPDATE timeline_transitions SET start_beat = ${a.end_beat}, end_beat = ${a.end_beat + 1} WHERE id = ${a.transition_id}`,
            );
            return true;
        }),
        // E-A2: a slot count below an occupied slot
        invalidOp("E-A2 slot count below an occupied slot", async (tx) => {
            const rows = (await assignmentsOf(tx)).filter(
                (a) => a.slot_index > 0,
            );
            if (!rows.length) return false;
            const a = pick(rows);
            const t = (await transitionsOf(tx)).find(
                (x) => x.id === a.transition_id,
            )!;
            await updateTimelineTransitionsInTransaction({
                modifiedTransitions: [
                    t.dest_shape_id === null
                        ? {
                              id: t.id,
                              slotCount: a.slot_index,
                              points: points(a.slot_index),
                          }
                        : { id: t.id, slotCount: a.slot_index },
                ],
                tx,
            });
            return true;
        }),
        // E-T1: a raw timeline update that no longer contains its transitions (the app moves the
        // transitions with it, C-11)
        invalidOp("E-T1 raw timeline drops a transition", async (tx) => {
            const t = await pickTransition(tx);
            if (!t) return false;
            await raw(
                tx,
                sql`UPDATE timelines SET start_beat = ${t.end_beat}, end_beat = ${t.end_beat + 1} WHERE id = ${t.timeline_id}`,
            );
            return true;
        }),
    ];

    return { ops, invalid, addShaped, addIndividual, addAssignment, shape };
}

/** A marcher with a home (C-5), through the app's marcher write path. */
const addMarcher = async (tx: DbTransaction, home: XY) => {
    const max = (await tx.get(
        sql.raw("SELECT coalesce(max(drill_order), 0) AS n FROM marchers"),
    )) as { n: number } | unknown[] as { n: number } | number[];
    const next = Number(Array.isArray(max) ? max[0] : max.n) + 1;
    const [marcher] = await createMarchersInTransaction({
        newMarchers: [
            { section: "Brass", drill_prefix: "B", drill_order: next },
        ],
        tx,
    });
    await updateMarcherHomesInTransaction({
        modifiedHomes: [{ marcherId: marcher!.id, home }],
        tx,
    });
};

// ---------------------------------------------------------------------------
// One seed
// ---------------------------------------------------------------------------

/**
 * The code of a rejected edit. `E-DB` covers several database rejections (CHECK, UNIQUE,
 * RESTRICT), so it carries the database's reason, with numbers removed, to keep the counts
 * readable and to show that no unexpected failure hides under it.
 */
const rejectReason = (error: unknown) => {
    const { code } = error as TimelineWriteError;
    if (code !== "E-DB") return code;
    let reason = "";
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        if (e.message) reason = e.message;
    return `E-DB (${reason.replace(/\d+(\.\d+)?/g, "#").slice(0, 100)})`;
};

/**
 * The database rejections the generators can cause, besides the spec's coded ones: a second
 * marcher or a second row in one slot of a transition (UNIQUE), a slot index, assignment range
 * or transition range out of bounds (CHECK, from the update and raw range generators). A
 * FOREIGN KEY failure is expected only from deleting a shape in use (RESTRICT).
 */
const EXPECTED_DB_REASONS = [
    "UNIQUE constraint failed: timeline_assignments.transition_id, timeline_assignments.slot_index",
    "UNIQUE constraint failed: timeline_assignments.transition_id, timeline_assignments.marcher_id",
    "CHECK constraint failed: timeline_assignments_slot_index_check",
    "CHECK constraint failed: timeline_assignments_range_check",
    "CHECK constraint failed: timeline_transitions_range_check",
];
const expectedDbRejection = (reason: string, invalid?: InvalidName) =>
    EXPECTED_DB_REASONS.some((r) => reason === `E-DB (${r})`) ||
    (reason === "E-DB (FOREIGN KEY constraint failed)" &&
        invalid === "E-DB shape in use");

const count = <K extends string>(
    counts: Partial<Record<K, number>>,
    key: K,
) => {
    counts[key] = (counts[key] ?? 0) + 1;
};

const isRejection = (error: unknown) =>
    error instanceof TimelineWriteError ||
    error instanceof TimelineCommitViolationError;

async function runSeed(
    db: DbConnection,
    seed: number,
    { v06, stats }: { v06: boolean; stats: Stats },
) {
    const rand = makeRand(seed * 7919);
    const { R, ri, pick, pt } = rand;
    const sample = mulberry32(seed * 104_729 + 1);
    const tags: EditTags = { rangeEdit: false, switched: false };
    const gen = makeGenerators(rand, v06, tags);

    /** One edit through the wrapper; resolves to the error if the edit was rejected. */
    const tryEdit = async (ops: Op[]) => {
        try {
            await transactionWithHistory(db, "fuzz", async (tx) => {
                let wrote = false;
                for (const op of ops) wrote = (await op(tx)) || wrote;
                if (!wrote) throw new NothingToDo();
            });
            return null;
        } catch (error) {
            return error;
        }
    };

    // ---- The show: built through the db-functions, then made the start of history ----
    await transactionWithHistory(db, "setup", async (tx) => {
        for (let m = ri(4, 7); m > 0; m--) await addMarcher(tx, pt());
        await createTimelinesInTransaction({
            newTimelines: [
                { name: "show", startBeat: 0, endBeat: SHOW_END },
                { name: "inner", startBeat: 4, endBeat: SHOW_END - 4 },
            ],
            tx,
        });
        await createTimelineShapesInTransaction({
            // At least one block, which the E-T3/E-T4 invalid change needs
            newShapes: [
                ...Array.from({ length: 5 }, gen.shape),
                {
                    kind: "block",
                    geometry: {
                        origin: pt(),
                        rows: 2,
                        cols: 2,
                        spacing: [1, 1],
                    },
                },
            ],
            tx,
        });
    });
    for (let i = ri(6, 10); i > 0; i--)
        await tryEdit([R() < 0.3 ? gen.addIndividual : gen.addShaped]);
    for (let i = 0; i < 50; i++) await tryEdit([gen.addAssignment()]);
    await db.run(sql.raw("DELETE FROM history_undo"));
    await db.run(sql.raw("DELETE FROM history_redo"));
    await db
        .update(schema.history_stats)
        .set({ group_limit: GROUP_LIMIT, cur_undo_group: 1, cur_redo_group: 1 })
        .run();

    if (v06) {
        // Spec Appendix G: the v0.6 trigger rewrites rows, and replaces the pure range check.
        // SQLite fires the newest trigger first, so recreate the history triggers after it
        // (as QA-UNDO-1 does).
        await db.run(sql.raw("DROP TRIGGER timeline_tr_range_check"));
        await db.run(sql.raw(V06_ANCHOR));
        await dropUndoTriggers(db, "timeline_transitions");
        await createUndoTriggers(db, "timeline_transitions");
    }

    // ---- The resolver host, fed only by delivered batches ----
    const host: TimelineHost = createTimelineHost(await readTimelineTables(db));
    let delivered = 0;
    let lastBatch: ChangeBatch | null = null;
    const listenerErrors: string[] = [];
    const unsubscribe = subscribeTimelineChanges((event) => {
        if (event.kind === "reset") {
            listenerErrors.push("unexpected reset event");
            return;
        }
        delivered++;
        lastBatch = event.batch;
        try {
            applyTimelineBatch(host, event.batch);
        } catch (error) {
            listenerErrors.push(String((error as Error)?.stack ?? error));
        }
    });

    const undoSnaps: string[] = [];
    const redoSnaps: string[] = [];
    /** The next invalid change to try */
    const invalidTurn = { next: ri(0, gen.invalid.length - 1) };
    let step = 0;
    const where = (what: string) => `seed ${seed}, step ${step}, ${what}`;

    const checkStacks = async (what: string) => {
        const [u, r] = [
            await groupCount(db, "undo"),
            await groupCount(db, "redo"),
        ];
        if (u !== undoSnaps.length || r !== redoSnaps.length)
            throw new FuzzFailure(
                "history",
                where(
                    `${what}: stacks hold ${u} undo and ${r} redo groups, expected ${undoSnaps.length} and ${redoSnaps.length}`,
                ),
            );
    };

    /** After any commit: the host, fed only by batches, must match the tables and the oracle. */
    const verify = async (
        what: string,
        deliveredBefore: number,
        loggedBefore: string,
    ) => {
        stats.verifications++;
        // Exactly one batch when the commit changed logged data. A commit that changed none (a
        // timeline edit, or one that wrote the values already there, such as the path style a
        // transition has) may still deliver one, as its UPDATE fired the log triggers, but then
        // every change must be a no-op.
        const batches = delivered - deliveredBefore;
        const changed = (await dumpLogged(db)) !== loggedBefore;
        if (
            changed
                ? batches !== 1
                : batches > 1 || (batches === 1 && !isNetNoOp(lastBatch!))
        )
            throw new FuzzFailure(
                "batch",
                where(
                    `${what} ${changed ? "changed" : "did not change"} logged data and delivered ${batches} batches${batches ? `; last batch ${JSON.stringify(lastBatch)}` : ""}`,
                ),
            );
        if (!changed && batches === 1) stats.noOpBatches++;
        if (listenerErrors.length)
            throw new FuzzFailure(
                "listener",
                where(`${what}: ${listenerErrors.join("\n")}`),
            );
        const fresh = await readTimelineTables(db);
        const mirror = host.snapshot;
        for (const key of ["marchers", "shapes", "transitions"] as const)
            if (!isDeepStrictEqual(mirror[key], fresh.snapshot[key]))
                throw new FuzzFailure(
                    "mirror",
                    where(
                        `${what}: the host's ${key} differ from the tables\nhost:   ${JSON.stringify(mirror[key])}\ntables: ${JSON.stringify(fresh.snapshot[key])}`,
                    ),
                );
        const { resolver } = host;
        if (!resolver.checkCacheClosure())
            throw new FuzzFailure(
                "closure",
                where(`${what}: checkCacheClosure() is false`),
            );
        const cold = createResolver(fresh.snapshot);
        const oracle = createTimelineOracleForTesting(fresh.snapshot);
        const ids = cold.marcherIds();
        if (!isDeepStrictEqual([...resolver.marcherIds()], [...ids]))
            throw new FuzzFailure(
                "divergence",
                where(
                    `${what}: marcher ids ${JSON.stringify(resolver.marcherIds())}, cold ${JSON.stringify(ids)}`,
                ),
            );
        stats.maxAssignments = Math.max(
            stats.maxAssignments,
            fresh.snapshot.assignments.length,
        );
        stats.maxTransitions = Math.max(
            stats.maxTransitions,
            Object.keys(fresh.snapshot.transitions).length,
        );
        for (const m of ids)
            for (let b = -1; b <= SHOW_END + 2; b += 0.5) {
                // As e2e.mjs: sometimes every beat, sometimes a quarter of them
                if (sample() > (sample() < 0.4 ? 0.25 : 1)) continue;
                stats.positionsCompared++;
                const x = resolver.positionAt(m, b);
                const c = cold.positionAt(m, b);
                const o = oracle.positionAt(m, b);
                const close = (p: XY, q: XY) =>
                    Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
                if (!close(x, c) || !close(x, o))
                    throw new FuzzFailure(
                        "divergence",
                        where(
                            `${what}: marcher ${m} at beat ${b}: incremental ${JSON.stringify(x)}, cold ${JSON.stringify(c)}, oracle ${JSON.stringify(o)}; last batch ${JSON.stringify(lastBatch)}`,
                        ),
                    );
            }
    };

    const historyStep = async (isUndo: boolean) => {
        const name = isUndo ? "undo" : "redo";
        const [from, to] = isUndo
            ? [undoSnaps, redoSnaps]
            : [redoSnaps, undoSnaps];
        const before = await dumpData(db);
        const loggedBefore = await dumpLogged(db);
        const expected = from.at(-1);
        const deliveredBefore = delivered;
        const response = isUndo ? await performUndo(db) : await performRedo(db);
        if (!response.success)
            throw new FuzzFailure(
                isUndo ? "undo-rejected" : "redo-rejected",
                where(`${name}: ${response.error?.message}`),
            );
        if (response.sqlStatements.length === 0) {
            stats[isUndo ? "undoEmpty" : "redoEmpty"]++;
            if (expected !== undefined)
                throw new FuzzFailure(
                    "empty-but-expected",
                    where(`${name} did nothing, but its stack was not empty`),
                );
            if (
                (await dumpData(db)) !== before ||
                delivered !== deliveredBefore
            )
                throw new FuzzFailure(
                    "snapshot",
                    where(`${name} on an empty stack changed something`),
                );
            await checkStacks(name);
            return false;
        }
        if (expected === undefined)
            throw new FuzzFailure(
                "unexpected-history-action",
                where(`${name} replayed a group the model does not have`),
            );
        stats[isUndo ? "undos" : "redos"]++;
        from.pop();
        to.push(before);
        const after = await dumpData(db);
        if (after !== expected)
            throw new FuzzFailure(
                "snapshot",
                where(
                    `${name} did not restore the snapshot: ${firstDifference(expected, after)}`,
                ),
            );
        await checkStacks(name);
        await verify(name, deliveredBefore, loggedBefore);
        return true;
    };

    try {
        for (step = 0; step < STEPS; step++) {
            stats.steps++;
            const u = R();
            if (u < 0.14 || (u < 0.28 && redoSnaps.length) || u > 0.98) {
                // Undo or redo; sometimes a burst, sometimes on an empty stack
                const isUndo = u < 0.14;
                const n = R() < 0.3 ? ri(2, 5) : 1;
                if (n > 1) stats[isUndo ? "undoBursts" : "redoBursts"]++;
                for (let k = 0; k < n; k++) {
                    let replayed: boolean;
                    try {
                        replayed = await historyStep(isUndo);
                    } catch (error) {
                        if (error instanceof FuzzFailure)
                            error.inHistoryStep = true;
                        throw error;
                    }
                    if (!replayed) break;
                }
                continue;
            }

            const chosen: NamedOp<OpName>[] = [];
            for (let i = R() < 0.7 ? 1 : ri(2, 3); i > 0; i--)
                chosen.push(pick(gen.ops));
            /** The generators that wrote something in this edit */
            const wrote = new Set<OpName>();
            const ops: Op[] = chosen.map(({ name, run }) => async (tx) => {
                const changed = await run(tx);
                if (changed) wrote.add(name);
                return changed;
            });
            // The invalid changes take turns, from a random start, so a short run applies each
            const invalid =
                R() < 0.25
                    ? gen.invalid[invalidTurn.next % gen.invalid.length]
                    : undefined;
            // Applied: the invalid change was made (true) or refused on the spot (it threw)
            let invalidApplied = false;
            if (invalid)
                ops.push(async (tx) => {
                    // Its turn is used once it runs (an earlier change can reject the edit first)
                    invalidTurn.next++;
                    try {
                        invalidApplied = await invalid.run(tx);
                    } catch (error) {
                        invalidApplied = true;
                        throw error;
                    }
                    return invalidApplied;
                });

            tags.rangeEdit = false;
            tags.switched = false;
            const beforeData = await dumpData(db);
            const loggedBefore = await dumpLogged(db);
            const beforeHistory = await dumpHistory(db);
            const deliveredBefore = delivered;
            const error = await tryEdit(ops);

            if (error !== null) {
                if (!(error instanceof NothingToDo) && !isRejection(error))
                    throw new FuzzFailure(
                        "unexpected-error",
                        where(
                            `the edit failed with a non-timeline error: ${String((error as Error)?.stack ?? error)}`,
                        ),
                    );
                if (error instanceof NothingToDo) stats.skipped++;
                else {
                    stats.rejected++;
                    if (invalidApplied) {
                        stats.invalidAttempts++;
                        count(stats.invalidApplied, invalid!.name);
                    }
                    const reason = rejectReason(error);
                    if (
                        reason.startsWith("E-DB") &&
                        !expectedDbRejection(
                            reason,
                            invalidApplied ? invalid!.name : undefined,
                        )
                    )
                        throw new FuzzFailure(
                            "unexpected-error",
                            where(
                                `the edit was rejected with an unexpected database error: ${reason}\n${String((error as Error)?.stack ?? error)}`,
                            ),
                        );
                    stats.rejectReasons[reason] =
                        (stats.rejectReasons[reason] ?? 0) + 1;
                }
                if (
                    (await dumpData(db)) !== beforeData ||
                    (await dumpHistory(db)) !== beforeHistory ||
                    delivered !== deliveredBefore
                )
                    throw new FuzzFailure(
                        "rejected-edit-changed-data",
                        where(
                            `a rejected edit (${String(error)}) changed the data or history, or delivered a batch`,
                        ),
                    );
                continue;
            }

            if (invalidApplied)
                throw new FuzzFailure(
                    "invalid-edit-committed",
                    where(
                        "an edit with a deliberately invalid change committed",
                    ),
                );
            stats.commits++;
            for (const name of wrote) count(stats.opCommits, name);
            if (undoSnaps.length === GROUP_LIMIT) stats.commitsAtLimit++;
            if (tags.rangeEdit) stats.rangeEditCommits++;
            if (tags.switched) stats.switchCommits++;
            if (
                delivered > deliveredBefore &&
                lastBatch!.changes.some((c) => c.table === "slot_destinations")
            )
                stats.individualCommits++;
            redoSnaps.length = 0;
            undoSnaps.push(beforeData);
            if (undoSnaps.length > GROUP_LIMIT) undoSnaps.shift();
            await checkStacks("edit");
            await verify("edit", deliveredBefore, loggedBefore);
        }
    } finally {
        unsubscribe();
    }
    stats.seeds++;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const seeds = Array.from({ length: SEEDS }, (_, i) => FIRST_SEED + i);

describeDbTests(
    "timeline end-to-end fuzz (P4.9, QA-INV-09, QA-UNDO-9)",
    (it) => {
        const stats = newStats();
        const v06 = {
            tried: 0,
            brokeAt: null as null | { seed: number; failure: string },
        };

        // The drizzle test logger and the write wrapper log every statement; thousands per seed
        beforeEach(() => {
            for (const level of [
                "log",
                "info",
                "debug",
                "warn",
                "error",
            ] as const)
                vi.spyOn(console, level).mockImplementation(() => {});
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });
        afterAll(() => {
            if (REPORT)
                writeFileSync(
                    REPORT,
                    JSON.stringify(
                        { SEEDS, FIRST_SEED, STEPS, stats, v06 },
                        null,
                        1,
                    ),
                );
        });

        it.for(seeds)(
            "seed %i: edits, rejected edits, undo and redo keep the resolver and the snapshots exact",
            { timeout: TIMEOUT },
            async (seed, { db }) => {
                await runSeed(db, seed, { v06: false, stats });
            },
        );

        // So a generator change can't silently stop exercising something. Skipped unless every
        // seed ran and passed (a `-t` filter, a failed seed) or the run is shorter than the default.
        it("the run exercised every kind of step", ({ skip }) => {
            // Fewer total steps than the default (5 seeds x 80) can't reach every kind
            if (SEEDS * STEPS < 5 * 80 || stats.seeds < SEEDS) skip();
            const counts = {
                commits: stats.commits,
                rejected: stats.rejected,
                invalidAttempts: stats.invalidAttempts,
                undos: stats.undos,
                redos: stats.redos,
                undoBursts: stats.undoBursts,
                redoBursts: stats.redoBursts,
                undoEmpty: stats.undoEmpty,
                redoEmpty: stats.redoEmpty,
                rangeEditCommits: stats.rangeEditCommits,
                individualCommits: stats.individualCommits,
                switchCommits: stats.switchCommits,
                commitsAtLimit: stats.commitsAtLimit,
            };
            const missing = [
                ...Object.entries(counts)
                    .filter(([, n]) => n === 0)
                    .map(([name]) => name),
                ...OP_NAMES.filter((name) => !stats.opCommits[name]).map(
                    (name) => `generator "${name}"`,
                ),
                ...INVALID_NAMES.filter(
                    (name) => !stats.invalidApplied[name],
                ).map((name) => `invalid change "${name}"`),
            ];
            expect(missing, "never exercised").toEqual([]);
        });

        // Negative control: each seed runs until undo breaks; later seeds are skipped once one has
        const v06Seeds = Array.from({ length: V06_SEEDS }, (_, i) => i + 1);
        it.for(v06Seeds)(
            "negative control, seed %i: the v0.6 range trigger breaks undo",
            { timeout: TIMEOUT },
            async (seed, { db, skip }) => {
                if (v06.brokeAt) skip();
                v06.tried++;
                try {
                    await runSeed(db, seed, { v06: true, stats: newStats() });
                } catch (error) {
                    // Only an undo or redo step counts; an edit's failure is a bug in the test
                    if (!(error instanceof FuzzFailure) || !error.inHistoryStep)
                        throw error;
                    // How undo breaks: rejected, not restoring the snapshot, or leaving stacks
                    // that no longer match the history. The last is the usual one: the replay's
                    // UPDATE re-fires the v0.6 trigger, which rewrites assignment rows the
                    // replayed group never logged. Their triggers are still in undo mode (only
                    // the group's tables are switched), so the rewrite lands on the undo stack
                    // and clears the redo stack.
                    if (
                        ![
                            "undo-rejected",
                            "redo-rejected",
                            "snapshot",
                            "history",
                            "empty-but-expected",
                            "unexpected-history-action",
                        ].includes(error.kind)
                    )
                        throw error;
                    v06.brokeAt = { seed, failure: error.message };
                }
            },
        );

        it("negative control: undo broke on at least one seed", () => {
            if (V06_SEEDS === 0) return;
            expect(
                v06.brokeAt,
                `undo never broke in ${v06.tried} seeds with the v0.6 trigger`,
            ).not.toBeNull();
        });
    },
);
