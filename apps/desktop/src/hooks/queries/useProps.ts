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
    createProps,
    getProps,
    getPropById,
    deleteProps,
    updateProps,
    NewPropArgs,
    ModifiedPropArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import { propPageKeys } from "./usePropPages";

const KEY_BASE = "props";

// Query key factory
export const propKeys = {
    all: () => [KEY_BASE] as const,
    byId: (propId: number) => [KEY_BASE, "id", propId] as const,
};

const propQueries = {
    getAll: async (
        db: DbConnection,
    ): Promise<(typeof schema.props.$inferSelect)[]> => {
        return await getProps({ db });
    },
    getById: async (
        db: DbConnection,
        propId: number,
    ): Promise<typeof schema.props.$inferSelect | undefined> => {
        return await getPropById({ db, id: propId });
    },
};

/**
 * Query options for getting all props
 */
export const allPropsQueryOptions = () => {
    return queryOptions<(typeof schema.props.$inferSelect)[]>({
        queryKey: propKeys.all(),
        queryFn: async () => {
            return await propQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Query options for getting a single prop by ID
 */
export const propQueryByIdOptions = (id: number) => {
    return queryOptions<typeof schema.props.$inferSelect | undefined>({
        queryKey: propKeys.byId(id),
        queryFn: async () => {
            return await propQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchProps = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createPropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newProps: NewPropArgs[]) => createProps({ db, newProps }),
        onSuccess: (_, variables) => {
            // Invalidate all prop queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            void qc.invalidateQueries({
                queryKey: propPageKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating props`, e, variables);
        },
    });
};

export const updatePropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedProps: ModifiedPropArgs[]) =>
            updateProps({ db, modifiedProps }),
        onSuccess: (_, variables) => {
            // Invalidate all prop queries
            const propIds = new Set<number>();
            for (const modifiedArgs of variables) propIds.add(modifiedArgs.id);

            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating props`, e, variables);
        },
    });
};

export const deletePropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (propIds: Set<number>) => deleteProps({ db, propIds }),
        onSuccess: (_, variables) => {
            // Invalidate all prop queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            void qc.invalidateQueries({
                queryKey: propPageKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting props`, e, variables);
        },
    });
};
