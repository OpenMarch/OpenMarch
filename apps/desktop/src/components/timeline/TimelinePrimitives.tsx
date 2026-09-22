import {
    CornersOutIcon,
    FastForwardIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    PauseIcon,
    PlayIcon,
    RewindIcon,
    SkipBackIcon,
    SkipForwardIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    beatToX,
    clamp,
    clientXToNearestBeat,
    filterMarkersByMinimumSpacing,
    getPlayheadLabel,
    getTrackRange,
} from "./TimelineGeometry";
import type {
    BeatPosition,
    TimelineMarker,
    TimelineNavigation,
    TimelineRangeChange,
    TimelineTrack,
    TimelineTrackId,
    TimelineViewModel,
    TimelineWorkspaceRange,
} from "./TimelineViewModel";

export const TIMELINE_LABEL_WIDTH = 50;
export const TIMELINE_LABEL_GAP = 6;
export const TIMELINE_MIN_PX_PER_BEAT = 4;
export const TIMELINE_MAX_PX_PER_BEAT = 64;

const TransportButton = ({
    label,
    children,
    onClick,
    pressed,
}: {
    label: string;
    children: ReactNode;
    onClick?: () => void;
    pressed?: boolean;
}) => (
    <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        title={label}
        onClick={onClick}
        disabled={!onClick}
        className={clsx(
            "focus-visible:ring-accent rounded-4 enabled:hover:text-accent enabled:hover:bg-fg-2 flex size-24 items-center justify-center outline-hidden transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30",
            pressed ? "text-accent" : "text-text",
        )}
    >
        {children}
    </button>
);

export function TimelineTransport({
    isPlaying,
    onPlayingChange,
    onNavigate,
    onZoomOut,
    onZoomIn,
    onFit,
    showZoom = true,
}: {
    isPlaying: boolean;
    onPlayingChange?: (isPlaying: boolean) => void;
    onNavigate?: (direction: TimelineNavigation) => void;
    onZoomOut?: () => void;
    onZoomIn?: () => void;
    onFit?: () => void;
    showZoom?: boolean;
}) {
    return (
        <aside className="border-stroke bg-fg-1 rounded-6 flex w-[200px] shrink-0 flex-col justify-center gap-12 border px-16 py-12">
            <span className="text-body text-text-subtitle leading-none">
                Timeline
            </span>
            <div className="flex items-center justify-between gap-6">
                <TransportButton
                    label="First page"
                    onClick={
                        onNavigate ? () => onNavigate("first-page") : undefined
                    }
                >
                    <RewindIcon size={20} />
                </TransportButton>
                <TransportButton
                    label="Previous page"
                    onClick={
                        onNavigate
                            ? () => onNavigate("previous-page")
                            : undefined
                    }
                >
                    <SkipBackIcon size={20} />
                </TransportButton>
                <TransportButton
                    label={isPlaying ? "Pause" : "Play"}
                    pressed={isPlaying}
                    onClick={
                        onPlayingChange
                            ? () => onPlayingChange(!isPlaying)
                            : undefined
                    }
                >
                    {isPlaying ? (
                        <PauseIcon size={24} weight="fill" />
                    ) : (
                        <PlayIcon size={24} />
                    )}
                </TransportButton>
                <TransportButton
                    label="Next page"
                    onClick={
                        onNavigate ? () => onNavigate("next-page") : undefined
                    }
                >
                    <SkipForwardIcon size={20} />
                </TransportButton>
                <TransportButton
                    label="Last page"
                    onClick={
                        onNavigate ? () => onNavigate("last-page") : undefined
                    }
                >
                    <FastForwardIcon size={20} />
                </TransportButton>
            </div>
            {showZoom && (
                <div className="border-stroke flex items-center gap-12 border-t pt-8">
                    <TransportButton label="Zoom out" onClick={onZoomOut}>
                        <MagnifyingGlassMinusIcon size={20} />
                    </TransportButton>
                    <TransportButton label="Zoom in" onClick={onZoomIn}>
                        <MagnifyingGlassPlusIcon size={20} />
                    </TransportButton>
                    <TransportButton label="Fit timeline" onClick={onFit}>
                        <CornersOutIcon size={20} />
                    </TransportButton>
                </div>
            )}
        </aside>
    );
}

export const TimelineShell = ({
    transport,
    labels,
    children,
    viewportRef,
    className,
    allowScroll = true,
}: {
    transport?: ReactNode;
    labels?: ReactNode;
    children: ReactNode;
    viewportRef: RefObject<HTMLDivElement | null>;
    className?: string;
    allowScroll?: boolean;
}) => (
    <div className={clsx("flex min-w-0 gap-8 font-sans", className)}>
        {transport}
        <section className="border-stroke bg-fg-1 text-text rounded-6 flex min-w-0 flex-1 border p-8">
            <div className="relative w-[50px] shrink-0">{labels}</div>
            <div className="w-[6px] shrink-0" />
            <div
                ref={viewportRef}
                data-testid="timeline-viewport"
                className={clsx("min-w-0 flex-1", {
                    "overflow-x-auto overflow-y-hidden": allowScroll,
                    "overflow-hidden": !allowScroll,
                })}
            >
                {children}
            </div>
        </section>
    </div>
);

export const TimelineRuler = ({
    pages,
    measures,
    pixelsPerBeat,
    startBeat = 0,
    endBeat,
    compact = false,
}: {
    pages: readonly TimelineMarker[];
    measures: readonly TimelineMarker[];
    pixelsPerBeat: number;
    startBeat?: number;
    endBeat: number;
    compact?: boolean;
}) => {
    const inRange = (marker: TimelineMarker) =>
        marker.atBeat >= startBeat && marker.atBeat <= endBeat;
    const visibleMeasures = filterMarkersByMinimumSpacing(
        measures.filter(inRange),
        pixelsPerBeat,
    );
    return (
        <div className="pointer-events-none absolute inset-x-0 top-28 h-28 font-mono">
            {pages.filter(inRange).map((page) => (
                <span
                    key={page.id}
                    className={clsx(
                        "text-text absolute top-0 whitespace-nowrap",
                        page.atBeat !== startBeat && "-translate-x-1/2",
                    )}
                    style={{
                        left: beatToX(page.atBeat, pixelsPerBeat, startBeat),
                        fontSize: compact ? 9 : 11,
                    }}
                >
                    {compact && (
                        <span className="text-text-subtitle mr-2 inline-block size-0 border-r-[3px] border-b-[5px] border-l-[3px] border-r-transparent border-b-current border-l-transparent" />
                    )}
                    {page.label}
                </span>
            ))}
            {visibleMeasures.map((measure) => (
                <span
                    key={measure.id}
                    className={clsx(
                        "text-text-subtitle absolute top-16 whitespace-nowrap",
                        measure.atBeat !== startBeat && "-translate-x-1/2",
                    )}
                    style={{
                        left: beatToX(measure.atBeat, pixelsPerBeat, startBeat),
                        fontSize: compact ? 8 : 9,
                    }}
                >
                    {measure.label}
                </span>
            ))}
        </div>
    );
};

export const TimelinePageLines = ({
    pages,
    pixelsPerBeat,
    height,
    startBeat = 0,
}: {
    pages: readonly TimelineMarker[];
    pixelsPerBeat: number;
    height: number;
    startBeat?: number;
}) => (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {pages.map((page) => (
            <span
                key={page.id}
                className="bg-text absolute top-0 w-px opacity-[0.18]"
                style={{
                    left: Math.round(
                        beatToX(page.atBeat, pixelsPerBeat, startBeat),
                    ),
                    height,
                }}
            />
        ))}
    </div>
);

export const TimelineTrackClip = ({
    track,
    pixelsPerBeat,
    startBeat = 0,
    top,
    height,
    selected,
    onSelect,
    onRangeCommit,
    beatCount,
    micro = false,
}: {
    track: TimelineTrack;
    pixelsPerBeat: number;
    startBeat?: number;
    top: number;
    height: number;
    selected: boolean;
    onSelect?: (trackId: TimelineTrackId) => void;
    onRangeCommit?: (change: TimelineRangeChange) => void;
    beatCount?: number;
    micro?: boolean;
}) => {
    const range = getTrackRange(track);
    const [previewOffset, setPreviewOffset] = useState(0);
    const dragRef = useRef<{
        pointerId: number;
        startClientX: number;
        offset: number;
    } | null>(null);

    useEffect(() => {
        dragRef.current = null;
        setPreviewOffset(0);
    }, [range?.endBeat, range?.startBeat]);

    if (!range) return null;
    const left = beatToX(
        range.startBeat + previewOffset,
        pixelsPerBeat,
        startBeat,
    );
    const width = (range.endBeat - range.startBeat) * pixelsPerBeat;
    const keyframes = Array.from(
        new Set(track.legs.flatMap((leg) => [leg.startBeat, leg.endBeat])),
    );
    const canMove = onRangeCommit != null && beatCount != null;
    const getOffset = (clientX: number, startClientX: number) => {
        const requested = Math.round((clientX - startClientX) / pixelsPerBeat);
        const minimum = -range.startBeat;
        const maximum = Math.max(minimum, beatCount! - 1 - range.endBeat);
        return clamp(requested, minimum, maximum);
    };

    return (
        <button
            type="button"
            data-timeline-interactive="true"
            aria-label={`${track.label} timeline, beats ${range.startBeat} through ${range.endBeat}`}
            aria-pressed={selected}
            title={track.label}
            onClick={() => onSelect?.(track.id)}
            onPointerDown={(event) => {
                if (!canMove || event.button !== 0) return;
                event.stopPropagation();
                dragRef.current = {
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    offset: 0,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const offset = getOffset(event.clientX, drag.startClientX);
                drag.offset = offset;
                setPreviewOffset(offset);
            }}
            onPointerUp={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                dragRef.current = null;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
                const offset = drag.offset;
                setPreviewOffset(0);
                if (offset === 0) return;
                onRangeCommit?.({
                    timelineId: track.id,
                    startBeatIndex: range.startBeat + offset,
                    endBeatIndex: range.endBeat + offset,
                });
            }}
            onPointerCancel={() => {
                dragRef.current = null;
                setPreviewOffset(0);
            }}
            className={clsx(
                "group focus-visible:ring-accent absolute overflow-visible text-[9px] font-medium outline-hidden transition-[filter,box-shadow] duration-150 focus-visible:ring-2 enabled:hover:brightness-110",
                canMove && "cursor-grab touch-none active:cursor-grabbing",
                micro ? "rounded-full" : "rounded-6",
            )}
            style={{
                left,
                top,
                width,
                height,
                boxShadow: selected
                    ? "0 0 0 2px var(--color-accent)"
                    : undefined,
            }}
        >
            {track.legs.map((leg) => (
                <span
                    key={leg.id}
                    className={clsx("absolute inset-y-0", {
                        "border border-dashed": leg.texture === "hold",
                    })}
                    style={{
                        left: (leg.startBeat - range.startBeat) * pixelsPerBeat,
                        width: (leg.endBeat - leg.startBeat) * pixelsPerBeat,
                        backgroundColor:
                            leg.texture === "hold"
                                ? `color-mix(in srgb, ${track.color} 20%, transparent)`
                                : `color-mix(in srgb, ${track.color} 86%, var(--color-bg-1))`,
                        borderColor: track.color,
                        borderRadius: micro ? 999 : 5,
                    }}
                />
            ))}
            {!micro && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="bg-bg-1/75 text-text rounded-4 px-4 py-1 font-mono leading-none shadow-sm">
                        {track.label}
                    </span>
                </span>
            )}
            {!micro &&
                keyframes.map((beat) => (
                    <span
                        key={beat}
                        aria-hidden="true"
                        className="border-bg-1 absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border"
                        style={{
                            left: (beat - range.startBeat) * pixelsPerBeat,
                            backgroundColor: track.color,
                        }}
                    />
                ))}
        </button>
    );
};

export const TimelineWorkspaceFlags = ({
    range,
    beatCount,
    pixelsPerBeat,
    height,
    startBeat = 0,
    onCommit,
}: {
    range: TimelineWorkspaceRange;
    beatCount: number;
    pixelsPerBeat: number;
    height: number;
    startBeat?: number;
    onCommit?: (range: TimelineWorkspaceRange) => void;
}) => {
    const [preview, setPreview] = useState(range);
    const previewRef = useRef(range);
    const dragRef = useRef<{
        kind: "start" | "end";
        pointerId: number;
        surface: HTMLElement;
    } | null>(null);

    useEffect(() => {
        const next = {
            startFlagBeatIndex: range.startFlagBeatIndex,
            endFlagBeatIndex: range.endFlagBeatIndex,
        };
        dragRef.current = null;
        previewRef.current = next;
        setPreview(next);
    }, [range.endFlagBeatIndex, range.startFlagBeatIndex]);

    const updatePreview = useCallback(
        (kind: "start" | "end", clientX: number, surface: HTMLElement) => {
            const bounds = surface.getBoundingClientRect();
            const requested = clientXToNearestBeat({
                clientX,
                surfaceLeft: bounds.left,
                pixelsPerBeat,
                startBeat,
                beatCount,
            });
            const current = previewRef.current;
            const next =
                kind === "start"
                    ? {
                          startFlagBeatIndex: clamp(
                              requested,
                              0,
                              current.endFlagBeatIndex - 1,
                          ),
                          endFlagBeatIndex: current.endFlagBeatIndex,
                      }
                    : {
                          startFlagBeatIndex: current.startFlagBeatIndex,
                          endFlagBeatIndex: clamp(
                              requested,
                              current.startFlagBeatIndex + 1,
                              Math.max(beatCount - 1, 1),
                          ),
                      };
            previewRef.current = next;
            setPreview(next);
        },
        [beatCount, pixelsPerBeat, startBeat],
    );

    const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        updatePreview(drag.kind, event.clientX, drag.surface);
        dragRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const next = previewRef.current;
        if (
            next.startFlagBeatIndex !== range.startFlagBeatIndex ||
            next.endFlagBeatIndex !== range.endFlagBeatIndex
        ) {
            onCommit?.(next);
        }
    };

    const flag = (kind: "start" | "end", beatIndex: number) => {
        const isVisible = beatIndex >= startBeat;
        const label = `Workspace ${kind}`;
        if (!isVisible) return null;
        return (
            <button
                type="button"
                data-timeline-interactive="true"
                aria-label={label}
                title={`${label}: beat ${beatIndex + 1}`}
                disabled={!onCommit}
                onPointerDown={(event) => {
                    if (!onCommit || event.button !== 0) return;
                    event.stopPropagation();
                    const surface = event.currentTarget.parentElement;
                    if (!surface) return;
                    dragRef.current = {
                        kind,
                        pointerId: event.pointerId,
                        surface,
                    };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    updatePreview(kind, event.clientX, surface);
                }}
                onPointerMove={(event) => {
                    const drag = dragRef.current;
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    updatePreview(kind, event.clientX, drag.surface);
                }}
                onPointerUp={finishDrag}
                onPointerCancel={() => {
                    dragRef.current = null;
                    previewRef.current = range;
                    setPreview(range);
                }}
                onKeyDown={(event) => {
                    if (!onCommit) return;
                    const delta =
                        event.key === "ArrowLeft"
                            ? -1
                            : event.key === "ArrowRight"
                              ? 1
                              : 0;
                    if (delta === 0) return;
                    event.preventDefault();
                    const next =
                        kind === "start"
                            ? {
                                  startFlagBeatIndex: clamp(
                                      beatIndex + delta,
                                      0,
                                      range.endFlagBeatIndex - 1,
                                  ),
                                  endFlagBeatIndex: range.endFlagBeatIndex,
                              }
                            : {
                                  startFlagBeatIndex: range.startFlagBeatIndex,
                                  endFlagBeatIndex: clamp(
                                      beatIndex + delta,
                                      range.startFlagBeatIndex + 1,
                                      Math.max(beatCount - 1, 1),
                                  ),
                              };
                    onCommit(next);
                }}
                className="group focus-visible:ring-accent pointer-events-auto absolute top-0 z-40 h-full w-12 -translate-x-1/2 touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2 enabled:cursor-ew-resize disabled:cursor-default"
                style={{
                    left: beatToX(beatIndex, pixelsPerBeat, startBeat),
                    height,
                }}
            >
                <span className="bg-accent absolute top-0 bottom-0 left-1/2 w-px" />
                <span
                    className={clsx(
                        "bg-accent absolute top-0 h-12 w-9",
                        kind === "start"
                            ? "left-1/2 rounded-r-sm"
                            : "right-1/2 rounded-l-sm",
                    )}
                />
            </button>
        );
    };

    const startX = beatToX(
        preview.startFlagBeatIndex,
        pixelsPerBeat,
        startBeat,
    );
    const endX = beatToX(preview.endFlagBeatIndex, pixelsPerBeat, startBeat);

    return (
        <div
            data-testid="timeline-workspace-flags"
            className="pointer-events-none absolute inset-0 z-40"
        >
            <span
                aria-hidden="true"
                className="bg-accent/5 pointer-events-none absolute top-0"
                style={{
                    left: startX,
                    width: Math.max(0, endX - startX),
                    height,
                }}
            />
            <div className="pointer-events-none absolute inset-0">
                {flag("start", preview.startFlagBeatIndex)}
                {flag("end", preview.endFlagBeatIndex)}
            </div>
        </div>
    );
};

export const TimelinePlayhead = ({
    model,
    positionBeat,
    pixelsPerBeat,
    startBeat = 0,
    height,
}: {
    model: TimelineViewModel;
    positionBeat: BeatPosition;
    pixelsPerBeat: number;
    startBeat?: number;
    height: number;
}) => {
    const left = beatToX(positionBeat, pixelsPerBeat, startBeat);
    return (
        <div
            aria-label={getPlayheadLabel(model, positionBeat)}
            className="pointer-events-none absolute top-0 z-30 w-0"
            style={{ left, height }}
        >
            <span className="rounded-4 bg-accent text-text-invert absolute top-0 left-0 -translate-x-1/2 px-5 py-2 font-mono text-[9px] leading-none whitespace-nowrap shadow-sm">
                {getPlayheadLabel(model, positionBeat)}
            </span>
            <span className="border-t-accent absolute top-14 left-0 size-0 -translate-x-1/2 border-t-[6px] border-r-[4px] border-l-[4px] border-r-transparent border-l-transparent" />
            <span className="bg-accent absolute top-20 bottom-0 left-0 w-px" />
        </div>
    );
};

export const useTimelineScrubbing = ({
    onSeek,
    pixelsPerBeat,
    startBeat,
    beatCount,
}: {
    onSeek?: (beat: number) => void;
    pixelsPerBeat: number;
    startBeat: number;
    beatCount: number;
}) => {
    const scrubbing = useRef(false);
    const seek = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!onSeek) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            onSeek(
                clientXToNearestBeat({
                    clientX: event.clientX,
                    surfaceLeft: bounds.left,
                    pixelsPerBeat,
                    startBeat,
                    beatCount,
                }),
            );
        },
        [beatCount, onSeek, pixelsPerBeat, startBeat],
    );

    return {
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            if (
                (event.button !== undefined && event.button !== 0) ||
                (event.target instanceof Element &&
                    event.target.closest("[data-timeline-interactive]"))
            )
                return;
            scrubbing.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seek(event);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
            if (scrubbing.current) seek(event);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
            if (!scrubbing.current) return;
            scrubbing.current = false;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        },
        onPointerCancel: () => {
            scrubbing.current = false;
        },
    };
};

export const useElementWidth = (ref: RefObject<HTMLElement | null>) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const updateWidth = () => setWidth(element.clientWidth);
        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
};
