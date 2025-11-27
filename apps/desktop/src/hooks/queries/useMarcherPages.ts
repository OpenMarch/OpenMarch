import { eq } from "drizzle-orm";
import {
    queryOptions,
    QueryClient,
    mutationOptions,
    useMutation,
    useQuery,
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
import type MarcherPage from "@/global/classes/MarcherPage";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTolgee } from "@tolgee/react";

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

/**
 * An x and y value, plus the marcher ID
 *
 * This is used for marcher coordinate update functions.
 * This is a subset of the MarcherPage type.
 */
export type MarcherCoordinate = Pick<MarcherPage, "marcher_id" | "x" | "y">;
/**
 * A function that takes an array of marcher coordinates representing the current position of the selected marchers
 * and returns a new array of marcher coordinates which is the new position of the selected marchers.
 */
export type MarcherTransformFunction = (
    currentCoordinates: MarcherCoordinate[],
) => MarcherCoordinate[];

/**
 * A hook that updates the selected marchers on the selected page.
 *
 * This hook takes care of updating the coordinates in the database and re-fetching the required data.
 *
 * @param pageId - The ID of the page to update the selected marchers on.
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
export const useUpdateSelectedMarchers = (
    pageId: number | null | undefined,
) => {
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(pageId),
    );
    const { selectedMarchers } = useSelectedMarchers()!;
    const { t } = useTolgee();

    return useMutation({
        mutationFn: async (transformFunction: MarcherTransformFunction) => {
            if (pageId == null) throw new Error("No page ID provided");
            if (!marcherPagesLoaded)
                throw new Error("Marcher pages not loaded");
            if (selectedMarchers.length === 0) {
                toast.warning(t("actions.shape.noMarchersSelected"));
                return;
            }

            const currentCoordinates = selectedMarchers.map(
                (marcher) => marcherPages[marcher.id],
            );
            const newCoordinates = transformFunction(currentCoordinates);
            const modifiedMarcherPages: ModifiedMarcherPageArgs[] =
                newCoordinates.map((coordinate) => {
                    return {
                        ...coordinate,
                        page_id: pageId,
                    };
                });

            await updateMarcherPages({
                db,
                modifiedMarcherPages,
            });
            return { newCoordinates };
        },
        onSuccess: () => {
            if (pageId != null)
                void invalidateByPage(queryClient, new Set([pageId]));
            else
                console.error(
                    "No page ID provided on update success. This should never happen.",
                );
        },
        onError: (e, variables) => {
            conToastError(`Error updating selected marchers`, e, variables);
        },
    });
};

/**
 * A hook that updates the selected marchers on the selected page.
 *
 * This hook takes care of updating the coordinates in the database and re-fetching the required data.
 *
 * @param pageId - The ID of the page to update the selected marchers on.
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
export const useUpdateSelectedMarchersOnSelectedPage = () => {
    const { selectedPage } = useSelectedPage()!;
    return useUpdateSelectedMarchers(selectedPage?.id);
};
