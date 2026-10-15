/**
 * State behind the Assets sidebar tab (owner decision Q76): the running
 * import review, if any, and the Library items to highlight after a commit.
 *
 * The review lives here rather than in the Import… button, so closing the
 * Assets panel (or Esc, which closes every sidebar panel) never ends an
 * import. `AssetsHost` renders the review and reopens the panel.
 */
import { create } from "zustand";
import {
    createImportReview,
    type ImportReviewClient,
    type ImportReviewStore,
} from "@/components/library/import/importReview";

export interface AssetsHighlight {
    itemIds: string[];
    /** Bumped on every commit, so the same ids highlight again. */
    seq: number;
}

interface AssetsState {
    review: ImportReviewStore | null;
    highlight: AssetsHighlight | null;
    /** Opens the file dialog and, once files are picked, the review. */
    startImport(client: ImportReviewClient): void;
    /** Clears the highlight if it's still the one with this `seq`. */
    clearHighlight(seq: number): void;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
    review: null,
    highlight: null,

    startImport(client) {
        if (get().review) return;
        const review = createImportReview(client, {
            onClose: () => {
                if (get().review === review) set({ review: null });
            },
            // Land on the Library with the new items highlighted. Pages the
            // pipeline skipped keep the summary open so its notes are read.
            onCommitted: (itemIds, done) => {
                if (itemIds.length > 0) {
                    set({
                        highlight: {
                            itemIds,
                            seq: (get().highlight?.seq ?? 0) + 1,
                        },
                    });
                }
                if (done.notImported.length === 0) review.getState().close();
            },
            // A cancelled artwork import ended the review: show the Library,
            // which holds whatever was stored before the cancel.
            onCommitStopped: () => {
                set({
                    highlight: {
                        itemIds: [],
                        seq: (get().highlight?.seq ?? 0) + 1,
                    },
                });
            },
        });
        set({ review });
        void review.getState().pick("any");
    },

    clearHighlight(seq) {
        if (get().highlight?.seq === seq) set({ highlight: null });
    },
}));
