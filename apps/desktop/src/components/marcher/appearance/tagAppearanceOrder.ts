import { arrayMove } from "@dnd-kit/sortable";

/**
 * Moves one tag appearance in a page's list (shown highest priority first)
 * and returns the new order with priorities renumbered to match it.
 * Returns null when the move does nothing or an index is out of range.
 */
export function reorderTagAppearances<T extends { priority: number }>(
    order: readonly T[],
    fromIndex: number,
    toIndex: number,
): T[] | null {
    if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= order.length ||
        toIndex >= order.length
    )
        return null;
    return arrayMove([...order], fromIndex, toIndex).map((item, index) => ({
        ...item,
        priority: order.length - 1 - index,
    }));
}
