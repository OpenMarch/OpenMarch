import { memo, useCallback, useEffect, useRef } from "react";
import { beatToX, clamp } from "./TimelineGeometry";
import type {
    BeatPosition,
    TimelineMarker,
    TimelineWaveform,
} from "./TimelineViewModel";

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
    bottomTickY?: number;
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
            context.moveTo(x + 0.5, bottomTickY - 4);
            context.lineTo(x + 0.5, bottomTickY);
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
    positionBeat: BeatPosition;
    startBeat?: number;
}

export const TimelineWaveformCanvas = memo(function TimelineWaveformCanvas({
    waveform,
    width,
    height,
    pixelsPerBeat,
    positionBeat,
    startBeat = 0,
}: TimelineWaveformCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const prepared = prepareCanvas(canvas, width, height);
        if (!prepared) return;
        const { context } = prepared;
        const accent = colorFromTheme(canvas, "--color-accent", "#967eff");
        const inactive = colorFromTheme(
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

        context.lineWidth = 1;
        context.strokeStyle = inactive;
        context.globalAlpha = 0.2;
        context.beginPath();
        context.moveTo(0, Math.round(centerY) + 0.5);
        context.lineTo(width, Math.round(centerY) + 0.5);
        context.stroke();
        context.globalAlpha = 1;
        for (let beat = firstBeat; beat < lastBeat; beat++) {
            const peaks = waveform.peaksByBeat[beat];
            if (!peaks || peaks.length === 0) continue;
            const beatX = beatToX(beat, pixelsPerBeat, startBeat);
            const sampleWidth = pixelsPerBeat / peaks.length;
            for (let index = 0; index < peaks.length; index++) {
                const sampleBeat = beat + (index + 0.5) / peaks.length;
                const x = beatX + (index + 0.5) * sampleWidth;
                if (x < 0 || x > width) continue;
                const magnitude =
                    clamp(Math.abs(peaks[index]), 0, 1) * (height / 2 - 2);
                context.strokeStyle =
                    sampleBeat <= positionBeat ? accent : inactive;
                context.beginPath();
                context.moveTo(Math.round(x) + 0.5, centerY - magnitude);
                context.lineTo(Math.round(x) + 0.5, centerY + magnitude);
                context.stroke();
            }
        }
    }, [height, pixelsPerBeat, positionBeat, startBeat, waveform, width]);

    useCanvasDraw(canvasRef, draw);

    return (
        <canvas
            ref={canvasRef}
            data-testid="timeline-waveform-canvas"
            aria-label="Audio waveform"
            className="block"
            style={{ width, height }}
        />
    );
});
