import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { moveLabels, pageTimelineIds } from "@/timeline/timelineViewModel";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse } from "./timelineErrors";
import { setTimelineRangeInTransaction } from "./timelineTransitionsInTransaction";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
    type DatabaseTimeline,
} from "./timelines";
import { createTimelineTransitionsInTransaction } from "./timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";
import {
    marcherLabels,
    marchersInInheritingFollowTheLeader,
    removeAssignmentRowsInTransaction,
} from "./timelineMembership";
import {
    text,
    textList,
    type TimelineText,
    type TimelineTextArg,
} from "@/timeline/timelineText";
import { nextMoveNameInTransaction, readMoveWords } from "./timelineMoveNames";
import type { TimelinePathParams } from "./timelineTransitionsInTransaction";
import {
    moveShapeRecipesInTransaction,
    splitShapeRecipesInTransaction,
} from "./shapeRecipes";

/**
 * Splitting a move and merging moves back (docs/timeline/ui.md UI-25, project owner 2026-10-16).
 *
 * A move (a stored timeline) holds one transition per marcher. **Split** pulls some of its
 * marchers out into a new move over the same range, which UI-25 allows ("One timeline per range" is
 * relaxed): each chosen marcher's transition (its destination, path and layer) moves to the new
 * timeline as it is, so nothing moves on the field (a timeline has no effect on resolution, R-1).
 * **Merge** moves every transition of one move into another and deletes the emptied one; a move
 * with other counts is fitted to the target's first (owner, 2026-10-18). Each is one undoable
 * edit, and every refusal is decided before the first write.
 *
 * - A transition whose marchers are all being split moves whole (its row changes timeline), so
 *   its assignments, destinations, shape and any kept marker stay the same rows.
 * - A shared shapeless `direct` or `arc` transition (a converted page's, P9.10) that also holds
 *   marchers who stay is split slot by slot: each leaving marcher gets its own one-slot transition
 *   with its slot's destination and the same path, and the old transition is compacted, so it
 *   makes no vacant slot. Each slot's path only depends on its own origin and destination, so the
 *   motion is the same.
 * - A shared transition into a shape, a follow-the-leader one, or one whose marchers are in an
 *   inheriting follow-the-leader transition (R-12 reads slot order) can't be split that way:
 *   refused, naming the marchers it would take with it.
 */

/** "T1, T2 and T3", or "T1, T2, T3 and 4 more", in marcher id order. */
const labelList = (labels: Map<number, string>, ids: readonly number[]) => {
    const names: TimelineTextArg[] = [...ids]
        .sort((a, b) => a - b)
        .map(
            (id) =>
                labels.get(id) ??
                text.t("timeline.where.marcher", { marcher: id }),
        );
    return textList(
        names.length > 3
            ? [
                  ...names.slice(0, 3),
                  text.t("timeline.where.moreMarchers", {
                      count: names.length - 3,
                  }),
              ]
            : names,
    );
};

/**
 * Each stored timeline's on-screen name: "Page 3" for the page timeline a page box stands for
 * (the oldest over exactly the box), else its move label ("Move 6").
 */
const timelineWords = async (
    tx: DbTransaction,
): Promise<{
    nameOf: (timelineId: number) => TimelineTextArg;
    pageTimelineIds: Set<number>;
}> => {
    const { boxes, moves } = await readMoveWords(tx);
    const labels = moveLabels(moves, boxes);
    const pages = pageTimelineIds(moves, boxes);
    const pageName = new Map<number, string>();
    for (const box of boxes) {
        const page = moves.find(
            (t) =>
                pages.has(t.id) && t.start === box.start && t.end === box.end,
        );
        if (page && box.name !== undefined) pageName.set(page.id, box.name);
    }
    return {
        pageTimelineIds: pages,
        nameOf: (id) =>
            labels.get(id) ??
            (pageName.has(id)
                ? text.t("timeline.where.page", { page: pageName.get(id)! })
                : text.t("timeline.where.thisMove")),
    };
};

/** A shared transition's path that a slot keeps on its own (shapeless `direct` or `arc`). */
const canPeelSlot = (style: string): style is "direct" | "arc" =>
    style === "direct" || style === "arc";

/** One assignment row with its transition's columns. */
interface MemberRow {
    assignment: typeof schema.timeline_assignments.$inferSelect;
    transition: typeof schema.timeline_transitions.$inferSelect;
}

const memberRows = async (
    tx: DbTransaction,
    timelineId: number,
): Promise<MemberRow[]> => {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    return await tx
        .select({ assignment: a, transition: t })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .where(eq(t.timeline_id, timelineId))
        .orderBy(asc(a.id))
        .all();
};

const readTimeline = async (
    tx: DbTransaction,
    timelineId: number,
): Promise<DatabaseTimeline | undefined> =>
    await tx
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();

/** Moves transitions to timeline `timelineId`, as they are (same range, C-11). */
const moveTransitionsTo = async (
    tx: DbTransaction,
    transitionIds: readonly number[],
    timelineId: number,
): Promise<void> => {
    if (transitionIds.length === 0) return;
    await mapDbErrors(async () => {
        await tx
            .update(schema.timeline_transitions)
            .set({ timeline_id: timelineId })
            .where(inArray(schema.timeline_transitions.id, [...transitionIds]));
    });
};

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/** What `splitMarchersIntoNewMoveInTransaction` did. */
export interface SplitMoveResult {
    /** The move that was split */
    fromTimelineId: number;
    /** The new move */
    timeline: DatabaseTimeline;
    /** The marchers now in the new move, by id */
    marcherIds: number[];
    /** The other selected marchers, who weren't in the move and were left alone */
    notInMove: number[];
}

/**
 * Why `marcherIds` can't be split out of a move whose members are `members`, or `null` when
 * they can, as far as membership goes (UI-25): none of them in it, or every member chosen. The
 * timeline menu, the Move card and the command palette show the same reason on a disabled item.
 */
export function splitMembershipBlocker(
    members: ReadonlySet<number>,
    marcherIds: Iterable<number>,
    moveName: string,
): TimelineText | null {
    return splitMembershipBlockerText(members, marcherIds, moveName);
}

/** `splitMembershipBlocker`'s reason as text, translated where it is shown (the write path's). */
function splitMembershipBlockerText(
    members: ReadonlySet<number>,
    marcherIds: Iterable<number>,
    moveName: TimelineTextArg,
): TimelineText | null {
    let chosen = 0;
    for (const id of new Set(marcherIds)) if (members.has(id)) chosen++;
    if (chosen === 0)
        return text.t("timeline.refusals.split.noneSelected", {
            move: moveName,
        });
    if (chosen === members.size)
        return text.t("timeline.refusals.split.allSelected", {
            move: moveName,
        });
    return null;
}

/**
 * **Split N selected into new move** (UI-25): the selected marchers that are members of timeline
 * `timelineId` leave it for a new move over the same range, named "Move N" (UI-14), with their
 * transitions as they are (see the module comment). Selected marchers who aren't members are left
 * alone and reported.
 *
 * Refused (E-ARGS) before anything is written: a missing timeline, no marchers, none of them in
 * the move, every member chosen (that would only rename the move), and a marcher whose
 * transition is shared with a marcher who stays and can't be split slot by slot (into a shape,
 * follow the leader, or in an inheriting follow-the-leader order).
 */
// eslint-disable-next-line max-lines-per-function
export const splitMarchersIntoNewMoveInTransaction = async ({
    tx,
    timelineId,
    marcherIds,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<SplitMoveResult> => {
    const from = await readTimeline(tx, timelineId);
    if (!from) refuse(`timeline ${timelineId} does not exist`);
    if (marcherIds.length === 0)
        refuse(text.t("timeline.refusals.split.selectToSplit"));
    const rows = await memberRows(tx, timelineId);
    const members = new Set(rows.map((r) => r.assignment.marcher_id));
    const { nameOf } = await timelineWords(tx);
    const name = nameOf(timelineId);
    const blocker = splitMembershipBlockerText(members, marcherIds, name);
    if (blocker) refuse(blocker);
    const chosen = new Set(marcherIds.filter((id) => members.has(id)));
    const notInMove = [...new Set(marcherIds)]
        .filter((id) => !members.has(id))
        .sort((a, b) => a - b);

    // Plan: whole transitions that move, and slots peeled off shared ones
    const byTransition = new Map<number, MemberRow[]>();
    for (const row of rows) {
        const list = byTransition.get(row.transition.id) ?? [];
        list.push(row);
        byTransition.set(row.transition.id, list);
    }
    const whole: number[] = [];
    const peeled: MemberRow[] = [];
    // Read once, only when a shared transition has to be split slot by slot
    const shared = [...byTransition.values()].some((list) => {
        const n = list.filter((r) =>
            chosen.has(r.assignment.marcher_id),
        ).length;
        return n > 0 && n < list.length;
    });
    const ftl = shared
        ? await marchersInInheritingFollowTheLeader(tx)
        : new Set<number>();
    for (const [transitionId, list] of byTransition) {
        const leaving = list.filter((r) => chosen.has(r.assignment.marcher_id));
        if (leaving.length === 0) continue;
        if (leaving.length === list.length) {
            whole.push(transitionId);
            continue;
        }
        const tr = list[0]!.transition;
        const ordered = list.some((r) => ftl.has(r.assignment.marcher_id));
        if (
            tr.dest_shape_id !== null ||
            tr.path_style === "follow_the_leader" ||
            ordered
        ) {
            const labels = await marcherLabels(tx, [
                ...new Set(list.map((r) => r.assignment.marcher_id)),
            ]);
            const params = {
                count: leaving.length,
                marchers: labelList(
                    labels,
                    leaving.map((r) => r.assignment.marcher_id),
                ),
                others: labelList(
                    labels,
                    list
                        .filter((r) => !chosen.has(r.assignment.marcher_id))
                        .map((r) => r.assignment.marcher_id),
                ),
            };
            refuse(
                tr.dest_shape_id !== null
                    ? text.t("timeline.refusals.split.sharedShape", params)
                    : text.t("timeline.refusals.split.followTogether", params),
            );
        }
        peeled.push(...leaving);
    }

    // Each peeled slot's new one-slot transition, read and checked before anything is written
    const d = schema.timeline_slot_destinations;
    const points = new Map<string, [number, number]>();
    if (peeled.length > 0)
        for (const p of await tx
            .select()
            .from(d)
            .where(
                inArray(d.transition_id, [
                    ...new Set(peeled.map((r) => r.transition.id)),
                ]),
            )
            .all())
            points.set(`${p.transition_id}:${p.slot_index}`, [p.x, p.y]);
    const peeledTransitions = peeled.map(({ assignment, transition }) => {
        const point = points.get(`${transition.id}:${assignment.slot_index}`);
        if (!point)
            refuse(
                `transition ${transition.id} has no destination for slot ${assignment.slot_index}`,
            );
        const pathStyle = transition.path_style;
        if (!canPeelSlot(pathStyle))
            refuse(
                `transition ${transition.id}'s ${pathStyle} path can't be split slot by slot`,
            );
        return {
            slotCount: 1,
            destination: { kind: "individual" as const, points: [point] },
            pathStyle,
            pathParams: (transition.path_params === null
                ? null
                : JSON.parse(transition.path_params)) as TimelinePathParams,
            orderMode: transition.order_mode as "inherit" | "slot",
        };
    });

    // Write: the new move (sharing the range, UI-25), whole transitions, then the peeled slots
    const [timeline] = await createTimelinesInTransaction({
        tx,
        newTimelines: [
            {
                name: await nextMoveNameInTransaction(tx),
                startBeat: from.start_beat,
                endBeat: from.end_beat,
            },
        ],
        allowSharedRanges: true,
    });
    await moveTransitionsTo(tx, whole, timeline!.id);
    if (peeled.length > 0) {
        // Old rows go first, so the new ones don't overlap them at the same layer (I-A3)
        await removeAssignmentRowsInTransaction({
            tx,
            removed: peeled.map((r) => r.assignment),
            compact: true,
            deleteEmptied: true,
        });
        const transitions = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: peeledTransitions.map((t) => ({
                ...t,
                timelineId: timeline!.id,
            })),
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: peeled.map(({ assignment }, i) => ({
                marcherId: assignment.marcher_id,
                transitionId: transitions[i]!.id,
                slotIndex: 0,
                startBeat: assignment.start_beat,
                endBeat: assignment.end_beat,
                layer: assignment.layer,
            })),
        });
    }
    // The marchers' shapes (ADR 0006) follow them, as a merge's do
    await splitShapeRecipesInTransaction({
        tx,
        from: timelineId,
        to: timeline!.id,
        marcherIds: [...chosen],
    });
    return {
        fromTimelineId: timelineId,
        timeline: timeline!,
        marcherIds: [...chosen].sort((a, b) => a - b),
        notInMove,
    };
};

/** `splitMarchersIntoNewMoveInTransaction` as one undoable edit. */
export const splitMarchersIntoNewMove = async ({
    db,
    timelineId,
    marcherIds,
}: {
    db: DbConnection;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<SplitMoveResult> =>
    await transactionWithHistory(db, "splitMove", (tx) =>
        splitMarchersIntoNewMoveInTransaction({ tx, timelineId, marcherIds }),
    );

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/** What `mergeMovesInTransaction` did. */
export interface MergeMovesResult {
    /** The move that was merged away and deleted */
    source: DatabaseTimeline;
    /** The move that took its marchers */
    targetTimelineId: number;
    /** The marchers that came over, by id */
    marcherIds: number[];
}

/**
 * Whether merging a move with range `source` into one with range `target` fits it to the
 * target's counts first (UI-25, owner 2026-10-18): the target's counts always win.
 */
export const mergeFits = (
    source: { readonly start: number; readonly end: number },
    target: { readonly start: number; readonly end: number },
): boolean => source.start !== target.start || source.end !== target.end;

/**
 * **Merge** (UI-25): every transition of timeline `sourceId` moves into `targetId`, and the
 * emptied source is deleted. The target keeps its name and its counts. A source with other counts
 * is first fitted to the target's (owner, 2026-10-18), as a resize would (R-E1): a marcher's row
 * from the source's start starts at the target's start, one to its end ends at the target's end,
 * and destinations and paths stay, so its marchers get there by the target's end instead. With
 * the same counts nothing moves on the field.
 *
 * Refused (E-ARGS) before anything is written: a missing timeline, a move merged with itself, a
 * marcher in both (it would have two transitions in one move), a page's own timeline as the
 * source (the page box stands for it: merge the other move into the page instead), and, when
 * fitting, a marcher who joins or leaves the source partway at a count outside the target's, or
 * whose fitted row would overlap another of its moves on the same layer (E-A3).
 */
export const mergeMovesInTransaction = async ({
    tx,
    sourceId,
    targetId,
}: {
    tx: DbTransaction;
    sourceId: number;
    targetId: number;
}): Promise<MergeMovesResult> => {
    if (sourceId === targetId) refuse(text.t("timeline.refusals.merge.itself"));
    const source = await readTimeline(tx, sourceId);
    if (!source) refuse(`timeline ${sourceId} does not exist`);
    const target = await readTimeline(tx, targetId);
    if (!target) refuse(`timeline ${targetId} does not exist`);
    const { nameOf, pageTimelineIds } = await timelineWords(tx);
    if (pageTimelineIds.has(sourceId))
        refuse(
            text.t("timeline.refusals.merge.pageMove", {
                source: nameOf(sourceId),
                target: nameOf(targetId),
            }),
        );
    const sourceRows = await memberRows(tx, sourceId);
    const targetMembers = new Set(
        (await memberRows(tx, targetId)).map((r) => r.assignment.marcher_id),
    );
    const both = [
        ...new Set(
            sourceRows
                .map((r) => r.assignment.marcher_id)
                .filter((id) => targetMembers.has(id)),
        ),
    ];
    if (both.length > 0)
        refuse(
            text.t("timeline.refusals.merge.inBoth", {
                count: both.length,
                marchers: labelList(await marcherLabels(tx, both), both),
                source: nameOf(sourceId),
                target: nameOf(targetId),
            }),
        );
    if (
        mergeFits(
            { start: source.start_beat, end: source.end_beat },
            { start: target.start_beat, end: target.end_beat },
        )
    ) {
        await refuseBadFit(tx, source, target, sourceRows, nameOf);
        await setTimelineRangeInTransaction({
            tx,
            timelineId: sourceId,
            start: target.start_beat,
            end: target.end_beat,
        });
    }
    const transitions = await tx
        .select({ id: schema.timeline_transitions.id })
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.timeline_id, sourceId))
        .all();
    await moveTransitionsTo(
        tx,
        transitions.map((t) => t.id),
        targetId,
    );
    // Its shapes (ADR 0006) come over too, rather than going with it. A fit keeps destinations,
    // so their spots still hold at the target's end.
    await moveShapeRecipesInTransaction({ tx, from: sourceId, to: targetId });
    await deleteTimelinesInTransaction({
        tx,
        timelineIds: new Set([sourceId]),
    });
    return {
        source,
        targetTimelineId: targetId,
        marcherIds: [
            ...new Set(sourceRows.map((r) => r.assignment.marcher_id)),
        ].sort((a, b) => a - b),
    };
};

/**
 * Refuses (E-ARGS) fitting `source` to `target`'s counts when the range procedure would fail
 * (`setTimelineRangeInTransaction`), with a message that names the marchers: a row that doesn't
 * reach an edge stays where it is, so it must lie inside the target's counts; every fitted row
 * must stay clear of the same marcher's rows on its layer in other moves; and no marcher may
 * already have another move over exactly the target's counts (spec §6.2 L-4), as one split off
 * the target has.
 */
async function refuseBadFit(
    tx: DbTransaction,
    source: DatabaseTimeline,
    target: DatabaseTimeline,
    sourceRows: readonly MemberRow[],
    nameOf: (timelineId: number) => TimelineTextArg,
): Promise<void> {
    const fitted = sourceRows.map(({ assignment: a }) => ({
        row: a,
        start:
            a.start_beat === source.start_beat
                ? target.start_beat
                : a.start_beat,
        end: a.end_beat === source.end_beat ? target.end_beat : a.end_beat,
    }));
    const partway = fitted.filter(
        (f) =>
            f.start >= f.end ||
            f.start < target.start_beat ||
            f.end > target.end_beat,
    );
    if (partway.length > 0) {
        const ids = [...new Set(partway.map((f) => f.row.marcher_id))];
        refuse(
            text.t("timeline.refusals.merge.partway", {
                count: ids.length,
                marchers: labelList(await marcherLabels(tx, ids), ids),
                source: nameOf(source.id),
                target: nameOf(target.id),
            }),
        );
    }
    const marcherIds = [...new Set(fitted.map((f) => f.row.marcher_id))];
    if (marcherIds.length === 0) return;
    const A = schema.timeline_assignments;
    const T = schema.timeline_transitions;
    const L = schema.timelines;
    const others = await tx
        .select({
            marcherId: A.marcher_id,
            start: A.start_beat,
            end: A.end_beat,
            layer: A.layer,
            timelineId: T.timeline_id,
            timelineStart: L.start_beat,
            timelineEnd: L.end_beat,
        })
        .from(A)
        .innerJoin(T, eq(A.transition_id, T.id))
        .innerJoin(L, eq(T.timeline_id, L.id))
        .where(inArray(A.marcher_id, marcherIds))
        .all();
    const hits = fitted.flatMap((f) => {
        const hit = others.find(
            (o) =>
                o.timelineId !== source.id &&
                o.marcherId === f.row.marcher_id &&
                o.layer === f.row.layer &&
                o.start < f.end &&
                f.start < o.end,
        );
        return hit
            ? [{ marcherId: f.row.marcher_id, timelineId: hit.timelineId }]
            : [];
    });
    if (hits.length > 0) {
        const ids = [...new Set(hits.map((h) => h.marcherId))];
        refuse(
            text.t("timeline.refusals.merge.fitCollides", {
                marchers: labelList(await marcherLabels(tx, ids), ids),
                source: nameOf(source.id),
                target: nameOf(target.id),
                other: nameOf(hits[0]!.timelineId),
            }),
        );
    }
    await refuseSecondMoveOverCounts(tx, others, source, target, nameOf);
}

/**
 * Refuses (E-ARGS) a fit that would give a marcher two moves over the same counts (spec §6.2
 * L-4): one of `rows` (the source's marchers' rows) is in another move over exactly `target`'s
 * counts, as a move split off the target is.
 */
async function refuseSecondMoveOverCounts(
    tx: DbTransaction,
    rows: readonly {
        readonly marcherId: number;
        readonly timelineId: number;
        readonly timelineStart: number;
        readonly timelineEnd: number;
    }[],
    source: DatabaseTimeline,
    target: DatabaseTimeline,
    nameOf: (timelineId: number) => TimelineTextArg,
): Promise<void> {
    const sameCounts = rows.filter(
        (o) =>
            o.timelineId !== source.id &&
            o.timelineId !== target.id &&
            o.timelineStart === target.start_beat &&
            o.timelineEnd === target.end_beat,
    );
    if (sameCounts.length === 0) return;
    const ids = [...new Set(sameCounts.map((o) => o.marcherId))];
    refuse(
        text.t("timeline.refusals.merge.sameCounts", {
            count: ids.length,
            marchers: labelList(await marcherLabels(tx, ids), ids),
            other: nameOf(sameCounts[0]!.timelineId),
            target: nameOf(target.id),
        }),
    );
}

/** `mergeMovesInTransaction` as one undoable edit. */
export const mergeMoves = async ({
    db,
    sourceId,
    targetId,
}: {
    db: DbConnection;
    sourceId: number;
    targetId: number;
}): Promise<MergeMovesResult> =>
    await transactionWithHistory(db, "mergeMoves", (tx) =>
        mergeMovesInTransaction({ tx, sourceId, targetId }),
    );
