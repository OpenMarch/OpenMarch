import { isPalmContact } from "./touchGestures";

/**
 * Palm rejection for the whole window. A hand resting on the screen while a
 * pen draws must not press buttons, change the page on the timeline, and so
 * on. Swallowed (their pointer events, and the click and mouse events the
 * browser makes from them):
 * - finger presses that start while a pen is down,
 * - fingers already resting on the screen when the pen comes down (the rest
 *   of their press: a palm usually lands before the pen).
 * Contact size isn't used: see isPalmContact.
 * The field has its own, finer rules (touchGestures.ts).
 */

/** Clicks from a swallowed finger can follow its release by this long */
const CLICK_AFTER_RELEASE_MS = 700;

export interface PalmGuardState {
    pensDown: Set<number>;
    /** Fingers down right now that are not swallowed */
    touchesDown: Set<number>;
    /** Fingers that went down while a pen was down */
    swallowed: Set<number>;
    /** Until when mouse and click events made from a swallowed finger are dropped */
    dropClicksUntil: number;
}

export const initialPalmGuardState = (): PalmGuardState => ({
    pensDown: new Set(),
    touchesDown: new Set(),
    swallowed: new Set(),
    dropClicksUntil: -Infinity,
});

/**
 * Whether an event should be swallowed; updates the state.
 *
 * @param event The parts of the event that matter
 * @param now The event's time (ms)
 */
export function palmGuardShouldBlock(
    state: PalmGuardState,
    event: {
        type: string;
        pointerType?: string;
        pointerId?: number;
        width?: number;
        height?: number;
    },
    now: number,
): boolean {
    const { type, pointerType, pointerId } = event;
    if (type.startsWith("pointer") && pointerType === "pen") {
        if (type === "pointerdown") {
            state.pensDown.add(pointerId ?? -1);
            // A palm resting before the pen: the rest of its press is swallowed
            for (const id of state.touchesDown) state.swallowed.add(id);
            state.touchesDown.clear();
            if (state.swallowed.size > 0) state.dropClicksUntil = Infinity;
        }
        if (type === "pointerup" || type === "pointercancel")
            state.pensDown.delete(pointerId ?? -1);
        return false;
    }
    if (type.startsWith("pointer") && pointerType === "touch") {
        const id = pointerId ?? -1;
        if (type === "pointerdown") {
            const large = isPalmContact(event);
            if (state.pensDown.size === 0 && !large) {
                state.touchesDown.add(id);
                return false;
            }
            state.swallowed.add(id);
            state.dropClicksUntil = Infinity;
            return true;
        }
        if (!state.swallowed.has(id)) {
            if (type === "pointerup" || type === "pointercancel")
                state.touchesDown.delete(id);
            return false;
        }
        if (type === "pointerup" || type === "pointercancel") {
            state.swallowed.delete(id);
            if (state.swallowed.size === 0)
                state.dropClicksUntil = now + CLICK_AFTER_RELEASE_MS;
        }
        return true;
    }
    // Mouse-compatibility and click events made from a swallowed finger
    if (
        type === "click" ||
        type === "dblclick" ||
        type === "mousedown" ||
        type === "mouseup" ||
        type === "contextmenu"
    ) {
        if (now > state.dropClicksUntil) return false;
        // A real pen's own compatibility events must pass
        if (pointerType === "pen" || pointerType === "mouse") return false;
        return true;
    }
    return false;
}

const TYPES = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "contextmenu",
];

let running: (() => void) | null = null;

/** Starts the window-wide guard (once); returns the stop */
export function startPenPalmGuard(): () => void {
    if (running) return running;
    const state = initialPalmGuardState();
    const listener = (e: Event) => {
        const now = e.timeStamp > 0 ? e.timeStamp : performance.now();
        if (
            palmGuardShouldBlock(
                state,
                {
                    type: e.type,
                    pointerType: (e as PointerEvent).pointerType,
                    pointerId: (e as PointerEvent).pointerId,
                    width: (e as PointerEvent).width,
                    height: (e as PointerEvent).height,
                },
                now,
            )
        ) {
            e.stopImmediatePropagation();
            if (e.cancelable) e.preventDefault();
        }
    };
    for (const type of TYPES)
        window.addEventListener(type, listener, {
            capture: true,
            passive: false,
        });
    running = () => {
        for (const type of TYPES)
            window.removeEventListener(type, listener, { capture: true });
        running = null;
    };
    return running;
}
