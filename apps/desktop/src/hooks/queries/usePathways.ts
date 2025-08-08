import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, schema } from "@/global/database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";

const { pathways } = schema;

// Define types from the existing schema
type DatabasePathway = typeof pathways.$inferSelect;

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
    list: (filters: { id?: number } = {}) =>
        [...pathwayKeys.lists(), filters] as const,
    details: () => [...pathwayKeys.all, "detail"] as const,
    detail: (id: number) => [...pathwayKeys.details(), id] as const,
};

// Query functions
const pathwayQueries = {
    getAll: async (filters?: { id?: number }): Promise<DatabasePathway[]> => {
        let queryBuilder = db.select().from(pathways).$dynamic();

        if (filters?.id !== undefined) {
            queryBuilder = queryBuilder.where(eq(pathways.id, filters.id));
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
export const usePathways = (filters?: { id?: number }) => {
    return useQuery({
        queryKey: pathwayKeys.list(filters || {}),
        queryFn: () => pathwayQueries.getAll(filters),
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
        },
    });
};
