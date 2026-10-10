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
import { moveMarchersAndOfferFollowUp } from "@/timeline/timelineMoveThemToo";
import { db, schema } from "@/global/database/db";
import { invalidateAfterMarcherPagesWrite } from "./sharedInvalidators";
import { toastCarryForward } from "@/utilities/carryForwardToast";
import type MarcherPage from "@/global/classes/MarcherPage";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTolgee } from "@tolgee/react";
import { FieldProperties } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { appearanceModelRawToParsed } from "@/entity-components/appearance";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import {
    transformMarchersInSelection,
    type TimelineEditRequest,
    type TimelineNeighborPageRequest,
} from "@/timeline/timelineCoordinateWrites";
import { useTimelineMode } from "./useWorkspaceSettings";

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
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    return queryOptions({
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
            const parsed = mpResponse.map((mp) => ({
                ...mp,
                ...appearanceModelRawToParsed(mp),
            }));
            return toMarcherPagesByPage(parsed);
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
        onSuccess: (result, variables) => {
            invalidateAfterMarcherPagesWrite(
                queryClient,
                variables.map((m) => m.page_id),
                result,
            );
            void toastCarryForward(queryClient, result);
        },
        onError: (e, variables) => {
            toastTimelineError(e, `Error updating pages`, variables);
        },
    });
};

/**
 * Timeline mode's write for "set marchers to the previous or next page" (P7.6): one undoable edit
 * through `moveMarchersInTarget` over the page's box, clearing the marchers' own moves there for
 * set to previous page. The resolver store picks the change up from the change log, so there is
 * nothing to invalidate. A refused move shows its friendly message (P8.6); one that passed through
 * page flags or other moves says so, and one that left later own moves behind offers **Move them
 * too** (`moveMarchersAndOfferFollowUp`).
 */
export const moveMarchersToNeighborPageMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            target,
            moves,
            clearOwn,
        }: TimelineNeighborPageRequest) =>
            moveMarchersAndOfferFollowUp({ target, moves, clearOwn }),
        onError: (e, variables) => {
            toastTimelineError(e, `Error moving marchers`, variables);
        },
    });
};

/**
 * Timeline mode's write for a canvas move (UI-9 Editing, P8.15): one undoable edit through
 * `moveMarchersInTarget`, setting homes or the endings in the selected timeline. A refused move
 * shows its friendly message; a move that passed through page flags says so, and one that left
 * later own moves behind offers **Move them too** (`moveMarchersAndOfferFollowUp`).
 */
export const moveMarchersInTargetMutationOptions = () => {
    return mutationOptions({
        // A drag over a window that crosses pages says what it passed through (UI-10), and one
        // that left marchers' later moves behind offers to move them too
        mutationFn: ({ target, moves }: TimelineEditRequest) =>
            moveMarchersAndOfferFollowUp({ target, moves }),
        onError: (e, variables) => {
            toastTimelineError(e, `Error moving marchers`, variables);
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
        onSuccess: (result, variables) => {
            invalidateAfterMarcherPagesWrite(
                queryClient,
                [variables.pageId],
                result,
            );
            void toastCarryForward(queryClient, result);

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
            toastTimelineError(e, `Error swapping marchers`, variables);
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
 *
 * @param currentCoordinates - The current coordinates of the selected marchers.
 * @param fieldProperties - The field properties of the show.
 * @param pageId - The ID of the page the marchers are on.
 * @returns The new coordinates of the selected marchers.
 */
export type MarcherTransformFunction = (args: {
    currentCoordinates: MarcherCoordinate[];
    fieldProperties: FieldProperties;
    pageId: number;
}) => MarcherCoordinate[];

/**
 * A hook that updates the selected marchers on the selected page.
 *
 * This hook takes care of updating the coordinates in the database and re-fetching the required data.
 *
 * @param pageId - The ID of the page to update the selected marchers on.
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
// eslint-disable-next-line max-lines-per-function
export const useUpdateSelectedMarchers = (
    /** The page to write in page mode. Timeline mode edits the selection instead (UI-9). */
    pageId: number | null | undefined,
) => {
    const timelineMode = useTimelineMode();
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(pageId),
    );
    const { data: fieldProperties, isSuccess: fieldPropertiesLoaded } =
        useQuery(fieldPropertiesQueryOptions());
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];
    const { t } = useTolgee();

    return useMutation({
        mutationFn: async (transformFunction: MarcherTransformFunction) => {
            if (timelineMode) {
                // Timeline mode (UI-9 Editing): start from what the canvas draws (the resolver,
                // not marcher_pages, whose rows can be stale or missing) and write homes or the
                // endings in the selected timeline. No page is read; a refusal is a toast.
                if (!fieldPropertiesLoaded)
                    throw new Error("Field properties not loaded");
                if (selectedMarchers.length === 0) {
                    toast.warning(t("actions.shape.noMarchersSelected"));
                    return;
                }
                const newCoordinates = await transformMarchersInSelection({
                    db,
                    marcherIds: selectedMarchers.map((marcher) => marcher.id),
                    transform: (currentCoordinates) =>
                        transformFunction({
                            currentCoordinates,
                            fieldProperties,
                            pageId: pageId ?? 0,
                        }),
                });
                return { newCoordinates };
            }
            if (pageId == null) throw new Error("No page ID provided");
            if (!marcherPagesLoaded)
                throw new Error("Marcher pages not loaded");
            if (!fieldPropertiesLoaded)
                throw new Error("Field properties not loaded");
            if (selectedMarchers.length === 0) {
                toast.warning(t("actions.shape.noMarchersSelected"));
                return;
            }

            const currentCoordinates = selectedMarchers
                .map((marcher) => marcherPages[marcher.id])
                .filter((coord) => coord != null);

            if (currentCoordinates.length !== selectedMarchers.length) {
                console.warn(
                    "Some selected marchers were not found on the current page. This should never happen.",
                );
                const allIds = new Set(
                    selectedMarchers.map((marcher) => marcher.id),
                );
                const currentIds = new Set(
                    currentCoordinates.map((coord) => coord.marcher_id),
                );
                const missingIds = Array.from(allIds).filter(
                    (id) => !currentIds.has(id),
                );
                console.warn("Missing IDs: ", missingIds);
            }

            const newCoordinates = transformFunction({
                currentCoordinates,
                fieldProperties,
                pageId,
            });
            const modifiedMarcherPages: ModifiedMarcherPageArgs[] =
                newCoordinates.map((coordinate) => {
                    return {
                        x: coordinate.x,
                        y: coordinate.y,
                        marcher_id: coordinate.marcher_id,
                        page_id: pageId,
                    };
                });

            const write = await updateMarcherPages({
                db,
                modifiedMarcherPages,
            });
            return { newCoordinates, write };
        },
        onSuccess: (data) => {
            // Timeline mode: the resolver store follows the change log
            if (timelineMode) return;
            if (pageId != null) {
                const write = data && "write" in data ? data.write : undefined;
                invalidateAfterMarcherPagesWrite(queryClient, [pageId], write);
                void toastCarryForward(queryClient, write);
            } else
                console.error(
                    "No page ID provided on update success. This should never happen.",
                );
        },
        onError: (e, variables) => {
            if (timelineMode)
                toastTimelineError(
                    e,
                    `Error updating selected marchers`,
                    variables,
                );
            else
                conToastError(`Error updating selected marchers`, e, variables);
        },
    });
};

/**
 * A hook that updates the selected marchers on the selected page.
 *
 * This hook takes care of updating the coordinates in the database and re-fetching the required data.
 *
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
export const useUpdateSelectedMarchersOnSelectedPage = () => {
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    return useUpdateSelectedMarchers(selectedPage?.id);
};
