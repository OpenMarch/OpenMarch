import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseShapePage,
    getShapePages,
    getShapePagesByPageId,
    deleteShapePages,
    ModifiedShapePageArgs,
    updateShapePages,
    getShapePageById,
    copyShapePageToPage,
    ShapePageMarcher,
    getShapePageMarchersByPage,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import tolgee from "@/global/singletons/Tolgee";
import { toast } from "sonner";
import { invalidateByPage } from "./sharedInvalidators";

const KEY_BASE = "shape_pages";

// Query key factory
export const shapePageKeys = {
    all: () => [KEY_BASE] as const,
    byPageId: (pageId: number) => [KEY_BASE, "pageId", pageId] as const,
    byShapeId: (shapeId: number) => [KEY_BASE, "shapeId", shapeId] as const,
    spmByPageId: (pageId: number) =>
        [KEY_BASE, "pageId", pageId, "spm"] as const,
};

const shapePageQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseShapePage[]> => {
        return await getShapePages({ db });
    },
    getById: async (
        db: DbConnection,
        shapePageId: number,
    ): Promise<DatabaseShapePage | undefined> => {
        return await getShapePageById({ db, id: shapePageId });
    },
    getByPageId: async (
        db: DbConnection,
        pageId: number,
    ): Promise<DatabaseShapePage[]> => {
        return await getShapePagesByPageId({ db, pageId });
    },
    getSpmByPageId: async (
        db: DbConnection,
        pageId: number,
    ): Promise<ShapePageMarcher[]> => {
        return await getShapePageMarchersByPage({ db, pageId });
    },
};

/**
 * Query options for getting all shape pages
 */
export const allDatabaseShapePagesQueryOptions = () => {
    return queryOptions<DatabaseShapePage[]>({
        queryKey: shapePageKeys.all(),
        queryFn: async () => {
            return await shapePageQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Query options for getting shape pages by page ID
 */
export const shapePagesQueryByPageIdOptions = (pageId: number) => {
    return queryOptions<DatabaseShapePage[]>({
        queryKey: shapePageKeys.byPageId(pageId),
        queryFn: async () => {
            return await shapePageQueries.getByPageId(db, pageId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const shapePageMarchersQueryByPageIdOptions = (pageId: number) => {
    return queryOptions<ShapePageMarcher[]>({
        queryKey: shapePageKeys.spmByPageId(pageId),
        queryFn: async () => {
            return await shapePageQueries.getSpmByPageId(db, pageId);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const updateShapePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedShapePageArgs[]) =>
            updateShapePages({ db, modifiedItems }),
        onSuccess: (result, variables) => {
            // if (!variables) return;
            // // Invalidate specific queries
            // const itemIds = new Set<number>();
            // for (const modifiedArgs of variables) itemIds.add(modifiedArgs.id);

            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            invalidateByPage(qc, new Set(result.map((m) => m.page_id)));
        },
        onError: (e, variables) => {
            conToastError(`Error updating shape pages`, e, variables);
        },
    });
};

export const deleteShapePagesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) => deleteShapePages({ db, itemIds }),
        onSuccess: (result) => {
            // Invalidate all queries
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            invalidateByPage(qc, new Set(result.map((m) => m.page_id)));
        },
        onError: (e, variables) => {
            conToastError(`Error deleting shape pages`, e, variables);
        },
    });
};

export const copyShapePageToPageMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: ({
            shapePageId,
            targetPageId,
        }: {
            shapePageId: number;
            targetPageId: number;
        }) => copyShapePageToPage({ db, shapePageId, targetPageId }),
        onSuccess: (_, variables) => {
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
            invalidateByPage(qc, new Set([variables.targetPageId]));

            toast.success(
                tolgee.t("inspector.shape.successfullyCopied", {
                    pageId: variables.targetPageId,
                }),
            );
        },
        onError: (e, variables) => {
            toast.error(
                tolgee.t("inspector.shape.errorCopyingPage", {
                    pageId: variables.targetPageId,
                }),
            );
        },
    });
};
