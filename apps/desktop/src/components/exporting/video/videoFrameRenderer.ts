import { FieldProperties } from "@openmarch/core";
import Marcher from "@/global/classes/Marcher";
import type { ResolverFrameSampler } from "@/timeline/timelineExport";
import type { AppearanceStepsByMarcherId } from "@/services/appearance/appearanceSteps";
import type { FieldView } from "@/field/three/fieldView";
import type { OffscreenField } from "@/field/three/offscreenField";
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

/**
 * The view that fits the field into a frame `frameWidth` × `frameHeight` pixels, with
 * `FIELD_MARGIN_PX` field units around it, then applies the user's framing.
 */
export function computeFieldView(
    fieldProperties: FieldProperties,
    frameWidth: number,
    frameHeight: number,
    framing: FieldFraming = DEFAULT_FIELD_FRAMING,
): FieldView {
    const baseScale = Math.min(
        frameWidth / (fieldProperties.width + FIELD_MARGIN_PX * 2),
        frameHeight / (fieldProperties.height + FIELD_MARGIN_PX * 2),
    );
    const zoom = baseScale * framing.scale;
    return {
        width: frameWidth,
        height: frameHeight,
        zoom,
        panX:
            (frameWidth - fieldProperties.width * zoom) / 2 +
            framing.offsetX * frameWidth,
        panY:
            (frameHeight - fieldProperties.height * zoom) / 2 +
            framing.offsetY * frameHeight,
    };
}

/**
 * The beat a frame shows. The last frame is held just short of the show's end, so it shows the
 * last page's appearance and positions.
 */
export function frameBeat(
    frameSampler: ResolverFrameSampler,
    timeSeconds: number,
    durationSeconds: number,
): number {
    const timeMs = Math.min(timeSeconds * 1000, durationSeconds * 1000 - 1);
    return frameSampler.beatAt(timeMs / 1000);
}

/** The new field off screen (#207), and what each frame samples. */
export interface VideoRenderContext {
    field: OffscreenField;
    fieldProperties: FieldProperties;
    /** Positions come from the resolver at each frame's beat */
    frameSampler: ResolverFrameSampler;
    dispose: () => void;
}

export interface CreateVideoRenderContextArgs {
    fieldProperties: FieldProperties;
    marchers: Marcher[];
    /** Samples the resolver for each frame's positions */
    frameSampler: ResolverFrameSampler;
    /** Each marcher's appearance over the show, as the field draws it */
    appearanceSteps: AppearanceStepsByMarcherId | undefined;
    /** The decoded field image, or null when the show has none */
    backgroundImage: ImageBitmap | null;
    /** The first frame's size; a frame of another size resizes the field */
    width: number;
    height: number;
}

/**
 * Starts the new field off screen for the export or its preview. Rejects with
 * `NoWebGLError` when the machine has no WebGL. three.js loads here, on first
 * use, not with the editor (`fieldChunk.test.ts`).
 */
export async function createVideoRenderContext(
    args: CreateVideoRenderContextArgs,
): Promise<VideoRenderContext> {
    const { createOffscreenField } =
        await import("@/field/three/offscreenField");
    const field = await createOffscreenField({
        fieldProperties: args.fieldProperties,
        source: args.frameSampler.source,
        appearanceSteps: args.appearanceSteps,
        labels: new Map(
            args.marchers.map((marcher) => [marcher.id, marcher.drill_number]),
        ),
        image: args.backgroundImage,
        width: args.width,
        height: args.height,
    });
    return {
        field,
        fieldProperties: args.fieldProperties,
        frameSampler: args.frameSampler,
        dispose: () => field.dispose(),
    };
}

export interface RenderVideoFrameArgs {
    ctx: CanvasRenderingContext2D;
    context: VideoRenderContext;
    timeSeconds: number;
    durationSeconds: number;
    width: number;
    height: number;
    /** Device pixels per unit of `ctx` the field is drawn at; 1 by default */
    pixelRatio?: number;
    videoTheme: VideoTheme;
    fieldFraming?: FieldFraming;
    overlayState?: OverlayState;
    overlayOptions?: OverlayOptions;
    overlayPlacement?: OverlayPlacement;
    brandingLogo: HTMLImageElement | null;
}

/**
 * Render one video frame (field + optional overlay + branding) into a 2D context, `width` ×
 * `height` in the context's units. The field is drawn at `pixelRatio` device pixels per unit
 * (the preview's screen; 1 for the export, whose units are the video's pixels).
 */
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
        pixelRatio = 1,
        videoTheme,
        fieldFraming = DEFAULT_FIELD_FRAMING,
        overlayState,
        overlayOptions,
        overlayPlacement,
        brandingLogo,
    } = args;

    const { field, fieldProperties } = context;
    const themeColors = getVideoThemeColors(videoTheme);

    const fieldWidth = Math.round(width * pixelRatio);
    const fieldHeight = Math.round(height * pixelRatio);
    field.setView(
        computeFieldView(
            fieldProperties,
            fieldWidth,
            fieldHeight,
            fieldFraming,
        ),
    );
    field.draw(frameBeat(context.frameSampler, timeSeconds, durationSeconds));

    ctx.fillStyle = themeColors.bg1;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(field.canvas, 0, 0, width, height);

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
