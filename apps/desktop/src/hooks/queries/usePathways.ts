import {
    useMutation,
    useQueryClient,
    queryOptions,
} from "@tanstack/react-query";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { conToastError } from "@/utilities/utils";
import { db, schema } from "@/global/database/db";
import { Path } from "@openmarch/core";
import { DbConnection } from "@/test/base";
import { findPageIdsForPathway } from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const { pathways, marcher_pages } = schema;

// Define types from the existing schema
export type DatabasePathway = typeof pathways.$inferSelect;
export type Pathway = {
    id: number;
    path_data: Path;
    notes: string | null;
};

/**
 * Record structure for pathways indexed by ID
 */
export type PathwaysById = Record<number, Pathway>;

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
    byPageId: (pageId: number) => [...pathwayKeys.all, "page", pageId] as const,
};

/**
 * Converts an array of pathways to a Record indexed by ID
 */
export function pathwayMapFromArray(
    pathways: Omit<DatabasePathway, "created_at" | "updated_at">[],
): PathwaysById {
    const pathwayMap: PathwaysById = {};

    pathways.forEach((pathway) => {
        const pathData = Path.fromJson(
            pathway.path_data,
            undefined,
            undefined,
            pathway.id,
        );
        pathwayMap[pathway.id] = {
            id: pathway.id,
            path_data: pathData,
            notes: pathway.notes,
        };
    });

    return pathwayMap;
}

// Query functions
const pathwayQueries = {
    getAll: async (db: DbConnection) => {
        const results = await db.query.pathways.findMany();

        return pathwayMapFromArray(results);
    },

    getByPageId: async (pageId: number, db: DbConnection) => {
        const results = await db

            .selectDistinct({
                id: pathways.id,
                path_data: pathways.path_data,
                notes: pathways.notes,
            })
            .from(pathways)
            .innerJoin(
                marcher_pages,
                eq(pathways.id, marcher_pages.path_data_id),
            )
            .where(eq(marcher_pages.page_id, pageId))
            .all();

        const pathwayMap = pathwayMapFromArray(results);
        return pathwayMap;
    },
};
export const _pathwayQueries = pathwayQueries;

// Query hooks
export const allPathwaysQueryOptions = () => {
    return queryOptions<PathwaysById>({
        queryKey: pathwayKeys.all,
        queryFn: () => pathwayQueries.getAll(db),
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Fetches all pathways that are associated with a given page
 */
export const pathwaysByPageQueryOptions = (pageId: number) => {
    return queryOptions<PathwaysById>({
        queryKey: pathwayKeys.byPageId(pageId),
        queryFn: () => pathwayQueries.getByPageId(pageId, db),
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

type MutationResult = {
    pathways: DatabasePathway[];
    pageIds?: number[];
};

// Mutation functions (pure business logic)
const pathwayMutations = {
    createPathway: async ({
        newPathwayArgs,
        marcherPageIds,
    }: {
        newPathwayArgs: NewPathwayArgs;
        marcherPageIds?: number[];
    }): Promise<MutationResult> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const createdPathway = await tx
                .insert(pathways)
                .values(newPathwayArgs)
                .returning()
                .get();

            if (marcherPageIds) {
                await tx
                    .update(marcher_pages)
                    .set({
                        path_data_id: createdPathway.id,
                        path_start_position: 0,
                        path_end_position: 0,
                    })
                    .where(inArray(marcher_pages.id, marcherPageIds));
            }

            const pageIds = await findPageIdsForPathway({
                tx,
                pathwayId: createdPathway.id,
            });

            return { pathways: [createdPathway], pageIds };
        });
    },

    updatePathway: async (
        modifiedPathway: ModifiedPathwayArgs,
    ): Promise<MutationResult> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const { id, ...updateData } = modifiedPathway;
            const updatedResult = await tx
                .update(pathways)
                .set(updateData)
                .where(eq(pathways.id, id))
                .returning()
                .get();

            const pageIds = await findPageIdsForPathway({
                tx,
                pathwayId: updatedResult.id,
            });

            return { pathways: [updatedResult], pageIds };
        });
    },

    deletePathways: async (pathwayIds: number[]): Promise<MutationResult> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .delete(pathways)
                .where(inArray(pathways.id, pathwayIds))
                .returning()
                .all();

            const pageIdsSet = new Set<number>();

            for (const pathwayId of pathwayIds) {
                const pageIdsForPathway = await findPageIdsForPathway({
                    tx,
                    pathwayId,
                });
                pageIdsForPathway.forEach((pageId) => {
                    pageIdsSet.add(pageId);
                });
            }

            return { pathways: results, pageIds: Array.from(pageIdsSet) };
        });
    },
};

// Mutation hooks
export const useCreatePathway = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.createPathway,
        onSuccess: ({ pageIds }) => {
            // Invalidate all pathway queries
            if (pageIds) {
                pageIds.forEach((pageId) => {
                    void queryClient.invalidateQueries({
                        queryKey: pathwayKeys.byPageId(pageId),
                    });
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
        },
    });
};

export const useUpdatePathway = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.updatePathway,
        onSuccess: ({ pageIds }) => {
            if (pageIds)
                pageIds.forEach((pageId) => {
                    void queryClient.invalidateQueries({
                        queryKey: pathwayKeys.byPageId(pageId),
                    });
                });
        },
        onError: (error: Error, variables: ModifiedPathwayArgs) => {
            // Log the error for debugging/telemetry
            conToastError(`Failed to update pathway`, { error, variables });
        },
    });
};

export const useDeletePathways = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: pathwayMutations.deletePathways,
        onSuccess: ({ pageIds }) => {
            if (pageIds)
                pageIds.forEach((pageId) => {
                    void queryClient.invalidateQueries({
                        queryKey: pathwayKeys.byPageId(pageId),
                    });
                });
        },
        onError: (error: Error, variables: number[]) => {
            // Log the error for debugging/telemetry
            conToastError(
                `Failed to delete ${variables.length} pathway${
                    variables.length === 1 ? "" : "s"
                }`,
                { error, variables },
            );
        },
    });
};
