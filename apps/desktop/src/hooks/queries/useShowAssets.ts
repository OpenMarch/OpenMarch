import { queryOptions } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { getShowAssets, readShowAssetBlob } from "@/db-functions/showAssets";
import { createShowBlobCache } from "@/showAssets/blobCache";
import { DEFAULT_STALE_TIME } from "./constants";

/**
 * The key base matches the table name, as for the other tables. Assets aren't in the undo
 * history, so whatever adds one invalidates `showAssetKeys.all()` itself.
 */
const KEY_BASE = "show_assets";

export const showAssetKeys = {
    all: () => [KEY_BASE] as const,
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
