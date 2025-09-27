import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import {
    getFieldProperties,
    updateFieldProperties,
} from "@/global/classes/FieldProperties";
import { DEFAULT_STALE_TIME } from "./constants";

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
export const fieldPropertiesQueryOptions = () => ({
    queryKey: fieldPropertiesKeys.detail(),
    queryFn: async () => {
        const fieldProperties = await fieldPropertiesQueries.get();
        ReadableCoords.setFieldProperties(fieldProperties);
        return fieldProperties;
    },
    staleTime: DEFAULT_STALE_TIME,
});

/**
 * Mutation options for updating field properties
 */
export const updateFieldPropertiesMutationOptions = (queryClient: any) => ({
    mutationFn: fieldPropertiesMutations.update,
    onSuccess: (updatedFieldProperties: FieldProperties) => {
        // Invalidate and refetch field properties
        void queryClient.invalidateQueries({
            queryKey: fieldPropertiesKeys.detail(),
        });
    },
});
