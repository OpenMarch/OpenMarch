import {
    readPageGrid,
    withTimelinePageRipple,
} from "@/db-functions/timelineRipple";
import {
    transactionWithHistory,
    createPagesInTransaction,
    updatePagesInTransaction,
    updateLastPageCounts,
    type DbConnection,
    type DbTransaction,
} from "@/db-functions";
import { splitMovesAtBeatInTransaction } from "@/db-functions/timelinePointMoves";
import { isBasicMode } from "@/stores/EditorModeStore";
import { db } from "@/global/database/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    allDatabasePagesQueryOptions,
    allDatabaseMeasuresQueryOptions,
    allDatabaseBeatsQueryOptions,
} from "@/hooks/queries";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { splitPage } from "@/global/classes/Page";
import Page from "@/global/classes/Page";

// Types
export type SplitPageArgs = {
    page: Pick<Page, "beats" | "nextPageId">;
    /**
     * Basic (README "Basic's panel"): in timeline mode, also split each marcher's move at the new
     * page's start, so no simple move crosses the new flag (`splitMovesAtBeatInTransaction`)
     */
    splitMoves?: boolean;
};

/**
 * With `splitMoves` in timeline mode, splits the moves across `startBeatId` (the new page's start
 * beat) on the page box holding it, before the page rows change.
 */
const splitMovesAtNewPage = async (tx: DbTransaction, startBeatId: number) => {
    const grid = await readPageGrid(tx);
    const beat = grid.beatIds.indexOf(startBeatId);
    const box = grid.pages.find((p) => p.start < beat && beat < p.end);
    if (beat < 0 || !box) return;
    await splitMovesAtBeatInTransaction({
        tx,
        beat,
        box: { start: box.start, end: box.end },
    });
};

// Database operation function (private, prefixed with _)
export const _splitPage = async ({
    page,
    splitMoves = false,
    database = db,
}: SplitPageArgs & { database?: DbConnection }) => {
    const splitResult = splitPage(page);
    if (!splitResult) {
        throw new Error("Failed to split page");
    }

    await transactionWithHistory(
        database,
        "splitPage",
        async (tx) =>
            await withTimelinePageRipple(tx, async () => {
                if (splitMoves)
                    await splitMovesAtNewPage(
                        tx,
                        splitResult.newPageArgs.start_beat,
                    );
                // Create the new page
                await createPagesInTransaction({
                    newPages: [splitResult.newPageArgs],
                    tx,
                });

                // Update the original page if needed
                if (splitResult.modifyPageRequest) {
                    if (
                        splitResult.modifyPageRequest.modifiedPagesArgs.length >
                        0
                    ) {
                        await updatePagesInTransaction({
                            modifiedPages:
                                splitResult.modifyPageRequest.modifiedPagesArgs,
                            tx,
                        });
                    }
                    if (splitResult.modifyPageRequest.lastPageCounts != null) {
                        await updateLastPageCounts({
                            lastPageCounts:
                                splitResult.modifyPageRequest.lastPageCounts,
                            tx,
                        });
                    }
                }
            }),
    );
};

// React Query mutation hook
const useSplitPageMutation = <TArgs>(
    mutationFn: (args: TArgs) => Promise<void>,
    errorKey: string,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async () => {
            // Invalidate all timing object queries
            await queryClient.invalidateQueries({
                queryKey: allDatabaseBeatsQueryOptions().queryKey,
            });
            void queryClient.invalidateQueries({
                queryKey: allDatabasePagesQueryOptions().queryKey,
            });
            void queryClient.invalidateQueries({
                queryKey: allDatabaseMeasuresQueryOptions().queryKey,
            });
        },
        onError: (error) => {
            conToastError(tolgee.t(errorKey), error);
        },
    });
};

// Public mutation hook
export const useSplitPage = () => {
    return useSplitPageMutation(
        (args: SplitPageArgs) =>
            _splitPage({
                ...args,
                splitMoves: isBasicMode(),
            }),
        "inspector.page.split.error",
    );
};
