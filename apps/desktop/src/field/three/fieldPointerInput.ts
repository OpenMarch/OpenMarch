import type { FieldEditor, FieldPointer } from "@/field/editor/fieldEditor";
import { thresholdsFor } from "@/field/editor/pointerThresholds";
import { panBy } from "@/field/editor/view";
import { isMacPlatform } from "@/shortcuts/platform";
import { GESTURE_TIMING } from "@/components/canvas/touch/touchGestures";
import { fieldPointerAt, useFieldViewStore } from "./fieldView";
import { fieldGesturesOwn } from "./fieldGestures";
import { setView } from "./fieldNavigation";

export type FieldPointerInputOptions = {
    /**
     * What a pen's press does (the pill's drag mode, tablet 1.3): null sends
     * it to the editor as a mouse press, `"lasso"` too but a drag from empty
     * field draws a lasso, and `"pan"` moves the view (a pen tap there is
     * still a click). Default: every press is the editor's.
     */
    penDrag?: (press: FieldPointer) => "pan" | "lasso" | null;
};

/**
 * Reports the pointer on the new field's canvas to the editor: positions on
 * the field and on screen, the button and the modifiers, nothing else (ADR
 * 0005 D-2). The editor decides what they do. Shows the editor's cursor.
 *
 * Mouse and pen presses come straight here. Finger presses are the field's
 * gesture adapter's (`fieldGestures.ts`): it decides whether a finger edits,
 * navigates or opens a menu, and tells the editor itself. Returns the detach.
 *
 * A pen has no right button (an Apple Pencil has no barrel button), so a pen
 * held still and lifted opens the menus a right-click would (tablet 1.5): see
 * {@link watchPenHold}. A mouse never long-presses.
 */
// eslint-disable-next-line max-lines-per-function
export function attachFieldPointerInput(
    element: HTMLElement,
    editor: FieldEditor,
    options: FieldPointerInputOptions = {},
): () => void {
    const pointer = (event: PointerEvent): FieldPointer =>
        fieldPointerAt(element, event);

    /** The pointer the editor's press captured; other captures (navigation's) aren't its to cancel. */
    let captured: number | null = null;
    const penPan = attachPenPan(element, editor);
    const penHold = watchPenHold(editor, pointer);
    const down = (event: PointerEvent) => {
        if (fieldGesturesOwn(event)) return;
        const press = pointer(event);
        const drag =
            event.pointerType === "pen" && event.button === 0
                ? (options.penDrag?.(press) ?? null)
                : null;
        if (drag === "pan") {
            penPan.start(event, press);
            // Held and lifted unmoved, it opens the menus, as anywhere
            return penHold.down(event);
        }
        if (!editor.pointerDown(drag ? { ...press, area: drag } : press))
            return;
        captured = event.pointerId;
        element.setPointerCapture(event.pointerId);
        penHold.down(event);
    };
    const move = (event: PointerEvent) => {
        if (fieldGesturesOwn(event)) return;
        penHold.move(event);
        if (penPan.move(event)) {
            if (penPan.panning(event.pointerId)) penHold.cancel(event);
            return;
        }
        editor.pointerMove(pointer(event));
    };
    const up = (event: PointerEvent) => {
        if (fieldGesturesOwn(event)) return;
        // Held still and lifted unmoved, the menus opened (Pan too): no click
        if (penHold.up(event)) {
            penPan.cancel(event);
            return;
        }
        if (penPan.end(event)) return;
        editor.pointerUp(pointer(event));
    };
    const cancel = (event: PointerEvent) => {
        penHold.cancel(event);
        penPan.cancel(event);
        if (event.pointerId !== captured) return;
        captured = null;
        editor.pointerCancel();
    };
    const leave = (event: PointerEvent) => {
        if (event.buttons === 0) editor.pointerLeave();
    };
    const showCursor = () => {
        element.style.cursor = editor.cursor();
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel);
    // After a release, too, when the editor has nothing left to cancel
    element.addEventListener("lostpointercapture", cancel);
    element.addEventListener("pointerleave", leave);
    const detachRight = listenForCapturedRightPresses(element, editor, pointer);
    const unsubscribe = editor.subscribe(showCursor);
    showCursor();
    return () => {
        element.removeEventListener("pointerdown", down);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", up);
        element.removeEventListener("pointercancel", cancel);
        element.removeEventListener("lostpointercapture", cancel);
        element.removeEventListener("pointerleave", leave);
        detachRight();
        penHold.stop();
        unsubscribe();
        editor.pointerCancel();
        element.style.cursor = "";
    };
}

/**
 * A pen press that moves the view (the pill's Pan mode, tablet 1.3): it pans
 * one to one once it leaves the pen's click slop, catching up at once, and a
 * press that never left it is a click on empty field, as a tap there is (or,
 * held still for the long press time, the menus: {@link watchPenHold}).
 */
function attachPenPan(element: HTMLElement, editor: FieldEditor) {
    let pan: {
        id: number;
        press: FieldPointer;
        x: number;
        y: number;
        moved: boolean;
    } | null = null;
    const end = (panning: boolean) => {
        pan = null;
        if (panning) useFieldViewStore.setState({ panning: false });
    };
    return {
        start(event: PointerEvent, press: FieldPointer) {
            pan = {
                id: event.pointerId,
                press,
                x: event.clientX,
                y: event.clientY,
                moved: false,
            };
            element.setPointerCapture(event.pointerId);
        },
        /** Whether the move was the pan's */
        move(event: PointerEvent): boolean {
            if (pan?.id !== event.pointerId) return false;
            const dx = event.clientX - pan.x;
            const dy = event.clientY - pan.y;
            if (!pan.moved) {
                if (Math.hypot(dx, dy) < thresholdsFor("pen").moveThreshold)
                    return true;
                pan.moved = true;
                useFieldViewStore.setState({ panning: true });
            }
            pan.x = event.clientX;
            pan.y = event.clientY;
            const { width, height, zoom, panX, panY } =
                useFieldViewStore.getState();
            setView(panBy({ width, height, zoom, panX, panY }, dx, dy));
            return true;
        },
        /** Whether the release was the pan's */
        end(event: PointerEvent): boolean {
            if (pan?.id !== event.pointerId) return false;
            const { press, moved } = pan;
            end(moved);
            if (!moved) editor.fingerTap(press);
            return true;
        },
        /** Whether pointer `id`'s pan has left the click slop and moves the view */
        panning(id: number): boolean {
            return pan?.id === id && pan.moved;
        },
        cancel(event: PointerEvent) {
            if (pan?.id === event.pointerId) end(pan.moved);
        },
    };
}

/**
 * A pen's long press (tablet 1.5), by the same rule as a finger's
 * (`touchGestures.ts`, `GESTURE_TIMING`): a pen press the editor took that
 * stays within the long press slop arms once it has been down for the long
 * press time, and lifting it then, without having moved past the slop, asks
 * the editor for the menus a right-click there opens (`FieldEditor.longPress`).
 * The editor's press stays alive while armed: a pen that moves on after the
 * hold drags as usual. When a menu opens, the editor has given up its press
 * and the lift is nobody's; with no menu, the lift is an ordinary release.
 * Mouse presses are never timed.
 *
 * Decided from times read at the press and the lift, so moves handled late
 * can't make a moving pen look held.
 */
export function watchPenHold(
    editor: Pick<FieldEditor, "longPress">,
    pointer: (event: PointerEvent) => FieldPointer,
    now: () => number = () => performance.now(),
) {
    let held: { id: number; x: number; y: number; at: number } | null = null;
    const past = (event: PointerEvent, from: { x: number; y: number }) =>
        Math.hypot(event.clientX - from.x, event.clientY - from.y) >
        GESTURE_TIMING.longPressSlopPx;
    return {
        /** A press the editor took */
        down(event: PointerEvent) {
            held =
                event.pointerType === "pen" && event.button === 0
                    ? {
                          id: event.pointerId,
                          x: event.clientX,
                          y: event.clientY,
                          at: now(),
                      }
                    : null;
        },
        /** A move: past the slop, the press is a drag and never a long press */
        move(event: PointerEvent) {
            if (event.pointerId === held?.id && past(event, held)) held = null;
        },
        /** A lift; true when a long press opened a menu, so the lift is no one's */
        up(event: PointerEvent): boolean {
            if (event.pointerId !== held?.id) return false;
            const press = held;
            held = null;
            if (
                past(event, press) ||
                now() - press.at < GESTURE_TIMING.longPressMs
            )
                return false;
            return editor.longPress(pointer(event));
        },
        /** The pointer was lost: no long press */
        cancel(event: PointerEvent) {
            if (event.pointerId === held?.id) held = null;
        },
        stop() {
            held = null;
        },
    };
}

/**
 * Navigation captures right presses on the field's root, so their moves and
 * release don't reach the canvas: the editor hears them here (a right-click
 * clears the line tool's line, #203, or opens the menu, #315; a right-drag
 * that panned does neither). A Mac's Ctrl-press is a right press too (a
 * Line's point menu, #569). Only a right press that started on the field:
 * one from elsewhere (the timeline) moving over it isn't the field's. Returns
 * the detach.
 */
function listenForCapturedRightPresses(
    element: HTMLElement,
    editor: FieldEditor,
    pointer: (event: PointerEvent) => FieldPointer,
): () => void {
    /** The pointer and button of the right press the field saw, until its release. */
    let pressed: number | null = null;
    let button = 2;
    const down = (event: PointerEvent) => {
        if (fieldGesturesOwn(event)) return;
        const macCtrl = event.button === 0 && event.ctrlKey && isMacPlatform();
        if (event.button !== 2 && !macCtrl) return;
        pressed = event.pointerId;
        button = event.button;
    };
    const move = (event: PointerEvent) => {
        const held = button === 2 ? 2 : 1;
        if (event.pointerId !== pressed || !(event.buttons & held)) return;
        if (event.target === element) return;
        editor.pointerMove(pointer(event));
    };
    const up = (event: PointerEvent) => {
        if (event.pointerId !== pressed || event.button !== button) return;
        pressed = null;
        if (event.target === element) return;
        editor.pointerUp(pointer(event));
    };
    // A mouse keeps one pointer id: a press that never ends mustn't linger
    const cancel = (event: PointerEvent) => {
        if (event.pointerId === pressed) pressed = null;
    };
    element.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    return () => {
        element.removeEventListener("pointerdown", down);
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", cancel, true);
    };
}
