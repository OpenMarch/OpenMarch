import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Beat from "@/global/classes/Beat";
import { durationToTempo } from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createBeatsMutationOptions,
    deleteBeatsMutationOptions,
    updateBeatsMutationOptions,
} from "@/hooks/queries/useBeats";
import {
    createMeasuresMutationOptions,
    updateMeasuresMutationOptions,
} from "@/hooks/queries/useMeasures";
import { Button, Input, UnitInput } from "@openmarch/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

interface WaveformTimingOverlayProps {
    beats: Beat[];
    measures: Measure[];
    beatIdsOnPages: Set<number>;
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
    beatIdsOnPages,
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
    const beatIdsWithMeasures = useMemo(() => {
        return new Set(measures.map((measure) => measure.startBeat.id));
    }, [measures]);

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
                beat.timestamp <= visibleRange.end &&
                !beatIdsWithMeasures.has(beat.id),
        );
    }, [
        pxPerSecond,
        beats,
        visibleRange.start,
        visibleRange.end,
        beatIdsWithMeasures,
    ]);

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
                        <>
                            <BeatOrMeasureContextMenu
                                beat={beat}
                                beatIdsOnPages={beatIdsOnPages}
                                measure={measure}
                                key={`measure-${measure.id}`}
                            >
                                <div
                                    className={clsx(
                                        "hover:bg-accent pointer-events-auto absolute top-0 bottom-0 -translate-x-1/2 cursor-pointer rounded-full",
                                        isRehearsalMark
                                            ? "w-2 bg-[var(--color-accent)] hover:w-8"
                                            : "w-1 bg-[rgb(180,180,180)] hover:w-4 dark:bg-[rgb(90,90,90)]",
                                    )}
                                    style={{
                                        left: x,
                                    }}
                                />
                            </BeatOrMeasureContextMenu>
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
                        </>
                    );
                })}

                {visibleBeats.map((beat) => {
                    const x = beat.timestamp * pxPerSecond;
                    return (
                        <BeatOrMeasureContextMenu
                            beat={beat}
                            beatIdsOnPages={beatIdsOnPages}
                            measure={null}
                            key={`beat-${beat.id}`}
                        >
                            <div
                                key={`beat-${beat.id}`}
                                className="hover:bg-accent pointer-events-auto absolute w-1 -translate-x-1/2 cursor-pointer rounded-full bg-[rgb(205,205,205)] hover:w-4 dark:bg-[rgb(60,60,60)]"
                                style={{
                                    left: x,
                                    top: 0,
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
    beatIdsOnPages,
    children,
}: {
    beat: Beat;
    measure: Measure | null;
    beatIdsOnPages: Set<number>;
    children: React.ReactNode;
}) => {
    const [open, setOpen] = useState(false);

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
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="flex flex-col gap-16">
                        <MeasureContextMenuContent
                            beat={beat}
                            measure={measure}
                            onClose={() => setOpen(false)}
                        />
                        <BeatContextMenuContent
                            beat={beat}
                            beatIdsOnPages={beatIdsOnPages}
                            onClose={() => setOpen(false)}
                        />
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const MeasureContextMenuContent = ({
    beat,
    measure,
    onClose,
}: {
    beat: Beat;
    measure: Measure | null;
    onClose: () => void;
}) => {
    const [rehearsalMark, setRehearsalMark] = useState(
        measure?.rehearsalMark ?? "",
    );
    const rehearsalMarkInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const updateMeasureMutation = useMutation(
        updateMeasuresMutationOptions(queryClient),
    );
    const createMeasureMutation = useMutation(
        createMeasuresMutationOptions(queryClient),
    );

    // Update rehearsal mark when measure changes
    useEffect(() => {
        setRehearsalMark(measure?.rehearsalMark ?? "");
    }, [measure?.rehearsalMark]);

    const handleCreateMeasure = () => {
        createMeasureMutation.mutate([
            {
                start_beat: beat.id,
                rehearsal_mark: null,
            },
        ]);
        onClose();
    };

    const handleRehearsalMarkBlur = () => {
        if (!measure) return;

        const trimmedMark = rehearsalMark.trim();
        const currentMark = measure.rehearsalMark?.trim() ?? "";

        // Only update if the value has changed
        if (trimmedMark === currentMark) {
            return;
        }

        updateMeasureMutation.mutate(
            [
                {
                    id: measure.id,
                    rehearsal_mark: trimmedMark || null,
                },
            ],
            {
                onSuccess: () => {
                    onClose();
                },
            },
        );
    };

    return (
        <div className="flex flex-col gap-8" aria-label="Measure context menu">
            <h4 className="text-text-subtitle text-sm">Measure</h4>

            {measure ? (
                <>
                    <label className="text-text text-body">
                        Rehearsal Mark
                    </label>
                    <Input
                        ref={rehearsalMarkInputRef}
                        type="text"
                        value={rehearsalMark}
                        onChange={(e) => setRehearsalMark(e.target.value)}
                        onBlur={handleRehearsalMarkBlur}
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                            e.currentTarget.focus();
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        disabled={updateMeasureMutation.isPending}
                    />
                </>
            ) : (
                <Button
                    variant="secondary"
                    className="w-full justify-center text-xs"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateMeasure}
                    disabled={createMeasureMutation.isPending}
                >
                    <PlusIcon /> Create Measure
                </Button>
            )}
        </div>
    );
};

const BeatContextMenuContent = ({
    beat,
    onClose,
    beatIdsOnPages,
}: {
    beat: Beat;
    onClose: () => void;
    beatIdsOnPages: Set<number>;
}) => {
    // Convert duration to BPM for display
    const initialTempo = durationToTempo(beat.duration);
    const [tempo, setTempo] = useState(initialTempo.toString());
    const queryClient = useQueryClient();
    const mutation = useMutation(updateBeatsMutationOptions(queryClient));
    const createBeatMutation = useMutation(
        createBeatsMutationOptions(queryClient),
    );
    const deleteBeatMutation = useMutation(
        deleteBeatsMutationOptions(queryClient),
    );

    const saveTempo = () => {
        const newTempo = parseFloat(tempo);

        if (isNaN(newTempo) || newTempo <= 0) {
            // Reset to original value if invalid
            const currentTempo = durationToTempo(beat.duration);
            setTempo(currentTempo.toString());
            return;
        }

        // Convert BPM to duration: duration = 60 / BPM
        const newDuration = 60 / newTempo;

        // Truncate to 6 decimal places
        const truncatedDuration = Math.floor(newDuration * 1000000) / 1000000;

        if (truncatedDuration === beat.duration) {
            onClose();
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
                    onClose();
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveTempo();
        }
    };

    const handleBlur = () => {
        saveTempo();
    };

    // Update tempo when beat changes
    useEffect(() => {
        const currentTempo = durationToTempo(beat.duration);
        setTempo(currentTempo.toString());
    }, [beat.duration]);

    const handleCreateBeat = () => {
        createBeatMutation.mutate({
            newBeats: [
                {
                    duration: beat.duration,
                    include_in_measure: true,
                },
            ],
            startingPosition: beat.position,
        });
    };

    const handleDeleteBeat = () => {
        deleteBeatMutation.mutate(new Set([beat.id]));
    };

    return (
        <div className="flex flex-col gap-8" aria-label="Beat context menu">
            <h4 className="text-text-subtitle text-sm">Beat</h4>
            <label className="text-text text-body">Tempo</label>
            <UnitInput
                type="number"
                step={0.1}
                min={1}
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                disabled={mutation.isPending}
                className="w-full"
                unit="BPM"
                decimalPrecision={3}
                autoFocus
            />
            <div className="flex justify-between text-xs">
                <Button
                    variant="red"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleDeleteBeat}
                    disabled={mutation.isPending || beatIdsOnPages.has(beat.id)}
                >
                    <TrashIcon />
                </Button>
                <Button
                    variant="primary"
                    size="compact"
                    tooltipText={
                        beatIdsOnPages.has(beat.id)
                            ? "Beats on pages cannot be deleted"
                            : undefined
                    }
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateBeat}
                    disabled={mutation.isPending}
                >
                    <PlusIcon /> Add Beat
                </Button>
            </div>
        </div>
    );
};
