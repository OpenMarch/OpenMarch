import { useEffect, useRef, type RefObject } from "react";

/**
 * Marks a popup that belongs to an open menu but is drawn outside it (an entry's reason tip): a
 * press on it is a press inside the menu.
 */
export const MENU_PART_ATTRIBUTE = "data-menu-part";

/** How long after a swallowed press its click may still come */
const CLICK_MS = 1000;

const isOutside = (target: EventTarget | null, menu: HTMLElement | null) =>
    target instanceof Node &&
    !(menu?.contains(target) ?? false) &&
    !(
        target instanceof Element &&
        target.closest(`[${MENU_PART_ATTRIBUTE}]`) !== null
    );

/**
 * While `open`, a finger's press outside the menu (`menuRef`) only closes it, as a mouse click
 * outside a menu does (#928). Nothing under the press hears it: not its press, its moves, its
 * release, the click after it, or the browser's own long-press `contextmenu`. So the tap neither
 * acts on the field or timeline behind the menu nor lands on an entry of whatever is under it
 * once the menu is gone, and a long press there opens no other menu.
 *
 * Radix closes a non-modal menu on a mouse's or pen's press outside it at once, but after a
 * finger's it waits for the click, and a surface that handles touch itself (the field) stops
 * that click, so the menu stayed open and the press went through. A mouse and a pen are left to
 * Radix, unchanged.
 */
export function useTouchPressOutside(
    open: boolean,
    menuRef: RefObject<HTMLElement | null>,
    onClose: () => void,
) {
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        if (!open) return;
        const onPress = (event: PointerEvent) => {
            if (event.pointerType !== "touch") return;
            if (!isOutside(event.target, menuRef.current)) return;
            // Not stopImmediatePropagation: other window listeners still hear it, such as an open
            // long-press bubble's, which closes on any press (as swallowPress leaves it)
            event.preventDefault();
            event.stopPropagation();
            followUp(event.pointerId);
            close.current();
        };
        window.addEventListener("pointerdown", onPress, { capture: true });
        return () =>
            window.removeEventListener("pointerdown", onPress, {
                capture: true,
            });
    }, [open, menuRef]);
}

/** The longest a held press is followed, should its release never come */
const HELD_MS = 10_000;

const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
};

/**
 * Swallows the rest of a press that closed a menu: its pointer's moves and release, the browser's
 * long-press `contextmenu`, and the click that follows the release. Outlives the menu, which
 * closes on the press. A cancelled press makes no click, and a key press means a later click is
 * the keyboard's, so either ends it (as in `LongPressGuard`); so does a new press once the finger
 * has lifted, whose click is its own. A second finger meanwhile doesn't.
 */
function followUp(pointerId: number) {
    const options = { capture: true } as const;
    const pointerTypes = ["pointermove", "pointerup", "pointercancel"] as const;
    let released = false;
    let timer = setTimeout(stop, HELD_MS);
    const onPointer = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        swallow(event);
        if (event.type === "pointermove") return;
        if (event.type === "pointercancel") return stop();
        // Released: its click comes at once, if at all
        released = true;
        for (const type of pointerTypes)
            window.removeEventListener(type, onPointer, options);
        clearTimeout(timer);
        timer = setTimeout(stop, CLICK_MS);
    };
    const onClick = (event: MouseEvent) => {
        swallow(event);
        stop();
    };
    const onNextPress = () => {
        if (released) stop();
    };
    function stop() {
        clearTimeout(timer);
        for (const type of pointerTypes)
            window.removeEventListener(type, onPointer, options);
        window.removeEventListener("click", onClick, options);
        window.removeEventListener("contextmenu", swallow, options);
        window.removeEventListener("pointerdown", onNextPress, options);
        window.removeEventListener("keydown", stop, options);
    }
    for (const type of pointerTypes)
        window.addEventListener(type, onPointer, options);
    window.addEventListener("click", onClick, options);
    window.addEventListener("contextmenu", swallow, options);
    window.addEventListener("pointerdown", onNextPress, options);
    window.addEventListener("keydown", stop, options);
}
