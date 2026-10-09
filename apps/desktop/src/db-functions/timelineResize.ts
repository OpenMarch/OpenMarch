import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { refuse } from "./timelineErrors";
import { setTimelineRangeInTransaction } from "./timelineTransitionsInTransaction";

/**
 * Resizing a move: dragging a clip's start or end edge changes its timeline's range
 * (docs/timeline/research/resize-move). Destinations are absolute (D-5) and progress runs to the
 * transition's end (R-5), so a resize stretches the move: the set stays at the end and the path
 * is re-timed. The write is the R-E1 procedure (`setTimelineRangeInTransaction`); this module
 * adds the limits a drag stops at, so the procedure never meets a row it would reject.
 */

/** The largest beat a row may hold (spec I-N2). */
const MAX_BEAT = 2147483647;

/** Why an edge can't go further. */
export type TimelineResizeStop =
    /** The edge reached the show's start or the largest beat */
    | { readonly kind: "show" }
    /** The move would be shorter than one beat */
    | { readonly kind: "minimum" }
    /**
     * Another move on the same marchers, at the same or a higher layer, starts or ends here
     * (resize-move E3, E5): growing over it would collide (E-A3) or be cut short by it (R-2)
     */
    | {
          readonly kind: "move";
          readonly timelineId: number;
          readonly start: number;
          readonly end: number;
      }
    /** A marcher joins or leaves this move partway, here (resize-move E7) */
    | { readonly kind: "member"; readonly beat: number };

export interface TimelineResizeBound {
    readonly beat: number;
    readonly stop: TimelineResizeStop;
}

/** How far each edge of a timeline can be dragged, in spec beats, with why it stops there. */
export interface TimelineResizeLimits {
    readonly timelineId: number;
    readonly start: number;
    readonly end: number;
    /** The start edge: `min.beat ≤ start′ ≤ max.beat` (with the end where it is) */
    readonly startEdge: {
        readonly min: TimelineResizeBound;
        readonly max: TimelineResizeBound;
    };
    /** The end edge: `min.beat ≤ end′ ≤ max.beat` (with the start where it is) */
    readonly endEdge: {
        readonly min: TimelineResizeBound;
        readonly max: TimelineResizeBound;
    };
    /** Other stored timelines' ranges; a resize can't land on one (C-12, resize-move E8) */
    readonly taken: readonly {
        readonly timelineId: number;
        readonly start: number;
        readonly end: number;
    }[];
}

/** An assignment row, as the limits read it. */
export interface ResizeRow {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
    readonly layer: number;
}

/** A row of the same marchers in another timeline. */
export interface ResizeOtherRow extends ResizeRow {
    readonly timelineId: number;
}

const tighter = (
    current: TimelineResizeBound,
    beat: number,
    stop: TimelineResizeStop,
    lower: boolean,
): TimelineResizeBound =>
    (lower ? beat > current.beat : beat < current.beat)
        ? { beat, stop }
        : current;

/**
 * The limits for resizing the timeline `[start, end)` whose assignment rows are `own`, given the
 * same marchers' rows in other timelines (`others`) and every other timeline's range (`taken`).
 * Pure; `readTimelineResizeLimits` reads its inputs.
 *
 * - **Start edge.** It stays before the end (one beat minimum) and can't pass a row that starts
 *   later than the move (E7), or empty a row anchored at the start that ends early. Growing
 *   earlier, it stops at the end of another row of a moved marcher at the same or a higher layer
 *   (E5). Rows at lower layers are grown over: the move overrides them (E4).
 * - **End edge.** The mirror image, stopping at the start of such a row (E3).
 *
 * Rows that already overlap the move never limit it (E6): only rows wholly on the far side of the
 * edge do.
 */
export function timelineResizeLimits({
    timelineId,
    start,
    end,
    own,
    others,
    taken,
}: {
    timelineId: number;
    start: number;
    end: number;
    own: readonly ResizeRow[];
    others: readonly ResizeOtherRow[];
    taken: TimelineResizeLimits["taken"];
}): TimelineResizeLimits {
    const ranges = new Map(taken.map((t) => [t.timelineId, t]));
    const moveStop = (o: ResizeOtherRow): TimelineResizeStop => {
        const range = ranges.get(o.timelineId);
        return {
            kind: "move",
            timelineId: o.timelineId,
            start: range?.start ?? o.start,
            end: range?.end ?? o.end,
        };
    };
    let startMin: TimelineResizeBound = { beat: 0, stop: { kind: "show" } };
    let startMax: TimelineResizeBound = {
        beat: end - 1,
        stop: { kind: "minimum" },
    };
    let endMin: TimelineResizeBound = {
        beat: start + 1,
        stop: { kind: "minimum" },
    };
    let endMax: TimelineResizeBound = {
        beat: MAX_BEAT,
        stop: { kind: "show" },
    };
    for (const a of own) {
        const anchoredStart = a.start === start;
        const anchoredEnd = a.end === end;
        // E7: rows that don't touch an edge stay put (R-E1), so an edge can't cross them, and a
        // row anchored at one edge mustn't become empty
        if (!anchoredStart)
            startMax = tighter(
                startMax,
                a.start,
                { kind: "member", beat: a.start },
                false,
            );
        else if (!anchoredEnd)
            startMax = tighter(
                startMax,
                a.end - 1,
                { kind: "member", beat: a.end },
                false,
            );
        if (!anchoredEnd)
            endMin = tighter(
                endMin,
                a.end,
                { kind: "member", beat: a.end },
                true,
            );
        else if (!anchoredStart)
            endMin = tighter(
                endMin,
                a.start + 1,
                { kind: "member", beat: a.start },
                true,
            );
        // E3, E5: the marcher's other moves that would collide or win over the grown part
        for (const o of others) {
            if (o.marcherId !== a.marcherId || o.layer < a.layer) continue;
            if (anchoredStart && o.end <= start)
                startMin = tighter(startMin, o.end, moveStop(o), true);
            if (anchoredEnd && o.start >= end)
                endMax = tighter(endMax, o.start, moveStop(o), false);
        }
    }
    return {
        timelineId,
        start,
        end,
        startEdge: { min: startMin, max: startMax },
        endEdge: { min: endMin, max: endMax },
        taken,
    };
}

/** Reads `timelineResizeLimits`' inputs for a stored timeline. `null` if it doesn't exist. */
export async function readTimelineResizeLimits(
    db: DbConnection | DbTransaction,
    timelineId: number,
): Promise<TimelineResizeLimits | null> {
    const L = schema.timelines;
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const timeline = await db
        .select()
        .from(L)
        .where(eq(L.id, timelineId))
        .get();
    if (!timeline) return null;
    const transitionIds = (
        await db
            .select({ id: T.id })
            .from(T)
            .where(eq(T.timeline_id, timelineId))
            .all()
    ).map((t) => t.id);
    const own =
        transitionIds.length === 0
            ? []
            : await db
                  .select()
                  .from(A)
                  .where(inArray(A.transition_id, transitionIds))
                  .all();
    const marcherIds = [...new Set(own.map((a) => a.marcher_id))];
    const others =
        marcherIds.length === 0
            ? []
            : await db
                  .select({
                      marcherId: A.marcher_id,
                      start: A.start_beat,
                      end: A.end_beat,
                      layer: A.layer,
                      timelineId: T.timeline_id,
                  })
                  .from(A)
                  .innerJoin(T, eq(A.transition_id, T.id))
                  .where(
                      and(
                          inArray(A.marcher_id, marcherIds),
                          transitionIds.length === 0
                              ? undefined
                              : notInArray(A.transition_id, transitionIds),
                      ),
                  )
                  .all();
    const taken = (
        await db
            .select({ timelineId: L.id, start: L.start_beat, end: L.end_beat })
            .from(L)
            .where(ne(L.id, timelineId))
            .all()
    ).map((t) => ({ timelineId: t.timelineId, start: t.start, end: t.end }));
    return timelineResizeLimits({
        timelineId,
        start: timeline.start_beat,
        end: timeline.end_beat,
        own: own.map((a) => ({
            marcherId: a.marcher_id,
            start: a.start_beat,
            end: a.end_beat,
            layer: a.layer,
        })),
        others,
        taken,
    });
}

/** Why `[start, end)` is outside `limits`, as a sentence for a toast; `null` when it fits. */
export function timelineResizeRefusal(
    limits: TimelineResizeLimits,
    start: number,
    end: number,
): string | null {
    if (!Number.isInteger(start) || !Number.isInteger(end))
        return "A move's edges sit on whole counts.";
    if (end <= start) return "A move is at least 1 count long.";
    const outside = (edge: TimelineResizeLimits["startEdge"], beat: number) =>
        beat < edge.min.beat
            ? edge.min
            : beat > edge.max.beat
              ? edge.max
              : null;
    const bound =
        (start !== limits.start && outside(limits.startEdge, start)) ||
        (end !== limits.end && outside(limits.endEdge, end));
    if (bound) {
        switch (bound.stop.kind) {
            case "show":
                return "A move can't run past the show.";
            case "minimum":
                return "A move is at least 1 count long.";
            case "move":
                return "Another move on these marchers is in the way; the edge stops where it starts or ends.";
            case "member":
                return "A marcher joins or leaves this move partway; the edge can't pass that count.";
        }
    }
    const same = limits.taken.find((t) => t.start === start && t.end === end);
    if (same)
        return "Another move or page already covers exactly these counts; two can't share the same counts.";
    return null;
}

export interface ResizeTimelineResult {
    readonly timelineId: number;
    readonly from: { readonly start: number; readonly end: number };
    readonly to: { readonly start: number; readonly end: number };
}

/**
 * Changes a timeline's range to `[start, end)` (resize-move): every transition it owns and every
 * row anchored at a moved edge follow (R-E1). Refused (`E-ARGS`, nothing written) when the range
 * is outside `timelineResizeLimits`, or is another timeline's range (C-12).
 */
export async function resizeTimelineInTransaction({
    tx,
    timelineId,
    start,
    end,
}: {
    tx: DbTransaction;
    timelineId: number;
    start: number;
    end: number;
}): Promise<ResizeTimelineResult> {
    const limits = await readTimelineResizeLimits(tx, timelineId);
    if (!limits) refuse(`timeline ${timelineId} does not exist`);
    const from = { start: limits.start, end: limits.end };
    if (start === from.start && end === from.end)
        return { timelineId, from, to: from };
    const refusal = timelineResizeRefusal(limits, start, end);
    if (refusal) refuse(refusal);
    await setTimelineRangeInTransaction({ tx, timelineId, start, end });
    return { timelineId, from, to: { start, end } };
}

/**
 * `resizeTimelineInTransaction` as one undoable edit. A range equal to the current one (an edge
 * dropped where it started) opens no edit and returns `null`.
 */
export async function resizeTimeline({
    db,
    timelineId,
    start,
    end,
}: {
    db: DbConnection;
    timelineId: number;
    start: number;
    end: number;
}): Promise<ResizeTimelineResult | null> {
    const current = await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();
    if (current && current.start_beat === start && current.end_beat === end)
        return null;
    return await transactionWithHistory(db, "resizeTimeline", (tx) =>
        resizeTimelineInTransaction({ tx, timelineId, start, end }),
    );
}
