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
    type MarcherPagesByMarcher,
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
import { invalidateByMarchers, invalidateByPages } from "./sharedInvalidators";
import type MarcherPage from "@/global/classes/MarcherPage";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTolgee } from "@tolgee/react";
import { FieldProperties } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { appearanceModelRawToParsed } from "@/entity-components/appearance";

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
    return queryOptions<MarcherPage[]>({
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
            return parsed;
        },
        enabled: marcherId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};

// Mutation hooks

/**
 * Groups modified marcher-page rows by marcher_id and optimistically patches
 * each marcher's `marcherPageKeys.byMarcher` cache — the cache
 * `useMarcherTimelines` reads to drive canvas rendering. Only x/y are
 * touched; every other field (appearance, notes, path data, locked status)
 * is left untouched.
 *
 * Returns a snapshot of each patched marcher's previous cache value, for
 * rollback on error.
 */
const patchMarcherPagesByMarcherCache = (
    qc: QueryClient,
    modifiedMarcherPages: ModifiedMarcherPageArgs[],
): Map<number, MarcherPage[] | undefined> => {
    const previous = new Map<number, MarcherPage[] | undefined>();
    const byMarcherId = new Map<number, ModifiedMarcherPageArgs[]>();
    for (const patch of modifiedMarcherPages) {
        const list = byMarcherId.get(patch.marcher_id);
        if (list) list.push(patch);
        else byMarcherId.set(patch.marcher_id, [patch]);
    }

    for (const [marcherId, patches] of byMarcherId) {
        const queryKey = marcherPageKeys.byMarcher(marcherId);
        previous.set(marcherId, qc.getQueryData<MarcherPage[]>(queryKey));
        qc.setQueryData<MarcherPage[]>(queryKey, (old) => {
            if (!old) return old;
            return old.map((mp) => {
                const patch = patches.find((p) => p.page_id === mp.page_id);
                return patch ? { ...mp, x: patch.x, y: patch.y } : mp;
            });
        });
    }
    return previous;
};

/**
 * Same idea as `patchMarcherPagesByMarcherCache`, but for
 * `marcherPageKeys.byPage` — used by `Canvas.tsx`/`RegisteredActionsHandler`
 * for pathways and other page-scoped metadata, which would otherwise stay
 * stale after a coordinate edit (coordinate mutations only ever invalidated
 * the `byMarcher` cache).
 */
const patchMarcherPagesByPageCache = (
    qc: QueryClient,
    modifiedMarcherPages: ModifiedMarcherPageArgs[],
): Map<number, MarcherPagesByMarcher | undefined> => {
    const previous = new Map<number, MarcherPagesByMarcher | undefined>();
    const byPageId = new Map<number, ModifiedMarcherPageArgs[]>();
    for (const patch of modifiedMarcherPages) {
        const list = byPageId.get(patch.page_id);
        if (list) list.push(patch);
        else byPageId.set(patch.page_id, [patch]);
    }

    for (const [pageId, patches] of byPageId) {
        const queryKey = marcherPageKeys.byPage(pageId);
        previous.set(pageId, qc.getQueryData<MarcherPagesByMarcher>(queryKey));
        qc.setQueryData<MarcherPagesByMarcher>(queryKey, (old) => {
            if (!old) return old;
            const next = { ...old };
            for (const patch of patches) {
                const existing = next[patch.marcher_id];
                if (existing) {
                    next[patch.marcher_id] = {
                        ...existing,
                        x: patch.x,
                        y: patch.y,
                    };
                }
            }
            return next;
        });
    }
    return previous;
};

export const updateMarcherPagesMutationOptions = (queryClient: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarcherPages: ModifiedMarcherPageArgs[]) =>
            updateMarcherPages({ db, modifiedMarcherPages }),
        // Optimistically patch the caches the canvas renders from, so the
        // timeline sampler never sees stale data while the background
        // refetch (kicked off in onSettled) is in flight. Without this, the
        // canvas briefly repaints from stale cached data and marchers flash
        // back to their pre-edit position before snapping forward again as
        // each per-marcher refetch resolves.
        onMutate: async (modifiedMarcherPages) => {
            const marcherIds = new Set(
                modifiedMarcherPages.map((m) => m.marcher_id),
            );
            const pageIds = new Set(modifiedMarcherPages.map((m) => m.page_id));

            await Promise.all([
                ...Array.from(marcherIds, (id) =>
                    queryClient.cancelQueries({
                        queryKey: marcherPageKeys.byMarcher(id),
                    }),
                ),
                ...Array.from(pageIds, (id) =>
                    queryClient.cancelQueries({
                        queryKey: marcherPageKeys.byPage(id),
                    }),
                ),
            ]);

            const previousByMarcher = patchMarcherPagesByMarcherCache(
                queryClient,
                modifiedMarcherPages,
            );
            const previousByPage = patchMarcherPagesByPageCache(
                queryClient,
                modifiedMarcherPages,
            );

            return { previousByMarcher, previousByPage };
        },
        onError: (e, variables, context) => {
            if (context) {
                for (const [marcherId, data] of context.previousByMarcher) {
                    queryClient.setQueryData(
                        marcherPageKeys.byMarcher(marcherId),
                        data,
                    );
                }
                for (const [pageId, data] of context.previousByPage) {
                    queryClient.setQueryData(
                        marcherPageKeys.byPage(pageId),
                        data,
                    );
                }
            }
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
            void invalidateByMarchers(
                queryClient,
                new Set([variables.marcher1Id, variables.marcher2Id]),
            );

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

const toModifiedMarcherPageArgs = (
    coordinates: MarcherCoordinate[],
    pageId: number,
): ModifiedMarcherPageArgs[] =>
    coordinates.map((coordinate) => ({
        marcher_id: coordinate.marcher_id,
        page_id: pageId,
        x: coordinate.x,
        y: coordinate.y,
    }));

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
    const { data: fieldProperties, isSuccess: fieldPropertiesLoaded } =
        useQuery(fieldPropertiesQueryOptions());
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];
    const { t } = useTolgee();

    return useMutation({
        mutationFn: async (transformFunction: MarcherTransformFunction) => {
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
            const modifiedMarcherPages = toModifiedMarcherPageArgs(
                newCoordinates,
                pageId,
            );

            await updateMarcherPages({
                db,
                modifiedMarcherPages,
            });
            return { newCoordinates };
        },
        onSuccess: (data) => {
            if (!data || pageId == null) return;
            const { newCoordinates } = data;
            const modifiedMarcherPages = toModifiedMarcherPageArgs(
                newCoordinates,
                pageId,
            );

            // Patch the caches the canvas renders from *before* invalidating,
            // so useMarcherTimelines never observes stale data alongside
            // isFetching:true — this hook can't use onMutate for the
            // optimistic patch (mutationFn only knows newCoordinates once
            // it's run), but since the write already succeeded by the time
            // onSuccess fires, patching first here has the same effect.
            patchMarcherPagesByMarcherCache(queryClient, modifiedMarcherPages);
            patchMarcherPagesByPageCache(queryClient, modifiedMarcherPages);

            // Derived from newCoordinates (not the closed-over
            // selectedMarchers state, which could drift during the IPC
            // round trip) so it always matches exactly what was written.
            const marcherIds = new Set(newCoordinates.map((c) => c.marcher_id));
            invalidateByMarchers(queryClient, marcherIds);
            invalidateByPages(queryClient, new Set([pageId]));
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
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
export const useUpdateSelectedMarchersOnSelectedPage = () => {
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    return useUpdateSelectedMarchers(selectedPage?.id);
};
