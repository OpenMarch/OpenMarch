import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

const emptySet = new Set<number>();

const highlightedMarchersStore = create(
    combine(
        { highlightedMarcherIds: emptySet as ReadonlySet<number> },
        (set) => ({
            setHighlightedMarcherIds: (ids: Iterable<number> | null) =>
                set({
                    highlightedMarcherIds:
                        ids == null ? emptySet : new Set(ids),
                }),
            clearHighlightedMarchers: () =>
                set({ highlightedMarcherIds: emptySet }),
        }),
    ),
);

export const useHighlightedMarchersStore = createSelectors(
    highlightedMarchersStore,
);
