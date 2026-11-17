import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import {
    getFieldProperties,
    updateFieldProperties,
} from "@/global/classes/FieldProperties";
import { DEFAULT_STALE_TIME } from "./constants";
import { marcherAppearancesKeys } from ".";
import { db } from "@/global/database/db";
import { applyFieldEdits } from "@/db-functions/fieldEdits";
import type {
    FieldEditOptions,
    FieldEditRequest,
    FieldEditResult,
} from "@/field/edits";

// Query key factory
export const fieldPropertiesKeys = {
    all: ["field_properties"] as const,
    details: () => [...fieldPropertiesKeys.all, "detail"] as const,
    detail: () => [...fieldPropertiesKeys.details()] as const,
};

// Query functions
const fieldPropertiesQueries = {
    get: async (): Promise<FieldProperties> => {
        return await getFieldProperties();
    },
};

// Mutation functions
const fieldPropertiesMutations = {
    update: async (
        fieldProperties: FieldProperties,
    ): Promise<FieldProperties> => {
        return await updateFieldProperties(fieldProperties);
    },
};

/**
 * Query options for fetching field properties
 */
export const fieldPropertiesQueryOptions = (enabled = true) => ({
    queryKey: fieldPropertiesKeys.detail(),
    queryFn: async () => {
        const fieldProperties = await fieldPropertiesQueries.get();
        ReadableCoords.setFieldProperties(fieldProperties);
        return fieldProperties;
    },
    staleTime: DEFAULT_STALE_TIME,
    enabled,
});

/**
 * Mutation options for updating field properties
 */
export const updateFieldPropertiesMutationOptions = (queryClient: any) => ({
    mutationFn: fieldPropertiesMutations.update,
    onSuccess: async () => {
        // Invalidate and refetch field properties
        await queryClient.invalidateQueries({
            queryKey: fieldPropertiesKeys.detail(),
        });

        await queryClient.invalidateQueries({
            queryKey: marcherAppearancesKeys.all(),
        });
    },
});

/**
 * Mutation options for field edits (#823): one or more named edits, applied as one undo step.
 * Resolves with the edit's result; a refused edit (`diff.ok` false) writes nothing and resolves
 * too, so callers show `diff.errors` (and `diff.warnings`) rather than catching. `options` go to
 * every edit: the app's `namer`, and `allowGeometryChange: false` where an action must never
 * resize the field.
 */
export const applyFieldEditsMutationOptions = (
    queryClient: any,
    options?: FieldEditOptions,
) => ({
    mutationFn: async (
        edits: FieldEditRequest | readonly FieldEditRequest[],
    ): Promise<FieldEditResult> =>
        await applyFieldEdits({
            db,
            edits: Array.isArray(edits)
                ? (edits as readonly FieldEditRequest[])
                : [edits as FieldEditRequest],
            options,
        }),
    onSuccess: async (result: FieldEditResult) => {
        if (!result.diff.ok || result.diff.empty) return;
        await queryClient.invalidateQueries({
            queryKey: fieldPropertiesKeys.detail(),
        });
        await queryClient.invalidateQueries({
            queryKey: marcherAppearancesKeys.all(),
        });
    },
});
