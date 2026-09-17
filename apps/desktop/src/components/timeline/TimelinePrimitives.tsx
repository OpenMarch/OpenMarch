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
    clientXToNearestBeat,
    getPlayheadLabel,
    getTrackRange,
} from "./TimelineGeometry";
import type {
    BeatPosition,
    TimelineMarker,
    TimelineNavigation,
    TimelineTrack,
    TimelineViewModel,
} from "./TimelineViewModel";

export const TIMELINE_LABEL_WIDTH = 50;
export const TIMELINE_LABEL_GAP = 6;
export const TIMELINE_MIN_PX_PER_BEAT = 4;
export const TIMELINE_MAX_PX_PER_BEAT = 64;

const TransportButton = ({
    label,
    children,
    onClick,
}: {
    label: string;
    children: ReactNode;
    onClick?: () => void;
}) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={!onClick}
        className="text-text hover:text-accent focus-visible:ring-accent rounded-4 flex size-24 items-center justify-center transition-colors focus-visible:ring-2 disabled:opacity-35"
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
        <aside className="border-stroke bg-fg-1 rounded-6 flex w-[200px] shrink-0 flex-col justify-center gap-16 border px-16 py-12">
            <span className="text-body text-text-subtitle">Timeline</span>
            <div className="flex items-center justify-between gap-8">
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
                    onClick={
                        onPlayingChange
                            ? () => onPlayingChange(!isPlaying)
                            : undefined
                    }
                >
                    {isPlaying ? (
                        <PauseIcon size={22} weight="fill" />
                    ) : (
                        <PlayIcon size={22} />
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
                <div className="flex items-center gap-16">
                    <TransportButton label="Zoom out" onClick={onZoomOut}>
                        <MagnifyingGlassMinusIcon size={21} />
                    </TransportButton>
                    <TransportButton label="Zoom in" onClick={onZoomIn}>
                        <MagnifyingGlassPlusIcon size={21} />
                    </TransportButton>
                    <TransportButton label="Fit timeline" onClick={onFit}>
                        <CornersOutIcon size={21} />
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
        <section className="border-stroke bg-bg-1 rounded-6 flex min-w-0 flex-1 border p-8 text-[#cccccc]">
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
                        <span className="mr-2 inline-block size-0 border-r-[3px] border-b-[5px] border-l-[3px] border-r-transparent border-b-[#cccccc] border-l-transparent" />
                    )}
                    {page.label}
                </span>
            ))}
            {measures.filter(inRange).map((measure) => (
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

export const TimelineTrackClip = ({
    track,
    pixelsPerBeat,
    startBeat = 0,
    top,
    height,
    selected,
    onSelect,
    micro = false,
}: {
    track: TimelineTrack;
    pixelsPerBeat: number;
    startBeat?: number;
    top: number;
    height: number;
    selected: boolean;
    onSelect?: (trackId: string) => void;
    micro?: boolean;
}) => {
    const range = getTrackRange(track);
    if (!range) return null;
    const left = beatToX(range.startBeat, pixelsPerBeat, startBeat);
    const width = (range.endBeat - range.startBeat) * pixelsPerBeat;
    const keyframes = Array.from(
        new Set(track.legs.flatMap((leg) => [leg.startBeat, leg.endBeat])),
    );

    return (
        <button
            type="button"
            data-timeline-interactive="true"
            aria-label={`${track.label} timeline, beats ${range.startBeat} through ${range.endBeat}`}
            aria-pressed={selected}
            title={track.label}
            onClick={() => onSelect?.(track.id)}
            className={clsx(
                "absolute overflow-visible text-[9px] font-medium text-[#0f0e13] focus-visible:ring-2 focus-visible:ring-[#967eff]",
                micro ? "rounded-full" : "rounded-6",
            )}
            style={{
                left,
                top,
                width,
                height,
                boxShadow: selected ? "0 0 0 2px #967eff" : undefined,
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
                                ? `color-mix(in srgb, ${track.color} 22%, transparent)`
                                : track.color,
                        borderColor: track.color,
                        borderRadius: micro ? 999 : 5,
                    }}
                />
            ))}
            {!micro && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {track.label}
                </span>
            )}
            {!micro &&
                keyframes.map((beat) => (
                    <span
                        key={beat}
                        aria-hidden="true"
                        className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#0f0e13]"
                        style={{
                            left: (beat - range.startBeat) * pixelsPerBeat,
                            backgroundColor: track.color,
                        }}
                    />
                ))}
        </button>
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
            <span className="rounded-4 absolute top-0 left-0 -translate-x-1/2 bg-[#967eff] px-5 py-2 font-mono text-[9px] leading-none whitespace-nowrap text-[#0f0e13]">
                {getPlayheadLabel(model, positionBeat)}
            </span>
            <span className="absolute top-14 left-0 size-0 -translate-x-1/2 border-t-[6px] border-r-[4px] border-l-[4px] border-t-[#967eff] border-r-transparent border-l-transparent" />
            <span className="absolute top-20 bottom-0 left-0 w-px bg-[#967eff]" />
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
