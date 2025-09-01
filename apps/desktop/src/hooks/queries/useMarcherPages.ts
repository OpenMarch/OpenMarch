import { db, schema } from "@/global/database/db";
import { eq, and } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import type Page from "@/global/classes/Page";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import MarcherPageMap, {
    marcherPageMapFromArray,
} from "@/global/classes/MarcherPageIndex";
import { queryClient } from "@/App";
import { updateEndPoint } from "@/db-functions/pathways";
import { getNextMarcherPage } from "@/db-functions/marcherPage";
import MarcherPage from "@/global/classes/MarcherPage";
import { conToastError } from "@/utilities/utils";

const { marcher_pages } = schema;

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

/**
 * Arguments for modifying an existing marcher page
 */
export interface ModifiedMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    notes?: string | null;
    path_data_id?: number | null;
    path_start_position?: number | null;
    path_end_position?: number | null;
}

const KEY_BASE = "marcherPage";

// Query key factory
export const marcherPageKeys = {
    /** This should almost never be used unless you absolutely need every marcherPage in the show at one time */
    all: () => ["marcherPage"] as const,
    byPage: (pageId: number) => [KEY_BASE, "page", pageId] as const,
    byMarcher: (marcherId: number) => [KEY_BASE, "marcher", marcherId] as const,
    single: ({ marcherId, pageId }: { marcherId: number; pageId: number }) => [
        [KEY_BASE, "marcher", marcherId, "page", pageId] as const,
    ],
};

const getKeyForFilters = (filters: MarcherPageQueryFilters) => {
    if (
        !filters ||
        (filters.page_id === undefined && filters.marcher_id === undefined)
    )
        return marcherPageKeys.all();

    if (filters.page_id !== undefined && filters.marcher_id !== undefined)
        return marcherPageKeys.single({
            marcherId: filters.marcher_id,
            pageId: filters.page_id,
        });

    if (filters.page_id !== undefined)
        return marcherPageKeys.byPage(filters.page_id);

    if (filters.marcher_id !== undefined)
        return marcherPageKeys.byMarcher(filters.marcher_id);

    throw new Error("Invalid marcherPage filters provided to getKeyForFilters");
};

const marcherPageQueries = {
    getAll: async (
        filters: MarcherPageQueryFilters,
    ): Promise<MarcherPage[]> => {
        const conditions = [];
        if (filters?.marcher_id !== undefined) {
            conditions.push(eq(marcher_pages.marcher_id, filters.marcher_id));
        }
        if (filters?.page_id !== undefined) {
            conditions.push(eq(marcher_pages.page_id, filters.page_id));
        }

        // Build the query with conditions
        if (conditions.length > 0) {
            return await db.query.marcher_pages.findMany({
                where:
                    conditions.length > 1 ? and(...conditions) : conditions[0],
            });
        } else {
            // No conditions, return all rows
            console.warn(
                "Returning all marcherPage rows. This should not happen as this fetches all of the coordinates for the entire show. You should probably use getByPage or getByMarcher",
            );
            return await db.query.marcher_pages.findMany();
        }
    },

    getByPage: async (pageId: number): Promise<MarcherPage[]> => {
        return marcherPageQueries.getAll({ page_id: pageId });
    },

    getByMarcher: async (marcherId: number): Promise<MarcherPage[]> => {
        return marcherPageQueries.getAll({
            marcher_id: marcherId,
        });
    },

    getByMarcherAndPage: async (
        marcherId: number,
        pageId: number,
    ): Promise<MarcherPage | undefined> => {
        const result = await marcherPageQueries.getAll({
            marcher_id: marcherId,
            page_id: pageId,
        });
        return result[0];
    },
};

/**
 * Filters for the marcherPageQueries.getAll function
 */
type MarcherPageQueryFilters =
    | {
          marcher_id?: number;
          page_id?: number;
      }
    | undefined;

// Query hooks with pathway data integration
export const useMarcherPages = ({
    pages,
    filters,
}: {
    pages: Page[];
    filters?: MarcherPageQueryFilters;
}) => {
    if (!filters || Object.keys(filters).length === 0)
        console.warn(
            "No filters provided to useMarcherPages which will fetch every marcher page in the show. This is inefficient and should be avoided.",
        );

    // Fetch marcher pages without pathway data
    return useQuery<MarcherPageMap>({
        queryKey: getKeyForFilters(filters),
        queryFn: async () => {
            const mpResponse = await marcherPageQueries.getAll(filters);
            return marcherPageMapFromArray(mpResponse);
        },
    });
};

// Mutation functions (pure business logic)
const marcherPageMutations = {
    updateMarcherPages: async (
        modifiedMarcherPages: ModifiedMarcherPageArgs[],
    ): Promise<DatabaseMarcherPage[]> => {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabaseMarcherPage[] = [];

            for (const modifiedMarcherPage of modifiedMarcherPages) {
                const { marcher_id, page_id, ...updateData } =
                    modifiedMarcherPage;

                const currentMarcherPage = await tx
                    .update(marcher_pages)
                    .set(updateData)
                    .where(
                        and(
                            eq(marcher_pages.marcher_id, marcher_id),
                            eq(marcher_pages.page_id, page_id),
                        ),
                    )
                    .returning({
                        id: marcher_pages.id,
                        marcher_id: marcher_pages.marcher_id,
                        page_id: marcher_pages.page_id,
                        x: marcher_pages.x,
                        y: marcher_pages.y,
                        created_at: marcher_pages.created_at,
                        updated_at: marcher_pages.updated_at,
                        path_data_id: marcher_pages.path_data_id,
                        path_start_position: marcher_pages.path_start_position,
                        path_end_position: marcher_pages.path_end_position,
                        notes: marcher_pages.notes,
                    })
                    .get();

                if (currentMarcherPage.path_data_id) {
                    updateEndPoint({
                        tx,
                        pathwayId: currentMarcherPage.path_data_id,
                        newPoint: {
                            x: currentMarcherPage.x,
                            y: currentMarcherPage.y,
                        },
                        type: "end",
                    });
                }

                const nextMarcherPage = await getNextMarcherPage(tx, {
                    marcherPageId: currentMarcherPage.id,
                });

                if (nextMarcherPage && nextMarcherPage.path_data_id) {
                    updateEndPoint({
                        tx,
                        pathwayId: nextMarcherPage.path_data_id,
                        newPoint: {
                            x: currentMarcherPage.x,
                            y: currentMarcherPage.y,
                        },
                        type: "start",
                    });
                }

                results.push(currentMarcherPage);
            }

            return results;
        });
    },
};

export const fetchMarcherPages = () => {
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

// Mutation hooks
export const useUpdateMarcherPages = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: marcherPageMutations.updateMarcherPages,
        onSuccess: (_, variables) => {
            // Invalidate all marcher pages queries
            const pageIds = new Set<number>();
            for (const modifiedArgs of variables)
                pageIds.add(modifiedArgs.page_id);

            queryClient.invalidateQueries({
                queryKey: Array.from(pageIds).map((pageId) =>
                    marcherPageKeys.byPage(pageId),
                ),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating coordinates`, e, variables);
        },
    });
};
