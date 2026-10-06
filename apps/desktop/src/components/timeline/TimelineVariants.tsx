import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent,
} from "react";
import { PlusIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { TimelineGridCanvas, TimelineWaveformCanvas } from "./TimelineCanvas";
import {
    beatToX,
    clamp,
    getPageSnapBeats,
    getWindowCountLabel,
    getSelectionRange,
    getTrackRange,
    sameRange,
    packTimelineTracks,
} from "./TimelineGeometry";
import {
    TIMELINE_MAX_PX_PER_BEAT,
    TIMELINE_INITIAL_PAGE_WIDTH,
    TIMELINE_MIN_PX_PER_BEAT,
    TimelinePageLines,
    TimelinePlayhead,
    TimelineRehearsalMarkers,
    TimelineRuler,
    TimelineSelectionRange,
    type TimelineSelectionInteraction,
    TimelineShell,
    TimelineTrackClip,
    TimelineTransport,
    useElementWidth,
    useTimelinePointer,
} from "./TimelinePrimitives";
import { markedRangeAt, useTimelineRangeMenu } from "./TimelineRangeMenu";
import { isTyping, overlayOpen } from "./timelineHotkeys";
import type {
    TimelineCommonProps,
    TimelineNavigation,
    TimelineSelection,
} from "./TimelineViewModel";

type TimelineDensity = "expanded" | "collapsed";

/** Timeline's starting zoom, and the least a second Fit zooms in to when it can't go back */
const TIMELINE_DEFAULT_PX_PER_BEAT = 16;

/** How far above the fitted zoom a remembered zoom must be for a second Fit to go back to it */
const FIT_BACK_MARGIN = 1.05;

/**
 * The zoom a second Fit goes back to (UI-12): the zoom from before Fit when it is visibly closer
 * in than the fit, else twice the fit (at least the starting zoom), so Fit always does something.
 * Zooming out stops at the fit, so going back to a zoom at or under it would do nothing.
 */
export function fitBackZoom(
    zoomBeforeFit: number | null,
    fitValue: number,
): number {
    const back =
        zoomBeforeFit !== null && zoomBeforeFit > fitValue * FIT_BACK_MARGIN
            ? zoomBeforeFit
            : Math.max(TIMELINE_DEFAULT_PX_PER_BEAT, fitValue * 2);
    return Math.min(back, TIMELINE_MAX_PX_PER_BEAT);
}

/** How much one pixel of wheel or pinch delta zooms */
const WHEEL_ZOOM_RATE = 0.0025;

/**
 * The timeline's zoom (UI-12), native to trackpads and wheels:
 * - A pinch, or Ctrl/Cmd+scroll, zooms smoothly about the pointer. Events are gathered and applied
 *   once a frame, and the scroll that keeps the beat under the pointer is set after React draws
 *   the new width and before the browser paints it, so nothing drifts.
 * - A plain vertical scroll or swipe scrolls the timeline sideways; a sideways swipe already does.
 * - Fit (or Shift+Z) fits the show; again goes back, about the playhead. Zooming out stops at the
 *   fitted zoom, so a show never shows as a sliver; while fitted it stays fitted as the viewport or
 *   the show changes (`fitted`, remembered by the caller).
 */
const useTimelineZoom = ({
    viewportRef,
    pixelsPerBeat,
    beatCount,
    leadingInset,
    playheadBeat,
    onPixelsPerBeatChange,
    fitted: rememberedFitted,
    onFittedChange,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    pixelsPerBeat: number;
    beatCount: number;
    leadingInset: number;
    playheadBeat: number;
    onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
    fitted?: boolean;
    onFittedChange?: (fitted: boolean) => void;
}) => {
    const viewportWidth = useElementWidth(viewportRef);
    const fitValue =
        beatCount > 0 && viewportWidth > 0
            ? clamp(
                  Math.max(0, viewportWidth - leadingInset) / beatCount,
                  TIMELINE_MIN_PX_PER_BEAT,
                  TIMELINE_MAX_PX_PER_BEAT,
              )
            : null;
    const minimum = fitValue ?? TIMELINE_MIN_PX_PER_BEAT;
    const isFitted =
        fitValue !== null && Math.abs(pixelsPerBeat - fitValue) < 0.01;
    const latest = useRef({ pixelsPerBeat, minimum, onPixelsPerBeatChange });
    latest.current = { pixelsPerBeat, minimum, onPixelsPerBeatChange };
    /** The beat to keep at `anchorPx` once `pixelsPerBeat` lands on `next` */
    const pendingScroll = useRef<{
        next: number;
        anchorBeat: number;
        anchorPx: number;
    } | null>(null);
    const pendingWheel = useRef<{ factor: number; anchorPx: number } | null>(
        null,
    );
    const frame = useRef(0);
    /**
     * The zoom from before Fit, so a second Fit goes back to it. Per surface: switching compact
     * remounts it, and a second Fit then zooms in from the fit instead.
     */
    const zoomBeforeFit = useRef<number | null>(null);
    /** Set when the effect below fits a resized show, so the remember effect skips that commit */
    const autoFitted = useRef(false);

    /** Zooms to `next`, keeping `anchorBeat` at `anchorPx` from the viewport's left */
    const zoomTo = useCallback(
        (next: number, anchorPx: number, anchorBeat?: number) => {
            const viewport = viewportRef.current;
            const {
                pixelsPerBeat: current,
                minimum: floor,
                onPixelsPerBeatChange: change,
            } = latest.current;
            if (!viewport || !change) return;
            const bounded = clamp(next, floor, TIMELINE_MAX_PX_PER_BEAT);
            if (Math.abs(bounded - current) < 0.001) return;
            pendingScroll.current = {
                next: bounded,
                anchorPx,
                anchorBeat:
                    anchorBeat ??
                    (viewport.scrollLeft + anchorPx - leadingInset) / current,
            };
            latest.current = { ...latest.current, pixelsPerBeat: bounded };
            change(bounded);
        },
        [leadingInset, viewportRef],
    );

    // After React has drawn the new width, before the browser paints: keep the anchor in place
    useLayoutEffect(() => {
        const pending = pendingScroll.current;
        const viewport = viewportRef.current;
        if (!pending || !viewport) return;
        if (Math.abs(pending.next - pixelsPerBeat) > 0.001) return;
        pendingScroll.current = null;
        viewport.scrollLeft = Math.max(
            0,
            leadingInset +
                pending.anchorBeat * pixelsPerBeat -
                pending.anchorPx,
        );
    }, [leadingInset, pixelsPerBeat, viewportRef]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                const anchorPx =
                    event.clientX - viewport.getBoundingClientRect().left;
                // Lines (some mice) are about 16px each
                const delta =
                    event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
                const factor = Math.exp(-delta * WHEEL_ZOOM_RATE);
                pendingWheel.current = {
                    factor: (pendingWheel.current?.factor ?? 1) * factor,
                    anchorPx,
                };
                if (frame.current) return;
                frame.current = requestAnimationFrame(() => {
                    frame.current = 0;
                    const wheel = pendingWheel.current;
                    pendingWheel.current = null;
                    if (!wheel) return;
                    zoomTo(
                        latest.current.pixelsPerBeat * wheel.factor,
                        wheel.anchorPx,
                    );
                });
                return;
            }
            // A vertical scroll or swipe scrolls the timeline sideways; it has no rows to scroll
            if (
                Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
                viewport.scrollWidth > viewport.clientWidth
            ) {
                event.preventDefault();
                viewport.scrollLeft +=
                    event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
            }
        };
        viewport.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            viewport.removeEventListener("wheel", onWheel);
            cancelAnimationFrame(frame.current);
            frame.current = 0;
        };
    }, [viewportRef, zoomTo]);

    // Never smaller than the show: a remembered zoom from a longer show, a wider window, or a
    // remembered Fit fits this one
    useEffect(() => {
        if (fitValue === null || !onPixelsPerBeatChange) return;
        if (
            (rememberedFitted || pixelsPerBeat < fitValue) &&
            Math.abs(pixelsPerBeat - fitValue) > 0.01
        ) {
            autoFitted.current = true;
            onPixelsPerBeatChange(fitValue);
            const viewport = viewportRef.current;
            if (viewport) viewport.scrollLeft = 0;
        }
        // Only when the fit itself changes, or on the first measure
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitValue]);

    // Remember whether the timeline is fitted, so the next show opens fitted too. Not in the
    // commit where the effect above fits a resize: the zoom here is still the old one, and
    // writing "not fitted" then "fitted" again would save twice on every resize.
    useEffect(() => {
        if (autoFitted.current) {
            autoFitted.current = false;
            return;
        }
        if (fitValue === null || rememberedFitted === isFitted) return;
        onFittedChange?.(isFitted);
    }, [fitValue, isFitted, onFittedChange, rememberedFitted]);

    const fit = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || !onPixelsPerBeatChange || fitValue === null) return;
        if (isFitted) {
            const back = fitBackZoom(zoomBeforeFit.current, fitValue);
            zoomBeforeFit.current = null;
            // Back about the playhead, where the work is
            zoomTo(back, viewport.clientWidth / 2, playheadBeat);
            return;
        }
        zoomBeforeFit.current = pixelsPerBeat;
        onPixelsPerBeatChange(fitValue);
        viewport.scrollLeft = 0;
    }, [
        fitValue,
        isFitted,
        onPixelsPerBeatChange,
        pixelsPerBeat,
        playheadBeat,
        viewportRef,
        zoomTo,
    ]);

    // Shift+Z fits, or goes back, unless a text field, popover, menu or dialog has the keys
    useEffect(() => {
        if (!onPixelsPerBeatChange) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() !== "z" ||
                !event.shiftKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                event.repeat ||
                isTyping(event.target) ||
                overlayOpen()
            )
                return;
            event.preventDefault();
            fit();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [fit, onPixelsPerBeatChange]);

    return { fit, fitted: isFitted };
};

const navigateToPage = ({
    direction,
    currentBeat,
    pages,
}: {
    direction: TimelineNavigation;
    currentBeat: number;
    pages: TimelineCommonProps["model"]["pages"];
}) => {
    if (pages.length === 0) return 0;
    const timedPages = pages.filter((page) => !page.isInitial);
    const ordered = [...(timedPages.length > 0 ? timedPages : pages)].sort(
        (a, b) => a.atBeat - b.atBeat,
    );
    if (direction === "first-page") return ordered[0].atBeat;
    if (direction === "last-page") return ordered[ordered.length - 1].atBeat;
    if (direction === "previous-page") {
        return (
            [...ordered].reverse().find((page) => page.atBeat < currentBeat)
                ?.atBeat ?? ordered[0].atBeat
        );
    }
    return (
        ordered.find((page) => page.atBeat > currentBeat)?.atBeat ??
        ordered[ordered.length - 1].atBeat
    );
};

const transportNavigation = (props: TimelineCommonProps) =>
    props.onNavigate ??
    (props.onSeek
        ? (direction: TimelineNavigation) =>
              props.onSeek?.(
                  navigateToPage({
                      direction,
                      currentBeat: props.positionBeat,
                      pages: props.model.pages,
                  }),
              )
        : undefined);

/**
 * The waveform lane (UI-12): the waveform in the rest tone, with the played tone laid over it up
 * to the playhead. While playing the played part follows the live position every frame by
 * resizing its clip, so the canvases are never redrawn for it.
 */
function TimelineWaveformLane({
    waveform,
    top,
    width,
    height,
    pixelsPerBeat,
    positionBeat,
    livePositionBeat,
}: {
    waveform: TimelineCommonProps["model"]["waveform"];
    top: number;
    width: number;
    height: number;
    pixelsPerBeat: number;
    positionBeat: number;
    livePositionBeat?: () => number | null;
}) {
    const playedRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const played = playedRef.current;
        if (!played) return;
        if (!livePositionBeat) {
            played.style.width = `${Math.max(0, positionBeat * pixelsPerBeat)}px`;
            return;
        }
        let frame = 0;
        const update = () => {
            const beat = livePositionBeat() ?? positionBeat;
            played.style.width = `${Math.max(0, beat * pixelsPerBeat)}px`;
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [livePositionBeat, pixelsPerBeat, positionBeat]);
    return (
        <div
            className="rounded-4 pointer-events-none absolute left-0 overflow-hidden"
            style={{ top, width, height }}
        >
            <TimelineWaveformCanvas
                waveform={waveform}
                width={width}
                height={height}
                pixelsPerBeat={pixelsPerBeat}
                tone="rest"
            />
            <div
                ref={playedRef}
                className="absolute inset-y-0 left-0 overflow-hidden"
            >
                <TimelineWaveformCanvas
                    waveform={waveform}
                    width={width}
                    height={height}
                    pixelsPerBeat={pixelsPerBeat}
                    tone="played"
                />
            </div>
        </div>
    );
}

function TimelineSurface({
    density,
    ...props
}: TimelineCommonProps & { density: TimelineDensity }) {
    const {
        model,
        pixelsPerBeat,
        positionBeat,
        selection,
        selectedTarget,
        showTransport = true,
        className,
    } = props;
    const expanded = density === "expanded";
    const viewportRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLButtonElement>(null);
    const rows = useMemo(
        () => packTimelineTracks(model.tracks),
        [model.tracks],
    );
    const snapBeats = useMemo(
        () =>
            getPageSnapBeats({
                pages: model.pages,
                beatCount: model.beatCount,
            }),
        [model.beatCount, model.pages],
    );
    const width = model.beatCount * pixelsPerBeat;
    const initialPageWidth = model.pages.some((page) => page.isInitial)
        ? TIMELINE_INITIAL_PAGE_WIDTH
        : 0;
    const surfaceWidth = width + initialPageWidth;
    // UI-12: the ruler (28px) and the measure row; then the waveform, when audio is loaded, so it
    // stays put as clips come and go; then the clip rows, one always kept (with no chrome), so the
    // first off-page clip doesn't move the ruler right after the drag that made it
    const railHeight = expanded ? 20 : 17;
    const showWaveform = model.waveform.peaksByBeat.some(
        (peaks) => peaks.length > 0,
    );
    const waveformHeight = expanded ? 32 : 12;
    const audioTop = 28 + railHeight + 2;
    const trackTop = showWaveform ? audioTop + waveformHeight + 4 : audioTop;
    const rowPitch = expanded ? 22 : 12;
    const trackHeight = expanded ? 14 : 6;
    // Compact bars sit in a hit area as tall as their row, so rows never share a click
    const clipHitHeight = expanded ? trackHeight : rowPitch;
    const trackBandHeight = Math.max(rows.length, 1) * rowPitch;
    const timelineHeight = trackTop + trackBandHeight + (expanded ? 2 : 0);
    const selectionRange = getSelectionRange(selection);
    const [selectionInteraction, setSelectionInteraction] =
        useState<TimelineSelectionInteraction | null>(null);
    const selectionIdentity = selection?.kind ?? "none";
    useEffect(() => {
        setSelectionInteraction(null);
    }, [
        selectionIdentity,
        selectionRange?.endBeatIndex,
        selectionRange?.startBeatIndex,
    ]);
    const displayedSelectionRange = selectionRange
        ? (selectionInteraction?.range ?? selectionRange)
        : null;
    const selectionDragging = selectionInteraction?.dragging ?? false;
    const countFollowsStart =
        selectionDragging && selectionInteraction?.activeHandle === "start";
    const countRendersToLeft = displayedSelectionRange
        ? countFollowsStart
            ? displayedSelectionRange.startBeatIndex > 0
            : displayedSelectionRange.endBeatIndex >= model.beatCount
        : false;
    const zoom = useTimelineZoom({
        viewportRef,
        pixelsPerBeat,
        beatCount: model.beatCount,
        leadingInset: initialPageWidth,
        playheadBeat: positionBeat,
        onPixelsPerBeatChange: props.onPixelsPerBeatChange,
        fitted: props.zoomFitted,
        onFittedChange: props.onZoomFittedChange,
    });
    // The owner seeks on a selection (UI-9: to a range's end, or home's beat 0)
    const onSelectionChange = (next: TimelineSelection) =>
        props.onSelectionChange?.(next);
    // UI-12: clicks and scrubs land on a nearby downbeat or page line
    const seekSnapBeats = useMemo(
        () =>
            [
                ...new Set([
                    ...snapBeats,
                    ...model.measures.map((measure) => measure.atBeat),
                ]),
            ].sort((a, b) => a - b),
        [model.measures, snapBeats],
    );
    const pointer = useTimelinePointer({
        seekSnapBeats,
        onSeek: props.onSeek,
        onRangeSelect: props.onSelectionChange
            ? (range) =>
                  onSelectionChange({ kind: "range", range, drawn: true })
            : undefined,
        pixelsPerBeat,
        beatCount: model.beatCount,
        snapBeats,
    });
    // UI-13: the window's count shows while a handle is dragged, or when the window starts off a
    // page line; from a page line, it is the playhead's count, which the transport already shows
    const showWindowCount =
        displayedSelectionRange != null &&
        (selectionDragging ||
            !snapBeats.includes(displayedSelectionRange.startBeatIndex));
    const showCreateTrack =
        selection?.kind === "range" &&
        selectedTarget != null &&
        selectionRange != null &&
        props.onCreateTrack != null &&
        !selectionDragging;
    const transportProps = {
        ...props,
        onNavigate: transportNavigation(props),
    };
    // The right-click menu's target: a page box or clip under the pointer, else a dragged range
    // the pointer is inside (UI-9 Adding marchers, Creating a timeline)
    const rangeMenu = useTimelineRangeMenu({
        menu: props.addSelectedMarchers,
        resolveRange: (event: MouseEvent<HTMLElement>) => {
            const marked = markedRangeAt(event.target);
            if (marked) return marked;
            if (selection?.kind !== "range" || !selectionRange) return null;
            const surface = event.currentTarget.querySelector(
                '[data-testid="timeline-pointer-surface"]',
            );
            if (!surface) return null;
            const beat =
                (event.clientX - surface.getBoundingClientRect().left) /
                pixelsPerBeat;
            return beat >= selectionRange.startBeatIndex &&
                beat <= selectionRange.endBeatIndex
                ? { range: selectionRange }
                : null;
        },
    });

    return (
        <TimelineShell
            viewportRef={viewportRef}
            className={className}
            transport={
                showTransport ? (
                    <TimelineTransport
                        model={model}
                        clock={props.transportClock}
                        accessories={props.transportAccessories}
                        secondary={props.transportSecondary}
                        viewControls={props.transportViewControls}
                        onSeek={props.onSeek}
                        onSelectionChange={
                            props.onSelectionChange
                                ? onSelectionChange
                                : undefined
                        }
                        positionBeat={positionBeat}
                        isPlaying={transportProps.isPlaying}
                        onPlayingChange={transportProps.onPlayingChange}
                        onStop={transportProps.onStop}
                        onNavigate={transportProps.onNavigate}
                        onFit={
                            props.onPixelsPerBeatChange ? zoom.fit : undefined
                        }
                        fitted={zoom.fitted}
                    />
                ) : undefined
            }
        >
            <div
                className="relative"
                style={{ width: surfaceWidth, height: timelineHeight }}
                onContextMenu={rangeMenu.onContextMenu}
                onDoubleClick={(event) => {
                    const marked = markedRangeAt(event.target);
                    if (marked) props.onOpenRange?.(marked);
                }}
            >
                <div
                    {...pointer.pointerHandlers}
                    data-testid="timeline-pointer-surface"
                    className="absolute top-0 touch-none"
                    style={{
                        left: initialPageWidth,
                        width,
                        height: timelineHeight,
                    }}
                >
                    <TimelineGridCanvas
                        width={width}
                        height={timelineHeight}
                        pixelsPerBeat={pixelsPerBeat}
                        measures={model.measures}
                        lineTop={28}
                        topTickY={34}
                        // UI-12: one row of beat ticks, in the measure row
                        bottomTickY={null}
                    />
                    <TimelinePageLines
                        pages={model.pages}
                        pixelsPerBeat={pixelsPerBeat}
                        height={timelineHeight}
                    />
                    <TimelineRuler
                        pages={model.pages}
                        measures={model.measures}
                        beatCount={model.beatCount}
                        pixelsPerBeat={pixelsPerBeat}
                        selection={selection}
                        onSelectionChange={onSelectionChange}
                        onSeek={props.onSeek}
                        initialPageWidth={initialPageWidth}
                        showMeasures={expanded}
                        seekSnapBeats={seekSnapBeats}
                        positionBeat={positionBeat}
                    />
                    {rows.flatMap((row, rowIndex) =>
                        row.map((track) => (
                            <TimelineTrackClip
                                key={track.id}
                                track={track}
                                pixelsPerBeat={pixelsPerBeat}
                                top={
                                    trackTop +
                                    rowIndex * rowPitch -
                                    (clipHitHeight - trackHeight) / 2
                                }
                                height={clipHitHeight}
                                barHeight={expanded ? undefined : trackHeight}
                                // A clip is its timeline: it shows selected when its range is
                                // the selection, and clicking it selects that range (UI-12)
                                selected={sameRange(
                                    getTrackRange(track),
                                    selectionRange,
                                )}
                                onSelect={
                                    props.onSelectionChange
                                        ? () => {
                                              const range =
                                                  getTrackRange(track);
                                              if (range)
                                                  onSelectionChange({
                                                      kind: "range",
                                                      range,
                                                  });
                                          }
                                        : undefined
                                }
                                onRangeCommit={props.onTimelineRangeCommit}
                                beatCount={model.beatCount}
                                snapBeats={snapBeats}
                                micro={!expanded}
                            />
                        )),
                    )}
                    {showWaveform && (
                        <TimelineWaveformLane
                            waveform={model.waveform}
                            top={audioTop}
                            width={width}
                            height={waveformHeight}
                            pixelsPerBeat={pixelsPerBeat}
                            positionBeat={positionBeat}
                            livePositionBeat={
                                props.isPlaying
                                    ? props.livePositionBeat
                                    : undefined
                            }
                        />
                    )}
                    <TimelineRehearsalMarkers
                        model={model}
                        pixelsPerBeat={pixelsPerBeat}
                        top={expanded ? 30 : 29}
                        compact={!expanded}
                        onSeek={props.onSeek}
                    />
                    <TimelinePlayhead
                        model={model}
                        positionBeat={positionBeat}
                        livePositionBeat={
                            props.isPlaying ? props.livePositionBeat : undefined
                        }
                        pixelsPerBeat={pixelsPerBeat}
                        height={timelineHeight}
                        beatCount={model.beatCount}
                        anchorRef={playheadRef}
                        onSeek={props.onSeek}
                        isPlaying={props.isPlaying}
                    />
                    {props.onAddPageFlag && !props.isPlaying && (
                        <button
                            type="button"
                            data-testid="timeline-add-page-flag"
                            data-timeline-interactive="true"
                            aria-label="Add a page flag here"
                            title="Add a page flag here"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={props.onAddPageFlag}
                            className="bg-accent text-text-invert focus-visible:ring-accent pointer-events-auto absolute top-6 z-[60] flex size-16 items-center justify-center rounded-full outline-hidden focus-visible:ring-2"
                            style={{
                                left: beatToX(positionBeat, pixelsPerBeat) + 8,
                            }}
                        >
                            <PlusIcon size={10} weight="bold" />
                        </button>
                    )}
                    {pointer.rangePreview && (
                        <div
                            data-testid="timeline-range-preview"
                            aria-hidden="true"
                            className="bg-accent/15 border-accent pointer-events-none absolute top-28 z-30 border-x"
                            style={{
                                left:
                                    pointer.rangePreview.startBeatIndex *
                                    pixelsPerBeat,
                                width:
                                    (pointer.rangePreview.endBeatIndex -
                                        pointer.rangePreview.startBeatIndex) *
                                    pixelsPerBeat,
                                height: Math.max(0, timelineHeight - 28),
                            }}
                        />
                    )}
                    {selectionRange && (
                        <TimelineSelectionRange
                            range={selectionRange}
                            startFlagBeatIndex={
                                selection?.kind === "range"
                                    ? selection.startFlagBeatIndex
                                    : undefined
                            }
                            fromStart={
                                selection?.kind === "range" &&
                                selection.fromStart === true
                            }
                            onFromStartOff={props.onPlayFromStartOff}
                            startPinned={
                                selection?.kind === "range" &&
                                selection.startPinned === true
                            }
                            onUnpin={props.onUnpinStart}
                            pinTop={expanded ? 29 : 28}
                            pinSize={expanded ? 18 : 14}
                            beatCount={model.beatCount}
                            pixelsPerBeat={pixelsPerBeat}
                            height={timelineHeight}
                            snapBeats={snapBeats}
                            onCommit={
                                props.onSelectionChange
                                    ? (range) =>
                                          props.onSelectionChange?.({
                                              kind: "range",
                                              range,
                                          })
                                    : undefined
                            }
                            onInteractionChange={setSelectionInteraction}
                        />
                    )}
                    {displayedSelectionRange && (
                        <div
                            data-testid="timeline-selection-actions"
                            className="absolute z-40 flex flex-col gap-4"
                            style={{
                                left:
                                    (countFollowsStart
                                        ? displayedSelectionRange.startBeatIndex
                                        : displayedSelectionRange.endBeatIndex) *
                                        pixelsPerBeat +
                                    (countRendersToLeft ? -6 : 6),
                                top: expanded ? 31 : 29,
                                alignItems: countRendersToLeft
                                    ? "flex-end"
                                    : "flex-start",
                                transform: countRendersToLeft
                                    ? "translateX(-100%)"
                                    : undefined,
                            }}
                        >
                            {showWindowCount && (
                                <span
                                    data-testid="timeline-selection-count"
                                    className={clsx(
                                        "border-stroke bg-bg-1 text-text rounded-6 border font-mono whitespace-nowrap",
                                        expanded
                                            ? "px-8 py-2 text-[10px]"
                                            : "px-6 py-0 text-[9px]",
                                    )}
                                >
                                    {getWindowCountLabel(
                                        model,
                                        displayedSelectionRange,
                                    )}
                                </span>
                            )}
                            {showCreateTrack && selectedTarget && (
                                <button
                                    type="button"
                                    data-timeline-interactive="true"
                                    onClick={() =>
                                        props.onCreateTrack?.({
                                            target: selectedTarget,
                                            range: displayedSelectionRange,
                                        })
                                    }
                                    className="bg-accent text-text-invert rounded-full px-8 py-3 text-[11px] leading-none whitespace-nowrap"
                                >
                                    Create Track
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {rangeMenu.element}
            </div>
        </TimelineShell>
    );
}

export function ExpandedTimeline(props: TimelineCommonProps) {
    return <TimelineSurface {...props} density="expanded" />;
}

export function CollapsedTimeline(props: TimelineCommonProps) {
    return <TimelineSurface {...props} density="collapsed" />;
}
