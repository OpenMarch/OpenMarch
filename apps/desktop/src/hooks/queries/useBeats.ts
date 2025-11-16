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
    DatabaseBeat,
    createBeats,
    getBeats,
    deleteBeats,
    updateBeats,
    shiftBeats,
    flattenOrder,
    ModifiedBeatArgs,
    NewBeatArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

/**
 * Arguments for shifting beats
 */
export interface ShiftBeatsArgs {
    startingPosition: number;
    shiftAmount: number;
}

const KEY_BASE = "beats";

// Query key factory
export const beatKeys = {
    /** This should almost never be used unless you absolutely need every beat in the show at one time */
    all: () => [KEY_BASE] as const,
    byId: (beatId: number) => [KEY_BASE, "id", beatId] as const,
    byPosition: (position: number) => [KEY_BASE, "position", position] as const,
    single: (beatId: number) => [KEY_BASE, "single", beatId] as const,
};

const beatQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseBeat[]> => {
        return await getBeats({ db });
    },
};

/**
 * Query options for the beats query
 *
 * @param args - the filters to use for the query, or the beat id to fetch
 * @returns
 */
export const allDatabaseBeatsQueryOptions = () => {
    return queryOptions<DatabaseBeat[]>({
        queryKey: beatKeys.all(),
        queryFn: async () => {
            return await beatQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchBeats = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (args: {
            newBeats: NewBeatArgs[];
            startingPosition?: number;
        }) => createBeats({ db, ...args }),
        onSuccess: () => {
            // Invalidate all beat queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating beats`, e, variables);
        },
    });
};

export const updateBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedBeats: ModifiedBeatArgs[]) =>
            updateBeats({ db, modifiedBeats }),
        onSuccess: (_, variables) => {
            // Invalidate all beat queries
            const beatIds = new Set<number>();
            for (const modifiedArgs of variables) beatIds.add(modifiedArgs.id);

            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating beats`, e, variables);
        },
    });
};

export const deleteBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (beatIds: Set<number>) => deleteBeats({ db, beatIds }),
        onSuccess: () => {
            // Invalidate all beat queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting beats`, e, variables);
        },
    });
};

export const shiftBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (args: ShiftBeatsArgs) => shiftBeats({ db, ...args }),
        onSuccess: () => {
            // Invalidate all beat queries since positions may have changed
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error shifting beats`, e, variables);
        },
    });
};

export const flattenOrderMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: () => flattenOrder({ db }),
        onSuccess: () => {
            // Invalidate all beat queries since positions may have changed
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e) => {
            conToastError(`Error flattening beat order`, e);
        },
    });
};
