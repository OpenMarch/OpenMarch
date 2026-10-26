// cspell:words gesturestart gesturechange gestureend
/**
 * Stops the browser zooming or bouncing the whole page on a tablet, so a
 * pinch meant for the field or the timeline never zooms the app itself.
 *
 * - Double-tap zoom is off in CSS (`touch-action: manipulation` on html and
 *   body, src/styles/index.css), and so is the rubber band and
 *   pull-to-refresh (`overscroll-behavior: none`).
 * - iOS Safari ignores `user-scalable=no` and `maximum-scale` for pinches,
 *   so its own `gesture*` events are cancelled, and so is any two-finger
 *   move outside an element that handles its gestures itself.
 *
 * Electron needs none of this: its visual zoom is off by default (see
 * electron/main/index.ts).
 */

/**
 * Elements that handle their own pinches and two-finger drags (with pointer
 * events and `touch-action`), where a two-finger move is left alone: the
 * field canvas, the timeline, and anything marked `data-own-gestures`.
 */
export const OWN_GESTURES_SELECTOR = "canvas, #timeline, [data-own-gestures]";

/**
 * Whether a touch that starts on `target` belongs to an element that handles
 * its own gestures: one matching {@link OWN_GESTURES_SELECTOR}, or one inside
 * an element with `touch-action: none` (it takes every touch itself).
 */
export function ownsGestures(
    target: EventTarget | null,
    touchActionOf: (element: Element) => string = (element) =>
        getComputedStyle(element).touchAction,
): boolean {
    let element = target instanceof Element ? target : null;
    if (element?.closest(OWN_GESTURES_SELECTOR)) return true;
    while (element && element !== document.documentElement) {
        if (touchActionOf(element) === "none") return true;
        element = element.parentElement;
    }
    return false;
}

/** Whether a touch move should be cancelled to stop the page zooming. */
export function shouldBlockTouchMove(
    touchCount: number,
    startedOnOwner: boolean,
    cancelable: boolean,
): boolean {
    return cancelable && touchCount > 1 && !startedOnOwner;
}

/** Starts guarding the page; returns the stop. */
export function startTouchGestureGuard(doc: Document = document): () => void {
    const cancel = (event: Event) => event.preventDefault();
    // Decided when the first finger lands, so a second finger landing
    // elsewhere doesn't change who owns the gesture.
    let startedOnOwner = false;
    const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length === 1)
            startedOnOwner = ownsGestures(event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
        if (
            shouldBlockTouchMove(
                event.touches.length,
                startedOnOwner,
                event.cancelable,
            )
        )
            event.preventDefault();
    };

    const gestureEvents = ["gesturestart", "gesturechange", "gestureend"];
    for (const type of gestureEvents)
        doc.addEventListener(type, cancel, { passive: false });
    doc.addEventListener("touchstart", onTouchStart, {
        capture: true,
        passive: true,
    });
    doc.addEventListener("touchmove", onTouchMove, {
        capture: true,
        passive: false,
    });

    return () => {
        for (const type of gestureEvents) doc.removeEventListener(type, cancel);
        doc.removeEventListener("touchstart", onTouchStart, { capture: true });
        doc.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
}
