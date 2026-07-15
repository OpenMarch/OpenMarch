import { db } from "@/global/database/db";
import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    getUtility,
    updateUtility,
    ModifiedUtilityArgs,
    DatabaseUtility,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "utility";

// Query key factory
export const utilityKeys = {
    /** The single utility record */
    all: () => [KEY_BASE] as const,
};

const utilityQueries = {
    get: async (db: DbConnection) => {
        return await getUtility({ db });
    },
};

/**
 * Query options for getting the utility record
 */
export const getUtilityQueryOptions = (enabled = true) =>
    queryOptions<DatabaseUtility | undefined>({
        queryKey: utilityKeys.all(),
        queryFn: () => utilityQueries.get(db),
        staleTime: DEFAULT_STALE_TIME,
        enabled,
    });

/**
 * Mutation options for updating the utility record
 */
export const updateUtilityMutationOptions = () =>
    mutationOptions({
        mutationFn: async (args: ModifiedUtilityArgs) => {
            return await updateUtility({ db, args });
        },
        onSuccess: () => {
            // Invalidate utility queries to refetch the updated data
            void queryClient.invalidateQueries({
                queryKey: utilityKeys.all(),
            });
        },
        onError: (error) => {
            conToastError("Failed to update utility settings", error);
        },
    });
