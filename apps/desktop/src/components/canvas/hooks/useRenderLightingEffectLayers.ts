import { lightDesignerFrameRegistry } from "@/components/canvas/lightDesignerFrameRegistry";
import {
    buildLightingSceneTimeWindowsMs,
    findLightingSceneAtShowTime,
    getSceneStartBeatPosition,
} from "@/components/timeline/SceneTimeline.utils";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { compareBeats } from "@/global/classes/Beat";
import {
    fieldPropertiesQueryOptions,
    lightingEffectByIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
} from "@/hooks/queries";
import { useTimingObjects } from "@/hooks";
import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { useLightDesignerSelectedEffectLayerStore } from "@/stores/LightDesignerSelectedEffectLayerStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import {
    createWipeEffectLayerCanvasRect,
    isWipeEffectLayerCanvasRect,
    resolveEffectLayerRectColor,
    type EffectLayerCanvasRectStyle,
    type WipeEffectLayerCanvasRect,
} from "@/utilities/effectLayerCanvasRect";
import { lightingEffectBeatWindowToSceneLocalMs } from "@/utilities/lightingBeatSpans";
import { getCurrentShowTimeMs } from "@/utilities/showTime";
import {
    getLightingEffectProgress,
    parseWipeEffectArgs,
} from "@openmarch/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { fabric } from "fabric";

function applyWipeProgressToRects(
    rects: Iterable<WipeEffectLayerCanvasRect>,
    progress: number,
    directionDegrees: number,
    fillColor: ReturnType<typeof resolveEffectLayerRectColor>,
    styleByLayerId: Map<number, EffectLayerCanvasRectStyle>,
): void {
    for (const rect of rects) {
        const layerId = rect.lightingEffectLayerId;
        const style =
            layerId != null
                ? (styleByLayerId.get(layerId) ?? "persisted")
                : "persisted";
        rect.setWipeState({
            progress,
            directionDegrees,
            fillColor,
            style,
        });
    }
}

export function useRenderLightingEffectLayers({
    canvas,
    isPlaying,
}: {
    canvas: OpenMarchCanvas | null;
    isPlaying: boolean;
}) {
    const { selectedPage } = useSelectedPage()!;
    const { pages, beats } = useTimingObjects()!;
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
        enabled: effectId != null,
    });
    const { data: sceneData } = useQuery({
        ...lightingSceneDataByIdQueryOptions(selectedEffect?.sceneId ?? -1),
        enabled: selectedEffect?.sceneId != null,
    });

    const layerRectsRef = useRef<Map<number, fabric.Rect>>(new Map());
    const lastProgressKeyRef = useRef<number | null>(null);
    const wipeArgsRef = useRef({
        directionDegrees: 0,
        fillColor: { r: 0, g: 0, b: 0, a: 1 },
    });

    const beatsSorted = useMemo(() => [...beats].sort(compareBeats), [beats]);

    const sceneWindows = useMemo(
        () =>
            sceneData != null
                ? buildLightingSceneTimeWindowsMs(pages, [sceneData])
                : [],
        [pages, sceneData],
    );

    const sceneStartBeatPosition = useMemo(() => {
        if (sceneData == null) return null;
        return getSceneStartBeatPosition(sceneData, pages);
    }, [sceneData, pages]);

    const effectWindowMs = useMemo(() => {
        if (effect == null || sceneStartBeatPosition == null) {
            return { startMs: 0, durationMs: 0 };
        }
        return lightingEffectBeatWindowToSceneLocalMs(
            beatsSorted,
            sceneStartBeatPosition,
            effect.start_offset_beats,
            effect.duration_beats,
        );
    }, [beatsSorted, effect, sceneStartBeatPosition]);

    const computeWipeProgress = useCallback(
        (tShowMs: number): number => {
            if (
                selectedEffect == null ||
                effect == null ||
                effect.type !== "wipe"
            ) {
                return 0;
            }

            const activeScene = findLightingSceneAtShowTime(
                sceneWindows,
                tShowMs,
            );
            if (
                activeScene == null ||
                activeScene.sceneId !== selectedEffect.sceneId
            ) {
                return 0;
            }

            return getLightingEffectProgress(activeScene.tSceneMs, {
                startMs: effectWindowMs.startMs,
                durationMs: effectWindowMs.durationMs,
            });
        },
        [effect, effectWindowMs, sceneWindows, selectedEffect],
    );

    const applyWipeProgressAtShowTime = useCallback(
        (tShowMs: number, requestCanvasRender: boolean) => {
            if (!canvas || effect?.type !== "wipe") return;

            const progress = computeWipeProgress(tShowMs);
            const progressKey = Math.round(progress * 1000);
            if (lastProgressKeyRef.current === progressKey) return;
            lastProgressKeyRef.current = progressKey;

            const wipeRects = [...layerRectsRef.current.values()].filter(
                isWipeEffectLayerCanvasRect,
            );
            if (wipeRects.length === 0) return;

            const styleByLayerId = new Map<
                number,
                EffectLayerCanvasRectStyle
            >();
            const isDrawing = drawState.status === "drawing";
            for (const rect of wipeRects) {
                const layerId = rect.lightingEffectLayerId;
                if (layerId == null) continue;
                styleByLayerId.set(
                    layerId,
                    !isDrawing && selectedLayerId === layerId
                        ? "selected"
                        : "persisted",
                );
            }

            const { directionDegrees, fillColor } = wipeArgsRef.current;
            applyWipeProgressToRects(
                wipeRects,
                progress,
                directionDegrees,
                fillColor,
                styleByLayerId,
            );

            if (requestCanvasRender) canvas.requestRenderAll();
        },
        [
            canvas,
            computeWipeProgress,
            drawState.status,
            effect?.type,
            selectedLayerId,
        ],
    );

    useEffect(() => {
        if (!canvas) return;

        const removeAllLayerRects = () => {
            for (const rect of layerRectsRef.current.values()) {
                canvas.remove(rect);
            }
            layerRectsRef.current.clear();
            lastProgressKeyRef.current = null;
        };

        const shouldShow =
            workspaceMode === "lightDesigner" &&
            effect != null &&
            selectedEffect != null &&
            effect.id === selectedEffect.effectId &&
            effect.type === "wipe" &&
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
        const wipeArgs = parseWipeEffectArgs(effect.args);
        wipeArgsRef.current = {
            directionDegrees: wipeArgs.directionDegrees,
            fillColor: strokeColor,
        };

        const initialProgress = computeWipeProgress(
            getCurrentShowTimeMs(isPlaying, selectedPage),
        );
        lastProgressKeyRef.current = null;

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
            const existing = layerRectsRef.current.get(layer.id);

            if (
                existing &&
                activeObject === existing &&
                isTransforming &&
                isSelected
            ) {
                continue;
            }

            if (existing && isWipeEffectLayerCanvasRect(existing)) {
                existing.set({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    scaleX: 1,
                    scaleY: 1,
                    selectable: isSelected,
                    evented: !isDrawing,
                    hasControls: isSelected,
                    hasBorders: isSelected,
                });
                existing.lightingEffectLayerId = layer.id;
                existing.setWipeState({
                    progress: initialProgress,
                    directionDegrees: wipeArgs.directionDegrees,
                    fillColor: strokeColor,
                    style,
                });
                existing.setCoords();
            } else {
                if (existing) {
                    canvas.remove(existing);
                }
                const rect = createWipeEffectLayerCanvasRect({
                    left: layer.left,
                    top: layer.top,
                    width: layer.width,
                    height: layer.height,
                    strokeColor,
                    style,
                    layerId: layer.id,
                    interactive: !isDrawing,
                    wipeProgress: initialProgress,
                    wipeDirectionDegrees: wipeArgs.directionDegrees,
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
        computeWipeProgress,
        drawState.status,
        effect,
        fieldProperties,
        isPlaying,
        selectedEffect,
        selectedLayerId,
        selectedPage,
        workspaceMode,
    ]);

    useEffect(() => {
        if (isPlaying) return;
        applyWipeProgressAtShowTime(
            getCurrentShowTimeMs(false, selectedPage),
            true,
        );
    }, [
        applyWipeProgressAtShowTime,
        isPlaying,
        selectedPage,
        effect?.args,
        effectWindowMs,
        sceneWindows,
    ]);

    useEffect(() => {
        if (effect?.type !== "wipe") return;
        return lightDesignerFrameRegistry.subscribe((tShowMs) => {
            applyWipeProgressAtShowTime(tShowMs, false);
        });
    }, [applyWipeProgressAtShowTime, effect?.type]);
}
