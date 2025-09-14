import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseMeasure,
    createMeasures,
    getMeasures,
    deleteMeasures,
    updateMeasures,
    NewMeasureArgs,
    ModifiedMeasureArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "measure";

// Query key factory
export const measureKeys = {
    all: () => [KEY_BASE] as const,
    byId: (measureId: number) => [KEY_BASE, "id", measureId] as const,
};

const measureQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseMeasure[]> => {
        return await getMeasures({ db });
    },
};

/**
 * Query options for getting all measures
 */
export const allDatabaseMeasuresQueryOptions = () => {
    return queryOptions<DatabaseMeasure[]>({
        queryKey: measureKeys.all(),
        queryFn: async () => {
            return await measureQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchMeasures = () => {
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newItems: NewMeasureArgs[]) =>
            createMeasures({ db, newItems }),
        onSuccess: (_, variables) => {
            // Invalidate all queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating measures`, e, variables);
        },
    });
};

export const updateMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedMeasureArgs[]) =>
            updateMeasures({ db, modifiedItems }),
        onSuccess: (_, variables) => {
            // Invalidate specific queries
            const itemIds = new Set<number>();
            for (const modifiedArgs of variables) itemIds.add(modifiedArgs.id);

            qc.invalidateQueries({
                queryKey: Array.from(itemIds).map((id) => measureKeys.byId(id)),
            });
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating measures`, e, variables);
        },
    });
};

export const deleteMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) => deleteMeasures({ db, itemIds }),
        onSuccess: (_, variables) => {
            // Invalidate all queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting measures`, e, variables);
        },
    });
};
