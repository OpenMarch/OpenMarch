import { clamp } from "./TimelineGeometry";
import type {
    BeatPosition,
    TimelineBeatRange,
    TimelinePageMarker,
} from "./TimelineViewModel";

/**
 * Following the playhead (UI-23): where the timeline's view goes while playing and on navigation.
 * Pure rules in content pixels, so `useTimelineFollow` only reads the DOM and writes the scroll.
 *
 * - The view moves at page changes: when the playhead crosses into a page that isn't fully in
 *   view, the page's flag lands 8% in from the left, keeping the end of the page before.
 * - A page wider than the view has a backstop: at 85% of the view the playhead glides back to 25%.
 * - A glide is a critically damped spring, about a quarter second; past a view's width it cuts.
 */

/** Where a landed page's flag sits, as a share of the view from its left */
const FOLLOW_FLAG_LANDING = 0.08;
/** How far across the view the playhead goes in a page wider than the view */
const FOLLOW_BACKSTOP = 0.85;
/** Where the backstop puts the playhead */
const FOLLOW_BACKSTOP_LANDING = 0.25;
/** How stiff the glide's spring is (1/s): settles in about a quarter second */
const FOLLOW_SPRING_OMEGA = 24;
/** A glide this close to its target, and this slow, has landed */
export const FOLLOW_SETTLE_PX = 0.5;
const FOLLOW_SETTLE_SPEED = 20;
/** Longer frames than this (a stalled tab) step as this */
const FOLLOW_MAX_STEP_S = 0.1;

/** The scroller's visible part, in content pixels */
export interface FollowView {
    readonly left: number;
    readonly width: number;
    readonly contentWidth: number;
}

/** Beats to content pixels: `inset + beat * pixelsPerBeat` (the initial page's box is the inset) */
export interface FollowScale {
    readonly pixelsPerBeat: number;
    readonly inset: number;
}

/** Which side of the view the playhead is off */
export type PlayheadSide = "left" | "right";

export const beatX = (scale: FollowScale, beat: BeatPosition) =>
    scale.inset + beat * scale.pixelsPerBeat;

const clampScroll = (view: FollowView, left: number) =>
    clamp(left, 0, Math.max(0, view.contentWidth - view.width));

/** The timed pages in order, each up to the next flag; the last ends at its own flag */
export const followPageRanges = (
    pages: readonly TimelinePageMarker[],
    beatCount: number,
): TimelineBeatRange[] => {
    const ordered = pages
        .filter((page) => !page.isInitial)
        .sort((a, b) => a.atBeat - b.atBeat);
    return ordered.map((page, index) => ({
        startBeatIndex: page.atBeat,
        endBeatIndex: ordered[index + 1]?.atBeat ?? page.endBeat ?? beatCount,
    }));
};

const pageAt = (pages: readonly TimelineBeatRange[], beat: BeatPosition) =>
    pages.find(
        (page) => beat >= page.startBeatIndex && beat < page.endBeatIndex,
    ) ?? null;

const pageFits = (
    view: FollowView,
    scale: FollowScale,
    page: TimelineBeatRange,
) =>
    (page.endBeatIndex - page.startBeatIndex) * scale.pixelsPerBeat <=
    view.width * (1 - FOLLOW_FLAG_LANDING);

const flagLanding = (
    view: FollowView,
    scale: FollowScale,
    page: TimelineBeatRange,
) =>
    clampScroll(
        view,
        beatX(scale, page.startBeatIndex) - view.width * FOLLOW_FLAG_LANDING,
    );

const backstopLanding = (
    view: FollowView,
    scale: FollowScale,
    beat: BeatPosition,
) =>
    clampScroll(
        view,
        beatX(scale, beat) - view.width * FOLLOW_BACKSTOP_LANDING,
    );

/**
 * While following, where the view should go as the playhead moves on from `fromBeat` to `toBeat`
 * in a frame, or `null` to stay put
 */
export const playbackScroll = ({
    view,
    scale,
    pages,
    fromBeat,
    toBeat,
}: {
    view: FollowView;
    scale: FollowScale;
    pages: readonly TimelineBeatRange[];
    fromBeat: BeatPosition;
    toBeat: BeatPosition;
}): number | null => {
    const page = pageAt(pages, toBeat);
    const right = view.left + view.width;
    if (page && page !== pageAt(pages, fromBeat)) {
        const fullyInView =
            beatX(scale, page.startBeatIndex) >= view.left &&
            beatX(scale, page.endBeatIndex) <= right;
        if (!fullyInView) return flagLanding(view, scale, page);
    }
    // The backstop, for a page that goes on past the view's right edge
    const pageEndsInView = page
        ? beatX(scale, page.endBeatIndex) <= right
        : false;
    if (
        !pageEndsInView &&
        beatX(scale, toBeat) > view.left + view.width * FOLLOW_BACKSTOP
    ) {
        const target = backstopLanding(view, scale, toBeat);
        return target > view.left ? target : null;
    }
    return null;
};

/**
 * Where to put the view to show the playhead at `beat` after a jump (Play, navigation, a loop's
 * wrap): its page's flag at 8% when the page fits, else the playhead at 25%
 */
export const landingScroll = ({
    view,
    scale,
    pages,
    beat,
}: {
    view: FollowView;
    scale: FollowScale;
    pages: readonly TimelineBeatRange[];
    beat: BeatPosition;
}): number => {
    const page = pageAt(pages, beat);
    return page && pageFits(view, scale, page)
        ? flagLanding(view, scale, page)
        : backstopLanding(view, scale, beat);
};

/**
 * The least move that shows `startX`–`endX` with an 8% margin, or `null` when it is all in view.
 * A range wider than the view shows its start.
 */
export const revealRangeScroll = ({
    view,
    startX,
    endX,
}: {
    view: FollowView;
    startX: number;
    endX: number;
}): number | null => {
    const right = view.left + view.width;
    if (startX >= view.left && endX <= right) return null;
    const margin = view.width * FOLLOW_FLAG_LANDING;
    const fits = endX - startX <= view.width - 2 * margin;
    const target =
        fits && endX > right ? endX + margin - view.width : startX - margin;
    return clampScroll(view, target);
};

/**
 * Stopped, where to put the view to show the playhead at `beat` after a jump (navigation, Play
 * Page Once going back to its set): the least move that shows its page when the page fits, else
 * the playhead at 25%. `null` when the playhead is in view.
 */
export const revealPlayheadScroll = ({
    view,
    scale,
    pages,
    beat,
}: {
    view: FollowView;
    scale: FollowScale;
    pages: readonly TimelineBeatRange[];
    beat: BeatPosition;
}): number | null => {
    if (playheadOffscreen({ view, x: beatX(scale, beat) }) === null)
        return null;
    const page = pageAt(pages, beat);
    return page && pageFits(view, scale, page)
        ? revealRangeScroll({
              view,
              startX: beatX(scale, page.startBeatIndex),
              endX: beatX(scale, page.endBeatIndex),
          })
        : backstopLanding(view, scale, beat);
};

/** Which side of the view the playhead at `x` is off, if it is */
export const playheadOffscreen = ({
    view,
    x,
}: {
    view: FollowView;
    x: number;
}): PlayheadSide | null =>
    x < view.left ? "left" : x > view.left + view.width ? "right" : null;

/** A move within a view's width glides; further, or with reduced motion, it cuts */
export const glideOrCut = ({
    width,
    from,
    to,
    reducedMotion = false,
}: {
    width: number;
    from: number;
    to: number;
    reducedMotion?: boolean;
}): "glide" | "cut" =>
    reducedMotion || Math.abs(to - from) > width ? "cut" : "glide";

export interface FollowGlide {
    readonly position: number;
    readonly velocity: number;
    readonly target: number;
}

/**
 * One step of the glide's critically damped spring, solved exactly so slow frames land in the
 * same place. It never overshoots from rest, and keeps its speed when the target moves.
 */
export const stepGlide = (
    glide: FollowGlide,
    dtSeconds: number,
): { position: number; velocity: number; settled: boolean } => {
    const dt = clamp(dtSeconds, 0, FOLLOW_MAX_STEP_S);
    const omega = FOLLOW_SPRING_OMEGA;
    const offset = glide.position - glide.target;
    const decay = Math.exp(-omega * dt);
    const drift = glide.velocity + omega * offset;
    const nextOffset = (offset + drift * dt) * decay;
    const velocity = (glide.velocity - omega * drift * dt) * decay;
    if (
        Math.abs(nextOffset) < FOLLOW_SETTLE_PX &&
        Math.abs(velocity) < FOLLOW_SETTLE_SPEED
    )
        return { position: glide.target, velocity: 0, settled: true };
    return { position: glide.target + nextOffset, velocity, settled: false };
};
