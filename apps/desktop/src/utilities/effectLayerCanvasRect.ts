import type { LightingEffectLayerRect } from "@/db-functions";
import {
    getWipeRevealPolygonLocal,
    hex6ToLightingRgba,
    parseEffectArgs,
    parseWipeEffectArgs,
    rgbaToString,
    type RgbaColor,
    type WipeRevealPoint,
} from "@openmarch/core";
import { fabric } from "fabric";

export type EffectLayerCanvasRectStyle = "draft" | "persisted" | "selected";

const FILL_OPACITY: Record<EffectLayerCanvasRectStyle, number> = {
    draft: 0.2,
    persisted: 0.15,
    selected: 0.22,
};

const WIPE_FILL_OPACITY: Record<EffectLayerCanvasRectStyle, number> = {
    draft: 0.35,
    persisted: 0.35,
    selected: 0.4,
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
    if (effectArgs == null) return fallbackShape;

    if (effectType === "solid") {
        const parsed = parseEffectArgs("solid", effectArgs);
        return hex6ToLightingRgba(parsed.color);
    }

    if (effectType === "wipe") {
        const parsed = parseWipeEffectArgs(effectArgs);
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

export function getWipeFillOpacity(style: EffectLayerCanvasRectStyle): number {
    return WIPE_FILL_OPACITY[style];
}

function polygonCacheKey(
    width: number,
    height: number,
    progress: number,
    directionDegrees: number,
): string {
    return `${width}|${height}|${Math.round(progress * 1000)}|${directionDegrees}`;
}

export class WipeEffectLayerCanvasRect extends fabric.Rect {
    isLightingEffectLayer = true as const;
    lightingEffectLayerId?: number;
    wipeProgress = 0;
    wipeDirectionDegrees = 0;
    wipeFillColor: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
    rectStyle: EffectLayerCanvasRectStyle = "persisted";

    private cachedPolygonKey = "";
    private cachedPolygon: WipeRevealPoint[] = [];

    constructor(
        options: fabric.IRectOptions & {
            layerId?: number;
            wipeProgress?: number;
            wipeDirectionDegrees?: number;
            wipeFillColor?: RgbaColor;
            rectStyle?: EffectLayerCanvasRectStyle;
        },
    ) {
        const {
            layerId,
            wipeProgress = 0,
            wipeDirectionDegrees = 0,
            wipeFillColor = { r: 0, g: 0, b: 0, a: 1 },
            rectStyle = "persisted",
            ...rectOptions
        } = options;

        super({
            ...rectOptions,
            fill: "transparent",
            stroke: "transparent",
            objectCaching: false,
            lockRotation: true,
        });

        this.wipeProgress = wipeProgress;
        this.wipeDirectionDegrees = wipeDirectionDegrees;
        this.wipeFillColor = wipeFillColor;
        this.rectStyle = rectStyle;
        if (layerId != null) {
            this.lightingEffectLayerId = layerId;
        }
    }

    setWipeState({
        progress,
        directionDegrees,
        fillColor,
        style,
    }: {
        progress: number;
        directionDegrees: number;
        fillColor: RgbaColor;
        style: EffectLayerCanvasRectStyle;
    }): void {
        const progressKey = Math.round(progress * 1000);
        const nextKey = `${this.width ?? 0}|${this.height ?? 0}|${progressKey}|${directionDegrees}|${style}|${fillColor.r},${fillColor.g},${fillColor.b}`;

        if (
            this.wipeProgress === progress &&
            this.wipeDirectionDegrees === directionDegrees &&
            this.rectStyle === style &&
            this.wipeFillColor.r === fillColor.r &&
            this.wipeFillColor.g === fillColor.g &&
            this.wipeFillColor.b === fillColor.b &&
            this.cachedPolygonKey.startsWith(
                `${this.width ?? 0}|${this.height ?? 0}|${progressKey}|${directionDegrees}`,
            )
        ) {
            return;
        }

        this.wipeProgress = progress;
        this.wipeDirectionDegrees = directionDegrees;
        this.wipeFillColor = fillColor;
        this.rectStyle = style;
        this.cachedPolygonKey = nextKey;
        this.cachedPolygon = getWipeRevealPolygonLocal(
            this.width ?? 0,
            this.height ?? 0,
            progress,
            directionDegrees,
        );
        this.dirty = true;
    }

    private getRevealPolygon(): WipeRevealPoint[] {
        const width = this.width ?? 0;
        const height = this.height ?? 0;
        const key = polygonCacheKey(
            width,
            height,
            this.wipeProgress,
            this.wipeDirectionDegrees,
        );
        if (this.cachedPolygonKey !== key) {
            this.cachedPolygonKey = key;
            this.cachedPolygon = getWipeRevealPolygonLocal(
                width,
                height,
                this.wipeProgress,
                this.wipeDirectionDegrees,
            );
        }
        return this.cachedPolygon;
    }

    _render(ctx: CanvasRenderingContext2D): void {
        const width = this.width ?? 0;
        const height = this.height ?? 0;
        if (width <= 0 || height <= 0) return;

        const offsetX = -width / 2;
        const offsetY = -height / 2;
        const baseFill = rgbaToString({
            ...this.wipeFillColor,
            a: FILL_OPACITY[this.rectStyle],
        });
        const wipeFill = rgbaToString({
            ...this.wipeFillColor,
            a: WIPE_FILL_OPACITY[this.rectStyle],
        });
        const stroke = rgbaToString(this.wipeFillColor);
        const strokeWidth = this.rectStyle === "selected" ? 3 : 2;

        ctx.fillStyle = baseFill;
        ctx.fillRect(offsetX, offsetY, width, height);

        const polygon = this.getRevealPolygon();
        if (polygon.length >= 3) {
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i < polygon.length; i++) {
                const point = polygon[i]!;
                const px = offsetX + point.x;
                const py = offsetY + point.y;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.clip();
            ctx.fillStyle = wipeFill;
            ctx.fillRect(offsetX, offsetY, width, height);
            ctx.restore();
        }

        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(offsetX, offsetY, width, height);
    }
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

export function createWipeEffectLayerCanvasRect({
    left,
    top,
    width,
    height,
    strokeColor,
    style,
    layerId,
    interactive = false,
    wipeProgress = 0,
    wipeDirectionDegrees = 0,
}: LightingEffectLayerRect & {
    strokeColor: RgbaColor;
    style: EffectLayerCanvasRectStyle;
    layerId?: number;
    interactive?: boolean;
    wipeProgress?: number;
    wipeDirectionDegrees?: number;
}): WipeEffectLayerCanvasRect {
    const isSelected = style === "selected";
    const rect = new WipeEffectLayerCanvasRect({
        left,
        top,
        width,
        height,
        layerId,
        wipeProgress,
        wipeDirectionDegrees,
        wipeFillColor: strokeColor,
        rectStyle: style,
        selectable: isSelected,
        evented: interactive,
        hasControls: isSelected,
        hasBorders: isSelected,
    });
    rect.setWipeState({
        progress: wipeProgress,
        directionDegrees: wipeDirectionDegrees,
        fillColor: strokeColor,
        style,
    });
    return rect;
}

export function isLightingEffectLayerRect(
    obj: fabric.Object,
): obj is LightingEffectLayerCanvasRect {
    return Boolean(
        (obj as { isLightingEffectLayer?: boolean }).isLightingEffectLayer,
    );
}

export function isWipeEffectLayerCanvasRect(
    obj: fabric.Object,
): obj is WipeEffectLayerCanvasRect {
    return (
        isLightingEffectLayerRect(obj) &&
        obj instanceof WipeEffectLayerCanvasRect
    );
}

export function getLightingEffectLayerIdFromRect(
    rect: fabric.Object,
): number | null {
    if (!isLightingEffectLayerRect(rect)) return null;
    return rect.lightingEffectLayerId ?? null;
}
