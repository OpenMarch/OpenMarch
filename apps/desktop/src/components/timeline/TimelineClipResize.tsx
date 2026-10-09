import clsx from "clsx";
import {
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { clamp, isPageSnapDisabled } from "./TimelineGeometry";
import { snapEdgeBeat, stepOffForbidden } from "./timelineEdgeSnap";
import type {
    TimelineBeatRange,
    TimelineRangeChange,
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
    readonly commit: (change: TimelineRangeChange) => void;
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

/** A resize in progress, as drawn: the range so far, and why it can't go further. */
export interface ClipResizePreview extends TimelineBeatRange {
    readonly edge: Edge;
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
                      reason: "1 count minimum",
                  },
              })
            : (limits?.endEdge ?? {
                  min: {
                      beat: range.startBeatIndex + 1,
                      reason: "1 count minimum",
                  },
                  max: { beat: beatCount, reason: null },
              });
    const one = { reason: "1 count minimum" };
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
    // The beats where this edge would give the move another's exact range (C-12)
    const forbidden = new Map<number, string>();
    for (const t of limits?.taken ?? []) {
        if (edge === "start" && t.endBeatIndex === range.endBeatIndex)
            forbidden.set(t.startBeatIndex, t.reason);
        if (edge === "end" && t.startBeatIndex === range.startBeatIndex)
            forbidden.set(t.endBeatIndex, t.reason);
    }
    const from = edge === "start" ? range.startBeatIndex : range.endBeatIndex;
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

const counts = (n: number) => `${n} count${n === 1 ? "" : "s"}`;

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
    const change = `${label ? `${label}: ` : ""}${length(from)} → ${counts(length(preview))}`;
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
                : `through ${crossed} page flag${crossed === 1 ? "" : "s"}`;
        })();
    return note ? `${change} · ${note}` : change;
}

/**
 * The resize gesture for one clip. Returns the range to draw while resizing (`null` otherwise),
 * its two handles, the drag tag, and `swallowClick`, which the clip's `onClick` asks so the click
 * that ends a resize doesn't also select the clip.
 */
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
}): {
    preview: ClipResizePreview | null;
    handles: ReactNode;
    tag: ReactNode;
    swallowClick: () => boolean;
    /** Forgets a swallowed click that never came (a new press on the clip) */
    resetClick: () => void;
} {
    const [preview, setPreview] = useState<ClipResizePreview | null>(null);
    const dragRef = useRef<{
        pointerId: number;
        edge: Edge;
        startClientX: number;
        /** The edge's beat when the drag started */
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

    // A new range from the database ends the preview (as the clip's move drag)
    useEffect(() => {
        dragRef.current = null;
        setPreview(null);
    }, [range?.startBeatIndex, range?.endBeatIndex]);

    // Esc cancels a resize in progress: nothing is committed or selected (E14)
    useClipGestureEscape(preview !== null, () => {
        dragRef.current = null;
        swallowRef.current = true;
        setPreview(null);
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
            range: range!,
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

    const handleProps = (edge: Edge) => ({
        "data-testid": `timeline-clip-resize-${edge}`,
        "aria-hidden": true,
        onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => {
            swallowRef.current = false;
            // Ctrl/Cmd draws a range from here, and other buttons open menus: the clip's
            // handlers and the surface take those
            if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
            event.stopPropagation();
            const drag = {
                pointerId: event.pointerId,
                edge,
                startClientX: event.clientX,
                startBeat:
                    edge === "start"
                        ? range!.startBeatIndex
                        : range!.endBeatIndex,
                moved: false,
                clientX: event.clientX,
                snapDisabled: isPageSnapDisabled(event),
                playhead: snapPlayhead ? Math.round(snapPlayhead()) : null,
                limits: null as ClipResizeLimits | null,
                preview: null as ClipResizePreview | null,
                limitsRead: Promise.resolve() as Promise<unknown>,
            };
            dragRef.current = drag;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            // The limits come from the database; until they arrive only the show and the one
            // count minimum hold, and the edge settles inside them once they do
            drag.limitsRead = resize!.limits(trackId).then(
                (limits) => {
                    // Kept even after release: a release waiting for them commits with them
                    drag.limits = limits;
                    if (dragRef.current !== drag) return;
                    if (drag.preview) {
                        const settled = landAt(
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
            drag.moved = true;
            drag.clientX = event.clientX;
            drag.snapDisabled = isPageSnapDisabled(event);
            event.stopPropagation();
            const next = landAt(drag, event.clientX, isPageSnapDisabled(event));
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
            setPreview(null);
            // The modifiers held at release decide, as for the clip's move drag. A release
            // before the limits arrive waits for them, so it stops where a slower drag would
            const clientX = event.clientX;
            const snapDisabled = isPageSnapDisabled(event);
            const finish = () => {
                const next = landAt(drag, clientX, snapDisabled);
                // It commits where it waits: never on a forbidden beat (UI-15)
                if (
                    next.startBeatIndex === range!.startBeatIndex &&
                    next.endBeatIndex === range!.endBeatIndex
                )
                    return;
                resize!.commit({
                    timelineId: trackId,
                    startBeatIndex: next.startBeatIndex,
                    endBeatIndex: next.endBeatIndex,
                });
            };
            if (drag.limits) finish();
            else void drag.limitsRead.then(finish);
        },
        onPointerCancel: () => {
            dragRef.current = null;
            setPreview(null);
        },
        // A lost capture (the window losing the pointer mid-drag) cancels, as for a page flag's
        // grip: the release may land off the handle, and the preview mustn't stick (E14)
        onLostPointerCapture: () => {
            const drag = dragRef.current;
            if (!drag) return;
            dragRef.current = null;
            if (drag.moved) swallowRef.current = true;
            setPreview(null);
        },
        // The click ending a press on a handle still reaches the clip, which selects on it
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
        preview && range ? (
            <span
                data-testid="timeline-clip-resize-tag"
                role="status"
                className={clsx(
                    "rounded-4 bg-fg-2 border-stroke pointer-events-none absolute bottom-full z-[60] mb-1 border px-4 py-[1px] text-[11px] whitespace-nowrap shadow-sm",
                    preview.blockedBy ? "text-red" : "text-text",
                    preview.edge === "start" ? "left-0" : "right-0",
                )}
            >
                {clipResizeTagText(range, preview, snapBeats, label)}
            </span>
        ) : null;

    return {
        preview,
        handles,
        tag,
        resetClick: () => {
            swallowRef.current = false;
        },
        swallowClick: () => {
            const swallowed = swallowRef.current;
            swallowRef.current = false;
            return swallowed;
        },
    };
}
