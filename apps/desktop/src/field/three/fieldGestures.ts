import type {
    AreaKind,
    FieldEditor,
    FieldPointer,
} from "@/field/editor/fieldEditor";
import {
    touchNavigation,
    type ElementPoint,
    type FieldSize,
    type FieldView,
    type TouchGeometry,
} from "@/field/editor/view";
import {
    initialGestureState,
    stepGesture,
    type GestureEffect,
    type GestureInput,
    type GestureState,
    type NavigationGeometry,
} from "@/components/canvas/touch/touchGestures";
import { startPenPalmGuard } from "@/components/canvas/touch/penPalmGuard";
import { onControl, setView } from "./fieldNavigation";
import { fieldPointerAt, useFieldViewStore } from "./fieldView";

/**
 * The field's gesture adapter (tablet plan 1.1): one place where finger and
 * pen presses on the field become editing, navigation and menus. It feeds
 * each press to the gesture rules (`components/canvas/touch/touchGestures.ts`,
 * pure, timestamped) and carries out the effects they return:
 *
 * - A single finger's press does what {@link FieldGestureOptions.singleFinger}
 *   says: `"edit"` hands it to the editor (`pointerDown`/`Move`/`Up`, and
 *   `pointerCancel` when a second finger lands), `"navigate"` moves the view
 *   once it leaves the tap slop, and `"marquee"` or `"lasso"` hands it to the
 *   editor to draw that from empty field (the pill's drag mode, tablet 1.3).
 * - A navigating finger held still, then dragged, may draw a box instead
 *   ({@link FieldGestureOptions.holdDrag}).
 * - Two or more fingers pan and pinch the view. The field point under the
 *   fingers stays under them, one to one.
 * - A finger held still and then lifted without moving asks the editor for
 *   a menu (`longPress`) where it lifted, as a right-click does: a mode's,
 *   else the field's. Holding still only arms it: a finger that moves on
 *   after the hold carries on as a drag or pan (a hesitant finger still
 *   drags). The editor's press stays alive while armed; on the release it's
 *   given up for the menu, or, with no menu, ends as a slow tap.
 * - Two- and three-finger taps go to {@link FieldGestureOptions.history}.
 * - A pen is only watched, for palm rejection by timing: fingers are ignored
 *   while it is down and only navigate (with two fingers) just after.
 *   The pen's presses reach the editor as a mouse's do, through
 *   `fieldPointerInput.ts`, which also times its long press.
 *
 * Mouse presses never come here.
 */

/** What the adapter asks of the field editor. */
export type FieldGestureEditor = Pick<
    FieldEditor,
    "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel" | "longPress"
>;

/**
 * What a single finger's press does, decided as it goes down: edit through
 * the editor (it may still decline the press, which then navigates), draw a
 * marquee or lasso through it from empty field, or move the view.
 */
export type SingleFingerRole = "edit" | "navigate" | AreaKind;

export type FieldGestureOptions = {
    /** The editor presses go to; null where nothing is edited (Preview). */
    editor: () => FieldGestureEditor | null;
    /**
     * What a single finger does, from where it went down. Default: it
     * navigates, as on the field before the tablet port.
     */
    singleFinger?: (press: FieldPointer) => SingleFingerRole;
    /**
     * A navigating finger was held still on `press` (a long press armed), then
     * dragged: what it draws from there instead of moving the view, or null
     * to keep moving the view. Default: it keeps moving the view.
     */
    holdDrag?: (press: FieldPointer) => AreaKind | null;
    /** A navigating finger tapped (lifted within the tap slop) at `pointer`. */
    tap?: (pointer: FieldPointer) => void;
    /** A two-finger tap (undo) or three-finger tap (redo). */
    history?: (direction: "undo" | "redo") => void;
};

/** The parts of a pointer event the adapter reads; a `PointerEvent` is one. */
export type FieldGestureEvent = Pick<
    PointerEvent,
    | "type"
    | "pointerId"
    | "pointerType"
    | "clientX"
    | "clientY"
    | "button"
    | "buttons"
    | "pressure"
    | "shiftKey"
    | "altKey"
    | "ctrlKey"
    | "metaKey"
    | "timeStamp"
>;

/** What the adapter needs from around it: the view, positions and a timer. */
export type FieldGestureEnv = FieldGestureOptions & {
    /** The event as the editor hears it, measured from the field's element. */
    pointer: (event: FieldGestureEvent) => FieldPointer;
    /** A client point in the field's element. */
    local: (clientX: number, clientY: number) => ElementPoint;
    /** The view now, and the field's size for the pan limit. */
    view: () => { view: FieldView; field: FieldSize };
    /** Moves the view for the user (stops a glide). */
    setView: (next: FieldView) => void;
    /** Calls `tick` at about time `at` (the events' clock); returns the cancel. */
    schedule: (at: number, tick: () => void) => () => void;
};

/**
 * Finger presses are the gesture adapter's; mouse and pen presses go
 * straight to the editor (`fieldPointerInput.ts`). The one place that split
 * is decided.
 */
export const fieldGesturesOwn = (event: Pick<PointerEvent, "pointerType">) =>
    event.pointerType === "touch";

const INPUT_TYPES: Record<string, "down" | "move" | "up" | "cancel"> = {
    pointerdown: "down",
    pointermove: "move",
    pointerup: "up",
    pointercancel: "cancel",
    // After a release as well, when the press is already gone: then it does nothing
    lostpointercapture: "cancel",
};

/**
 * The adapter itself, without the DOM: events in, editor calls and view
 * changes out. {@link attachFieldGestures} puts it on the field.
 */
export class FieldGestures {
    private state: GestureState = initialGestureState();
    /** The single finger's press, what it does, and where it went down */
    private single: {
        id: number;
        role: "edit" | "navigate";
        down: FieldGestureEvent;
    } | null = null;
    /** The view and finger geometry when the navigation (re)started */
    private navigation: { view: FieldView; from: TouchGeometry } | null = null;
    private cancelTimer: (() => void) | null = null;

    constructor(private readonly env: FieldGestureEnv) {}

    /**
     * Takes a pointer event on the field. Returns whether it was a finger's,
     * which only the adapter handles; a pen's is watched and goes on to the
     * editor too, a mouse's is ignored.
     */
    handle(event: FieldGestureEvent): boolean {
        const kind = event.pointerType;
        if (kind !== "touch" && kind !== "pen") return false;
        const type = INPUT_TYPES[event.type];
        if (!type) return false;
        this.step(
            {
                type,
                id: event.pointerId,
                kind,
                x: event.clientX,
                y: event.clientY,
                t: event.timeStamp,
                contact: event.buttons > 0 || event.pressure > 0,
            } as GestureInput,
            event,
        );
        return kind === "touch";
    }

    /** The long press timer came due at `t`. */
    tick(t: number): void {
        this.step({ type: "timer", t });
    }

    /** Stops: drops the timer and anything under way. */
    dispose(): void {
        this.cancelTimer?.();
        this.cancelTimer = null;
        if (this.single?.role === "edit") this.env.editor()?.pointerCancel();
        this.single = null;
        this.navigation = null;
        this.state = initialGestureState();
    }

    private step(input: GestureInput, event?: FieldGestureEvent) {
        const result = stepGesture(this.state, input);
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect, event);
        // The editing finger's moves go on to the editor
        if (
            event &&
            input.type === "move" &&
            "kind" in input &&
            input.kind === "touch" &&
            result.passThrough &&
            this.single?.id === input.id &&
            this.single.role === "edit"
        )
            this.env.editor()?.pointerMove(this.env.pointer(event));
        this.scheduleTimer();
    }

    private scheduleTimer() {
        this.cancelTimer?.();
        this.cancelTimer = null;
        const at = this.state.longPressAt;
        if (at === null) return;
        this.cancelTimer = this.env.schedule(at, () => {
            this.cancelTimer = null;
            this.tick(at);
        });
    }

    // eslint-disable-next-line max-lines-per-function
    private apply(effect: GestureEffect, event?: FieldGestureEvent) {
        const editor = this.env.editor();
        switch (effect.type) {
            case "singleStart": {
                if (!event) break;
                const press = this.env.pointer(event);
                const chosen: SingleFingerRole =
                    editor && this.env.singleFinger
                        ? this.env.singleFinger(press)
                        : "navigate";
                const edits =
                    chosen !== "navigate" &&
                    (editor?.pointerDown(
                        chosen === "edit" ? press : { ...press, area: chosen },
                    ) ??
                        false);
                this.single = {
                    id: effect.id,
                    role: edits ? "edit" : "navigate",
                    down: event,
                };
                break;
            }
            case "singleDragged":
                if (this.single?.role === "navigate") this.panSingle();
                break;
            case "singleEnd": {
                const single = this.single;
                this.single = null;
                if (!event || single?.id !== effect.id) break;
                if (single.role === "edit")
                    editor?.pointerUp(this.env.pointer(event));
                else if (effect.tap) this.env.tap?.(this.env.pointer(event));
                break;
            }
            case "cancelSingle":
                if (this.single?.role === "edit") editor?.pointerCancel();
                this.single = null;
                break;
            case "longPressCommit": {
                // Held still, then lifted without moving: the menu a
                // right-click opens, where it lifted. No `singleEnd` follows.
                // The editor gives up a press it holds (a finger on a
                // marcher) for the menu; with no menu, an editing finger's
                // press was a slow tap, released there (it never moved past
                // the long press slop)
                const single = this.single;
                this.single = null;
                if (!editor || !event || single?.id !== effect.id) break;
                const at = this.env.pointer({
                    ...event,
                    clientX: effect.point.x,
                    clientY: effect.point.y,
                });
                if (!editor.longPress(at) && single.role === "edit")
                    editor.pointerUp(at);
                break;
            }
            // Armed, the press carries on: a move after it is a drag or a pan,
            // or, for a finger that would pan, a box (`holdDrag`)
            case "longPressMoved":
                this.holdDragged(effect.id);
                break;
            case "longPressArmed":
            case "longPressCancelled":
                break;
            case "navigationStart":
                this.navigation = {
                    view: this.env.view().view,
                    from: this.local(effect.geometry),
                };
                break;
            case "navigate": {
                if (!this.navigation) break;
                const { field } = this.env.view();
                this.env.setView(
                    touchNavigation(
                        this.navigation.view,
                        this.navigation.from,
                        this.local(effect.geometry),
                        field,
                    ),
                );
                break;
            }
            case "navigationEnd":
                this.navigation = null;
                break;
            case "undo":
            case "redo":
                this.env.history?.(effect.type);
                break;
        }
    }

    /**
     * A navigating finger moved after holding still: from empty field it may
     * draw a box from where it went down ({@link FieldGestureOptions.holdDrag})
     * instead of moving the view. The move that got here goes on to the
     * editor (`step`), and so does the rest of the press.
     */
    private holdDragged(id: number) {
        const single = this.single;
        const editor = this.env.editor();
        if (single?.id !== id || single.role !== "navigate" || !editor) return;
        const start = this.env.pointer(single.down);
        const area = this.env.holdDrag?.(start) ?? null;
        if (area && editor.pointerDown({ ...start, area }))
            single.role = "edit";
    }

    /**
     * The navigating finger left the tap slop: the rest of its press moves
     * the view, from where it went down, so the view catches up at once.
     */
    private panSingle() {
        const result = stepGesture(this.state, { type: "panSingle" });
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect);
        const finger = this.state.pointers[0];
        if (finger)
            this.apply({
                type: "navigate",
                geometry: { mid: { ...finger.current }, distance: null },
            });
    }

    private local(geometry: NavigationGeometry): TouchGeometry {
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
    "lostpointercapture",
] as const;

/**
 * Puts the gesture adapter on `surface`, the element around the field (its
 * overlays included), measuring positions from `field`, the element the
 * field draws into. Presses on the field's own controls are left to them.
 * Also starts the window-wide palm guard (`penPalmGuard.ts`), so a hand
 * resting on the screen while the pen draws presses nothing anywhere.
 * Returns the detach.
 */
export function attachFieldGestures(
    surface: HTMLElement,
    field: () => HTMLElement | null,
    options: FieldGestureOptions,
): () => void {
    const measured = () => field() ?? surface;
    const gestures = new FieldGestures({
        ...options,
        pointer: (event) => fieldPointerAt(measured(), event),
        local: (clientX, clientY) => {
            const rect = measured().getBoundingClientRect();
            return { x: clientX - rect.left, y: clientY - rect.top };
        },
        view: () => {
            const { width, height, zoom, panX, panY, field } =
                useFieldViewStore.getState();
            return { view: { width, height, zoom, panX, panY }, field };
        },
        setView,
        schedule: (at, tick) => {
            let frame: number | null = null;
            const timer = setTimeout(
                () => {
                    // Moves the browser has queued are handled at the start of
                    // the next frame: count the hold only after them
                    frame = requestAnimationFrame(() => {
                        frame = null;
                        tick();
                    });
                },
                Math.max(0, at - performance.now()),
            );
            return () => {
                clearTimeout(timer);
                if (frame !== null) cancelAnimationFrame(frame);
            };
        },
    });
    const onPointer = (event: PointerEvent) => {
        // A finger pressing one of the field's controls is the control's
        if (
            event.type === "pointerdown" &&
            fieldGesturesOwn(event) &&
            onControl(event)
        )
            return;
        gestures.handle(event);
    };
    // The browser's own handling of a finger on the field: no mouse events
    // made from it, no double-tap zoom, no text selection callout
    const onTouchStart = (event: TouchEvent) => {
        if (!onControl(event) && event.cancelable) event.preventDefault();
    };
    for (const type of POINTER_TYPES)
        surface.addEventListener(type, onPointer, { capture: true });
    surface.addEventListener("touchstart", onTouchStart, { passive: false });
    const { style } = surface;
    const before = {
        callout: style.getPropertyValue("-webkit-touch-callout"),
        select: style.userSelect,
    };
    style.setProperty("-webkit-touch-callout", "none");
    style.userSelect = "none";
    const stopPalmGuard = startPenPalmGuard();
    return () => {
        for (const type of POINTER_TYPES)
            surface.removeEventListener(type, onPointer, { capture: true });
        surface.removeEventListener("touchstart", onTouchStart);
        style.setProperty("-webkit-touch-callout", before.callout);
        style.userSelect = before.select;
        stopPalmGuard();
        gestures.dispose();
    };
}
