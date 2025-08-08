import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, schema } from "@/global/database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { Path } from "@openmarch/path-utility";

const { midsets, pathways } = schema;

// Define types from the existing schema
export type DatabaseMidset = typeof midsets.$inferSelect & {
    path_data: string | null;
    pathway_notes: string | null;
};

export interface Midset {
    readonly id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
    readonly placement: number;
    readonly created_at: string;
    readonly updated_at: string;
    readonly path_data_id: number | null;
    readonly path_position: number | null;
    readonly path_data: Path | null;
    readonly notes: string | null;
    readonly pathway_notes: string | null;
}

/**
 * Arguments for creating a new midset
 */
export interface NewMidsetArgs {
    page_id: number;
    x: number;
    y: number;
    placement: number;
    path_data_id?: number | null;
    path_position?: number | null;
    notes?: string | null;
}

/**
 * Arguments for modifying an existing midset
 */
export interface ModifiedMidsetArgs {
    id: number;
    x?: number;
    y?: number;
    placement?: number;
    path_data_id?: number | null;
    path_position?: number | null;
    notes?: string | null;
}

// Add this type for mutation results
export type MidsetMutationResult = typeof midsets.$inferSelect;

// Query key factory
export const midsetKeys = {
    all: ["midsets"] as const,
    lists: () => [...midsetKeys.all, "list"] as const,
    list: (filters: { page_id?: number } = {}) =>
        [...midsetKeys.lists(), filters] as const,
    details: () => [...midsetKeys.all, "detail"] as const,
    detail: (id: number) => [...midsetKeys.details(), id] as const,
    byPage: (pageId: number) => [...midsetKeys.all, "page", pageId] as const,
};

// Helper function to create path data
function createPathData(currentMidset: DatabaseMidset): Path | null {
    if (!currentMidset.path_data) {
        return null;
    }

    return Path.fromJson(currentMidset.path_data);
}

// Helper function to convert database midsets to Midset objects
function databaseMidsetsToMidsets(databaseMidsets: DatabaseMidset[]): Midset[] {
    return databaseMidsets.map((dbMidset) => ({
        ...dbMidset,
        path_data: createPathData(dbMidset),
    }));
}

// Query functions
const midsetQueries = {
    getAll: async (filters?: { page_id?: number }): Promise<Midset[]> => {
        const conditions = [];
        if (filters?.page_id !== undefined) {
            conditions.push(eq(midsets.page_id, filters.page_id));
        }

        const query = db
            .select({
                id: midsets.id,
                page_id: midsets.page_id,
                x: midsets.x,
                y: midsets.y,
                placement: midsets.placement,
                created_at: midsets.created_at,
                updated_at: midsets.updated_at,
                path_data_id: midsets.path_data_id,
                path_position: midsets.path_position,
                notes: midsets.notes,
                path_data: pathways.path_data,
                pathway_notes: pathways.notes,
            })
            .from(midsets)
            .leftJoin(pathways, eq(midsets.path_data_id, pathways.id));

        // Apply conditions if any exist
        if (conditions.length > 0) {
            query.where(conditions[0]);
        }

        const rawResult = await query.all();

        // Transform the result to match the Midset interface
        const result = rawResult.map((row) => ({
            id: row.id,
            page_id: row.page_id,
            x: row.x,
            y: row.y,
            placement: row.placement,
            created_at: row.created_at,
            updated_at: row.updated_at,
            path_data_id: row.path_data_id,
            path_position: row.path_position,
            notes: row.notes,
            path_data: row.path_data,
            pathway_notes: row.pathway_notes,
        })) as DatabaseMidset[];

        return databaseMidsetsToMidsets(result);
    },

    getByPage: async (pageId: number): Promise<Midset[]> => {
        return midsetQueries.getAll({ page_id: pageId });
    },

    getById: async (id: number): Promise<Midset | undefined> => {
        const result = await midsetQueries.getAll();
        return result.find((midset) => midset.id === id);
    },
};

// Query hooks
export const useMidsets = (filters?: { page_id?: number }) => {
    return useQuery({
        queryKey: midsetKeys.list(filters || {}),
        queryFn: () => midsetQueries.getAll(filters),
    });
};

export const useMidsetsByPage = (pageId: number) => {
    return useQuery({
        queryKey: midsetKeys.byPage(pageId),
        queryFn: () => midsetQueries.getByPage(pageId),
        enabled: !!pageId,
    });
};

export const useMidset = (id: number) => {
    return useQuery({
        queryKey: midsetKeys.detail(id),
        queryFn: () => midsetQueries.getById(id),
        enabled: !!id,
    });
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

                return results.map((r) => ({
                    ...r,
                    path_data: null,
                    pathway_notes: null,
                }));
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate queries for affected pages
            const pagesAffected = new Set(variables.map((v) => v.page_id));
            pagesAffected.forEach((pageId) => {
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.byPage(pageId),
                });
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: midsetKeys.lists(),
            });
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
            // Invalidate specific midset queries
            variables.forEach(({ id }) => {
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.detail(id),
                });
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: midsetKeys.lists(),
            });
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
            // Invalidate specific midset queries
            variables.forEach((id) => {
                queryClient.invalidateQueries({
                    queryKey: midsetKeys.detail(id),
                });
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: midsetKeys.lists(),
            });
        },
    });
};
