import {
    hungarianAlgorithm,
    type PathStyle,
    type ShapeRow,
    type TransitionRow,
    type XY,
} from "@openmarch/core";
import { shapeSlotPoints } from "./timelineTransitionEditor";

/**
 * Casting (P8.4): which slot of a transition each marcher takes. Pure; the assignment
 * db-functions (`timelineAssignmentEdits.ts`) read the positions and run the writes.
 *
 * Nearest-slot casting gives each marcher a slot so that the total distance from where the
 * marchers are to their slots' destinations is as small as it can be. It is the same Hungarian
 * solve as core's `computeOptimalCoordinateMapping`, called through `hungarianAlgorithm`
 * directly: that wrapper needs as many marchers as targets and answers with coordinates, and
 * casting needs slot indexes with vacancies left over (D-13), where two slots can share a point.
 *
 * Nearest-slot casting assumes slot `i` goes to point `p_i`, which holds only for the order-free
 * styles (direct and arc, R-7, R-8). Follow the leader sends its founders to `p_{n-m+q}` by trail
 * order (R-9 step 5, R-12): under `inherit` the founders' slots don't matter at all, and one more
 * founder shifts every target. So follow the leader is never cast by nearest slot: new marchers
 * take the lowest vacant slots (`castSlots`), and recasting it is refused.
 */

/** Whether `style` sends slot `i` to point `p_i` (R-7, R-8), so nearest-slot casting means something. */
export const castsByNearestSlot = (style: PathStyle): boolean =>
    style !== "follow_the_leader";

/**
 * The most slots casting solves for. The solve is cubic in the slot count: 500 slots take about
 * 30 ms (measured), which is fine for one click; a bigger transition is cast by hand.
 */
export const MAX_CAST_SLOTS = 500;

/** A marcher and where it stands; null when it never moves in the transition (any slot is free). */
export interface CastMarcher {
    readonly id: number;
    readonly xy: XY | null;
}

/** A slot and its destination. */
export interface CastSlot {
    readonly slot: number;
    readonly xy: XY;
}

const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The slot destinations of `transition`, in slot order: its shape's samples (R-13), or its
 * individually placed points (D-16).
 */
export function transitionSlotPoints(
    transition: TransitionRow,
    shapes: Readonly<Record<number, ShapeRow>>,
): XY[] {
    if (transition.dest === null)
        return (transition.points ?? []).map((p): XY => [p[0], p[1]]);
    const shape = shapes[transition.dest];
    if (!shape) throw new Error(`shape ${transition.dest} is missing`);
    return shapeSlotPoints(shape, transition.slots);
}

/**
 * Nearest-slot casting: a slot for every marcher, chosen among `slots`, that makes the total
 * distance from the marchers to their slots as small as possible. Needs at least as many slots
 * as marchers; the slots left over stay vacant.
 *
 * @returns marcher id to slot index
 */
export function nearestSlots(
    marchers: readonly CastMarcher[],
    slots: readonly CastSlot[],
): Map<number, number> {
    const cast = new Map<number, number>();
    if (marchers.length === 0) return cast;
    if (slots.length < marchers.length)
        throw new Error(
            `${slots.length} slots can't take ${marchers.length} marchers`,
        );
    const n = slots.length;
    // A square problem: the rows past the marchers are free, so they take the vacancies
    const cost = Array.from({ length: n }, (_, i) => {
        const marcher = marchers[i];
        return slots.map((s) => (marcher?.xy ? distance(marcher.xy, s.xy) : 0));
    });
    // assignment[j] = i: slot j (1-based) goes to row i (1-based)
    const assignment = hungarianAlgorithm(cost, n);
    for (let j = 1; j <= n; j++) {
        const marcher = marchers[assignment[j]! - 1];
        if (marcher) cast.set(marcher.id, slots[j - 1]!.slot);
    }
    return cast;
}

/** The total distance from each marcher to its slot under `cast`. */
export function castDistance(
    marchers: readonly CastMarcher[],
    points: readonly XY[],
    cast: ReadonlyMap<number, number>,
): number {
    let total = 0;
    for (const m of marchers) {
        const point = points[cast.get(m.id)!];
        if (point && m.xy) total += distance(m.xy, point);
    }
    return total;
}

/**
 * The slots for new marchers in a transition: by nearest slot (`nearestSlots`) for an order-free
 * style, and otherwise, or past `MAX_CAST_SLOTS`, the lowest of `slots` in the marchers' order
 * (follow the leader orders its marchers by trail, not by slot; a bigger solve is too slow for
 * one click).
 */
export function castSlots(
    style: PathStyle,
    marchers: readonly CastMarcher[],
    slots: readonly CastSlot[],
): Map<number, number> {
    if (castsByNearestSlot(style) && slots.length <= MAX_CAST_SLOTS)
        return nearestSlots(marchers, slots);
    if (slots.length < marchers.length)
        throw new Error(
            `${slots.length} slots can't take ${marchers.length} marchers`,
        );
    const lowest = [...slots].sort((a, b) => a.slot - b.slot);
    return new Map(marchers.map((m, i) => [m.id, lowest[i]!.slot]));
}
