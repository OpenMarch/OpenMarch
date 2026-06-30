import type { LightingEffectLayerRect } from "@/db-functions";
import {
    hex6ToLightingRgba,
    parseEffectArgs,
    rgbaToString,
    type RgbaColor,
} from "@openmarch/core";
import { fabric } from "fabric";

export type EffectLayerCanvasRectStyle = "draft" | "persisted" | "selected";

const FILL_OPACITY: Record<EffectLayerCanvasRectStyle, number> = {
    draft: 0.2,
    persisted: 0.15,
    selected: 0.22,
};

export type LightingEffectLayerCanvasRect = fabric.Rect & {
    isLightingEffectLayer: true;
    lightingEffectLayerId?: number;
};

export function resolveEffectLayerRectColor(
    fallbackShape: RgbaColor,
    effectType?: string,
    effectArgs?: string,
): RgbaColor {
    if (effectType === "solid" && effectArgs != null) {
        const parsed = parseEffectArgs("solid", effectArgs);
        return hex6ToLightingRgba(parsed.color);
    }
    return fallbackShape;
}

export function getEffectLayerRectStyles(
    strokeColor: RgbaColor,
    style: EffectLayerCanvasRectStyle,
) {
    return {
        fill: rgbaToString({ ...strokeColor, a: FILL_OPACITY[style] }),
        stroke: rgbaToString(strokeColor),
        strokeWidth: style === "selected" ? 3 : 2,
    };
}

export function createEffectLayerCanvasRect({
    left,
    top,
    width,
    height,
    strokeColor,
    style,
    layerId,
    interactive = false,
}: LightingEffectLayerRect & {
    strokeColor: RgbaColor;
    style: EffectLayerCanvasRectStyle;
    layerId?: number;
    interactive?: boolean;
}): LightingEffectLayerCanvasRect {
    const isSelected = style === "selected";
    const rect = new fabric.Rect({
        left,
        top,
        width,
        height,
        ...getEffectLayerRectStyles(strokeColor, style),
        selectable: isSelected,
        evented: interactive,
        hasControls: isSelected,
        hasBorders: isSelected,
        lockRotation: true,
        objectCaching: false,
    }) as LightingEffectLayerCanvasRect;
    rect.isLightingEffectLayer = true;
    if (layerId != null) {
        rect.lightingEffectLayerId = layerId;
    }
    return rect;
}

export function isLightingEffectLayerRect(
    obj: fabric.Object,
): obj is LightingEffectLayerCanvasRect {
    return Boolean(
        (obj as { isLightingEffectLayer?: boolean }).isLightingEffectLayer,
    );
}

export function getLightingEffectLayerIdFromRect(
    rect: fabric.Object,
): number | null {
    if (!isLightingEffectLayerRect(rect)) return null;
    return rect.lightingEffectLayerId ?? null;
}
