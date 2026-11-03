import { db, schema } from "@/global/database/db";
import { eq } from "drizzle-orm";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import {
    DbConnection,
    createMarchers,
    getMarchers,
    getMarcherRowsIncludingItems,
    deleteMarchers,
    updateMarchers,
    NewMarcherArgs,
    ModifiedMarcherArgs,
} from "@/db-functions";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { DEFAULT_STALE_TIME } from "./constants";

const { marchers } = schema;

const KEY_BASE = "marchers";

// Query key factory
export const marcherKeys = {
    /** This should almost never be used unless you absolutely need every marcher in the show at one time */
    all: () => [KEY_BASE] as const,
    byId: (marcherId: number) => [KEY_BASE, "id", marcherId] as const,
    byStartBeat: (startBeat: number) =>
        [KEY_BASE, "startBeat", startBeat] as const,
    single: (marcherId: number) => [KEY_BASE, "single", marcherId] as const,
    /** Every marchers row, items included (`allMarcherRowsQueryOptions`) */
    rowsIncludingItems: () => [KEY_BASE, "rowsIncludingItems"] as const,
};

const marcherQueries = {
    getAll: async (db: DbConnection): Promise<Marcher[]> => {
        return (await getMarchers({ db })).map(dbMarcherToMarcher);
    },
    getAllRows: async (db: DbConnection): Promise<Marcher[]> => {
        return (await getMarcherRowsIncludingItems({ db })).map(
            dbMarcherToMarcher,
        );
    },
    getById: async (
        db: DbConnection,
        marcherId: number,
    ): Promise<Marcher | undefined> => {
        const dbMarcher = await db.query.marchers.findFirst({
            where: eq(marchers.id, marcherId),
        });
        return dbMarcher ? dbMarcherToMarcher(dbMarcher) : undefined;
    },
};

/**
 * The performers in the show (`getMarchers`): every marcher except items, the props and
 * equipment rows. Use it wherever "every marcher" means performers, which is nearly everywhere.
 */
export const allMarchersQueryOptions = () => {
    return queryOptions<Marcher[]>({
        queryKey: marcherKeys.all(),
        queryFn: async () => {
            return await marcherQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Every marchers row, items (props and equipment) included (`getMarcherRowsIncludingItems`):
 * only for code that draws, selects or writes items too, such as the field and the selection.
 * Check rows with `isPerformer` where they need telling apart.
 */
export const allMarcherRowsQueryOptions = () => {
    return queryOptions<Marcher[]>({
        queryKey: marcherKeys.rowsIncludingItems(),
        queryFn: async () => {
            return await marcherQueries.getAllRows(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const marcherQueryByIdOptions = (id: number) => {
    return queryOptions<Marcher | undefined>({
        queryKey: marcherKeys.byId(id),
        queryFn: async () => {
            return await marcherQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchMarchers = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

/**
 * The new marchers also get a home and a holding slot in each page move (P7.3).
 */
export const createMarchersMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newMarchers: NewMarcherArgs[]) =>
            createMarchers({ db, newMarchers }),
        onSuccess: async (_, variables) => {
            // Invalidate all marcher queries
            await qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marchers.errors.create"),
                variables,
            );
        },
    });
};

export const updateMarchersMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarchers: ModifiedMarcherArgs[]) =>
            updateMarchers({ db, modifiedMarchers }),
        onSuccess: (_, variables) => {
            // Invalidate all marcher queries
            const marcherIds = new Set<number>();
            for (const modifiedArgs of variables)
                marcherIds.add(modifiedArgs.id);

            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(tolgee.t("marchers.errors.update"), e, variables);
        },
    });
};

/**
 * The deleted marchers' slots are also compacted where that moves no one (P7.3).
 */
export const deleteMarchersMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (marcherIds: Set<number>) =>
            deleteMarchers({ db, marcherIds }),
        onSuccess: (_, variables) => {
            // Invalidate all marcher queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marchers.errors.delete"),
                variables,
            );
        },
    });
};
