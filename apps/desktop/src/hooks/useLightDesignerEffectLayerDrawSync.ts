import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { useEffect } from "react";

/**
 * Cancels effect-layer draw mode when leaving Light Designer or changing selection.
 */
export function useLightDesignerEffectLayerDrawSync(
    sceneId: number | undefined,
) {
    const workspaceMode = useWorkspaceViewStore.use.mode();
    const drawState = useLightDesignerEffectLayerDrawStore.use.drawState();
    const cancelDrawMode =
        useLightDesignerEffectLayerDrawStore.use.cancelDrawMode();
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();

    useEffect(() => {
        if (workspaceMode !== "lightDesigner") {
            cancelDrawMode();
        }
    }, [workspaceMode, cancelDrawMode]);

    useEffect(() => {
        if (drawState.status !== "drawing") return;

        if (sceneId == null || selectedEffect == null) {
            cancelDrawMode();
            return;
        }

        if (selectedEffect.sceneId !== sceneId) {
            cancelDrawMode();
            return;
        }

        if (selectedEffect.effectId !== drawState.effectId) {
            cancelDrawMode();
        }
    }, [cancelDrawMode, drawState, sceneId, selectedEffect]);
}
