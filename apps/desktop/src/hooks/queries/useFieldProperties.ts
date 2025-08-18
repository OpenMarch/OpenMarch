import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import {
    getFieldProperties,
    updateFieldProperties,
} from "@/global/classes/FieldProperties";

// Query key factory
export const fieldPropertiesKeys = {
    all: ["fieldProperties"] as const,
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
 * Hook for fetching field properties
 */
export const useFieldProperties = () => {
    return useQuery({
        queryKey: fieldPropertiesKeys.detail(),
        queryFn: async () => {
            const fieldProperties = await fieldPropertiesQueries.get();
            ReadableCoords.setFieldProperties(fieldProperties);
            return fieldProperties;
        },
    });
};

/**
 * Hook for updating field properties
 */
export const useUpdateFieldProperties = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: fieldPropertiesMutations.update,
        onSuccess: (updatedFieldProperties) => {
            // Invalidate and refetch field properties
            queryClient.invalidateQueries({
                queryKey: fieldPropertiesKeys.detail(),
            });
        },
    });
};

/**
 * Hook for getting field properties with a setter function
 * This provides a similar API to the original context but uses React Query
 */
export const useFieldPropertiesWithSetter = () => {
    const { data: fieldProperties, isLoading, error } = useFieldProperties();
    const updateMutation = useUpdateFieldProperties();
    const queryClient = useQueryClient();

    const setFieldProperties = async (
        newFieldProperties: FieldProperties,
        updateDatabase = true,
    ) => {
        if (updateDatabase) {
            await updateMutation.mutateAsync(newFieldProperties);
        } else {
            // If not updating database, just update ReadableCoords
            ReadableCoords.setFieldProperties(newFieldProperties);
        }
    };

    return {
        fieldProperties,
        setFieldProperties,
        fetchFieldProperties: () =>
            queryClient.invalidateQueries({
                queryKey: fieldPropertiesKeys.detail(),
            }),
        isLoading,
        error,
        isUpdating: updateMutation.isPending,
    };
};
