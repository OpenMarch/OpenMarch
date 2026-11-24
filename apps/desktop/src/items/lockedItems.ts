import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";

/**
 * The marchers rows of the locked items (the pit's equipment and anything else locked). A prop
 * is a marcher with a size and a rotation (props epic, fork #1239): every marcher tool takes
 * props and unlocked equipment, and leaves only these out.
 */
export function useLockedItemIds(): ReadonlySet<number> {
    const { data: items } = useQuery(allItemsQueryOptions());
    return useMemo(
        () =>
            new Set(
                (items ?? [])
                    .filter((item) => item.locked)
                    .map((item) => item.marcher_id),
            ),
        [items],
    );
}

/** `marchers` without the locked items among them, in their order */
export const withoutLocked = <T extends { id: number }>(
    marchers: readonly T[],
    locked: ReadonlySet<number>,
): T[] =>
    locked.size === 0
        ? [...marchers]
        : marchers.filter((marcher) => !locked.has(marcher.id));

/** The selection a marcher tool acts on: everything selected but the locked items */
export function useUnlockedOnly<T extends { id: number }>(
    marchers: readonly T[] | undefined,
): T[] {
    const locked = useLockedItemIds();
    return useMemo(
        () => withoutLocked(marchers ?? [], locked),
        [marchers, locked],
    );
}
