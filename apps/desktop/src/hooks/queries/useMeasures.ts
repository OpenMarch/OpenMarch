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
    transactionWithHistory,
    deleteMeasuresAndBeatsInTransaction,
    NewBeatArgs,
    createMeasuresAndBeatsInTransaction,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import { beatKeys } from "./useBeats";
import tolgee from "@/global/singletons/Tolgee";

const KEY_BASE = "measures";

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
export const allDatabaseMeasuresQueryOptions = (enabled = true) => {
    return queryOptions<DatabaseMeasure[]>({
        queryKey: measureKeys.all(),
        queryFn: async () => {
            return await measureQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
        enabled,
    });
};

export const fetchMeasures = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newItems: NewMeasureArgs[]) =>
            createMeasures({ db, newItems }),
        onSettled: () => {
            // Invalidate all queries
            void qc.invalidateQueries({
                queryKey: measureKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("measures.createFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

/**
 * Mutation to create beats with an accompanying measure at the first created beat.
 *
 * To create multiple measures, use the quantity parameter.
 *
 * ```ts
 * // Creates one measure with two beats
 * createMeasures({
 *   beatArgs: [{ duration: 1 }, { duration: 1 }],
 *   quantity: 1,
 *   startingPosition: 1,
 * })
 *
 * // Creates four measures with two beats each, eight total beats created
 * createMeasures({
 *   beatArgs: [{ duration: 1 }, { duration: 1 }],
 *   quantity: 4,
 *   startingPosition: 1,
 * })
 * ```
 */
export const createMeasuresAndBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: ({
            beatArgs,
            startingPosition,
            quantity = 1,
        }: {
            beatArgs: Omit<NewBeatArgs, "include_in_measure">[];
            startingPosition: number;
            quantity?: number;
        }) => {
            return transactionWithHistory(
                db,
                "createMeasuresAndBeats",
                async (tx) =>
                    createMeasuresAndBeatsInTransaction({
                        tx,
                        beatArgs,
                        startingPosition,
                        quantity,
                    }),
            );
        },
        onSettled: () => {
            // Invalidate all queries
            void qc
                .invalidateQueries({
                    queryKey: measureKeys.all(),
                })
                .then(() => {
                    void qc.invalidateQueries({
                        queryKey: beatKeys.all(),
                    });
                });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("measures.createFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const updateMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedMeasureArgs[]) =>
            updateMeasures({ db, modifiedItems }),
        onSettled: (variables) => {
            if (!variables) return;
            // Invalidate specific queries
            const itemIds = new Set<number>();
            for (const modifiedArgs of variables) itemIds.add(modifiedArgs.id);

            void qc.invalidateQueries({
                queryKey: Array.from(itemIds).map((id) => measureKeys.byId(id)),
            });
            void qc.invalidateQueries({
                queryKey: measureKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("measures.updateFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const deleteMeasuresMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) => deleteMeasures({ db, itemIds }),
        onSettled: () => {
            // Invalidate all queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("measures.deleteFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};

export const deleteMeasuresAndBeatsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (measureIds: Set<number>) => {
            return transactionWithHistory(
                db,
                "deleteMeasuresAndBeats",
                async (tx) => {
                    await deleteMeasuresAndBeatsInTransaction({
                        tx,
                        measureIds,
                    });
                },
            );
        },
        onSettled: () => {
            // Invalidate all queries
            void qc
                .invalidateQueries({
                    queryKey: measureKeys.all(),
                })
                .then(() => {
                    void qc.invalidateQueries({
                        queryKey: beatKeys.all(),
                    });
                });
        },
        onError: (e, variables) => {
            conToastError(
                tolgee.t("measures.deleteFailed", { error: e.message }),
                e,
                variables,
            );
        },
    });
};
