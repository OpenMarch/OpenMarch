import EffectList from "@/components/inspector/lighting/EffectList";
import SceneGroupsSection from "@/components/inspector/lighting/SceneGroupsSection";
import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";
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
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.inspectorTitle"
                    defaultValue="Lighting"
                />
            </p>
            <div className="mt-8 flex min-h-0 min-w-0 flex-1 flex-col gap-12 overflow-hidden">
                <InspectorCollapsible
                    defaultOpen
                    translatableTitle={{
                        keyName: "inspector.light.title",
                        parameters: {
                            sceneName:
                                sceneQuery?.lightingSceneData?.name ??
                                sceneOrder?.toString() ??
                                "",
                        },
                    }}
                    className="mt-12"
                >
                    <EffectList />
                </InspectorCollapsible>

                <InspectorCollapsible
                    defaultOpen={false}
                    title="inspector.light.groupsTitle"
                    className="mt-12 flex min-h-0 flex-1 flex-col"
                >
                    <SceneGroupsSection sceneId={activeLightingSceneId} />
                </InspectorCollapsible>
            </div>
        </div>
    );
}
