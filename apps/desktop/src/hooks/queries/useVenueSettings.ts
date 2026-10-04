import {
    mutationOptions,
    queryOptions,
    useMutation,
    useQueries,
    useQueryClient,
    type QueryClient,
    type UseQueryResult,
} from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import { db } from "@/global/database/db";
import {
    getStoredVenueSettings,
    updateVenueSettings,
} from "@/db-functions/view3dVenue";
import {
    defaultVenueForField,
    type VenueSettings,
} from "@/view3d/core/venueSettings";
import { conToastError } from "@/utilities/utils";
import { DEFAULT_STALE_TIME } from "./constants";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";

/**
 * The key base matches the table name, so undo and redo (which invalidate by
 * table name) refresh these queries too.
 */
const KEY_BASE = "view3d_venue";

export const venueSettingsKeys = {
    all: () => [KEY_BASE] as const,
    stored: () => [KEY_BASE, "stored"] as const,
};

/**
 * The stored venue settings, or `null` when the show has none (or they are
 * invalid). Reading never writes.
 */
export const storedVenueSettingsQueryOptions = () =>
    queryOptions<VenueSettings | null>({
        queryKey: venueSettingsKeys.stored(),
        queryFn: async () => (await getStoredVenueSettings({ db })) ?? null,
        staleTime: DEFAULT_STALE_TIME,
    });

export type UseVenueSettingsReturn = {
    /** The stored settings, or the default for the field. */
    data: VenueSettings | undefined;
    /** True when nothing is stored and `data` is the field's default. */
    isDefault: boolean;
    isLoading: boolean;
    hasError: boolean;
};

/**
 * Combines the stored settings with the field properties: the stored row wins,
 * otherwise the default for the field.
 */
export const _combineVenueSettings = (
    results: [
        UseQueryResult<VenueSettings | null>,
        UseQueryResult<FieldProperties>,
    ],
): UseVenueSettingsReturn => {
    const [stored, field] = results;
    const isLoading = stored.isLoading || field.isLoading;
    const hasError = stored.isError || field.isError;

    if (stored.data) {
        return { data: stored.data, isDefault: false, isLoading, hasError };
    }
    if (stored.data === null && field.data) {
        return {
            data: defaultVenueForField(field.data),
            isDefault: true,
            isLoading,
            hasError,
        };
    }
    return { data: undefined, isDefault: false, isLoading, hasError };
};

/**
 * The show's venue settings: the stored row, or the default for the field.
 */
export const useVenueSettings = (): UseVenueSettingsReturn => {
    return useQueries({
        queries: [
            storedVenueSettingsQueryOptions(),
            fieldPropertiesQueryOptions(),
        ],
        combine: _combineVenueSettings,
    });
};

/**
 * Validates and stores venue settings with history, so undo covers it, then
 * invalidates `["view3d_venue"]`. Rejects settings that don't match the schema.
 */
export const updateVenueSettingsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (settings: VenueSettings) =>
            updateVenueSettings({ db, settings }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: venueSettingsKeys.all() });
        },
        onError: (error, settings) => {
            conToastError(
                "Failed to update the 3D View venue",
                error,
                settings,
            );
        },
    });

export const useUpdateVenueSettings = () => {
    const queryClient = useQueryClient();
    return useMutation(updateVenueSettingsMutationOptions(queryClient));
};
