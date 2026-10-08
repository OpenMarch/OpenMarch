import * as Popover from "@radix-ui/react-popover";
import {
    ArrowsOutLineHorizontalIcon,
    DotsThreeIcon,
    HouseIcon,
    PauseIcon,
    PushPinIcon,
    StopIcon,
    PlayIcon,
    SkipBackIcon,
    SkipForwardIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
import { isTyping, overlayOpen } from "./timelineHotkeys";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    beatToX,
    clamp,
    clientXToBeat,
    filterMarkersByMinimumSpacing,
    getPageCountAt,
    getPlayheadReadout,
    getVisiblePageCounts,
    getPageRange,
    parseTimelineGoTo,
    getSelectionRange,
    getTrackRange,
    sameRange,
    isPageSnapDisabled,
    snapBoundary,
    snapRangeOffset,
} from "./TimelineGeometry";
import { timelineRangeTargetProps } from "./TimelineRangeMenu";
import { useLatestCallback } from "./useLatestCallback";
import {
    createLiveValue,
    type TimelineLiveValue,
    useLiveValue,
} from "./timelineLiveValue";
import type {
    BeatPosition,
    TimelineBeatRange,
    TimelineMeasureMarker,
    TimelineNavigation,
    TimelinePageMarker,
    TimelineRangeChange,
    TimelineSeek,
    TimelineSeekGesture,
    TimelineSeekOptions,
    TimelineSelection,
    TimelineTrack,
    TimelineTrackId,
    TimelineViewModel,
} from "./TimelineViewModel";

/** Low enough that Fit shows a long show whole (UI-12): 500 beats fit in 500px */
export const TIMELINE_MIN_PX_PER_BEAT = 1;
export const TIMELINE_MAX_PX_PER_BEAT = 64;
export const TIMELINE_INITIAL_PAGE_WIDTH = 40;

export interface TimelineSelectionInteraction {
    readonly range: TimelineBeatRange;
    readonly activeHandle: "start" | "end" | null;
    readonly dragging: boolean;
}

// The same elements every render, so the memoized transport buttons don't re-render for them
const SKIP_BACK_ICON = <SkipBackIcon size={16} />;
const PAUSE_ICON = <PauseIcon size={18} weight="fill" />;
const PLAY_ICON = <PlayIcon size={18} weight="fill" />;
const STOP_ICON = <StopIcon size={16} />;
const SKIP_FORWARD_ICON = <SkipForwardIcon size={16} />;
const FIT_ICON = <ArrowsOutLineHorizontalIcon size={16} />;
const HOUSE_ICON = <HouseIcon size={14} aria-hidden="true" />;

const TransportButton = memo(function TransportButton({
    label,
    title,
    children,
    onClick,
    pressed,
}: {
    label: string;
    /** The tooltip, when it says more than the label (shortcuts) */
    title?: string;
    children: ReactNode;
    onClick?: (event: ReactMouseEvent) => void;
    pressed?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            title={title ?? label}
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
});

/** Below this width the transport folds its secondary controls into "⋯" (Bitwig's rule) */
const TRANSPORT_FOLD_PX = 640;
/** Below this width the readout drops the measure */
const TRANSPORT_TIGHT_PX = 500;

/**
 * The transport (UI-12): the timeline panel's one header row, as animation tools do it (Figma's
 * Motion timeline, Rive, Blender). Previous, Play, Stop, Next; the caller's pinned accessories
 * (From start with Loop) and secondary ones (Sound); the clock and the readout, which is also the
 * go-to box (click it or press G, then type a page, "m23" or a rehearsal mark); then Fit and the
 * caller's view controls (Compact). Play, the page buttons, From start and the readout never
 * leave: on a narrow panel the rest folds into "⋯". Shift+click on Previous or Next goes to the
 * first or last page (as Shift+Q/E do). While playing, page navigation jumps playback to the flag.
 */
export const TimelineTransport = memo(function TimelineTransport({
    model,
    clock,
    positionBeat,
    isPlaying,
    onPlayingChange,
    onStop,
    onNavigate,
    onFit,
    fitted = false,
    accessories,
    secondary,
    viewControls,
    onSeek,
    onSelectionChange,
}: {
    model: TimelineViewModel;
    /** The playback clock; the app passes its audio clock */
    clock?: ReactNode;
    positionBeat: BeatPosition;
    isPlaying: boolean;
    onPlayingChange?: (isPlaying: boolean) => void;
    /** **Stop** (UI-10); without it, there is no Stop button */
    onStop?: () => void;
    onNavigate?: (direction: TimelineNavigation) => void;
    /** Fit the show in view, or back to the zoom from before fitting */
    onFit?: () => void;
    /** The show is fitted, so Fit goes back */
    fitted?: boolean;
    /** Controls after Next that never fold, such as From start and Loop */
    accessories?: ReactNode;
    /** Controls after those that fold into "⋯" on a narrow panel, such as Sound */
    secondary?: ReactNode;
    /** View controls at the row's end, such as Compact; they fold too */
    viewControls?: ReactNode;
    /** The go-to box seeks to a measure or rehearsal mark (view beats) */
    onSeek?: (beat: BeatPosition) => void;
    /** The go-to box selects a page, as clicking its box does */
    onSelectionChange?: (selection: TimelineSelection) => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const width = useElementWidth(rowRef);
    const folded = width > 0 && width < TRANSPORT_FOLD_PX;
    const tight = width > 0 && width < TRANSPORT_TIGHT_PX;
    const readoutText = getPlayheadReadout(model, positionBeat);
    const mod = isMac() ? "⌘" : "Ctrl";
    const [goTo, setGoTo] = useState<string | null>(null);
    const [goToFailed, setGoToFailed] = useState(false);
    const canGoTo = onSeek != null || onSelectionChange != null;
    const openGoTo = useCallback(() => {
        if (!canGoTo) return;
        setGoTo("");
        setGoToFailed(false);
    }, [canGoTo]);
    // G opens the go-to box, unless a text field, popover, menu or dialog has the keys
    useEffect(() => {
        if (!canGoTo) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() !== "g" ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                event.shiftKey ||
                event.repeat ||
                isTyping(event.target) ||
                overlayOpen()
            )
                return;
            event.preventDefault();
            openGoTo();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [canGoTo, openGoTo]);
    const submitGoTo = (text: string) => {
        const target = parseTimelineGoTo(text, model);
        if (!target) {
            setGoToFailed(true);
            return;
        }
        if (target.kind === "beat") onSeek?.(target.beat);
        else {
            const page = model.pages.find((p) => p.id === target.pageId);
            const ordered = model.pages
                .filter((p) => !p.isInitial)
                .sort((a, b) => a.atBeat - b.atBeat);
            const range = page
                ? getPageRange({
                      pages: ordered,
                      pageId: page.id,
                      beatCount: model.beatCount,
                  })
                : null;
            if (page?.isInitial) onSelectionChange?.({ kind: "home" });
            else if (range) onSelectionChange?.({ kind: "range", range });
        }
        setGoTo(null);
    };
    const previousPage = useCallback(
        (event: ReactMouseEvent) =>
            onNavigate?.(event.shiftKey ? "first-page" : "previous-page"),
        [onNavigate],
    );
    const nextPage = useCallback(
        (event: ReactMouseEvent) =>
            onNavigate?.(event.shiftKey ? "last-page" : "next-page"),
        [onNavigate],
    );
    const togglePlaying = useCallback(
        () => onPlayingChange?.(!isPlaying),
        [isPlaying, onPlayingChange],
    );
    const readout =
        goTo !== null ? (
            <input
                autoFocus
                data-testid="timeline-go-to"
                aria-label="Go to a page, measure or rehearsal mark"
                aria-invalid={goToFailed || undefined}
                placeholder="Page, m23 or C"
                value={goTo}
                onChange={(event) => {
                    setGoTo(event.target.value);
                    setGoToFailed(false);
                }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") submitGoTo(goTo);
                    if (event.key === "Escape") setGoTo(null);
                }}
                onBlur={() => setGoTo(null)}
                className={clsx(
                    "bg-bg-1 text-text rounded-4 h-22 w-[150px] min-w-0 border px-6 font-mono text-[11px] outline-hidden",
                    goToFailed ? "border-red" : "border-accent",
                )}
            />
        ) : (
            <button
                type="button"
                data-testid="timeline-readout"
                disabled={!canGoTo}
                onClick={openGoTo}
                aria-label={`${readoutText.spoken}. Go to a page, measure or rehearsal mark`}
                title={`${readoutText.spoken}. Click or press G to go to a page, measure or rehearsal mark`}
                className="text-text rounded-4 enabled:hover:bg-fg-2 flex h-22 min-w-0 items-baseline gap-8 overflow-hidden px-4 font-mono text-[11px] leading-[22px] whitespace-nowrap"
            >
                {/* UI-13: a minimum width, so the transport doesn't shift as the count changes */}
                <span className="min-w-[15ch] shrink-0">
                    {readoutText.page}
                </span>
                {!tight && readoutText.measure && (
                    <span className="text-text-subtitle truncate">
                        {readoutText.measure}
                    </span>
                )}
            </button>
        );
    const fit = onFit && (
        <TransportButton
            label="Fit the show"
            title={`Fit the show (Shift+Z). Press again to go back. Pinch or ${mod}+scroll to zoom`}
            pressed={fitted}
            onClick={onFit}
        >
            {FIT_ICON}
        </TransportButton>
    );
    const divider = (
        <span aria-hidden="true" className="bg-stroke h-16 w-px shrink-0" />
    );
    return (
        <div
            ref={rowRef}
            role="group"
            aria-label="Transport"
            data-testid="timeline-transport"
            className="border-stroke flex h-32 min-w-0 shrink-0 items-center gap-6 border-b px-6"
        >
            <div className="flex shrink-0 items-center gap-2">
                <TransportButton
                    label="Previous page"
                    title="Previous page (Q). Shift+click or Shift+Q: first page"
                    onClick={onNavigate ? previousPage : undefined}
                >
                    {SKIP_BACK_ICON}
                </TransportButton>
                <TransportButton
                    label={isPlaying ? "Pause" : "Play"}
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                    pressed={isPlaying}
                    onClick={onPlayingChange ? togglePlaying : undefined}
                >
                    {isPlaying ? PAUSE_ICON : PLAY_ICON}
                </TransportButton>
                {onStop && (
                    <TransportButton
                        label="Stop"
                        title="Stop (Shift+Space)"
                        onClick={onStop}
                    >
                        {STOP_ICON}
                    </TransportButton>
                )}
                <TransportButton
                    label="Next page"
                    title="Next page (E). Shift+click or Shift+E: last page"
                    onClick={onNavigate ? nextPage : undefined}
                >
                    {SKIP_FORWARD_ICON}
                </TransportButton>
            </div>
            {(accessories != null || (secondary != null && !folded)) && (
                <>
                    {divider}
                    <div className="flex shrink-0 items-center gap-6">
                        {accessories}
                        {!folded && secondary}
                    </div>
                </>
            )}
            {divider}
            <div className="text-text-subtitle flex min-w-0 items-center gap-8">
                {!folded && clock}
                {readout}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {folded ? (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                aria-label="More controls"
                                title="More: sound, the clock, Fit and Compact"
                                className="rounded-4 text-text enabled:hover:bg-fg-2 focus-visible:ring-accent flex size-24 items-center justify-center outline-hidden focus-visible:ring-2"
                            >
                                <DotsThreeIcon size={18} weight="bold" />
                            </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content
                                side="top"
                                align="end"
                                sideOffset={6}
                                className="border-stroke bg-modal text-text shadow-modal rounded-8 z-50 flex items-center gap-8 border px-8 py-6"
                            >
                                {clock}
                                {secondary}
                                {fit}
                                {viewControls}
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                ) : (
                    <>
                        {fit}
                        {viewControls}
                    </>
                )}
            </div>
        </div>
    );
});

/**
 * The timeline panel (UI-12): one card, its transport as the header row and the timeline under
 * it, edge to edge, so the controls never take the timeline's width.
 */
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
    <div
        className={clsx(
            "border-stroke bg-fg-1 text-text rounded-6 flex min-w-0 flex-col overflow-visible border font-sans",
            className,
        )}
    >
        {transport}
        <section className="min-w-0 px-6 pt-4">
            <div
                ref={viewportRef}
                data-testid="timeline-viewport"
                // The scrollbar's track is always there, so zooming never changes the height
                className="min-w-0 overflow-x-scroll overflow-y-hidden"
            >
                {children}
            </div>
        </section>
    </div>
);

/** How far past the viewport's edge, in pixels, a scrub scrolls fastest */
const SCRUB_EDGE_SCROLL_MAX_PX = 80;

/**
 * Scrolls the timeline while a scrub is held past the viewport's edge, once a frame, faster the
 * further past it the pointer is. Each frame seeks again under the pointer, which the scroll has
 * moved along the show.
 */
const useScrubEdgeScroll = () => {
    const state = useRef<{
        frame: number;
        overshoot: number;
        viewport: HTMLElement | null;
        seekAgain: () => void;
    }>({ frame: 0, overshoot: 0, viewport: null, seekAgain: () => {} });
    const stop = useCallback(() => {
        cancelAnimationFrame(state.current.frame);
        state.current.frame = 0;
        state.current.viewport = null;
    }, []);
    useEffect(() => stop, [stop]);
    const follow = useCallback(
        (clientX: number, element: Element, seekAgain: () => void) => {
            const viewport = element.closest<HTMLElement>(
                '[data-testid="timeline-viewport"]',
            );
            const bounds = viewport?.getBoundingClientRect();
            const overshoot = !bounds
                ? 0
                : clientX < bounds.left
                  ? clientX - bounds.left
                  : clientX > bounds.right
                    ? clientX - bounds.right
                    : 0;
            if (!viewport || overshoot === 0) {
                stop();
                return;
            }
            Object.assign(state.current, { overshoot, viewport, seekAgain });
            if (state.current.frame) return;
            const step = () => {
                const current = state.current;
                if (!current.viewport) return;
                const before = current.viewport.scrollLeft;
                current.viewport.scrollLeft +=
                    clamp(
                        current.overshoot,
                        -SCRUB_EDGE_SCROLL_MAX_PX,
                        SCRUB_EDGE_SCROLL_MAX_PX,
                    ) / 4;
                // At either end of the show there is nothing more to scroll
                if (current.viewport.scrollLeft === before) {
                    stop();
                    return;
                }
                current.seekAgain();
                current.frame = requestAnimationFrame(step);
            };
            state.current.frame = requestAnimationFrame(step);
        },
        [stop],
    );
    return { follow, stop };
};

/**
 * Scrubbing by dragging along the page boxes (UI-12). A press that moves past the drag threshold
 * scrubs the playhead with the pointer and swallows the click that follows, so the box under the
 * release isn't selected; a press that doesn't move stays a click. The scrub's seeks are a `drag`
 * gesture and its release (or cancel) an `end` (UI-12 review). The handlers keep their identity
 * across renders (they read the latest arguments), so the boxes don't re-render for them.
 */
const useRulerScrub = (
    onSeek: TimelineSeek | undefined,
    beatCount: number,
    pixelsPerBeat: number,
    seekSnapBeats: readonly number[],
    scrubLine: TimelineLiveValue<number | null> | undefined,
) => {
    const latest = useRef({
        onSeek,
        beatCount,
        pixelsPerBeat,
        seekSnapBeats,
        scrubLine,
    });
    latest.current = {
        onSeek,
        beatCount,
        pixelsPerBeat,
        seekSnapBeats,
        scrubLine,
    };
    const edgeScroll = useScrubEdgeScroll();
    const [scrub] = useState(() => {
        let drag: {
            pointerId: number;
            startClientX: number;
            // Read again on every move, so a scroll during the scrub doesn't skew it
            surface: Element;
            scrubbing: boolean;
            lastBeat: number;
        } | null = null;
        let swallowClick = false;
        const pointerBeat = (clientX: number, surface: Element) =>
            clamp(
                (clientX - surface.getBoundingClientRect().left) /
                    latest.current.pixelsPerBeat,
                0,
                latest.current.beatCount,
            );
        const beatAt = (
            clientX: number,
            surface: Element,
            event: { readonly altKey: boolean },
        ) =>
            snapSeekBeat(
                pointerBeat(clientX, surface),
                latest.current.seekSnapBeats,
                latest.current.pixelsPerBeat,
                isPageSnapDisabled(event),
            );
        const scrubTo = (
            clientX: number,
            event: { readonly altKey: boolean },
        ) => {
            const current = drag;
            if (!current) return;
            const { onSeek, scrubLine } = latest.current;
            const beat = pointerBeat(clientX, current.surface);
            current.lastBeat = snapSeekBeat(
                beat,
                latest.current.seekSnapBeats,
                latest.current.pixelsPerBeat,
                isPageSnapDisabled(event),
            );
            // The seek only goes out when the beat changes; the line steps to the beat the playhead
            // is on (`scrubLineBeat`) in this move, without waiting for a render
            const landed = onSeek?.(current.lastBeat, { gesture: "drag" });
            scrubLine?.set(scrubLineBeat(current.lastBeat, landed));
        };
        const finish = (beat?: number) => {
            const current = drag;
            drag = null;
            edgeScroll.stop();
            if (current?.scrubbing)
                latest.current.onSeek?.(beat ?? current.lastBeat, {
                    gesture: "end",
                });
            latest.current.scrubLine?.set(null);
            return current;
        };
        return {
            /** A scrub still down when the ruler goes ends where it was */
            dispose: () => {
                if (drag) finish();
            },
            /** Whether this click ends a scrub or a range drag; a keyboard click (detail 0) never does */
            consumeClick: (event: { readonly detail: number }) => {
                const swallow = swallowClick && event.detail !== 0;
                swallowClick = false;
                return swallow;
            },
            handlers: {
                onPointerDown: (
                    event: ReactPointerEvent<HTMLButtonElement>,
                ) => {
                    swallowClick = false;
                    // A range-modifier press draws a range: the surface handles it, and the click
                    // it ends with mustn't select the box
                    if (event.button === 0 && isRangeModifier(event)) {
                        swallowClick = true;
                        return;
                    }
                    if (
                        !latest.current.onSeek ||
                        event.button !== 0 ||
                        event.ctrlKey
                    )
                        return;
                    const surface = event.currentTarget.closest(
                        '[data-testid="timeline-pointer-surface"]',
                    );
                    if (!surface) return;
                    drag = {
                        pointerId: event.pointerId,
                        startClientX: event.clientX,
                        surface,
                        scrubbing: false,
                        lastBeat: 0,
                    };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                },
                onPointerMove: (
                    event: ReactPointerEvent<HTMLButtonElement>,
                ) => {
                    const current = drag;
                    if (!current || current.pointerId !== event.pointerId)
                        return;
                    if (
                        !current.scrubbing &&
                        Math.abs(event.clientX - current.startClientX) <
                            TIMELINE_RANGE_DRAG_PX
                    )
                        return;
                    current.scrubbing = true;
                    scrubTo(event.clientX, event);
                    const { clientX, altKey } = event;
                    edgeScroll.follow(clientX, current.surface, () =>
                        scrubTo(clientX, { altKey }),
                    );
                },
                onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
                    const current = drag;
                    if (!current || current.pointerId !== event.pointerId)
                        return;
                    swallowClick = current.scrubbing;
                    finish(
                        current.scrubbing
                            ? beatAt(event.clientX, current.surface, event)
                            : undefined,
                    );
                    // After the scrub has ended, so the capture's loss (below) finds nothing to end
                    event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                    );
                },
                onPointerCancel: () => {
                    finish();
                },
                // The capture can go without a pointerup or pointercancel (the window loses focus
                // mid-drag and the button is released outside it): end the scrub as a cancel does
                onLostPointerCapture: () => {
                    if (drag) finish();
                },
            },
        };
    });
    // A scrub still down when the ruler goes (a variant switch, focusing the page timeline) ends
    // where it was, so the seek's owner doesn't wait for a release that never comes
    useEffect(() => scrub.dispose, [scrub]);
    return scrub;
};

type RulerScrub = ReturnType<typeof useRulerScrub>;

/**
 * A page box's name (UI-13), at its flag, sticking to the viewport's edge while the flag is
 * scrolled out of view, so a long page always shows its name. Set heavier than the counts and
 * measure numbers under it, so the box and the weight tell them apart. Hidden when the box is too
 * narrow to read it, when zoomed far out (UI-12).
 */
const PageBoxLabel = memo(function PageBoxLabel({
    label,
    shown,
}: {
    label: string;
    shown: boolean;
}) {
    return shown ? (
        <span className="sticky right-8 font-semibold">{label}</span>
    ) : null;
});

/** Whether a page box this wide has room for its name (`PageBoxLabel`) */
const pageLabelFits = (label: string, width: number) =>
    width >= label.length * 7 + 10;

export const TimelineRuler = memo(function TimelineRuler({
    pages,
    measures,
    beatCount,
    pixelsPerBeat,
    selection,
    onSelectionChange,
    onSeek,
    initialPageWidth,
    showMeasures = true,
    seekSnapBeats = [],
    positionBeat,
    scrubLine,
}: {
    pages: readonly TimelinePageMarker[];
    measures: readonly TimelineMeasureMarker[];
    beatCount: number;
    pixelsPerBeat: number;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
    /** Dragging along the page boxes scrubs (UI-12); a click still selects the box */
    onSeek?: TimelineSeek;
    initialPageWidth: number;
    /** The measure numbers under the boxes; compact leaves them out */
    showMeasures?: boolean;
    /** Downbeats and page lines a scrub lands on when near (UI-12) */
    seekSnapBeats?: readonly number[];
    /** The playhead; a show without measures numbers the counts of its page (UI-13) */
    positionBeat?: BeatPosition;
    /** Where a scrub draws the playhead line, between beats (`useTimelinePointer`) */
    scrubLine?: TimelineLiveValue<number | null>;
}) {
    // Rehearsal tabs are never thinned; a number gives way to a tab near it (UI-12)
    const visibleMeasures = useMemo(() => {
        const tabBeats = measures
            .filter((measure) => measure.rehearsalMark?.trim())
            .map((measure) => measure.atBeat);
        return filterMarkersByMinimumSpacing(
            measures.filter(
                (measure) =>
                    !measure.rehearsalMark?.trim() &&
                    tabBeats.every(
                        (beat) =>
                            Math.abs(beat - measure.atBeat) * pixelsPerBeat >=
                            26,
                    ),
            ),
            pixelsPerBeat,
        );
    }, [measures, pixelsPerBeat]);
    const scrub = useRulerScrub(
        onSeek,
        beatCount,
        pixelsPerBeat,
        seekSnapBeats,
        scrubLine,
    );
    const initialPage = pages.find((page) => page.isInitial);
    // UI-9: the initial box is home; a page box is its range, previous flag to its own flag.
    // Worked out once per change of the pages, not for each box on every render.
    const pageBoxes = useMemo(() => {
        const orderedPages = pages
            .filter((page) => !page.isInitial)
            .sort((a, b) => a.atBeat - b.atBeat);
        return orderedPages.map((page) => ({
            page,
            range: getPageRange({
                pages: orderedPages,
                pageId: page.id,
                beatCount,
            }),
        }));
    }, [beatCount, pages]);
    const pageRanges = useMemo(
        () => new Map(pageBoxes.map(({ page, range }) => [page.id, range])),
        [pageBoxes],
    );
    // The boxes only re-render when which of them is selected changes, not for every new window
    // (a scrub moves the window's end every beat)
    const selectedRange = getSelectionRange(selection);
    const homeSelected = selection?.kind === "home";
    const selectedBoxIds = pageBoxes
        .filter(
            ({ range }) => range !== null && sameRange(range, selectedRange),
        )
        .map(({ page }) => page.id)
        .join("\n");
    // UI-13: with no measures, the row under the boxes numbers the counts of the playhead's page,
    // each just left of the tick it lands on, so a page's last count sits on its flag
    const countsAt =
        showMeasures && measures.length === 0 && positionBeat != null
            ? getPageCountAt({ pages }, positionBeat)
            : null;
    const countsTotal = countsAt?.total ?? null;
    const countsStart = countsAt?.startBeat ?? null;
    const selectPage = useLatestCallback((page: TimelinePageMarker) => {
        if (page.isInitial) {
            onSelectionChange?.({ kind: "home" });
            return;
        }
        const range = pageRanges.get(page.id) ?? null;
        if (range) onSelectionChange?.({ kind: "range", range });
    })!;
    return (
        <>
            <TimelineRulerBoxes
                initialPage={initialPage}
                pageBoxes={pageBoxes}
                homeSelected={homeSelected}
                selectedBoxIds={selectedBoxIds}
                beatCount={beatCount}
                pixelsPerBeat={pixelsPerBeat}
                initialPageWidth={initialPageWidth}
                scrub={scrub}
                onSelectPage={selectPage}
            />
            {showMeasures && (
                <TimelineRulerNumbers
                    visibleMeasures={visibleMeasures}
                    countsTotal={countsTotal}
                    countsStart={countsStart}
                    pixelsPerBeat={pixelsPerBeat}
                />
            )}
        </>
    );
});

/** The ruler's page boxes (`TimelineRuler`) */
const TimelineRulerBoxes = memo(function TimelineRulerBoxes({
    initialPage,
    pageBoxes,
    homeSelected,
    selectedBoxIds,
    beatCount,
    pixelsPerBeat,
    initialPageWidth,
    scrub,
    onSelectPage,
}: {
    initialPage: TimelinePageMarker | undefined;
    pageBoxes: readonly {
        page: TimelinePageMarker;
        range: TimelineBeatRange | null;
    }[];
    homeSelected: boolean;
    /** The ids of the selected boxes, one per line */
    selectedBoxIds: string;
    beatCount: number;
    pixelsPerBeat: number;
    initialPageWidth: number;
    scrub: RulerScrub;
    onSelectPage: (page: TimelinePageMarker) => void;
}) {
    const selectedIds = new Set(selectedBoxIds.split("\n"));
    return (
        <div
            data-testid="timeline-page-ruler"
            // Clipped without being a scroll container, so labels can stick to the viewport
            className="border-stroke bg-fg-2 rounded-6 absolute top-0 h-28 overflow-clip border font-mono"
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
                    title={`Home: page ${initialPage.label}'s set`}
                    aria-pressed={homeSelected}
                    {...scrub.handlers}
                    onClick={(event) => {
                        if (!scrub.consumeClick(event))
                            onSelectPage(initialPage);
                    }}
                    className="border-stroke text-text focus-visible:ring-accent absolute top-0 left-0 flex h-full items-center justify-center border-r text-[11px] outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset aria-pressed:z-10 aria-pressed:ring-1 aria-pressed:ring-[var(--color-accent)] aria-pressed:ring-inset"
                    style={{ width: initialPageWidth }}
                >
                    {/* UI-13: a house, so home's "0" isn't read as a count or a measure */}
                    {HOUSE_ICON}
                </button>
            )}
            {pageBoxes.map(({ page, range }) =>
                range ? (
                    <TimelinePageBox
                        key={page.id}
                        page={page}
                        range={range}
                        selected={selectedIds.has(String(page.id))}
                        pixelsPerBeat={pixelsPerBeat}
                        initialPageWidth={initialPageWidth}
                        scrub={scrub}
                        onSelectPage={onSelectPage}
                    />
                ) : null,
            )}
        </div>
    );
});

/** A page box on the ruler (`TimelineRulerBoxes`): only re-renders when it changes */
const TimelinePageBox = memo(function TimelinePageBox({
    page,
    range,
    selected,
    pixelsPerBeat,
    initialPageWidth,
    scrub,
    onSelectPage,
}: {
    page: TimelinePageMarker;
    range: TimelineBeatRange;
    selected: boolean;
    pixelsPerBeat: number;
    initialPageWidth: number;
    scrub: RulerScrub;
    onSelectPage: (page: TimelinePageMarker) => void;
}) {
    const boxWidth =
        (range.endBeatIndex - range.startBeatIndex) * pixelsPerBeat;
    return (
        <button
            type="button"
            data-timeline-interactive="true"
            {...timelineRangeTargetProps(range, undefined, page.id)}
            aria-label={`Page ${page.label}`}
            aria-pressed={selected}
            {...scrub.handlers}
            onClick={(event) => {
                if (scrub.consumeClick(event)) return;
                // macOS ctrl+click opens the context menu (UI-9: no selection change)
                if (!event.ctrlKey) onSelectPage(page);
            }}
            className="border-stroke text-text focus-visible:ring-accent absolute top-0 flex h-full items-center justify-end border-r px-8 text-[11px] outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset aria-pressed:z-10 aria-pressed:ring-1 aria-pressed:ring-[var(--color-accent)] aria-pressed:ring-inset"
            style={{
                left:
                    initialPageWidth +
                    beatToX(range.startBeatIndex, pixelsPerBeat),
                width: boxWidth,
            }}
        >
            <PageBoxLabel
                label={page.label}
                shown={pageLabelFits(page.label, boxWidth)}
            />
        </button>
    );
});

/**
 * The measure numbers under the page boxes (`TimelineRuler`), or a show without measures' counts
 * of the playhead's page (UI-13, from `countsStart`, `countsTotal` of them)
 */
const TimelineRulerNumbers = memo(function TimelineRulerNumbers({
    visibleMeasures,
    countsTotal,
    countsStart,
    pixelsPerBeat,
}: {
    visibleMeasures: readonly TimelineMeasureMarker[];
    countsTotal: number | null;
    countsStart: number | null;
    pixelsPerBeat: number;
}) {
    const pageCounts =
        countsTotal != null && countsStart != null
            ? getVisiblePageCounts(countsTotal, pixelsPerBeat).map((count) => ({
                  count,
                  atBeat: countsStart + count,
              }))
            : [];
    return (
        // UI-12: measure numbers without the "M"; a measure with a rehearsal mark shows the
        // mark instead (TimelineRehearsalMarkers)
        // Each number starts just right of its bar line, so the line doesn't cross it
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[31px] h-16 font-mono"
        >
            {visibleMeasures.map((measure) => (
                <span
                    key={measure.id}
                    className="text-text absolute top-4 text-[10px] leading-none whitespace-nowrap opacity-75"
                    style={{
                        left: beatToX(measure.atBeat, pixelsPerBeat) + 3,
                    }}
                >
                    {measure.label.replace(/^m/i, "")}
                </span>
            ))}
            {pageCounts.map(({ count, atBeat }) => (
                <span
                    key={count}
                    data-testid="timeline-page-count"
                    className="text-text absolute top-4 -translate-x-full text-[10px] leading-none whitespace-nowrap opacity-75"
                    style={{
                        left: beatToX(atBeat, pixelsPerBeat) - 2,
                    }}
                >
                    {count}
                </span>
            ))}
        </div>
    );
});

export const TimelinePageLines = memo(function TimelinePageLines({
    pages,
    pixelsPerBeat,
    height,
}: {
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
    height: number;
}) {
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
        >
            {pages
                .filter((page) => !page.isInitial)
                .map((page) => (
                    <span
                        key={page.id}
                        className="bg-text absolute top-28 w-px opacity-[0.24]"
                        style={{
                            left: Math.round(
                                beatToX(page.atBeat, pixelsPerBeat),
                            ),
                            height: Math.max(0, height - 28),
                        }}
                    />
                ))}
        </div>
    );
});

export const TimelineTrackClip = memo(function TimelineTrackClip({
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
    barHeight,
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
    /**
     * The drawn bar's height, centered in `height` (UI-12 compact: a thin bar in a taller hit
     * area, so it can still be clicked, dragged and double-clicked). Without it the bar fills it.
     */
    barHeight?: number;
}) {
    const range = getTrackRange(track);
    const [previewOffset, setPreviewOffset] = useState(0);
    // A drag ends with a click on the clip; that click mustn't also select it
    const draggedRef = useRef(false);
    const dragRef = useRef<{
        pointerId: number;
        startClientX: number;
        offset: number;
        /** Past the drag threshold: a move, not a click (UI-12: a click never snaps the clip) */
        moved: boolean;
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
                const dragged = draggedRef.current;
                draggedRef.current = false;
                // macOS ctrl+click opens the context menu (UI-9: no selection change)
                if (!dragged && !event.ctrlKey && !isRangeModifier(event))
                    onSelect?.(track.id);
            }}
            onPointerDown={(event) => {
                draggedRef.current = false;
                // Ctrl (Cmd on macOS) draws a range from here instead (the surface handles it)
                if (
                    !canMove ||
                    event.button !== 0 ||
                    event.ctrlKey ||
                    isRangeModifier(event)
                )
                    return;
                event.stopPropagation();
                dragRef.current = {
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    offset: 0,
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
                // A press that didn't move is a click: it selects (onClick) and moves nothing,
                // even with an edge near a page line, which a zero offset would snap to
                if (!drag.moved) {
                    setPreviewOffset(0);
                    return;
                }
                // Recompute with the release's modifier state, as the selection flags do
                const offset = getOffset(
                    event.clientX,
                    drag.startClientX,
                    isPageSnapDisabled(event),
                );
                setPreviewOffset(0);
                // A drag brought back to where it started is cancelled, not a click
                draggedRef.current = true;
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
                            "absolute overflow-hidden",
                            barHeight === undefined && "inset-y-0",
                            isFirst &&
                                (micro ? "rounded-l-full" : "rounded-l-4"),
                            isLast &&
                                (micro ? "rounded-r-full" : "rounded-r-4"),
                            span.active
                                ? "border border-transparent"
                                : "border border-dashed",
                        )}
                        style={{
                            ...(barHeight !== undefined && {
                                top: (height - barHeight) / 2,
                                height: barHeight,
                            }),
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
});

export const TimelineSelectionRange = memo(function TimelineSelectionRange({
    range,
    startFlagBeatIndex,
    fromStart = false,
    onFromStartOff,
    startPinned = false,
    onUnpin,
    pinTop = 30,
    pinSize = 18,
    beatCount,
    pixelsPerBeat,
    height,
    snapBeats = [],
    onCommit,
    onInteractionChange,
    positionBeat,
    scrubLine,
}: {
    range: TimelineBeatRange;
    /** Where to draw the start flag when it isn't the range's start (UI-10, after Stop) */
    startFlagBeatIndex?: number;
    /**
     * **From start** is on (UI-11): the window is drawn in the start flag's color with a bar
     * across its top; clicking the bar turns it off (`onFromStartOff`). Off, the start flag is
     * dimmed, since Play doesn't go back to it.
     */
    fromStart?: boolean;
    onFromStartOff?: () => void;
    /**
     * The start flag is pinned (UI-10): it stays through navigation. UI-12 draws a pin beside its
     * stem, under the ruler, so a forgotten pin can be seen; clicking the pin unpins (`onUnpin`).
     */
    startPinned?: boolean;
    onUnpin?: () => void;
    /** Where the pin sits, below the ruler, and its size (compact's row is smaller) */
    pinTop?: number;
    pinSize?: number;
    beatCount: number;
    pixelsPerBeat: number;
    height: number;
    /** Page lines the dragged flag snaps to (ui.md UI-2); Alt turns snapping off */
    snapBeats?: readonly number[];
    onCommit?: (range: TimelineBeatRange) => void;
    onInteractionChange?: (
        interaction: TimelineSelectionInteraction | null,
    ) => void;
    /** The playhead (view beats): while a scrub is down, a window ending on it keeps up with
     * the scrub's line (`scrubLine`, `useScrubStretch`) */
    positionBeat?: number;
    scrubLine?: TimelineLiveValue<number | null>;
}) {
    const [preview, setPreview] = useState(range);
    const tintRef = useRef<HTMLSpanElement>(null);
    const barRef = useRef<HTMLSpanElement>(null);
    const previewRef = useRef(range);
    const dragRef = useRef<{
        kind: "start" | "end";
        pointerId: number;
        surface: HTMLElement;
        startClientX: number;
        /** The pointer has moved past the drag threshold: a drag, not a click */
        moved: boolean;
    } | null>(null);

    // A new range replaces the preview in the same render, not in an effect after it: an effect
    // ran after the frame was painted, so the window trailed the playhead by a frame on every beat
    const [shownRange, setShownRange] = useState(range);
    if (
        range.startBeatIndex !== shownRange.startBeatIndex ||
        range.endBeatIndex !== shownRange.endBeatIndex
    ) {
        const next = {
            startBeatIndex: range.startBeatIndex,
            endBeatIndex: range.endBeatIndex,
        };
        setShownRange(range);
        dragRef.current = null;
        previewRef.current = next;
        setPreview(next);
    }

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
            // A move within the same snapped beat changes nothing
            if (!sameRange(next, current)) {
                previewRef.current = next;
                setPreview(next);
            }
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

    function resetPreview() {
        const current = {
            startBeatIndex: range.startBeatIndex,
            endBeatIndex: range.endBeatIndex,
        };
        previewRef.current = current;
        setPreview(current);
        onInteractionChange?.(null);
    }

    /** Ends a flag drag without committing it, releasing `flag`'s capture; false with none */
    const cancelDrag = (flag?: HTMLElement) => {
        const drag = dragRef.current;
        if (!drag) return false;
        dragRef.current = null;
        if (flag?.hasPointerCapture?.(drag.pointerId))
            flag.releasePointerCapture(drag.pointerId);
        resetPreview();
        return true;
    };

    const flagTitle = (kind: "start" | "end", beatIndex: number) =>
        kind === "start"
            ? "Start flag: dragged marchers leave from here. Drag to move it."
            : `Selection ${kind}: beat boundary ${beatIndex}`;
    const flagHandlers = (kind: "start" | "end", beatIndex: number) => ({
        disabled: !onCommit,
        onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
            if (!onCommit || event.button !== 0) return;
            event.stopPropagation();
            const surface = event.currentTarget.parentElement?.parentElement;
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
        },
        onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
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
        },
        onPointerUp: finishDrag,
        onPointerCancel: () => {
            dragRef.current = null;
            resetPreview();
        },
        // The capture can go without a pointerup or pointercancel (the window loses focus
        // mid-drag): the drag is cancelled. After a release the drag has already ended.
        onLostPointerCapture: () => {
            cancelDrag();
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
            // Escape mid-drag puts the flag back
            if (event.key === "Escape" && cancelDrag(event.currentTarget)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
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
        },
    });

    const flag = (kind: "start" | "end", beatIndex: number) => {
        // Whole pixels, so the stem and the pennant blur on the same pixels
        const x = Math.round(beatToX(beatIndex, pixelsPerBeat));
        if (kind === "end")
            return (
                <button
                    type="button"
                    data-timeline-interactive="true"
                    aria-label={`Selection ${kind}`}
                    title={flagTitle(kind, beatIndex)}
                    {...flagHandlers(kind, beatIndex)}
                    className="focus-visible:ring-accent pointer-events-auto absolute top-0 z-40 h-full w-12 -translate-x-1/2 touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2 enabled:cursor-ew-resize disabled:cursor-default"
                    style={{ left: x, height }}
                >
                    <span className="bg-accent absolute inset-y-0 left-1/2 w-px" />
                    <span className="bg-accent absolute top-0 right-1/2 h-10 w-8 rounded-l-sm" />
                </button>
            );
        // UI-10, UI-11: the start flag, where movers leave from. No words: a line and a pennant,
        // hollow while From start is off and filled while it is on
        return (
            <>
                <button
                    type="button"
                    data-timeline-interactive="true"
                    aria-label={`Start flag, beat ${beatIndex}`}
                    title={flagTitle(kind, beatIndex)}
                    {...flagHandlers(kind, beatIndex)}
                    className="focus-visible:ring-accent pointer-events-auto absolute top-0 z-40 h-full w-12 -translate-x-1/2 touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2 enabled:cursor-ew-resize disabled:cursor-default"
                    style={{ left: x, height }}
                >
                    <span
                        className={clsx(
                            "absolute top-px bottom-0 left-1/2",
                            START_INK.bg,
                            fromStart ? "w-2" : "w-px",
                        )}
                    />
                </button>
                {startPinned && (
                    <button
                        type="button"
                        data-testid="timeline-start-pin"
                        data-timeline-interactive="true"
                        aria-label="Start flag pinned. Click to unpin"
                        title="Pinned: the start flag stays here when you move to other pages. Click to unpin, so it follows the page again."
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={onUnpin}
                        disabled={!onUnpin}
                        className={clsx(
                            "bg-bg-1 rounded-4 pointer-events-auto absolute z-[45] flex items-center justify-center border p-0 shadow-sm enabled:cursor-pointer",
                            pinSize >= 18 ? "size-18" : "size-14",
                            START_INK.text,
                            START_INK.border,
                        )}
                        // Clear of the flag's own 12px handle and of a rehearsal tab centered on
                        // the flag's beat (UI-12 review)
                        style={{ left: x + 10, top: pinTop }}
                    >
                        <PushPinIcon
                            size={pinSize >= 18 ? 12 : 10}
                            weight="fill"
                        />
                    </button>
                )}
                {/* The pennant is its own handle above the playhead's (z-50): after Stop the flag
                    is drawn on the playhead, and this is the part of it that can be grabbed. Its
                    left edge is drawn on the stem's pixels, so the two read as one shape */}
                <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    data-testid="timeline-start-pennant"
                    data-timeline-interactive="true"
                    title={flagTitle(kind, beatIndex)}
                    {...flagHandlers(kind, beatIndex)}
                    onKeyDown={undefined}
                    className="pointer-events-auto absolute top-0 z-[55] h-14 w-14 touch-none border-0 bg-transparent p-0 outline-hidden enabled:cursor-ew-resize disabled:cursor-default"
                    style={{ left: x }}
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                        className={clsx(
                            "absolute top-px left-0",
                            START_INK.text,
                        )}
                    >
                        {/* A right triangle whose top lines up with the page boxes' (1px down, inside the
                            ruler's border), so the From start bar runs straight out of it. Both are
                            fills, not strokes, so no edge spills past the stem */}
                        {fromStart ? (
                            // Filled: the left edge sits inside the 2px stem
                            <path d="M0 0 L10 0 L0 10 Z" fill="currentColor" />
                        ) : (
                            // Hollow: a 1px outline whose left side is the 1px stem
                            <path
                                d="M0 0 L10 0 L0 10 Z M1 1 L1 7.59 L7.59 1 Z"
                                fill="currentColor"
                                fillRule="evenodd"
                            />
                        )}
                    </svg>
                </button>
            </>
        );
    };

    // Rounded like the flag, so the window and the From start bar start on the stem's pixel
    const startX = Math.round(beatToX(preview.startBeatIndex, pixelsPerBeat));
    const endX = Math.round(beatToX(preview.endBeatIndex, pixelsPerBeat));
    const endsOnPlayhead =
        positionBeat !== undefined && preview.endBeatIndex === positionBeat;
    useScrubStretch(
        [tintRef, barRef],
        endsOnPlayhead ? scrubLine : undefined,
        startX,
        endX,
        pixelsPerBeat,
    );
    return (
        // No z-index here: one would make a stacking context, and the start pennant must rise
        // above the playhead (z-50), which is outside it. Each child sets its own instead.
        <div
            data-testid="timeline-selection-range"
            className="pointer-events-none absolute inset-0"
        >
            <span
                ref={tintRef}
                aria-hidden="true"
                className={clsx(
                    // 1px down, inside the ruler's border, like the flag and the page boxes
                    "absolute top-px z-30 origin-left",
                    fromStart ? "bg-yellow/12" : "bg-accent/8",
                )}
                style={{
                    left: startX,
                    width: endX - startX,
                    height: height - 1,
                }}
            />
            {fromStart && (
                // UI-11: a thin bar along the ruler's top edge, out of the pennant's top and clear
                // of the page numbers, inside a taller click target (at least 24px wide) that turns
                // From start off
                <button
                    type="button"
                    data-testid="timeline-from-start-bar"
                    data-timeline-interactive="true"
                    aria-label="From start is on. Click to turn it off"
                    title="From start: Play replays from the start flag to the playhead. Click, C or Esc to turn off"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={onFromStartOff}
                    disabled={!onFromStartOff}
                    className="group pointer-events-auto absolute top-0 z-40 h-10 border-0 bg-transparent p-0 enabled:cursor-pointer"
                    style={{
                        left: Math.min(startX, (startX + endX) / 2 - 12),
                        width: Math.max(endX - startX, 24),
                    }}
                >
                    <span
                        ref={barRef}
                        className={clsx(
                            "absolute top-px h-3 origin-left transition-[height] duration-100 group-hover:h-5",
                            START_INK.bg,
                        )}
                        style={{
                            left:
                                startX -
                                Math.min(startX, (startX + endX) / 2 - 12),
                            width: endX - startX,
                        }}
                    />
                </button>
            )}
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
});

/**
 * Rehearsal marks as tabs in the measure row (UI-12; they sat on the waveform lane before), in
 * place of their measure's number. Clicking one seeks there. Thinned like the measure numbers, so
 * they don't pile up when zoomed out.
 */
export const TimelineRehearsalMarkers = memo(function TimelineRehearsalMarkers({
    model,
    pixelsPerBeat,
    top,
    compact = false,
    onSeek,
}: {
    model: TimelineViewModel;
    pixelsPerBeat: number;
    top: number;
    compact?: boolean;
    onSeek?: (beat: BeatPosition) => void;
}) {
    return (
        <div className="pointer-events-none absolute inset-0 z-20">
            {model.measures.flatMap((measure) => {
                const label = measure.rehearsalMark?.trim();
                if (!label) return [];
                const number = measure.label.replace(/^m/i, "");
                return [
                    <button
                        key={measure.id}
                        type="button"
                        data-timeline-interactive="true"
                        aria-label={`Rehearsal ${label}, measure ${number}`}
                        title={`Rehearsal ${label}, measure ${number}`}
                        onClick={() => onSeek?.(measure.atBeat)}
                        className={clsx(
                            "border-text-subtitle bg-bg-1 text-text rounded-r-4 pointer-events-auto absolute flex h-16 min-w-16 items-center justify-center border border-l-2 px-3 font-mono leading-none font-semibold",
                            compact ? "text-[9px]" : "text-[10px]",
                        )}
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
});

/** How long after the last arrow key a run of steps ends, so the start flag follows once */
const ARROW_STEPS_SETTLE_MS = 300;

/**
 * Arrow-key steps on the playhead as one gesture (UI-12 review): the first step is a `press`, the
 * rest `drag`s, and the run ends 300ms after the last key, or when a held key is released, so an
 * unpinned start flag follows once rather than page by page.
 */
const useArrowKeySteps = (
    onSeek:
        | ((beat: BeatPosition, options?: TimelineSeekOptions) => void)
        | undefined,
) => {
    const run = useRef<{
        beat: number;
        held: boolean;
        timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const onSeekRef = useRef(onSeek);
    onSeekRef.current = onSeek;
    const end = useCallback(() => {
        const current = run.current;
        if (!current) return;
        run.current = null;
        clearTimeout(current.timer);
        onSeekRef.current?.(current.beat, { gesture: "end" });
    }, []);
    useEffect(() => end, [end]);
    return {
        end,
        /** Steps from the run's beat, or from `from` when a new run starts */
        step: (to: (from: number) => number, from: number, repeat: boolean) => {
            const current = run.current;
            if (current) clearTimeout(current.timer);
            const beat = to(current?.beat ?? from);
            run.current = {
                beat,
                held: (current?.held ?? false) || repeat,
                timer: setTimeout(end, ARROW_STEPS_SETTLE_MS),
            };
            onSeekRef.current?.(beat, {
                gesture: current ? "drag" : "press",
            });
        },
        /** A key came up: a held key's run ends now; a tapped one waits for the next tap */
        release: () => {
            if (run.current?.held) end();
        },
    };
};

/**
 * Moves an element drawn at the playhead (`restingLeft`, where React put it) to where a scrub
 * draws the line (`scrubLine`, view beats, `scrubLineBeat`) with a transform: on every pointer
 * move, without a render, and again before paint after a render that moved it (a beat the scrub
 * crossed). With no scrub, or while `paused` is false, the transform is cleared.
 */
export const useScrubFollow = (
    ref: RefObject<HTMLElement | null>,
    scrubLine: TimelineLiveValue<number | null> | undefined,
    restingLeft: number,
    pixelsPerBeat: number,
    paused = true,
) => {
    const apply = useCallback(() => {
        const element = ref.current;
        if (!element) return;
        const line = paused ? (scrubLine?.get() ?? null) : null;
        if (line === null) {
            if (element.style.transform) element.style.transform = "";
            return;
        }
        // Device pixels, as while playing: crisp, and smooth on a high-density screen
        const ratio = window.devicePixelRatio || 1;
        const x = Math.round(beatToX(line, pixelsPerBeat) * ratio) / ratio;
        element.style.transform = `translateX(${x - restingLeft}px)`;
    }, [paused, pixelsPerBeat, ref, restingLeft, scrubLine]);
    useLayoutEffect(apply, [apply]);
    // Subscribed in the commit that changed `apply`, so a move right after it never reads the
    // `restingLeft` of the element's previous position
    useLayoutEffect(() => scrubLine?.subscribe(apply), [apply, scrubLine]);
};

/**
 * Stretches flat fills that run from `startX` to the playhead (`endX`) to where a scrub draws the
 * line, with a transform (scaleX from the left edge), so the window keeps up with the line between
 * beats. Cleared, as `useScrubFollow`, with the scrub.
 */
const useScrubStretch = (
    refs: readonly RefObject<HTMLElement | null>[],
    scrubLine: TimelineLiveValue<number | null> | undefined,
    startX: number,
    endX: number,
    pixelsPerBeat: number,
) => {
    const apply = useCallback(() => {
        const line = scrubLine?.get() ?? null;
        let transform = "";
        if (line !== null && endX > startX) {
            const ratio = window.devicePixelRatio || 1;
            const x = Math.round(beatToX(line, pixelsPerBeat) * ratio) / ratio;
            transform = `scaleX(${Math.max(0, x - startX) / (endX - startX)})`;
        }
        for (const ref of refs) {
            const element = ref.current;
            if (element && element.style.transform !== transform)
                element.style.transform = transform;
        }
        // The refs are fixed for the caller's lifetime
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endX, pixelsPerBeat, scrubLine, startX]);
    useLayoutEffect(apply, [apply]);
    useLayoutEffect(() => scrubLine?.subscribe(apply), [apply, scrubLine]);
};

export const TimelinePlayhead = memo(function TimelinePlayhead({
    model,
    positionBeat,
    livePositionBeat,
    pixelsPerBeat,
    height,
    beatCount,
    anchorRef,
    onSeek,
    isPlaying = false,
    scrubLine,
}: {
    model: TimelineViewModel;
    positionBeat: BeatPosition;
    /**
     * While playing, the live position (view beats, fractional). The line follows it every
     * animation frame by setting its own `left`, without re-rendering the timeline.
     */
    livePositionBeat?: () => number | null;
    pixelsPerBeat: number;
    height: number;
    beatCount: number;
    anchorRef: RefObject<HTMLButtonElement | null>;
    onSeek?: (beat: BeatPosition, options?: TimelineSeekOptions) => void;
    /** While playing, each arrow key jumps playback on its own */
    isPlaying?: boolean;
    /**
     * While a scrub is down, where it draws the line (view beats, between beats): the line
     * follows the pointer by a transform, without re-rendering (`useScrubFollow`)
     */
    scrubLine?: TimelineLiveValue<number | null>;
}) {
    const keySteps = useArrowKeySteps(onSeek);
    // Whole pixels at rest, like the start flag, so the head and the line land on the same pixels
    const left = Math.round(beatToX(positionBeat, pixelsPerBeat));
    // Where React last put the line; read when following stops (see below)
    const restingLeft = useRef(left);
    restingLeft.current = left;
    // While playing, the live position moves the line (below); a scrub over playback suspends it
    useScrubFollow(
        anchorRef,
        scrubLine,
        left,
        pixelsPerBeat,
        !livePositionBeat,
    );
    // While playing, puts the line at the live position; while the pointer is down on the
    // timeline (a press that may still be a click, a scrub not yet suspended), under it
    const placeLive = useCallback(() => {
        const element = anchorRef.current;
        const beat = scrubLine?.get() ?? livePositionBeat?.() ?? null;
        if (!element || beat === null) return;
        // Device pixels while playing: crisp, and still smooth on a high-density screen
        const ratio = window.devicePixelRatio || 1;
        element.style.left = `${Math.round(beatToX(beat, pixelsPerBeat) * ratio) / ratio}px`;
    }, [anchorRef, livePositionBeat, pixelsPerBeat, scrubLine]);
    // Layout effects, as the played waveform's: a commit inside an animation frame (a zoom's
    // flushSync) writes the resting `left` and paints in that same frame, so the live position is
    // put back before paint rather than in the next frame
    useLayoutEffect(() => {
        const element = anchorRef.current;
        if (!livePositionBeat || !element) return;
        let frame = 0;
        const follow = () => {
            placeLive();
            frame = requestAnimationFrame(follow);
        };
        follow();
        const unsubscribe = scrubLine?.subscribe(placeLive);
        return () => {
            cancelAnimationFrame(frame);
            unsubscribe?.();
            // React only writes `left` when its value changes, so put the line back itself
            element.style.left = `${restingLeft.current}px`;
        };
    }, [anchorRef, livePositionBeat, placeLive, scrubLine]);
    // After any other commit while playing, such as a new `positionBeat`, React may have written
    // the resting `left`
    useLayoutEffect(() => {
        if (livePositionBeat) placeLive();
    });

    return (
        <button
            ref={anchorRef}
            type="button"
            data-testid="timeline-playhead"
            data-timeline-scrub="true"
            aria-label={`Playback position: ${getPlayheadReadout(model, positionBeat).spoken}`}
            onPointerDown={(event) => event.preventDefault()}
            onKeyDown={(event) => {
                const delta =
                    event.key === "ArrowLeft"
                        ? -1
                        : event.key === "ArrowRight"
                          ? 1
                          : 0;
                if (delta === 0 || !onSeek) return;
                event.preventDefault();
                if (isPlaying) {
                    onSeek(
                        clamp(Math.round(positionBeat) + delta, 0, beatCount),
                    );
                    return;
                }
                keySteps.step(
                    (from) => clamp(from + delta, 0, beatCount),
                    Math.round(positionBeat),
                    event.repeat,
                );
            }}
            onKeyUp={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                    keySteps.release();
            }}
            onBlur={keySteps.end}
            className="focus-visible:ring-accent pointer-events-auto absolute top-0 z-50 w-12 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2"
            style={{
                left,
                height,
            }}
        >
            {/* The line runs from the page boxes' top (1px down, inside the ruler's border), and
                the head is a fill centered on the line's pixel, so its tip runs into the line */}
            <span className="bg-accent absolute top-px bottom-0 left-1/2 w-px" />
            <svg
                width="9"
                height="6"
                viewBox="0 0 9 6"
                aria-hidden="true"
                className="text-accent absolute top-px left-[calc(50%-4px)]"
            >
                <path d="M0 0 L9 0 L4.5 6 Z" fill="currentColor" />
            </svg>
        </button>
    );
});

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
/** How close, in pixels, a click or scrub must come to a downbeat or page line to land on it */
export const TIMELINE_SEEK_SNAP_PX = 6;

/**
 * Where a click or scrub at `beat` lands (UI-12): on a downbeat or page line within
 * `TIMELINE_SEEK_SNAP_PX`, else the nearest whole beat. Alt turns it off, as for dragged flags.
 */
export const snapSeekBeat = (
    beat: number,
    seekSnapBeats: readonly number[],
    pixelsPerBeat: number,
    snapDisabled: boolean,
) =>
    (snapDisabled ? null : nearSeekSnap(beat, seekSnapBeats, pixelsPerBeat)) ??
    Math.round(beat);

/** The downbeat or page line within `TIMELINE_SEEK_SNAP_PX` of `beat`, nearest first; else null */
const nearSeekSnap = (
    beat: number,
    seekSnapBeats: readonly number[],
    pixelsPerBeat: number,
): number | null => {
    let best: number | null = null;
    for (const candidate of seekSnapBeats)
        if (
            Math.abs(candidate - beat) * pixelsPerBeat <=
                TIMELINE_SEEK_SNAP_PX &&
            (best === null ||
                Math.abs(candidate - beat) < Math.abs(best - beat))
        )
            best = candidate;
    return best;
};

/**
 * Where a scrub draws the playhead line while the pointer is down (UI-12): on the beat the playhead
 * is on, so the line steps beat by beat, with the downbeat or page line a release would land on
 * (project owner, 2026-10-07: "I like the beat-level drag"). It's written on the pointer move that
 * moves it, through a transform, so it doesn't wait for React to render the new beat.
 *
 * `sent` is the beat the move seeked to (`snapSeekBeat`) and `landed` where the playhead is after it,
 * when the owner says (`TimelineSeek`): the same beat, or the held playhead when it couldn't follow
 * (inside an isolated range).
 */
export const scrubLineBeat = (sent: number, landed: number | null | void) =>
    typeof landed === "number" ? landed : sent;

/** macOS, where Ctrl+click is a right-click and Cmd is the modifier */
export const isMac = () =>
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The modifier that turns a drag on the timeline into a drawn range (UI-12): Cmd on macOS, Ctrl
 * elsewhere. Without it a drag scrubs the playhead.
 */
export const isRangeModifier = (event: {
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
}) => (isMac() ? event.metaKey : event.ctrlKey);

export const useTimelinePointer = ({
    onSeek,
    onRangeSelect,
    pixelsPerBeat,
    beatCount,
    snapBeats = [],
    seekSnapBeats = [],
}: {
    onSeek?: TimelineSeek;
    onRangeSelect?: (range: TimelineBeatRange) => void;
    pixelsPerBeat: number;
    beatCount: number;
    snapBeats?: readonly number[];
    /** Downbeats and page lines a click or scrub lands on when near (UI-12) */
    seekSnapBeats?: readonly number[];
}) => {
    // Every move of a range drag writes it: only the preview leaf reads it (`TimelineRangePreview`)
    const [rangePreview] = useState(() =>
        createLiveValue<TimelineBeatRange | null>(
            null,
            (a, b) => a === b || sameRange(a, b),
        ),
    );
    // Every move of a scrub writes where the line is drawn (`scrubLineBeat`, view beats): the
    // playhead, **+**, the played waveform and the window's tint move themselves to it without a
    // render (`useScrubFollow`, `useScrubStretch`). `null` when not scrubbing.
    const [scrubLine] = useState(() => createLiveValue<number | null>(null));
    const gesture = useRef<{
        mode: "scrub" | "press" | "range";
        startClientX: number;
        startBeat: number;
        /** The last beat a scrub sent, which a cancel ends on */
        lastBeat: number | null;
    } | null>(null);
    const edgeScroll = useScrubEdgeScroll();
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
    const beatAtClientX = useCallback(
        (element: Element, clientX: number) =>
            clientXToBeat({
                clientX,
                surfaceLeft: element.getBoundingClientRect().left,
                pixelsPerBeat,
                startBeat: 0,
                beatCount,
            }),
        [beatCount, pixelsPerBeat],
    );
    const pointerBeat = useCallback(
        (event: ReactPointerEvent<HTMLElement>) =>
            beatAtClientX(event.currentTarget, event.clientX),
        [beatAtClientX],
    );
    const seek = useCallback(
        (
            beat: number,
            event: { readonly altKey: boolean },
            seekGesture?: TimelineSeekGesture,
        ) => {
            const snapped = snapSeekBeat(
                beat,
                seekSnapBeats,
                pixelsPerBeat,
                isPageSnapDisabled(event),
            );
            if (gesture.current && seekGesture !== undefined)
                gesture.current.lastBeat = snapped;
            // The seek only goes out when the beat changes (`seekTimeline`)
            const landed = onSeek?.(
                snapped,
                seekGesture === undefined
                    ? undefined
                    : { gesture: seekGesture },
            );
            // During a scrub the line steps to the beat the playhead is on (`scrubLineBeat`) in this
            // move, without waiting for a render. A timeline that can't seek (read-only) keeps its
            // line where it is.
            if (onSeek && (seekGesture === "press" || seekGesture === "drag"))
                scrubLine.set(scrubLineBeat(snapped, landed));
        },
        [onSeek, pixelsPerBeat, scrubLine, seekSnapBeats],
    );

    // The scrub's line is let go after the gesture's last seek (`release`), so a line drawn over
    // playback goes straight to where playback jumped
    const end = () => {
        gesture.current = null;
        edgeScroll.stop();
        rangePreview.set(null);
    };
    const release = () => scrubLine.set(null);
    /** Ends a gesture without its release: a range isn't selected, a scrub ends where it was */
    const cancel = () => {
        const current = gesture.current;
        if (!current) return;
        end();
        // The scrub ends where it was, so a suspended playback resumes and S settles
        if (current.mode === "scrub" && current.lastBeat !== null)
            onSeek?.(current.lastBeat, { gesture: "end" });
        release();
    };
    // A gesture still down when the timeline goes (a variant switch, focusing the page timeline)
    // is cancelled, so the seek's owner doesn't wait for a release that never comes
    const latestCancel = useRef(cancel);
    latestCancel.current = cancel;
    useEffect(() => () => latestCancel.current(), []);

    return {
        rangePreview,
        scrubLine,
        pointerHandlers: {
            onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
                const current = gesture.current;
                if (!current) return;
                if (current.mode === "scrub") {
                    seek(pointerBeat(event), event, "drag");
                    const surface = event.currentTarget;
                    const { clientX, altKey } = event;
                    edgeScroll.follow(clientX, surface, () =>
                        seek(
                            beatAtClientX(surface, clientX),
                            { altKey },
                            "drag",
                        ),
                    );
                    return;
                }
                if (
                    current.mode === "press" &&
                    Math.abs(event.clientX - current.startClientX) <
                        TIMELINE_RANGE_DRAG_PX
                )
                    return;
                current.mode = "range";
                rangePreview.set(draggedRange(event, current.startBeat));
            },
            onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
                const drawing = isRangeModifier(event);
                if (
                    (event.button !== undefined && event.button !== 0) ||
                    // macOS ctrl+click is a right-click: it opens the context menu, not a seek
                    (isMac() && event.ctrlKey) ||
                    (event.target instanceof Element &&
                        // With the range modifier page boxes and clips are timeline space too (UI-12)
                        event.target.closest(
                            drawing
                                ? "[data-timeline-interactive]:not([data-timeline-range-start])"
                                : "[data-timeline-interactive]",
                        ))
                )
                    return;
                const onPlayhead =
                    event.target instanceof Element &&
                    event.target.closest("[data-timeline-scrub]") != null;
                const startBeat = pointerBeat(event);
                // UI-12: a plain drag scrubs; Ctrl+drag (Cmd on macOS) draws a range
                gesture.current = {
                    mode:
                        onPlayhead || !onRangeSelect || !drawing
                            ? "scrub"
                            : "press",
                    startClientX: event.clientX,
                    startBeat,
                    lastBeat: null,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
                if (gesture.current.mode === "scrub" && !onPlayhead)
                    seek(startBeat, event, "press");
            },
            onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
                const current = gesture.current;
                if (!current) return;
                const { currentTarget, pointerId } = event;
                if (current.mode === "range") {
                    const range = draggedRange(event, current.startBeat);
                    end();
                    currentTarget.releasePointerCapture?.(pointerId);
                    if (range) onRangeSelect?.(range);
                    return;
                }
                end();
                // After the gesture has ended, so the capture's loss (below) finds nothing to end
                currentTarget.releasePointerCapture?.(pointerId);
                // A range-modifier press that didn't move is a click: one seek
                if (current.mode === "press") seek(current.startBeat, event);
                else seek(pointerBeat(event), event, "end");
                release();
            },
            onPointerCancel: cancel,
            // The capture can go without a pointerup or pointercancel (the window loses focus
            // mid-drag and the button is released outside it): end as a cancel does
            onLostPointerCapture: cancel,
        },
    };
};

/** The range a Ctrl/Cmd drag is drawing (UI-9), the only part of the timeline each move redraws */
export const TimelineRangePreview = memo(function TimelineRangePreview({
    preview,
    pixelsPerBeat,
    height,
}: {
    preview: TimelineLiveValue<TimelineBeatRange | null>;
    pixelsPerBeat: number;
    height: number;
}) {
    const range = useLiveValue(preview);
    if (!range) return null;
    return (
        <div
            data-testid="timeline-range-preview"
            aria-hidden="true"
            className="bg-accent/15 border-accent pointer-events-none absolute top-28 z-30 border-x"
            style={{
                left: range.startBeatIndex * pixelsPerBeat,
                width:
                    (range.endBeatIndex - range.startBeatIndex) * pixelsPerBeat,
                height: Math.max(0, height - 28),
            }}
        />
    );
});

export const useElementWidth = (ref: RefObject<HTMLElement | null>) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const updateWidth = () => setWidth(element.clientWidth);
        updateWidth();
        // Without ResizeObserver (jsdom) the first measure stands
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
};
