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
    DatabaseMarcherTag,
    MarcherIdsByTagId,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { QueryClient, mutationOptions } from "@tanstack/react-query";
import { tagKeys, invalidateTagQueries } from "./queries";
import { conToastError } from "@/utilities/utils";
import {
    invalidateAllAppearances,
    invalidateAppearanceForMarchers,
} from "../sharedInvalidators";

/**
 * Looks up the marcher ids affected by a set of marcher_tag row ids, using the
 * cached `marcher_tags` list to resolve each row's `marcher_id`.
 *
 * Returns `undefined` if the list isn't cached — callers should fall back to a
 * broad appearance invalidation in that case.
 */
const resolveMarcherIdsForMarcherTagIds = (
    qc: QueryClient,
    marcherTagIds: Iterable<number>,
): Set<number> | undefined => {
    const cached = qc.getQueryData<DatabaseMarcherTag[]>(
        tagKeys.allMarcherTags(),
    );
    if (!cached) return undefined;

    const marcherIdById = new Map(cached.map((mt) => [mt.id, mt.marcher_id]));
    const marcherIds = new Set<number>();
    for (const id of marcherTagIds) {
        const marcherId = marcherIdById.get(id);
        if (marcherId != null) marcherIds.add(marcherId);
    }
    return marcherIds;
};

/**
 * Looks up the marcher ids that currently have any of the given tag ids, using
 * the cached tag→marcher map.
 *
 * Returns `undefined` if the map isn't cached — callers should fall back to a
 * broad appearance invalidation in that case.
 */
const resolveMarcherIdsForTagIds = (
    qc: QueryClient,
    tagIds: Iterable<number>,
): Set<number> | undefined => {
    const cached = qc.getQueryData<MarcherIdsByTagId>(
        tagKeys.marcherIdsByTagIdMap(),
    );
    if (!cached) return undefined;

    const marcherIds = new Set<number>();
    for (const tagId of tagIds)
        for (const marcherId of cached.get(tagId) ?? [])
            marcherIds.add(marcherId);
    return marcherIds;
};

/**
 * Looks up the tag ids for a set of tag_appearance row ids, using the cached
 * `tag_appearances` list to resolve each row's `tag_id`.
 *
 * Returns `undefined` if the list isn't cached — callers should fall back to a
 * broad appearance invalidation in that case.
 */
const resolveTagIdsForTagAppearanceIds = (
    qc: QueryClient,
    tagAppearanceIds: Iterable<number>,
): Set<number> | undefined => {
    const cached = qc.getQueryData<TagAppearance[]>(
        tagKeys.allTagAppearances(),
    );
    if (!cached) return undefined;

    const tagIdById = new Map(cached.map((ta) => [ta.id, ta.tag_id]));
    const tagIds = new Set<number>();
    for (const id of tagAppearanceIds) {
        const tagId = tagIdById.get(id);
        if (tagId != null) tagIds.add(tagId);
    }
    return tagIds;
};

/**
 * Invalidates the appearance cache for whichever marchers have any of the given
 * tag ids, falling back to a broad invalidation if the tag→marcher map isn't cached.
 */
const invalidateAppearanceForTagIds = (
    qc: QueryClient,
    tagIds: Iterable<number>,
) => {
    const marcherIds = resolveMarcherIdsForTagIds(qc, tagIds);
    if (marcherIds) invalidateAppearanceForMarchers(qc, marcherIds);
    else invalidateAllAppearances(qc);
};

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
            // A brand-new tag has no marcher_tags/tag_appearances yet, so it
            // can't affect any marcher's rendered appearance — nothing to
            // invalidate there.
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
            // A tag's own fields (name/color/icon/description) aren't part of
            // the appearance stack — only its tag_appearances rows are — so
            // renaming/re-describing a tag never changes any marcher's
            // rendered appearance.
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
        onSuccess: async (_, tagIds) => {
            // Deleting a tag cascades to its marcher_tags and tag_appearances
            // rows, so resolve who's affected before those caches invalidate.
            invalidateAppearanceForTagIds(qc, tagIds);
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
        onSuccess: async (_, newItems) => {
            invalidateTagQueries(qc);
            invalidateAppearanceForTagIds(
                qc,
                newItems.map((item) => item.tag_id),
            );
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
        onSettled: async (_data, _error, modifiedItems) => {
            // `tag_id` is only present when a row is being reassigned to a
            // different tag — resolve the rest from the cached list so an
            // in-place color/priority edit still invalidates the right marchers.
            const cachedTagIds = resolveTagIdsForTagAppearanceIds(
                qc,
                modifiedItems.map((item) => item.id),
            );
            if (cachedTagIds == null) {
                invalidateAllAppearances(qc);
            } else {
                for (const item of modifiedItems)
                    if (item.tag_id != null) cachedTagIds.add(item.tag_id);
                invalidateAppearanceForTagIds(qc, cachedTagIds);
            }

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
        onSuccess: async (_, itemIds) => {
            // Resolve which tags (and thus which marchers) are affected before
            // the cache these ids are read from gets invalidated below.
            const tagIds = resolveTagIdsForTagAppearanceIds(qc, itemIds);
            if (tagIds == null) invalidateAllAppearances(qc);
            else invalidateAppearanceForTagIds(qc, tagIds);

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
            // The new tag has no tag_appearances yet, so attaching it can't
            // change any marcher's rendered appearance until one is added
            // (which goes through createTagAppearancesMutationOptions above).
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
        onSuccess: async (_, newMarcherTags) => {
            invalidateTagQueries(qc);
            invalidateAppearanceForMarchers(
                qc,
                new Set(newMarcherTags.map((mt) => mt.marcher_id)),
            );
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
        onSuccess: async (_, modifiedMarcherTags) => {
            // `marcher_id` is only present if a row is being reassigned to a
            // different marcher — resolve the row's current marcher from the
            // cache too, so reassigning its tag_id still invalidates correctly.
            const cachedMarcherIds = resolveMarcherIdsForMarcherTagIds(
                qc,
                modifiedMarcherTags.map((mt) => mt.id),
            );
            if (cachedMarcherIds == null) {
                invalidateAllAppearances(qc);
            } else {
                for (const mt of modifiedMarcherTags)
                    if (mt.marcher_id != null)
                        cachedMarcherIds.add(mt.marcher_id);
                invalidateAppearanceForMarchers(qc, cachedMarcherIds);
            }

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
        onSuccess: async (_, marcherTagIds) => {
            // Resolve which marchers are affected before the cache these ids
            // are read from gets invalidated below.
            const marcherIds = resolveMarcherIdsForMarcherTagIds(
                qc,
                marcherTagIds,
            );
            if (marcherIds == null) invalidateAllAppearances(qc);
            else invalidateAppearanceForMarchers(qc, marcherIds);

            invalidateTagQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error deleting marcher tags", e, variables);
        },
    });
};
