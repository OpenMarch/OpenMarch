import {
    deriveEffectPlaybackStates,
    type EffectPlaybackInfo,
    type OrderedEffectRuntime,
} from "@/components/inspector/lighting/effectPlayback";
import {
    buildLightingSceneTimeWindowsMs,
    findLightingSceneAtShowTime,
} from "@/components/timeline/SceneTimeline.utils";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type { DatabaseLightingScene } from "@/db-functions";
import { useTimingObjects } from "@/hooks";
import { lightingEffectByIdQueryOptions } from "@/hooks/queries";
import { getCurrentShowTimeMs } from "@/utilities/showTime";
import { parseEffectArgs } from "@openmarch/core";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type SceneWithEffectIds = DatabaseLightingScene & {
    lightingEffectIds: number[];
};

function sceneEffectDataKey(
    effectIdsInOrder: readonly number[],
    effectQueries: { data?: { type: string; args: string } }[],
): string {
    return effectIdsInOrder
        .map((id, index) => {
            const effect = effectQueries[index]?.data;
            return effect ? `${id}:${effect.type}:${effect.args}` : "";
        })
        .join("|");
}

export function useSceneEffectPlayback({
    sceneId,
    lightingSceneData,
    effectIdsInOrder,
    enabled,
}: {
    sceneId: number | undefined;
    lightingSceneData: SceneWithEffectIds | undefined;
    effectIdsInOrder: readonly number[];
    enabled: boolean;
}): (effectId: number) => EffectPlaybackInfo | undefined {
    const { isPlaying } = useIsPlaying()!;
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;

    const [currentShowTimeMs, setCurrentShowTimeMs] = useState(() =>
        getCurrentShowTimeMs(isPlaying, selectedPage),
    );

    useEffect(() => {
        if (!isPlaying) {
            setCurrentShowTimeMs(getCurrentShowTimeMs(false, selectedPage));
            return;
        }
        let rafId = 0;
        const tick = () => {
            setCurrentShowTimeMs(getCurrentShowTimeMs(true, selectedPage));
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, selectedPage]);

    const fetchPlaybackEffects =
        enabled && sceneId != null && effectIdsInOrder.length > 0;
    const effectQueries = useQueries({
        queries: effectIdsInOrder.map((id) => ({
            ...lightingEffectByIdQueryOptions(id),
            enabled: fetchPlaybackEffects,
        })),
    });
    const effectDataKey = sceneEffectDataKey(effectIdsInOrder, effectQueries);

    const playbackByEffectId = useMemo(() => {
        const orderedEffects: OrderedEffectRuntime[] = [];
        effectIdsInOrder.forEach((id, index) => {
            const effect = effectQueries[index]?.data;
            if (!effect) return;
            orderedEffects.push({
                id,
                durationMs: parseEffectArgs(effect.type, effect.args)
                    .durationMs,
            });
        });

        const sceneWindows = buildLightingSceneTimeWindowsMs(
            pages,
            lightingSceneData ? [lightingSceneData] : [],
        );
        const activeScene = findLightingSceneAtShowTime(
            sceneWindows,
            currentShowTimeMs,
        );
        const shouldShowPlaybackState =
            enabled &&
            activeScene?.sceneId != null &&
            sceneId != null &&
            activeScene.sceneId === sceneId;

        return deriveEffectPlaybackStates(
            orderedEffects,
            shouldShowPlaybackState ? activeScene!.tSceneMs : null,
        );
        // Query payloads read from latest render; effectDataKey fingerprints when they change.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- stable via effectDataKey
    }, [
        currentShowTimeMs,
        effectDataKey,
        effectIdsInOrder,
        enabled,
        lightingSceneData,
        pages,
        sceneId,
    ]);

    return (effectId: number) => playbackByEffectId.get(effectId);
}
