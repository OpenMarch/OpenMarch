import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, schema } from "@/global/database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";

const { pathways } = schema;

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

// Mutation hooks
export const useCreatePathways = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            newPathways: NewPathwayArgs[],
        ): Promise<DatabasePathway[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results = await tx
                    .insert(pathways)
                    .values(newPathways)
                    .returning()
                    .all();

                return results;
            });
        },
        onSuccess: () => {
            // Invalidate all pathway queries
            queryClient.invalidateQueries({
                queryKey: pathwayKeys.lists(),
            });
        },
    });
};

export const useUpdatePathways = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            modifiedPathways: ModifiedPathwayArgs[],
        ): Promise<DatabasePathway[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results: DatabasePathway[] = [];

                for (const modifiedPathway of modifiedPathways) {
                    const { id, ...updateData } = modifiedPathway;
                    const result = await tx
                        .update(pathways)
                        .set(updateData)
                        .where(eq(pathways.id, id))
                        .returning()
                        .get();
                    results.push(result);
                }

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate specific pathway queries
            variables.forEach(({ id }) => {
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
    });
};

export const useDeletePathways = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
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
    });
};
