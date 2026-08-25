import {
    transactionWithHistory,
    createPagesInTransaction,
    updatePagesInTransaction,
    updateLastPageCounts,
} from "@/db-functions";
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
};

// Database operation function (private, prefixed with _)
export const _splitPage = async ({ page }: SplitPageArgs) => {
    const splitResult = splitPage(page);
    if (!splitResult) {
        throw new Error("Failed to split page");
    }

    await transactionWithHistory(db, "splitPage", async (tx) => {
        // Create the new page
        await createPagesInTransaction({
            newPages: [splitResult.newPageArgs],
            tx,
        });

        // Update the original page if needed
        if (splitResult.modifyPageRequest) {
            if (splitResult.modifyPageRequest.modifiedPagesArgs.length > 0) {
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
    });
};

// React Query mutation hook
const useSplitPageMutation = <TArgs>(
    mutationFn: (args: TArgs) => Promise<void>,
    errorKey: string,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        scope: { id: "splitPage" },
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
    return useSplitPageMutation(_splitPage, "inspector.page.split.error");
};
