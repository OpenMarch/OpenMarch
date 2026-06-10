import SelectedEffectInspector from "@/components/inspector/lighting/SelectedEffectInspector";
import GroupList from "@/components/inspector/lighting/GroupList";
import VerticalSplitPane from "@/components/inspector/VerticalSplitPane";
import { useLightSceneManager } from "@/components/workspace/lightDesigner/useLightSceneManager";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    lightingScenePositionByLightingSceneIdMapQueryOptions,
    useUpcomingLightingEffectsInSelectedPageQuery,
} from "@/hooks/queries";
import { useLightDesignerEffectGroupFocusSync } from "@/hooks/useLightDesignerEffectGroupFocusSync";
import { useLightDesignerSelectedEffectSync } from "@/hooks/useLightDesignerSelectedEffectSync";
import { useShallow } from "zustand/react/shallow";
import { useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import { useMemo } from "react";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";

/**
 * Light Designer right panel. Replace with lighting controls as the feature grows.
 */
export default function LightDesignerInspector() {
    const { selectedPage } = useSelectedPage()!;
    const hasSelectedEffect = useLightDesignerSelectedEffectStore(
        useShallow((state) => state.selectedEffect != null),
    );
    const playbackStartPageId =
        selectedPage == null
            ? undefined
            : selectedPage.id === 0
              ? selectedPage.id
              : (selectedPage.nextPageId ?? undefined);
    const sceneQuery =
        useUpcomingLightingEffectsInSelectedPageQuery(playbackStartPageId);
    useLightSceneManager();

    const scenePositionByIdQuery = useQuery(
        lightingScenePositionByLightingSceneIdMapQueryOptions(),
    );
    const sceneOrder =
        sceneQuery.lightingSceneData?.id != null
            ? scenePositionByIdQuery.data?.[sceneQuery.lightingSceneData.id]
            : undefined;

    const activeLightingSceneId = sceneQuery.lightingSceneData?.id;
    const effectIdsInOrder = useMemo(
        () => sceneQuery.lightingSceneData?.lightingEffectIds ?? [],
        [sceneQuery.lightingSceneData?.lightingEffectIds],
    );

    useLightDesignerEffectGroupFocusSync(activeLightingSceneId);
    useLightDesignerSelectedEffectSync(activeLightingSceneId, effectIdsInOrder);

    return (
        <div className="flex h-full min-h-0 w-xs min-w-0 shrink-0 flex-col gap-8">
            <h2 className="shrink-0 text-xl">
                <T
                    keyName="inspector.light.title"
                    params={{
                        sceneName:
                            sceneQuery?.lightingSceneData?.name ??
                            sceneOrder?.toString() ??
                            "",
                    }}
                />
            </h2>

            <VerticalSplitPane
                defaultRatio={0.78}
                top={
                    <div className="rounded-6 border-stroke bg-fg-1 flex h-full min-h-0 flex-col gap-8 border p-6">
                        <h3 className="text-text-subtitle mt-6 shrink-0 px-6 text-sm">
                            <T
                                keyName="inspector.light.groupsTitle"
                                defaultValue="Groups"
                            />
                        </h3>
                        <div className="mb-6 min-h-0 flex-1 overflow-y-auto px-6">
                            <GroupList sceneId={activeLightingSceneId} />
                        </div>
                    </div>
                }
                bottom={
                    <div className="rounded-6 border-stroke bg-fg-1 flex h-full min-h-[64px] flex-col gap-8 border p-6">
                        <h3
                            className="text-text-subtitle mt-6 shrink-0 px-6 text-sm"
                            hidden={!hasSelectedEffect}
                        >
                            <T
                                keyName="workspace.lightDesigner.effects.sectionTitle"
                                defaultValue="Effects"
                            />
                        </h3>
                        <div className="mb-6 min-h-0 flex-1 overflow-y-auto px-6">
                            <SelectedEffectInspector
                                sceneId={activeLightingSceneId}
                                effectIdsInOrder={effectIdsInOrder}
                                isLoadingScene={
                                    sceneQuery.isLoadingLightingScene
                                }
                                lightingSceneData={sceneQuery.lightingSceneData}
                            />
                        </div>
                    </div>
                }
            />
        </div>
    );
}
