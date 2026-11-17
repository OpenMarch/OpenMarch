import { thresholdsFor } from "@/field/editor/pointerThresholds";
import {
    GESTURE_TIMING,
    initialGestureState,
    stepGesture,
    type GestureEffect,
    type GestureInput,
    type GestureState,
    type NavigationGeometry,
} from "@/components/canvas/touch/touchGestures";
import { pickTouchTarget, type TouchHitCandidate } from "./touchTargets";

/**
 * The timeline's gesture adapter (tablet plan 3.1): where a finger's press on the timeline goes.
 * Like the field's (`field/three/fieldGestures.ts`) it feeds finger presses to the pure gesture
 * rules (`touchGestures.ts` `stepGesture`) and carries out the effects they return.
 *
 * - A finger on a control (a clip, a flag, a page box, a grip, the tempo band, a button) is the
 *   control's: the press goes on to it untouched, so one finger on a clip moves it and one finger
 *   on a page box scrubs, as a mouse does.
 * - A finger on bare ruler or page row (the pinned header) scrubs, through the timeline surface's
 *   own pointer handlers, as a mouse does.
 * - A finger on bare track space pans the timeline once it leaves the tap slop (sideways and,
 *   when the tracks overflow, up and down). A tap there seeks, as a click does.
 * - Two fingers pan and pinch anywhere ({@link timelineNavigation}).
 * - A finger held still (within the gesture rules' long press slop, so a little jitter still
 *   counts) and then lifted opens the menu a right-click opens there, as on the field (tablet
 *   plan 3.4): the adapter sends a `contextmenu` to what the finger pressed. When a menu opened,
 *   the press is cancelled (whatever it started goes back) and its click goes nowhere. With no
 *   menu there, the press ends as a slow tap.
 * - A second finger cancels whatever the first one started: the first press gets a
 *   `pointercancel`, and every timeline drag puts its state back on one.
 *
 * Mouse and pen presses never come here: desktop behavior is unchanged.
 */

/** What a single finger does, decided where it goes down (see {@link timelineTouchRegion}). */
export type TimelineTouchRegion =
    /** A control takes its own presses */
    | "control"
    /** Bare ruler or page row: the surface scrubs */
    | "ruler"
    /** Bare track space: the finger pans */
    | "body";

/**
 * What takes its own presses on the timeline: anything marked `data-timeline-interactive` (clips,
 * flags, grips, hold edges, keyframes, the loop bar, the tempo band), the playhead's grab area,
 * and plain controls.
 */
export const TIMELINE_CONTROL_SELECTOR = [
    "[data-timeline-interactive]",
    "[data-timeline-scrub]",
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='slider']",
    "[role='menuitem']",
    "[contenteditable='true']",
].join(", ");

/**
 * The region a finger lands in. `onControl`: the press is on a control
 * ({@link TIMELINE_CONTROL_SELECTOR}). `offsetY`: its distance below the viewport's top, where the
 * pinned header (ruler and page row, `headerHeight` tall) always sits.
 */
export function timelineTouchRegion({
    onControl,
    offsetY,
    headerHeight,
}: {
    onControl: boolean;
    offsetY: number;
    headerHeight: number;
}): TimelineTouchRegion {
    if (onControl) return "control";
    return offsetY < headerHeight ? "ruler" : "body";
}

/** The timeline's scroll and zoom: what navigation moves. */
export type TimelineNavigationView = {
    scrollLeft: number;
    scrollTop: number;
    pixelsPerBeat: number;
};

/** Finger geometry in the viewport's own pixels (from its top left corner). */
export type TimelineGeometry = NavigationGeometry;

/** Where a navigation went: the view, and the beat kept under the fingers' midpoint. */
export type TimelineNavigationStep = TimelineNavigationView & {
    /** The beat that was under the midpoint at the start, and is under it now */
    anchorBeat: number;
    /** The midpoint's distance from the viewport's left edge */
    anchorPx: number;
};

/**
 * The view for the fingers' `current` geometry, from the view and geometry when the navigation
 * (re)started: the beat under the start midpoint stays under the current midpoint, and the tracks
 * scroll with it up and down. With two fingers the zoom scales with their spread, limited by
 * `clampZoom`; without `clampZoom` (no zoom to change), or with one finger, it only pans.
 *
 * `leadingInset` is where beat 0 sits in the scrolled content. Scroll positions are not limited
 * here; the viewport limits them.
 */
export function timelineNavigation({
    start,
    from,
    current,
    leadingInset,
    clampZoom,
}: {
    start: TimelineNavigationView;
    from: TimelineGeometry;
    current: TimelineGeometry;
    leadingInset: number;
    clampZoom?: (pixelsPerBeat: number) => number;
}): TimelineNavigationStep {
    const anchorBeat =
        start.pixelsPerBeat > 0
            ? (start.scrollLeft + from.mid.x - leadingInset) /
              start.pixelsPerBeat
            : 0;
    const pinching =
        clampZoom !== undefined &&
        from.distance !== null &&
        current.distance !== null &&
        from.distance > 0;
    const pixelsPerBeat = pinching
        ? clampZoom((start.pixelsPerBeat * current.distance!) / from.distance!)
        : start.pixelsPerBeat;
    return {
        pixelsPerBeat,
        scrollLeft: leadingInset + anchorBeat * pixelsPerBeat - current.mid.x,
        scrollTop: start.scrollTop + from.mid.y - current.mid.y,
        anchorBeat,
        anchorPx: current.mid.x,
    };
}

/** The parts of a pointer event the adapter reads; a `PointerEvent` is one. */
export type TimelineGestureEvent = Pick<
    PointerEvent,
    "type" | "pointerId" | "pointerType" | "clientX" | "clientY" | "timeStamp"
> & { target: EventTarget | null };

/** What the adapter needs from around it. */
export type TimelineGestureEnv = {
    /** Where a press lands (see {@link timelineTouchRegion}). */
    region: (event: TimelineGestureEvent) => TimelineTouchRegion;
    /** A client point in the viewport's own pixels. */
    local: (clientX: number, clientY: number) => { x: number; y: number };
    /** The scroll and zoom now. */
    view: () => TimelineNavigationView;
    /** Moves the view to a navigation step. */
    navigate: (step: TimelineNavigationStep) => void;
    /** Where beat 0 sits in the scrolled content. */
    leadingInset: () => number;
    /**
     * Limits a pinched zoom; the seam pinch zoom fills (tablet plan 3.2). Without it two fingers
     * only pan.
     */
    clampZoom?: (pixelsPerBeat: number) => number;
    /** A finger tapped bare track space at `clientX`: the click there (a seek). */
    tap?: (clientX: number) => void;
    /**
     * A second finger landed while the first one's press belonged to a control or the ruler:
     * end that press as a cancelled one, so whatever it was dragging goes back.
     */
    cancelPress: (down: TimelineGestureEvent) => void;
    /**
     * A finger was held still and lifted at `point` (client pixels): open the menu a right-click
     * on what `down` pressed opens. Returns whether one opened. Without it there's no long press.
     */
    longPress?: (
        down: TimelineGestureEvent,
        point: { x: number; y: number },
    ) => boolean;
    /** Calls `tick` at time `at` (the events' clock), for the long press; returns the cancel */
    schedule?: (at: number, tick: () => void) => () => void;
};

const INPUT_TYPES: Record<string, "down" | "move" | "up" | "cancel"> = {
    pointerdown: "down",
    pointermove: "move",
    pointerup: "up",
    pointercancel: "cancel",
};

/**
 * How far a press on a timeline control (a clip, page box, flag, grip, edge) moves before it drags:
 * the control's own mouse threshold, or at least a finger's move threshold, so a tap that wobbles
 * stays a tap. Mouse and pen keep `mouseSlop`.
 */
export const fingerDragSlop = (pointerType: string, mouseSlop: number) =>
    pointerType === "touch"
        ? Math.max(mouseSlop, thresholdsFor("touch").moveThreshold)
        : mouseSlop;

/** Finger presses are the adapter's; mouse and pen presses never are. */
export const timelineGesturesOwn = (event: Pick<PointerEvent, "pointerType">) =>
    event.pointerType === "touch";

/**
 * The adapter itself, without the DOM: events in, view changes and cancels out.
 * {@link attachTimelineGestures} puts it on the timeline's viewport.
 */
export class TimelineGestures {
    private state: GestureState = initialGestureState();
    /** The single finger's press: whether it pans, and its down event */
    private single: {
        id: number;
        pans: boolean;
        down: TimelineGestureEvent;
    } | null = null;
    /** The view and geometry when the navigation (re)started */
    private navigation: {
        view: TimelineNavigationView;
        from: TimelineGeometry;
    } | null = null;
    /** The long press timer's cancel */
    private cancelTimer: (() => void) | null = null;
    /**
     * Set by a long press's release: whether that release is the adapter's alone (true: a menu
     * opened, or the finger panned) or goes on to its control (false)
     */
    private releaseOwned: boolean | null = null;

    constructor(private readonly env: TimelineGestureEnv) {}

    /**
     * Takes a pointer event on the timeline. Returns whether the event is the adapter's alone: the
     * caller then keeps it from the timeline's own handlers. A finger's press on a control or the
     * ruler (and its later events) goes on to them, until a second finger lands.
     */
    handle(event: TimelineGestureEvent): boolean {
        if (!timelineGesturesOwn(event)) return false;
        const type = INPUT_TYPES[event.type];
        if (!type) return false;
        const input = {
            type,
            id: event.pointerId,
            kind: "touch",
            x: event.clientX,
            y: event.clientY,
            t: event.timeStamp,
        } as GestureInput;
        // Decided before the step, so a single finger's own release still goes on to its control
        const single = this.single;
        this.releaseOwned = null;
        const result = stepGesture(this.state, input);
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect, event);
        this.scheduleTimer();
        if (this.releaseOwned !== null) return this.releaseOwned;
        if (!result.passThrough) return true;
        // A single finger: its control's or the ruler's, unless it pans
        const own = this.single ?? single;
        return own?.id === event.pointerId && own.pans;
    }

    /** Whether a gesture is under way. */
    get active(): boolean {
        return this.state.mode !== "idle";
    }

    /**
     * The fingers whose events are the adapter's alone: a panning finger, and every finger of a
     * navigation (the first one too, once a second finger took it from its control). The
     * viewport holds their pointer capture, so their release always comes back here.
     */
    owned(): number[] {
        if (this.state.mode === "gesture")
            return this.state.pointers.map((p) => p.id);
        return this.single?.pans ? [this.single.id] : [];
    }

    /** Whether the adapter is still following finger `id`. */
    tracks(id: number): boolean {
        return this.state.pointers.some((p) => p.id === id);
    }

    /**
     * Finger `id` lifted somewhere the adapter never heard it (its capture was lost, or the
     * element holding it went): forget it as a cancel, so it can't hold a gesture open.
     */
    drop(id: number, timeStamp: number): void {
        const pointer = this.state.pointers.find((p) => p.id === id);
        if (!pointer) return;
        this.handle({
            type: "pointercancel",
            pointerId: id,
            pointerType: "touch",
            clientX: pointer.current.x,
            clientY: pointer.current.y,
            timeStamp,
            target: null,
        });
    }

    /** The long press timer came due at `t`. */
    tick(t: number): void {
        const result = stepGesture(this.state, { type: "timer", t });
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect);
    }

    /** Stops: drops anything under way. */
    dispose(): void {
        this.cancelTimer?.();
        this.cancelTimer = null;
        this.single = null;
        this.navigation = null;
        this.state = initialGestureState();
    }

    private scheduleTimer() {
        this.cancelTimer?.();
        this.cancelTimer = null;
        const at = this.state.longPressAt;
        if (at === null || !this.env.longPress || !this.env.schedule) return;
        this.cancelTimer = this.env.schedule(at, () => {
            this.cancelTimer = null;
            this.tick(at);
        });
    }

    private apply(effect: GestureEffect, event?: TimelineGestureEvent) {
        switch (effect.type) {
            case "singleStart":
                if (!event) break;
                this.single = {
                    id: effect.id,
                    pans: this.env.region(event) === "body",
                    down: event,
                };
                break;
            case "singleDragged":
                if (this.single?.pans) this.panSingle();
                break;
            case "singleEnd": {
                const single = this.single;
                this.single = null;
                if (single?.id === effect.id && single.pans && effect.tap)
                    this.env.tap?.(effect.point.x);
                break;
            }
            case "cancelSingle": {
                const single = this.single;
                this.single = null;
                // A second finger (or the browser) took the press from its control: put back what
                // it was dragging. A panning finger had nothing to put back.
                if (single && !single.pans && event?.type !== "pointercancel")
                    this.env.cancelPress(single.down);
                break;
            }
            case "navigationStart":
                this.navigation = {
                    view: this.env.view(),
                    from: this.local(effect.geometry),
                };
                break;
            case "navigate": {
                const navigation = this.navigation;
                if (!navigation) break;
                this.env.navigate(
                    timelineNavigation({
                        start: navigation.view,
                        from: navigation.from,
                        current: this.local(effect.geometry),
                        leadingInset: this.env.leadingInset(),
                        clampZoom: this.env.clampZoom,
                    }),
                );
                break;
            }
            case "navigationEnd":
                this.navigation = null;
                break;
            case "longPressCommit": {
                // Held still, then lifted without moving: the menu a right-click opens there.
                // No `singleEnd` follows
                const single = this.single;
                this.single = null;
                if (single?.id !== effect.id) break;
                if (this.env.longPress?.(single.down, effect.point)) {
                    // The menu takes the press: whatever it started goes back
                    this.releaseOwned = true;
                    if (!single.pans) this.env.cancelPress(single.down);
                    break;
                }
                // No menu: a slow tap. A panning finger's tap is the adapter's; a control's
                // release goes on to it
                this.releaseOwned = single.pans;
                if (single.pans) this.env.tap?.(effect.point.x);
                break;
            }
            // Armed, the press carries on: a move after the hold is a drag or a pan as before.
            // No multi-finger tap history on the timeline yet
            case "longPressArmed":
            case "longPressMoved":
            case "longPressCancelled":
            case "undo":
            case "redo":
                break;
        }
    }

    /** The panning finger left the tap slop: the rest of its press pans, from where it went down. */
    private panSingle() {
        const result = stepGesture(this.state, { type: "panSingle" });
        this.state = result.state;
        for (const effect of result.effects)
            if (effect.type === "navigationStart")
                this.navigation = {
                    view: this.env.view(),
                    from: this.local(effect.geometry),
                };
        const finger = this.state.pointers[0];
        const navigation = this.navigation;
        if (finger && navigation)
            this.env.navigate(
                timelineNavigation({
                    start: navigation.view,
                    from: navigation.from,
                    current: this.local({
                        mid: { ...finger.current },
                        distance: null,
                    }),
                    leadingInset: this.env.leadingInset(),
                }),
            );
    }

    private local(geometry: NavigationGeometry): TimelineGeometry {
        return {
            mid: this.env.local(geometry.mid.x, geometry.mid.y),
            distance: geometry.distance,
        };
    }
}

const POINTER_TYPES = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
] as const;
const CAPTURE_TYPES = ["gotpointercapture", "lostpointercapture"] as const;
const RELEASE_TYPES = ["pointerup", "pointercancel"] as const;

/**
 * Puts the gesture adapter on `viewport`, the timeline's scroller, before the timeline's own
 * handlers see any event (capture phase). The finger events the adapter keeps don't reach them.
 * Also makes the viewport `touch-action: none`, so the browser never scrolls it itself (which
 * would cancel the press). The fingers the adapter keeps are captured by the viewport, and a
 * window-wide fallback forgets a finger whose release never reached it, so a lost finger can't
 * leave a gesture open. Returns the detach.
 */
// eslint-disable-next-line max-lines-per-function
export function attachTimelineGestures(
    viewport: HTMLElement,
    env: Omit<
        TimelineGestureEnv,
        "cancelPress" | "local" | "longPress" | "schedule"
    >,
): () => void {
    /** Set while the adapter sends its own cancel, which it mustn't step on */
    let cancelling = false;
    /** A long press opened a menu: the click its release makes goes nowhere */
    let menuClick: { timeStamp: number } | null = null;
    /** The presses the adapter sent on to a hit area, which it mustn't send on again */
    const redirected = new WeakSet<Event>();
    /** The last finger press on a hit area's target (or sent on to it): its tap's click goes there */
    let redirectedTap: {
        target: Element;
        owner: Element;
        timeStamp: number;
    } | null = null;
    /** The element holding each finger's pointer capture, inside the timeline */
    const captured = new Map<number, Element>();
    const gestures = new TimelineGestures({
        ...env,
        local: (clientX, clientY) => {
            const rect = viewport.getBoundingClientRect();
            return { x: clientX - rect.left, y: clientY - rect.top };
        },
        cancelPress: (down) => {
            // The element it went down on, or, if that went, the one holding its capture
            const pressed =
                down.target instanceof Element && down.target.isConnected
                    ? down.target
                    : captured.get(down.pointerId);
            const target = pressed?.isConnected ? pressed : null;
            if (!target) return;
            cancelling = true;
            try {
                // Each drag on the timeline puts back what it moved on a cancel
                target.dispatchEvent(fingerCancel(down));
            } finally {
                cancelling = false;
            }
            // Its later moves and release are the navigation's
            for (const element of [
                target,
                ...ancestorsUpTo(target, viewport),
            ]) {
                if (element.hasPointerCapture?.(down.pointerId))
                    element.releasePointerCapture(down.pointerId);
            }
        },
        longPress: (down, point) => {
            // What the finger pressed (the target it was sent on to, near a hit area), as a
            // right-click there would be
            const pressed =
                down.target instanceof Element && down.target.isConnected
                    ? down.target
                    : viewport.ownerDocument.elementFromPoint(point.x, point.y);
            if (!pressed || !viewport.contains(pressed)) return false;
            if (!openContextMenu(pressed, point.x, point.y)) return false;
            redirectedTap = null;
            menuClick = { timeStamp: performance.now() };
            return true;
        },
        schedule: (at, tick) => {
            let frame: number | null = null;
            const timer = setTimeout(
                () => {
                    // Moves the browser has queued are handled at the start of the next frame:
                    // count the hold only after them (as the field does)
                    frame = requestAnimationFrame(() => {
                        frame = null;
                        tick();
                    });
                },
                // Never longer than a hold, should an event's clock not be the page's
                Math.min(
                    Math.max(0, at - performance.now()),
                    GESTURE_TIMING.longPressMs,
                ),
            );
            return () => {
                clearTimeout(timer);
                if (frame !== null) cancelAnimationFrame(frame);
            };
        },
    });
    const onPointer = (event: PointerEvent) => {
        if (cancelling) return;
        if (event.type === "pointerdown" && !redirected.has(event)) {
            // A finger's first press near a small target (tablet plan 3.3) is that target's
            if (
                timelineGesturesOwn(event) &&
                !gestures.active &&
                redirectToTouchHit(event)
            )
                return;
            // A finger right on a target with a hit area: its tap's click is that target's too
            const hit =
                timelineGesturesOwn(event) && event.target instanceof Element
                    ? touchHitOf(event.target, viewport)
                    : null;
            if (hit)
                redirectedTap = {
                    target: hit,
                    owner: hit.parentElement ?? hit,
                    timeStamp: event.timeStamp,
                };
        }
        handlePointer(event);
    };
    /**
     * Sends a finger's press on to the hit area it belongs to (`findTouchHit`) when it landed
     * elsewhere: on the bare timeline, a page box, or another target's overlapping hit area.
     * Returns whether it did; the press as it landed then goes no further.
     */
    const redirectToTouchHit = (event: PointerEvent): boolean => {
        const natural = event.target instanceof Element ? event.target : null;
        const found = findTouchHit(viewport, event.clientX, event.clientY);
        if (!found || (natural && found.owner.contains(natural))) return false;
        const { target, owner } = found;
        event.stopPropagation();
        // The browser holds a finger's pointer for the element it landed on: let it go, so the
        // target's own handlers can take it
        if (natural?.hasPointerCapture?.(event.pointerId))
            natural.releasePointerCapture(event.pointerId);
        const press = clonePointerEvent(event);
        redirected.add(press);
        target.dispatchEvent(press);
        if (press.defaultPrevented) event.preventDefault();
        // A target that doesn't capture its presses still hears their moves and release
        if (!holdsCapture(target, event.pointerId))
            try {
                target.setPointerCapture?.(event.pointerId);
            } catch {
                // Already lifted
            }
        redirectedTap = { target, owner, timeStamp: event.timeStamp };
        return true;
    };
    // Any new press anywhere ends the wait for a redirected tap's click
    const onWindowPress = (event: PointerEvent) => {
        if (!redirected.has(event)) redirectedTap = null;
        menuClick = null;
    };
    // A finger's tap click doesn't always reach the target it pressed (Chrome sends it to the
    // page's body after a press on a keyframe's hit area, and a press sent on to a target landed
    // elsewhere): send it on to the target, so a tap 15px off a keyframe seeks as a tap on the
    // diamond does. Heard window-wide: a menu the press opened (the ⋯ chip's) may now be under
    // the finger, and must not take the click
    const onClick = (event: MouseEvent) => {
        // A long press's release opened a menu: its click mustn't select or seek, nor pick an
        // entry of the menu now under the finger
        if (menuClick) {
            const late =
                performance.now() - menuClick.timeStamp > REDIRECTED_CLICK_MS;
            menuClick = null;
            if (!late) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
        }
        const tap = redirectedTap;
        if (!tap || redirected.has(event)) return;
        redirectedTap = null;
        const { owner } = tap;
        if (
            !owner.isConnected ||
            event.timeStamp - tap.timeStamp > REDIRECTED_CLICK_MS ||
            (event.target instanceof Node && owner.contains(event.target))
        )
            return;
        event.stopPropagation();
        event.preventDefault();
        const click = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            detail: Math.max(1, event.detail),
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
        });
        redirected.add(click);
        tap.target.dispatchEvent(click);
    };
    const handlePointer = (event: PointerEvent) => {
        if (gestures.handle(event)) event.stopPropagation();
        // The fingers the adapter keeps are held by the viewport, so their moves and release
        // come here wherever they go: off the pane, or after the control they were on went
        for (const id of gestures.owned()) {
            if (viewport.hasPointerCapture?.(id)) continue;
            try {
                viewport.setPointerCapture?.(id);
            } catch {
                // Already lifted: the window's fallback below forgets it
            }
        }
    };
    // The browser's own long-press menu event (Android, Chrome on Windows) comes while the finger
    // is still down and ignores the jitter rules: only the adapter's, on release, opens a menu
    const onNativeContextMenu = (event: MouseEvent) => {
        if (touchContextMenus.has(event) || !gestures.active) return;
        event.preventDefault();
        event.stopPropagation();
    };
    const onCapture = (event: PointerEvent) => {
        if (!timelineGesturesOwn(event) || !(event.target instanceof Element))
            return;
        if (event.type === "gotpointercapture")
            captured.set(event.pointerId, event.target);
        else if (captured.get(event.pointerId) === event.target)
            captured.delete(event.pointerId);
    };
    // A finger lifted where the viewport never heard it (its capture lost, or the element holding
    // it gone): once the release has gone everywhere, a finger still followed is forgotten
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onWindowRelease = (event: PointerEvent) => {
        if (!timelineGesturesOwn(event) || !gestures.tracks(event.pointerId))
            return;
        const { pointerId, timeStamp } = event;
        const timer = setTimeout(() => {
            timers.delete(timer);
            captured.delete(pointerId);
            gestures.drop(pointerId, timeStamp);
        }, 0);
        timers.add(timer);
    };
    for (const type of POINTER_TYPES)
        viewport.addEventListener(type, onPointer, { capture: true });
    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("pointerdown", onWindowPress, { capture: true });
    viewport.addEventListener("contextmenu", onNativeContextMenu, {
        capture: true,
    });
    for (const type of CAPTURE_TYPES)
        viewport.addEventListener(type, onCapture, { capture: true });
    for (const type of RELEASE_TYPES)
        window.addEventListener(type, onWindowRelease, { capture: true });
    const { style } = viewport;
    const before = {
        touchAction: style.touchAction,
        callout: style.getPropertyValue("-webkit-touch-callout"),
    };
    style.touchAction = "none";
    style.setProperty("-webkit-touch-callout", "none");
    return () => {
        for (const type of POINTER_TYPES)
            viewport.removeEventListener(type, onPointer, { capture: true });
        window.removeEventListener("click", onClick, { capture: true });
        window.removeEventListener("pointerdown", onWindowPress, {
            capture: true,
        });
        viewport.removeEventListener("contextmenu", onNativeContextMenu, {
            capture: true,
        });
        for (const type of CAPTURE_TYPES)
            viewport.removeEventListener(type, onCapture, { capture: true });
        for (const type of RELEASE_TYPES)
            window.removeEventListener(type, onWindowRelease, {
                capture: true,
            });
        for (const timer of timers) clearTimeout(timer);
        captured.clear();
        style.touchAction = before.touchAction;
        style.setProperty("-webkit-touch-callout", before.callout);
        gestures.dispose();
    };
}

/** How long after a press sent on to a hit area its tap's click may come */
const REDIRECTED_CLICK_MS = 1000;

/** The `contextmenu` events a finger's long press sent (tablet plan 3.4) */
const touchContextMenus = new WeakSet<Event>();

/**
 * Whether a `contextmenu` event came from a finger's long press on the timeline, not a mouse's
 * right-click: a menu opened by touch may offer what a mouse reaches another way (the page box
 * menu's **Edit move**, a double-click for a mouse).
 */
export const isTouchContextMenu = (event: Event) =>
    touchContextMenus.has(event);

/**
 * Sends `target` the `contextmenu` a right-click at (`x`, `y`) sends, marked as a finger's
 * ({@link isTouchContextMenu}). Returns whether a menu took it (it prevented the default).
 */
export function openContextMenu(target: Element, x: number, y: number) {
    const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: 2,
    });
    touchContextMenus.add(event);
    target.dispatchEvent(event);
    return event.defaultPrevented;
}

/** Where a finger's press goes (`findTouchHit`): `target` gets it, `owner` is the control it's in */
export type TouchPressTarget = { target: Element; owner: Element };

/**
 * The small target (tablet plan 3.3) a finger's press at (`x`, `y`) belongs to, or null to leave
 * it where it landed. Of the touch hit areas (`data-touch-hit`, `TouchHitArea`) under it inside
 * `root`, `pickTouchTarget` picks one. What's under the hit areas counts: on a control that keeps
 * its presses (a clip, the add-page pill, any timeline control but the page boxes, which yield),
 * only that control's own targets or a target the press is right on take it, and otherwise the
 * press goes to the control itself, even when a hit area over it was on top. A target painted under
 * such a control isn't one the press is right on, though its own button holds the press: a mouse
 * would take the control. Hit areas only show in the touch layout, so in the mouse layout there
 * are none.
 */
export function findTouchHit(
    root: Element,
    x: number,
    y: number,
): TouchPressTarget | null {
    const under = (root.ownerDocument.elementsFromPoint?.(x, y) ?? []).filter(
        (element) => root.contains(element),
    );
    /** The topmost element under the press that isn't a hit area */
    const beneath =
        under.find((element) => !element.hasAttribute("data-touch-hit")) ??
        null;
    const control = keepingControl(beneath, root);
    const candidates: TouchHitCandidate<HTMLElement>[] = [];
    /** Past the control that keeps the press: the hit areas from here on are painted under it */
    let covered = false;
    for (const element of under) {
        if (element === beneath && control) covered = true;
        if (
            !element.hasAttribute("data-touch-hit") ||
            !(element instanceof HTMLElement)
        )
            continue;
        const owner = element.parentElement ?? element;
        // Topmost first; the candidates go in paint order
        candidates.unshift({
            key: element,
            hit: element.getBoundingClientRect(),
            drawn: drawnOf(element).getBoundingClientRect(),
            selected: element.hasAttribute("data-touch-selected"),
            group: element.dataset.touchGroup,
            // Right on it: in its own button, where a mouse would take it. Not when a control
            // that keeps its presses is painted over it there (the add-page pill over the last
            // page's flag grip, #920): a mouse would take that control
            on: !covered && isWithin(owner.getBoundingClientRect(), x, y),
        });
    }
    if (candidates.length === 0) return null;
    const keep = control
        ? (control.getAttribute("data-touch-keep") ?? KEEP_CONTROL)
        : undefined;
    const hit = pickTouchTarget(x, y, candidates, keep);
    if (hit) return { target: hit, owner: hit.parentElement ?? hit };
    return control && beneath ? { target: beneath, owner: control } : null;
}

/** The keep group of a control with none of its own: no hit area belongs to it */
const KEEP_CONTROL = "\u0000control";

/**
 * The control `element` is in that keeps a finger's press from the hit areas over it: a clip
 * (`data-touch-keep`) or another timeline control, but not a page box (`data-touch-yield`) and not
 * a target with a hit area of its own (that one competes through its hit area)
 */
function keepingControl(
    element: Element | null,
    root: Element,
): Element | null {
    const control = element?.closest(
        "[data-touch-keep], [data-timeline-interactive], button",
    );
    if (
        !control ||
        !root.contains(control) ||
        control.hasAttribute("data-touch-yield") ||
        [...control.children].some((child) =>
            child.hasAttribute("data-touch-hit"),
        )
    )
        return null;
    return control;
}

const isWithin = (rect: DOMRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/**
 * What a hit area's target draws: its mark (`data-touch-drawn`: a flag's line, a grip's bar, a
 * diamond), or else the target itself (the hit area's parent)
 */
function drawnOf(hit: Element): Element {
    const owner = hit.parentElement ?? hit;
    return owner.querySelector(":scope > [data-touch-drawn]") ?? owner;
}

/**
 * The touch hit area of the target `element` is in (a hit area itself, or inside a target that
 * has one), up to `root`; null when it's in none
 */
function touchHitOf(element: Element, root: Element): HTMLElement | null {
    for (
        let current: Element | null = element;
        current && current !== root;
        current = current.parentElement
    ) {
        if (
            current instanceof HTMLElement &&
            current.hasAttribute("data-touch-hit")
        )
            return current;
        for (const child of current.children)
            if (
                child instanceof HTMLElement &&
                child.hasAttribute("data-touch-hit")
            )
                return child;
    }
    return null;
}

/** Whether `element` or one of its ancestors holds pointer `id`'s capture */
function holdsCapture(element: Element, id: number): boolean {
    for (
        let current: Element | null = element;
        current;
        current = current.parentElement
    )
        if (current.hasPointerCapture?.(id)) return true;
    return false;
}

/** A copy of a pointer event, to send to another element (a `MouseEvent` where there's no `PointerEvent`) */
function clonePointerEvent(event: PointerEvent): Event {
    if (typeof PointerEvent !== "function") {
        const copy = new MouseEvent(event.type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: event.clientX,
            clientY: event.clientY,
            button: event.button,
            buttons: event.buttons,
        });
        Object.defineProperties(copy, {
            pointerId: { value: event.pointerId },
            pointerType: { value: event.pointerType },
        });
        return copy;
    }
    return new PointerEvent(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        width: event.width,
        height: event.height,
        pressure: event.pressure,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        button: event.button,
        buttons: event.buttons,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
    });
}

/** The `pointercancel` the adapter sends a finger's press (a `MouseEvent` where there's no `PointerEvent`) */
function fingerCancel(down: TimelineGestureEvent): Event {
    const init = {
        bubbles: true,
        pointerId: down.pointerId,
        pointerType: "touch",
        clientX: down.clientX,
        clientY: down.clientY,
    };
    if (typeof PointerEvent === "function")
        return new PointerEvent("pointercancel", init);
    const event = new MouseEvent("pointercancel", init);
    Object.defineProperties(event, {
        pointerId: { value: down.pointerId },
        pointerType: { value: "touch" },
    });
    return event;
}

function ancestorsUpTo(element: Element, stop: Element): Element[] {
    const found: Element[] = [];
    for (
        let current = element.parentElement;
        current && current !== stop;
        current = current.parentElement
    )
        found.push(current);
    return found;
}
