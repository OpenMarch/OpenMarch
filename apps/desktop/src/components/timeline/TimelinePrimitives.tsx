import {
    CornersOutIcon,
    FastForwardIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    PauseIcon,
    StopIcon,
    PlayIcon,
    RewindIcon,
    SkipBackIcon,
    SkipForwardIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    beatToX,
    clamp,
    clientXToBeat,
    filterMarkersByMinimumSpacing,
    getFrameContext,
    getPageRange,
    getSelectionRange,
    getPlayheadLabel,
    getTrackRange,
    sameRange,
    isPageSnapDisabled,
    snapBoundary,
    snapRangeOffset,
} from "./TimelineGeometry";
import { timelineRangeTargetProps } from "./TimelineRangeMenu";
import type {
    BeatPosition,
    TimelineBeatRange,
    TimelineMarker,
    TimelineNavigation,
    TimelinePageMarker,
    TimelineRangeChange,
    TimelineSelection,
    TimelineTrack,
    TimelineTrackId,
    TimelineViewModel,
} from "./TimelineViewModel";

export const TIMELINE_MIN_PX_PER_BEAT = 4;
export const TIMELINE_MAX_PX_PER_BEAT = 64;
export const TIMELINE_INITIAL_PAGE_WIDTH = 40;

export interface TimelineSelectionInteraction {
    readonly range: TimelineBeatRange;
    readonly activeHandle: "start" | "end" | null;
    readonly dragging: boolean;
}

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
    model,
    clock,
    positionBeat,
    pageLabel,
    isPlaying,
    onPlayingChange,
    onStop,
    onNavigate,
    onZoomOut,
    onZoomIn,
    onFit,
    showZoom = true,
    accessories,
}: {
    model: TimelineViewModel;
    /** The playback clock; the app passes its audio clock */
    clock?: ReactNode;
    positionBeat: BeatPosition;
    /** Overrides the page under the cursor in the label */
    pageLabel?: string;
    isPlaying: boolean;
    onPlayingChange?: (isPlaying: boolean) => void;
    /** **Stop** (UI-10); without it, there is no Stop button */
    onStop?: () => void;
    onNavigate?: (direction: TimelineNavigation) => void;
    onZoomOut?: () => void;
    onZoomIn?: () => void;
    onFit?: () => void;
    showZoom?: boolean;
    /** Extra controls at the end of the zoom row, such as volume and the metronome */
    accessories?: ReactNode;
}) {
    const frame = getFrameContext(model, positionBeat, pageLabel);
    return (
        <aside className="border-stroke bg-fg-1 rounded-6 flex w-[244px] shrink-0 flex-col justify-center gap-12 border px-16 py-12">
            <div className="text-text-subtitle flex items-start justify-between gap-12">
                {clock ?? <span />}
                <span className="text-sub text-right font-mono leading-tight">
                    Pg {frame.pageLabel}
                    <br />
                    {frame.measureAndCount}
                </span>
            </div>
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
                {onStop && (
                    <TransportButton label="Stop" onClick={onStop}>
                        <StopIcon size={20} />
                    </TransportButton>
                )}
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
            {(showZoom || accessories != null) && (
                <div className="border-stroke flex items-center gap-12 border-t pt-8">
                    {showZoom && (
                        <>
                            <TransportButton
                                label="Zoom out"
                                onClick={onZoomOut}
                            >
                                <MagnifyingGlassMinusIcon size={20} />
                            </TransportButton>
                            <TransportButton label="Zoom in" onClick={onZoomIn}>
                                <MagnifyingGlassPlusIcon size={20} />
                            </TransportButton>
                            <TransportButton
                                label="Fit timeline"
                                onClick={onFit}
                            >
                                <CornersOutIcon size={20} />
                            </TransportButton>
                        </>
                    )}
                    {accessories != null && (
                        <div className="ml-auto flex items-center gap-12">
                            {accessories}
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
}

export const TimelineShell = ({
    transport,
    children,
    viewportRef,
    className,
}: {
    transport?: ReactNode;
    children: ReactNode;
    viewportRef: RefObject<HTMLDivElement | null>;
    className?: string;
}) => (
    <div className={clsx("flex min-w-0 gap-8 font-sans", className)}>
        {transport}
        <section className="border-stroke bg-fg-1 text-text rounded-6 min-w-0 flex-1 overflow-visible border p-6">
            <div
                ref={viewportRef}
                data-testid="timeline-viewport"
                className="min-w-0 overflow-x-auto overflow-y-hidden"
            >
                {children}
            </div>
        </section>
    </div>
);

export const TimelineRuler = ({
    pages,
    measures,
    beatCount,
    pixelsPerBeat,
    selection,
    onSelectionChange,
    initialPageWidth,
}: {
    pages: readonly TimelinePageMarker[];
    measures: readonly TimelineMarker[];
    beatCount: number;
    pixelsPerBeat: number;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
    initialPageWidth: number;
}) => {
    const visibleMeasures = filterMarkersByMinimumSpacing(
        measures,
        pixelsPerBeat,
    );
    const initialPage = pages.find((page) => page.isInitial);
    const orderedPages = pages
        .filter((page) => !page.isInitial)
        .sort((a, b) => a.atBeat - b.atBeat);
    // UI-9: the initial box is home; a page box is its range, previous flag to its own flag
    const selectedRange = getSelectionRange(selection);
    const pageRange = (page: TimelinePageMarker) =>
        getPageRange({ pages: orderedPages, pageId: page.id, beatCount });
    const isSelected = (page: TimelinePageMarker) =>
        page.isInitial
            ? selection?.kind === "home"
            : sameRange(pageRange(page), selectedRange);
    const selectPage = (page: TimelinePageMarker) => {
        if (page.isInitial) {
            onSelectionChange?.({ kind: "home" });
            return;
        }
        const range = pageRange(page);
        if (range) onSelectionChange?.({ kind: "range", range });
    };
    return (
        <>
            <div
                data-testid="timeline-page-ruler"
                className="border-stroke bg-fg-2 rounded-6 absolute top-0 h-28 overflow-hidden border font-mono"
                style={{
                    left: -initialPageWidth,
                    width: beatCount * pixelsPerBeat + initialPageWidth,
                }}
            >
                {initialPage && (
                    <button
                        type="button"
                        data-timeline-interactive="true"
                        data-testid="timeline-initial-page"
                        aria-label={`Page ${initialPage.label}`}
                        aria-pressed={isSelected(initialPage)}
                        onClick={() => selectPage(initialPage)}
                        className="border-stroke text-text focus-visible:ring-accent absolute top-0 left-0 flex h-full items-center justify-center border-r text-[11px] outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset aria-pressed:z-10 aria-pressed:ring-1 aria-pressed:ring-[var(--color-accent)] aria-pressed:ring-inset"
                        style={{ width: initialPageWidth }}
                    >
                        {initialPage.label}
                    </button>
                )}
                {orderedPages.map((page) => {
                    const range = getPageRange({
                        pages: orderedPages,
                        pageId: page.id,
                        beatCount,
                    });
                    if (!range) return null;
                    const selected = isSelected(page);
                    return (
                        <button
                            key={page.id}
                            type="button"
                            data-timeline-interactive="true"
                            {...timelineRangeTargetProps(
                                range,
                                undefined,
                                page.id,
                            )}
                            aria-label={`Page ${page.label}`}
                            aria-pressed={selected}
                            onClick={(event) => {
                                // macOS ctrl+click opens the context menu (UI-9: no selection change)
                                if (!event.ctrlKey) selectPage(page);
                            }}
                            className="border-stroke text-text focus-visible:ring-accent absolute top-0 flex h-full items-center justify-end border-r px-8 text-[11px] outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset aria-pressed:z-10 aria-pressed:ring-1 aria-pressed:ring-[var(--color-accent)] aria-pressed:ring-inset"
                            style={{
                                left:
                                    initialPageWidth +
                                    beatToX(
                                        range.startBeatIndex,
                                        pixelsPerBeat,
                                    ),
                                width:
                                    (range.endBeatIndex -
                                        range.startBeatIndex) *
                                    pixelsPerBeat,
                            }}
                        >
                            {page.label}
                        </button>
                    );
                })}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[31px] h-20 font-mono">
                {visibleMeasures.map((measure) => (
                    <span
                        key={measure.id}
                        className="text-text-subtitle absolute top-7 -translate-x-1/2 text-[8px] whitespace-nowrap"
                        style={{ left: beatToX(measure.atBeat, pixelsPerBeat) }}
                    >
                        {measure.label}
                    </span>
                ))}
            </div>
        </>
    );
};

export const TimelinePageLines = ({
    pages,
    pixelsPerBeat,
    height,
}: {
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
    height: number;
}) => (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {pages
            .filter((page) => !page.isInitial)
            .map((page) => (
                <span
                    key={page.id}
                    className="bg-text absolute top-28 w-px opacity-[0.24]"
                    style={{
                        left: Math.round(beatToX(page.atBeat, pixelsPerBeat)),
                        height: Math.max(0, height - 28),
                    }}
                />
            ))}
    </div>
);

export const TimelineTrackClip = ({
    track,
    pixelsPerBeat,
    top,
    height,
    selected,
    linked = false,
    onSelect,
    onRangeCommit,
    beatCount,
    snapBeats = [],
    micro = false,
}: {
    track: TimelineTrack;
    pixelsPerBeat: number;
    top: number;
    height: number;
    selected: boolean;
    /** Another clip of the same spec timeline is selected; this one moves with it */
    linked?: boolean;
    onSelect?: (trackId: TimelineTrackId) => void;
    onRangeCommit?: (change: TimelineRangeChange) => void;
    beatCount?: number;
    /** Page lines the clip's edges snap to while it moves (ui.md UI-2); Alt turns snapping off */
    snapBeats?: readonly number[];
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
    }, [range?.endBeatIndex, range?.startBeatIndex]);

    if (!range) return null;
    const left = (range.startBeatIndex + previewOffset) * pixelsPerBeat;
    const width = (range.endBeatIndex - range.startBeatIndex) * pixelsPerBeat;
    const canMove = onRangeCommit != null && beatCount != null;
    const getOffset = (
        clientX: number,
        startClientX: number,
        snapDisabled: boolean,
    ) => {
        const requested = snapRangeOffset({
            range,
            offset: (clientX - startClientX) / pixelsPerBeat,
            snapBeats: snapDisabled ? [] : snapBeats,
            pixelsPerBeat,
        });
        const minimum = -range.startBeatIndex;
        const maximum = Math.max(minimum, beatCount! - range.endBeatIndex);
        return clamp(requested, minimum, maximum);
    };

    return (
        <button
            type="button"
            data-timeline-interactive="true"
            {...timelineRangeTargetProps(range, track.id)}
            aria-label={`${track.label} timeline, beats ${range.startBeatIndex + 1} through ${range.endBeatIndex}${
                track.diagnostics
                    ? `, ${track.diagnostics.messages.length} ${track.diagnostics.messages.length === 1 ? "diagnostic" : "diagnostics"}`
                    : ""
            }`}
            aria-pressed={selected}
            data-linked={linked || undefined}
            title={
                track.diagnostics
                    ? [track.label, ...track.diagnostics.messages].join("\n")
                    : track.label
            }
            onClick={(event) => {
                // macOS ctrl+click opens the context menu (UI-9: no selection change)
                if (!event.ctrlKey) onSelect?.(track.id);
            }}
            onPointerDown={(event) => {
                if (!canMove || event.button !== 0 || event.ctrlKey) return;
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
                const offset = getOffset(
                    event.clientX,
                    drag.startClientX,
                    isPageSnapDisabled(event),
                );
                drag.offset = offset;
                setPreviewOffset(offset);
            }}
            onPointerUp={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                dragRef.current = null;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
                // Recompute with the release's modifier state, as the selection flags do
                const offset = getOffset(
                    event.clientX,
                    drag.startClientX,
                    isPageSnapDisabled(event),
                );
                setPreviewOffset(0);
                if (offset === 0) return;
                onRangeCommit?.({
                    timelineId: track.id,
                    startBeatIndex: range.startBeatIndex + offset,
                    endBeatIndex: range.endBeatIndex + offset,
                });
            }}
            onPointerCancel={() => {
                dragRef.current = null;
                setPreviewOffset(0);
            }}
            className={clsx(
                "focus-visible:ring-accent absolute overflow-visible outline-hidden transition-[filter,box-shadow] duration-150 focus-visible:ring-2 enabled:hover:brightness-110",
                canMove && "cursor-grab touch-none active:cursor-grabbing",
                micro ? "rounded-full" : "rounded-4",
            )}
            style={{
                left,
                top,
                width,
                height,
                boxShadow: selected
                    ? "0 0 0 2px var(--color-accent)"
                    : linked
                      ? "0 0 0 1px var(--color-accent)"
                      : undefined,
            }}
        >
            {track.activitySpans.map((span) => {
                const isFirst = span.startBeatIndex === range.startBeatIndex;
                const isLast = span.endBeatIndex === range.endBeatIndex;

                return (
                    <span
                        key={`${span.startBeatIndex}-${span.endBeatIndex}`}
                        data-activity={span.active ? "active" : "inactive"}
                        className={clsx(
                            "absolute inset-y-0 overflow-hidden",
                            isFirst &&
                                (micro ? "rounded-l-full" : "rounded-l-4"),
                            isLast &&
                                (micro ? "rounded-r-full" : "rounded-r-4"),
                            span.active
                                ? "border border-transparent"
                                : "border border-dashed",
                        )}
                        style={{
                            left:
                                (span.startBeatIndex - range.startBeatIndex) *
                                pixelsPerBeat,
                            width:
                                (span.endBeatIndex - span.startBeatIndex) *
                                pixelsPerBeat,
                            backgroundColor: span.active
                                ? `color-mix(in srgb, ${track.color} 82%, var(--color-bg-1))`
                                : `color-mix(in srgb, ${track.color} 12%, transparent)`,
                            borderColor: span.active
                                ? "transparent"
                                : track.color,
                        }}
                    />
                );
            })}
            {track.diagnostics && (
                <span
                    data-testid="timeline-track-diagnostics"
                    data-level={track.diagnostics.level}
                    className={clsx(
                        "pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center",
                        track.diagnostics.level === "warning"
                            ? "text-yellow"
                            : "text-text-subtitle",
                    )}
                >
                    {micro ? (
                        <span className="block size-[5px] rounded-full bg-current" />
                    ) : (
                        <WarningIcon size={12} weight="fill" />
                    )}
                </span>
            )}
        </button>
    );
};

export const TimelineSelectionRange = ({
    range,
    startFlagBeatIndex,
    beatCount,
    pixelsPerBeat,
    height,
    snapBeats = [],
    onCommit,
    onInteractionChange,
}: {
    range: TimelineBeatRange;
    /** Where to draw the start flag when it isn't the range's start (UI-10, after Stop) */
    startFlagBeatIndex?: number;
    beatCount: number;
    pixelsPerBeat: number;
    height: number;
    /** Page lines the dragged flag snaps to (ui.md UI-2); Alt turns snapping off */
    snapBeats?: readonly number[];
    onCommit?: (range: TimelineBeatRange) => void;
    onInteractionChange?: (
        interaction: TimelineSelectionInteraction | null,
    ) => void;
}) => {
    const [preview, setPreview] = useState(range);
    const previewRef = useRef(range);
    const dragRef = useRef<{
        kind: "start" | "end";
        pointerId: number;
        surface: HTMLElement;
        startClientX: number;
        /** The pointer has moved past the drag threshold: a drag, not a click */
        moved: boolean;
    } | null>(null);

    useEffect(() => {
        const next = {
            startBeatIndex: range.startBeatIndex,
            endBeatIndex: range.endBeatIndex,
        };
        dragRef.current = null;
        previewRef.current = next;
        setPreview(next);
    }, [range.endBeatIndex, range.startBeatIndex]);

    const updatePreview = useCallback(
        (
            kind: "start" | "end",
            clientX: number,
            surface: HTMLElement,
            snapDisabled: boolean,
            dragging = true,
        ) => {
            const bounds = surface.getBoundingClientRect();
            const requested = snapBoundary({
                beat: clamp(
                    (clientX - bounds.left) / pixelsPerBeat,
                    0,
                    beatCount,
                ),
                snapBeats: snapDisabled ? [] : snapBeats,
                pixelsPerBeat,
            });
            const current = previewRef.current;
            const next =
                kind === "start"
                    ? {
                          startBeatIndex: clamp(
                              requested,
                              0,
                              current.endBeatIndex - 1,
                          ),
                          endBeatIndex: current.endBeatIndex,
                      }
                    : {
                          startBeatIndex: current.startBeatIndex,
                          endBeatIndex: clamp(
                              requested,
                              current.startBeatIndex + 1,
                              beatCount,
                          ),
                      };
            previewRef.current = next;
            setPreview(next);
            onInteractionChange?.({
                range: next,
                activeHandle: dragging ? kind : null,
                dragging,
            });
            return next;
        },
        [beatCount, onInteractionChange, pixelsPerBeat, snapBeats],
    );

    const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.moved) {
            // A click: nothing changes
            dragRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            onInteractionChange?.(null);
            return;
        }
        const next = updatePreview(
            drag.kind,
            event.clientX,
            drag.surface,
            isPageSnapDisabled(event),
            false,
        );
        dragRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (
            next.startBeatIndex !== range.startBeatIndex ||
            next.endBeatIndex !== range.endBeatIndex
        ) {
            onCommit?.(next);
        }
    };

    const flag = (kind: "start" | "end", beatIndex: number) => (
        <button
            type="button"
            data-timeline-interactive="true"
            aria-label={kind === "start" ? "Start flag" : `Selection ${kind}`}
            title={
                kind === "start"
                    ? `Start flag: marchers leave from here (beat boundary ${beatIndex}). Drag to pin it.`
                    : `Selection ${kind}: beat boundary ${beatIndex}`
            }
            disabled={!onCommit}
            onPointerDown={(event) => {
                if (!onCommit || event.button !== 0) return;
                event.stopPropagation();
                const surface =
                    event.currentTarget.parentElement?.parentElement;
                if (!surface) return;
                // Nothing moves until the pointer does: after Stop the start flag is drawn on the
                // playhead, away from the fallback window's start, so a press must not jump it
                dragRef.current = {
                    kind,
                    pointerId: event.pointerId,
                    surface,
                    startClientX: event.clientX,
                    moved: false,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                if (
                    !drag.moved &&
                    Math.abs(event.clientX - drag.startClientX) <
                        TIMELINE_RANGE_DRAG_PX
                )
                    return;
                drag.moved = true;
                updatePreview(
                    kind,
                    event.clientX,
                    drag.surface,
                    isPageSnapDisabled(event),
                );
            }}
            onPointerUp={finishDrag}
            onPointerCancel={() => {
                dragRef.current = null;
                previewRef.current = range;
                setPreview(range);
                onInteractionChange?.(null);
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
                // The arrow moves the flag, not the selected marchers (the window's nudge keys)
                event.stopPropagation();
                // The start flag stays before the playhead (UI-10): after Stop it is drawn on the
                // playhead, so a step right has nowhere to go
                if (
                    kind === "start" &&
                    (beatIndex + delta >= range.endBeatIndex ||
                        beatIndex + delta < 0)
                )
                    return;
                onCommit(
                    kind === "start"
                        ? {
                              startBeatIndex: clamp(
                                  beatIndex + delta,
                                  0,
                                  range.endBeatIndex - 1,
                              ),
                              endBeatIndex: range.endBeatIndex,
                          }
                        : {
                              startBeatIndex: range.startBeatIndex,
                              endBeatIndex: clamp(
                                  beatIndex + delta,
                                  range.startBeatIndex + 1,
                                  beatCount,
                              ),
                          },
                );
            }}
            className="focus-visible:ring-accent pointer-events-auto absolute top-0 z-40 h-full w-12 -translate-x-1/2 touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2 enabled:cursor-ew-resize disabled:cursor-default"
            style={{ left: beatToX(beatIndex, pixelsPerBeat), height }}
        >
            <span
                className={clsx(
                    "absolute inset-y-0 left-1/2",
                    kind === "start" ? "bg-yellow w-0.5" : "bg-accent w-px",
                )}
            />
            {kind === "start" ? (
                // UI-10: the start flag, where movers leave from and Stop returns to
                <span className="bg-yellow text-text-invert absolute top-0 left-1/2 rounded-r-sm px-3 font-mono text-[9px] leading-[14px] font-semibold tracking-wide">
                    START
                </span>
            ) : (
                <span className="bg-accent absolute top-0 right-1/2 h-10 w-8 rounded-l-sm" />
            )}
        </button>
    );

    const startX = beatToX(preview.startBeatIndex, pixelsPerBeat);
    const endX = beatToX(preview.endBeatIndex, pixelsPerBeat);
    return (
        <div
            data-testid="timeline-selection-range"
            className="pointer-events-none absolute inset-0 z-30"
        >
            <span
                aria-hidden="true"
                className="bg-accent/8 absolute top-0"
                style={{ left: startX, width: endX - startX, height }}
            />
            <div className="pointer-events-none absolute inset-0">
                {flag(
                    "start",
                    startFlagBeatIndex !== undefined && !dragRef.current
                        ? startFlagBeatIndex
                        : preview.startBeatIndex,
                )}
                {/* UI-10: the playhead is the window's end, so it has no handle of its own */}
            </div>
        </div>
    );
};

export const TimelineRehearsalMarkers = ({
    model,
    pixelsPerBeat,
    top,
    onSeek,
}: {
    model: TimelineViewModel;
    pixelsPerBeat: number;
    top: number;
    onSeek?: (beat: BeatPosition) => void;
}) => (
    <div className="pointer-events-none absolute inset-0 z-20">
        {model.measures.flatMap((measure) => {
            const label = measure.rehearsalMark?.trim();
            if (!label) return [];
            return [
                <button
                    key={measure.id}
                    type="button"
                    data-timeline-interactive="true"
                    aria-label={`Rehearsal mark ${label}`}
                    title={`Rehearsal mark ${label}`}
                    onClick={() => onSeek?.(measure.atBeat)}
                    className="border-text-subtitle bg-bg-1 text-text pointer-events-auto absolute flex size-22 -translate-x-1/2 items-center justify-center rounded-full border font-mono text-[10px] shadow-sm"
                    style={{
                        left: beatToX(measure.atBeat, pixelsPerBeat),
                        top,
                    }}
                >
                    {label}
                </button>,
            ];
        })}
    </div>
);

export const TimelinePlayheadDetail = ({
    model,
    positionBeat,
    pageLabel,
    pixelsPerBeat,
    height,
    anchorRef,
    visible,
}: {
    model: TimelineViewModel;
    positionBeat: BeatPosition;
    pageLabel?: string;
    pixelsPerBeat: number;
    height: number;
    anchorRef: RefObject<HTMLButtonElement | null>;
    visible: boolean;
}) => {
    const detailRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    const updatePosition = useCallback(() => {
        const anchor = anchorRef.current;
        const detail = detailRef.current;
        if (!anchor || !detail) return;
        const anchorRect = anchor.getBoundingClientRect();
        const detailRect = detail.getBoundingClientRect();
        const centeredLeft =
            anchorRect.left + anchorRect.width / 2 - detailRect.width / 2;
        const maximumLeft = Math.max(
            8,
            window.innerWidth - detailRect.width - 8,
        );
        const next = {
            left: clamp(centeredLeft, 8, maximumLeft),
            top: Math.max(8, anchorRect.top - detailRect.height - 8),
        };
        setPosition((current) =>
            current?.left === next.left && current.top === next.top
                ? current
                : next,
        );
    }, [anchorRef]);

    useLayoutEffect(() => {
        if (!visible) {
            setPosition(null);
            return;
        }
        updatePosition();
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(updatePosition);
        if (anchorRef.current) observer?.observe(anchorRef.current);
        if (detailRef.current) observer?.observe(detailRef.current);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [
        anchorRef,
        height,
        pixelsPerBeat,
        positionBeat,
        updatePosition,
        visible,
    ]);

    if (!visible) return null;
    const isDark = anchorRef.current?.closest(".dark") != null;
    return createPortal(
        <div
            ref={detailRef}
            role="tooltip"
            data-testid="timeline-playhead-detail"
            className={clsx(
                "bg-accent text-text-invert rounded-4 pointer-events-none fixed z-[100] px-6 py-4 font-mono text-[11px] leading-none whitespace-nowrap shadow-sm",
                isDark && "dark",
            )}
            style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position ? "visible" : "hidden",
            }}
        >
            {getPlayheadLabel(model, positionBeat, pageLabel)}
        </div>,
        document.body,
    );
};

export const TimelinePlayhead = ({
    model,
    positionBeat,
    pageLabel,
    pixelsPerBeat,
    height,
    beatCount,
    anchorRef,
    onHoverChange,
    onFocusChange,
    onSeek,
}: {
    model: TimelineViewModel;
    positionBeat: BeatPosition;
    pageLabel?: string;
    pixelsPerBeat: number;
    height: number;
    beatCount: number;
    anchorRef: RefObject<HTMLButtonElement | null>;
    onHoverChange: (hovered: boolean) => void;
    onFocusChange: (focused: boolean) => void;
    onSeek?: (beat: BeatPosition) => void;
}) => (
    <button
        ref={anchorRef}
        type="button"
        data-testid="timeline-playhead"
        data-timeline-scrub="true"
        aria-label={`Playback position: ${getPlayheadLabel(model, positionBeat, pageLabel)}`}
        onPointerDown={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverChange(true)}
        onPointerLeave={() => onHoverChange(false)}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        onKeyDown={(event) => {
            const delta =
                event.key === "ArrowLeft"
                    ? -1
                    : event.key === "ArrowRight"
                      ? 1
                      : 0;
            if (delta === 0 || !onSeek) return;
            event.preventDefault();
            onSeek(clamp(Math.round(positionBeat) + delta, 0, beatCount));
        }}
        className="focus-visible:ring-accent pointer-events-auto absolute top-0 z-50 w-12 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2"
        style={{
            left: beatToX(positionBeat, pixelsPerBeat),
            height,
        }}
    >
        <span className="border-t-accent absolute top-0 left-1/2 size-0 -translate-x-1/2 border-t-[6px] border-r-[4px] border-l-[4px] border-r-transparent border-l-transparent" />
        <span className="bg-accent absolute top-6 bottom-0 left-1/2 w-px" />
    </button>
);

/** How far, in pixels, a press on empty timeline space must move to select a range */
export const TIMELINE_RANGE_DRAG_PX = 4;

/**
 * The range a drag on empty timeline space selects (ui.md UI-9 "Creating a timeline"): from where
 * it started to where it is, each edge snapped as in UI-2 (Alt turns snapping off), in order.
 * `null` while it covers no whole beat.
 */
export const getDraggedRange = ({
    fromBeat,
    toBeat,
    snapBeats,
    pixelsPerBeat,
    beatCount,
}: {
    fromBeat: number;
    toBeat: number;
    snapBeats: readonly number[];
    pixelsPerBeat: number;
    beatCount: number;
}): TimelineBeatRange | null => {
    const edge = (beat: number) =>
        clamp(snapBoundary({ beat, snapBeats, pixelsPerBeat }), 0, beatCount);
    const a = edge(fromBeat);
    const b = edge(toBeat);
    if (a === b) return null;
    return { startBeatIndex: Math.min(a, b), endBeatIndex: Math.max(a, b) };
};

/**
 * The pointer on the timeline's surface. Pressing the playhead and dragging scrubs it. On empty
 * space, a click seeks; with `onRangeSelect`, a drag selects the dragged range instead (UI-9),
 * shown as `rangePreview` until it's released. Without it, a drag scrubs.
 */
export const useTimelinePointer = ({
    onSeek,
    onRangeSelect,
    pixelsPerBeat,
    beatCount,
    snapBeats = [],
}: {
    onSeek?: (beat: number) => void;
    onRangeSelect?: (range: TimelineBeatRange) => void;
    pixelsPerBeat: number;
    beatCount: number;
    snapBeats?: readonly number[];
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [rangePreview, setRangePreview] = useState<TimelineBeatRange | null>(
        null,
    );
    const gesture = useRef<{
        mode: "scrub" | "press" | "range";
        startClientX: number;
        startBeat: number;
    } | null>(null);
    const draggedRange = (
        event: ReactPointerEvent<HTMLElement>,
        startBeat: number,
    ) =>
        getDraggedRange({
            fromBeat: startBeat,
            toBeat: pointerBeat(event),
            snapBeats: isPageSnapDisabled(event) ? [] : snapBeats,
            pixelsPerBeat,
            beatCount,
        });
    const pointerBeat = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            return clientXToBeat({
                clientX: event.clientX,
                surfaceLeft: bounds.left,
                pixelsPerBeat,
                startBeat: 0,
                beatCount,
            });
        },
        [beatCount, pixelsPerBeat],
    );
    const seek = useCallback(
        (beat: number) => onSeek?.(Math.round(beat)),
        [onSeek],
    );

    const end = () => {
        gesture.current = null;
        setIsDragging(false);
        setRangePreview(null);
    };

    return {
        isDragging,
        rangePreview,
        pointerHandlers: {
            onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
                const current = gesture.current;
                if (!current) return;
                if (current.mode === "scrub") {
                    seek(pointerBeat(event));
                    return;
                }
                if (
                    current.mode === "press" &&
                    Math.abs(event.clientX - current.startClientX) <
                        TIMELINE_RANGE_DRAG_PX
                )
                    return;
                current.mode = "range";
                setRangePreview(draggedRange(event, current.startBeat));
            },
            onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
                if (
                    (event.button !== undefined && event.button !== 0) ||
                    // macOS ctrl+click is a right-click: it opens the context menu, not a seek
                    event.ctrlKey ||
                    (event.target instanceof Element &&
                        event.target.closest("[data-timeline-interactive]"))
                )
                    return;
                const onPlayhead =
                    event.target instanceof Element &&
                    event.target.closest("[data-timeline-scrub]") != null;
                const startBeat = pointerBeat(event);
                gesture.current = {
                    mode: onPlayhead || !onRangeSelect ? "scrub" : "press",
                    startClientX: event.clientX,
                    startBeat,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
                if (gesture.current.mode === "scrub") {
                    setIsDragging(true);
                    if (!onPlayhead) seek(startBeat);
                }
            },
            onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
                const current = gesture.current;
                if (!current) return;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
                if (current.mode === "range") {
                    const range = draggedRange(event, current.startBeat);
                    end();
                    if (range) onRangeSelect?.(range);
                    return;
                }
                end();
                seek(
                    current.mode === "press"
                        ? current.startBeat
                        : pointerBeat(event),
                );
            },
            onPointerCancel: end,
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
