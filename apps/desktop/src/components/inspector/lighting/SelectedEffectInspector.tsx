import EffectItem from "@/components/inspector/lighting/EffectItem";
import type { EffectPlaybackInfo } from "@/components/inspector/lighting/effectPlayback";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type {
    DatabaseLightingScene,
    LightingEffectWithMarchers,
    ModifiedLightingEffectArgs,
} from "@/db-functions";
import {
    deleteLightingEffectsMutationOptions,
    lightingEffectByIdQueryOptions,
    updateLightingEffectsMutationOptions,
} from "@/hooks/queries";
import { useSceneEffectPlayback } from "@/hooks/useSceneEffectPlayback";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { updateLightingEffectType } from "@openmarch/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import { useCallback, useMemo } from "react";

type SceneWithEffectIds = DatabaseLightingScene & {
    lightingEffectIds: number[];
};

export type SelectedEffectInspectorProps = {
    sceneId: number | undefined;
    effectIdsInOrder: readonly number[];
    isLoadingScene: boolean;
    lightingSceneData: SceneWithEffectIds | undefined;
};

export default function SelectedEffectInspector({
    sceneId,
    effectIdsInOrder,
    isLoadingScene,
    lightingSceneData,
}: SelectedEffectInspectorProps) {
    const { selectedPage } = useSelectedPage()!;
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const clearSelectedEffect =
        useLightDesignerSelectedEffectStore.use.clearSelectedEffect();

    const selectedEffectId = useMemo(() => {
        if (
            sceneId == null ||
            selectedEffect == null ||
            selectedEffect.sceneId !== sceneId ||
            !effectIdsInOrder.includes(selectedEffect.effectId)
        ) {
            return null;
        }
        return selectedEffect.effectId;
    }, [sceneId, selectedEffect, effectIdsInOrder]);

    const { mutate: updateEffect } = useMutation(
        updateLightingEffectsMutationOptions(),
    );
    const { mutate: deleteEffects } = useMutation(
        deleteLightingEffectsMutationOptions(),
    );

    const { data: effect, isPending: isLoadingEffect } = useQuery({
        ...lightingEffectByIdQueryOptions(selectedEffectId ?? -1),
        enabled: selectedEffectId != null,
    });

    const getPlaybackInfo = useSceneEffectPlayback({
        sceneId,
        lightingSceneData,
        effectIdsInOrder,
        enabled: selectedEffectId != null,
    });

    const handleDeleteEffect = useCallback(() => {
        if (selectedEffectId == null) return;
        clearSelectedEffect();
        deleteEffects(new Set([selectedEffectId]));
    }, [clearSelectedEffect, deleteEffects, selectedEffectId]);

    if (!selectedPage) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.noPage"
                    defaultValue="Select a page to edit lighting effects."
                />
            </p>
        );
    }

    if (isLoadingScene) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.loading"
                    defaultValue="Loading…"
                />
            </p>
        );
    }

    if (lightingSceneData == null || sceneId == null) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.noScene"
                    defaultValue="No lighting scene for this page."
                />
            </p>
        );
    }

    if (effectIdsInOrder.length === 0) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.empty"
                    defaultValue="No effects in this scene yet."
                />
            </p>
        );
    }

    if (selectedEffectId == null) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.selectOnTimeline"
                    defaultValue="Select an effect on the timeline to edit it."
                />
            </p>
        );
    }

    const playbackInfo =
        selectedEffectId != null
            ? getPlaybackInfo(selectedEffectId)
            : undefined;

    return (
        <SelectedEffectEditor
            effect={effect}
            isLoading={isLoadingEffect}
            playbackInfo={playbackInfo}
            updateEffect={updateEffect}
            deleteEffectFn={handleDeleteEffect}
        />
    );
}

function SelectedEffectEditor({
    effect,
    isLoading,
    playbackInfo,
    updateEffect,
    deleteEffectFn,
}: {
    effect: LightingEffectWithMarchers | undefined;
    isLoading: boolean;
    playbackInfo?: EffectPlaybackInfo;
    updateEffect: (variables: ModifiedLightingEffectArgs) => void;
    deleteEffectFn: () => void;
}) {
    const isPlayed = playbackInfo?.state === "played";
    const isActive = playbackInfo?.state === "active";

    if (isLoading || effect == null) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.rowLoading"
                    defaultValue="Loading effect…"
                />
            </p>
        );
    }

    return (
        <div
            className={`relative overflow-clip transition-opacity ${isPlayed ? "opacity-60" : ""}`}
        >
            {isPlayed && (
                <div className="bg-accent/20 absolute top-0 left-0 z-0 h-full w-full" />
            )}
            {isActive && (
                <div
                    className="bg-accent/25 absolute top-0 left-0 z-0 h-full"
                    style={{
                        height: `${playbackInfo?.progressPct ?? 0}%`,
                        width: "100%",
                    }}
                />
            )}
            <div className="relative z-10 flex flex-col gap-8">
                <EffectItem
                    effectId={effect.id}
                    name={effect.name ?? ""}
                    type={effect.type}
                    args={effect.args}
                    nameChangeFn={(name) =>
                        updateEffect({
                            id: effect.id,
                            name,
                        })
                    }
                    deleteEffectFn={deleteEffectFn}
                    typeChangeFn={(newType) =>
                        updateLightingEffectType({
                            newType,
                            updateFunction: (type, argsJson) =>
                                updateEffect({
                                    id: effect.id,
                                    type,
                                    args: argsJson,
                                }),
                        })
                    }
                    argsChangeFn={(argsJson) =>
                        updateEffect({
                            id: effect.id,
                            args: argsJson,
                        })
                    }
                />
            </div>
        </div>
    );
}
