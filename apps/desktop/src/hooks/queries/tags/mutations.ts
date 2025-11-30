import {
    createTags,
    NewTagArgs,
    ModifiedTagArgs,
    updateTagsInTransaction,
    deleteTagsInTransaction,
    createTagAppearances,
    NewTagAppearanceArgs,
    ModifiedTagAppearanceArgs,
    updateTagAppearances,
    deleteTagAppearances,
    createMarcherTags,
    NewMarcherTagArgs,
    ModifiedMarcherTagArgs,
    updateMarcherTags,
    deleteMarcherTags,
    transactionWithHistory,
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
        onSuccess: async (_) => {
            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error updating tag appearances", e, variables);
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
