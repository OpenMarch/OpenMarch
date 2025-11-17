import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import clsx from "clsx";

interface WaveformTimingOverlayProps {
    beats: Beat[];
    measures: Measure[];
    duration: number;
    pixelsPerSecond: number;
    height: number;
    width: number;
}

interface VisibleRange {
    start: number;
    end: number;
}

const BEAT_HEIGHT_RATIO = 0.35;

const hasRehearsalMark = (measure: Measure) =>
    !!measure.rehearsalMark && measure.rehearsalMark.trim().length > 0;

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export default function WaveformTimingOverlay({
    beats,
    measures,
    duration,
    pixelsPerSecond,
    height,
    width,
}: WaveformTimingOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [visibleRange, setVisibleRange] = useState<VisibleRange>({
        start: 0,
        end: duration,
    });

    const pxPerSecond = useMemo(
        () => (pixelsPerSecond > 0 ? pixelsPerSecond : 0),
        [pixelsPerSecond],
    );

    const beatMarkerHeight = Math.max(height * BEAT_HEIGHT_RATIO, 12);

    const updateVisibleRange = useCallback(() => {
        if (!overlayRef.current || pxPerSecond <= 0 || width <= 0) return;

        const container = document.getElementById("timeline");
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const overlayRect = overlayRef.current.getBoundingClientRect();

        const visibleLeft = Math.max(containerRect.left, overlayRect.left);
        const visibleRight = Math.min(containerRect.right, overlayRect.right);

        if (visibleRight <= visibleLeft) {
            setVisibleRange({ start: 0, end: 0 });
            return;
        }

        const viewWidth = visibleRight - visibleLeft;
        const startPx = clamp(visibleLeft - overlayRect.left, 0, width);
        const endPx = clamp(startPx + viewWidth, 0, width);

        const newRange: VisibleRange = {
            start: clamp(startPx / pxPerSecond, 0, duration),
            end: clamp(endPx / pxPerSecond, 0, duration),
        };

        setVisibleRange((prev) =>
            prev.start === newRange.start && prev.end === newRange.end
                ? prev
                : newRange,
        );
    }, [duration, pxPerSecond, width]);

    useEffect(() => {
        if (!duration) {
            setVisibleRange({ start: 0, end: 0 });
            return;
        }
        setVisibleRange((prev) =>
            prev.end === duration ? prev : { start: 0, end: duration },
        );
    }, [duration]);

    useEffect(() => {
        if (pxPerSecond <= 0 || width <= 0) return;

        const container = document.getElementById("timeline");
        if (!container) return;

        const handleScroll = () => updateVisibleRange();
        const handleResize = () => updateVisibleRange();

        container.addEventListener("scroll", handleScroll);
        window.addEventListener("resize", handleResize);

        // Initial calculation to sync with current viewport
        handleResize();

        return () => {
            container.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
        };
    }, [pxPerSecond, updateVisibleRange, width]);

    const visibleMeasures = useMemo(() => {
        if (pxPerSecond <= 0) return [];
        return measures.filter((measure) => {
            const start = measure.timestamp;
            const end = measure.timestamp + measure.duration;
            return end >= visibleRange.start && start <= visibleRange.end;
        });
    }, [measures, visibleRange, pxPerSecond]);

    const visibleBeats = useMemo(() => {
        if (pxPerSecond <= 0) return [];
        return beats.filter(
            (beat) =>
                beat.timestamp >= visibleRange.start &&
                beat.timestamp <= visibleRange.end,
        );
    }, [beats, visibleRange, pxPerSecond]);

    if (pxPerSecond <= 0 || width <= 0 || height <= 0) {
        return null;
    }

    return (
        <div
            ref={overlayRef}
            className="pointer-events-none absolute inset-0 z-20 h-full"
            style={{ height }}
        >
            <div className="relative h-full" style={{ width }}>
                {visibleMeasures.map((measure) => {
                    const x = measure.timestamp * pxPerSecond;
                    const isRehearsalMark = hasRehearsalMark(measure);
                    const label = isRehearsalMark
                        ? measure.rehearsalMark!.trim()
                        : measure.number.toString();

                    return (
                        <div key={`measure-${measure.id}`}>
                            <div
                                className={clsx(
                                    "absolute top-0 bottom-0 -translate-x-1/2 rounded-full",
                                    isRehearsalMark
                                        ? "bg-[var(--color-accent)]"
                                        : "bg-[rgb(180,180,180)] dark:bg-[rgb(90,90,90)]",
                                )}
                                style={{
                                    left: x,
                                    width: isRehearsalMark ? 2 : 1,
                                }}
                            />
                            <div
                                className="absolute top-0 font-mono whitespace-nowrap"
                                style={{ left: x }}
                            >
                                <span
                                    className={clsx(
                                        "border-stroke bg-modal rounded-4 border px-3",
                                        isRehearsalMark
                                            ? "text-accent text-lg"
                                            : "text-text-subtitle text-sm",
                                    )}
                                >
                                    {label}
                                </span>
                            </div>
                        </div>
                    );
                })}

                {visibleBeats.map((beat) => {
                    const x = beat.timestamp * pxPerSecond;
                    return (
                        <div
                            key={`beat-${beat.id}`}
                            className="absolute -translate-x-1/2 rounded-full bg-[rgb(205,205,205)] dark:bg-[rgb(60,60,60)]"
                            style={{
                                left: x,
                                top: 0,
                                width: 1,
                                height: beatMarkerHeight,
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
