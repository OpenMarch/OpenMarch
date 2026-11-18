import {
    mutationOptions,
    queryOptions,
    type QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import {
    getShowAssetBlobSizes,
    getShowAssetReferences,
    getShowAssets,
    readShowAssetBlob,
    removeShowAssetsInTransaction,
    setShowAssetCreditsInTransaction,
} from "@/db-functions/showAssets";
import type { JsonObject } from "@/showAssets/hash";
import type { ShowAssetRef } from "@/showAssets/ref";
import { showAssetRefValue } from "@/showAssets/ref";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { createShowBlobCache } from "@/showAssets/blobCache";
import { DEFAULT_STALE_TIME } from "./constants";

/**
 * The key base matches the table name, as for the other tables. Assets aren't in the undo
 * history, so whatever adds one invalidates `showAssetKeys.all()` itself.
 */
const KEY_BASE = "show_assets";

export const showAssetKeys = {
    all: () => [KEY_BASE] as const,
    sizes: () => [KEY_BASE, "sizes"] as const,
};

/** Every asset Version in the show (fork #997), without bytes. */
export const showAssetsQueryOptions = () =>
    queryOptions({
        queryKey: showAssetKeys.all(),
        queryFn: async () => await getShowAssets({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

/**
 * The editor's reads of asset bytes, by hash, through memory. Content-addressed, so it stays
 * right across shows; the window reloads when another show opens anyway.
 */
export const showAssetBlobCache = createShowBlobCache({
    read: async (hash) => await readShowAssetBlob({ db, hash }),
});

/** Every blob's size in bytes, by hash (fork #1001). Under the same key, so any change refreshes it. */
export const showAssetSizesQueryOptions = () =>
    queryOptions({
        queryKey: showAssetKeys.sizes(),
        queryFn: async () => await getShowAssetBlobSizes({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

/**
 * Removes the chosen assets that nothing in the show names, read again inside the removal: one a
 * prop or cue started naming since the list was shown is kept. Resolves with how many it removed.
 */
export const removeUnusedShowAssetsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: async (refs: readonly ShowAssetRef[]) =>
            await db.transaction(async (tx) => {
                const named = new Set(await getShowAssetReferences({ db: tx }));
                return await removeShowAssetsInTransaction({
                    tx,
                    refs: refs.filter(
                        (ref) => !named.has(showAssetRefValue(ref)),
                    ),
                });
            }),
        onSettled: async () => {
            await qc.invalidateQueries({ queryKey: showAssetKeys.all() });
        },
        onError: (e, refs) => {
            conToastError(tolgee.t("assets.errors.remove"), e, refs);
        },
    });

/** Sets an asset's credits; they're outside its Version hash, so it stays the same Version. */
export const setShowAssetCreditsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: async ({
            ref,
            credits,
        }: {
            ref: ShowAssetRef;
            credits: JsonObject;
        }) =>
            await db.transaction(
                async (tx) =>
                    await setShowAssetCreditsInTransaction({
                        tx,
                        ref,
                        credits,
                    }),
            ),
        onSettled: async () => {
            await qc.invalidateQueries({ queryKey: showAssetKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(tolgee.t("assets.errors.credits"), e, variables);
        },
    });
