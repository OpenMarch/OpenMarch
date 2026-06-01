import { lightingEffectByIdQueryOptions } from "@/hooks/queries";
import { useLightDesignerGroupFocusStore } from "@/stores/LightDesignerGroupFocusStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * When a lighting effect is selected, focus all groups assigned to that effect on the canvas.
 */
export function useLightDesignerEffectGroupFocusSync(
    activeSceneId: number | undefined,
) {
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const setGroupFocus = useLightDesignerGroupFocusStore.use.setGroupFocus();
    const clearGroupFocus =
        useLightDesignerGroupFocusStore.use.clearGroupFocus();

    const selectionMatchesScene =
        selectedEffect != null &&
        activeSceneId != null &&
        selectedEffect.sceneId === activeSceneId;

    const { data: effect } = useQuery({
        ...lightingEffectByIdQueryOptions(selectedEffect?.effectId ?? -1),
        enabled: selectionMatchesScene && selectedEffect != null,
    });

    const prevSelectedEffectRef = useRef(selectedEffect);
    useEffect(() => {
        const prev = prevSelectedEffectRef.current;
        prevSelectedEffectRef.current = selectedEffect;
        if (prev != null && selectedEffect == null) {
            clearGroupFocus();
        }
    }, [selectedEffect, clearGroupFocus]);

    useEffect(() => {
        if (selectedEffect == null) return;
        if (!selectionMatchesScene || activeSceneId == null) {
            clearGroupFocus();
            return;
        }
        if (effect == null || effect.id !== selectedEffect.effectId) return;
        setGroupFocus({
            sceneId: activeSceneId,
            groupIds: effect.lighting_group_ids,
        });
    }, [
        activeSceneId,
        clearGroupFocus,
        effect,
        selectedEffect,
        selectionMatchesScene,
        setGroupFocus,
    ]);
}
