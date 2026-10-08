import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    type RefObject,
} from "react";
import {
    beatToX,
    canvasWindowCovers,
    clamp,
    getBeatsInSpan,
    getCanvasWindow,
    type TimelineSpan,
} from "./TimelineGeometry";
import type { TimelineMarker, TimelineWaveform } from "./TimelineViewModel";

/*
 * The timeline's canvases are layers as wide as the show, but each draws only a window of it: what
 * the scroller shows, plus some overscan either side. A whole-show canvas at a deep zoom is tens of
 * megabytes, is reallocated on every zoom step, and past the browser's largest canvas (65,535
 * device pixels a side in Chromium) draws nothing at all.
 *
 * - The window moves, and the canvas redraws, only when a scroll comes within half the overscan
 *   of its edge.
 * - A change of zoom, size, data, theme or device pixel ratio redraws once, in a microtask
 *   queued from the layout effect: after the whole commit (and the zoom's own scroll fix-up) and
 *   before the browser paints, so a zoom never shows a stale or stretched frame and draws once.
 * - Colors are read once per theme, not on every draw.
 */

/** Bumped when the document's theme class changes, so each canvas reads its colors again */
let themeVersion = 0;
const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;
const subscribeToTheme = (listener: () => void) => {
    themeListeners.add(listener);
    if (
        !themeObserver &&
        typeof MutationObserver !== "undefined" &&
        typeof document !== "undefined"
    ) {
        themeObserver = new MutationObserver(() => {
            themeVersion++;
            for (const notify of themeListeners) notify();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
        });
    }
    return () => {
        themeListeners.delete(listener);
        if (themeListeners.size > 0) return;
        themeObserver?.disconnect();
        themeObserver = null;
    };
};

/**
 * Calls the listeners when the device pixel ratio changes (the window moves to a screen with
 * another scale), so each canvas redraws at the new resolution. A `resolution` media query matches
 * only one ratio, so it is watched again at the new ratio after each change.
 */
const ratioListeners = new Set<() => void>();
let stopWatchingRatio: (() => void) | null = null;
const watchRatio = () => {
    if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
    )
        return;
    const query = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
    );
    const onChange = () => {
        stopWatchingRatio?.();
        stopWatchingRatio = null;
        if (ratioListeners.size > 0) watchRatio();
        for (const notify of ratioListeners) notify();
    };
    query.addEventListener("change", onChange);
    stopWatchingRatio = () => query.removeEventListener("change", onChange);
};
const subscribeToPixelRatio = (listener: () => void) => {
    ratioListeners.add(listener);
    if (!stopWatchingRatio) watchRatio();
    return () => {
        ratioListeners.delete(listener);
        if (ratioListeners.size > 0) return;
        stopWatchingRatio?.();
        stopWatchingRatio = null;
    };
};

type ReadColor = (property: string, fallback: string) => string;

/**
 * Reads theme colors from the canvas's computed style, once per theme: again when the document's
 * theme changes, or the canvas moves in or out of a `.dark` subtree (stories theme a wrapper).
 */
const useThemeColors = (canvasRef: RefObject<HTMLCanvasElement | null>) => {
    const cache = useRef<{ key: string; values: Map<string, string> }>({
        key: "",
        values: new Map(),
    });
    return useCallback<ReadColor>(
        (property, fallback) => {
            const canvas = canvasRef.current;
            if (!canvas) return fallback;
            const key = `${themeVersion}:${canvas.closest(".dark") ? "dark" : "light"}`;
            if (cache.current.key !== key)
                cache.current = { key, values: new Map() };
            let value = cache.current.values.get(property);
            if (value === undefined) {
                value = getComputedStyle(canvas)
                    .getPropertyValue(property)
                    .trim();
                cache.current.values.set(property, value);
            }
            return value || fallback;
        },
        [canvasRef],
    );
};

/**
 * Sizes and places the canvas on `span` of its layer and returns a context that draws in layer
 * coordinates (CSS pixels from the layer's left edge), cleared.
 */
const prepareCanvas = (
    canvas: HTMLCanvasElement,
    span: TimelineSpan,
    height: number,
) => {
    const left = `${span.left}px`;
    const width = `${span.width}px`;
    const cssHeight = `${height}px`;
    if (canvas.style.left !== left) canvas.style.left = left;
    if (canvas.style.width !== width) canvas.style.width = width;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(0, Math.round(span.width * dpr));
    const pixelHeight = Math.max(0, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (pixelWidth === 0 || pixelHeight === 0) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.setTransform(dpr, 0, 0, dpr, -span.left * dpr, 0);
    context.globalAlpha = 1;
    return context;
};

/** Overscan either side of the viewport: half a viewport, so a redraw comes every half screen */
const overscanFor = (visibleWidth: number) =>
    Math.max(128, Math.round(visibleWidth / 2));

type PaintCanvas = (
    context: CanvasRenderingContext2D,
    span: TimelineSpan,
    color: ReadColor,
) => void;

/**
 * Draws `paint` on a viewport-sized window of a layer `width` wide whose left edge is `layerLeft`
 * pixels into the scroller's content. Without a scroller the whole layer is drawn.
 */
const useViewportCanvas = ({
    canvasRef,
    viewportRef,
    layerLeft = 0,
    width,
    height,
    paint,
}: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    viewportRef?: RefObject<HTMLElement | null>;
    layerLeft?: number;
    width: number;
    height: number;
    paint: PaintCanvas;
}) => {
    const color = useThemeColors(canvasRef);
    const latest = useRef({ viewportRef, layerLeft, width, height, paint });
    latest.current = { viewportRef, layerLeft, width, height, paint };
    const drawn = useRef<TimelineSpan | null>(null);
    /** The viewport width the last draw sized its window for */
    const drawnForWidth = useRef<number | null>(null);
    const queued = useRef(false);

    /** Draws the window around the viewport; unless `force`, only if the viewport nears its edge */
    const draw = useCallback(
        (force: boolean) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const { viewportRef, layerLeft, width, height, paint } =
                latest.current;
            const viewport = viewportRef?.current;
            const visible = {
                layerWidth: width,
                visibleLeft: viewport ? viewport.scrollLeft - layerLeft : 0,
                visibleWidth: viewport ? viewport.clientWidth : width,
            };
            const overscan = overscanFor(visible.visibleWidth);
            // Redrawn once the view comes within half the overscan of an edge, not once it has
            // left the window: a scroll set in an animation frame only reports itself in the
            // next frame, and a scrollbar drag can run ahead of the main thread
            if (
                !force &&
                drawn.current &&
                canvasWindowCovers(drawn.current, visible, overscan / 2)
            )
                return;
            const span = getCanvasWindow({ ...visible, overscan });
            drawn.current = span;
            drawnForWidth.current = visible.visibleWidth;
            const context = prepareCanvas(canvas, span, height);
            if (context) paint(context, span, color);
        },
        [canvasRef, color],
    );

    const invalidate = useCallback(() => {
        if (queued.current) return;
        queued.current = true;
        queueMicrotask(() => {
            queued.current = false;
            draw(true);
        });
    }, [draw]);

    useLayoutEffect(
        () => invalidate(),
        [invalidate, layerLeft, width, height, paint],
    );

    useEffect(() => subscribeToTheme(invalidate), [invalidate]);
    useEffect(() => subscribeToPixelRatio(invalidate), [invalidate]);

    // One listener and one observer for the canvas's life; they call the latest draw
    useEffect(() => {
        const viewport = viewportRef?.current;
        if (!viewport) return;
        // Scroll events come once a frame, before its animation frames and paint
        const onScroll = () => draw(false);
        viewport.addEventListener("scroll", onScroll, { passive: true });
        let observer: ResizeObserver | undefined;
        if (typeof ResizeObserver !== "undefined") {
            // Against the width the last draw used, not the width now: the first draw comes
            // before this effect, and the layout can settle in between
            observer = new ResizeObserver(() => {
                if (viewport.clientWidth === drawnForWidth.current) return;
                invalidate();
            });
            observer.observe(viewport);
        }
        return () => {
            viewport.removeEventListener("scroll", onScroll);
            observer?.disconnect();
        };
    }, [draw, invalidate, viewportRef]);
};

interface TimelineCanvasLayerProps {
    /** The layer's full width: the whole show */
    width: number;
    height: number;
    pixelsPerBeat: number;
    /** The timeline's scroller; the canvas draws only what it shows, plus overscan */
    viewportRef?: RefObject<HTMLElement | null>;
    /** How far into the scroller's content the layer's left edge is */
    layerLeft?: number;
}

interface TimelineGridCanvasProps extends TimelineCanvasLayerProps {
    measures: readonly TimelineMarker[];
    lineTop?: number;
    showMeasureLines?: boolean;
    showBeatTicks?: boolean;
    topTickY?: number;
    /** Where the lower row of beat ticks ends; `null` for none */
    bottomTickY?: number | null;
}

export const TimelineGridCanvas = memo(function TimelineGridCanvas({
    width,
    height,
    pixelsPerBeat,
    viewportRef,
    layerLeft,
    measures,
    lineTop = 0,
    showMeasureLines = true,
    showBeatTicks = true,
    topTickY = lineTop,
    bottomTickY = height - 1,
}: TimelineGridCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const paint = useCallback<PaintCanvas>(
        (context, span, color) => {
            const spanEnd = span.left + span.width;
            context.lineWidth = 1;
            if (showMeasureLines) {
                context.strokeStyle = color(
                    "--color-stroke",
                    "rgba(255, 255, 255, 0.06)",
                );
                context.beginPath();
                for (const measure of measures) {
                    const x = Math.round(
                        beatToX(measure.atBeat, pixelsPerBeat),
                    );
                    if (x < 0 || x > width || x + 1 < span.left || x > spanEnd)
                        continue;
                    context.moveTo(x + 0.5, lineTop);
                    context.lineTo(x + 0.5, height);
                }
                context.stroke();
            }

            if (!showBeatTicks) return;
            context.strokeStyle = color("--color-text", "rgb(208, 208, 208)");
            context.globalAlpha = 0.22;
            const beats = getBeatsInSpan(
                span,
                pixelsPerBeat,
                Math.floor(width / pixelsPerBeat),
            );
            context.beginPath();
            for (let beat = beats.first; beat <= beats.last; beat++) {
                const x = Math.round(beatToX(beat, pixelsPerBeat));
                context.moveTo(x + 0.5, topTickY);
                context.lineTo(x + 0.5, topTickY + 4);
                if (bottomTickY !== null) {
                    context.moveTo(x + 0.5, bottomTickY - 4);
                    context.lineTo(x + 0.5, bottomTickY);
                }
            }
            context.stroke();
            context.globalAlpha = 1;
        },
        [
            bottomTickY,
            height,
            lineTop,
            measures,
            pixelsPerBeat,
            showBeatTicks,
            showMeasureLines,
            topTickY,
            width,
        ],
    );

    useViewportCanvas({
        canvasRef,
        viewportRef,
        layerLeft,
        width,
        height,
        paint,
    });

    return (
        <canvas
            ref={canvasRef}
            data-testid="timeline-grid-canvas"
            aria-hidden="true"
            className="pointer-events-none absolute top-0"
        />
    );
});

interface TimelineWaveformCanvasProps extends TimelineCanvasLayerProps {
    waveform: TimelineWaveform;
    /** Which color the bars are drawn in: the played part is the accent (UI-12) */
    tone: "played" | "rest";
}

/**
 * The waveform as filled bars, a slice of a beat each, centered on a baseline that runs only as
 * far as the audio does. Drawn in one tone; the timeline lays the played tone over the rest and
 * clips it at the playhead, so playing never redraws the canvas.
 */
export const TimelineWaveformCanvas = memo(function TimelineWaveformCanvas({
    waveform,
    width,
    height,
    pixelsPerBeat,
    viewportRef,
    layerLeft,
    tone,
}: TimelineWaveformCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    /** The beat the audio ends on: the baseline runs to it */
    const audioEnd = useMemo(() => {
        for (let beat = waveform.peaksByBeat.length - 1; beat >= 0; beat--)
            if (waveform.peaksByBeat[beat]!.length > 0) return beat + 1;
        return 0;
    }, [waveform]);

    const paint = useCallback<PaintCanvas>(
        (context, span, color) => {
            const spanEnd = span.left + span.width;
            context.fillStyle =
                tone === "played"
                    ? color("--color-accent", "#967eff")
                    : color(
                          "--color-text-subtitle",
                          "rgba(208, 208, 208, 0.6)",
                      );
            const centerY = height / 2;
            const firstBeat = Math.max(
                0,
                Math.floor(span.left / pixelsPerBeat),
            );
            const lastBeat = Math.min(
                waveform.peaksByBeat.length,
                Math.ceil(width / pixelsPerBeat),
                Math.ceil(spanEnd / pixelsPerBeat),
            );

            context.globalAlpha = 0.25;
            context.fillRect(
                0,
                Math.round(centerY),
                Math.max(0, beatToX(audioEnd, pixelsPerBeat)),
                1,
            );
            context.globalAlpha = 1;
            for (let beat = firstBeat; beat < lastBeat; beat++) {
                const peaks = waveform.peaksByBeat[beat];
                if (!peaks || peaks.length === 0) continue;
                const beatX = beatToX(beat, pixelsPerBeat);
                const sampleWidth = pixelsPerBeat / peaks.length;
                // A gap between bars only once they're wide enough; narrower, they read as one shape
                const barWidth =
                    sampleWidth >= 3
                        ? sampleWidth - 1
                        : Math.max(1, sampleWidth);
                for (let index = 0; index < peaks.length; index++) {
                    const x = beatX + index * sampleWidth;
                    if (x + barWidth < 0 || x > width) continue;
                    if (x + barWidth < span.left || x > spanEnd) continue;
                    const magnitude = Math.max(
                        0.5,
                        clamp(Math.abs(peaks[index]!), 0, 1) * (height / 2 - 1),
                    );
                    context.fillRect(
                        x,
                        centerY - magnitude,
                        barWidth,
                        magnitude * 2,
                    );
                }
            }
        },
        [audioEnd, height, pixelsPerBeat, tone, waveform, width],
    );

    useViewportCanvas({
        canvasRef,
        viewportRef,
        layerLeft,
        width,
        height,
        paint,
    });

    return (
        <canvas
            ref={canvasRef}
            data-testid={
                tone === "rest"
                    ? "timeline-waveform-canvas"
                    : "timeline-waveform-played"
            }
            role={tone === "rest" ? "img" : undefined}
            aria-label={tone === "rest" ? "Audio waveform" : undefined}
            aria-hidden={tone === "played" || undefined}
            className="absolute top-0"
        />
    );
});
