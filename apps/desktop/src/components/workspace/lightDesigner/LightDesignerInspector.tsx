import EffectList from "@/components/inspector/lighting/EffectList";
import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useUpcomingLightingEffectsInSelectedPageQuery } from "@/hooks/queries";
import { T } from "@tolgee/react";

/**
 * Light Designer right panel. Replace with lighting controls as the feature grows.
 */
export default function LightDesignerInspector() {
    const { selectedPage } = useSelectedPage()!;
    const sceneQuery = useUpcomingLightingEffectsInSelectedPageQuery(
        selectedPage?.id,
    );

    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.inspectorTitle"
                    defaultValue="Lighting"
                />
            </p>
            <div className="mt-8 min-h-0 min-w-0 flex-1">
                <InspectorCollapsible
                    defaultOpen
                    translatableTitle={{
                        keyName: "inspector.light.title",
                        parameters: {
                            sceneName:
                                sceneQuery?.lightingSceneData?.name ??
                                sceneQuery?.lightingSceneData?.id.toString() ??
                                "",
                        },
                    }}
                    className="mt-12"
                >
                    <EffectList />
                </InspectorCollapsible>
            </div>
        </div>
    );
}
