import {
    mutationOptions,
    queryOptions,
    type QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import {
    applyPitPreset,
    createItems,
    deleteMarchers,
    getItemGeometry,
    getItems,
    setItemGeometry,
    updateItems,
    type ApplyPitPresetArgs,
    type ItemGeometryArgs,
    type ModifiedItemArgs,
    type NewItemArgs,
} from "@/db-functions";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { DEFAULT_STALE_TIME } from "./constants";
import { marcherKeys } from "./useMarchers";

// The table names, so undo and redo invalidate them (`singleTableNameToQueryKey`)
const ITEMS_KEY = "items";
const GEOMETRY_KEY = "item_geometry";

export const itemKeys = {
    all: () => [ITEMS_KEY] as const,
};

export const itemGeometryKeys = {
    all: () => [GEOMETRY_KEY] as const,
};

/** After items are added or removed: their marchers rows, canvas visuals, items and Outlines */
export const invalidateItemsAndMarchers = async (qc: QueryClient) => {
    // The marchers first: the canvas makes an item's Outline from its visual group
    await qc.invalidateQueries({ queryKey: marcherKeys.all() });
    void qc.invalidateQueries({ queryKey: itemKeys.all() });
    void qc.invalidateQueries({ queryKey: itemGeometryKeys.all() });
};

/** Every item with its marchers row, in creation order */
export const allItemsQueryOptions = () =>
    queryOptions({
        queryKey: itemKeys.all(),
        queryFn: () => getItems({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

/** Every item's Outline changes, by item and then beat order */
export const itemGeometryQueryOptions = () =>
    queryOptions({
        queryKey: itemGeometryKeys.all(),
        queryFn: () => getItemGeometry({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

export const createItemsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (newItems: NewItemArgs[]) => createItems({ db, newItems }),
        onSuccess: () => invalidateItemsAndMarchers(qc),
        onError: (e, variables) => {
            conToastError(tolgee.t("props.errors.create"), e, variables);
        },
    });

export interface SetItemGeometryArgs {
    itemId: number;
    beatId: number;
    geometry: ItemGeometryArgs;
}

export const setItemGeometryMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (args: SetItemGeometryArgs) =>
            setItemGeometry({ db, ...args }),
        // Settled, not success: a refused write redraws the Outline where it was. Returned, so
        // `mutateAsync` resolves once the field can draw the new Outline
        onSettled: () =>
            qc.invalidateQueries({ queryKey: itemGeometryKeys.all() }),
        onError: (e, variables) => {
            conToastError(tolgee.t("props.errors.outline"), e, variables);
        },
    });

export const updateItemsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (modifiedItems: ModifiedItemArgs[]) =>
            updateItems({ db, modifiedItems }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: itemKeys.all() });
            void qc.invalidateQueries({ queryKey: marcherKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(tolgee.t("props.errors.update"), e, variables);
        },
    });

/** Deletes items by their marchers rows; their item and Outline rows go with them */
export const deleteItemsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (marcherIds: Set<number>) =>
            deleteMarchers({ db, marcherIds }),
        onSuccess: () => invalidateItemsAndMarchers(qc),
        onError: (e, variables) => {
            conToastError(tolgee.t("props.errors.delete"), e, variables);
        },
    });

/**
 * Applies a front ensemble preset in one undo step: its equipment, replacing the previous
 * preset's, and the performers the show lacks
 */
export const applyPitPresetMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (args: ApplyPitPresetArgs) =>
            applyPitPreset({ db, ...args }),
        onSuccess: () => invalidateItemsAndMarchers(qc),
        onError: (e, variables) => {
            conToastError(tolgee.t("props.errors.preset"), e, variables);
        },
    });
