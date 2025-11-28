import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseTag,
    createTags,
    getTags,
    getTagById,
    deleteTags,
    updateTags,
    NewTagArgs,
    ModifiedTagArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "tags";

// Query key factory
export const tagKeys = {
    all: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, "id", id] as const,
};

const tagQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseTag[]> => {
        return await getTags({ db });
    },
    getById: async (
        db: DbConnection,
        id: number,
    ): Promise<DatabaseTag | undefined> => {
        return await getTagById({ db, id });
    },
};

/**
 * Query options for getting all tags
 */
export const allTagsQueryOptions = () => {
    return queryOptions<DatabaseTag[]>({
        queryKey: tagKeys.all(),
        queryFn: async () => {
            return await tagQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const tagQueryByIdOptions = (id: number) => {
    return queryOptions<DatabaseTag | undefined>({
        queryKey: tagKeys.byId(id),
        queryFn: async () => {
            return await tagQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const createTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newTags: NewTagArgs[]) => createTags({ db, newTags }),
        onSuccess: () => {
            // Invalidate all tag queries
            void qc.invalidateQueries({
                queryKey: tagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating tags`, e, variables);
        },
    });
};

export const updateTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedTags: ModifiedTagArgs[]) =>
            updateTags({ db, modifiedTags }),
        onSuccess: (_, variables) => {
            // Invalidate specific queries
            const tagIds = new Set<number>();
            for (const modifiedTag of variables) tagIds.add(modifiedTag.id);

            for (const id of tagIds) {
                void qc.invalidateQueries({
                    queryKey: tagKeys.byId(id),
                });
            }
            void qc.invalidateQueries({
                queryKey: tagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating tags`, e, variables);
        },
    });
};

export const deleteTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (tagIds: Set<number>) => deleteTags({ db, tagIds }),
        onSuccess: () => {
            // Invalidate all tag queries
            void qc.invalidateQueries({
                queryKey: tagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting tags`, e, variables);
        },
    });
};
