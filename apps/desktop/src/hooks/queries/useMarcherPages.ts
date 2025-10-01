import { eq } from "drizzle-orm";
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
import {
    getAllMarcherPages,
    marcherPagesByMarcherId,
    marcherPagesByPageId,
    ModifiedMarcherPageArgs,
    swapMarchers,
    updateMarcherPages,
} from "@/db-functions/marcherPage";
import { conToastError } from "@/utilities/utils";
import { DEFAULT_STALE_TIME } from "./constants";
import tolgee from "@/global/singletons/Tolgee";
import { toast } from "sonner";
import { db, schema } from "@/global/database/db";
import { invalidateByPage } from "./sharedInvalidators";

const KEY_BASE = "marcher_pages";

// Query key factory
export const marcherPageKeys = {
    /** This should almost never be used unless you absolutely need every marcherPage in the show at one time */
    all: () => [KEY_BASE] as const,
    byPage: (pageId: number) => [KEY_BASE, "page", pageId] as const,
    byMarcher: (marcherId: number) => [KEY_BASE, "marcher", marcherId] as const,
    single: ({ marcherId, pageId }: { marcherId: number; pageId: number }) => [
        [KEY_BASE, "marcher", marcherId, "page", pageId] as const,
    ],
};

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
        // eslint-disable-next-line @tanstack/query/exhaustive-deps
        queryKey: marcherPageKeys.all(),
        queryFn: async () => {
            const mpResponse = await getAllMarcherPages({
                db,
                pinkyPromiseThatYouKnowWhatYouAreDoing,
            });
            return marcherPageMapFromArray(mpResponse);
        },
        staleTime: DEFAULT_STALE_TIME,
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
            const mpResponse = await marcherPagesByPageId({
                db,
                pageId: pageId!,
            });
            return toMarcherPagesByMarcher(mpResponse);
        },
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
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
            const mpResponse = await marcherPagesByMarcherId({
                db,
                marcherId: marcherId!,
            });
            return toMarcherPagesByPage(mpResponse);
        },
        enabled: marcherId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchMarcherPages = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

// Mutation hooks
export const updateMarcherPagesMutationOptions = (queryClient: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarcherPages: ModifiedMarcherPageArgs[]) =>
            updateMarcherPages({ db, modifiedMarcherPages }),
        onSuccess: (_, variables) => {
            // Invalidate all marcher pages queries
            const pageIds = new Set<number>(variables.map((m) => m.page_id));
            invalidateByPage(queryClient, pageIds);
        },
        onError: (e, variables) => {
            conToastError(`Error updating pages`, e, variables);
        },
    });
};

export const swapMarchersMutationOptions = (queryClient: QueryClient) => {
    return mutationOptions({
        mutationFn: ({
            pageId,
            marcher1Id,
            marcher2Id,
        }: {
            pageId: number;
            marcher1Id: number;
            marcher2Id: number;
        }) => swapMarchers({ db, pageId, marcher1Id, marcher2Id }),
        onSuccess: (_, variables) => {
            void invalidateByPage(queryClient, new Set([variables.pageId]));

            // Get the marchers so we can get the drill numbers for the success message
            const marcher1Promise = db.query.marchers.findFirst({
                where: eq(schema.marchers.id, variables.marcher1Id),
            });
            const marcher2Promise = db.query.marchers.findFirst({
                where: eq(schema.marchers.id, variables.marcher2Id),
            });
            void Promise.all([marcher1Promise, marcher2Promise]).then(
                ([marcher1, marcher2]) => {
                    if (marcher1 && marcher2) {
                        const drillNumber1 =
                            marcher1.drill_prefix + marcher1.drill_order;
                        const drillNumber2 =
                            marcher2.drill_prefix + marcher2.drill_order;
                        toast.success(
                            tolgee.t("actions.swap.success", {
                                marcher1: drillNumber1,
                                marcher2: drillNumber2,
                            }),
                        );
                    }
                },
            );
        },
        onError: (e, variables) => {
            conToastError(`Error swapping marchers`, e, variables);
        },
    });
};
