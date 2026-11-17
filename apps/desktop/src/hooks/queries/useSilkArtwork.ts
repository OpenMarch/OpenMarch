import {
    mutationOptions,
    queryOptions,
    type QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import {
    getSilkArtwork,
    setSilkArtwork,
    type SilkArtworkRow,
} from "@/db-functions/view3dSilkArtwork";
import type { SilkArtworkImport } from "@/view3d/core/silkArtwork";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { DEFAULT_STALE_TIME } from "./constants";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { venueSettingsKeys } from "./useVenueSettings";

/**
 * The key base matches the table name, so undo and redo (which invalidate by
 * table name) refresh these queries too.
 */
const KEY_BASE = "view3d_silk_artwork";

export const silkArtworkKeys = {
    all: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, id] as const,
};

/** One silk Artwork row, or null when it doesn't exist. */
export const silkArtworkQueryOptions = (id: number | undefined) =>
    queryOptions<SilkArtworkRow | null>({
        queryKey: silkArtworkKeys.byId(id ?? 0),
        queryFn: async () =>
            id === undefined
                ? null
                : ((await getSilkArtwork({ db, id })) ?? null),
        enabled: id !== undefined,
        staleTime: DEFAULT_STALE_TIME,
    });

/**
 * Makes an import the show's silk Artwork, or removes it with null, as one
 * undo step; then refreshes the Artwork and the venue settings.
 */
export const setSilkArtworkMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: async (artwork: SilkArtworkImport | null) => {
            const field = await qc.fetchQuery(fieldPropertiesQueryOptions());
            return await setSilkArtwork({ db, artwork, field });
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: silkArtworkKeys.all() });
            await qc.invalidateQueries({ queryKey: venueSettingsKeys.all() });
        },
        onError: (error) => {
            conToastError(tolgee.t("view3d.silkArtwork.saveFailed"), error);
        },
    });
