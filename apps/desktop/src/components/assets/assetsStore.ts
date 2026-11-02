/**
 * State behind the Assets sidebar tab (owner decision Q76): the running
 * import review, if any, and the Library items to highlight after a commit.
 *
 * The review lives here rather than in the Import… button, so closing the
 * Assets panel (or Esc, which closes every sidebar panel) never ends an
 * import. `AssetsHost` renders the review, reopens the panel and embeds
 * each import in the open show.
 */
import { create } from "zustand";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import {
    createImportReview,
    type ImportReviewClient,
    type ImportReviewStore,
} from "@/components/library/import/importReview";
import type { ImportedVersion } from "@/view3d/library/showLibraryEmbed";
import type { PickContext, PickPurpose } from "@/view3d/library/protocol";

/** What a contextual link ("Upload floor…") starts an import with. */
export interface StartImportOptions {
    /** Defaults to `any`, as the Assets panel's Import… */
    purpose?: PickPurpose;
    /** Pre-fills the review: surface, size, kind */
    context?: PickContext;
    /** Runs once the show holds its copy of what was saved, such as setting the floor */
    onEmbedded?: (saved: ImportedVersion[]) => void | Promise<void>;
}

export interface AssetsHighlight {
    itemIds: string[];
    /** Bumped on every commit, so the same ids highlight again. */
    seq: number;
}

interface AssetsState {
    review: ImportReviewStore | null;
    highlight: AssetsHighlight | null;
    /**
     * Embeds saved Versions in the open show (ADR 0002 D-12). Set by
     * `AssetsHost`, read at commit time so a review outlives the panel.
     */
    onImported: ((saved: ImportedVersion[]) => Promise<void> | void) | null;
    setOnImported(
        onImported: ((saved: ImportedVersion[]) => Promise<void> | void) | null,
    ): void;
    /** Opens the file dialog and, once files are picked, the review. */
    startImport(client: ImportReviewClient, options?: StartImportOptions): void;
    /** Clears the highlight if it's still the one with this `seq`. */
    clearHighlight(seq: number): void;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
    review: null,
    highlight: null,
    onImported: null,

    setOnImported(onImported) {
        set({ onImported });
    },

    startImport(client, { purpose = "any", context, onEmbedded } = {}) {
        if (get().review) return;
        const review = createImportReview(client, {
            onClose: () => {
                if (get().review === review) set({ review: null });
            },
            onImported: (saved) => {
                void (async () => {
                    const embed = get().onImported;
                    // Without the show's copy there's nothing for onEmbedded to name
                    if (!embed) return;
                    try {
                        await embed(saved);
                    } catch {
                        // The embed reports its own failure
                        return;
                    }
                    try {
                        await onEmbedded?.(saved);
                    } catch (error) {
                        conToastError(
                            tolgee.t("library.import.finishFailed"),
                            error,
                        );
                    }
                })();
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
        void review.getState().pick(purpose, context);
    },

    clearHighlight(seq) {
        if (get().highlight?.seq === seq) set({ highlight: null });
    },
}));
