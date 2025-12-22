import {
    createTags,
    NewTagArgs,
    ModifiedTagArgs,
    updateTagsInTransaction,
    deleteTagsInTransaction,
    createTagAppearances,
    NewTagAppearanceArgs,
    ModifiedTagAppearanceArgs,
    TagAppearance,
    updateTagAppearances,
    deleteTagAppearances,
    createMarcherTags,
    NewMarcherTagArgs,
    ModifiedMarcherTagArgs,
    updateMarcherTags,
    deleteMarcherTags,
    transactionWithHistory,
    createNewTagFromMarcherIds,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { QueryClient, mutationOptions } from "@tanstack/react-query";
import { tagKeys, invalidateTagQueries } from "./queries";
import { conToastError } from "@/utilities/utils";

// ============================================================================
// TAGS MUTATIONS
// ============================================================================

/**
 * Mutation options for creating tags
 */
export const createTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newTags: NewTagArgs[]) => createTags({ db, newTags }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error creating tags", e, variables);
        },
    });
};

/**
 * Mutation options for updating tags
 */
export const updateTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedTags: ModifiedTagArgs[]) =>
            transactionWithHistory(db, "updateTags", async (tx) => {
                return await updateTagsInTransaction({ modifiedTags, tx });
            }),
        onSuccess: async (_, variables) => {
            // Invalidate specific tag queries
            for (const modifiedTag of variables) {
                void qc.invalidateQueries({
                    queryKey: tagKeys.byId(modifiedTag.id),
                });
            }
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error updating tags", e, variables);
        },
    });
};

/**
 * Mutation options for deleting tags
 */
export const deleteTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (tagIds: Set<number>) =>
            transactionWithHistory(db, "deleteTags", async (tx) => {
                return await deleteTagsInTransaction({ tagIds, tx });
            }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error deleting tags", e, variables);
        },
    });
};

// ============================================================================
// TAG APPEARANCES MUTATIONS
// ============================================================================

/**
 * Mutation options for creating tag appearances
 */
export const createTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newItems: NewTagAppearanceArgs[]) =>
            createTagAppearances({ db, newItems }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error creating tag appearances", e, variables);
        },
    });
};

/**
 * Mutation options for updating tag appearances
 */
export const updateTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedTagAppearanceArgs[]) =>
            updateTagAppearances({ db, modifiedItems }),
        onMutate: async (modifiedItems) => {
            // Get the page ID from the first modified item
            const pageId = modifiedItems[0]?.start_page_id;
            if (pageId == null) return;

            const queryKey = tagKeys.tagAppearancesByStartPageId(pageId);

            // Cancel outgoing refetch
            await qc.cancelQueries({ queryKey });

            // Snapshot previous data
            const previousData = qc.getQueryData<TagAppearance[]>(queryKey);

            // Optimistically update cache
            qc.setQueryData<TagAppearance[]>(queryKey, (old) => {
                if (!old) return old;
                return old
                    .map((appearance) => {
                        const modified = modifiedItems.find(
                            (m) => m.id === appearance.id,
                        );
                        if (modified) {
                            return {
                                ...appearance,
                                ...modified,
                            } as TagAppearance;
                        }
                        return appearance;
                    })
                    .sort((a, b) => b.priority - a.priority);
            });

            return { previousData, queryKey };
        },
        onError: (e, variables, context) => {
            // Rollback on error
            if (context?.previousData && context?.queryKey) {
                qc.setQueryData(context.queryKey, context.previousData);
            }
            conToastError("Error updating tag appearances", e, variables);
        },
        onSettled: async () => {
            invalidateTagQueries(qc);
        },
    });
};

/**
 * Mutation options for deleting tag appearances
 */
export const deleteTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) =>
            deleteTagAppearances({ db, itemIds }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error deleting tag appearances", e, variables);
        },
    });
};

// ============================================================================
// MARCHER TAGS MUTATIONS
// ============================================================================

export const createNewTagFromMarcherIdsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (args: {
            marcherIds: Set<number>;
            tagName: string | null;
        }) => createNewTagFromMarcherIds({ db, ...args }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError(
                "Error creating new tag from marcher ids",
                e,
                variables,
            );
        },
    });
};

/**
 * Mutation options for creating marcher tags
 */
export const createMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newMarcherTags: NewMarcherTagArgs[]) =>
            createMarcherTags({ db, newMarcherTags }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error creating marcher tags", e, variables);
        },
    });
};

/**
 * Mutation options for updating marcher tags
 */
export const updateMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarcherTags: ModifiedMarcherTagArgs[]) =>
            updateMarcherTags({ db, modifiedMarcherTags }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error updating marcher tags", e, variables);
        },
    });
};

/**
 * Mutation options for deleting marcher tags
 */
export const deleteMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (marcherTagIds: Set<number>) =>
            deleteMarcherTags({ db, marcherTagIds }),
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error deleting marcher tags", e, variables);
        },
    });
};
