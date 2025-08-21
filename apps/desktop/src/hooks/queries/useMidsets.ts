import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, schema } from "@/global/database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { Path } from "@openmarch/path-utility";
import { useMemo } from "react";
import { pathwayKeys } from "./usePathways";

const { midsets, pathways } = schema;

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMidset = typeof midsets.$inferSelect;

export interface Midset {
    readonly id: number;
    readonly mp_id: number;
    readonly x: number;
    readonly y: number;
    readonly progress_placement: number;
    readonly created_at: string;
    readonly updated_at: string;
    readonly path_data_id: number | null;
    readonly path_start_position: number | null;
    readonly path_end_position: number | null;
    readonly path_data: Path | null;
    readonly notes: string | null;
    readonly pathway_notes: string | null;
}

/**
 * Arguments for creating a new midset
 */
export interface NewMidsetArgs {
    mp_id: number;
    x: number;
    y: number;
    progress_placement: number;
    path_data_id?: number | null;
    path_start_position?: number | null;
    path_end_position?: number | null;
    notes?: string | null;
}

/**
 * Arguments for modifying an existing midset
 */
export interface ModifiedMidsetArgs {
    id: number;
    x?: number;
    y?: number;
    progress_placement?: number;
    path_data_id?: number | null;
    path_start_position?: number | null;
    path_end_position?: number | null;
    notes?: string | null;
}

// Add this type for mutation results
export type MidsetMutationResult = typeof midsets.$inferSelect;

// Query key factory
export const midsetKeys = {
    all: ["midsets"] as const,
    lists: () => [...midsetKeys.all, "list"] as const,
    list: (filters: { mp_id?: number } = {}) =>
        [...midsetKeys.lists(), filters] as const,
    details: () => [...midsetKeys.all, "detail"] as const,
    detail: (id: number) => [...midsetKeys.details(), id] as const,
    byMarcherPage: (mpId: number) =>
        [...midsetKeys.all, "marcherPage", mpId] as const,
};

// Helper function to create path data with error handling
function createPathData(
    currentMidset: DatabaseMidset,
    pathwayData: string | null,
): Path | null {
    try {
        if (!pathwayData) {
            return null;
        }

        return Path.fromJson(pathwayData);
    } catch (error) {
        console.error("Failed to create path data:", error);
        return null;
    }
}

// Helper function to convert database midsets to Midset objects
function databaseMidsetsToMidsets(
    databaseMidsets: DatabaseMidset[],
    pathways: Map<number, { path_data: string; notes: string | null }>,
): Midset[] {
    return databaseMidsets.map((dbMidset) => {
        // Get pathway data if this midset has a pathway
        const pathway = dbMidset.path_data_id
            ? pathways.get(dbMidset.path_data_id)
            : null;

        return {
            ...dbMidset,
            path_data: createPathData(dbMidset, pathway?.path_data || null),
            pathway_notes: pathway?.notes || null,
        };
    });
}

// Custom hook for fetching pathways by IDs
const usePathwaysByIds = (ids: number[]) => {
    return useQuery({
        queryKey: pathwayKeys.list({ ids }),
        queryFn: async () => {
            if (ids.length === 0) return [];

            const results = await db
                .select({
                    id: pathways.id,
                    path_data: pathways.path_data,
                    notes: pathways.notes,
                })
                .from(pathways)
                .where(inArray(pathways.id, ids))
                .all();

            return results;
        },
        enabled: ids.length > 0,
    });
};

// Custom hook for combining midsets with pathway data
const useMidsetsWithPathways = (midsets: DatabaseMidset[] | undefined) => {
    // Extract unique pathway IDs from midsets
    const pathwayIds = useMemo(() => {
        if (!midsets) return [];
        const ids = midsets
            .map((midset) => midset.path_data_id)
            .filter((id): id is number => id !== null);
        return [...new Set(ids)].sort((a, b) => a - b);
    }, [midsets]);

    // Fetch only the needed pathways
    const pathwaysQuery = usePathwaysByIds(pathwayIds);

    // Combine the data when both queries are successful
    const combinedData = useMemo(() => {
        if (!midsets) {
            return undefined;
        }

        // If there are no pathways, return midsets without pathway data
        if (pathwayIds.length === 0) {
            return databaseMidsetsToMidsets(midsets, new Map());
        }

        // If pathways query is still loading or failed, return undefined
        if (!pathwaysQuery.data) {
            return undefined;
        }

        // Create a map of pathway data for efficient lookup
        const pathwaysMap = new Map(
            pathwaysQuery.data.map((pathway) => [
                pathway.id,
                { path_data: pathway.path_data, notes: pathway.notes },
            ]),
        );

        return databaseMidsetsToMidsets(midsets, pathwaysMap);
    }, [midsets, pathwaysQuery.data, pathwayIds.length]);

    return {
        data: combinedData,
        isLoading: pathwaysQuery.isLoading,
        error: pathwaysQuery.error,
    };
};

// Query functions - remove pathway join
const midsetQueries = {
    getAll: async (filters?: { mp_id?: number }): Promise<DatabaseMidset[]> => {
        const conditions = [];
        if (filters?.mp_id !== undefined) {
            conditions.push(eq(midsets.mp_id, filters.mp_id));
        }

        // Build the query with conditions
        if (conditions.length > 0) {
            return await db.select().from(midsets).where(conditions[0]).all();
        }

        // No conditions, return all rows
        return await db.select().from(midsets).all();
    },

    getById: async (id: number): Promise<DatabaseMidset | undefined> => {
        const result = await db
            .select()
            .from(midsets)
            .where(eq(midsets.id, id))
            .all();
        return result[0];
    },

    getByMarcherPage: async (mpId: number): Promise<DatabaseMidset[]> => {
        const result = await midsetQueries.getAll({ mp_id: mpId });
        return result.sort(
            (a, b) => a.progress_placement - b.progress_placement,
        );
    },
};

// Helper function to combine query results
const combineQueryResults = (baseQuery: any, pathwaysResult: any) => {
    return {
        ...baseQuery,
        data: pathwaysResult.data,
        isLoading: baseQuery.isLoading || pathwaysResult.isLoading,
        error: baseQuery.error || pathwaysResult.error,
    };
};

// Query hooks with pathway data integration
export const useMidsets = (filters?: { mp_id?: number }) => {
    // Fetch midsets without pathway data
    const midsetsQuery = useQuery({
        queryKey: midsetKeys.list(filters || {}),
        queryFn: () => midsetQueries.getAll(filters),
    });

    // Combine with pathway data
    const pathwaysResult = useMidsetsWithPathways(midsetsQuery.data);

    return combineQueryResults(midsetsQuery, pathwaysResult);
};

export const useMidsetsByMarcherPage = (mpId: number) => {
    const midsetsQuery = useQuery({
        queryKey: midsetKeys.byMarcherPage(mpId),
        queryFn: () => midsetQueries.getByMarcherPage(mpId),
        enabled: mpId != null,
    });

    const pathwaysResult = useMidsetsWithPathways(midsetsQuery.data);

    return combineQueryResults(midsetsQuery, pathwaysResult);
};

export const useMidset = (id: number) => {
    const midsetsQuery = useQuery({
        queryKey: midsetKeys.detail(id),
        queryFn: () => midsetQueries.getById(id),
        enabled: !!id,
    });

    const pathwaysResult = useMidsetsWithPathways(
        midsetsQuery.data ? [midsetsQuery.data] : undefined,
    );

    return {
        ...combineQueryResults(midsetsQuery, pathwaysResult),
        data: pathwaysResult.data?.[0],
    };
};

// Mutation hooks
export const useCreateMidsets = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            newMidsets: NewMidsetArgs[],
        ): Promise<MidsetMutationResult[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results = await tx
                    .insert(midsets)
                    .values(newMidsets)
                    .returning()
                    .all();

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // More targeted invalidation - only invalidate affected queries
            const affectedQueries = new Set<string>();

            variables.forEach(({ mp_id }) => {
                // Add marcher page-specific query
                affectedQueries.add(
                    JSON.stringify(midsetKeys.byMarcherPage(mp_id)),
                );
            });

            // Invalidate only the affected queries
            affectedQueries.forEach((queryKeyStr) => {
                const queryKey = JSON.parse(queryKeyStr);
                queryClient.invalidateQueries({ queryKey });
            });

            // Invalidate pathway queries if path_data_id was set
            const hasPathwayChanges = variables.some(
                (v) => v.path_data_id !== undefined,
            );
            if (hasPathwayChanges) {
                queryClient.invalidateQueries({
                    queryKey: pathwayKeys.lists(),
                });
            }
        },
    });
};

export const useUpdateMidsets = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            modifiedMidsets: ModifiedMidsetArgs[],
        ): Promise<MidsetMutationResult[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results: MidsetMutationResult[] = [];

                for (const modifiedMidset of modifiedMidsets) {
                    const { id, ...updateData } = modifiedMidset;
                    const result = await tx
                        .update(midsets)
                        .set(updateData)
                        .where(eq(midsets.id, id))
                        .returning()
                        .get();
                    results.push(result);
                }

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate specific detail queries for updated midsets
            variables.forEach(({ id }) => {
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.detail(id),
                });
            });

            // Get the mp_ids from the updated data to invalidate related queries
            const affectedMpIds = new Set(data.map((midset) => midset.mp_id));
            affectedMpIds.forEach((mp_id) => {
                // Invalidate marcher page-specific query
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.byMarcherPage(mp_id),
                });

                // Invalidate list queries that might include this marcher page
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.list({ mp_id }),
                });
            });

            // Invalidate general list queries to ensure consistency
            queryClient.invalidateQueries({
                queryKey: midsetKeys.lists(),
            });

            // Invalidate pathway queries if path_data_id was modified
            const hasPathwayChanges = variables.some(
                (v) => v.path_data_id !== undefined,
            );
            if (hasPathwayChanges) {
                queryClient.invalidateQueries({
                    queryKey: pathwayKeys.lists(),
                });
            }
        },
    });
};

export const useDeleteMidsets = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            midsetIds: number[],
        ): Promise<MidsetMutationResult[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results = await tx
                    .delete(midsets)
                    .where(inArray(midsets.id, midsetIds))
                    .returning()
                    .all();

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate specific detail queries for deleted midsets
            variables.forEach((id) => {
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.detail(id),
                });
            });

            // Get the mp_ids from the deleted data to invalidate related queries
            const affectedMpIds = new Set(data.map((midset) => midset.mp_id));
            affectedMpIds.forEach((mp_id) => {
                // Invalidate marcher page-specific query
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.byMarcherPage(mp_id),
                });

                // Invalidate list queries that might include this marcher page
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.list({ mp_id }),
                });
            });

            // Invalidate general list queries to ensure consistency
            queryClient.invalidateQueries({
                queryKey: midsetKeys.lists(),
            });
        },
    });
};
