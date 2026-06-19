import { FieldProperties } from "@openmarch/core";
import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { SectionAppearance } from "@/db-functions";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import {
    getCoordinatesAtTime,
    type MarcherTimeline,
} from "@/utilities/Keyframes";
import { initializeCanvasForRendering } from "../utils/svg-generator";
import {
    drawBranding,
    drawOverlay,
    OverlayOptions,
    OverlayPlacement,
    OverlayRect,
    OverlayState,
} from "./videoOverlay";
import { getVideoThemeColors, type VideoTheme } from "./videoTheme";

export const FIELD_MARGIN_PX = 40;
export const MIN_FIELD_SCALE = 0.5;
export const MAX_FIELD_SCALE = 3;
export const MIN_FIELD_OFFSET = -0.5;
export const MAX_FIELD_OFFSET = 0.5;

/** User-adjustable pan/zoom relative to the auto-fit field viewport. */
export interface FieldFraming {
    /** Multiplier on the auto-fit scale (1 = fit field with margin) */
    scale: number;
    /** Horizontal pan as a fraction of frame width */
    offsetX: number;
    /** Vertical pan as a fraction of frame height */
    offsetY: number;
}

export const DEFAULT_FIELD_FRAMING: FieldFraming = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
};

export function clampFieldFraming(framing: FieldFraming): FieldFraming {
    return {
        scale: Math.min(
            Math.max(framing.scale, MIN_FIELD_SCALE),
            MAX_FIELD_SCALE,
        ),
        offsetX: Math.min(
            Math.max(framing.offsetX, MIN_FIELD_OFFSET),
            MAX_FIELD_OFFSET,
        ),
        offsetY: Math.min(
            Math.max(framing.offsetY, MIN_FIELD_OFFSET),
            MAX_FIELD_OFFSET,
        ),
    };
}

/** Fabric viewport transform that fits the field into the frame. */
export function computeFieldViewport(
    fieldProperties: FieldProperties,
    frameWidth: number,
    frameHeight: number,
    framing: FieldFraming = DEFAULT_FIELD_FRAMING,
): number[] {
    const baseScale = Math.min(
        frameWidth / (fieldProperties.width + FIELD_MARGIN_PX * 2),
        frameHeight / (fieldProperties.height + FIELD_MARGIN_PX * 2),
    );
    const scale = baseScale * framing.scale;
    const tx =
        (frameWidth - fieldProperties.width * scale) / 2 +
        framing.offsetX * frameWidth;
    const ty =
        (frameHeight - fieldProperties.height * scale) / 2 +
        framing.offsetY * frameHeight;
    return [scale, 0, 0, scale, tx, ty];
}

export interface VideoRenderContext {
    canvas: OpenMarchCanvas;
    canvasMarchersById: Record<number, CanvasMarcher>;
    fieldProperties: FieldProperties;
    marcherTimelines: Map<number, MarcherTimeline>;
    dispose: () => void;
}

export interface CreateVideoRenderContextArgs {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marchers: Marcher[];
    marcherTimelines: Map<number, MarcherTimeline>;
    sectionAppearances?: SectionAppearance[];
    backgroundImage?: HTMLImageElement;
    gridLines: boolean;
    halfLines: boolean;
}

export async function createVideoRenderContext(
    args: CreateVideoRenderContextArgs,
): Promise<VideoRenderContext> {
    const initialized = await initializeCanvasForRendering({
        fieldProperties: args.fieldProperties,
        sortedPages: args.sortedPages,
        marchers: args.marchers,
        sectionAppearances: args.sectionAppearances,
        backgroundImage: args.backgroundImage,
        gridLines: args.gridLines,
        halfLines: args.halfLines,
        svgMargin: FIELD_MARGIN_PX,
    });
    return {
        canvas: initialized.canvas,
        canvasMarchersById: initialized.canvasMarchersById,
        fieldProperties: args.fieldProperties,
        marcherTimelines: args.marcherTimelines,
        dispose: () => initialized.canvas.dispose(),
    };
}

function setMarcherPositionsAtTime(
    context: VideoRenderContext,
    timeMilliseconds: number,
) {
    for (const [marcherId, canvasMarcher] of Object.entries(
        context.canvasMarchersById,
    )) {
        const timeline = context.marcherTimelines.get(Number(marcherId));
        if (!timeline) continue;
        const coords = getCoordinatesAtTime(timeMilliseconds, timeline);
        if (coords) canvasMarcher.setLiveCoordinates(coords);
    }
}

export interface RenderVideoFrameArgs {
    ctx: CanvasRenderingContext2D;
    context: VideoRenderContext;
    timeSeconds: number;
    durationSeconds: number;
    width: number;
    height: number;
    videoTheme: VideoTheme;
    fieldFraming?: FieldFraming;
    overlayState?: OverlayState;
    overlayOptions?: OverlayOptions;
    overlayPlacement?: OverlayPlacement;
    brandingLogo: HTMLImageElement | null;
}

/** Render one video frame (field + optional overlay + branding) into a 2D context. */
export function renderVideoFrame(
    args: RenderVideoFrameArgs,
): OverlayRect | null {
    const {
        ctx,
        context,
        timeSeconds,
        durationSeconds,
        width,
        height,
        videoTheme,
        fieldFraming = DEFAULT_FIELD_FRAMING,
        overlayState,
        overlayOptions,
        overlayPlacement,
        brandingLogo,
    } = args;

    const { canvas, fieldProperties } = context;
    const themeColors = getVideoThemeColors(videoTheme);

    canvas.enableRetinaScaling = false;
    canvas.setDimensions({ width, height });
    canvas.viewportTransform = computeFieldViewport(
        fieldProperties,
        width,
        height,
        fieldFraming,
    );
    canvas.backgroundColor = themeColors.bg1;

    const timeMs = Math.min(timeSeconds * 1000, durationSeconds * 1000 - 1);
    setMarcherPositionsAtTime(context, timeMs);

    ctx.fillStyle = themeColors.bg1;
    ctx.fillRect(0, 0, width, height);
    canvas.renderAll();
    ctx.drawImage(canvas.getElement(), 0, 0, width, height);

    let overlayRect: OverlayRect | null = null;
    if (overlayState && overlayOptions && overlayPlacement) {
        overlayRect = drawOverlay(
            ctx,
            overlayState,
            overlayOptions,
            overlayPlacement,
            width,
            height,
            videoTheme,
        );
    }
    drawBranding(ctx, brandingLogo, width, height, videoTheme);
    return overlayRect;
}
