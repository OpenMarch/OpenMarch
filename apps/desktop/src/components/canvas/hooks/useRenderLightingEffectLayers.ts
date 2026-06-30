import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    fieldPropertiesQueryOptions,
    lightingEffectByIdQueryOptions,
} from "@/hooks/queries";
import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { useLightDesignerSelectedEffectLayerStore } from "@/stores/LightDesignerSelectedEffectLayerStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import {
    createEffectLayerCanvasRect,
    getEffectLayerRectStyles,
    isLightingEffectLayerRect,
    resolveEffectLayerRectColor,
    type LightingEffectLayerCanvasRect,
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
    const selectedLayerId =
        useLightDesignerSelectedEffectLayerStore.use.selectedLayerId();
    const drawState = useLightDesignerEffectLayerDrawStore.use.drawState();
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

        const isDrawing = drawState.status === "drawing";
        const strokeColor = resolveEffectLayerRectColor(
            fieldProperties.theme.shape,
            effect.type,
            effect.args,
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

        const activeObject = canvas.getActiveObject();
        const isTransforming = Boolean(
            (canvas as fabric.Canvas & { _currentTransform?: unknown })
                ._currentTransform,
        );

        for (const layer of effect.effect_layers) {
            const isSelected = !isDrawing && selectedLayerId === layer.id;
            const style = isSelected ? "selected" : "persisted";
            const layerStyles = getEffectLayerRectStyles(strokeColor, style);
            const existing = layerRectsRef.current.get(layer.id);

            if (
                existing &&
                activeObject === existing &&
                isTransforming &&
                isSelected
            ) {
                continue;
            }

            if (existing) {
                const layerRect = existing as LightingEffectLayerCanvasRect;
                layerRect.set({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    scaleX: 1,
                    scaleY: 1,
                    ...layerStyles,
                    selectable: isSelected,
                    evented: !isDrawing,
                    hasControls: isSelected,
                    hasBorders: isSelected,
                });
                layerRect.lightingEffectLayerId = layer.id;
                layerRect.setCoords();
            } else {
                const rect = createEffectLayerCanvasRect({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    strokeColor,
                    style,
                    layerId: layer.id,
                    interactive: !isDrawing,
                });
                canvas.add(rect);
                layerRectsRef.current.set(layer.id, rect);
            }
        }

        if (
            selectedLayerId != null &&
            !isDrawing &&
            !nextLayerIds.has(selectedLayerId)
        ) {
            useLightDesignerSelectedEffectLayerStore
                .getState()
                .clearSelectedLayer();
        }

        canvas.requestRenderAll();
    }, [
        canvas,
        drawState.status,
        effect,
        fieldProperties,
        isPlaying,
        selectedEffect,
        selectedLayerId,
        workspaceMode,
    ]);
}
