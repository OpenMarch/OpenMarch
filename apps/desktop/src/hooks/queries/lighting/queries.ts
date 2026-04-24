import {
    DatabaseLightingScene,
    getLightingEffectIdsBySceneId,
    getLightingEffectWithMarchersById,
    getLightingSceneById,
    getLightingSceneInPageId,
    getLightingScenePositionByLightingSceneIdMap,
    getLightingScenes,
    LightingEffectWithMarchers,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME } from "../constants";

const KEY_BASE = "lighting_scenes";
export const lightingKeys = {
    allLightingScenes: () => [KEY_BASE] as const,
    lightingSceneIdInPageId: (pageId: number) =>
        [KEY_BASE, "scene_in_page", { pageId }] as const,
    lightingSceneDataById: (sceneId: number) =>
        [KEY_BASE, "scene_data", { sceneId }] as const,
    lightingEffectById: (effectId: number) =>
        [KEY_BASE, "effect_data", { effectId }] as const,
    marcherLightingEffectsByLightingEffectId: (effectId: number) =>
        [KEY_BASE, "marcher_effects", { effectId }] as const,
};

export const allLightingScenesQueryOptions = () => {
    return queryOptions<DatabaseLightingScene[]>({
        queryKey: lightingKeys.allLightingScenes(),
        queryFn: async () => await getLightingScenes({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const useLightingEffectsInSelectedPageQuery = (
    pageId: number | undefined,
) => {
    const lightingSceneIdQuery = useQuery({
        ...lightingSceneIdInPageIdQueryOptions(pageId!),
        enabled: pageId != null,
    });
    const lightingSceneId = lightingSceneIdQuery.data;
    const lightingSceneDataQuery = useQuery({
        ...lightingSceneDataByIdQueryOptions(lightingSceneId!),
        enabled: lightingSceneId != null,
    });
    const lightingSceneData = lightingSceneDataQuery.data;

    const lightingEffectIds = lightingSceneData?.lightingEffectIds ?? [];

    const lightingEffectsData = useQueries({
        queries: lightingEffectIds.map((lightingEffectId) =>
            lightingEffectByIdQueryOptions(lightingEffectId),
        ),
    });

    const isLoadingLightingScene =
        (pageId != null && lightingSceneIdQuery.isPending) ||
        (lightingSceneId != null && lightingSceneDataQuery.isPending);

    return {
        lightingSceneData,
        lightingEffectsData,
        isLoadingLightingScene,
    };
};

/******** QUERY OPTIONS ********/

export const lightingSceneIdInPageIdQueryOptions = (pageId: number) =>
    queryOptions<number | undefined>({
        queryKey: lightingKeys.lightingSceneIdInPageId(pageId),
        queryFn: async () =>
            (await getLightingSceneInPageId({ db, pageId }))?.id,
        staleTime: DEFAULT_STALE_TIME,
    });

export const lightingSceneDataByIdQueryOptions = (lightingSceneId: number) =>
    queryOptions<
        (DatabaseLightingScene & { lightingEffectIds: number[] }) | undefined
    >({
        queryKey: lightingKeys.lightingSceneDataById(lightingSceneId),
        queryFn: async () => {
            const scene = await getLightingSceneById({
                db,
                id: lightingSceneId,
            });
            if (!scene) return undefined;
            const lightingEffectIds = await getLightingEffectIdsBySceneId({
                db,
                sceneId: lightingSceneId,
            });
            return { ...scene, lightingEffectIds };
        },
        staleTime: DEFAULT_STALE_TIME,
    });

export const lightingEffectByIdQueryOptions = (lightingEffectId: number) =>
    queryOptions<LightingEffectWithMarchers | undefined>({
        queryKey: lightingKeys.lightingEffectById(lightingEffectId),
        queryFn: async () =>
            await getLightingEffectWithMarchersById({
                db,
                id: lightingEffectId,
            }),
        staleTime: DEFAULT_STALE_TIME,
    });
/** Returns a map of lighting scene IDs to their 1-based position in the timeline. */
export const lightingScenePositionByLightingSceneIdMapQueryOptions = () =>
    queryOptions<Record<number, number>>({
        queryKey: [KEY_BASE, "position_map"],
        queryFn: async () => {
            const map = await getLightingScenePositionByLightingSceneIdMap({
                db,
            });
            const sortedEntries = Object.entries(map).sort(
                ([_keyA, positionA], [_keyB, positionB]) =>
                    positionA - positionB,
            );

            const sortedMap = Object.fromEntries(
                sortedEntries.map(([key, _value], index) => [key, index + 1]),
            );

            return sortedMap;
        },
        staleTime: DEFAULT_STALE_TIME,
    });
