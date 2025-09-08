import { db, schema } from "@/global/database/db";
import { eq, and } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import {
    useQueryClient,
    useMutation,
    queryOptions,
    useQuery,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import { DbConnection, DatabasePage, createPages } from "@/db-functions";

const { pages } = schema;

/**
 * Arguments for creating a new page
 */
export interface NewPageArgs {
    start_beat: number;
    notes?: string | null;
    is_subset: boolean;
}

/**
 * Arguments for modifying an existing page
 */
export interface ModifiedPageArgs {
    id: number;
    start_beat?: number;
    notes?: string | null;
    is_subset?: boolean;
    last_page_counts?: number;
}

const KEY_BASE = "page";

// Query key factory
export const pageKeys = {
    /** This should almost never be used unless you absolutely need every page in the show at one time */
    all: () => ["page"] as const,
    byId: (pageId: number) => [KEY_BASE, "id", pageId] as const,
    byStartBeat: (startBeat: number) =>
        [KEY_BASE, "startBeat", startBeat] as const,
    single: (pageId: number) => [KEY_BASE, "single", pageId] as const,
};

const getKeyForFilters = (filters: PageQueryFilters) => {
    if (
        !filters ||
        (filters.id === undefined && filters.start_beat === undefined)
    )
        return pageKeys.all();

    if (filters.id !== undefined) return pageKeys.byId(filters.id);

    if (filters.start_beat !== undefined)
        return pageKeys.byStartBeat(filters.start_beat);

    throw new Error("Invalid page filters provided to getKeyForFilters");
};

const pageQueries = {
    getAll: async (filters?: PageQueryFilters): Promise<DatabasePage[]> => {
        const conditions = [];
        if (filters?.id !== undefined) {
            conditions.push(eq(pages.id, filters.id));
        }
        if (filters?.start_beat !== undefined) {
            conditions.push(eq(pages.start_beat, filters.start_beat));
        }

        // Build the query with conditions
        if (conditions.length > 0) {
            return await db.query.pages.findMany({
                where:
                    conditions.length > 1 ? and(...conditions) : conditions[0],
            });
        } else {
            // No conditions, return all rows
            console.warn(
                "Returning all page rows. This should not happen as this fetches all pages in the show. You should probably use getById or getByStartBeat",
            );
            return await db.query.pages.findMany();
        }
    },

    getById: async (pageId: number): Promise<DatabasePage | undefined> => {
        const result = await pageQueries.getAll({ id: pageId });
        return result[0];
    },

    getByStartBeat: async (
        startBeat: number,
    ): Promise<DatabasePage | undefined> => {
        const result = await pageQueries.getAll({ start_beat: startBeat });
        return result[0];
    },
};

/**
 * Filters for the pageQueries.getAll function
 */
type PageQueryFilters =
    | {
          id?: number;
          start_beat?: number;
      }
    | undefined;

/**
 * Query options for the pages query
 *
 * @param args - the filters to use for the query, or the page id to fetch
 * @returns
 */
export const pagesQueryOptions = (
    args:
        | {
              filters?: PageQueryFilters;
          }
        | number,
) => {
    const filters = typeof args === "number" ? { id: args } : args.filters;
    if (!filters || Object.keys(filters).length === 0)
        console.warn(
            "No filters provided to usePages which will fetch every page in the show. This is inefficient and should be avoided.",
        );

    return queryOptions<DatabasePage[]>({
        queryKey: getKeyForFilters(filters),
        queryFn: async () => {
            return await pageQueries.getAll(filters);
        },
    });
};

// Mutation functions (pure business logic)
const pageMutations = {
    createPages: async (
        db: DbConnection,
        newPages: NewPageArgs[],
    ): Promise<DatabasePage[]> => {
        return await createPages({ newPages, db });
    },

    updatePages: async (
        modifiedPages: ModifiedPageArgs[],
    ): Promise<DatabasePage[]> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabasePage[] = [];

            for (const modifiedPage of modifiedPages) {
                const { id, ...updateData } = modifiedPage;

                // Convert boolean to integer for is_subset if provided
                const updateValues: any = { ...updateData };
                if (updateValues.is_subset !== undefined) {
                    updateValues.is_subset = updateValues.is_subset ? 1 : 0;
                }

                const result = await tx
                    .update(pages)
                    .set(updateValues)
                    .where(eq(pages.id, id))
                    .returning({
                        id: pages.id,
                        start_beat: pages.start_beat,
                        notes: pages.notes,
                        is_subset: pages.is_subset,
                        created_at: pages.created_at,
                        updated_at: pages.updated_at,
                    })
                    .get();

                results.push({
                    ...result,
                    is_subset: result.is_subset,
                });
            }

            return results;
        });
    },

    deletePages: async (pageIds: Set<number>): Promise<DatabasePage[]> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabasePage[] = [];

            for (const pageId of pageIds) {
                const result = await tx
                    .delete(pages)
                    .where(eq(pages.id, pageId))
                    .returning({
                        id: pages.id,
                        start_beat: pages.start_beat,
                        notes: pages.notes,
                        is_subset: pages.is_subset,
                        created_at: pages.created_at,
                        updated_at: pages.updated_at,
                    })
                    .get();

                if (result) {
                    results.push({
                        ...result,
                        is_subset: result.is_subset,
                    });
                }
            }

            return results;
        });
    },
};

export const fetchPages = () => {
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createPagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: pageMutations.createPages,
        onSuccess: (_, variables) => {
            // Invalidate all page queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating pages`, e, variables);
        },
    });
};

export const updatePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: pageMutations.updatePages,
        onSuccess: (_, variables) => {
            // Invalidate all page queries
            const pageIds = new Set<number>();
            for (const modifiedArgs of variables) pageIds.add(modifiedArgs.id);

            qc.invalidateQueries({
                queryKey: Array.from(pageIds).map((pageId) =>
                    pageKeys.byId(pageId),
                ),
            });
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating pages`, e, variables);
        },
    });
};

export const deletePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: pageMutations.deletePages,
        onSuccess: (_, variables) => {
            // Invalidate all page queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting pages`, e, variables);
        },
    });
};

// Hook for using pages query
export const usePages = (
    args:
        | {
              filters?: PageQueryFilters;
          }
        | number,
) => {
    return useQuery(pagesQueryOptions(args));
};
