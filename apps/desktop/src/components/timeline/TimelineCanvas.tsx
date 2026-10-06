import { memo, useCallback, useEffect, useRef } from "react";
import { beatToX, clamp } from "./TimelineGeometry";
import type { TimelineMarker, TimelineWaveform } from "./TimelineViewModel";

const colorFromTheme = (
    canvas: HTMLCanvasElement,
    property: string,
    fallback: string,
) => getComputedStyle(canvas).getPropertyValue(property).trim() || fallback;

const prepareCanvas = (
    canvas: HTMLCanvasElement,
    fallbackWidth: number,
    fallbackHeight: number,
) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const width = canvas.clientWidth || fallbackWidth;
    const height = canvas.clientHeight || fallbackHeight;
    if (width <= 0 || height <= 0) return null;

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
};

const useCanvasDraw = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    draw: () => void,
) => {
    useEffect(() => {
        draw();
        const canvas = canvasRef.current;
        if (!canvas || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [canvasRef, draw]);
};

interface TimelineGridCanvasProps {
    width: number;
    height: number;
    pixelsPerBeat: number;
    startBeat?: number;
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
    startBeat = 0,
    measures,
    lineTop = 0,
    showMeasureLines = true,
    showBeatTicks = true,
    topTickY = lineTop,
    bottomTickY = height - 1,
}: TimelineGridCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const prepared = prepareCanvas(canvas, width, height);
        if (!prepared) return;
        const { context } = prepared;
        const stroke = colorFromTheme(
            canvas,
            "--color-stroke",
            "rgba(255, 255, 255, 0.06)",
        );
        const text = colorFromTheme(
            canvas,
            "--color-text",
            "rgb(208, 208, 208)",
        );

        context.lineWidth = 1;
        if (showMeasureLines) {
            context.strokeStyle = stroke;
            for (const measure of measures) {
                const x = Math.round(
                    beatToX(measure.atBeat, pixelsPerBeat, startBeat),
                );
                if (x < 0 || x > width) continue;
                context.beginPath();
                context.moveTo(x + 0.5, lineTop);
                context.lineTo(x + 0.5, height);
                context.stroke();
            }
        }

        if (!showBeatTicks) {
            context.globalAlpha = 1;
            return;
        }
        context.strokeStyle = text;
        context.globalAlpha = 0.22;
        const firstBeat = Math.ceil(startBeat);
        const lastBeat = Math.floor(startBeat + width / pixelsPerBeat);
        for (let beat = firstBeat; beat <= lastBeat; beat++) {
            const x = Math.round(beatToX(beat, pixelsPerBeat, startBeat));
            context.beginPath();
            context.moveTo(x + 0.5, topTickY);
            context.lineTo(x + 0.5, topTickY + 4);
            if (bottomTickY !== null) {
                context.moveTo(x + 0.5, bottomTickY - 4);
                context.lineTo(x + 0.5, bottomTickY);
            }
            context.stroke();
        }
        context.globalAlpha = 1;
    }, [
        bottomTickY,
        height,
        lineTop,
        measures,
        pixelsPerBeat,
        showBeatTicks,
        showMeasureLines,
        startBeat,
        topTickY,
        width,
    ]);

    useCanvasDraw(canvasRef, draw);

    return (
        <canvas
            ref={canvasRef}
            data-testid="timeline-grid-canvas"
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0"
            style={{ width, height }}
        />
    );
});

interface TimelineWaveformCanvasProps {
    waveform: TimelineWaveform;
    width: number;
    height: number;
    pixelsPerBeat: number;
    /** Which color the bars are drawn in: the played part is the accent (UI-12) */
    tone: "played" | "rest";
    startBeat?: number;
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
    tone,
    startBeat = 0,
}: TimelineWaveformCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const prepared = prepareCanvas(canvas, width, height);
        if (!prepared) return;
        const { context } = prepared;
        const color =
            tone === "played"
                ? colorFromTheme(canvas, "--color-accent", "#967eff")
                : colorFromTheme(
                      canvas,
                      "--color-text-subtitle",
                      "rgba(208, 208, 208, 0.6)",
                  );
        const centerY = height / 2;
        const firstBeat = Math.max(0, Math.floor(startBeat));
        const endBeat = startBeat + width / pixelsPerBeat;
        const lastBeat = Math.min(
            waveform.peaksByBeat.length,
            Math.ceil(endBeat),
        );
        let audioEnd = 0;
        for (let beat = waveform.peaksByBeat.length - 1; beat >= 0; beat--)
            if (waveform.peaksByBeat[beat]!.length > 0) {
                audioEnd = beat + 1;
                break;
            }

        context.fillStyle = color;
        context.globalAlpha = 0.25;
        context.fillRect(
            0,
            Math.round(centerY),
            Math.max(0, beatToX(audioEnd, pixelsPerBeat, startBeat)),
            1,
        );
        context.globalAlpha = 1;
        for (let beat = firstBeat; beat < lastBeat; beat++) {
            const peaks = waveform.peaksByBeat[beat];
            if (!peaks || peaks.length === 0) continue;
            const beatX = beatToX(beat, pixelsPerBeat, startBeat);
            const sampleWidth = pixelsPerBeat / peaks.length;
            // A gap between bars only once they're wide enough; narrower, they read as one shape
            const barWidth =
                sampleWidth >= 3 ? sampleWidth - 1 : Math.max(1, sampleWidth);
            for (let index = 0; index < peaks.length; index++) {
                const x = beatX + index * sampleWidth;
                if (x + barWidth < 0 || x > width) continue;
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
    }, [height, pixelsPerBeat, startBeat, tone, waveform, width]);

    useCanvasDraw(canvasRef, draw);

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
            className="block"
            style={{ width, height }}
        />
    );
});
