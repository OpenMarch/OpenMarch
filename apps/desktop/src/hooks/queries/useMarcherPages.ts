import { db, schema } from "@/global/database/db";
import { eq, and, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { Path } from "@openmarch/path-utility";
import type Page from "@/global/classes/Page";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { pathwayKeys } from "./usePathways";

const { marcher_pages, pathways } = schema;

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

export interface MarcherPage {
    readonly id: number;
    readonly id_for_html: string | null;
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number | null;
    readonly y: number | null;
    readonly path_data_id: number | null;
    readonly path_position: number | null;
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
    path_position?: number | null;
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
function databaseMarcherPagesToMarcherPages(
    databaseMarcherPages: DatabaseMarcherPage[],
    pathways: Map<number, { path_data: string; notes: string | null }>,
    pages?: Page[],
): MarcherPage[] {
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
            const pathway = dbMarcherPage.path_data_id
                ? pathways.get(dbMarcherPage.path_data_id)
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

// Custom hook for combining marcher pages with pathway data
const useMarcherPagesWithPathways = (
    marcherPages: DatabaseMarcherPage[] | undefined,
    pages?: Page[],
) => {
    // Extract unique pathway IDs from marcher pages
    const pathwayIds = useMemo(() => {
        if (!marcherPages) return [];
        const ids = marcherPages
            .map((mp) => mp.path_data_id)
            .filter((id): id is number => id !== null);
        return [...new Set(ids)];
    }, [marcherPages]);

    // Fetch only the needed pathways
    const pathwaysQuery = usePathwaysByIds(pathwayIds);

    // Combine the data when both queries are successful
    const combinedData = useMemo(() => {
        if (!marcherPages || !pathwaysQuery.data) {
            return undefined;
        }

        // Create a map of pathway data for efficient lookup
        const pathwaysMap = new Map(
            pathwaysQuery.data.map((pathway) => [
                pathway.id,
                { path_data: pathway.path_data, notes: pathway.notes },
            ]),
        );

        return databaseMarcherPagesToMarcherPages(
            marcherPages,
            pathwaysMap,
            pages,
        );
    }, [marcherPages, pathwaysQuery.data, pages]);

    return {
        data: combinedData,
        isLoading: pathwaysQuery.isLoading,
        error: pathwaysQuery.error,
    };
};

// Query functions - remove pathway join
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

        const query = db.select().from(marcher_pages);

        // Apply conditions if any exist
        if (conditions.length > 0) {
            query.where(
                conditions.length > 1 ? and(...conditions) : conditions[0],
            );
        }

        return await query.all();
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
export const useMarcherPages = (filters?: {
    marcher_id?: number;
    page_id?: number;
    pages?: Page[];
}) => {
    // Fetch marcher pages without pathway data
    const marcherPagesQuery = useQuery({
        queryKey: marcherPageKeys.list(filters || {}),
        queryFn: () => marcherPageQueries.getAll(filters),
    });

    // Combine with pathway data
    const pathwaysResult = useMarcherPagesWithPathways(
        marcherPagesQuery.data,
        filters?.pages,
    );

    return combineQueryResults(marcherPagesQuery, pathwaysResult);
};

export const useMarcherPagesByPage = (pageId: number, pages?: Page[]) => {
    const marcherPagesQuery = useQuery({
        queryKey: marcherPageKeys.byPage(pageId),
        queryFn: () => marcherPageQueries.getByPage(pageId, pages),
        enabled: pageId != null,
    });

    const pathwaysResult = useMarcherPagesWithPathways(
        marcherPagesQuery.data,
        pages,
    );

    return combineQueryResults(marcherPagesQuery, pathwaysResult);
};

export const useMarcherPagesByMarcher = (marcherId: number, pages?: Page[]) => {
    const marcherPagesQuery = useQuery({
        queryKey: marcherPageKeys.byMarcher(marcherId),
        queryFn: () => marcherPageQueries.getByMarcher(marcherId, pages),
        enabled: !!marcherId,
    });

    const pathwaysResult = useMarcherPagesWithPathways(
        marcherPagesQuery.data,
        pages,
    );

    return combineQueryResults(marcherPagesQuery, pathwaysResult);
};

export const useMarcherPage = (
    marcherId: number,
    pageId: number,
    pages?: Page[],
) => {
    const marcherPagesQuery = useQuery({
        queryKey: marcherPageKeys.detail(marcherId, pageId),
        queryFn: () =>
            marcherPageQueries.getByMarcherAndPage(marcherId, pageId, pages),
        enabled: !!marcherId && pageId != null,
    });

    const pathwaysResult = useMarcherPagesWithPathways(
        marcherPagesQuery.data ? [marcherPagesQuery.data] : undefined,
        pages,
    );

    return {
        ...combineQueryResults(marcherPagesQuery, pathwaysResult),
        data: pathwaysResult.data?.[0],
    };
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
                            path_position: marcher_pages.path_position,
                            notes: marcher_pages.notes,
                        })
                        .get();

                    results.push(result);
                }

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // More targeted invalidation - only invalidate affected queries
            const affectedQueries = new Set<string>();

            variables.forEach(({ marcher_id, page_id }) => {
                // Add specific detail query
                affectedQueries.add(
                    JSON.stringify(marcherPageKeys.detail(marcher_id, page_id)),
                );
                // Add page-specific query
                affectedQueries.add(
                    JSON.stringify(marcherPageKeys.byPage(page_id)),
                );
                // Add marcher-specific query
                affectedQueries.add(
                    JSON.stringify(marcherPageKeys.byMarcher(marcher_id)),
                );
            });

            // Invalidate only the affected queries
            affectedQueries.forEach((queryKeyStr) => {
                const queryKey = JSON.parse(queryKeyStr);
                queryClient.invalidateQueries({ queryKey });
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
