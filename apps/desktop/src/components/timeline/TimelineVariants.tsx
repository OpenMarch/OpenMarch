import { wheelScrollsSideways } from "./timelineWheel";
import {
    memo,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent,
} from "react";
import { TimelineLoopBar } from "./TimelineLoopBar";
import { AddPageFlagMenu } from "./AddPageFlagMenu";
import { TimelinePaneStretchContext } from "./timelinePaneStretch";
import { flushSync } from "react-dom";
import { PlusIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { TimelineGridCanvas, TimelineWaveformCanvas } from "./TimelineCanvas";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    beatToX,
    clamp,
    getPageSnapBeats,
    getWindowCountLabel,
    isPastLastFlag,
    getSelectionRange,
    getTimelineRows,
    getTrackRange,
    sameRange,
    packTimelineTracks,
    TIMELINE_PAGE_ROW_BOTTOM,
    TIMELINE_PAGE_ROW_TOP,
} from "./TimelineGeometry";
import {
    TIMELINE_MAX_PX_PER_BEAT,
    TIMELINE_INITIAL_PAGE_WIDTH,
    TIMELINE_MIN_PX_PER_BEAT,
    TimelinePageLines,
    TimelinePlayhead,
    TimelineRehearsalMarkers,
    TimelineRangePreview,
    TimelineRuler,
    TimelineSelectionRange,
    type TimelineSelectionInteraction,
    TimelineShell,
    TimelineTrackClip,
    TimelineTransport,
    useElementHeight,
    useElementWidth,
    useScrubFollow,
    useTimelinePointer,
} from "./TimelinePrimitives";
import { markedRangeAt, useTimelineRangeMenu } from "./TimelineRangeMenu";
import { addPageFlagLeft } from "./PageKeepChain";
import { isTyping, overlayOpen } from "./timelineHotkeys";
import { useLatestCallback } from "./useLatestCallback";
import {
    createLiveValue,
    type TimelineLiveValue,
    useLiveValue,
} from "./timelineLiveValue";
import type {
    TimelineBeatRange,
    TimelineCommonProps,
    TimelineNavigation,
    TimelineTarget,
    TimelineTrackId,
} from "./TimelineViewModel";
import {
    TimelineBasicBodies,
    TimelineBasicExpertMarks,
    TimelineBasicPoints,
} from "./TimelineBasicLayers";

type TimelineDensity = "expanded" | "collapsed" | "basic";

/** Timeline's starting zoom, and the least a second Fit zooms in to when it can't go back */
const TIMELINE_DEFAULT_PX_PER_BEAT = 16;

/**
 * Room after the show's last beat: **+** (UI-9) is drawn just after the playhead, so with the
 * playhead on the last beat past the last flag (a page ending at the show's end) it needs this
 * much to stay on screen and clickable, fitted or scrolled to the end. The button's 8px gap, its
 * 16px, and 8px to spare.
 */
export const TIMELINE_END_INSET = 32;

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
    trailingInset,
    playheadBeat,
    onPixelsPerBeatChange,
    fitted: rememberedFitted,
    onFittedChange,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    pixelsPerBeat: number;
    beatCount: number;
    leadingInset: number;
    /** Room after the last beat (`TIMELINE_END_INSET`), left out of the fit */
    trailingInset: number;
    playheadBeat: number;
    onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
    fitted?: boolean;
    onFittedChange?: (fitted: boolean) => void;
}) => {
    const viewportWidth = useElementWidth(viewportRef);
    const fitValue =
        beatCount > 0 && viewportWidth > 0
            ? clamp(
                  Math.max(0, viewportWidth - leadingInset - trailingInset) /
                      beatCount,
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
            // Drawn now, in this frame, rather than in a later task once the frame has painted
            // with the old zoom, so the zoom isn't a frame behind the gesture (h-dom H4)
            flushSync(() => change(bounded));
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
            // A vertical scroll or swipe scrolls the timeline sideways, unless the tracks overflow
            // the pane and have rows to scroll
            if (wheelScrollsSideways(viewport, event.deltaX, event.deltaY)) {
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

    // The same function across zooms and beats, so the transport and the Shift+Z listener stay put
    const fit = useLatestCallback(() => {
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
    })!;

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
    beatCount,
}: {
    direction: TimelineNavigation;
    currentBeat: number;
    pages: TimelineCommonProps["model"]["pages"];
    beatCount: number;
}) => {
    if (direction === "previous-beat") return Math.max(currentBeat - 1, 0);
    if (direction === "next-beat") return Math.min(currentBeat + 1, beatCount);
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
                      beatCount: props.model.beatCount,
                  }),
              )
        : undefined);

/**
 * The waveform lane (UI-12): the waveform in the rest tone, with the played tone laid over it up
 * to the playhead. While playing the played part follows the live position every frame by
 * resizing its clip, so the canvases are never redrawn for it.
 */
const TimelineWaveformLane = memo(function TimelineWaveformLane({
    waveform,
    top,
    width,
    height,
    pixelsPerBeat,
    positionBeat,
    livePositionBeat,
    scrubLine,
    viewportRef,
    layerLeft,
}: {
    waveform: TimelineCommonProps["model"]["waveform"];
    viewportRef: React.RefObject<HTMLDivElement | null>;
    /** How far into the scroller's content the lane's left edge is */
    layerLeft: number;
    top: number;
    width: number;
    height: number;
    pixelsPerBeat: number;
    positionBeat: number;
    livePositionBeat?: () => number | null;
    /** While a scrub is down, the played part follows its line (`scrubLineBeat`) */
    scrubLine?: TimelineLiveValue<number | null>;
}) {
    const playedRef = useRef<HTMLDivElement>(null);
    const waveformStyle = useUiSettingsStore(
        (state) => state.uiSettings.timelineWaveformStyle,
    );
    useLayoutEffect(() => {
        const played = playedRef.current;
        if (!played) return;
        if (!livePositionBeat) {
            const draw = () => {
                const beat = scrubLine?.get() ?? positionBeat;
                played.style.width = `${Math.max(0, beat * pixelsPerBeat)}px`;
            };
            draw();
            return scrubLine?.subscribe(draw);
        }
        // While playing, and under the pointer while it is down on the timeline (`TimelinePlayhead`)
        const draw = () => {
            const beat = scrubLine?.get() ?? livePositionBeat() ?? positionBeat;
            played.style.width = `${Math.max(0, beat * pixelsPerBeat)}px`;
        };
        let frame = 0;
        const update = () => {
            draw();
            frame = requestAnimationFrame(update);
        };
        update();
        const unsubscribe = scrubLine?.subscribe(draw);
        return () => {
            cancelAnimationFrame(frame);
            unsubscribe?.();
        };
    }, [livePositionBeat, pixelsPerBeat, positionBeat, scrubLine]);
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
                viewportRef={viewportRef}
                layerLeft={layerLeft}
                waveformStyle={waveformStyle}
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
                    viewportRef={viewportRef}
                    layerLeft={layerLeft}
                    waveformStyle={waveformStyle}
                    tone="played"
                />
            </div>
        </div>
    );
});

const sameInteraction = (
    a: TimelineSelectionInteraction | null,
    b: TimelineSelectionInteraction | null,
) =>
    a === b ||
    (a !== null &&
        b !== null &&
        sameRange(a.range, b.range) &&
        a.activeHandle === b.activeHandle &&
        a.dragging === b.dragging);

/**
 * The window's count and Create Track, beside the window's end, or its start while the start flag
 * is dragged. It follows a dragged flag (`interaction`) on its own, without re-rendering the
 * timeline on each move.
 */
const TimelineSelectionActions = memo(function TimelineSelectionActions({
    model,
    range,
    interaction,
    pixelsPerBeat,
    expanded,
    snapBeats,
    createTrackTarget,
    onCreateTrack,
}: {
    model: TimelineCommonProps["model"];
    range: TimelineBeatRange;
    interaction: TimelineLiveValue<TimelineSelectionInteraction | null>;
    pixelsPerBeat: number;
    expanded: boolean;
    snapBeats: readonly number[];
    /** What Create Track would make a track for; `null` hides it */
    createTrackTarget: TimelineTarget | null | undefined;
    onCreateTrack: TimelineCommonProps["onCreateTrack"];
}) {
    const current = useLiveValue(interaction);
    const displayedRange = current?.range ?? range;
    const dragging = current?.dragging ?? false;
    const countFollowsStart = dragging && current?.activeHandle === "start";
    const countRendersToLeft = countFollowsStart
        ? displayedRange.startBeatIndex > 0
        : displayedRange.endBeatIndex >= model.beatCount;
    // UI-13: the window's count shows while a handle is dragged, or when the window starts off a
    // page line; from a page line, it is the playhead's count, which the transport already shows.
    // Past the last flag it shows anyway: the designer reads off how long the next page would be
    const showWindowCount =
        dragging ||
        !snapBeats.includes(displayedRange.startBeatIndex) ||
        isPastLastFlag(model, displayedRange.endBeatIndex);
    const showCreateTrack = createTrackTarget != null && !dragging;
    return (
        <div
            data-testid="timeline-selection-actions"
            className="absolute z-40 flex flex-col gap-4"
            style={{
                left:
                    (countFollowsStart
                        ? displayedRange.startBeatIndex
                        : displayedRange.endBeatIndex) *
                        pixelsPerBeat +
                    (countRendersToLeft ? -6 : 6),
                top: TIMELINE_PAGE_ROW_BOTTOM + (expanded ? 3 : 1),
                alignItems: countRendersToLeft ? "flex-end" : "flex-start",
                transform: countRendersToLeft ? "translateX(-100%)" : undefined,
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
                    {getWindowCountLabel(model, displayedRange)}
                </span>
            )}
            {showCreateTrack && (
                <button
                    type="button"
                    data-timeline-interactive="true"
                    onClick={() =>
                        onCreateTrack?.({
                            target: createTrackTarget,
                            range: displayedRange,
                        })
                    }
                    className="bg-accent text-text-invert rounded-full px-8 py-3 text-[11px] leading-none whitespace-nowrap"
                >
                    Create Track
                </button>
            )}
        </div>
    );
});

const TimelineSurface = memo(function TimelineSurface({
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
    // UI-19 Basic: one row of page boxes with the music inside them; sized as expanded
    const basic = density === "basic";
    const expanded = density !== "collapsed";
    const viewportRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLButtonElement>(null);
    const addPageFlagRef = useRef<HTMLButtonElement>(null);
    const rows = useMemo(
        () => (basic ? [] : packTimelineTracks(model.tracks)),
        [basic, model.tracks],
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
    const surfaceWidth = width + initialPageWidth + TIMELINE_END_INSET;
    const showWaveform = model.waveform.peaksByBeat.some(
        (peaks) => peaks.length > 0,
    );
    const rowsLayout = getTimelineRows({
        expanded,
        showWaveform,
        rowCount: rows.length,
    });
    // Basic (UI-19): under each box's header (the page row) its body: the measure numbers, the
    // waveform, then the count ticks along the bottom. With no waveform (no audio, or hidden in
    // settings) the body is just the measure numbers and the ticks, so it is shorter
    const basicBodyHeight = showWaveform ? 60 : 30;
    const basicMeasureRow = 18;
    const basicAudioTop = TIMELINE_PAGE_ROW_BOTTOM + basicMeasureRow;
    const basicWaveformHeight = basicBodyHeight - basicMeasureRow - 12;
    const { rowPitch, trackHeight, clipHitHeight } = rowsLayout;
    // The measure row under the page boxes (as `getTimelineRows`), where the simple-defaults
    // study's mid-page ticks sit
    const railHeight = expanded ? 20 : 17;
    const audioTop = basic ? basicAudioTop : rowsLayout.audioTop;
    const waveformHeight = basic
        ? basicWaveformHeight
        : rowsLayout.waveformHeight;
    const trackTop = basic
        ? showWaveform
            ? basicAudioTop + basicWaveformHeight + 4
            : basicAudioTop
        : rowsLayout.trackTop;
    const timelineHeight = basic
        ? TIMELINE_PAGE_ROW_BOTTOM + basicBodyHeight
        : rowsLayout.timelineHeight;
    // The pane can be taller than the tracks (the splitter): the grid, page lines and playhead
    // fill it, the track rows keep their height. Only a pane with its own height: a fitted pane
    // is as tall as the surface (`TimelinePaneStretchContext`)
    const viewportHeight = useElementHeight(viewportRef);
    const stretch = useContext(TimelinePaneStretchContext);
    const surfaceHeight = stretch
        ? Math.max(timelineHeight, viewportHeight)
        : timelineHeight;
    // The ruler, measure row and the layers spanning the pane stay pinned at the viewport's top
    // while the tracks scroll under them, so they are as tall as the visible pane
    const pinnedHeight =
        viewportHeight > 0
            ? Math.min(viewportHeight, surfaceHeight)
            : surfaceHeight;
    const selectionRange = getSelectionRange(selection);
    // A dragged start flag's range: only the window's count reads it (`TimelineSelectionActions`)
    const [selectionInteraction] = useState(() =>
        createLiveValue<TimelineSelectionInteraction | null>(
            null,
            sameInteraction,
        ),
    );
    const selectionIdentity = selection?.kind ?? "none";
    useEffect(() => {
        selectionInteraction.set(null);
    }, [
        selectionInteraction,
        selectionIdentity,
        selectionRange?.endBeatIndex,
        selectionRange?.startBeatIndex,
    ]);
    const zoom = useTimelineZoom({
        viewportRef,
        pixelsPerBeat,
        beatCount: model.beatCount,
        leadingInset: initialPageWidth,
        trailingInset: TIMELINE_END_INSET,
        playheadBeat: positionBeat,
        onPixelsPerBeatChange: props.onPixelsPerBeatChange,
        fitted: props.zoomFitted,
        onFittedChange: props.onZoomFittedChange,
    });
    // The owner seeks on a selection (UI-9: to a range's end, or home's beat 0)
    const onSelectionChange = useLatestCallback(props.onSelectionChange);
    // UI-12: clicks and scrubs land on a nearby downbeat or page line; Basic's on any count
    // (UI-19: a mid-page edit happens at a count)
    const seekSnapBeats = useMemo(
        () =>
            basic
                ? Array.from({ length: model.beatCount + 1 }, (_, b) => b)
                : [
                      ...new Set([
                          ...snapBeats,
                          ...model.measures.map((measure) => measure.atBeat),
                      ]),
                  ].sort((a, b) => a - b),
        [basic, model.beatCount, model.measures, snapBeats],
    );
    // A dragged page flag also lands on the playhead when near; read when a drag starts, so the
    // ruler doesn't re-render as the playhead moves
    const playheadAt = useLatestCallback(() => positionBeat)!;
    const pointer = useTimelinePointer({
        seekSnapBeats,
        onSeek: props.onSeek,
        // Basic draws no ranges: every drag scrubs
        onRangeSelect:
            onSelectionChange && !basic
                ? (range) =>
                      onSelectionChange({ kind: "range", range, drawn: true })
                : undefined,
        pixelsPerBeat,
        beatCount: model.beatCount,
        snapBeats,
    });
    // **+** sits just after the playhead, so a scrub carries it along with the line
    useScrubFollow(
        addPageFlagRef,
        pointer.scrubLine,
        beatToX(positionBeat, pixelsPerBeat),
        pixelsPerBeat,
    );
    const onNavigate = useLatestCallback(transportNavigation(props));
    // A clip is its timeline: clicking it selects that range (UI-12)
    const selectTrack = useLatestCallback(
        onSelectionChange
            ? (trackId: TimelineTrackId) => {
                  const track = model.tracks.find((t) => t.id === trackId);
                  const range = track && getTrackRange(track);
                  if (range) onSelectionChange({ kind: "range", range });
              }
            : undefined,
    );
    const commitSelection = useLatestCallback(
        onSelectionChange
            ? (range: TimelineBeatRange) =>
                  onSelectionChange({ kind: "range", range })
            : undefined,
    );
    // The right-click menu's target: a page box or clip under the pointer, else a dragged range
    // the pointer is inside (UI-9 Adding marchers, Creating a timeline)
    // UI-14: the clip whose inline name field is open
    const [renaming, setRenaming] = useState<string | null>(null);
    const { moveCommands } = props;
    // Stable, so the memoized clips don't redraw on every render
    const startRename = useCallback(
        (trackId: TimelineTrackId) => setRenaming(String(trackId)),
        [],
    );
    const endRename = useCallback(() => setRenaming(null), []);
    const moveActions = (trackId: TimelineTrackId) =>
        moveCommands && {
            onEdit: () => moveCommands.onEdit(trackId),
            onRename: () => setRenaming(String(trackId)),
            onDelete: () => moveCommands.onDelete(trackId),
            disabledReason: moveCommands.disabledReason,
        };
    const rangeMenu = useTimelineRangeMenu({
        menu: props.addSelectedMarchers,
        movesFor: moveCommands
            ? (trackId) => {
                  const track = model.tracks.find(
                      (t) => String(t.id) === trackId,
                  );
                  return track ? (moveActions(track.id) ?? null) : null;
              }
            : undefined,
        resolveRange: (event: MouseEvent<HTMLElement>) => {
            const marked = markedRangeAt(event.target);
            if (marked) return marked;
            // Basic (UI-19): only page boxes have a menu; the window isn't drawn
            if (basic || selection?.kind !== "range" || !selectionRange)
                return null;
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
            pinnedHeight={audioTop}
            transport={
                showTransport ? (
                    <TimelineTransport
                        model={model}
                        clock={props.transportClock}
                        accessories={props.transportAccessories}
                        secondary={props.transportSecondary}
                        viewControls={props.transportViewControls}
                        onSeek={props.onSeek}
                        onSelectionChange={onSelectionChange}
                        positionBeat={positionBeat}
                        isPlaying={props.isPlaying}
                        onPlayingChange={props.onPlayingChange}
                        playLoops={props.playLoops}
                        playingOnce={props.playingOnce}
                        onPlayFromPlayhead={props.onPlayFromPlayhead}
                        onNavigate={onNavigate}
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
                style={{ width: surfaceWidth, height: surfaceHeight }}
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
                        height: surfaceHeight,
                    }}
                >
                    {basic && (
                        <TimelineBasicBodies
                            top={TIMELINE_PAGE_ROW_BOTTOM}
                            height={timelineHeight - TIMELINE_PAGE_ROW_BOTTOM}
                            width={width}
                        />
                    )}
                    {/* The grid and page lines under the tracks, pinned to the viewport's top
                        so they always fill the visible pane (UI-19 sticky ruler) */}
                    <div
                        data-testid="timeline-pinned-grid"
                        aria-hidden="true"
                        className="pointer-events-none sticky top-0 z-0 h-0"
                    >
                        <TimelineGridCanvas
                            width={width}
                            height={pinnedHeight}
                            pixelsPerBeat={pixelsPerBeat}
                            viewportRef={viewportRef}
                            layerLeft={initialPageWidth}
                            measures={model.measures}
                            lineTop={TIMELINE_PAGE_ROW_BOTTOM}
                            // The beat ticks are in the header's own canvas; Basic's along the
                            // floor of the box bodies (UI-19), below the header
                            topTickY={timelineHeight - 7}
                            showBeatTicks={basic}
                            bottomTickY={null}
                        />
                        <TimelinePageLines
                            pages={model.pages}
                            pixelsPerBeat={pixelsPerBeat}
                            height={pinnedHeight}
                        />
                    </div>
                    {/* The tracks: the waveform and the clip rows, the only part that scrolls
                        vertically, under the pinned ruler */}
                    <div
                        data-testid="timeline-tracks"
                        className="absolute inset-x-0 top-0 z-[1]"
                        style={{ height: surfaceHeight }}
                    >
                        {/* The waveform first, so a clip's resize tag above the first row paints
                            over it */}
                        {showWaveform && (
                            <TimelineWaveformLane
                                waveform={model.waveform}
                                viewportRef={viewportRef}
                                layerLeft={initialPageWidth}
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
                                scrubLine={pointer.scrubLine}
                            />
                        )}
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
                                    barHeight={
                                        expanded ? undefined : trackHeight
                                    }
                                    // A clip is its timeline: it shows selected when its range is
                                    // the selection, and clicking it selects that range (UI-12)
                                    selected={sameRange(
                                        getTrackRange(track),
                                        selectionRange,
                                    )}
                                    onSelect={selectTrack}
                                    onRangeCommit={props.onTimelineRangeCommit}
                                    resize={props.clipResize}
                                    downbeats={seekSnapBeats}
                                    snapPlayhead={playheadAt}
                                    beatCount={model.beatCount}
                                    snapBeats={snapBeats}
                                    micro={!expanded}
                                    moveCommands={moveCommands}
                                    renaming={renaming === String(track.id)}
                                    onRenameStart={startRename}
                                    onRenameEnd={endRename}
                                />
                            )),
                        )}
                    </div>
                    {/* Pinned to the viewport's top, over the tracks: the ruler and the measure
                        row, which hide the tracks scrolled under them, and the layers that span
                        the pane (playhead, flags, the window and the loop) */}
                    <div
                        data-testid="timeline-pinned"
                        className="sticky top-0 z-[2] h-0"
                    >
                        <div
                            data-testid="timeline-pinned-header"
                            // Opaque, so the tracks scrolled under it don't show through: the card's
                            // fg-1 is a translucent tint over bg-1. Basic has no tracks, and its
                            // box bodies show through
                            className={clsx(
                                "absolute top-0 left-0",
                                !basic && "bg-bg-1 bg-fg-1",
                            )}
                            style={{ width, height: audioTop }}
                        >
                            <TimelineGridCanvas
                                width={width}
                                height={audioTop}
                                pixelsPerBeat={pixelsPerBeat}
                                viewportRef={viewportRef}
                                layerLeft={initialPageWidth}
                                measures={model.measures}
                                lineTop={TIMELINE_PAGE_ROW_BOTTOM}
                                topTickY={TIMELINE_PAGE_ROW_BOTTOM + 6}
                                // UI-12: one row of beat ticks, in the measure row; Basic's are
                                // in the grid under the header
                                showBeatTicks={!basic}
                                bottomTickY={null}
                            />
                            <TimelinePageLines
                                pages={model.pages}
                                pixelsPerBeat={pixelsPerBeat}
                                height={audioTop}
                            />
                        </div>
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
                            scrubLine={pointer.scrubLine}
                            pageFlagMove={
                                props.isPlaying ? undefined : props.pageFlagMove
                            }
                            height={pinnedHeight}
                            flagSnapPlayhead={playheadAt}
                            // Only a show without measures numbers the playhead page's counts
                            positionBeat={
                                expanded &&
                                !basic &&
                                model.measures.length === 0
                                    ? positionBeat
                                    : undefined
                            }
                            holdMarks={props.holdMarks}
                            keepChains={props.keepChains}
                        />
                        <TimelineRehearsalMarkers
                            model={model}
                            pixelsPerBeat={pixelsPerBeat}
                            // Basic's measure row is at the top of the box bodies, as expanded's
                            top={TIMELINE_PAGE_ROW_BOTTOM + (expanded ? 2 : 1)}
                            compact={!expanded}
                            onSeek={props.onSeek}
                        />
                        {basic && props.expertMarks && (
                            <TimelineBasicExpertMarks
                                pages={model.pages}
                                marks={props.expertMarks}
                                pixelsPerBeat={pixelsPerBeat}
                            />
                        )}
                        {props.basicPoints && (
                            <TimelineBasicPoints
                                points={props.basicPoints}
                                // In the box bodies (Basic), else across the measure row
                                top={TIMELINE_PAGE_ROW_BOTTOM}
                                height={
                                    basic
                                        ? timelineHeight -
                                          TIMELINE_PAGE_ROW_BOTTOM
                                        : railHeight
                                }
                                pixelsPerBeat={pixelsPerBeat}
                                onSeek={props.onSeek}
                                onRemove={props.onRemoveBasicPoint}
                            />
                        )}
                        <TimelinePlayhead
                            model={model}
                            positionBeat={positionBeat}
                            livePositionBeat={
                                props.isPlaying
                                    ? props.livePositionBeat
                                    : undefined
                            }
                            pixelsPerBeat={pixelsPerBeat}
                            height={pinnedHeight}
                            beatCount={model.beatCount}
                            anchorRef={playheadRef}
                            onSeek={props.onSeek}
                            isPlaying={props.isPlaying}
                            scrubLine={pointer.scrubLine}
                        />
                        {props.onAddPageFlag && !props.isPlaying && (
                            <AddPageFlagMenu
                                onAddPage={props.onAddPageFlag}
                                onAddSubsetPage={props.onAddSubsetPage}
                                names={props.addPageNames}
                            >
                                <button
                                    ref={addPageFlagRef}
                                    type="button"
                                    data-testid="timeline-add-page-flag"
                                    data-timeline-interactive="true"
                                    aria-label="Add a page flag here"
                                    title="Add a page flag here"
                                    onPointerDown={(event) =>
                                        event.stopPropagation()
                                    }
                                    onClick={props.onAddPageFlag}
                                    className="bg-accent text-text-invert focus-visible:ring-accent pointer-events-auto absolute z-[60] flex size-16 items-center justify-center rounded-full outline-hidden focus-visible:ring-2"
                                    // Past the playhead's box's keep chain, if it would cover it
                                    style={{
                                        left: addPageFlagLeft({
                                            pages: model.pages,
                                            beatCount: model.beatCount,
                                            positionBeat,
                                            pixelsPerBeat,
                                            keepChains: props.keepChains,
                                        }),
                                        top: TIMELINE_PAGE_ROW_TOP + 6,
                                    }}
                                >
                                    <PlusIcon size={10} weight="bold" />
                                </button>
                            </AddPageFlagMenu>
                        )}
                        <TimelineRangePreview
                            preview={pointer.rangePreview}
                            pixelsPerBeat={pixelsPerBeat}
                            height={pinnedHeight}
                        />
                        {props.loop && (
                            <TimelineLoopBar
                                loop={props.loop}
                                beatCount={model.beatCount}
                                pixelsPerBeat={pixelsPerBeat}
                                snapBeats={snapBeats}
                                onChange={props.onLoopChange}
                            />
                        )}
                        {selectionRange && !basic && (
                            <TimelineSelectionRange
                                range={selectionRange}
                                startFlagBeatIndex={
                                    selection?.kind === "range"
                                        ? selection.startFlagBeatIndex
                                        : undefined
                                }
                                startPinned={
                                    selection?.kind === "range" &&
                                    selection.startPinned === true
                                }
                                onUnpin={props.onUnpinStart}
                                pinTop={
                                    TIMELINE_PAGE_ROW_BOTTOM +
                                    (expanded ? 1 : 0)
                                }
                                pinSize={expanded ? 18 : 14}
                                beatCount={model.beatCount}
                                pixelsPerBeat={pixelsPerBeat}
                                height={pinnedHeight}
                                snapBeats={snapBeats}
                                onCommit={commitSelection}
                                onLineDrag={props.onSeek}
                                onInteractionChange={selectionInteraction.set}
                                positionBeat={positionBeat}
                                scrubLine={pointer.scrubLine}
                            />
                        )}
                        {selectionRange && !basic && (
                            <TimelineSelectionActions
                                model={model}
                                range={selectionRange}
                                interaction={selectionInteraction}
                                pixelsPerBeat={pixelsPerBeat}
                                expanded={expanded}
                                snapBeats={snapBeats}
                                createTrackTarget={
                                    selection?.kind === "range" &&
                                    props.onCreateTrack != null
                                        ? selectedTarget
                                        : null
                                }
                                onCreateTrack={props.onCreateTrack}
                            />
                        )}
                    </div>
                </div>
                {rangeMenu.element}
            </div>
        </TimelineShell>
    );
});

export const ExpandedTimeline = memo(function ExpandedTimeline(
    props: TimelineCommonProps,
) {
    return <TimelineSurface {...props} density="expanded" />;
});

/** UI-19 Basic: one row of page boxes with the music inside them (research/basic-mode) */
export const BasicTimeline = memo(function BasicTimeline(
    props: TimelineCommonProps,
) {
    return <TimelineSurface {...props} density="basic" />;
});

export const CollapsedTimeline = memo(function CollapsedTimeline(
    props: TimelineCommonProps,
) {
    return <TimelineSurface {...props} density="collapsed" />;
});
