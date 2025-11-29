import {
    MarcherIdsByTagId,
    getMarcherIdsByTagIdMap,
    TagAppearanceIdsByPageId,
    _calculateMapAllTagAppearanceIdsByPageId,
    getPagesInOrder,
    getTagAppearancesByPageId,
    DatabaseTagAppearance,
    NewTagAppearanceArgs,
} from "@/db-functions";
import {
    mutationOptions,
    QueryClient,
    queryOptions,
    useQuery,
} from "@tanstack/react-query";
import { DEFAULT_STALE_TIME } from "../constants";
import { db } from "@/global/database/db";
import { useCallback } from "react";

const KEY_BASE = "tags";

export const tagKeys = {
    all: () => [KEY_BASE] as const,
    byPageId: (page_id: number) => [KEY_BASE, { page_id }] as const,
    marcherIdsByTagIdMap: () =>
        [KEY_BASE, "marcher_ids_by_tag_id_map"] as const,
    tagAppearanceIdsByPageIdMap: () =>
        [KEY_BASE, "tag_appearance_ids_by_page_id_map"] as const,
};

export const invalidateTagQueriesByPage = (qc: QueryClient, pageId: number) => {
    void qc.invalidateQueries({
        queryKey: tagKeys.all(),
    });
    void qc.invalidateQueries({
        queryKey: tagKeys.byPageId(pageId),
    });
    void qc.invalidateQueries({
        queryKey: tagKeys.tagAppearanceIdsByPageIdMap(),
    });
};

// What marcher IDs are associated with each tag?
export const marcherIdsForAllTagIdsQueryOptions = () => {
    return queryOptions<MarcherIdsByTagId>({
        queryKey: tagKeys.marcherIdsByTagIdMap(),
        queryFn: async () => await getMarcherIdsByTagIdMap({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });
};

// What tag appearances are on each page?
export const tagAppearanceByPageIdMapQueryOptions = () => {
    return queryOptions<TagAppearanceIdsByPageId>({
        queryKey: tagKeys.tagAppearanceIdsByPageIdMap(),
        queryFn: async () => {
            const pagesInOrder = await getPagesInOrder({ tx: db });
            const tagAppearances = await db.query.tag_appearances.findMany({
                columns: {
                    id: true,
                    start_page_id: true,
                    tag_id: true,
                },
            });
            return await _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder,
            });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

// The actual tag appearances for a given page
export const useTagAppearancesByPageId = (
    pageId: number | null | undefined,
) => {
    const {
        data: tagAppearanceIdsByPageIdMap,
        isSuccess: isSuccessTagAppearanceIdsByPageIdMap,
        dataUpdatedAt,
    } = useQuery(tagAppearanceByPageIdMapQueryOptions());

    const queryFn = useCallback(async () => {
        return await getTagAppearancesByPageId({
            db,
            pageId: pageId!,
            tagAppearanceIdsByPageId: tagAppearanceIdsByPageIdMap!,
        });
    }, [pageId, tagAppearanceIdsByPageIdMap]);

    return useQuery({
        queryKey: [...tagKeys.byPageId(pageId!), dataUpdatedAt],
        queryFn,
        staleTime: DEFAULT_STALE_TIME,
        enabled: pageId != null && isSuccessTagAppearanceIdsByPageIdMap,
    });
};

/**
 *
 * This type will only ever contain the tag appearances for a single page.
 *
 * ```typescript
 * Map<tag_id, tag_appearance>
 * ```
 */
export type TagAppearanceForPageByTagId = Map<number, DatabaseTagAppearance>;

// The actual tag appearances for a given page
export const tagAppearancesForPageQueryOptions = (
    pageId: number | null | undefined,
    queryClient: QueryClient,
) => {
    return queryOptions<TagAppearanceForPageByTagId>({
        queryKey: tagKeys.byPageId(pageId!),
        queryFn: async () => {
            const tagAppearanceIdsByPageIdMap =
                await queryClient.ensureQueryData<TagAppearanceIdsByPageId>({
                    queryKey: tagKeys.tagAppearanceIdsByPageIdMap(),
                });
            const result = await getTagAppearancesByPageId({
                db,
                pageId: pageId!,
                tagAppearanceIdsByPageId: tagAppearanceIdsByPageIdMap!,
            });
            const outputMap: TagAppearanceForPageByTagId = new Map();
            for (const tagAppearance of result)
                outputMap.set(tagAppearance.tag_id, tagAppearance);
            return outputMap;
        },
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
    });
};
