import { db, schema } from "@/global/database/db";
import { eq } from "drizzle-orm";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabasePage,
    createPages,
    getPages,
    realDatabasePageToDatabasePage,
    deletePages,
    transactionWithHistory,
    updatePagesInTransaction,
    updateLastPageCounts,
    createLastPage,
    NewPageArgs,
    ModifiedPageArgs,
    getPagesInOrder,
    DatabasePageWithBeat,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import { analytics } from "@/utilities/analytics";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { utilityKeys } from "./useUtility";
import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { beatKeys } from "./useBeats";

const { pages } = schema;

const KEY_BASE = "pages";

// Query key factory
export const pageKeys = {
    /** This should almost never be used unless you absolutely need every page in the show at one time */
    all: () => [KEY_BASE] as const,
    inOrder: () => [KEY_BASE, "in_order"] as const,
    byId: (pageId: number) => [KEY_BASE, "id", pageId] as const,
    byStartBeat: (startBeat: number) =>
        [KEY_BASE, "startBeat", startBeat] as const,
    single: (pageId: number) => [KEY_BASE, "single", pageId] as const,
};

export const invalidatePageQueries = async (qc: QueryClient) => {
    await qc.invalidateQueries({
        queryKey: beatKeys.all(),
    });
    await qc.invalidateQueries({
        queryKey: pageKeys.all(),
    });
    const marcherPagePromise = qc.invalidateQueries({
        queryKey: marcherPageKeys.all(),
    });
    const utilityPromise = qc.invalidateQueries({
        queryKey: utilityKeys.all(),
    });
    await Promise.all([marcherPagePromise, utilityPromise]);
    void qc.invalidateQueries({
        queryKey: coordinateDataKeys.all,
    });
};

const pageQueries = {
    getAll: async (db: DbConnection): Promise<DatabasePage[]> => {
        return await getPages({ db });
    },
    getById: async (
        db: DbConnection,
        pageId: number,
    ): Promise<DatabasePage | undefined> => {
        const dbResponse = await db.query.pages.findFirst({
            where: eq(pages.id, pageId),
        });

        return dbResponse
            ? realDatabasePageToDatabasePage(dbResponse)
            : undefined;
    },

    getByStartBeat: async (
        db: DbConnection,
        startBeat: number,
    ): Promise<DatabasePage | undefined> => {
        const dbResponse = await db.query.pages.findFirst({
            where: eq(pages.start_beat, startBeat),
        });

        return dbResponse
            ? realDatabasePageToDatabasePage(dbResponse)
            : undefined;
    },
};

export interface ModifyPagesRequest {
    modifiedPagesArgs: ModifiedPageArgs[];
    lastPageCounts?: number;
}
/**
 * Represents a request to modify multiple pages with optional last page count tracking.
 *
 * @param modifiedPagesArgs - An array of page modification arguments to be applied.
 * @param lastPageCounts - Optional number of counts for the last page, used for tracking page modifications.
 */
const updatePagesAndLastPageCounts = async ({
    db,
    modifiedPages,
}: {
    db: DbConnection;
    modifiedPages: ModifyPagesRequest;
}) => {
    if (
        modifiedPages.modifiedPagesArgs.length > 0 ||
        modifiedPages.lastPageCounts != null
    )
        return await transactionWithHistory(
            db,
            "Update Page and Last Page Counts",
            async (tx) => {
                if (modifiedPages.modifiedPagesArgs.length > 0)
                    await updatePagesInTransaction({
                        modifiedPages: modifiedPages.modifiedPagesArgs,
                        tx,
                    });
                if (modifiedPages.lastPageCounts != null) {
                    await updateLastPageCounts({
                        lastPageCounts: modifiedPages.lastPageCounts,
                        tx,
                    });
                }
            },
        );
};

/**
 * Query options for the pages query
 *
 * @param enabled - whether the query should run
 * @returns
 */
export const allDatabasePagesQueryOptions = (enabled = true) => {
    return queryOptions<DatabasePage[]>({
        queryKey: pageKeys.all(),
        queryFn: async () => {
            return await pageQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
        enabled,
    });
};

export const databasePageQueryByIdOptions = (id: number) => {
    return queryOptions<DatabasePage | undefined>({
        queryKey: pageKeys.byId(id),
        queryFn: async () => {
            return await pageQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const databasePageQueryByStartBeatOptions = (startBeat: number) => {
    return queryOptions<DatabasePage | undefined>({
        queryKey: pageKeys.byStartBeat(startBeat),
        queryFn: async () => {
            return await pageQueries.getByStartBeat(db, startBeat);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const createPagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newPages: NewPageArgs[]) => createPages({ db, newPages }),
        onSuccess: async (result) => {
            void invalidatePageQueries(qc);
            result.forEach((page) => analytics.trackPageCreatedFromDB(page));
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.createFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const updatePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedPages: ModifyPagesRequest) =>
            updatePagesAndLastPageCounts({ db, modifiedPages }),
        onSuccess: async (_, variables) => {
            void invalidatePageQueries(qc);
            variables.modifiedPagesArgs.forEach((args) => {
                // We construct a partial page object from the args
                analytics.trackPageUpdatedFromDB({
                    id: args.id,
                    is_subset: args.is_subset ?? false, // Default or unknown
                    notes: args.notes ?? null,
                    // These fields are required by DatabasePage but we don't have them
                    // Casting to any to satisfy the type, as we know analytics handles partials safely enough
                    // or we should update analytics signature to accept Partial<DatabasePage>
                } as any);
            });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.updateFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const deletePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (pageIds: Set<number>) => deletePages({ db, pageIds }),
        onSuccess: async (result) => {
            toast.success(tolgee.t("pages.deletedSuccessfully"));
            // Invalidate all page queries
            void invalidatePageQueries(qc);
            // If deletePages returns the deleted pages, we can track them.
            // If it returns void, we use variables (ids).
            if (Array.isArray(result)) {
                result.forEach((page) => analytics.trackPageDeleted(page.id));
            }
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.deleteFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const createLastPageMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newPageCounts: number) =>
            createLastPage({ db, newPageCounts }),
        onSuccess: (result) => {
            // Invalidate all page queries
            void invalidatePageQueries(qc);
            if (result) {
                analytics.trackPageCreatedFromDB(result);
            }
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.createLastPageFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const pagesInOrderQueryOptions = () => {
    return queryOptions<DatabasePageWithBeat[]>({
        queryKey: pageKeys.inOrder(),
        queryFn: async () => await getPagesInOrder({ tx: db }),
        staleTime: DEFAULT_STALE_TIME,
    });
};
