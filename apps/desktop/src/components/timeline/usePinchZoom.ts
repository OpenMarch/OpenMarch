import {
    RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
} from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    clampPixelsPerSecond,
    PinchStart,
    pinchZoomStep,
    pointDistance,
    timeAtPoint,
} from "./pinchZoom";

/**
 * Where time 0 sits in the scroller's content: the right edge of the first
 * page block (page 1 and the waveform start there).
 */
function measureOriginX(scroller: HTMLElement): number {
    const firstPage = scroller.querySelector("#pages [timeline-page-id]");
    if (!(firstPage instanceof HTMLElement)) return 0;
    const scrollerRect = scroller.getBoundingClientRect();
    const pageRect = firstPage.getBoundingClientRect();
    return pageRect.right - scrollerRect.left + scroller.scrollLeft;
}

const touchPoint = (touch: Touch) => ({ x: touch.clientX, y: touch.clientY });

const currentPixelsPerSecond = () =>
    useUiSettingsStore.getState().uiSettings.timelinePixelsPerSecond;

/**
 * Follows two-finger pinches on the scroller and reports the zoom and scroll
 * each move asks for. Returns the detach.
 */
function attachPinchZoom(
    scroller: HTMLElement,
    onStep: (step: { pixelsPerSecond: number; scrollLeft: number }) => void,
): () => void {
    let start: PinchStart | null = null;
    let originX = 0;
    let savedScrollBehavior = "";

    const midpointX = (a: Touch, b: Touch) =>
        (a.clientX + b.clientX) / 2 - scroller.getBoundingClientRect().left;

    const begin = (a: Touch, b: Touch) => {
        const pixelsPerSecond = currentPixelsPerSecond();
        originX = measureOriginX(scroller);
        start = {
            distance: pointDistance(touchPoint(a), touchPoint(b)),
            pixelsPerSecond,
            anchorTime: timeAtPoint({
                scrollLeft: scroller.scrollLeft,
                pointX: midpointX(a, b),
                originX,
                pixelsPerSecond,
            }),
        };
        // Smooth scrolling would lag behind the fingers
        savedScrollBehavior = scroller.style.scrollBehavior;
        scroller.style.scrollBehavior = "auto";
    };

    const end = () => {
        if (!start) return;
        start = null;
        scroller.style.scrollBehavior = savedScrollBehavior;
    };

    const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length === 2)
            begin(event.touches[0], event.touches[1]);
        else if (event.touches.length > 2) end();
    };

    const onTouchMove = (event: TouchEvent) => {
        if (!start || event.touches.length !== 2) return;
        // Stop the browser's own scroll; the pinch scrolls the timeline itself
        if (event.cancelable) event.preventDefault();
        const [a, b] = [event.touches[0], event.touches[1]];
        onStep(
            pinchZoomStep({
                start,
                distance: pointDistance(touchPoint(a), touchPoint(b)),
                pointX: midpointX(a, b),
                originX,
            }),
        );
    };

    const onTouchEnd = (event: TouchEvent) => {
        if (event.touches.length < 2) end();
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    return () => {
        scroller.removeEventListener("touchstart", onTouchStart);
        scroller.removeEventListener("touchmove", onTouchMove);
        scroller.removeEventListener("touchend", onTouchEnd);
        scroller.removeEventListener("touchcancel", onTouchEnd);
        end();
    };
}

/**
 * Two-finger pinch on the timeline scroller zooms it (pixels per second)
 * around the pinch midpoint, keeping the time under the fingers in place.
 * One finger keeps the native horizontal scroll.
 */
export function usePinchZoom(scrollerRef: RefObject<HTMLElement | null>) {
    // Scroll to apply once the new zoom has been rendered
    const pendingScrollLeft = useRef<number | null>(null);
    const pixelsPerSecond = useUiSettingsStore(
        (s) => s.uiSettings.timelinePixelsPerSecond,
    );

    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller || pendingScrollLeft.current === null) return;
        scroller.scrollLeft = pendingScrollLeft.current;
        pendingScrollLeft.current = null;
    }, [pixelsPerSecond, scrollerRef]);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        return attachPinchZoom(scroller, (step) => {
            if (step.pixelsPerSecond !== currentPixelsPerSecond()) {
                // Scroll after the wider or narrower timeline has rendered
                pendingScrollLeft.current = step.scrollLeft;
                useUiSettingsStore
                    .getState()
                    .setPixelsPerSecond(step.pixelsPerSecond);
            } else {
                scroller.scrollLeft = step.scrollLeft;
            }
        });
    }, [scrollerRef]);

    /**
     * Zooms to `pixelsPerSecond` (the zoom buttons) keeping the time at the
     * middle of the view in place, so zooming out at the end brings earlier
     * pages into view instead of staying pinned to the end.
     */
    const zoomTo = useCallback(
        (next: number) => {
            const store = useUiSettingsStore.getState();
            const current = store.uiSettings.timelinePixelsPerSecond;
            const target = clampPixelsPerSecond(next);
            if (target === current) return;
            const scroller = scrollerRef.current;
            if (scroller) {
                const originX = measureOriginX(scroller);
                const pointX = scroller.clientWidth / 2;
                const anchorTime = timeAtPoint({
                    scrollLeft: scroller.scrollLeft,
                    pointX,
                    originX,
                    pixelsPerSecond: current,
                });
                pendingScrollLeft.current = pinchZoomStep({
                    start: {
                        distance: 1,
                        pixelsPerSecond: target,
                        anchorTime,
                    },
                    distance: 1,
                    pointX,
                    originX,
                }).scrollLeft;
                scroller.style.scrollBehavior = "auto";
            }
            store.setPixelsPerSecond(target);
        },
        [scrollerRef],
    );

    return { zoomTo };
}
