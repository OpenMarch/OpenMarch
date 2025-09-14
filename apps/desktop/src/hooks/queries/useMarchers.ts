import { db, schema } from "@/global/database/db";
import { eq } from "drizzle-orm";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    createMarchers,
    getMarchers,
    deleteMarchers,
    updateMarchers,
    NewMarcherArgs,
    ModifiedMarcherArgs,
} from "@/db-functions";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { DEFAULT_STALE_TIME } from "./constants";
import { marcherPageKeys } from "./useMarcherPages";

const { marchers } = schema;

const KEY_BASE = "marcher";

// Query key factory
export const marcherKeys = {
    /** This should almost never be used unless you absolutely need every marcher in the show at one time */
    all: () => [KEY_BASE] as const,
    byId: (marcherId: number) => [KEY_BASE, "id", marcherId] as const,
    byStartBeat: (startBeat: number) =>
        [KEY_BASE, "startBeat", startBeat] as const,
    single: (marcherId: number) => [KEY_BASE, "single", marcherId] as const,
};

const marcherQueries = {
    getAll: async (db: DbConnection): Promise<Marcher[]> => {
        return (await getMarchers({ db })).map(dbMarcherToMarcher);
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
 * Query options for the marchers query
 *
 * @param args - the filters to use for the query, or the marcher id to fetch
 * @returns
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
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createMarchersMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newMarchers: NewMarcherArgs[]) =>
            createMarchers({ db, newMarchers }),
        onSuccess: (_, variables) => {
            // Invalidate all marcher queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            qc.invalidateQueries({
                queryKey: marcherPageKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating marchers`, e, variables);
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

            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });

            qc.invalidateQueries({
                queryKey: marcherPageKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating marchers`, e, variables);
        },
    });
};

export const deleteMarchersMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (marcherIds: Set<number>) =>
            deleteMarchers({ db, marcherIds }),
        onSuccess: (_, variables) => {
            // Invalidate all marcher queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            qc.invalidateQueries({
                queryKey: marcherPageKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting marchers`, e, variables);
        },
    });
};
