/**
 * Step 15's route fixtures, moved to lanes (spec v0.10, plan step 24; QA-MIG-L2 in memory).
 *
 * The route tests were written against step 15's storage: a transition with `style: "route"`, its
 * `route`, and `params.offset` for a group member. `withLanes` rewrites each such transition as
 * migration 0025 rewrites a file: the transition becomes `direct` with no params, and slot 0 gets
 * a lane on its route with the offset (null for an own path). The tests' expected values are step
 * 15's, so every one of them that still passes is the bit-identity QA-RT-L1 asks for.
 */
import type {
    LaneRow,
    PathParams,
    PathStyle,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";

/** A transition as step 15 stored it. */
export type RouteTransitionFixture = Omit<TransitionRow, "style" | "params"> & {
    style: PathStyle | "route";
    params: (PathParams & { offset?: XY }) | null;
    route?: number | null;
};

/** A show as step 15 stored it. */
export type RouteShowFixture = Omit<TimelineSnapshot, "transitions"> & {
    transitions: Record<number, RouteTransitionFixture>;
};

/** The step 15 show `show` with its route transitions moved to lanes (QA-MIG-L2). */
export function withLanes(show: RouteShowFixture): TimelineSnapshot {
    const transitions: Record<number, TransitionRow> = {};
    const lanes: Record<number, LaneRow> = { ...(show.lanes ?? {}) };
    let nextLane = Math.max(0, ...Object.keys(lanes).map((k) => Number(k))) + 1;
    for (const [id, t] of Object.entries(show.transitions)) {
        const { route, ...rest } = t;
        if (t.style !== "route") {
            transitions[Number(id)] = rest as TransitionRow;
            continue;
        }
        if (route == null)
            throw new Error(`route transition ${id} has no route`);
        transitions[Number(id)] = { ...rest, style: "direct", params: null };
        lanes[nextLane++] = {
            transition: t.id,
            slot: 0,
            route,
            offset: t.params?.offset ?? null,
        };
    }
    return { ...show, transitions, lanes };
}

/** The lane on slot `slot` of transition `tid`, if any, with its id. */
export function laneOn(
    show: TimelineSnapshot,
    tid: number,
    slot = 0,
): (LaneRow & { id: number }) | undefined {
    for (const [id, l] of Object.entries(show.lanes ?? {}))
        if (l.transition === tid && l.slot === slot)
            return { ...l, id: Number(id) };
    return undefined;
}

/** The offset of the lane on slot 0 of transition `tid` (a group member's). */
export function offsetOn(show: TimelineSnapshot, tid: number): XY {
    const o = laneOn(show, tid)?.offset;
    if (!o) throw new Error(`transition ${tid} has no group lane`);
    return o;
}
