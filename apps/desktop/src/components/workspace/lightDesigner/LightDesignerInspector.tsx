import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useLightingEffectsInSelectedPageQuery } from "@/hooks/queries";
import { T } from "@tolgee/react";

/**
 * Light Designer right panel. Replace with lighting controls as the feature grows.
 */
export default function LightDesignerInspector() {
    const { selectedPage } = useSelectedPage()!;
    const sceneQuery = useLightingEffectsInSelectedPageQuery(selectedPage?.id);

    if (!sceneQuery.lightingSceneData) return <>Loading...</>;

    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.inspectorTitle"
                    defaultValue="Lighting"
                />
            </p>
            <p className="text-sub text-text/50 mt-8">
                <InspectorCollapsible
                    defaultOpen
                    translatableTitle={{
                        keyName: "inspector.light.title",
                        parameters: {
                            sceneName:
                                sceneQuery.lightingSceneData.name ??
                                sceneQuery.lightingSceneData.id.toString(),
                        },
                    }}
                    className="mt-12"
                >
                    <p>Lighting</p>
                </InspectorCollapsible>
            </p>
        </div>
    );
}
