import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBeatsMutationOptions } from "@/hooks/queries/useBeats";
import { Input } from "@openmarch/ui";

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

    const visibleMeasures: { measure: Measure; beat: Beat }[] = useMemo(() => {
        if (pxPerSecond <= 0) return [];
        return measures
            .filter((measure) => {
                const start = measure.timestamp;
                const end = measure.timestamp + measure.duration;
                return end >= visibleRange.start && start <= visibleRange.end;
            })
            .map((measure) => ({ measure, beat: measure.beats[0] }));
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
                {visibleMeasures.map(({ measure, beat }) => {
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
                        <BeatOrMeasureContextMenu
                            beat={beat}
                            measure={null}
                            key={`beat-${beat.id}`}
                        >
                            <div
                                key={`beat-${beat.id}`}
                                className="hover:bg-accent pointer-events-auto absolute w-1 -translate-x-1/2 cursor-pointer rounded-full bg-[rgb(205,205,205)] hover:w-4 dark:bg-[rgb(60,60,60)]"
                                style={{
                                    left: x,
                                    top: 0,
                                    // width: 1,
                                    height: beatMarkerHeight,
                                }}
                            />
                        </BeatOrMeasureContextMenu>
                    );
                })}
            </div>
        </div>
    );
}

const BeatOrMeasureContextMenu = ({
    beat,
    measure,
    children,
}: {
    beat: Beat;
    measure: Measure | null;
    children: React.ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const [duration, setDuration] = useState(beat.duration.toString());
    const queryClient = useQueryClient();
    const mutation = useMutation(updateBeatsMutationOptions(queryClient));

    const handleClick = (e: React.MouseEvent) => {
        // Only handle left click (button 0)
        if (e.button === 0 || e.type === "click") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
    };

    const saveDuration = () => {
        const newDuration = parseFloat(duration);

        if (isNaN(newDuration) || newDuration <= 0) {
            // Reset to original value if invalid, truncate to 6 digits
            const truncated = Math.floor(beat.duration * 1000000) / 1000000;
            setDuration(truncated.toString());
            return;
        }

        // Truncate to 6 decimal places
        const truncatedDuration = Math.floor(newDuration * 1000000) / 1000000;

        if (truncatedDuration === beat.duration) {
            setOpen(false);
            return;
        }

        mutation.mutate(
            [
                {
                    id: beat.id,
                    duration: truncatedDuration,
                },
            ],
            {
                onSuccess: () => {
                    setOpen(false);
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveDuration();
        }
    };

    const handleBlur = () => {
        saveDuration();
    };

    // Calculate step based on least significant digit of current duration
    const getStep = (dur: number): number => {
        // Truncate to 6 decimal places by converting to integer
        const integerPart = Math.floor(dur * 1000000);

        // Find the least significant non-zero digit
        // Work backwards from the rightmost digit
        let temp = integerPart;

        // Check each digit from right to left (up to 6 decimal places)
        for (let i = 0; i < 6; i++) {
            const digit = temp % 10;
            if (digit !== 0) {
                // Found the least significant non-zero digit at position i
                // Step should be 10^(-(6-i)) since we're working with 6 decimal places
                return Math.pow(10, -(6 - i));
            }
            temp = Math.floor(temp / 10);
        }

        // If all digits are zero (unlikely but handle it), default to 0.000001
        return 0.000001;
    };

    const step = useMemo(() => getStep(beat.duration), [beat.duration]);

    // Update duration when beat changes, truncate to 6 digits
    useEffect(() => {
        const truncated = Math.floor(beat.duration * 1000000) / 1000000;
        setDuration(truncated.toString());
    }, [beat.duration]);

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                asChild
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex flex-col gap-8 border p-16 py-12 backdrop-blur-md"
                    sideOffset={5}
                >
                    <div className="flex flex-col gap-4">
                        <label className="text-body text-text">
                            Duration (seconds)
                        </label>
                        <Input
                            type="number"
                            step={step}
                            min="0.1"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                            disabled={mutation.isPending}
                            className="w-full"
                            autoFocus
                        />
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};
