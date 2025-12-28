import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { db } from "@/global/database/db";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
    updateWorkspaceSettingsJSON,
    getWorkspaceSettingsJSON,
} from "@/db-functions/workspaceSettings";
import { mutationOptions } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";

export const workspaceSettingsKeys = {
    all: () => ["workspaceSettings"] as const,
    detail: () => [...workspaceSettingsKeys.all(), "detail"] as const,
};

// Query functions
const workspaceSettingsQueries = {
    get: async (): Promise<z.infer<typeof workspaceSettingsSchema>> => {
        return await getWorkspaceSettingsParsed({ db });
    },
    getJSON: async (): Promise<string> => {
        return await getWorkspaceSettingsJSON({ db });
    },
};

// Mutation functions
const workspaceSettingsMutations = {
    update: async (
        settings: z.infer<typeof workspaceSettingsSchema>,
    ): Promise<z.infer<typeof workspaceSettingsSchema>> => {
        return await updateWorkspaceSettingsParsed({ db, settings });
    },
    updateJSON: async (jsonData: string): Promise<string> => {
        return await updateWorkspaceSettingsJSON({ db, jsonData });
    },
};

/**
 * Query options for fetching workspace settings
 */
export const workspaceSettingsQueryOptions = (enabled = true) => ({
    queryKey: workspaceSettingsKeys.detail(),
    queryFn: async () => {
        return await workspaceSettingsQueries.get();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
});

/**
 * Query options for fetching workspace settings as JSON
 */
export const workspaceSettingsJSONQueryOptions = (enabled = true) => ({
    queryKey: [...workspaceSettingsKeys.detail(), "json"],
    queryFn: async () => {
        return await workspaceSettingsQueries.getJSON();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
});

/**
 * Mutation options for updating workspace settings
 */
export const updateWorkspaceSettingsMutationOptions = (queryClient: any) =>
    mutationOptions({
        mutationFn: async (
            settings: z.infer<typeof workspaceSettingsSchema>,
        ) => {
            return await workspaceSettingsMutations.update(settings);
        },
        onSuccess: () => {
            // Invalidate workspace settings queries to refetch the updated data
            void queryClient.invalidateQueries({
                queryKey: workspaceSettingsKeys.all(),
            });
        },
        onError: (error) => {
            conToastError("Failed to update workspace settings", error);
        },
    });

/**
 * Mutation options for updating workspace settings JSON
 */
export const updateWorkspaceSettingsJSONMutationOptions = (queryClient: any) =>
    mutationOptions({
        mutationFn: async (jsonData: string) => {
            return await workspaceSettingsMutations.updateJSON(jsonData);
        },
        onSuccess: () => {
            // Invalidate workspace settings queries to refetch the updated data
            void queryClient.invalidateQueries({
                queryKey: workspaceSettingsKeys.all(),
            });
        },
        onError: (error) => {
            conToastError("Failed to update workspace settings", error);
        },
    });
