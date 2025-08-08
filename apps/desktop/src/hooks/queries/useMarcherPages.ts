import { db, schema } from "@/global/database/db";
import { eq, and } from "drizzle-orm";
import { incrementUndoGroup } from "@/global/classes/History";
import { Path } from "@openmarch/path-utility";
import type Page from "@/global/classes/Page";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

const { marcher_pages, pathways } = schema;

// Define types from the existing schema
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect & {
    path_data: string | null;
    pathway_notes: string | null;
};

export interface MarcherPage {
    readonly id: number;
    readonly id_for_html: string | null;
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
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

// Helper function to create path data
function createPathData(
    currentMarcherPage: DatabaseMarcherPage,
    previousMarcherPage: DatabaseMarcherPage | null,
): Path | null {
    if (!currentMarcherPage.path_data || !previousMarcherPage) {
        return null;
    }

    return Path.fromJson(
        currentMarcherPage.path_data,
        { x: previousMarcherPage.x, y: previousMarcherPage.y },
        { x: currentMarcherPage.x, y: currentMarcherPage.y },
    );
}

// Helper function to convert database marcher pages to MarcherPage objects
function databaseMarcherPagesToMarcherPages(
    databaseMarcherPages: DatabaseMarcherPage[],
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

            result.push({
                ...dbMarcherPage,
                path_data: createPathData(dbMarcherPage, previousMarcherPage),
                x: dbMarcherPage.x || 0,
                y: dbMarcherPage.y || 0,
            });
        });
    });

    return result;
}

// Query functions
const marcherPageQueries = {
    getAll: async (filters?: {
        marcher_id?: number;
        page_id?: number;
        pages?: Page[];
    }): Promise<MarcherPage[]> => {
        const conditions = [];
        if (filters?.marcher_id !== undefined) {
            conditions.push(eq(marcher_pages.marcher_id, filters.marcher_id));
        }
        if (filters?.page_id !== undefined) {
            conditions.push(eq(marcher_pages.page_id, filters.page_id));
        }

        const query = db
            .select({
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
                path_data: pathways.path_data,
                pathway_notes: pathways.notes,
            })
            .from(marcher_pages)
            .leftJoin(pathways, eq(marcher_pages.path_data_id, pathways.id));

        // Apply conditions if any exist
        if (conditions.length > 0) {
            query.where(
                conditions.length > 1 ? and(...conditions) : conditions[0],
            );
        }

        const rawResult = await query.all();

        // Transform the result to match the MarcherPage interface
        const result: DatabaseMarcherPage[] = rawResult.map((row) => ({
            id: row.id,
            id_for_html: row.id_for_html,
            marcher_id: row.marcher_id,
            page_id: row.page_id,
            x: row.x,
            y: row.y,
            created_at: row.created_at,
            updated_at: row.updated_at,
            path_data_id: row.path_data_id,
            path_position: row.path_position,
            notes: row.notes,
            path_data: row.path_data,
            pathway_notes: row.pathway_notes,
        }));

        return databaseMarcherPagesToMarcherPages(result, filters?.pages);
    },

    getByPage: async (
        pageId: number,
        pages?: Page[],
    ): Promise<MarcherPage[]> => {
        return marcherPageQueries.getAll({ page_id: pageId, pages });
    },

    getByMarcher: async (
        marcherId: number,
        pages?: Page[],
    ): Promise<MarcherPage[]> => {
        return marcherPageQueries.getAll({ marcher_id: marcherId, pages });
    },

    getByMarcherAndPage: async (
        marcherId: number,
        pageId: number,
        pages?: Page[],
    ): Promise<MarcherPage | undefined> => {
        const result = await marcherPageQueries.getAll({
            marcher_id: marcherId,
            page_id: pageId,
            pages,
        });
        return result[0];
    },
};

// Query hooks
export const useMarcherPages = (filters?: {
    marcher_id?: number;
    page_id?: number;
    pages?: Page[];
}) => {
    return useQuery({
        queryKey: marcherPageKeys.list(filters || {}),
        queryFn: () => marcherPageQueries.getAll(filters),
    });
};

export const useMarcherPagesByPage = (pageId: number, pages?: Page[]) => {
    return useQuery({
        queryKey: marcherPageKeys.byPage(pageId),
        queryFn: () => marcherPageQueries.getByPage(pageId, pages),
        enabled: !!pageId,
    });
};

export const useMarcherPagesByMarcher = (marcherId: number, pages?: Page[]) => {
    return useQuery({
        queryKey: marcherPageKeys.byMarcher(marcherId),
        queryFn: () => marcherPageQueries.getByMarcher(marcherId, pages),
        enabled: !!marcherId,
    });
};

export const useMarcherPage = (
    marcherId: number,
    pageId: number,
    pages?: Page[],
) => {
    return useQuery({
        queryKey: marcherPageKeys.detail(marcherId, pageId),
        queryFn: () =>
            marcherPageQueries.getByMarcherAndPage(marcherId, pageId, pages),
        enabled: !!marcherId && !!pageId,
    });
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
                            path_data: pathways.path_data,
                            pathway_notes: pathways.notes,
                        })
                        .get();

                    results.push(result);
                }

                return results;
            });
        },
        onSuccess: (data, variables) => {
            // Invalidate specific queries based on what changed
            const pagesAffected = new Set(variables.map((v) => v.page_id));
            const marchersAffected = new Set(
                variables.map((v) => v.marcher_id),
            );

            // Invalidate affected pages
            pagesAffected.forEach((pageId) => {
                queryClient.invalidateQueries({
                    queryKey: marcherPageKeys.byPage(pageId),
                });
            });

            // Invalidate affected marchers
            marchersAffected.forEach((marcherId) => {
                queryClient.invalidateQueries({
                    queryKey: marcherPageKeys.byMarcher(marcherId),
                });
            });

            // Invalidate specific marcher-page combinations
            variables.forEach(({ marcher_id, page_id }) => {
                queryClient.invalidateQueries({
                    queryKey: marcherPageKeys.detail(marcher_id, page_id),
                });
            });

            // Invalidate list queries
            queryClient.invalidateQueries({
                queryKey: marcherPageKeys.lists(),
            });
        },
    });
};
