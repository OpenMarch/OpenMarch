import { fitCircle } from "./geometry/fit";
import { leastTravel, type LeastTravelSolver } from "./leastTravel";
import type { AnyShapeKind, ShapeContext, Slot, XY } from "./types";

/**
 * Which marcher goes to which slot. The tool assigns once when it opens (or when the order mode
 * changes) and keeps that assignment while handles are dragged, so marchers don't swap spots
 * under the cursor. Reassigning is explicit.
 */

export type OrderMode =
    /** Least travel (see `leastTravel.ts`), so straight moves don't pass through each other */
    | "nearest"
    /** Marchers keep their order along the shape (their current order projected onto it) */
    | "keep";

/**
 * Who goes where as the floating editor offers it on a kind with an order along it (a Line, #528):
 * Least travel, Keep order, or Reverse order (Keep order the other way round). Stored as a recipe's
 * order mode and reverse ({@link orderFields}).
 */
export type OrderChoice = "nearest" | "keep" | "reverse";

/** Who goes where on a kind: its choice when it has an order along it (a Line), Least travel otherwise */
export const orderOn = (
    kind: { readonly ordered?: boolean },
    choice: OrderChoice,
): OrderChoice => (kind.ordered ? choice : "nearest");

/** A choice as a recipe stores it */
export const orderFields = (
    choice: OrderChoice,
): { orderMode: OrderMode; reverse: boolean } =>
    choice === "nearest"
        ? { orderMode: "nearest", reverse: false }
        : { orderMode: "keep", reverse: choice === "reverse" };

/**
 * A recipe's order mode and reverse as a choice; anything older (drill order) is Least travel.
 * Least travel has no order, so a reverse stored with it is ignored here, and the Line's next save
 * writes it back as false ({@link orderFields}).
 */
export const orderChoiceOf = (
    orderMode: string,
    reverse: boolean,
): OrderChoice =>
    orderMode === "keep" ? (reverse ? "reverse" : "keep") : "nearest";

export interface AssignMarcher {
    readonly id: number;
    /** Where the marcher is drawn now, at the moment being edited: what a shape fits through */
    readonly at: XY;
    /**
     * Where the marcher starts the move being edited (its position at the start flag), when that
     * differs from `at`. Who goes where is decided from here, so the move reads cleanly from where
     * marchers really come from, not from the spots the edit replaces.
     */
    readonly from?: XY;
    /** Sort position by drill number (drill prefix, then number): breaks ties in keep order */
    readonly drillRank: number;
    /**
     * The marcher's place along the placed Line it comes from (its slot there), when every marcher
     * being assigned is a member of that one Line: keep order follows it (#528)
     */
    readonly along?: number;
}

/** Above this many marchers, nearest falls back to keep order (the solve is cubic). */
export const NEAREST_LIMIT = 500;

const compareKeys = (a: readonly number[], b: readonly number[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
};

/**
 * @returns the slot index for each marcher, in `marchers` order
 */
export function assignSlots<P>({
    kind,
    params,
    slots,
    marchers,
    mode,
    reverse = false,
    ctx,
    solve = leastTravel,
}: {
    kind: AnyShapeKind;
    params: P;
    slots: readonly Slot[];
    marchers: readonly AssignMarcher[];
    mode: OrderMode;
    reverse?: boolean;
    ctx: ShapeContext;
    /** Replaces how "nearest" decides who goes where (defaults to `leastTravel`) */
    solve?: LeastTravelSolver;
}): number[] {
    const n = marchers.length;
    if (slots.length !== n)
        throw new Error("Each marcher needs exactly one slot");
    if (n === 0) return [];

    if (mode === "nearest" && n <= NEAREST_LIMIT)
        return solve(
            marchers.map((m) => m.from ?? m.at),
            slots,
        );

    if (mode === "keep" && marchers.every((m) => m.along !== undefined))
        return alongOrder(marchers, slots, reverse);

    if (mode === "keep") {
        const around = ringOrder(marchers);
        if (around)
            return openRing(
                around,
                marchers,
                slots,
                kind,
                params,
                ctx,
                reverse,
            );
    }

    const slotOrder = slots
        .map((slot, index) => ({
            index,
            key: kind.orderKey(params, slot, ctx, n),
        }))
        .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
        .map((entry) => entry.index);
    if (reverse) slotOrder.reverse();

    const marcherOrder = marchers
        .map((m, index) => ({
            index,
            key: kind.orderKey(params, m.from ?? m.at, ctx, n),
            rank: m.drillRank,
        }))
        .sort((a, b) => compareKeys(a.key, b.key) || a.rank - b.rank)
        .map((entry) => entry.index);

    const result = new Array<number>(n);
    marcherOrder.forEach((marcherIndex, i) => {
        result[marcherIndex] = slotOrder[i]!;
    });
    return result;
}

/**
 * Marchers in their order along the Line they come from, laid on the spots in the shape's order:
 * how far along a path each spot is when it says, the kind's order otherwise
 */
function alongOrder(
    marchers: readonly AssignMarcher[],
    slots: readonly Slot[],
    reverse: boolean,
): number[] {
    const slotOrder = slots
        .map((slot, index) => ({ index, s: slot.s ?? index }))
        .sort((a, b) => a.s - b.s || a.index - b.index)
        .map((entry) => entry.index);
    if (reverse) slotOrder.reverse();
    const result = new Array<number>(marchers.length);
    marchers
        .map((m, index) => ({ index, along: m.along!, rank: m.drillRank }))
        .sort((a, b) => a.along - b.along || a.rank - b.rank)
        .forEach((entry, i) => {
            result[entry.index] = slotOrder[i]!;
        });
    return result;
}

/** How round a group must be (largest gap from its circle, over the radius) to count as a ring */
const RING_TOLERANCE = 0.15;

/**
 * The marchers in order around the circle they stand on, when they do (5 or more, all near one
 * circle), by index. Keep order then follows the ring rather than projecting the marchers onto
 * the new shape, which scrambles a circle opened into an arc (sims, round 9: "151 crossings";
 * a drill writer expects the circle to peel open in order).
 */
function ringOrder(marchers: readonly AssignMarcher[]): number[] | null {
    if (marchers.length < 5) return null;
    const points = marchers.map((m) => m.from ?? m.at);
    const circle = fitCircle(points);
    if (!circle || !(circle.r > 0)) return null;
    const off = Math.max(
        ...points.map((p) =>
            Math.abs(
                Math.hypot(p.x - circle.center.x, p.y - circle.center.y) -
                    circle.r,
            ),
        ),
    );
    if (off > RING_TOLERANCE * circle.r) return null;
    return points
        .map((p, index) => ({
            index,
            angle: Math.atan2(p.y - circle.center.y, p.x - circle.center.x),
        }))
        .sort((a, b) => a.angle - b.angle)
        .map((e) => e.index);
}

/**
 * Lays a ring of marchers along the shape's slot order, keeping their order around the ring:
 * the ring is opened where the least travel results, in whichever direction travels less
 * (Reverse takes the other direction).
 */
function openRing<P>(
    around: readonly number[],
    marchers: readonly AssignMarcher[],
    slots: readonly Slot[],
    kind: AnyShapeKind,
    params: P,
    ctx: ShapeContext,
    reverse: boolean,
): number[] {
    const n = marchers.length;
    const slotOrder = slots
        .map((slot, index) => ({
            index,
            key: kind.orderKey(params, slot, ctx, n),
        }))
        .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
        .map((entry) => entry.index);
    const at = marchers.map((m) => m.from ?? m.at);
    const best = (direction: 1 | -1) => {
        let bestStart = 0;
        let bestCost = Infinity;
        for (let start = 0; start < n; start++) {
            let cost = 0;
            for (let i = 0; i < n && cost < bestCost; i++) {
                const m = at[around[(start + direction * i + n * n) % n]!]!;
                const s = slots[slotOrder[i]!]!;
                cost += (m.x - s.x) ** 2 + (m.y - s.y) ** 2;
            }
            if (cost < bestCost) {
                bestCost = cost;
                bestStart = start;
            }
        }
        return { direction, start: bestStart, cost: bestCost };
    };
    const forward = best(1);
    const backward = best(-1);
    const [first, second] =
        forward.cost <= backward.cost
            ? [forward, backward]
            : [backward, forward];
    const pick = reverse ? second : first;
    const result = new Array<number>(n);
    for (let i = 0; i < n; i++)
        result[around[(pick.start + pick.direction * i + n * n) % n]!] =
            slotOrder[i]!;
    return result;
}
