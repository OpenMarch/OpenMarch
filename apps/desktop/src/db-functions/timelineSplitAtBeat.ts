import { asc, eq, inArray } from "drizzle-orm";
import {
    createResolver,
    type PathParams,
    type Resolver,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { beatWhere, countsText, moveName } from "@/timeline/timelineRangeWords";
import { text, timelineTextForLog } from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse } from "./timelineErrors";
import {
    createRangeTimelineInTransaction,
    nextMoveNameInTransaction,
    readMoveWords,
} from "./timelineMoveNames";
import { findTimelineByRange, type DatabaseTimeline } from "./timelines";
import {
    createTimelineTransitionsInTransaction,
    deleteTimelineTransitionRowsInTransaction,
    type DatabaseTimelineTransition,
} from "./timelineTransitionsInTransaction";
import {
    createTimelineAssignmentsInTransaction,
    type DatabaseTimelineAssignment,
} from "./timelineAssignments";

/**
 * **Split at playhead** (docs/timeline/ui.md UI-27): one move becomes two that meet at a count,
 * with every marcher where it was at that count. The split is in time, not by marcher: the
 * move's whole membership is in both halves.
 *
 * For a move (a timeline, C-11) over `[s, e)` and a whole count `s < beat < e`:
 *
 * - The move keeps its id, name, transitions and destinations, and now runs over `[beat, e)`:
 *   it is the half that still arrives where the move did. Its rows that crossed `beat` now start
 *   there; rows that ended at or before `beat` leave it, and a transition nobody takes any more
 *   goes with them.
 * - A new move ("Move N", or unnamed over a page's box) runs over `[s, beat)`. Each transition of
 *   the original gets a shapeless counterpart there, direct or an arc of the original's circle,
 *   whose destinations are the resolver's positions at `beat`, one slot per marcher in it, and the rows that started before `beat`
 *   (cut at `beat` where they crossed it), on their own layers.
 * - A row that another move on a higher layer cuts into several visible pieces before `beat`
 *   (spec R-2) keeps only its last piece in that counterpart. Each earlier piece starts from
 *   where the other move left the marcher, so it heads somewhere else: it gets a row of its own,
 *   over just that piece, in one more shapeless transition of the new move (direct, or an arc of
 *   the original's circle) (a transition
 *   holds one row per marcher, so the k-th earlier pieces of a transition's rows share one).
 *
 * **Motion is unchanged for direct paths.** A direct span is a straight line at a constant speed
 * per beat over its progress (spec R-5, R-7), so the first half reaching the sampled point over
 * its own counts, and the second starting from it, trace what the whole did:
 * `lerp(A, lerp(A, B, p), b/p) = lerp(A, B, b)`. A row hidden at `beat` by another move on a
 * higher layer, or ending before it, and each earlier piece get the point their own span would
 * have reached (`extrapolateAlongChord`), which is exact too.
 *
 * **An arc keeps its curve before `beat`** (#591, holds decision 16). R-8 moves a marcher along a
 * minor circular arc at a constant angular speed, so the part a fraction `q` of the way along is
 * an arc of the same circle, from the same origin, at the same speed: its half-angle at the centre
 * is `q` times the whole's, so its bulge is `tan(q * atan(2k)) / 2` (`partArcBulge`), never more
 * than the whole's. Each counterpart row gets that bulge, so the first half traces every count the
 * whole did. A transition holds one bulge, and `q` depends on where a row's span starts, so rows
 * with different starts go into transitions of their own. From `beat` the transition keeps its
 * style and bulge but starts again from there, so a curved row that shows across `beat` follows
 * a new curve after it; those marchers are listed in `motionChanged` from `beat`, for the toast.
 *
 * **Follow the leader is sampled** (project owner, 2026-10-19: pathways will be redone). Before
 * `beat` its marchers go straight to where they were; from `beat` the transition keeps its style
 * and parameters but starts again from there, so the path after `beat` changes too. Those
 * marchers are listed in `motionChanged` from the count their path changes, for the toast.
 *
 * Refused (`E-ARGS`) before any write: a beat that isn't whole or strictly inside the move, a
 * move that already runs over either half (one timeline per range, C-12: only a move split off
 * by marchers shares one, UI-25; and a half landing on a page's box with a timeline would take
 * over the page's move, `pageMoveTakenOver`), and a move with no row before or none after the
 * beat (the halves would be empty).
 */

export interface MotionChange {
    marcherId: number;
    /** The first count whose position differs from before the split */
    fromBeat: number;
}

/**
 * Which half keeps the split move's id (and its name): the half after the beat by default. A holds
 * cut (`timelineMoveCuts`) gives it to the half before when the half after would take over the
 * move of a later page box (a page's own move is the oldest over its box), and to neither, the
 * original going, when both halves would.
 */
export type SplitIdKeeper = "after" | "before" | "neither";

export interface SplitTimelineResult {
    /** The half over `[start, beat)`: a new move, unless `idStaysWith` is `"before"` */
    before: DatabaseTimeline;
    /** The half over `[beat, end)`: the original move, unless `idStaysWith` says otherwise */
    after: DatabaseTimeline;
    /** Marchers whose motion isn't what it was, sorted by id */
    motionChanged: MotionChange[];
}

/**
 * A first-half row: the row it comes from, the counts it covers, the point it heads for, and the
 * bulge of the arc it takes there (`null`: a straight line).
 */
interface FirstHalfRow {
    row: DatabaseTimelineAssignment;
    start: number;
    end: number;
    point: XY;
    bulge: number | null;
}

/** A row's part of the first half: one row in the counterpart, and one per earlier piece. */
interface FirstHalfOf {
    main: FirstHalfRow;
    /** Earlier visible pieces, in order: the k-th goes to the transition's k-th extra transition */
    earlier: FirstHalfRow[];
}

type Row = DatabaseTimelineAssignment;

/**
 * Where a straight move from `origin` that reaches `at` after a fraction `reached` of its counts
 * would be after a fraction `wanted` of them: `wanted / reached` of the way from `origin` to
 * `at`. Returns `at` when `reached` is 0 (nothing to extrapolate from).
 */
export function extrapolateAlongChord(
    origin: XY,
    at: XY,
    reached: number,
    wanted: number,
): XY {
    if (!(reached > 0)) return at;
    const t = wanted / reached;
    return [
        origin[0] + (at[0] - origin[0]) * t,
        origin[1] + (at[1] - origin[1]) * t,
    ];
}

/**
 * The bulge (R-8: signed sagitta / chord) of the part of an arc of `bulge` that ends a fraction
 * `part` of the way along it, from the same start at the same angular speed: the same circle, its
 * half-angle at the centre (`2 * atan(2 * bulge)`) scaled by `part`. Never larger than `bulge`.
 */
export function partArcBulge(bulge: number, part: number): number {
    return Math.tan(part * Math.atan(2 * bulge)) / 2;
}

/**
 * Where an arc of `bulge` from `origin`, which reaches `at` after a fraction `reached` of its
 * counts, would be after a fraction `wanted` of them, going on round the same circle at the same
 * angular speed. With a bulge of 0 this is `extrapolateAlongChord`. Returns `at` when `reached` is
 * 0 (nothing to extrapolate from).
 */
export function extrapolateAlongArc(
    origin: XY,
    at: XY,
    reached: number,
    wanted: number,
    bulge: number,
): XY {
    if (!(reached > 0)) return at;
    const dx = at[0] - origin[0];
    const dy = at[1] - origin[1];
    const c = Math.hypot(dx, dy);
    // The arc from `origin` to `at`, whose half-angle is `reached` times the whole's
    const phi = reached * 2 * Math.atan(2 * bulge);
    if (c < 1e-9 || Math.abs(phi) < 1e-12)
        return extrapolateAlongChord(origin, at, reached, wanted);
    // R-8's arcPoint over that arc, not clamped to it, at `wanted / reached` of the way
    const p = wanted / reached;
    const h = c / 2;
    const sinPhi = Math.sin(phi);
    const along = (h * Math.sin(phi * (2 * p - 1))) / sinPhi;
    const normal =
        (2 * h * Math.sin(phi * p) * Math.sin(phi * (1 - p))) / sinPhi;
    const ux = dx / c;
    const uy = dy / c;
    const mx = (origin[0] + at[0]) / 2;
    const my = (origin[1] + at[1]) / 2;
    return [mx + ux * along - uy * normal, my + uy * along + ux * normal];
}

/**
 * Splits timeline `timelineId` at `beat` as one undoable edit. See the module comment.
 */
export async function splitTimelineAtBeat({
    db,
    timelineId,
    beat,
}: {
    db: DbConnection;
    timelineId: number;
    beat: number;
}): Promise<SplitTimelineResult> {
    return await transactionWithHistory(db, "splitTimelineAtBeat", (tx) =>
        splitTimelineAtBeatInTransaction({ tx, timelineId, beat }),
    );
}

/**
 * The split inside a caller's edit. With `allowSharedRanges` (a holds cut, `timelineMoveCuts`), a
 * half may land on a range another move already has (C-12 relaxed as for a split by marcher,
 * UI-25); a new half is then numbered, so it never takes over a page's move. `idStaysWith` picks
 * the half that keeps the move's id (`SplitIdKeeper`); the transitions after the beat, and any
 * shape recipe (#363, which describes where they arrive), stay with the half after the beat
 * whichever id it has.
 */
export async function splitTimelineAtBeatInTransaction({
    tx,
    timelineId,
    beat,
    allowSharedRanges = false,
    idStaysWith = "after",
}: {
    tx: DbTransaction;
    timelineId: number;
    beat: number;
    allowSharedRanges?: boolean;
    idStaysWith?: SplitIdKeeper;
}): Promise<SplitTimelineResult> {
    const L = schema.timelines;
    const timeline = await tx
        .select()
        .from(L)
        .where(eq(L.id, timelineId))
        .get();
    if (!timeline) refuse(`timeline ${timelineId} does not exist`);
    const { transitions, rows } = await refuseUnlessSplitAllowed(
        tx,
        timeline,
        beat,
        allowSharedRanges,
    );

    // Where everyone is, from the rows as they are now: read before anything is written
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const changed = new Map<number, number>();
    const noteChange = (marcherId: number, fromBeat: number) => {
        const known = changed.get(marcherId);
        if (known === undefined || fromBeat < known)
            changed.set(marcherId, fromBeat);
    };

    const plans: TransitionPlan[] = transitions.map((t) => {
        const own = rows.filter((r) => r.transition_id === t.id);
        const halves = own
            .filter((r) => r.start_beat < beat)
            .map((row) => firstHalfOf(resolver, t, row, beat, noteChange));
        const extras = Math.max(0, ...halves.map((h) => h.earlier.length));
        return {
            t,
            first: halves.map((h) => h.main),
            earlier: Array.from({ length: extras }, (_, k) =>
                halves.flatMap((h) => (h.earlier[k] ? [h.earlier[k]] : [])),
            ),
            anyAfter: own.some((r) => r.end_beat > beat),
        };
    });

    return await mapDbErrors(() =>
        writeSplit({
            tx,
            timeline,
            beat,
            rows,
            plans,
            changed,
            allowSharedRanges,
            idStaysWith,
        }),
    );
}

/** One transition's part of a split: its first-half rows, and whether anyone stays after. */
interface TransitionPlan {
    t: DatabaseTimelineTransition;
    /** The counterpart's rows */
    first: FirstHalfRow[];
    /** The rows of each extra transition, for pieces cut off by a higher layer */
    earlier: FirstHalfRow[][];
    anyAfter: boolean;
}

/**
 * The writes of a split, in the order the triggers want: rows inside their transition, and
 * transitions inside their timeline, at every step.
 */
async function writeSplit({
    tx,
    timeline,
    beat,
    rows,
    plans,
    changed,
    allowSharedRanges,
    idStaysWith,
}: {
    tx: DbTransaction;
    timeline: DatabaseTimeline;
    beat: number;
    rows: readonly Row[];
    plans: readonly TransitionPlan[];
    changed: ReadonlyMap<number, number>;
    allowSharedRanges: boolean;
    idStaysWith: SplitIdKeeper;
}): Promise<SplitTimelineResult> {
    const timelineId = timeline.id;
    const s0 = timeline.start_beat;
    const L = schema.timelines;
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    // 1. Rows ending at or before the beat leave the original; rows crossing it now start there
    const leaving = rows.filter((r) => r.end_beat <= beat).map((r) => r.id);
    if (leaving.length > 0) await tx.delete(A).where(inArray(A.id, leaving));
    const crossing = rows
        .filter((r) => r.start_beat < beat && beat < r.end_beat)
        .map((r) => r.id);
    if (crossing.length > 0)
        await tx
            .update(A)
            .set({ start_beat: beat })
            .where(inArray(A.id, crossing));

    // 2. A transition nobody takes any more goes
    const emptied = new Set(
        plans.filter((p) => !p.anyAfter).map((p) => p.t.id),
    );
    if (emptied.size > 0)
        await deleteTimelineTransitionRowsInTransaction({
            tx,
            transitionIds: emptied,
        });

    // 3. The original's transitions now run from the beat; then the timeline that keeps them
    //    (the triggers want a transition inside its timeline, and no stranded row)
    await tx
        .update(T)
        .set({ start_beat: beat })
        .where(eq(T.timeline_id, timelineId));
    const after =
        idStaysWith === "after"
            ? (await tx
                  .update(L)
                  .set({ start_beat: beat })
                  .where(eq(L.id, timelineId))
                  .returning()
                  .get())!
            : await moveAfterHalfOut(tx, timeline, beat, allowSharedRanges);

    // 4. The half before the beat
    const before =
        idStaysWith === "before"
            ? await keepIdBefore(tx, timeline, beat)
            : await createRangeTimelineInTransaction(tx, {
                  startBeat: s0,
                  endBeat: beat,
                  allowSharedRanges,
              });
    for (const { t, first, earlier } of plans)
        for (const halfRows of [first, ...earlier])
            await writeFirstHalfTransition(tx, { before, t, rows: halfRows });
    // Neither half keeps the id: the original, empty now, goes
    if (idStaysWith === "neither")
        await tx.delete(L).where(eq(L.id, timelineId));

    return {
        before,
        after,
        motionChanged: [...changed]
            .map(([marcherId, fromBeat]) => ({ marcherId, fromBeat }))
            .sort((a, b) => a.marcherId - b.marcherId),
    };
}

/**
 * The move's transitions and rows, once the split is allowed: a whole beat strictly inside the
 * move, neither half taken by another timeline, and someone moving on each side of the beat.
 */
async function refuseUnlessSplitAllowed(
    tx: DbTransaction,
    timeline: DatabaseTimeline,
    beat: number,
    allowSharedRanges: boolean,
): Promise<{ transitions: DatabaseTimelineTransition[]; rows: Row[] }> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const s0 = timeline.start_beat;
    const e0 = timeline.end_beat;
    const words = await readMoveWords(tx);
    const name = moveName({ start: s0, end: e0 }, words.boxes, words.moves);
    const where =
        beatWhere(beat, words.boxes) ?? text.t("timeline.where.beat", { beat });
    if (!Number.isInteger(beat))
        refuse(
            `${timelineTextForLog(name)} can only be split on a whole count, not ${beat}`,
        );
    if (!(s0 < beat && beat < e0))
        refuse(
            text.t("timeline.refusals.splitAt.outside", { where, move: name }),
        );
    for (const half of allowSharedRanges
        ? []
        : [
              { start: s0, end: beat },
              { start: beat, end: e0 },
          ]) {
        if (await findTimelineByRange(tx, half))
            refuse(
                text.t("timeline.refusals.splitAt.halfTaken", {
                    move: moveName(half, words.boxes, words.moves),
                    counts: countsText(half, words.boxes),
                }),
            );
    }

    const transitions = await tx
        .select()
        .from(T)
        .where(eq(T.timeline_id, timeline.id))
        .orderBy(asc(T.id))
        .all();
    const transitionIds = transitions.map((t) => t.id);
    const rows: Row[] =
        transitionIds.length === 0
            ? []
            : await tx
                  .select()
                  .from(A)
                  .where(inArray(A.transition_id, transitionIds))
                  .orderBy(asc(A.id))
                  .all();
    if (!rows.some((r) => r.start_beat < beat))
        refuse(
            text.t("timeline.refusals.splitAt.nothingBefore", {
                move: name,
                where,
            }),
        );
    if (!rows.some((r) => r.end_beat > beat))
        refuse(
            text.t("timeline.refusals.splitAt.nothingAfter", {
                move: name,
                where,
            }),
        );
    return { transitions, rows };
}

/**
 * The half after the beat as a new move (`idStaysWith` isn't `"after"`): a numbered timeline over
 * `[beat, end)` that takes the original's transitions, which already start at the beat, and its
 * shape recipes.
 */
async function moveAfterHalfOut(
    tx: DbTransaction,
    timeline: DatabaseTimeline,
    beat: number,
    allowSharedRanges: boolean,
): Promise<DatabaseTimeline> {
    const after = await createRangeTimelineInTransaction(tx, {
        startBeat: beat,
        endBeat: timeline.end_beat,
        allowSharedRanges,
    });
    await tx
        .update(schema.timeline_transitions)
        .set({ timeline_id: after.id })
        .where(eq(schema.timeline_transitions.timeline_id, timeline.id));
    await tx
        .update(schema.timeline_shape_recipes)
        .set({ timeline_id: after.id })
        .where(eq(schema.timeline_shape_recipes.timeline_id, timeline.id));
    return after;
}

/**
 * The original, empty once its transitions moved out (`moveAfterHalfOut`), as the half before the
 * beat: it keeps its id and name, now over `[start, beat)`. A page box's unnamed move gets a
 * number, since the half isn't a page's box.
 */
async function keepIdBefore(
    tx: DbTransaction,
    timeline: DatabaseTimeline,
    beat: number,
): Promise<DatabaseTimeline> {
    const name = timeline.name ?? (await nextMoveNameInTransaction(tx));
    return (await tx
        .update(schema.timelines)
        .set({ end_beat: beat, name })
        .where(eq(schema.timelines.id, timeline.id))
        .returning()
        .get())!;
}

/**
 * The new move's shapeless transitions for `rows` (at most one per marcher), in slot order: one
 * per bulge among them, so each arc keeps its own (see the module comment), and a direct one for
 * the straight rows.
 */
async function writeFirstHalfTransition(
    tx: DbTransaction,
    {
        before,
        t,
        rows,
    }: {
        before: DatabaseTimeline;
        t: DatabaseTimelineTransition;
        rows: readonly FirstHalfRow[];
    },
): Promise<void> {
    const byBulge = new Map<number | null, FirstHalfRow[]>();
    for (const f of rows) {
        const same = byBulge.get(f.bulge);
        if (same) same.push(f);
        else byBulge.set(f.bulge, [f]);
    }
    for (const [bulge, group] of byBulge) {
        const [created] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: before.id,
                    slotCount: group.length,
                    destination: {
                        kind: "individual",
                        points: group.map((f) => f.point),
                    },
                    pathStyle: bulge === null ? "direct" : "arc",
                    pathParams: bulge === null ? null : { bulge },
                    orderMode: t.order_mode as "inherit" | "slot",
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: group.map((f, slot) => ({
                marcherId: f.row.marcher_id,
                transitionId: created!.id,
                slotIndex: slot,
                startBeat: f.start,
                endBeat: f.end,
                layer: f.row.layer,
            })),
        });
    }
}

/** The visible pieces of `row` (spec R-2: an assignment cut by higher layers), in order. */
const piecesOf = (resolver: Resolver, row: Row) =>
    resolver
        .spanInfos(row.marcher_id)
        .filter((s) => s.assignmentId === row.id)
        .sort((a, b) => a.start - b.start);

/**
 * Where `row` heads in the first half. Its last visible piece before `beat` heads for the
 * marcher's position at `beat` when the row is what shows there, else the point its span would
 * have reached by `beat`. Each earlier piece (cut off by a higher layer) gets a row of its own over
 * just that piece, heading for the point its span would have reached by `beat`. On a direct or arc
 * path each keeps the motion it had: a direct one is a straight line (`extrapolateAlongChord`), an
 * arc a part of its arc (`partArcBulge`, `extrapolateAlongArc`). An arc row that shows across `beat`
 * is noted as changed from `beat`, where its rest starts a new curve. Rows following the leader go
 * straight and are noted as changed from their first piece.
 */
function firstHalfOf(
    resolver: Resolver,
    t: DatabaseTimelineTransition,
    row: Row,
    beat: number,
    noteChange: (marcherId: number, fromBeat: number) => void,
): FirstHalfOf {
    const m = row.marcher_id;
    const end = Math.min(row.end_beat, beat);
    const arc = t.path_style === "arc";
    const params =
        arc && t.path_params !== null
            ? (JSON.parse(t.path_params) as PathParams)
            : null;
    const bulge = params?.bulge ?? 0;
    /** The fraction of the transition's counts from `start` that `beat` is */
    const partBy = (start: number) => (beat - start) / (t.end_beat - start);
    /**
     * The bulge of a first-half row whose span starts at `start`, `null` for a straight line (an
     * arc of bulge 0 too, so the first half stays direct and Basic can edit it, as before #591)
     */
    const bulgeFrom = (start: number) =>
        arc && bulge !== 0 ? partArcBulge(bulge, partBy(start)) : null;
    const pieces = piecesOf(resolver, row).filter((p) => p.start < beat);
    const last = pieces[pieces.length - 1];
    // Hidden by another move until the beat or later: it never shows in the first half
    if (!last)
        return {
            main: {
                row,
                start: row.start_beat,
                end,
                point: resolver.positionAt(m, beat),
                bulge: bulgeFrom(row.start_beat),
            },
            earlier: [],
        };
    if (t.path_style === "follow_the_leader") noteChange(m, pieces[0]!.start);
    else if (arc && bulge !== 0 && last.end > beat) noteChange(m, beat);
    /** Where piece `p`'s span would be at `beat`, on its own path */
    const reachedBy = (p: { start: number; end: number }) =>
        extrapolateAlongArc(
            resolver.explain(m, p.start).origin,
            resolver.positionAt(m, p.end),
            (p.end - p.start) / (t.end_beat - p.start),
            partBy(p.start),
            bulge,
        );
    const earlier = pieces.slice(0, -1).map((p) => ({
        row,
        start: p.start,
        end: p.end,
        point: reachedBy(p),
        bulge: bulgeFrom(p.start),
    }));
    // With earlier pieces of its own, the row's main part starts at its last piece
    const start = earlier.length > 0 ? last.start : row.start_beat;
    const point =
        beat <= last.end ? resolver.positionAt(m, beat) : reachedBy(last);
    // Its span starts where its last piece shows, even when the row starts hidden
    return {
        main: { row, start, end, point, bulge: bulgeFrom(last.start) },
        earlier,
    };
}
