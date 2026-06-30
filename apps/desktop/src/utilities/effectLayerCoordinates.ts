import type { LightingEffectLayerRect } from "@/db-functions";

export const MIN_EFFECT_LAYER_DRAFT_PX = 4;

export function normalizeCanvasRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): LightingEffectLayerRect {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    return {
        left,
        top,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
    };
}

export function clampEffectLayerRectToField(
    rect: LightingEffectLayerRect,
    fieldWidth: number,
    fieldHeight: number,
): LightingEffectLayerRect {
    const left = Math.max(0, Math.min(rect.left, fieldWidth));
    const top = Math.max(0, Math.min(rect.top, fieldHeight));
    const width = Math.max(0, Math.min(rect.width, fieldWidth - left));
    const height = Math.max(0, Math.min(rect.height, fieldHeight - top));
    return { left, top, width, height };
}

export function isEffectLayerRectLargeEnough(
    rect: LightingEffectLayerRect,
    minSizePx = MIN_EFFECT_LAYER_DRAFT_PX,
): boolean {
    return rect.width >= minSizePx && rect.height >= minSizePx;
}
