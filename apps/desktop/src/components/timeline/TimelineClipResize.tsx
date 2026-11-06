import clsx from "clsx";
import tolgee from "@/global/singletons/Tolgee";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { clamp, isPageSnapDisabled, sameRange } from "./TimelineGeometry";
import { snapEdgeBeat, stepOffForbidden } from "./timelineEdgeSnap";
import type {
    TimelineBeatRange,
    TimelineRangeChange,
    TimelineRangeCommitResult,
    TimelineTrackId,
} from "./TimelineViewModel";

/**
 * Resizing a move by dragging its clip's start or end edge (docs/timeline/research/resize-move).
 * The clip (`TimelineTrackClip`) calls `useClipEdgeResize` and draws its handles; this file holds
 * the gesture, so the clip itself only gains a preview range.
 */

/** Where one edge can go, in the clip's beats, and why it stops there (`null`: the show's edge). */
export interface ClipResizeBound {
    readonly beat: number;
    readonly reason: string | null;
}

/** How far a clip's edges can be dragged, read when a drag starts. */
export interface ClipResizeLimits {
    readonly startEdge: {
        readonly min: ClipResizeBound;
        readonly max: ClipResizeBound;
    };
    readonly endEdge: {
        readonly min: ClipResizeBound;
        readonly max: ClipResizeBound;
    };
    /** Ranges a clip can't take (another move's or page's), with what to say instead (C-12) */
    readonly taken: readonly (TimelineBeatRange & {
        readonly reason: string;
    })[];
}

/** What the timeline offers for resizing clips; without it clips have no handles. */
export interface TimelineClipResizeCommands {
    /** The limits for the clip's timeline, or `null` when it can't be resized */
    readonly limits: (
        trackId: TimelineTrackId,
    ) => Promise<ClipResizeLimits | null>;
    /** Commits a new range, as one undoable edit */
    readonly commit: (change: TimelineRangeChange) => TimelineRangeCommitResult;
}

/** Pointer travel before a press on a handle becomes a resize (as the clip's move drag). */
const RESIZE_DRAG_PX = 4;
/** A handle's widest, inside the clip's edge. */
const HANDLE_MAX_PX = 6;
/** Narrower clips have no handles: their whole width is the body (V-120). */
const HANDLE_MIN_CLIP_PX = 8;

/** Each handle's width for a clip `width` px wide: up to 6 px, at most a quarter of the clip. */
export const clipHandleWidth = (width: number): number =>
    width < HANDLE_MIN_CLIP_PX
        ? 0
        : Math.min(HANDLE_MAX_PX, Math.floor(width / 4));

type Edge = "start" | "end";

let clipGestures = 0;

/**
 * Whether a clip is being moved or resized. Esc then cancels the gesture only, so the isolation
 * bar's Esc (`useIsolationEscape`, which listens on the window before any gesture starts) leaves
 * isolation alone.
 */
export const clipGestureActive = (): boolean => clipGestures > 0;

/**
 * While `active` (a clip move or resize past its threshold), Esc calls `cancel` and goes no
 * further (E14), and `clipGestureActive` is true.
 */
export function useClipGestureEscape(active: boolean, cancel: () => void) {
    const cancelRef = useRef(cancel);
    cancelRef.current = cancel;
    useEffect(() => {
        if (!active) return;
        clipGestures += 1;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            cancelRef.current();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
            clipGestures -= 1;
            window.removeEventListener("keydown", onKeyDown, true);
        };
    }, [active]);
}

/** The longest a released drag's preview waits for its new range before letting go */
export const RELEASED_PREVIEW_TIMEOUT_MS = 2000;

/**
 * Holds a released clip drag's preview until the new range arrives from the database, so the clip
 * doesn't jump back to where it was for a moment between the release and the reload (owner
 * 2026-10-16, as a dropped page flag). `hold(result)` starts waiting on a commit's result: a
 * commit that wrote nothing (`false`) calls `letGo` at once, and so does the timeout, so a preview
 * can never stick. The clip calls `release` itself when the range changes, or on any other way
 * the preview ends (Esc, a cancel, a new press), which stops the wait.
 */
export function useReleasedPreview(letGo: () => void): {
    readonly hold: (result: TimelineRangeCommitResult) => void;
    readonly release: () => void;
    /** Whether a released drag is waiting for its range */
    readonly holding: boolean;
} {
    const letGoRef = useRef(letGo);
    letGoRef.current = letGo;
    const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [holding, setHolding] = useState(false);
    const release = useCallback(() => {
        if (waiting.current !== null) clearTimeout(waiting.current);
        waiting.current = null;
        setHolding(false);
    }, []);
    const hold = useCallback(
        (result: TimelineRangeCommitResult) => {
            release();
            const timer = setTimeout(() => {
                if (waiting.current !== timer) return;
                release();
                letGoRef.current();
            }, RELEASED_PREVIEW_TIMEOUT_MS);
            waiting.current = timer;
            setHolding(true);
            void Promise.resolve(result).then(
                (written) => {
                    if (written !== false || waiting.current !== timer) return;
                    release();
                    letGoRef.current();
                },
                () => undefined,
            );
        },
        [release],
    );
    useEffect(
        () => () => {
            if (waiting.current !== null) clearTimeout(waiting.current);
            // A commit that settles after unmount finds nothing waiting
            waiting.current = null;
        },
        [],
    );
    return { hold, release, holding };
}

/** A resize in progress, as drawn: the range so far, and why it can't go further. */
export interface ClipResizePreview extends TimelineBeatRange {
    readonly edge: Edge;
    /** The range the drag started from, as drawn (a drop still waiting for its range, or the range) */
    readonly from?: TimelineBeatRange;
    /** Why the edge stopped short of the pointer, if it did */
    readonly stoppedBy: string | null;
    /**
     * Why the pointer's beat can't be taken (another move or page has exactly that range, C-12):
     * the edge waits on the nearest beat back toward where it started (UI-15)
     */
    readonly blockedBy: string | null;
}

/**
 * Where the dragged edge lands for a pointer at `beat`, by UI-15's edge rule: snapped
 * (`snapEdgeBeat`: page lines and the playhead within 12 px, downbeats within 6 px, else a whole
 * beat; Alt drops all but the whole beat), held inside the limits and the show, and off any beat
 * that would give the move another's exact range. Pure, for tests.
 */
export function resizedRange({
    range,
    edge,
    beat,
    snapBeats,
    downbeats = [],
    playheadBeat = null,
    snapDisabled = false,
    pixelsPerBeat,
    beatCount,
    limits,
}: {
    range: TimelineBeatRange;
    edge: Edge;
    beat: number;
    /** The page lines */
    snapBeats: readonly number[];
    downbeats?: readonly number[];
    playheadBeat?: number | null;
    snapDisabled?: boolean;
    pixelsPerBeat: number;
    beatCount: number;
    limits: ClipResizeLimits | null;
}): ClipResizePreview {
    const snapped = snapEdgeBeat({
        beat,
        pageBeats: snapBeats,
        downbeats,
        playheadBeat,
        pixelsPerBeat,
        snapDisabled,
        from: edge === "start" ? range.startBeatIndex : range.endBeatIndex,
    });
    const bounds =
        edge === "start"
            ? (limits?.startEdge ?? {
                  min: { beat: 0, reason: null },
                  max: {
                      beat: range.endBeatIndex - 1,
                      reason: tolgee.t("timeline.clipResize.minimum"),
                  },
              })
            : (limits?.endEdge ?? {
                  min: {
                      beat: range.startBeatIndex + 1,
                      reason: tolgee.t("timeline.clipResize.minimum"),
                  },
                  max: { beat: beatCount, reason: null },
              });
    const one = { reason: tolgee.t("timeline.clipResize.minimum") };
    let max =
        edge === "end" && bounds.max.beat > beatCount
            ? { beat: beatCount, reason: null }
            : bounds.max;
    let min = bounds.min.beat < 0 ? { beat: 0, reason: null } : bounds.min;
    // At least a count on the clip's own axis too (a move stored from spec beat 0 folds onto 1)
    if (edge === "start" && max.beat > range.endBeatIndex - 1)
        max = { ...one, beat: range.endBeatIndex - 1 };
    if (edge === "end" && min.beat < range.startBeatIndex + 1)
        min = { ...one, beat: range.startBeatIndex + 1 };
    const clamped = clamp(snapped, min.beat, Math.max(min.beat, max.beat));
    const stoppedBy =
        snapped < clamped ? min.reason : snapped > clamped ? max.reason : null;
    // The beats where this edge would give the move another's exact range (C-12). Where the
    // edge started never is: dropping it there changes nothing, though a move split off a
    // page's timeline shares that range with it (UI-25)
    const from = edge === "start" ? range.startBeatIndex : range.endBeatIndex;
    const forbidden = new Map<number, string>();
    for (const t of limits?.taken ?? []) {
        if (
            edge === "start" &&
            t.endBeatIndex === range.endBeatIndex &&
            t.startBeatIndex !== from
        )
            forbidden.set(t.startBeatIndex, t.reason);
        if (
            edge === "end" &&
            t.startBeatIndex === range.startBeatIndex &&
            t.endBeatIndex !== from
        )
            forbidden.set(t.endBeatIndex, t.reason);
    }
    const landed = stepOffForbidden(clamped, from, new Set(forbidden.keys()));
    return {
        ...(edge === "start"
            ? { startBeatIndex: landed, endBeatIndex: range.endBeatIndex }
            : { startBeatIndex: range.startBeatIndex, endBeatIndex: landed }),
        edge,
        stoppedBy,
        blockedBy: forbidden.get(clamped) ?? null,
    };
}

/**
 * The drag tag's text, worded as a dragged page flag's readout (UI-15): "Move 3: 4 → 6 counts",
 * then why the edge stopped, why it waits short of the pointer, or how many page flags the move
 * now passes that it didn't (E4).
 */
export function clipResizeTagText(
    from: TimelineBeatRange,
    preview: ClipResizePreview,
    snapBeats: readonly number[],
    label?: string,
): string {
    const length = (r: TimelineBeatRange) => r.endBeatIndex - r.startBeatIndex;
    const change = label
        ? tolgee.t("timeline.clipResize.changeNamed", {
              label,
              before: length(from),
              after: length(preview),
          })
        : tolgee.t("timeline.clipResize.change", {
              before: length(from),
              after: length(preview),
          });
    const note =
        preview.blockedBy ??
        preview.stoppedBy ??
        (() => {
            const inside = (r: TimelineBeatRange, b: number) =>
                r.startBeatIndex < b && b < r.endBeatIndex;
            const crossed = snapBeats.filter(
                (b) => inside(preview, b) && !inside(from, b),
            ).length;
            return crossed === 0
                ? null
                : tolgee.t("timeline.clipResize.throughFlags", {
                      count: crossed,
                  });
        })();
    return note
        ? tolgee.t("timeline.clipResize.withNote", { change, note })
        : change;
}

/**
 * The resize gesture for one clip. Returns the range to draw while resizing (`null` otherwise),
 * its two handles, the drag tag, and `swallowClick`, which the clip's `onClick` asks so the click
 * that ends a resize doesn't also select the clip.
 */
/** The resize tag's height and its gap above the clip, in px */
const RESIZE_TAG_ROOM_PX = 22;

/**
 * Whether the resize tag fits above the clip, between it and the timeline's pinned ruler. On a
 * top row, or a row scrolled up under the ruler, the ruler would cover it, so it goes beside the
 * dragged edge instead (below could fall off the bottom of the pane).
 */
const tagFitsAbove = (handle: Element) => {
    const header = handle
        .closest('[data-testid="timeline-pointer-surface"]')
        ?.querySelector('[data-testid="timeline-pinned-header"]');
    if (!header) return true;
    return (
        handle.getBoundingClientRect().top -
            header.getBoundingClientRect().bottom >=
        RESIZE_TAG_ROOM_PX
    );
};

export function useClipEdgeResize({
    trackId,
    label,
    range,
    width,
    height,
    pixelsPerBeat,
    beatCount,
    snapBeats,
    downbeats,
    snapPlayhead,
    resize,
    held = null,
    onDragStart,
}: {
    trackId: TimelineTrackId;
    /** The move's name, which the tag starts with */
    label?: string;
    range: TimelineBeatRange | null;
    /** The clip's drawn width in px (the handles shrink with it) */
    width: number;
    height: number;
    pixelsPerBeat: number;
    beatCount: number | undefined;
    /** The page lines */
    snapBeats: readonly number[];
    /** The measures' downbeats, which pull an edge more weakly (UI-15) */
    downbeats?: readonly number[];
    /** The playhead, read when a drag starts; an edge lands on it when near (UI-15) */
    snapPlayhead?: () => number;
    resize: TimelineClipResizeCommands | undefined;
    /** Where the clip is drawn by another gesture's drop that waits for its range (a move) */
    held?: TimelineBeatRange | null;
    /** A resize drag starts: another gesture's dropped preview gives way to it */
    onDragStart?: () => void;
}): {
    preview: ClipResizePreview | null;
    handles: ReactNode;
    tag: ReactNode;
    swallowClick: () => boolean;
    /** Forgets a swallowed click that never came (a new press on the clip) */
    resetClick: () => void;
    /** Ends a dropped resize's wait now: another gesture took the clip over */
    letGo: () => void;
} {
    const [preview, setPreview] = useState<ClipResizePreview | null>(null);
    const [tagBeside, setTagBeside] = useState(false);
    const dragRef = useRef<{
        /** Which press this is (`gestures`) */
        gesture: number;
        pointerId: number;
        edge: Edge;
        startClientX: number;
        /**
         * The range the drag started from, as drawn, and its edge's beat; set once it moves. A drag
         * started during a drop's wait starts from the drop, not from the range it replaces
         */
        base: TimelineBeatRange | null;
        startBeat: number;
        moved: boolean;
        /** The latest pointer, so the edge can settle when the limits arrive */
        clientX: number;
        snapDisabled: boolean;
        /** The playhead when the drag started */
        playhead: number | null;
        limits: ClipResizeLimits | null;
        preview: ClipResizePreview | null;
        /** Settles once the limits are read (or failed to be) */
        limitsRead: Promise<unknown>;
    } | null>(null);
    const swallowRef = useRef(false);
    /** Counts presses on the handles; the last one that became a drag owns the preview */
    const gestures = useRef(0);
    const draggedGesture = useRef(0);

    // A released resize stays drawn until its range arrives (or the commit wrote nothing)
    const released = useReleasedPreview(() => setPreview(null));
    const { release } = released;
    // A cancelled drag goes back to where it started: a drop still waiting for its range waits on
    const backToStart = (drag: typeof dragRef.current) => {
        if (drag?.base && range && !sameRange(drag.base, range)) {
            setPreview({
                ...drag.base,
                edge: drag.edge,
                stoppedBy: null,
                blockedBy: null,
            });
            released.hold(undefined);
        } else setPreview(null);
    };
    // A new range from the database ends the preview (as the clip's move drag). A drag started
    // from a drop that was waiting for this range goes on, and so does a press that hasn't moved
    const rangeStart = range?.startBeatIndex;
    const rangeEnd = range?.endBeatIndex;
    useEffect(() => {
        const drag = dragRef.current;
        const arrived =
            rangeStart === undefined || rangeEnd === undefined
                ? null
                : { startBeatIndex: rangeStart, endBeatIndex: rangeEnd };
        if (drag?.base && sameRange(drag.base, arrived)) return;
        if (drag?.moved) dragRef.current = null;
        release();
        setPreview(null);
    }, [rangeStart, rangeEnd, release]);

    // Esc cancels a resize in progress: nothing is committed or selected (E14). A released one
    // is already committed; Esc then goes on to whatever else it does
    useClipGestureEscape(preview !== null && !released.holding, () => {
        const drag = dragRef.current;
        dragRef.current = null;
        swallowRef.current = true;
        backToStart(drag);
    });

    const handleWidth = clipHandleWidth(width);
    const canResize =
        resize !== undefined &&
        range !== null &&
        beatCount !== undefined &&
        handleWidth > 0;

    const landAt = (
        drag: NonNullable<typeof dragRef.current>,
        clientX: number,
        snapDisabled: boolean,
    ) =>
        resizedRange({
            range: drag.base ?? range!,
            edge: drag.edge,
            beat:
                drag.startBeat + (clientX - drag.startClientX) / pixelsPerBeat,
            snapBeats,
            downbeats,
            playheadBeat: drag.playhead,
            snapDisabled,
            pixelsPerBeat,
            beatCount: beatCount!,
            limits: drag.limits,
        });
    const landWith = (
        drag: NonNullable<typeof dragRef.current>,
        clientX: number,
        snapDisabled: boolean,
    ): ClipResizePreview => ({
        ...landAt(drag, clientX, snapDisabled),
        ...(drag.base ? { from: drag.base } : {}),
    });

    const handleProps = (edge: Edge) => ({
        "data-testid": `timeline-clip-resize-${edge}`,
        "aria-hidden": true,
        onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => {
            swallowRef.current = false;
            // Ctrl/Cmd draws a range from here, and other buttons open menus: the clip's
            // handlers and the surface take those
            if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
            event.stopPropagation();
            // A press during a released resize's wait keeps the wait: only a drag ends it
            // (below), so a press that never moves can't leave the dropped preview behind
            const drag = {
                gesture: ++gestures.current,
                pointerId: event.pointerId,
                edge,
                startClientX: event.clientX,
                base: null as TimelineBeatRange | null,
                startBeat: 0,
                moved: false,
                clientX: event.clientX,
                snapDisabled: isPageSnapDisabled(event),
                playhead: snapPlayhead ? Math.round(snapPlayhead()) : null,
                limits: null as ClipResizeLimits | null,
                preview: null as ClipResizePreview | null,
                limitsRead: Promise.resolve() as Promise<unknown>,
            };
            dragRef.current = drag;
            setTagBeside(!tagFitsAbove(event.currentTarget));
            event.currentTarget.setPointerCapture?.(event.pointerId);
            // The limits come from the database; until they arrive only the show and the one
            // count minimum hold, and the edge settles inside them once they do
            drag.limitsRead = resize!.limits(trackId).then(
                (limits) => {
                    // Kept even after release: a release waiting for them commits with them
                    drag.limits = limits;
                    if (dragRef.current !== drag) return;
                    if (drag.preview) {
                        const settled = landWith(
                            drag,
                            drag.clientX,
                            drag.snapDisabled,
                        );
                        drag.preview = settled;
                        setPreview(settled);
                    }
                },
                () => undefined,
            );
        },
        onPointerMove: (event: ReactPointerEvent<HTMLSpanElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (
                !drag.moved &&
                Math.abs(event.clientX - drag.startClientX) < RESIZE_DRAG_PX
            )
                return;
            if (!drag.moved) {
                // It starts from where the clip is drawn: a drop still waiting (this clip's
                // resize or move) or the range
                const base = held ?? preview ?? range!;
                drag.base = {
                    startBeatIndex: base.startBeatIndex,
                    endBeatIndex: base.endBeatIndex,
                };
                drag.startBeat =
                    edge === "start" ? base.startBeatIndex : base.endBeatIndex;
                draggedGesture.current = drag.gesture;
                released.release();
                onDragStart?.();
            }
            drag.moved = true;
            drag.clientX = event.clientX;
            drag.snapDisabled = isPageSnapDisabled(event);
            event.stopPropagation();
            const next = landWith(
                drag,
                event.clientX,
                isPageSnapDisabled(event),
            );
            drag.preview = next;
            setPreview(next);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLSpanElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            dragRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            // A press that didn't move is a click on the clip: it selects, nothing resizes
            if (!drag.moved) return;
            event.stopPropagation();
            swallowRef.current = true;
            // The modifiers held at release decide, as for the clip's move drag. A release
            // before the limits arrive waits for them, so it stops where a slower drag would.
            // Until the new range arrives the clip stays drawn where it was dropped, without
            // the tag, instead of jumping back for a moment
            const clientX = event.clientX;
            const snapDisabled = isPageSnapDisabled(event);
            const settle = (next: ClipResizePreview) =>
                setPreview({ ...next, stoppedBy: null, blockedBy: null });
            const finish = () => {
                const next = landWith(drag, clientX, snapDisabled);
                // A newer drag started while the limits were read: the drop still commits, but
                // the preview and the wait are the newer drag's now. A newer press that hasn't
                // moved leaves them to this one
                const superseded = draggedGesture.current !== drag.gesture;
                // Dropped where it started from: nothing new to commit. A drag that started from
                // a drop still waiting for its range waits on as that drop
                const from = drag.base ?? range!;
                if (sameRange(next, from)) {
                    if (superseded) return;
                    if (sameRange(from, range!)) {
                        released.release();
                        setPreview(null);
                    } else {
                        settle(next);
                        released.hold(undefined);
                    }
                    return;
                }
                // It commits where it waits: never on a forbidden beat (UI-15)
                const result = resize!.commit({
                    timelineId: trackId,
                    startBeatIndex: next.startBeatIndex,
                    endBeatIndex: next.endBeatIndex,
                });
                if (superseded) return;
                settle(next);
                released.hold(result);
            };
            if (drag.limits) finish();
            else {
                // Drawn where the drag left it while the limits are read; `finish` then waits
                // on the commit instead
                if (drag.preview) settle(drag.preview);
                released.hold(undefined);
                void drag.limitsRead.then(finish);
            }
        },
        // A press that never moved leaves a dropped resize's wait alone, as its release does
        onPointerCancel: () => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag?.moved) backToStart(drag);
        },
        // A lost capture (the window losing the pointer mid-drag) cancels, as for a page flag's
        // grip: the release may land off the handle, and the preview mustn't stick (E14)
        onLostPointerCapture: () => {
            const drag = dragRef.current;
            if (!drag) return;
            dragRef.current = null;
            if (!drag.moved) return;
            swallowRef.current = true;
            backToStart(drag);
        },
        // The click ending a press on a handle still reaches the clip, which selects on it. Under
        // the start flag (z-40) and the playhead (z-50), which run down over the clip rows: where
        // they cross a move's end, the line wins (UI-21, project owner 2026-10-14)
        className:
            "group/resize absolute top-0 z-[1] cursor-ew-resize touch-none",
        style: {
            width: handleWidth,
            height,
            ...(edge === "start" ? { left: 0 } : { right: 0 }),
        },
    });

    const handles = canResize ? (
        <>
            <span {...handleProps("start")}>
                <span className="bg-text/60 pointer-events-none absolute inset-y-[2px] left-0 hidden w-[2px] rounded-full group-hover/resize:block" />
            </span>
            <span {...handleProps("end")}>
                <span className="bg-text/60 pointer-events-none absolute inset-y-[2px] right-0 hidden w-[2px] rounded-full group-hover/resize:block" />
            </span>
        </>
    ) : null;

    const tag =
        preview && range && !released.holding ? (
            <span
                data-testid="timeline-clip-resize-tag"
                role="status"
                className={clsx(
                    // Opaque: it often sits over the waveform
                    "rounded-4 bg-bg-1 border-stroke text-sub pointer-events-none absolute z-[60] border px-4 py-[1px] whitespace-nowrap shadow-sm",
                    preview.blockedBy ? "text-red" : "text-text",
                    tagBeside
                        ? clsx(
                              // Level with the clip's top, so none of it reaches up under the ruler
                              "top-0",
                              preview.edge === "start"
                                  ? "right-full mr-1"
                                  : "left-full ml-1",
                          )
                        : clsx(
                              "bottom-full mb-1",
                              preview.edge === "start" ? "left-0" : "right-0",
                          ),
                )}
            >
                {clipResizeTagText(
                    preview.from ?? range,
                    preview,
                    snapBeats,
                    label,
                )}
            </span>
        ) : null;

    return {
        preview,
        handles,
        tag,
        resetClick: () => {
            swallowRef.current = false;
        },
        letGo: () => {
            if (!released.holding) return;
            released.release();
            setPreview(null);
        },
        swallowClick: () => {
            const swallowed = swallowRef.current;
            swallowRef.current = false;
            return swallowed;
        },
    };
}
