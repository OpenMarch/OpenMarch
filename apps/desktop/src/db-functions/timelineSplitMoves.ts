import { eq, inArray } from "drizzle-orm";
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
    type BeatRange,
    marchersInInheritingFollowTheLeader,
    removeAssignmentRowsInTransaction,
} from "./timelineMembership";
import { joinList } from "@/timeline/timelineRangeWords";
import { english, type KeepTranslate } from "@/timeline/timelineKeepLater";
import { nextMoveNameInTransaction, readMoveWords } from "./timelineMoveNames";
import type { TimelinePathParams } from "./timelineTransitionsInTransaction";
import {
    memberRows,
    memberRowsWhere,
    readTimeline,
    type MemberRow,
} from "./timelineMemberRows";
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
 *   its assignments, destinations and shape stay the same rows.
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
    const names = [...ids]
        .sort((a, b) => a - b)
        .map((id) => labels.get(id) ?? `marcher ${id}`);
    return joinList(
        names.length > 3
            ? [...names.slice(0, 3), `${names.length - 3} more`]
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
    nameOf: (timelineId: number) => string;
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
            (pageName.has(id) ? `Page ${pageName.get(id)}` : "this move"),
    };
};

/** A shared transition's path that a slot keeps on its own (shapeless `direct` or `arc`). */
const canPeelSlot = (style: string): style is "direct" | "arc" =>
    style === "direct" || style === "arc";

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
 * they can, as far as membership goes (UI-25): none of them in it, or every member chosen of a
 * move that isn't a page's own (that would only rename it). A page's own move can be split off
 * whole (#581): its marchers get a move of their own, and the page box keeps its timeline, empty.
 * The timeline menu, the Move card and the command palette show the same reason on a disabled
 * item, worded by `t` (Tolgee's in the app; English for the write's refusal).
 */
export function splitMembershipBlocker(
    members: ReadonlySet<number>,
    marcherIds: Iterable<number>,
    moveName: string,
    {
        pageMove = false,
        t = english,
    }: { pageMove?: boolean; t?: KeepTranslate } = {},
): string | null {
    let chosen = 0;
    for (const id of new Set(marcherIds)) if (members.has(id)) chosen++;
    if (chosen === 0)
        return t(
            "timeline.split.selectMembers",
            "Select marchers in {name} to split them into a new move.",
            { name: moveName },
        );
    if (chosen === members.size && !pageMove)
        return t(
            "timeline.split.everyMarcher",
            "Every marcher in {name} is selected. Select only the ones to split off.",
            { name: moveName },
        );
    return null;
}

/** Why split by marcher can't break up a shared transition (`splitRefusal`). */
export interface SplitRefusal {
    /** Into a shape, or follow the leader (its own path, or an inheriting order elsewhere, R-12) */
    reason: "shape" | "followTheLeader";
    /** The transition's marchers that would leave, ascending */
    leaving: number[];
    /** Its marchers that would stay, ascending */
    staying: number[];
}

/**
 * **Preview** (changes nothing): why splitting `marcherIds` out of move `timelineId`
 * (`splitMarchersIntoNewMoveInTransaction`) is refused for a transition they share with a marcher
 * who stays, or `null` when it isn't: the transition goes into a shape, or follows the leader, or
 * one of its marchers (who stay too) is in an inheriting follow-the-leader transition anywhere in
 * the show, whose order R-12 reads from these slots. The first such transition, in row order. With
 * `storedShapesSwitched`, a shared transition into a stored shape isn't refused, since the caller
 * switches it to individual points first (`takeMarchersIntoOwnMoveInTransaction`).
 */
export async function splitRefusal(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
    { storedShapesSwitched = false }: { storedShapesSwitched?: boolean } = {},
): Promise<SplitRefusal | null> {
    const chosen = new Set(marcherIds);
    const byTransition = new Map<number, MemberRow[]>();
    for (const row of await memberRows(tx, timelineId)) {
        const list = byTransition.get(row.transition.id) ?? [];
        list.push(row);
        byTransition.set(row.transition.id, list);
    }
    const shared = [...byTransition.values()].filter((list) => {
        const n = list.filter((r) =>
            chosen.has(r.assignment.marcher_id),
        ).length;
        return n > 0 && n < list.length;
    });
    if (shared.length === 0) return null;
    // Read once, only when a shared transition has to be split slot by slot
    const ftl = await marchersInInheritingFollowTheLeader(tx);
    const ids = (list: MemberRow[], leaving: boolean) =>
        [
            ...new Set(
                list
                    .filter(
                        (r) => chosen.has(r.assignment.marcher_id) === leaving,
                    )
                    .map((r) => r.assignment.marcher_id),
            ),
        ].sort((a, b) => a - b);
    for (const list of shared) {
        const tr = list[0]!.transition;
        const reason =
            tr.dest_shape_id !== null && !storedShapesSwitched
                ? "shape"
                : tr.path_style === "follow_the_leader" ||
                    list.some((r) => ftl.has(r.assignment.marcher_id))
                  ? "followTheLeader"
                  : null;
        if (reason)
            return {
                reason,
                leaving: ids(list, true),
                staying: ids(list, false),
            };
    }
    return null;
}

/**
 * **Split N selected into new move** (UI-25): the selected marchers that are members of timeline
 * `timelineId` leave it for a new move over the same range, named "Move N" (UI-14), with their
 * transitions as they are (see the module comment). Selected marchers who aren't members are left
 * alone and reported.
 *
 * Every member of a page's own move may be chosen (#581): every transition moves whole, and the
 * page's timeline stays, empty, so the page box still stands for it and the new move is a move
 * (ADR 0001, UI-25 amendment: an edit that empties the page's timeline keeps its row while
 * another shares its range). Nothing moves on the field.
 *
 * Refused (E-ARGS) before anything is written: a missing timeline, no marchers, none of them in
 * the move, every member of a move that isn't a page's chosen (that would only rename it), and a
 * marcher whose transition is shared with a marcher who stays and can't be split slot by slot
 * (into a shape, follow the leader, or in an inheriting follow-the-leader order).
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
    if (marcherIds.length === 0) refuse("select the marchers to split off");
    const rows = await memberRows(tx, timelineId);
    const members = new Set(rows.map((r) => r.assignment.marcher_id));
    const { nameOf, pageTimelineIds } = await timelineWords(tx);
    const name = nameOf(timelineId);
    const blocker = splitMembershipBlocker(members, marcherIds, name, {
        pageMove: pageTimelineIds.has(timelineId),
    });
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
    const refusal = await splitRefusal(tx, timelineId, [...chosen]);
    if (refusal) {
        const labels = await marcherLabels(tx, [
            ...refusal.leaving,
            ...refusal.staying,
        ]);
        const why =
            refusal.reason === "shape"
                ? "move into one shape together"
                : "follow the leader together";
        refuse(
            `${labelList(labels, refusal.leaving)} ${why} with ${labelList(
                labels,
                refusal.staying,
            )}, so they can't be split apart. Select them all, or none of them.`,
        );
    }
    for (const [transitionId, list] of byTransition) {
        const leaving = list.filter((r) => chosen.has(r.assignment.marcher_id));
        if (leaving.length === 0) continue;
        if (leaving.length === list.length) {
            whole.push(transitionId);
            continue;
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
    if (sourceId === targetId) refuse("a move can't be merged with itself");
    const source = await readTimeline(tx, sourceId);
    if (!source) refuse(`timeline ${sourceId} does not exist`);
    const target = await readTimeline(tx, targetId);
    if (!target) refuse(`timeline ${targetId} does not exist`);
    const { nameOf, pageTimelineIds } = await timelineWords(tx);
    if (pageTimelineIds.has(sourceId))
        refuse(
            `${nameOf(sourceId)} is a page's own move. Merge ${nameOf(targetId)} into it instead.`,
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
            `${labelList(await marcherLabels(tx, both), both)} ${
                both.length === 1 ? "is" : "are"
            } in both ${nameOf(sourceId)} and ${nameOf(targetId)}, so merging would give ${
                both.length === 1 ? "it" : "them"
            } two moves at once.`,
        );
    if (
        mergeFits(
            { start: source.start_beat, end: source.end_beat },
            { start: target.start_beat, end: target.end_beat },
        )
    ) {
        const why = await fitInTransaction(
            tx,
            source,
            { start: target.start_beat, end: target.end_beat },
            sourceRows,
        );
        if (why)
            refuse(
                await mergeRefusalMessage(tx, why, sourceId, targetId, nameOf),
            );
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
 * Why a move can't be fitted to some counts (`fitMoveInTransaction`), with the marchers it's
 * about, ascending, and the move they'd run into. Each caller words it: merge as a refusal
 * (`mergeRefusalMessage`), Remove keyframe's join as a toast (`notJoinedMessage`).
 *
 * - `partway`: they join or leave the move partway, at a count outside the new counts;
 * - `overlap`: a fitted row would overlap another of their moves (`timelineId`) on its layer;
 * - `secondMove`: they're already in another move (`timelineId`) over exactly the new counts
 *   (spec §6.2 L-4).
 */
export type FitRefusal =
    | { readonly kind: "partway"; readonly marcherIds: number[] }
    | {
          readonly kind: "overlap" | "secondMove";
          readonly marcherIds: number[];
          readonly timelineId: number;
      };

/**
 * Fits move `sourceId` to `counts` as a merge fits it to the target's (UI-25;
 * `mergeMovesInTransaction`): rows from its start start at `counts.start`, rows to its end end at
 * `counts.end`, and destinations and paths stay. Returns why it can't, having written nothing, or
 * `null` once it's fitted. Remove keyframe's join (`timelineJoinAtBeat.ts`, holds decision 14)
 * fits the move after a split back over the counts of the one before it this way.
 *
 * A missing `sourceId` is the caller's mistake, not a reason: refused (E-ARGS), as merge does.
 */
export async function fitMoveInTransaction({
    tx,
    sourceId,
    counts,
}: {
    tx: DbTransaction;
    sourceId: number;
    counts: BeatRange;
}): Promise<FitRefusal | null> {
    const source = await readTimeline(tx, sourceId);
    if (!source) refuse(`timeline ${sourceId} does not exist`);
    return await fitInTransaction(
        tx,
        source,
        counts,
        await memberRows(tx, sourceId),
    );
}

/** `fitMoveInTransaction` with the source and its rows already read. */
async function fitInTransaction(
    tx: DbTransaction,
    source: DatabaseTimeline,
    counts: BeatRange,
    sourceRows: readonly MemberRow[],
): Promise<FitRefusal | null> {
    const why = await badFit(tx, source, counts, sourceRows);
    if (why) return why;
    await setTimelineRangeInTransaction({
        tx,
        timelineId: source.id,
        start: counts.start,
        end: counts.end,
    });
    return null;
}

/**
 * Why fitting `source` to `counts` would make the range procedure fail
 * (`setTimelineRangeInTransaction`), or `null`: a row that doesn't reach an edge stays where it
 * is, so it must lie inside the counts; every fitted row must stay clear of the same marcher's
 * rows on its layer in other moves; and no marcher may already have another move over exactly
 * the counts (spec §6.2 L-4), as one split off a merge's target has. Reads no labels: the caller
 * words the reason only when it shows it.
 */
async function badFit(
    tx: DbTransaction,
    source: DatabaseTimeline,
    counts: BeatRange,
    sourceRows: readonly MemberRow[],
): Promise<FitRefusal | null> {
    const ascendingIds = (ids: Iterable<number>) =>
        [...new Set(ids)].sort((a, b) => a - b);
    const fitted = sourceRows.map(({ assignment: a }) => ({
        row: a,
        start: a.start_beat === source.start_beat ? counts.start : a.start_beat,
        end: a.end_beat === source.end_beat ? counts.end : a.end_beat,
    }));
    const partway = fitted.filter(
        (f) => f.start >= f.end || f.start < counts.start || f.end > counts.end,
    );
    if (partway.length > 0)
        return {
            kind: "partway",
            marcherIds: ascendingIds(partway.map((f) => f.row.marcher_id)),
        };
    const marcherIds = [...new Set(fitted.map((f) => f.row.marcher_id))];
    if (marcherIds.length === 0) return null;
    // The source's marchers have no rows in a merge's target (merge refuses a marcher in both
    // first), so every other move counts
    const others = (
        await memberRowsWhere(
            tx,
            inArray(schema.timeline_assignments.marcher_id, marcherIds),
        )
    ).filter((o) => o.timeline.id !== source.id);
    const hits = fitted.flatMap((f) => {
        const hit = others.find(
            ({ assignment: o }) =>
                o.marcher_id === f.row.marcher_id &&
                o.layer === f.row.layer &&
                o.start_beat < f.end &&
                f.start < o.end_beat,
        );
        return hit
            ? [{ marcherId: f.row.marcher_id, timelineId: hit.timeline.id }]
            : [];
    });
    if (hits.length > 0)
        return {
            kind: "overlap",
            marcherIds: ascendingIds(hits.map((h) => h.marcherId)),
            timelineId: hits[0]!.timelineId,
        };
    const sameCounts = others.filter(
        (o) =>
            o.timeline.start_beat === counts.start &&
            o.timeline.end_beat === counts.end,
    );
    if (sameCounts.length > 0)
        return {
            kind: "secondMove",
            marcherIds: ascendingIds(
                sameCounts.map((o) => o.assignment.marcher_id),
            ),
            timelineId: sameCounts[0]!.timeline.id,
        };
    return null;
}

/** Merge's refusal for a fit of `sourceId` to `targetId`'s counts (`badFit`). */
async function mergeRefusalMessage(
    tx: DbTransaction,
    why: FitRefusal,
    sourceId: number,
    targetId: number,
    nameOf: (timelineId: number) => string,
): Promise<string> {
    const ids = why.marcherIds;
    const who = labelList(await marcherLabels(tx, ids), ids);
    const source = nameOf(sourceId);
    const target = nameOf(targetId);
    switch (why.kind) {
        case "partway":
            return `${who} ${
                ids.length === 1 ? "joins or leaves" : "join or leave"
            } ${source} partway, outside ${target}'s counts. Resize ${source} to ${target}'s counts first.`;
        case "overlap":
            return `Fitting ${source} to ${target}'s counts would run ${who} into ${nameOf(
                why.timelineId,
            )}. Resize ${source} to ${target}'s counts first.`;
        case "secondMove":
            return `${who} ${ids.length === 1 ? "is" : "are"} already in ${nameOf(
                why.timelineId,
            )}, over ${target}'s counts, so merging would give ${
                ids.length === 1 ? "it" : "them"
            } two moves over the same counts.`;
    }
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
