import {
    MarcherIdsByTagId,
    getMarcherIdsByTagIdMap,
    TagAppearanceIdsByPageId,
    _calculateMapAllTagAppearanceIdsByPageId,
    getPagesInOrder,
    getResolvedTagAppearancesByPageId,
    TagAppearance,
    DatabaseTag,
    getTags,
    getTagById,
    DatabaseMarcherTag,
    getMarcherTags,
    getTagAppearances,
    getTagAppearancesByStartPageId,
} from "@/db-functions";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME } from "../constants";
import { db } from "@/global/database/db";
import { marcherWithVisualsKeys } from "..";

const KEY_BASE = "tags";
const TAG_APPEARANCES_KEY = "tag_appearances";
const MARCHER_TAGS_KEY = "marcher_tags";

export const tagKeys = {
    allTags: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, "id", id] as const,
    tagAppearanceIdsByPageIdMap: () => [TAG_APPEARANCES_KEY, "page"] as const,
    byPageId: (page_id: number) =>
        [TAG_APPEARANCES_KEY, "page", { page_id }] as const,
    marcherIdsByTagIdMap: () =>
        [MARCHER_TAGS_KEY, "marcher_ids_by_tag_id_map"] as const,
    allTagAppearances: () => [TAG_APPEARANCES_KEY] as const,
    tagAppearancesByPageId: (page_id: number) =>
        [TAG_APPEARANCES_KEY, "page", { page_id }] as const,
    tagAppearancesByStartPageId: (start_page_id: number) =>
        [TAG_APPEARANCES_KEY, "start_page", { start_page_id }] as const,
    allMarcherTags: () => [MARCHER_TAGS_KEY] as const,
};

export const invalidateTagQueries = (qc: QueryClient) => {
    void Promise.all([
        qc.invalidateQueries({ queryKey: [KEY_BASE] }),
        qc.invalidateQueries({
            queryKey: [MARCHER_TAGS_KEY],
        }),
        qc.invalidateQueries({
            queryKey: [TAG_APPEARANCES_KEY],
        }),
    ]).then(() => {
        void qc.invalidateQueries({
            queryKey: marcherWithVisualsKeys.all(),
        });
    });
};

export const invalidateTagQueriesByPage = (qc: QueryClient, pageId: number) => {
    void qc.invalidateQueries({
        queryKey: tagKeys.allTags(),
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
// This will fill in the array of tag appearance IDs for each page.
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

/**
 * Calculates the tag appearance that will be used for a given page.
 * This fills in the array of tag appearance IDs for each page.
 *
 * @param pageId - The page ID to get the tag appearances for.
 * @param queryClient - The query client to use to get the tag appearance IDs by page ID map.
 * @returns
 */
export const resolvedTagAppearancesByPageIdQueryOptions = ({
    pageId,
    queryClient,
}: {
    pageId: number | null | undefined;
    queryClient: QueryClient;
}) => {
    return queryOptions<TagAppearance[]>({
        queryKey: tagKeys.byPageId(pageId!),
        staleTime: DEFAULT_STALE_TIME,
        enabled: pageId != null,

        queryFn: async () => {
            // 1. Ensure the map query is available
            const globalMap = await queryClient.fetchQuery(
                tagAppearanceByPageIdMapQueryOptions(),
            );

            // 2. Now compute the per-page results
            return await getResolvedTagAppearancesByPageId({
                db,
                pageId: pageId!,
                tagAppearanceIdsByPageId: globalMap,
            });
        },
    });
};

/**
 * Gets the tag appearance with a given start page ID.
 *
 * @param pageId the page ID to get the tag appearances for.
 * @returns the tag appearances for the given page.
 */
export const tagAppearancesByStartPageIdQueryOptions = (
    pageId: number | null | undefined,
) => {
    return queryOptions<TagAppearance[]>({
        queryKey: tagKeys.tagAppearancesByStartPageId(pageId!),
        queryFn: async () => {
            return await getTagAppearancesByStartPageId({
                db,
                pageId: pageId!,
            });
        },
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
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
export type TagAppearanceForPageByTagId = Map<number, TagAppearance>;

// The actual tag appearances for a given page
export const tagAppearancesForPageQueryOptions = (
    pageId: number | null | undefined,
    queryClient: QueryClient,
) => {
    return queryOptions<TagAppearanceForPageByTagId>({
        queryKey: tagKeys.byPageId(pageId!),
        queryFn: async () => {
            const tagAppearanceIdsByPageIdMap =
                await queryClient.fetchQuery<TagAppearanceIdsByPageId>({
                    queryKey: tagKeys.tagAppearanceIdsByPageIdMap(),
                });
            const result = await getResolvedTagAppearancesByPageId({
                db,
                pageId: pageId!,
                tagAppearanceIdsByPageId: tagAppearanceIdsByPageIdMap,
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

// ============================================================================
// TAGS QUERIES
// ============================================================================

/**
 * Query options for getting all tags
 */
export const allTagsQueryOptions = () => {
    return queryOptions<DatabaseTag[]>({
        queryKey: tagKeys.allTags(),
        queryFn: async () => {
            return await getTags({ db });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Query options for getting a single tag by ID
 */
export const tagQueryByIdOptions = (id: number) => {
    return queryOptions<DatabaseTag | undefined>({
        queryKey: tagKeys.byId(id),
        queryFn: async () => {
            return await getTagById({ db, id });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

// ============================================================================
// TAG APPEARANCES QUERIES
// ============================================================================

/**
 * Query options for getting all tag appearances
 */
export const allTagAppearancesQueryOptions = () => {
    return queryOptions<TagAppearance[]>({
        queryKey: tagKeys.allTagAppearances(),
        queryFn: async () => {
            return await getTagAppearances({ db });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

// ============================================================================
// MARCHER TAGS QUERIES
// ============================================================================

/**
 * Query options for getting all marcher tags
 */
export const allMarcherTagsQueryOptions = () => {
    return queryOptions<DatabaseMarcherTag[]>({
        queryKey: tagKeys.allMarcherTags(),
        queryFn: async () => {
            return await getMarcherTags({ db });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};
