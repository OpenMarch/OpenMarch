import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseMarcherTag,
    createMarcherTags,
    getMarcherTags,
    getMarcherTagById,
    getMarcherTagsByMarcherId,
    getMarcherTagsByTagId,
    deleteMarcherTags,
    updateMarcherTags,
    NewMarcherTagArgs,
    ModifiedMarcherTagArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "marcher_tags";

// Query key factory
export const marcherTagKeys = {
    all: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, "id", id] as const,
    byMarcherId: (marcherId: number) =>
        [KEY_BASE, "marcherId", marcherId] as const,
    byTagId: (tagId: number) => [KEY_BASE, "tagId", tagId] as const,
};

const marcherTagQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseMarcherTag[]> => {
        return await getMarcherTags({ db });
    },
    getById: async (
        db: DbConnection,
        id: number,
    ): Promise<DatabaseMarcherTag | undefined> => {
        return await getMarcherTagById({ db, id });
    },
    getByMarcherId: async (
        db: DbConnection,
        marcherId: number,
    ): Promise<DatabaseMarcherTag[]> => {
        return await getMarcherTagsByMarcherId({ db, marcherId });
    },
    getByTagId: async (
        db: DbConnection,
        tagId: number,
    ): Promise<DatabaseMarcherTag[]> => {
        return await getMarcherTagsByTagId({ db, tagId });
    },
};

/**
 * Query options for getting all marcher_tags
 */
export const allMarcherTagsQueryOptions = () => {
    return queryOptions<DatabaseMarcherTag[]>({
        queryKey: marcherTagKeys.all(),
        queryFn: async () => {
            return await marcherTagQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const marcherTagQueryByIdOptions = (id: number) => {
    return queryOptions<DatabaseMarcherTag | undefined>({
        queryKey: marcherTagKeys.byId(id),
        queryFn: async () => {
            return await marcherTagQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const marcherTagsByMarcherIdQueryOptions = (marcherId: number) => {
    return queryOptions<DatabaseMarcherTag[]>({
        queryKey: marcherTagKeys.byMarcherId(marcherId),
        queryFn: async () => {
            return await marcherTagQueries.getByMarcherId(db, marcherId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const marcherTagsByTagIdQueryOptions = (tagId: number) => {
    return queryOptions<DatabaseMarcherTag[]>({
        queryKey: marcherTagKeys.byTagId(tagId),
        queryFn: async () => {
            return await marcherTagQueries.getByTagId(db, tagId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const createMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newMarcherTags: NewMarcherTagArgs[]) =>
            createMarcherTags({ db, newMarcherTags }),
        onSuccess: () => {
            // Invalidate all marcher_tag queries
            void qc.invalidateQueries({
                queryKey: marcherTagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating marcher tags`, e, variables);
        },
    });
};

export const updateMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedMarcherTags: ModifiedMarcherTagArgs[]) =>
            updateMarcherTags({ db, modifiedMarcherTags }),
        onSuccess: (_, variables) => {
            // Invalidate specific queries
            const itemIds = new Set<number>();
            for (const modifiedItem of variables) itemIds.add(modifiedItem.id);

            for (const id of itemIds) {
                void qc.invalidateQueries({
                    queryKey: marcherTagKeys.byId(id),
                });
            }
            void qc.invalidateQueries({
                queryKey: marcherTagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating marcher tags`, e, variables);
        },
    });
};

export const deleteMarcherTagsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (marcherTagIds: Set<number>) =>
            deleteMarcherTags({ db, marcherTagIds }),
        onSuccess: () => {
            // Invalidate all marcher_tag queries
            void qc.invalidateQueries({
                queryKey: marcherTagKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting marcher tags`, e, variables);
        },
    });
};
