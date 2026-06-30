import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    fieldPropertiesQueryOptions,
    lightingEffectByIdQueryOptions,
} from "@/hooks/queries";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import {
    createEffectLayerCanvasRect,
    getEffectLayerRectStyles,
    isLightingEffectLayerRect,
    resolveEffectLayerRectColor,
} from "@/utilities/effectLayerCanvasRect";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { fabric } from "fabric";

export function useRenderLightingEffectLayers({
    canvas,
    isPlaying,
}: {
    canvas: OpenMarchCanvas | null;
    isPlaying: boolean;
}) {
    const workspaceMode = useWorkspaceViewStore.use.mode();
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const effectId =
        workspaceMode === "lightDesigner" && selectedEffect != null
            ? selectedEffect.effectId
            : null;
    const { data: effect } = useQuery({
        ...lightingEffectByIdQueryOptions(effectId ?? -1),
        enabled: effectId != null && !isPlaying,
    });

    const layerRectsRef = useRef<Map<number, fabric.Rect>>(new Map());

    useEffect(() => {
        if (!canvas) return;

        const removeAllLayerRects = () => {
            for (const rect of layerRectsRef.current.values()) {
                canvas.remove(rect);
            }
            layerRectsRef.current.clear();

            canvas
                .getObjects()
                .filter(isLightingEffectLayerRect)
                .forEach((obj) => canvas.remove(obj));
        };

        const shouldShow =
            workspaceMode === "lightDesigner" &&
            !isPlaying &&
            effect != null &&
            selectedEffect != null &&
            effect.id === selectedEffect.effectId &&
            fieldProperties != null;

        if (!shouldShow) {
            removeAllLayerRects();
            canvas.requestRenderAll();
            return;
        }

        const strokeColor = resolveEffectLayerRectColor(
            fieldProperties.theme.shape,
            effect.type,
            effect.args,
        );
        const persistedStyles = getEffectLayerRectStyles(
            strokeColor,
            "persisted",
        );
        const nextLayerIds = new Set(
            effect.effect_layers.map((layer) => layer.id),
        );

        for (const [layerId, rect] of layerRectsRef.current.entries()) {
            if (!nextLayerIds.has(layerId)) {
                canvas.remove(rect);
                layerRectsRef.current.delete(layerId);
            }
        }

        for (const layer of effect.effect_layers) {
            const existing = layerRectsRef.current.get(layer.id);
            if (existing) {
                existing.set({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    ...persistedStyles,
                });
                existing.setCoords();
            } else {
                const rect = createEffectLayerCanvasRect({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    strokeColor,
                    style: "persisted",
                });
                canvas.add(rect);
                layerRectsRef.current.set(layer.id, rect);
            }
        }

        canvas.requestRenderAll();
    }, [
        canvas,
        effect,
        fieldProperties,
        isPlaying,
        selectedEffect,
        workspaceMode,
    ]);
}
