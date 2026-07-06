import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useEffect } from "react";

/**
 * Clears timeline effect selection when the active scene changes or the
 * selected effect is removed from the scene.
 */
export function useLightDesignerSelectedEffectSync(
    sceneId: number | undefined,
    effectIdsInOrder: readonly number[],
) {
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const clearSelectedEffect =
        useLightDesignerSelectedEffectStore.use.clearSelectedEffect();

    useEffect(() => {
        clearSelectedEffect();
    }, [sceneId, clearSelectedEffect]);

    useEffect(() => {
        if (selectedEffect == null) return;
        if (sceneId == null || selectedEffect.sceneId !== sceneId) return;
        if (effectIdsInOrder.includes(selectedEffect.effectId)) return;
        clearSelectedEffect();
    }, [effectIdsInOrder, sceneId, selectedEffect, clearSelectedEffect]);
}
