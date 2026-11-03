import {
    orderChoiceOf,
    orderOn,
    type AssignMarcher,
    type OrderChoice,
} from "../assign";
import type { PlacedBox } from "./placedBox";

/**
 * Who goes where and placed shapes (#528, spec #522). Everything here is pure.
 */

/**
 * The marchers, each with their place along the placed Line they stand on, when every one of them
 * is a member of that one Line (a kind with an order, `ToolKind.ordered`): a shape opened on them
 * can keep their order along it. The first such Line counts when they share more than one.
 * Unchanged otherwise.
 *
 * @param boxes the placed shapes shown where the marchers were selected
 */
export function withPlacedOrder(
    marchers: readonly AssignMarcher[],
    boxes: readonly PlacedBox[],
): AssignMarcher[] {
    if (marchers.length === 0) return [];
    for (const line of boxes) {
        if (!line.kind.ordered) continue;
        // Their spots along it, first to last, whichever order it was laid out in
        const slotOf = new Map(
            line.recipe.members.map((m) => [m.marcherId, m.slot] as const),
        );
        if (marchers.every((m) => slotOf.has(m.id)))
            return marchers.map((m) => ({ ...m, along: slotOf.get(m.id)! }));
    }
    return [...marchers];
}

/**
 * A member's place in the order a placed Line keeps, from its slot: the same, or counted from the
 * far end when the Line was saved as Reverse. Picking Keep order or Reverse again goes from here,
 * so a pick that's already saved moves no one.
 */
export const placedAlong = (box: PlacedBox, slot: number): number =>
    placedOrderChoice(box) === "reverse" ? box.spots - 1 - slot : slot;

/** Who goes where a placed shape was laid out by: its recipe's order mode and reverse */
export const placedOrderChoice = (box: PlacedBox): OrderChoice =>
    orderOn(box.kind, orderChoiceOf(box.recipe.orderMode, box.recipe.reverse));
