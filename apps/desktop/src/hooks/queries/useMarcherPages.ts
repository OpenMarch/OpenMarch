import { db, schema } from "@/global/database/db";
import { eq, and } from "drizzle-orm";
import {
    queryOptions,
    QueryClient,
    mutationOptions,
} from "@tanstack/react-query";
import {
    marcherPageMapFromArray,
    toMarcherPagesByMarcher,
    toMarcherPagesByPage,
} from "@/global/classes/MarcherPageIndex";
import { queryClient } from "@/App";
import { updateEndPoint } from "@/db-functions/pathways";
import { getNextMarcherPage } from "@/db-functions/marcherPage";
import MarcherPage, {
    ModifiedMarcherPageArgs as GlobalModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import { conToastError } from "@/utilities/utils";
import { DbTransaction, transactionWithHistory } from "@/db-functions";

const { marcher_pages } = schema;

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

/**
 * Arguments for modifying an existing marcher page
 */
export interface ModifiedMarcherPageArgs
    extends GlobalModifiedMarcherPageArgs {}

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

const marcherPageQueries = {
    getAll: async (
        filters: MarcherPageQueryFilters,
        suppressWarnings = false,
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
            if (!suppressWarnings)
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

/**
 * Get all marcher pages for the entire show.
 *
 * This should only be used in exceptional cases where you need to fetch all marcher pages for the entire show.
 *
 * @param pinkyPromiseThatYouKnowWhatYouAreDoing - if true, will not log a warning if no filters are provided
 * @returns
 */
export const allMarcherPagesQueryOptions = ({
    pinkyPromiseThatYouKnowWhatYouAreDoing = false,
}: {
    pinkyPromiseThatYouKnowWhatYouAreDoing?: boolean;
}) => {
    return queryOptions({
        queryKey: marcherPageKeys.all(),
        queryFn: async () => {
            const mpResponse = await marcherPageQueries.getAll(
                undefined,
                pinkyPromiseThatYouKnowWhatYouAreDoing,
            );
            return marcherPageMapFromArray(mpResponse);
        },
    });
};

/**
 * Get all marcher pages for a given page id
 *
 * @param pageId - the page id to fetch.
 * @returns - a Record of all the marcher pages for this page with the marcher ID as the key
 */
export const marcherPagesByPageQueryOptions = (
    pageId: number | null | undefined,
) => {
    // Fetch marcher pages without pathway data
    return queryOptions({
        queryKey: marcherPageKeys.byPage(pageId!),
        queryFn: async () => {
            const mpResponse = await marcherPageQueries.getByPage(pageId!);
            return toMarcherPagesByMarcher(mpResponse);
        },
        enabled: pageId != null,
    });
};

/**
 * Get all marcher pages for a given marcher id
 *
 * @param marcherId - the marcher id to fetch.
 * @returns - a Record of all the marcher pages for this marcher with the page ID as the key
 */
export const marcherPagesByMarcherQueryOptions = (
    marcherId: number | null | undefined,
) => {
    return queryOptions({
        queryKey: marcherPageKeys.byMarcher(marcherId!),
        queryFn: async () => {
            const mpResponse = await marcherPageQueries.getByMarcher(
                marcherId!,
            );
            return toMarcherPagesByPage(mpResponse);
        },
        enabled: marcherId != null,
    });
};

// Mutation functions (pure business logic)
const marcherPageMutations = {
    updateMarcherPages: async (
        tx: DbTransaction,
        modifiedMarcherPages: ModifiedMarcherPageArgs[],
    ): Promise<DatabaseMarcherPage[]> => {
        const results: DatabaseMarcherPage[] = [];

        for (const modifiedMarcherPage of modifiedMarcherPages) {
            const { marcher_id, page_id, ...updateData } = modifiedMarcherPage;

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
    },
};

export const fetchMarcherPages = () => {
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

// Mutation hooks
export const updateMarcherPagesMutationOptions = (queryClient: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarcherPages: ModifiedMarcherPageArgs[]) =>
            transactionWithHistory(db, "updateMarcherPages", async (tx) => {
                return marcherPageMutations.updateMarcherPages(
                    tx,
                    modifiedMarcherPages,
                );
            }),
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
