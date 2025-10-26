import {
    queryOptions,
    QueryClient,
    mutationOptions,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import {
    getAllPropPages,
    propPagesByPropId,
    propPagesByPageId,
    propPageByPropAndPage,
    ModifiedPropPageArgs,
    updatePropPages,
    PropPage,
} from "@/db-functions/propPage";
import { conToastError } from "@/utilities/utils";
import { DEFAULT_STALE_TIME } from "./constants";
import { db } from "@/global/database/db";
import { invalidateByPage } from "./sharedInvalidators";

const KEY_BASE = "prop_pages";

// Query key factory
export const propPageKeys = {
    /** This should almost never be used unless you absolutely need every propPage in the show at one time */
    all: () => [KEY_BASE] as const,
    byPage: (pageId: number) => [KEY_BASE, "page", pageId] as const,
    byProp: (propId: number) => [KEY_BASE, "prop", propId] as const,
    single: ({ propId, pageId }: { propId: number; pageId: number }) =>
        [KEY_BASE, "prop", propId, "page", pageId] as const,
};

/**
 * Get all prop pages for the entire show.
 *
 * This should only be used in exceptional cases where you need to fetch all prop pages for the entire show.
 *
 * @param pinkyPromiseThatYouKnowWhatYouAreDoing - if true, will not log a warning if no filters are provided
 * @returns
 */
export const allPropPagesQueryOptions = () => {
    return queryOptions<PropPage[]>({
        queryKey: propPageKeys.all(),
        queryFn: async () => {
            const ppResponse = await getAllPropPages({
                db,
            });
            return ppResponse;
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Get all prop pages for a given page id
 *
 * @param pageId - the page id to fetch.
 * @returns - an array of all the prop pages for this page
 */
export const propPagesByPageQueryOptions = (
    pageId: number | null | undefined,
) => {
    return queryOptions<PropPage[]>({
        queryKey: propPageKeys.byPage(pageId!),
        queryFn: async () => {
            const ppResponse = await propPagesByPageId({
                db,
                pageId: pageId!,
            });
            return ppResponse;
        },
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Get all prop pages for a given prop id
 *
 * @param propId - the prop id to fetch.
 * @returns - an array of all the prop pages for this prop
 */
export const propPagesByPropQueryOptions = (
    propId: number | null | undefined,
) => {
    return queryOptions<PropPage[]>({
        queryKey: propPageKeys.byProp(propId!),
        queryFn: async () => {
            const ppResponse = await propPagesByPropId({
                db,
                propId: propId!,
            });
            return ppResponse;
        },
        enabled: propId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Get a single prop page by prop_id and page_id
 *
 * @param propId - the prop id
 * @param pageId - the page id
 * @returns - the prop page or undefined if not found
 */
export const propPageByPropAndPageQueryOptions = ({
    propId,
    pageId,
}: {
    propId: number | null | undefined;
    pageId: number | null | undefined;
}) => {
    return queryOptions<PropPage | undefined>({
        queryKey: propPageKeys.single({ propId: propId!, pageId: pageId! }),
        queryFn: async () => {
            const ppResponse = await propPageByPropAndPage({
                db,
                propId: propId!,
                pageId: pageId!,
            });
            return ppResponse;
        },
        enabled: propId != null && pageId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchPropPages = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

// Mutation hooks
export const updatePropPagesMutationOptions = (queryClient: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedPropPages: ModifiedPropPageArgs[]) =>
            updatePropPages({ db, modifiedPropPages }),
        onSuccess: (_, variables) => {
            // Invalidate all prop pages queries
            const pageIds = new Set<number>(variables.map((p) => p.page_id));
            invalidateByPage(queryClient, pageIds);

            // Also invalidate prop-specific queries
            const propIds = new Set<number>(variables.map((p) => p.prop_id));
            for (const propId of propIds) {
                void queryClient.invalidateQueries({
                    queryKey: propPageKeys.byProp(propId),
                });
            }
        },
        onError: (e, variables) => {
            conToastError(`Error updating prop pages`, e, variables);
        },
    });
};
