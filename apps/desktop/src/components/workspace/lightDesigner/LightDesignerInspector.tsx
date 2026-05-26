import EffectList from "@/components/inspector/lighting/EffectList";
import GroupList from "@/components/inspector/lighting/GroupList";
import VerticalSplitPane from "@/components/inspector/VerticalSplitPane";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    lightingScenePositionByLightingSceneIdMapQueryOptions,
    useUpcomingLightingEffectsInSelectedPageQuery,
} from "@/hooks/queries";
import { useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";

/**
 * Light Designer right panel. Replace with lighting controls as the feature grows.
 */
export default function LightDesignerInspector() {
    const { selectedPage } = useSelectedPage()!;
    const playbackStartPageId =
        selectedPage == null
            ? undefined
            : selectedPage.id === 0
              ? selectedPage.id
              : (selectedPage.nextPageId ?? undefined);
    const sceneQuery =
        useUpcomingLightingEffectsInSelectedPageQuery(playbackStartPageId);
    const scenePositionByIdQuery = useQuery(
        lightingScenePositionByLightingSceneIdMapQueryOptions(),
    );
    const sceneOrder =
        sceneQuery.lightingSceneData?.id != null
            ? scenePositionByIdQuery.data?.[sceneQuery.lightingSceneData.id]
            : undefined;

    const activeLightingSceneId = sceneQuery.lightingSceneData?.id;

    return (
        <div className="flex h-full min-h-0 w-xs min-w-0 flex-col gap-8">
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
                    <div className="rounded-6 border-stroke bg-fg-1 flex h-full min-h-0 flex-col gap-8 border p-6">
                        <h3 className="text-text-subtitle mt-6 shrink-0 px-6 text-sm">
                            <T
                                keyName="workspace.lightDesigner.effects.sectionTitle"
                                defaultValue="Effects"
                            />
                        </h3>
                        <div className="mb-6 min-h-0 flex-1 overflow-y-auto px-6">
                            <EffectList />
                        </div>
                    </div>
                }
            />
        </div>
    );
}
