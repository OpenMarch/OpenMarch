import { db, schema } from "@/global/database/db";
import { eq, and } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { Path } from "@openmarch/path-utility";
import type Page from "@/global/classes/Page";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { PathwayMap, usePathways } from "./usePathways";
import MarcherPageMap, {
    marcherPageMapFromArray,
} from "@/global/classes/MarcherPageIndex";
import { queryClient } from "@/App";

const { marcher_pages } = schema;

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

export interface MarcherPage {
    readonly id: number;
    readonly id_for_html: string | null;
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
    readonly path_data_id: number | null;
    readonly path_start_position: number | null;
    readonly path_end_position: number | null;
    readonly path_data: Path | null;
    readonly notes: string | null;
    readonly pathway_notes: string | null;
}

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

// Query key factory
export const marcherPageKeys = {
    all: ["marcherPages"] as const,
    lists: () => [...marcherPageKeys.all, "list"] as const,
    list: (filters: { marcher_id?: number; page_id?: number } = {}) =>
        [...marcherPageKeys.lists(), filters] as const,
    details: () => [...marcherPageKeys.all, "detail"] as const,
    detail: (marcherId: number, pageId: number) =>
        [...marcherPageKeys.details(), marcherId, pageId] as const,
    byPage: (pageId: number) =>
        [...marcherPageKeys.all, "page", pageId] as const,
    byMarcher: (marcherId: number) =>
        [...marcherPageKeys.all, "marcher", marcherId] as const,
};

// Helper function to create path data with error handling
function createPathData(
    currentMarcherPage: DatabaseMarcherPage,
    previousMarcherPage: DatabaseMarcherPage | null,
    pathwayData: string | null,
): Path | null {
    try {
        if (!pathwayData || !previousMarcherPage) {
            return null;
        }

        return Path.fromJson(
            pathwayData,
            { x: previousMarcherPage.x || 0, y: previousMarcherPage.y || 0 },
            { x: currentMarcherPage.x || 0, y: currentMarcherPage.y || 0 },
        );
    } catch (error) {
        console.error("Failed to create path data:", error);
        return null;
    }
}

// Helper function to convert database marcher pages to MarcherPage objects
function databaseMarcherPagesToMarcherPages({
    databaseMarcherPages,
    pathways,
    pages,
}: {
    databaseMarcherPages: DatabaseMarcherPage[];
    pathways?: PathwayMap;
    pages: Page[];
}): MarcherPage[] {
    // If no pages data provided, use array index as order
    const pageOrderMap = pages?.length
        ? new Map(pages.map((page) => [page.id, page.order]))
        : null;

    // Group marcher pages by marcher_id
    const marcherPagesByMarcher = new Map<number, DatabaseMarcherPage[]>();
    databaseMarcherPages.forEach((marcherPage) => {
        const marcherId = marcherPage.marcher_id;
        if (!marcherPagesByMarcher.has(marcherId)) {
            marcherPagesByMarcher.set(marcherId, []);
        }
        marcherPagesByMarcher.get(marcherId)!.push(marcherPage);
    });

    // Convert each marcher's pages
    const result: MarcherPage[] = [];

    marcherPagesByMarcher.forEach((marcherPages, marcherId) => {
        // Sort by page order if available, otherwise by array index
        const sortedMarcherPages = pageOrderMap
            ? marcherPages.sort((a, b) => {
                  const aOrder = pageOrderMap.get(a.page_id) ?? 0;
                  const bOrder = pageOrderMap.get(b.page_id) ?? 0;
                  return aOrder - bOrder;
              })
            : marcherPages;

        // Convert each marcher page with path data
        sortedMarcherPages.forEach((dbMarcherPage, index) => {
            const previousMarcherPage =
                index > 0 ? sortedMarcherPages[index - 1] : null;

            // Get pathway data if this marcher page has a pathway
            const pathway = pathways
                ? dbMarcherPage.path_data_id
                    ? pathways[dbMarcherPage.path_data_id]
                    : null
                : null;

            result.push({
                ...dbMarcherPage,
                path_data: createPathData(
                    dbMarcherPage,
                    previousMarcherPage,
                    pathway?.path_data || null,
                ),
                pathway_notes: pathway?.notes || null,
            });
        });
    });

    return result;
}

const marcherPageQueries = {
    getAll: async (filters?: {
        marcher_id?: number;
        page_id?: number;
        pages?: Page[];
    }): Promise<DatabaseMarcherPage[]> => {
        const conditions = [];
        if (filters?.marcher_id !== undefined) {
            conditions.push(eq(marcher_pages.marcher_id, filters.marcher_id));
        }
        if (filters?.page_id !== undefined) {
            conditions.push(eq(marcher_pages.page_id, filters.page_id));
        }

        // Build the query with conditions
        if (conditions.length > 0) {
            return await db
                .select()
                .from(marcher_pages)
                .where(
                    conditions.length > 1 ? and(...conditions) : conditions[0],
                )
                .all();
        }

        // No conditions, return all rows
        return await db.select().from(marcher_pages).all();
    },

    getByPage: async (
        pageId: number,
        pages?: Page[],
    ): Promise<DatabaseMarcherPage[]> => {
        return marcherPageQueries.getAll({ page_id: pageId, pages });
    },

    getByMarcher: async (
        marcherId: number,
        pages?: Page[],
    ): Promise<DatabaseMarcherPage[]> => {
        return marcherPageQueries.getAll({ marcher_id: marcherId, pages });
    },

    getByMarcherAndPage: async (
        marcherId: number,
        pageId: number,
        pages?: Page[],
    ): Promise<DatabaseMarcherPage | undefined> => {
        const result = await marcherPageQueries.getAll({
            marcher_id: marcherId,
            page_id: pageId,
            pages,
        });
        return result[0];
    },
};

// Query hooks with pathway data integration
export const useMarcherPages = ({
    pages,
    filters,
}: {
    pages: Page[];
    filters?: {
        marcher_id?: number;
        page_id?: number;
    };
}) => {
    const pathwaysQuery = usePathways();

    // Fetch marcher pages without pathway data
    return useQuery<MarcherPageMap>({
        queryKey: marcherPageKeys.list(filters || {}),
        queryFn: async () => {
            const mpResponse = await marcherPageQueries.getAll(filters);
            const pathwaysResponse = pathwaysQuery.data;
            return marcherPageMapFromArray(
                databaseMarcherPagesToMarcherPages({
                    databaseMarcherPages: mpResponse,
                    pathways: pathwaysResponse,
                    pages,
                }),
            );
        },
        enabled: pathwaysQuery.isSuccess,
    });
};

export const fetchMarcherPages = () => {
    queryClient.invalidateQueries({ queryKey: marcherPageKeys.list() });
};

// Mutation hooks
export const useUpdateMarcherPages = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (
            modifiedMarcherPages: ModifiedMarcherPageArgs[],
        ): Promise<DatabaseMarcherPage[]> => {
            return await db.transaction(async (tx) => {
                await incrementUndoGroup(tx);

                const results: DatabaseMarcherPage[] = [];

                for (const modifiedMarcherPage of modifiedMarcherPages) {
                    const { marcher_id, page_id, ...updateData } =
                        modifiedMarcherPage;

                    const result = await tx
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
                            id_for_html: marcher_pages.id_for_html,
                            marcher_id: marcher_pages.marcher_id,
                            page_id: marcher_pages.page_id,
                            x: marcher_pages.x,
                            y: marcher_pages.y,
                            created_at: marcher_pages.created_at,
                            updated_at: marcher_pages.updated_at,
                            path_data_id: marcher_pages.path_data_id,
                            path_start_position:
                                marcher_pages.path_start_position,
                            path_end_position: marcher_pages.path_end_position,
                            notes: marcher_pages.notes,
                        })
                        .get();

                    results.push(result);
                }

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate all marcher pages queries
            // TODO - Provide more targeted invalidation
            // Currently, this invalidates all marcher pages queries, which is not efficient.
            queryClient.invalidateQueries({
                queryKey: marcherPageKeys.list(),
            });

            // // More targeted invalidation - only invalidate affected queries
            // const affectedQueries = new Set<string>();

            // variables.forEach(({ marcher_id, page_id }) => {
            //     // Add specific detail query
            //     affectedQueries.add(
            //         JSON.stringify(marcherPageKeys.detail(marcher_id, page_id)),
            //     );
            //     // Add page-specific query
            //     affectedQueries.add(
            //         JSON.stringify(marcherPageKeys.byPage(page_id)),
            //     );
            //     // Add marcher-specific query
            //     affectedQueries.add(
            //         JSON.stringify(marcherPageKeys.byMarcher(marcher_id)),
            //     );
            // });

            // // Invalidate only the affected queries
            // affectedQueries.forEach((queryKeyStr) => {
            //     const queryKey = JSON.parse(queryKeyStr);
            //     queryClient.invalidateQueries({ queryKey });
            // });

            // // Invalidate pathway queries if path_data_id was modified
            // const hasPathwayChanges = variables.some(
            //     (v) => v.path_data_id !== undefined,
            // );
            // if (hasPathwayChanges) {
            //     queryClient.invalidateQueries({
            //         queryKey: pathwayKeys.lists(),
            //     });
            // }
        },
    });
};
