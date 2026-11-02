import { LONG_PRESS_MS } from "@openmarch/ui";
import type { FieldEditor, FieldPointer } from "@/field/editor/fieldEditor";
import { isMacPlatform } from "@/shortcuts/platform";
import { elementToField, useFieldViewStore } from "./fieldView";

/**
 * Reports the pointer on the new field's canvas to the editor: positions on
 * the field and on screen, the button and the modifiers, nothing else (ADR
 * 0005 D-2). The editor decides what they do. Shows the editor's cursor.
 *
 * Touch is navigation's (#194): touch editing is out of scope, but a long
 * press asks the editor for a menu (#569). Returns the detach.
 */
export function attachFieldPointerInput(
    element: HTMLElement,
    editor: FieldEditor,
): () => void {
    const pointer = (event: PointerEvent): FieldPointer => {
        const rect = element.getBoundingClientRect();
        const screen = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
        const field = elementToField(
            useFieldViewStore.getState(),
            screen.x,
            screen.y,
        );
        return {
            field,
            screen,
            button: event.button,
            shift: event.shiftKey,
            alt: event.altKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
        };
    };

    /** The pointer the editor's press captured; other captures (navigation's) aren't its to cancel. */
    let captured: number | null = null;
    const down = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        if (!editor.pointerDown(pointer(event))) return;
        captured = event.pointerId;
        element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        editor.pointerMove(pointer(event));
    };
    const up = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        editor.pointerUp(pointer(event));
    };
    const cancel = (event: PointerEvent) => {
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
    const detachLong = listenForLongPresses(element, editor, pointer);
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
        detachLong();
        unsubscribe();
        editor.pointerCancel();
        element.style.cursor = "";
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
        if (event.pointerType === "touch") return;
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

/** How far a finger may wander (CSS px) and still be a long press */
const LONG_PRESS_SLOP = 10;

/**
 * A finger held still on the field for a moment asks the editor for a menu
 * (`longPress`: a Line's point menu, #569). A move past the slop, a second
 * finger or the release first is navigation's as before. Navigation captures
 * touches, so their moves and release are heard on the document. Returns the
 * detach.
 */
function listenForLongPresses(
    element: HTMLElement,
    editor: FieldEditor,
    pointer: (event: PointerEvent) => FieldPointer,
): () => void {
    let held: {
        id: number;
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
    } | null = null;
    const stop = () => {
        if (held) clearTimeout(held.timer);
        held = null;
    };
    const down = (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        // A second finger pinches
        if (held) return stop();
        const at = pointer(event);
        held = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            timer: setTimeout(() => {
                held = null;
                editor.longPress(at);
            }, LONG_PRESS_MS),
        };
    };
    const move = (event: PointerEvent) => {
        if (event.pointerId !== held?.id) return;
        const moved = Math.hypot(
            event.clientX - held.x,
            event.clientY - held.y,
        );
        if (moved > LONG_PRESS_SLOP) stop();
    };
    const end = (event: PointerEvent) => {
        if (event.pointerId === held?.id) stop();
    };
    element.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    return () => {
        stop();
        element.removeEventListener("pointerdown", down);
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", end, true);
        document.removeEventListener("pointercancel", end, true);
    };
}
