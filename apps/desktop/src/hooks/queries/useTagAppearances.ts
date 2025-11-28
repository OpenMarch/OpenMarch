import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseTagAppearance,
    createTagAppearances,
    getTagAppearances,
    getTagAppearanceById,
    getTagAppearancesByTagId,
    getTagAppearancesByPageId,
    deleteTagAppearances,
    updateTagAppearances,
    NewTagAppearanceArgs,
    ModifiedTagAppearanceArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "tag_appearances";

// Query key factory
export const tagAppearanceKeys = {
    all: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, "id", id] as const,
    byTagId: (tagId: number) => [KEY_BASE, "tagId", tagId] as const,
    byPageId: (pageId: number) => [KEY_BASE, "pageId", pageId] as const,
};

const tagAppearanceQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseTagAppearance[]> => {
        return await getTagAppearances({ db });
    },
    getById: async (
        db: DbConnection,
        id: number,
    ): Promise<DatabaseTagAppearance | undefined> => {
        return await getTagAppearanceById({ db, id });
    },
    getByTagId: async (
        db: DbConnection,
        tagId: number,
    ): Promise<DatabaseTagAppearance[]> => {
        return await getTagAppearancesByTagId({ db, tagId });
    },
    getByPageId: async (
        db: DbConnection,
        pageId: number,
    ): Promise<DatabaseTagAppearance[]> => {
        return await getTagAppearancesByPageId({ db, pageId });
    },
};

/**
 * Query options for getting all tag appearances
 */
export const allTagAppearancesQueryOptions = () => {
    return queryOptions<DatabaseTagAppearance[]>({
        queryKey: tagAppearanceKeys.all(),
        queryFn: async () => {
            return await tagAppearanceQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const tagAppearanceQueryByIdOptions = (id: number) => {
    return queryOptions<DatabaseTagAppearance | undefined>({
        queryKey: tagAppearanceKeys.byId(id),
        queryFn: async () => {
            return await tagAppearanceQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const tagAppearancesByTagIdQueryOptions = (tagId: number) => {
    return queryOptions<DatabaseTagAppearance[]>({
        queryKey: tagAppearanceKeys.byTagId(tagId),
        queryFn: async () => {
            return await tagAppearanceQueries.getByTagId(db, tagId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const tagAppearancesByPageIdQueryOptions = (pageId: number) => {
    return queryOptions<DatabaseTagAppearance[]>({
        queryKey: tagAppearanceKeys.byPageId(pageId),
        queryFn: async () => {
            return await tagAppearanceQueries.getByPageId(db, pageId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const createTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newItems: NewTagAppearanceArgs[]) =>
            createTagAppearances({ db, newItems }),
        onSuccess: () => {
            // Invalidate all tag appearance queries
            void qc.invalidateQueries({
                queryKey: tagAppearanceKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating tag appearances`, e, variables);
        },
    });
};

export const updateTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedTagAppearanceArgs[]) =>
            updateTagAppearances({ db, modifiedItems }),
        onSuccess: (_, variables) => {
            // Invalidate specific queries
            const itemIds = new Set<number>();
            for (const modifiedItem of variables) itemIds.add(modifiedItem.id);

            for (const id of itemIds) {
                void qc.invalidateQueries({
                    queryKey: tagAppearanceKeys.byId(id),
                });
            }
            void qc.invalidateQueries({
                queryKey: tagAppearanceKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating tag appearances`, e, variables);
        },
    });
};

export const deleteTagAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) =>
            deleteTagAppearances({ db, itemIds }),
        onSuccess: () => {
            // Invalidate all tag appearance queries
            void qc.invalidateQueries({
                queryKey: tagAppearanceKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting tag appearances`, e, variables);
        },
    });
};
