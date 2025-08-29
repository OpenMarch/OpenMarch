import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { conToastError } from "@/utilities/utils";
import { marcherPageKeys } from "./useMarcherPages";
import { db, schema } from "@/global/database/db";

const { pathways, marcher_pages } = schema;

// Define types from the existing schema
export type DatabasePathway = typeof pathways.$inferSelect;
export type Pathway = DatabasePathway;

/**
 * Record structure for pathways indexed by ID
 */
export type PathwayMap = Record<number, Pathway>;

/**
 * Arguments for creating a new pathway
 */
export interface NewPathwayArgs {
    path_data: string;
    notes?: string;
}

/**
 * Arguments for modifying an existing pathway
 */
export interface ModifiedPathwayArgs {
    id: number;
    path_data?: string;
    notes?: string;
}

// Query key factory
export const pathwayKeys = {
    all: ["pathways"] as const,
    lists: () => [...pathwayKeys.all, "list"] as const,
    list: (filters: { id?: number; ids?: number[] } = {}) =>
        [...pathwayKeys.lists(), filters] as const,
    details: () => [...pathwayKeys.all, "detail"] as const,
    detail: (id: number) => [...pathwayKeys.details(), id] as const,
};

/**
 * Converts an array of pathways to a Record indexed by ID
 */
export function pathwayMapFromArray(pathways: DatabasePathway[]): PathwayMap {
    const pathwayMap: PathwayMap = {};

    pathways.forEach((pathway) => {
        pathwayMap[pathway.id] = pathway;
    });

    return pathwayMap;
}

// Query functions
const pathwayQueries = {
    getAll: async (filters?: {
        id?: number;
        ids?: number[];
    }): Promise<DatabasePathway[]> => {
        let queryBuilder = db.select().from(pathways).$dynamic();

        if (filters?.id !== undefined) {
            queryBuilder = queryBuilder.where(eq(pathways.id, filters.id));
        }

        if (filters?.ids !== undefined && filters.ids.length > 0) {
            queryBuilder = queryBuilder.where(
                inArray(pathways.id, filters.ids),
            );
        }

        return await queryBuilder.all();
    },

    getById: async (id: number): Promise<DatabasePathway | undefined> => {
        const results = await db
            .select()
            .from(pathways)
            .where(eq(pathways.id, id))
            .all();

        return results[0];
    },
};

// Query hooks
export const usePathways = (filters?: { id?: number; ids?: number[] }) => {
    return useQuery({
        queryKey: pathwayKeys.list(filters || {}),
        queryFn: () => pathwayQueries.getAll(filters),
        select: (data: DatabasePathway[]) => pathwayMapFromArray(data),
    });
};

export const usePathway = (id: number) => {
    return useQuery({
        queryKey: pathwayKeys.detail(id),
        queryFn: () => pathwayQueries.getById(id),
        enabled: !!id,
    });
};

// Mutation functions (pure business logic)
const pathwayMutations = {
    createPathway: async ({
        newPathwayArgs,
        marcherPageIds,
    }: {
        newPathwayArgs: NewPathwayArgs;
        marcherPageIds?: number[];
    }): Promise<DatabasePathway[]> => {
        console.log("createPathway", marcherPageIds);
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .insert(pathways)
                .values(newPathwayArgs)
                .returning()
                .all();

            if (marcherPageIds) {
                await tx
                    .update(marcher_pages)
                    .set({
                        path_data_id: results[0].id,
                        path_start_position: 0,
                        path_end_position: 0,
                    })
                    .where(inArray(marcher_pages.id, marcherPageIds));
            }

            return results;
        });
    },

    updatePathway: async (
        modifiedPathway: ModifiedPathwayArgs,
    ): Promise<DatabasePathway[]> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabasePathway[] = [];

            const { id, ...updateData } = modifiedPathway;
            const result = await tx
                .update(pathways)
                .set(updateData)
                .where(eq(pathways.id, id))
                .returning()
                .get();
            results.push(result);

            return results;
        });
    },

    deletePathways: async (
        pathwayIds: number[],
    ): Promise<DatabasePathway[]> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .delete(pathways)
                .where(inArray(pathways.id, pathwayIds))
                .returning()
                .all();

            return results;
        });
    },
};

// Mutation hooks
export const useCreatePathway = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.createPathway,
        onSuccess: (_, { marcherPageIds }) => {
            // Invalidate all pathway queries
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });
            if (marcherPageIds) {
                queryClient.invalidateQueries({
                    queryKey: marcherPageKeys.all,
                });
            }
        },
        onError: (
            error: Error,
            variables: {
                newPathwayArgs: NewPathwayArgs;
                marcherPageIds?: number[];
            },
        ) => {
            // Log the error for debugging/telemetry
            conToastError(`Failed to create pathway`, { error, variables });

            // Re-invalidate pathway queries to ensure UI state is consistent
            // This helps recover from any optimistic updates that might have been applied
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });
        },
    });
};

export const useUpdatePathway = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.updatePathway,
        onSuccess: (data, variables) => {
            // Invalidate specific pathway queries
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.detail(variables.id),
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });

            // Note: Dependent queries (marcherPages, midsets) will handle their own invalidation
            // when they detect pathway changes through their own query logic
        },
        onError: (error: Error, variables: ModifiedPathwayArgs) => {
            // Log the error for debugging/telemetry
            conToastError(`Failed to update pathway`, { error, variables });

            // Re-invalidate pathway queries to ensure UI state is consistent
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });
        },
    });
};

export const useDeletePathways = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.deletePathways,
        onSuccess: (data, variables) => {
            // Invalidate specific pathway queries
            variables.forEach((id) => {
                queryClient.invalidateQueries({
                    queryKey: pathwayKeys.detail(id),
                });
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });

            // Note: Dependent queries (marcherPages, midsets) will handle their own invalidation
            // when they detect pathway changes through their own query logic
        },
        onError: (error: Error, variables: number[]) => {
            // Log the error for debugging/telemetry
            conToastError(
                `Failed to delete ${variables.length} pathway${
                    variables.length === 1 ? "" : "s"
                }`,
                { error, variables },
            );

            // Re-invalidate pathway queries to ensure UI state is consistent
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });
        },
    });
};
