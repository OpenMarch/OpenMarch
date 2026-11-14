import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import {
    routeEndsChanged,
    type AdjustProfile,
    type Resolver,
    type RoutePoint,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import type { DbConnection } from "@/db-functions/types";
import { readRoutes, type MoveRoute } from "@/db-functions/timelineRoutes";
import { meanOf, readGroupPaths } from "@/db-functions/timelineGroupRoutes";
import { laneOn } from "@/db-functions/timelineLanes";
import {
    followOrder,
    followTrailRefusal,
    readTrails,
    type MoveTrail,
} from "@/db-functions/timelineTrails";
import type { XY } from "@/shapes/types";
import type { TimelineText } from "@/timeline/timelineText";

/**
 * Who a path is drawn for and between which spots (pathways step 1, spec v0.9 R-14): one marcher's
 * move at the playhead, from where it starts (`from`) to its end spot (`to`), and the route it
 * walks there now, if any.
 */

/** A route's last-leg bulge as a target carries it (R-14″) */
const toBulgeOf = (g: { toBulge?: number }): { toBulge?: number } =>
    g.toBulge === undefined ? {} : { toBulge: g.toBulge };

export interface PathTarget {
    timelineId: number;
    transitionId: number;
    marcherId: number;
    /** The move's counts, in beats */
    start: number;
    end: number;
    /** Where the marcher stands at the move's start (R-14's A) */
    from: XY;
    /** Its end spot (R-14's B) */
    to: XY;
    /** The route it walks now, or null for a straight (or arc) move */
    routeId: number | null;
    /** The route's points, in walking order, smooth ones with their tension (none without a route) */
    points: readonly RoutePoint[];
    /** The ends the route was drawn against (its `from` and `to`, R-14's F and G), or null */
    ends: { from: XY; to: XY } | null;
    /** The route's last leg's bulge (`toBulge`, R-14″, step 10a); absent for none */
    toBulge?: number;
    /**
     * A group path (pathways step 15), or null for one marcher's own path. For a group the
     * target's `from` and `to` are the reference line's ends (F and G), `routeId` the group path
     * (null while a new one is drawn) and `points` its reference points; `marcherId` and
     * `transitionId` are its first member's.
     */
    group: GroupTarget | null;
    /**
     * A path read by its route (`targetOfRoute`): from the earliest start to the latest end of
     * the transitions its lanes are on. A group path's members can be in several transitions of
     * one move (AP-R8), so a selected path stays selected while the playhead is anywhere in them
     * (AP-O4). Absent otherwise: then `start` and `end` are the move's.
     */
    span?: { start: number; end: number };
    /**
     * Where a saved group path's line is drawn from and to: the middle of its members' starts
     * and end spots now, so the line stays on a box that has moved (AP-R5). `from` and `to` stay
     * the stored F and G, which the walk and the curve's end tangents read. Absent for an own
     * path (`from` and `to` are already its real ends) and for a group path being drawn.
     */
    drawnEnds?: { from: XY; to: XY };
    /**
     * A follow-the-leader trail (pathways step 4, spec Appendix K), or absent. Then the target's
     * `from` is where the leader starts, `to` the end spot the line is entered at, `routeId` the
     * trail's route (null while a new trail is drawn) and `points` its drawn points; `marcherId`
     * and `transitionId` are the leader's.
     */
    trail?: TrailTarget | null;
    /**
     * A group path with one lane (a Detached copy, AP-R9, or a group path every other spot left),
     * shown and edited as that lane: `from`, `to`, `ends` and `points` are the route's plus the
     * lane's offset, and its one member's offset is zero, so the editor draws and hands back the
     * copy where its marcher walks it; point edits by the route take them so (`editPathPoints`).
     * Absent for every other path.
     */
    lane?: OneLane;
}

/** A one-lane path's lane (`PathTarget.lane`) */
export interface OneLane {
    /** The lane's offset, added to the route's points to show them */
    offset: XY;
    /** The group path it was Detached from (K6), or null */
    detachedFrom: number | null;
}

/** The line that follows a trail: who, in what order, and where each starts and ends */
export interface TrailTarget {
    /** The line, tail first; the leader is the last */
    members: readonly {
        marcherId: number;
        drill: string;
        /** Where it starts (the line-up runs through these) */
        from: XY;
        /** Its end spot (the line runs on through these, from the entrance to the leader's) */
        to: XY;
        /**
         * Its slot's index on `endLine` (step 6): which end spot is its own, by slot, never by
         * where the spots are (an end line may touch itself). Absent while a new trail is drawn.
         */
        endAt?: number;
        /**
         * The beat its founding span ends when that is before the move's end (taken over, or
         * cut by a higher layer, partway): it turns at no corner after it (TC-2). Absent: the end.
         */
        until?: number;
    }[];
    leaderId: number;
    /** Whether the other end leads (R-12′); false while a new trail is drawn */
    reverse: boolean;
    /**
     * Whether the line ends along the way (R-13″, dragged out, step 4b): Reverse is off then
     * (owner, 2026-11-10: drag the trail out of the other end instead)
     */
    along?: boolean;
    /**
     * The end line every slot's destination makes, in the order the line enters it (slot order,
     * or reversed with R-12′), vacant slots included (R-13′): what corner counts read for a trail
     * that isn't along the way (step 6, TC-1). Absent while a new trail is drawn: then it is the
     * members' end spots, tail first.
     */
    endLine?: readonly XY[];
    /**
     * Nobody founds the move (each taken over at its start): the line is shown by its slots, so
     * it can be reversed or removed, but nobody walks the trail, so no corner counts (TC-2)
     */
    unfounded?: boolean;
}

/** A member of a group path: where it starts and ends, and its lane's offset from the reference */
export interface GroupMember {
    marcherId: number;
    transitionId: number;
    drill: string;
    /** Its lane's offset: its lane is the reference line moved by it */
    offset: XY;
    /** Its real start at the move's start (R-14's A) */
    from: XY;
    /** Its end spot (R-14's B) */
    to: XY;
    /** Its lane's row, slot and Adjust (step 3b); absent while a new group path is drawn */
    laneId?: number;
    slot?: number;
    adjust?: AdjustProfile | null;
}

/** Who walks a group path, and the selected marchers in the move who don't (step 15) */
export interface GroupTarget {
    members: readonly GroupMember[];
    /** Selected marchers in the move off the group path; `ownPath` when they walk one */
    outside: readonly {
        marcherId: number;
        drill: string;
        from: XY;
        ownPath: boolean;
        /** Walks a copy Detached from this group path (AP-R9), which Rejoin brings back */
        detached?: boolean;
    }[];
}

/**
 * `target`, a group path with one lane, as that lane (`PathTarget.lane`): the route's ends and
 * points moved by the lane's offset, and the member's offset zero.
 */
export function onItsLane(
    target: PathTarget,
    offset: XY,
    detachedFrom: number | null,
): PathTarget {
    const add = (p: XY): XY => ({ x: p.x + offset.x, y: p.y + offset.y });
    return {
        ...target,
        from: add(target.from),
        to: add(target.to),
        points: target.points.map((p) => ({
            ...p,
            at: [p.at[0] + offset.x, p.at[1] + offset.y] as [number, number],
        })),
        ends: target.ends
            ? { from: add(target.ends.from), to: add(target.ends.to) }
            : null,
        group: target.group && {
            ...target.group,
            members: target.group.members.map((m) => ({
                ...m,
                offset: { x: 0, y: 0 },
            })),
        },
        lane: { offset, detachedFrom },
    };
}

/** A group path in a move as `readGroupPaths` reads it */
export interface GroupPathRow {
    routeId: number;
    marcherIds: readonly number[];
    detachedFrom: number | null;
}

/**
 * Where Rejoin puts the selected marchers (AP-R10), or null when it isn't offered:
 *
 * - a group path shown with selected marchers off it: onto it, those marchers;
 * - a Detached copy shown: onto the group path it came from, never onto the copy (review of
 *   #900, S1), its marcher and any other selected marcher off that path;
 * - nothing shown: onto the one group path every selected copy came from (two detached members of
 *   one group, with another group path in the move), else onto the move's only group path that
 *   isn't a copy.
 *
 * `groups` are the move's group paths (`readGroupPaths`), needed unless a non-copy is shown.
 */
export function rejoinTargetOf(
    shown: PathTarget | null,
    groups: readonly GroupPathRow[] | null,
    timelineId: number,
    selectedIds: readonly number[],
): { timelineId: number; routeId: number; marcherIds: number[] } | null {
    const copyOf = shown?.lane?.detachedFrom ?? null;
    if (shown && copyOf === null) {
        const outside = shown.group?.outside.map((m) => m.marcherId) ?? [];
        return outside.length > 0 && shown.routeId !== null
            ? {
                  timelineId: shown.timelineId,
                  routeId: shown.routeId,
                  marcherIds: outside,
              }
            : null;
    }
    if (!groups) return null;
    const selected = new Set(selectedIds);
    const sources = new Set(
        groups
            .filter(
                (g) =>
                    g.detachedFrom !== null &&
                    g.marcherIds.some((m) => selected.has(m)),
            )
            .map((g) => g.detachedFrom!),
    );
    const main = groups.filter((g) => g.detachedFrom === null);
    const source = copyOf ?? (sources.size === 1 ? [...sources][0]! : null);
    const onto =
        source !== null
            ? groups.find((g) => g.routeId === source)
            : main.length === 1
              ? main[0]
              : undefined;
    if (!onto) return null;
    const off = selectedIds.filter((id) => !onto.marcherIds.includes(id));
    return off.length > 0
        ? { timelineId, routeId: onto.routeId, marcherIds: off }
        : null;
}

/**
 * Whether Paths All draws `target` as a group path object, its one line with faint lanes (AP-O7).
 * A one-lane path (a Detached copy) is one marcher's path, so it draws as an own path does: its
 * marcher's start flag positions' path, at the paths level's normal weight.
 */
export const drawnAsGroup = (target: PathTarget): boolean =>
    target.group !== null && !target.lane;

/**
 * Of the group paths `on` that selected marchers walk, the one to show: the only one, or the only
 * one that isn't a copy Detached from another of them (its detached members are then "outside" it,
 * and Rejoin brings them back). Null when that doesn't pick one.
 */
export function groupToShow<
    G extends { routeId: number; detachedFrom: number | null },
>(on: readonly G[]): G | null {
    if (on.length === 1) return on[0]!;
    const ids = new Set(on.map((g) => g.routeId));
    const main = on.filter(
        (g) => g.detachedFrom === null || !ids.has(g.detachedFrom),
    );
    return main.length === 1 ? main[0]! : null;
}

const xy = (p: readonly [number, number]): XY => ({ x: p[0], y: p[1] });

/** One marcher's move at `beat`, as `findPathTarget` picks it, or null */
async function moveAt(db: DbConnection, marcherId: number, beat: number) {
    const A = schema.timeline_assignments;
    const T = schema.timeline_transitions;
    const row = await db
        .select({ row: A, transition: T })
        .from(A)
        .innerJoin(T, eq(A.transition_id, T.id))
        .where(
            and(
                eq(A.marcher_id, marcherId),
                lte(A.start_beat, beat),
                gt(A.end_beat, beat - 1e-9),
            ),
        )
        .orderBy(desc(A.layer), desc(A.start_beat))
        .all();
    return (
        row.find((r) => r.row.start_beat < beat && beat <= r.row.end_beat) ??
        row.find((r) => r.row.start_beat <= beat && beat < r.row.end_beat) ??
        null
    );
}

/** Why a group path can't be drawn or shown for a selection, or the move they share */
export type GroupMove =
    | { kind: "move"; timelineId: number; start: number; end: number }
    | { kind: "noMove"; marcherId: number }
    | { kind: "twoMoves" };

/** The one move at `beat` that every one of `marcherIds` is in, or why there's none. */
export async function groupMoveAt(
    db: DbConnection,
    marcherIds: readonly number[],
    beat: number,
): Promise<GroupMove> {
    let move: GroupMove | null = null;
    for (const id of marcherIds) {
        const at = await moveAt(db, id, beat);
        if (!at) return { kind: "noMove", marcherId: id };
        const t = at.transition;
        if (move === null)
            move = {
                kind: "move",
                timelineId: t.timeline_id,
                start: t.start_beat,
                end: t.end_beat,
            };
        else if (move.kind === "move" && move.timelineId !== t.timeline_id)
            return { kind: "twoMoves" };
    }
    return move ?? { kind: "twoMoves" };
}

/**
 * The group path to show for the selected `marcherIds` (two or more, or one on a group path) at
 * `beat` (spec Appendix I.8, "What shows"): when they are all in one move, at least one walks a
 * group path there, and every one on a group path walks the same one. Null otherwise.
 */
export async function findGroupTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    marcherIds: readonly number[],
    drills: ReadonlyMap<number, string>,
    beat: number,
): Promise<PathTarget | null> {
    const move = await groupMoveAt(db, marcherIds, beat);
    if (move.kind !== "move") return null;
    const groups = await readGroupPaths(db, move.timelineId);
    const selected = new Set(marcherIds);
    const on = groups.filter((g) => g.marcherIds.some((m) => selected.has(m)));
    const group = groupToShow(on);
    if (!group) return null;
    // Selected marchers on copies Detached from it are off it, and can Rejoin
    const detached = new Set(
        on
            .filter((g) => g.detachedFrom === group.routeId)
            .flatMap((g) => g.marcherIds),
    );
    const route = (await readRoutes(db, move.timelineId)).filter(
        (r) => r.routeId === group.routeId,
    );
    if (route.length === 0) return null;
    const members: GroupMember[] = [];
    const seen = new Set<number>();
    for (const r of [...route].sort((a, b) => a.marcherId - b.marcherId)) {
        if (seen.has(r.marcherId)) continue;
        seen.add(r.marcherId);
        const o = r.offset ?? [0, 0];
        members.push({
            marcherId: r.marcherId,
            transitionId: r.transitionId,
            drill: drills.get(r.marcherId) ?? `${r.marcherId}`,
            offset: { x: o[0], y: o[1] },
            from: xy(resolver.explain(r.marcherId, r.start).origin),
            to: xy(resolver.positionAt(r.marcherId, r.end)),
            laneId: r.laneId,
            slot: r.slot,
            adjust: r.adjust,
        });
    }
    const outside: GroupTarget["outside"][number][] = [];
    for (const id of [...marcherIds].sort((a, b) => a - b)) {
        if (group.marcherIds.includes(id)) continue;
        const at = await moveAt(db, id, beat);
        const lane = at
            ? await laneOn(db, at.transition.id, at.row.slot_index)
            : undefined;
        outside.push({
            marcherId: id,
            drill: drills.get(id) ?? `${id}`,
            from: xy(resolver.explain(id, move.start).origin),
            ownPath: lane !== undefined && lane.offset_x === null,
            ...(detached.has(id) ? { detached: true } : {}),
        });
    }
    const g = route[0]!.geometry;
    const target: PathTarget = {
        timelineId: move.timelineId,
        transitionId: members[0]!.transitionId,
        marcherId: members[0]!.marcherId,
        start: move.start,
        end: move.end,
        from: xy(g.from),
        to: xy(g.to),
        routeId: group.routeId,
        points: g.points,
        ends: { from: xy(g.from), to: xy(g.to) },
        ...toBulgeOf(g),
        drawnEnds: drawnEndsOf(members),
        group: { members, outside },
    };
    return group.laneCount === 1
        ? onItsLane(target, members[0]!.offset, group.detachedFrom)
        : target;
}

/** The ends a saved group path's line is drawn between: its members' middles now (AP-R5) */
const drawnEndsOf = (members: readonly GroupMember[]) => {
    const middle = (ends: readonly XY[]) =>
        xy(meanOf(ends.map((p) => [p.x, p.y] as [number, number])));
    return {
        from: middle(members.map((m) => m.from)),
        to: middle(members.map((m) => m.to)),
    };
};

/**
 * What the pen draws a new group path for (AP-R8): `marcherIds` (two or more) in their one move
 * at `beat`, from the middle of their starts to the middle of their end spots, each member's
 * offset its start less that middle (the means as AP-R8 writes them, in ascending marcher id).
 * When they are exactly a group path's walkers, it is that path drawn again. Or why not.
 */
export async function findGroupDrawTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    marcherIds: readonly number[],
    drills: ReadonlyMap<number, string>,
    beat: number,
): Promise<PathTarget | GroupMove> {
    const move = await groupMoveAt(db, marcherIds, beat);
    if (move.kind !== "move") return move;
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    const starts = ids.map(
        (m) => resolver.explain(m, move.start).origin as [number, number],
    );
    const ends = ids.map(
        (m) => resolver.positionAt(m, move.end) as [number, number],
    );
    const F = meanOf(starts);
    const G = meanOf(ends);
    const members: GroupMember[] = [];
    for (const [i, m] of ids.entries()) {
        const at = (await moveAt(db, m, beat))!;
        members.push({
            marcherId: m,
            transitionId: at.transition.id,
            drill: drills.get(m) ?? `${m}`,
            offset: { x: starts[i]![0] - F[0], y: starts[i]![1] - F[1] },
            from: xy(starts[i]!),
            to: xy(ends[i]!),
        });
    }
    const groups = await readGroupPaths(db, move.timelineId);
    const same = groups.find(
        (g) =>
            g.marcherIds.length === ids.length &&
            g.marcherIds.every((m, i) => m === ids[i]),
    );
    const existing = same
        ? (await readRoutes(db, move.timelineId)).find(
              (r) => r.routeId === same.routeId,
          )
        : undefined;
    return {
        timelineId: move.timelineId,
        transitionId: members[0]!.transitionId,
        marcherId: members[0]!.marcherId,
        start: move.start,
        end: move.end,
        from: xy(F),
        to: xy(G),
        routeId: existing?.routeId ?? null,
        points: existing?.geometry.points ?? [],
        ...(existing ? toBulgeOf(existing.geometry) : {}),
        ends: existing
            ? {
                  from: xy(existing.geometry.from),
                  to: xy(existing.geometry.to),
              }
            : null,
        group: { members, outside: [] },
    };
}

/** A trail read from the show as the target the pen shows, its line in the order it walks now */
function targetOfTrail(
    trail: MoveTrail,
    resolver: Pick<Resolver, "explain" | "positionAt" | "ftlEntry">,
    drills: ReadonlyMap<number, string>,
    { line: endLine, endAt }: TrailEndLine,
): PathTarget | null {
    const entrance = endLine[0] ?? null;
    const entry = resolver.ftlEntry(trail.transitionId);
    // With nobody founding the move (each taken over at its start) the trail still shows, by
    // its line's slots, so it can be reversed or removed
    const line =
        entry.members.length > 0
            ? entry.members
            : trail.reverse
              ? [...trail.marcherIds].reverse()
              : [...trail.marcherIds];
    if (line.length === 0) return null;
    const ends = new Map(entry.targets);
    const members = line.map((m) => {
        const explained = resolver.explain(m, trail.start);
        const until = explained.span.end;
        const at = endAt.get(m);
        return {
            marcherId: m,
            drill: drills.get(m) ?? `${m}`,
            from: xy(explained.origin),
            to: xy(ends.get(m) ?? resolver.positionAt(m, trail.end)),
            ...(at === undefined ? {} : { endAt: at }),
            ...(until < trail.end - 1e-9 ? { until } : {}),
        };
    });
    const leader = members.at(-1)!;
    return {
        timelineId: trail.timelineId,
        transitionId: trail.transitionId,
        marcherId: leader.marcherId,
        start: trail.start,
        end: trail.end,
        from: leader.from,
        to: entrance ?? members[0]!.to,
        routeId: trail.routeId,
        points: trail.geometry.points,
        ...toBulgeOf(trail.geometry),
        ends: { from: xy(trail.geometry.from), to: xy(trail.geometry.to) },
        group: null,
        trail: {
            members,
            leaderId: leader.marcherId,
            reverse: trail.reverse,
            along: trail.along,
            endLine,
            ...(entry.members.length === 0 ? { unfounded: true } : {}),
        },
    };
}

/** A trail's end line, and each marcher's index on it by its slot */
interface TrailEndLine {
    line: XY[];
    endAt: Map<number, number>;
}

/**
 * A trail's end line: every slot's destination in the order the line enters it, the first slot's
 * first, or the last's when reversed (R-13′). Its first is the end spot the line is entered at.
 * With it, each of the line's marchers' index on it, read from its slot (step 6).
 */
async function trailEndLine(
    db: DbConnection,
    trail: MoveTrail,
): Promise<TrailEndLine> {
    const D = schema.timeline_slot_destinations;
    const A = schema.timeline_assignments;
    const spots = await db
        .select()
        .from(D)
        .where(eq(D.transition_id, trail.transitionId))
        .orderBy(D.slot_index)
        .all();
    const rows = await db
        .select({ marcher: A.marcher_id, slot: A.slot_index })
        .from(A)
        .where(eq(A.transition_id, trail.transitionId))
        .all();
    const indexOfSlot = new Map(spots.map((spot, i) => [spot.slot_index, i]));
    const n = spots.length;
    const endAt = new Map<number, number>();
    for (const r of rows) {
        const i = indexOfSlot.get(r.slot);
        if (i !== undefined && r.marcher !== null)
            endAt.set(r.marcher, trail.reverse ? n - 1 - i : i);
    }
    const line = spots.map((spot) => ({ x: spot.x, y: spot.y }));
    return { line: trail.reverse ? line.reverse() : line, endAt };
}

/**
 * The trail to show for the selected `marcherIds` at `beat` (pathways step 4): when they are all
 * in one move and every one of them is in the same follow move's line. Null otherwise.
 */
export async function findTrailTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt" | "ftlEntry">,
    marcherIds: readonly number[],
    drills: ReadonlyMap<number, string>,
    beat: number,
): Promise<PathTarget | null> {
    const move = await groupMoveAt(db, marcherIds, beat);
    if (move.kind !== "move") return null;
    const trails = (await readTrails(db, move.timelineId)).filter((t) =>
        marcherIds.every((m) => t.marcherIds.includes(m)),
    );
    if (trails.length !== 1) return null;
    const trail = trails[0]!;
    return targetOfTrail(
        trail,
        resolver,
        drills,
        await trailEndLine(db, trail),
    );
}

/**
 * The trail `routeId` as a target, read by its route (a trail selected as a path object, AP-O1).
 * Null when it is gone (removed, or undone).
 */
export async function findTrailRouteTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt" | "ftlEntry">,
    routeId: number,
    drills: ReadonlyMap<number, string>,
): Promise<PathTarget | null> {
    const trail = (await readTrails(db)).find((t) => t.routeId === routeId);
    if (!trail) return null;
    return targetOfTrail(
        trail,
        resolver,
        drills,
        await trailEndLine(db, trail),
    );
}

/** Follow refused for the chosen marchers (AP-T1), said before drawing starts */
export type FollowRefused = { kind: "refused"; reason: TimelineText };

/**
 * What Follow draws a trail for (AP-T1): `marcherIds` (two or more) in their one move at `beat`,
 * in the order Follow will give them (`followOrder`), from the leader's start to the tail's end
 * spot. When they are exactly a follow move's line, it is that trail, drawn again. Or why not.
 */
export async function findTrailDrawTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt" | "ftlEntry">,
    marcherIds: readonly number[],
    drills: ReadonlyMap<number, string>,
    beat: number,
): Promise<PathTarget | GroupMove | FollowRefused> {
    const move = await groupMoveAt(db, marcherIds, beat);
    if (move.kind !== "move") return move;
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    // Asked before drawing starts, so a trail that can't be kept is never drawn
    const refusal = await db.transaction((tx) =>
        followTrailRefusal(tx, move.timelineId, ids),
    );
    if (refusal) return { kind: "refused", reason: refusal };
    const existing = (await readTrails(db, move.timelineId)).find(
        (t) =>
            t.marcherIds.length === ids.length &&
            ids.every((m) => t.marcherIds.includes(m)),
    );
    if (existing) {
        const target = targetOfTrail(
            existing,
            resolver,
            drills,
            await trailEndLine(db, existing),
        );
        if (target) return target;
    }
    const starts = ids.map(
        (m) => resolver.explain(m, move.start).origin as [number, number],
    );
    const ends = ids.map(
        (m) => resolver.positionAt(m, move.end) as [number, number],
    );
    const order = followOrder(starts, ends);
    const members = order.map((i) => ({
        marcherId: ids[i]!,
        drill: drills.get(ids[i]!) ?? `${ids[i]}`,
        from: xy(starts[i]!),
        to: xy(ends[i]!),
    }));
    const leader = members.at(-1)!;
    const at = (await moveAt(db, leader.marcherId, beat))!;
    return {
        timelineId: move.timelineId,
        transitionId: at.transition.id,
        marcherId: leader.marcherId,
        start: move.start,
        end: move.end,
        from: leader.from,
        to: members[0]!.to,
        routeId: null,
        points: [],
        ends: null,
        group: null,
        trail: { members, leaderId: leader.marcherId, reverse: false },
    };
}

/**
 * The move of `marcherId` at `beat` that a path is drawn on: the row that holds the beat, the one
 * arriving there when the beat is on its end (a page flag shows where the page arrives), the top
 * layer when rows overlap. Null when the marcher has no move there.
 */
export async function findPathTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    marcherId: number,
    beat: number,
): Promise<PathTarget | null> {
    const A = schema.timeline_assignments;
    const T = schema.timeline_transitions;
    const row = await db
        .select({ row: A, transition: T })
        .from(A)
        .innerJoin(T, eq(A.transition_id, T.id))
        .where(
            and(
                eq(A.marcher_id, marcherId),
                lte(A.start_beat, beat),
                gt(A.end_beat, beat - 1e-9),
            ),
        )
        .orderBy(desc(A.layer), desc(A.start_beat))
        .all();
    // On a row's end the arriving one wins; inside one, the one holding the beat
    const pick =
        row.find((r) => r.row.start_beat < beat && beat <= r.row.end_beat) ??
        row.find((r) => r.row.start_beat <= beat && beat < r.row.end_beat);
    if (!pick) return null;
    const { transition } = pick;
    // A member of a group path has no path of its own (step 15): drawing gives it one (AP-R1)
    const lane = await laneOn(db, transition.id, pick.row.slot_index);
    const ownRouteId =
        lane !== undefined && lane.offset_x === null ? lane.route_id : null;
    const route =
        ownRouteId === null
            ? undefined
            : (await readRoutes(db, transition.timeline_id)).find(
                  (r) => r.routeId === ownRouteId,
              );
    return {
        timelineId: transition.timeline_id,
        transitionId: transition.id,
        marcherId,
        start: transition.start_beat,
        end: transition.end_beat,
        from: xy(resolver.explain(marcherId, transition.start_beat).origin),
        to: xy(resolver.positionAt(marcherId, transition.end_beat)),
        routeId: ownRouteId,
        points: route?.geometry.points ?? [],
        ...(route ? toBulgeOf(route.geometry) : {}),
        ends: route
            ? { from: xy(route.geometry.from), to: xy(route.geometry.to) }
            : null,
        group: null,
    };
}

/**
 * The path `routeId` as a target, read by the path and not by who is selected (spec I.10, AP-O1):
 * a group path with every walker of its lanes as members, or an own path with the marcher on its
 * lane. A selected or open path object is read again this way after each edit, so after spots
 * change hands it still shows the same path, walked by whoever holds its spots now. Null when the
 * route is gone (deleted, or undone) or nobody walks it.
 */
export async function findRouteTarget(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    routeId: number,
    drills: ReadonlyMap<number, string>,
): Promise<PathTarget | null> {
    const entries = (await readRoutes(db)).filter((r) => r.routeId === routeId);
    return targetOfRoute(entries, resolver, drills);
}

/** A route's lanes and walkers (`readRoutes`, one route) as the target the pen shows */
export function targetOfRoute(
    entries: readonly MoveRoute[],
    resolver: Pick<Resolver, "explain" | "positionAt">,
    drills: ReadonlyMap<number, string>,
): PathTarget | null {
    const first = entries[0];
    if (!first) return null;
    const g = first.geometry;
    const span = {
        start: Math.min(...entries.map((r) => r.start)),
        end: Math.max(...entries.map((r) => r.end)),
    };
    const byMarcher = [...entries].sort(
        (a, b) => a.marcherId - b.marcherId || a.start - b.start,
    );
    if (entries.every((r) => r.offset === null)) {
        const r = byMarcher[0]!;
        return {
            timelineId: r.timelineId,
            transitionId: r.transitionId,
            marcherId: r.marcherId,
            start: r.start,
            end: r.end,
            from: xy(resolver.explain(r.marcherId, r.start).origin),
            to: xy(resolver.positionAt(r.marcherId, r.end)),
            routeId: r.routeId,
            points: g.points,
            ends: { from: xy(g.from), to: xy(g.to) },
            ...toBulgeOf(g),
            group: null,
            span,
        };
    }
    const members: GroupMember[] = [];
    const seen = new Set<number>();
    for (const r of byMarcher) {
        if (seen.has(r.marcherId)) continue;
        seen.add(r.marcherId);
        const o = r.offset ?? [0, 0];
        members.push({
            marcherId: r.marcherId,
            transitionId: r.transitionId,
            drill: drills.get(r.marcherId) ?? `${r.marcherId}`,
            offset: { x: o[0], y: o[1] },
            from: xy(resolver.explain(r.marcherId, r.start).origin),
            to: xy(resolver.positionAt(r.marcherId, r.end)),
            laneId: r.laneId,
            slot: r.slot,
            adjust: r.adjust,
        });
    }
    const target: PathTarget = {
        timelineId: first.timelineId,
        transitionId: members[0]!.transitionId,
        marcherId: members[0]!.marcherId,
        start: first.start,
        end: first.end,
        from: xy(g.from),
        to: xy(g.to),
        routeId: first.routeId,
        points: g.points,
        ends: { from: xy(g.from), to: xy(g.to) },
        ...toBulgeOf(g),
        drawnEnds: drawnEndsOf(members),
        group: { members, outside: [] },
        span,
    };
    return first.laneCount === 1
        ? onItsLane(target, members[0]!.offset, first.detachedFrom)
        : target;
}

/**
 * Whether Re-fit has anything to do (decision A, spec J.8): a saved path whose ends now differ from
 * the stored ones by more than the app's geometry tolerance.
 */
export function refitNeeded(target: PathTarget): boolean {
    // A trail's drawn part always runs from the leader to the entrance as they are now (R-9′)
    if (target.trail) return false;
    if (target.routeId === null || !target.ends) return false;
    const now = target.drawnEnds ?? { from: target.from, to: target.to };
    const pair = (p: XY): [number, number] => [p.x, p.y];
    return routeEndsChanged(
        { from: pair(target.ends.from), to: pair(target.ends.to) },
        // A one-lane path keeps the group's `to`: its end side follows its end spot (AP-R5), so
        // only a start that moved asks for Re-fit
        {
            from: pair(now.from),
            to: pair(target.lane ? target.ends.to : now.to),
        },
    );
}

/**
 * Whether a lane's transition `[start, end]` is the walker's move at `beat`, by the rule a
 * selected marcher's path is found by (`findPathTarget`): the move holding the beat, or arriving
 * on it when the beat is its end. `arrives` says whether the walker has another row arriving on
 * `beat` (its end is `beat`), which wins over one leaving from it.
 */
export function moveIsAt(
    span: { start: number; end: number },
    beat: number,
    arrives: boolean,
): boolean {
    if (span.start < beat && beat <= span.end) return true;
    return span.start === beat && beat < span.end && !arrives;
}

/**
 * Every route's lanes and walkers, and each walker's rows, read once per timeline version so a
 * playhead step only filters them (`pathObjectsAt`). Targets are built the first time a route is
 * at the playhead and kept, so the same route gives the same target (and drawing) until the next
 * version.
 */
export interface PathObjectIndex {
    /** Each route's entries (`readRoutes`), by route id in id order */
    readonly routes: ReadonlyMap<number, readonly MoveRoute[]>;
    /** Every row of each marcher that walks a route, for "a row arriving on the beat" */
    readonly rows: ReadonlyMap<
        number,
        readonly { start: number; end: number }[]
    >;
    /** Targets built so far, for `drills` */
    targets: Map<number, PathTarget | null>;
    drills: ReadonlyMap<number, string> | null;
}

/** How many marcher ids go in one `IN (...)`, under SQLite's bound-parameter limit */
const IDS_PER_QUERY = 500;

/** Reads the routes and their walkers' rows for `pathObjectsAt` (spec I.10, AP-O2). */
export async function readPathObjectIndex(
    db: DbConnection,
): Promise<PathObjectIndex> {
    const all = await readRoutes(db);
    const routes = new Map<number, MoveRoute[]>();
    for (const r of all) {
        const list = routes.get(r.routeId) ?? [];
        list.push(r);
        routes.set(r.routeId, list);
    }
    const A = schema.timeline_assignments;
    const walkers = [...new Set(all.map((r) => r.marcherId))];
    const rows = new Map<number, { start: number; end: number }[]>();
    for (let i = 0; i < walkers.length; i += IDS_PER_QUERY) {
        const found = await db
            .select({
                marcherId: A.marcher_id,
                start: A.start_beat,
                end: A.end_beat,
            })
            .from(A)
            .where(inArray(A.marcher_id, walkers.slice(i, i + IDS_PER_QUERY)))
            .all();
        for (const r of found) {
            const list = rows.get(r.marcherId) ?? [];
            list.push({ start: r.start, end: r.end });
            rows.set(r.marcherId, list);
        }
    }
    return { routes, rows, targets: new Map(), drills: null };
}

/**
 * Every path in a move at `beat` (spec I.10, AP-O2), from `index`: the paths Paths **All** draws
 * and lets a click select with nothing selected. A route is at the beat when one of its walkers'
 * rows on its lanes is that walker's move there (`moveIsAt`). By route id. No database read: the
 * same route gives the same target while `index` and `drills` are the same.
 */
export function pathObjectsAt(
    index: PathObjectIndex,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    beat: number,
    drills: ReadonlyMap<number, string>,
): PathTarget[] {
    if (index.drills !== drills) {
        index.targets = new Map();
        index.drills = drills;
    }
    // A row arriving on the beat wins over one leaving from it
    const arrives = (marcherId: number) =>
        (index.rows.get(marcherId) ?? []).some(
            (r) => r.start <= beat - 1e-9 && r.end > beat - 1e-9,
        );
    const out: PathTarget[] = [];
    for (const [routeId, entries] of index.routes) {
        const at = entries.some((r) =>
            moveIsAt(r, beat, r.start === beat && arrives(r.marcherId)),
        );
        if (!at) continue;
        let target = index.targets.get(routeId);
        if (target === undefined) {
            target = targetOfRoute(entries, resolver, drills);
            index.targets.set(routeId, target);
        }
        if (target) out.push(target);
    }
    return out;
}

/** `pathObjectsAt` with the index read now: every path in a move at `beat` (AP-O2) */
export async function findPathObjects(
    db: DbConnection,
    resolver: Pick<Resolver, "explain" | "positionAt">,
    beat: number,
    drills: ReadonlyMap<number, string>,
): Promise<PathTarget[]> {
    return pathObjectsAt(await readPathObjectIndex(db), resolver, beat, drills);
}
