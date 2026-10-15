import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatestCallback } from "./useLatestCallback";
import {
    beatX,
    followPageRanges,
    glideOrCut,
    landingScroll,
    playbackScroll,
    playheadOffscreen,
    revealPlayheadScroll,
    revealRangeScroll,
    stepGlide,
    type FollowGlide,
    type FollowScale,
    type FollowView,
    type PlayheadSide,
} from "./timelineFollow";
import type {
    BeatPosition,
    TimelineBeatRange,
    TimelinePageMarker,
} from "./TimelineViewModel";

/** A wheel or swipe this recent is still the user's gesture (momentum keeps sending them) */
const WHEEL_GESTURE_MS = 150;
/** A press that moves this far is a drag, not a click */
const DRAG_THRESHOLD_PX = 4;
/** More than this many beats in one frame is a jump (a seek or navigation), not playing on */
const JUMP_BEATS = 2;
/**
 * How long after a stop the playhead and the window settle (for a moment the playhead reads where
 * it rested before playing, then the store seeks where playing stopped). Their updates until then
 * leave the view where it is; then one look decides whether the playhead went back somewhere.
 */
const STOP_SETTLE_MS = 300;
/** The view's own scroll writes can round; a scroll further than this from one moved it */
const OWN_SCROLL_SLOP_PX = 1.5;

/** A move of the view: glide there, or cut */
interface FollowMove {
    readonly target: number;
    readonly cut: boolean;
}

/** Where a zoom keeps a beat on screen: `anchorBeat` stays `anchorPx` from the view's left */
export interface FollowZoomAnchor {
    readonly anchorPx: number;
    readonly anchorBeat: number;
}

const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Runs `then` after two frames: once React has committed what the current event set off */
const afterTwoFrames = (then: () => void) => {
    let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(then);
    });
    return () => cancelAnimationFrame(frame);
};

/**
 * The timeline's view follows the playhead (UI-23); the rules are in `timelineFollow`. Always on:
 *
 * - While playing, the view moves at page changes and glides back in a page wider than the view.
 *   Play, and any jump of the playhead, bring it into view; a loop that fits is framed once, and
 *   a wrap out of view cuts back.
 * - Scrolling by hand or dragging pauses following while the playhead is out of view. It resumes
 *   when the playhead comes back into view, on Play, on navigation, or from the playhead chip.
 * - While the pointer is down nothing moves: a glide that is due waits for the release, so a click
 *   lands on what was under it. Hovering never holds the view.
 * - Stopped, navigating to a playhead out of view brings it in, and a page selected from outside
 *   the timeline (the page list, the field) moves the least to show it. A selection made with the
 *   pointer on the timeline never moves it, and stopping leaves the view where it is.
 * - Zooming while following keeps the playhead in place (`zoomAnchor`).
 *
 * The scroll is read from scroll events and the size from props, so a frame reads no layout.
 */
export function useTimelineFollow({
    viewportRef,
    viewportWidth,
    contentWidth,
    pixelsPerBeat,
    inset,
    pages,
    beatCount,
    isPlaying,
    positionBeat,
    livePositionBeat,
    loop,
    selectionRange,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    viewportWidth: number;
    /** The scroller's content width: the initial page's box and the beats */
    contentWidth: number;
    pixelsPerBeat: number;
    /** Where beat 0 is in the scroller's content: the initial page's box */
    inset: number;
    pages: readonly TimelinePageMarker[];
    beatCount: number;
    isPlaying: boolean;
    positionBeat: BeatPosition;
    livePositionBeat?: () => number | null;
    /** The loop being played, if Play loops */
    loop: TimelineBeatRange | null;
    selectionRange: TimelineBeatRange | null;
}) {
    const pageRanges = useMemo(
        () => followPageRanges(pages, beatCount),
        [beatCount, pages],
    );
    const scale: FollowScale = useMemo(
        () => ({ pixelsPerBeat, inset }),
        [inset, pixelsPerBeat],
    );
    const current = {
        scale,
        pageRanges,
        positionBeat,
        livePositionBeat,
        isPlaying,
        viewportWidth,
        contentWidth,
        loop,
    };
    const latest = useRef(current);
    latest.current = current;

    const state = useRef({
        /** The view's scroll, from scroll events and the follow's own writes */
        scrollLeft: 0,
        /** The user moved the view away from the playhead */
        paused: false,
        /** The user scrolled or dragged since the last frame looked */
        touched: false,
        pressed: null as { x: number; y: number; dragged: boolean } | null,
        /** A press on the timeline that hasn't settled yet, so its selection doesn't move the view */
        pointerSelecting: false,
        /** When playing last stopped, so the updates that follow don't move the view */
        stoppedAt: -Infinity,
        /** Where the playhead was when playing stopped */
        stopBeat: null as number | null,
        /** A stop's settled look is still to come */
        stopCheck: false,
        lastWheel: -Infinity,
        glide: null as FollowGlide | null,
        /** The scroll the glide wrote last, to tell when something else moved the view */
        written: null as number | null,
        /** A move due while the pointer is down */
        pending: null as FollowMove | null,
        lastBeat: null as number | null,
        lastFrame: 0,
        frame: 0,
        /** Inside a frame, which asks for the next one itself */
        ticking: false,
    });
    const [offscreen, setOffscreen] = useState<PlayheadSide | null>(null);

    const readView = useCallback((): FollowView | null => {
        const { viewportWidth: width, contentWidth: content } = latest.current;
        if (width <= 0) return null;
        return {
            left: state.current.scrollLeft,
            width,
            contentWidth: content,
        };
    }, []);

    const currentBeat = useCallback(() => {
        const { livePositionBeat: live, positionBeat: resting } =
            latest.current;
        return (latest.current.isPlaying ? live?.() : null) ?? resting;
    }, []);

    const playheadX = useCallback(
        (beat: number) => beatX(latest.current.scale, beat),
        [],
    );

    const updateOffscreen = useCallback(() => {
        const view = readView();
        if (!view) return;
        const next = playheadOffscreen({ view, x: playheadX(currentBeat()) });
        setOffscreen((previous) => (previous === next ? previous : next));
    }, [currentBeat, playheadX, readView]);

    const writeScroll = useCallback(
        (left: number) => {
            const viewport = viewportRef.current;
            if (!viewport) return;
            viewport.scrollLeft = left;
            state.current.scrollLeft = left;
            state.current.written = left;
        },
        [viewportRef],
    );

    const stopGlide = useCallback(() => {
        state.current.glide = null;
        state.current.written = null;
    }, []);

    /** One frame: decides where the view goes while playing, and steps a glide */
    const tick = useLatestCallback((now: number) => {
        const s = state.current;
        s.frame = 0;
        s.ticking = true;
        try {
            followFrame(now);
        } finally {
            s.ticking = false;
        }
        if ((latest.current.isPlaying || s.glide || s.stopCheck) && !s.frame)
            s.frame = requestAnimationFrame(tick);
    })!;

    /** The work of one frame, for `tick` */
    const followFrame = useLatestCallback((now: number) => {
        const s = state.current;
        const dt = s.lastFrame ? (now - s.lastFrame) / 1000 : 1 / 60;
        s.lastFrame = now;
        const view = readView();
        if (!view) return;
        const { scale, pageRanges: ranges, loop: playedLoop } = latest.current;
        const playing = latest.current.isPlaying;
        // Something else moved the view (a zoom, Fit, a scrub at the edge): the glide gives way
        if (
            s.written !== null &&
            Math.abs(s.scrollLeft - s.written) > OWN_SCROLL_SLOP_PX
        )
            stopGlide();
        // A drag or a wheel gesture under way: the view is the user's
        const gesturing =
            (s.pressed?.dragged ?? false) ||
            now - s.lastWheel < WHEEL_GESTURE_MS;
        const beat = currentBeat();
        const x = playheadX(beat);
        const from = s.lastBeat;
        const jumped = from === null || beat < from || beat - from > JUMP_BEATS;
        const wrapped =
            playedLoop !== null &&
            from !== null &&
            beat < from &&
            Math.abs(beat - playedLoop.startBeatIndex) <= 1;
        if (playing && !gesturing) {
            const visible = playheadOffscreen({ view, x }) === null;
            if (s.touched) {
                // Moved by hand: following pauses only if the playhead is now out of view
                s.touched = false;
                s.paused = !visible;
                s.pending = null;
            } else if (s.paused && visible) {
                // The playhead came back into view
                s.paused = false;
            }
            // Navigation while playing (a jump that isn't Play starting or a loop's wrap)
            if (jumped && from !== null && !wrapped) s.paused = false;
            if (!s.paused) {
                // Decide against where the view is going (a glide, or a move waiting for a
                // release), so a move isn't asked for twice
                const goingTo = s.pending?.target ?? s.glide?.target;
                const aimedView =
                    goingTo === undefined ? view : { ...view, left: goingTo };
                // A played loop in view holds the view still through its wraps
                const loopHeld =
                    playedLoop !== null &&
                    revealRangeScroll({
                        view: aimedView,
                        startX: playheadX(playedLoop.startBeatIndex),
                        endX: playheadX(playedLoop.endBeatIndex),
                    }) === null;
                let move: FollowMove | null = null;
                if (jumped) {
                    // A jump (Play, navigation, a loop's wrap) lands the playhead if out of view;
                    // back to a loop's start it cuts
                    if (playheadOffscreen({ view: aimedView, x }) !== null)
                        move = {
                            target: landingScroll({
                                view: aimedView,
                                scale,
                                pages: ranges,
                                beat,
                            }),
                            cut: wrapped,
                        };
                } else if (!loopHeld) {
                    const target = playbackScroll({
                        view: aimedView,
                        scale,
                        pages: ranges,
                        fromBeat: from,
                        toBeat: beat,
                    });
                    if (target !== null) move = { target, cut: false };
                }
                if (s.pressed) {
                    if (move) s.pending = move;
                } else {
                    move ??= s.pending;
                    s.pending = null;
                    if (move) startGlide(move.target, move.cut);
                }
            }
        }
        if (playing) s.lastBeat = beat;
        // Settled after a stop: a playhead that went back out of view (Play Page Once going back
        // to its set) is brought in; one stopped where playing was stays where the user left it
        if (
            !playing &&
            s.stopCheck &&
            performance.now() - s.stoppedAt >= STOP_SETTLE_MS
        ) {
            s.stopCheck = false;
            const target =
                s.stopBeat !== null && Math.abs(beat - s.stopBeat) > JUMP_BEATS
                    ? revealPlayheadScroll({
                          view,
                          scale,
                          pages: ranges,
                          beat,
                      })
                    : null;
            if (target !== null) {
                s.paused = false;
                startGlide(target);
            }
        }
        // Nothing moves under a pressed pointer or a hand on the wheel
        if (s.glide && !s.pressed && !gesturing) {
            const next = stepGlide(s.glide, dt);
            writeScroll(next.position);
            s.glide = next.settled ? null : { ...s.glide, ...next };
            if (!s.glide) s.written = null;
        }
        updateOffscreen();
    })!;

    const schedule = useCallback(() => {
        const s = state.current;
        if (s.frame || s.ticking) return;
        s.lastFrame = 0;
        s.frame = requestAnimationFrame(tick);
    }, [tick]);

    /** Glides (or cuts) the view to `target`; a new target mid-glide keeps the glide's speed */
    const startGlide = useLatestCallback((target: number, cut = false) => {
        const s = state.current;
        const view = readView();
        if (!view) return;
        const from = s.glide?.position ?? view.left;
        if (Math.abs(target - from) < 0.5 && !s.glide) return;
        if (
            cut ||
            glideOrCut({
                width: view.width,
                from,
                to: target,
                reducedMotion: prefersReducedMotion(),
            }) === "cut"
        ) {
            stopGlide();
            writeScroll(target);
            s.written = null;
            updateOffscreen();
            return;
        }
        s.glide = {
            position: from,
            velocity: s.glide?.velocity ?? 0,
            target,
        };
        schedule();
    })!;

    /** The least move that shows `startBeat`–`endBeat` with a margin, gliding */
    const revealBeats = useLatestCallback(
        (startBeat: number, endBeat: number) => {
            const view = readView();
            if (!view) return;
            const target = revealRangeScroll({
                view,
                startX: playheadX(startBeat),
                endX: playheadX(endBeat),
            });
            if (target !== null) startGlide(target);
        },
    )!;

    /** Brings the playhead into view where a jump lands it, and resumes following */
    const revealPlayhead = useLatestCallback(() => {
        const view = readView();
        if (!view) return;
        state.current.paused = false;
        startGlide(
            landingScroll({
                view,
                scale: latest.current.scale,
                pages: latest.current.pageRanges,
                beat: currentBeat(),
            }),
        );
        updateOffscreen();
    })!;

    // The user's own moves: a wheel or swipe, the scrollbar, and drags on the timeline
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const s = state.current;
        s.scrollLeft = viewport.scrollLeft;
        const userMoved = () => {
            s.touched = true;
            stopGlide();
        };
        const onWheel = (event: WheelEvent) => {
            // A zoom keeps the playhead in place while following (`zoomAnchor`), so it doesn't pause
            if (event.ctrlKey || event.metaKey) {
                stopGlide();
                return;
            }
            s.lastWheel = performance.now();
            userMoved();
        };
        const onPointerDown = (event: PointerEvent) => {
            s.pressed = { x: event.clientX, y: event.clientY, dragged: false };
            s.pointerSelecting = true;
            // On the scroller itself, not its content: the scrollbar
            if (event.target === viewport) {
                s.pressed.dragged = true;
                userMoved();
            }
        };
        const onPointerMove = (event: PointerEvent) => {
            const pressed = s.pressed;
            if (!pressed || pressed.dragged) return;
            if (
                Math.hypot(
                    event.clientX - pressed.x,
                    event.clientY - pressed.y,
                ) > DRAG_THRESHOLD_PX
            ) {
                pressed.dragged = true;
                userMoved();
            }
        };
        let cancelSettle = () => {};
        const onPointerUp = () => {
            if (!s.pressed) return;
            s.pressed = null;
            // The click's selection lands after the release; it still came from the pointer
            cancelSettle();
            cancelSettle = afterTwoFrames(() => {
                s.pointerSelecting = false;
            });
            if (s.pending || s.glide || s.touched) schedule();
        };
        const onScroll = () => {
            s.scrollLeft = viewport.scrollLeft;
            if (!latest.current.isPlaying && !s.glide) updateOffscreen();
        };
        viewport.addEventListener("wheel", onWheel, { passive: true });
        viewport.addEventListener("pointerdown", onPointerDown, true);
        viewport.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("pointermove", onPointerMove, true);
        window.addEventListener("pointerup", onPointerUp, true);
        window.addEventListener("pointercancel", onPointerUp, true);
        return () => {
            viewport.removeEventListener("wheel", onWheel);
            viewport.removeEventListener("pointerdown", onPointerDown, true);
            viewport.removeEventListener("scroll", onScroll);
            window.removeEventListener("pointermove", onPointerMove, true);
            window.removeEventListener("pointerup", onPointerUp, true);
            window.removeEventListener("pointercancel", onPointerUp, true);
            cancelSettle();
        };
    }, [schedule, stopGlide, updateOffscreen, viewportRef]);

    // Play brings the playhead (or a loop that fits) into view and resumes following; the frames
    // run while playing. Stopping leaves the view where it is.
    const wasPlaying = useRef(isPlaying);
    useEffect(() => {
        const s = state.current;
        const stopped = wasPlaying.current && !isPlaying;
        wasPlaying.current = isPlaying;
        s.stopBeat = s.lastBeat;
        s.lastBeat = null;
        s.pending = null;
        if (!isPlaying) {
            if (stopped) {
                s.stoppedAt = performance.now();
                s.stopCheck = true;
                schedule();
            }
            return;
        }
        s.paused = false;
        s.touched = false;
        const view = readView();
        // A loop that fits is framed once; the first frame then sees the playhead in view where
        // the glide is going
        if (
            view &&
            loop &&
            (loop.endBeatIndex - loop.startBeatIndex) * pixelsPerBeat <=
                view.width
        )
            revealBeats(loop.startBeatIndex, loop.endBeatIndex);
        schedule();
        // Only when playing starts or stops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying]);

    // A zoom moves everything: the glide's pixels are stale
    useEffect(() => {
        stopGlide();
        const viewport = viewportRef.current;
        if (viewport) state.current.scrollLeft = viewport.scrollLeft;
        updateOffscreen();
    }, [contentWidth, stopGlide, updateOffscreen, viewportRef, viewportWidth]);

    // Stopped: navigation (and Play Page Once going back to its set) brings the playhead's page
    // into view, and a page selected from outside the timeline moves the least to show it
    const previous = useRef({ positionBeat, selectionRange });
    useEffect(() => {
        const before = previous.current;
        previous.current = { positionBeat, selectionRange };
        const s = state.current;
        if (isPlaying) return;
        // Settling after a stop: the frame looks once it has settled
        const settling = performance.now() - s.stoppedAt < STOP_SETTLE_MS;
        if (settling || s.pointerSelecting || s.pressed) {
            updateOffscreen();
            return;
        }
        const view = readView();
        if (!view) return;
        const selectionMoved =
            selectionRange !== null &&
            (before.selectionRange?.startBeatIndex !==
                selectionRange.startBeatIndex ||
                before.selectionRange?.endBeatIndex !==
                    selectionRange.endBeatIndex);
        if (selectionMoved) {
            revealBeats(
                selectionRange.startBeatIndex,
                selectionRange.endBeatIndex,
            );
        } else if (before.positionBeat !== positionBeat) {
            const target = revealPlayheadScroll({
                view,
                scale,
                pages: pageRanges,
                beat: positionBeat,
            });
            if (target !== null) {
                s.paused = false;
                startGlide(target);
            }
        }
        updateOffscreen();
        // Only on navigation; the zoom and the pages are read as they are
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isPlaying,
        positionBeat,
        selectionRange?.startBeatIndex,
        selectionRange?.endBeatIndex,
    ]);

    useEffect(() => {
        const s = state.current;
        return () => {
            cancelAnimationFrame(s.frame);
            s.frame = 0;
        };
    }, []);

    /** While following, a zoom keeps the playhead where it is on screen */
    const zoomAnchor = useCallback((): FollowZoomAnchor | null => {
        const view = readView();
        if (!latest.current.isPlaying || state.current.paused || !view)
            return null;
        const beat = currentBeat();
        const x = playheadX(beat);
        if (playheadOffscreen({ view, x }) !== null) return null;
        return { anchorPx: x - view.left, anchorBeat: beat };
    }, [currentBeat, playheadX, readView]);

    return { offscreen, revealPlayhead, zoomAnchor };
}
