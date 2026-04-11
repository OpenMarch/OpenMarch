import { T } from "@tolgee/react";

/**
 * Light Designer right panel. Replace with lighting controls as the feature grows.
 */
export default function LightDesignerInspector() {
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.inspectorTitle"
                    defaultValue="Lighting"
                />
            </p>
            <p className="text-sub text-text/50 mt-8">
                <T
                    keyName="workspace.lightDesigner.inspectorPlaceholder"
                    defaultValue="Light cues and fixtures will appear here."
                />
            </p>
        </div>
    );
}
