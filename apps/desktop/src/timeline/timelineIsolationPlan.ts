import { create } from "zustand";
import type { Resolver, XY } from "@openmarch/core";

/**
 * The isolated timeline's plan (docs/timeline/research/ownership/09-isolation.md, owner
 * 2026-10-04: "the plan dot is the marcher"). While a timeline is isolated and paused, its members
 * are drawn, selected and edited where the timeline's plan puts them, as if no other move took
 * them partway: a stolen member stands where the move would take it, and dragging it edits the
 * move's destination for it. Where it really goes is drawn as context by the focus layer.
 *
 * `useTimelineFocusRender` publishes the plan; the static render and the coordinate tools read it.
 */
export interface IsolationPlan {
    readonly timelineId: number;
    /** A resolver over the timeline's rows alone (`planResolver`) */
    readonly plan: Resolver;
    readonly members: ReadonlySet<number>;
}

interface IsolationPlanState {
    readonly current: IsolationPlan | null;
    readonly set: (current: IsolationPlan | null) => void;
}

export const useIsolationPlanStore = create<IsolationPlanState>((set) => ({
    current: null,
    set: (current) => set({ current }),
}));

/**
 * Where a marcher is drawn and edited at `beat`: the isolated timeline's plan for its members,
 * else the real show (`resolver`).
 */
export function editingPositionAt(
    resolver: Pick<Resolver, "positionAt">,
    marcherId: number,
    beat: number,
    isolation: IsolationPlan | null = useIsolationPlanStore.getState().current,
): XY {
    return isolation?.members.has(marcherId)
        ? isolation.plan.positionAt(marcherId, beat)
        : resolver.positionAt(marcherId, beat);
}

/**
 * Overwrites the isolated members' entries of a position buffer (`[x0, y0, x1, y1, ...]` in
 * `ids` order) with the plan's positions at `beat`.
 */
export function applyIsolationPlan(
    positions: Float64Array,
    ids: readonly number[],
    beat: number,
    isolation: IsolationPlan | null = useIsolationPlanStore.getState().current,
): void {
    if (!isolation) return;
    ids.forEach((id, i) => {
        if (!isolation.members.has(id)) return;
        const [x, y] = isolation.plan.positionAt(id, beat);
        positions[2 * i] = x;
        positions[2 * i + 1] = y;
    });
}
