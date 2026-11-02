import { withTimelinePageRipple } from "@/db-functions/timelineRipple";
import { db, schema } from "@/global/database/db";
import { eq } from "drizzle-orm";
import {
    queryOptions,
    mutationOptions,
    notifyManager,
    Query,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabasePage,
    createPages,
    getBeats,
    getPages,
    getUtility,
    realDatabasePageToDatabasePage,
    transactionWithHistory,
    updatePagesInTransaction,
    updateLastPageCounts,
    NewPageArgs,
    ModifiedPageArgs,
    getPagesInOrder,
    DatabasePageWithBeat,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import { toast } from "sonner";
import { queueHistoryStep } from "@/shortcuts/handlers/historyQueue";
import { getLatestUndoEntryToken } from "@/db-functions";
import { undoIfStillLatest } from "./undoIfStillLatest";
import { ACTION_TOAST_DURATION_MS } from "@/components/ui/toastDurations";
import tolgee from "@/global/singletons/Tolgee";
import { utilityKeys } from "./useUtility";
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

/**
 * After a page write. The beats, pages and `last_page_counts` are read first and land in the cache
 * in one notification: fetched again one by one, the UI drew a frame with the new pages and the old
 * last page length (a page added past the last flag showed the old length, past the playhead).
 * `onShown` runs in that same notification, so state set from it (a selection of the new page)
 * draws in the same frame. The narrower page and beat queries refetch after. This only helps while
 * something observes the lists themselves (`useTimingObjects` does); otherwise it is a plain
 * invalidation.
 */
export const invalidatePageQueries = async (
    qc: QueryClient,
    onShown?: () => void,
) => {
    const lists = [beatKeys.all(), pageKeys.all(), utilityKeys.all()];
    const shown = lists.some(
        (queryKey) =>
            (qc
                .getQueryCache()
                .find({ queryKey, exact: true })
                ?.getObserversCount() ?? 0) > 0,
    );
    // A fetch already running may have read the rows from before the write; once these land it
    // would put them back
    if (shown)
        await Promise.all(
            lists.map((queryKey) =>
                qc.cancelQueries({ queryKey, exact: true }),
            ),
        );
    const read = shown
        ? Promise.all([
              getBeats({ db }),
              getPages({ db }),
              getUtility({ db }),
          ]).catch(() => null)
        : null;
    const rows = await read;
    if (!rows) {
        // Nothing draws them, or the read failed: refetch the usual way
        await Promise.all(
            lists.map((queryKey) => qc.invalidateQueries({ queryKey })),
        );
        onShown?.();
        return;
    }
    const [beats, pageRows, utility] = rows;
    notifyManager.batch(() => {
        qc.setQueryData(beatKeys.all(), beats);
        qc.setQueryData(pageKeys.all(), pageRows);
        qc.setQueryData(utilityKeys.all(), utility);
        if (onShown) notifyManager.schedule(onShown);
    });
    const narrower = (query: Query) => query.queryKey.length > 1;
    await Promise.all([
        qc.invalidateQueries({ queryKey: beatKeys.all(), predicate: narrower }),
        qc.invalidateQueries({ queryKey: pageKeys.all(), predicate: narrower }),
    ]);
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
            async (tx) =>
                await withTimelinePageRipple(tx, async () => {
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
                }),
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
        onSuccess: async (_) => {
            void invalidatePageQueries(qc);
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.createError", { error: e.message }),
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
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("pages.updateError", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

/**
 * The "page deleted" toast, with an Undo button that undoes that deletion
 * only: it runs Undo only while the deletion is still the latest history
 * entry (see getLatestUndoEntryToken), and otherwise says it can't.
 */
export const pageDeletedToastOptions = (undoToken: string | null) => ({
    // Long enough to reach for Undo
    duration: ACTION_TOAST_DURATION_MS,
    action: {
        label: tolgee.t("actions.edit.undo"),
        onClick: () =>
            void queueHistoryStep(
                (perform) =>
                    undoIfStillLatest({
                        token: undoToken,
                        getLatestToken: () => getLatestUndoEntryToken(db),
                        undo: () => perform("undo"),
                        unavailable: () =>
                            toast.info(tolgee.t("pages.undoDeleteUnavailable")),
                    }),
                false,
            ),
    },
});

export const pagesInOrderQueryOptions = () => {
    return queryOptions<DatabasePageWithBeat[]>({
        queryKey: pageKeys.inOrder(),
        queryFn: async () => await getPagesInOrder({ tx: db }),
        staleTime: DEFAULT_STALE_TIME,
    });
};
