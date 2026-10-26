import { defaultSettings } from "@/stores/UiSettingsStore";

/** Timeline zoom limits, in pixels per second. */
export const TIMELINE_MIN_PX_PER_SEC = 10;
export const TIMELINE_MAX_PX_PER_SEC = 200;
export const TIMELINE_BASE_PX_PER_SEC = defaultSettings.timelinePixelsPerSecond;

/** One zoom button press; in and out are the same factor, so they undo each other. */
export const TIMELINE_ZOOM_STEP = 1.25;

export const clampPixelsPerSecond = (pps: number) =>
    Math.min(Math.max(pps, TIMELINE_MIN_PX_PER_SEC), TIMELINE_MAX_PX_PER_SEC);

/** Where a pinch started, captured on the second finger's touchstart. */
export interface PinchStart {
    /** Distance between the two fingers, in px. */
    distance: number;
    /** Zoom when the pinch started. */
    pixelsPerSecond: number;
    /** The time (seconds) under the midpoint of the two fingers. */
    anchorTime: number;
}

/**
 * The time (seconds) shown at a point of the scroller.
 *
 * Content x (in scroll coordinates) is `originX + time * pixelsPerSecond`,
 * where `originX` is where time 0 sits in the scrolled content.
 *
 * @param scrollLeft the scroller's scrollLeft
 * @param pointX the point's x relative to the scroller's left edge
 */
export function timeAtPoint({
    scrollLeft,
    pointX,
    originX,
    pixelsPerSecond,
}: {
    scrollLeft: number;
    pointX: number;
    originX: number;
    pixelsPerSecond: number;
}): number {
    if (pixelsPerSecond <= 0) return 0;
    return (scrollLeft + pointX - originX) / pixelsPerSecond;
}

/** Distance between two points. */
export const pointDistance = (
    a: { x: number; y: number },
    b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The zoom and scroll for the current finger positions of a pinch: zoom
 * scales with the finger spread (clamped to the limits) and the time that was
 * under the midpoint when the pinch started stays under the midpoint, which
 * also pans the timeline when both fingers move together.
 *
 * @param distance current distance between the fingers
 * @param pointX current midpoint x relative to the scroller's left edge
 */
export function pinchZoomStep({
    start,
    distance,
    pointX,
    originX,
}: {
    start: PinchStart;
    distance: number;
    pointX: number;
    originX: number;
}): { pixelsPerSecond: number; scrollLeft: number } {
    const scale = start.distance > 0 ? distance / start.distance : 1;
    const pixelsPerSecond = clampPixelsPerSecond(start.pixelsPerSecond * scale);
    const scrollLeft = Math.max(
        0,
        originX + start.anchorTime * pixelsPerSecond - pointX,
    );
    return { pixelsPerSecond, scrollLeft };
}
