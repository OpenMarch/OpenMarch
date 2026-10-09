// cspell:ignore contenteditable

/**
 * Marks focus that arrived from a click with `data-click-focus`, which the `focus-visible:`
 * variant (styles/index.css) leaves without a ring. Chromium shows a clicked control's focus ring
 * at the next key press, so clicking the timeline and pressing Space to play would ring it. Focus
 * stays where it is; only the ring waits until the keyboard works the control itself. Chromium
 * already matches :focus-visible when a key goes down, so the source is noted when focus arrives.
 */
export const CLICK_FOCUS_ATTRIBUTE = "data-click-focus";

/** Keys that work the focused control (Tab moves focus on, so it counts too) */
const CONTROL_KEYS = new Set(["Tab", "Enter", "F2"]);

/** Controls whose keys act on them natively, so a key they get is always working them */
const KEYED_WIDGETS =
    'input, select, textarea, [contenteditable], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"], [role="spinbutton"]';

export const installClickFocusMarker = (win: Window = window) => {
    const doc = win.document;
    let marked: Element | null = null;
    let reachedWindow: KeyboardEvent | null = null;

    const unmark = () => {
        marked?.removeAttribute(CLICK_FOCUS_ATTRIBUTE);
        marked = null;
    };
    const onFocusIn = (event: FocusEvent) => {
        if (!(event.target instanceof Element)) return;
        // Still marked: focus left with the window and came back to it
        if (event.target === marked) return;
        unmark();
        if (
            !event.target.matches(":focus-visible") &&
            !event.target.matches(KEYED_WIDGETS)
        ) {
            marked = event.target;
            marked.setAttribute(CLICK_FOCUS_ATTRIBUTE, "");
        }
    };
    // Focus that leaves the marked control for the page takes the mark with it; focus that leaves
    // with the window keeps it. A removed control gets no focusout, and is let go at the next focus.
    const onFocusOut = (event: FocusEvent) => {
        if (event.target !== marked) return;
        const element = marked;
        win.setTimeout(() => {
            if (
                marked === element &&
                doc.activeElement !== element &&
                doc.hasFocus()
            )
                unmark();
        });
    };
    // A key the control keeps (a handle stepped by an arrow stops it) works the control: show
    // the ring. A key that reaches the window is a shortcut, Space to play above all: don't.
    const onKeyDownFirst = (event: KeyboardEvent) => {
        if (!marked || doc.activeElement !== marked || event.repeat) return;
        if (CONTROL_KEYS.has(event.key)) {
            unmark();
            return;
        }
        const element = marked;
        win.setTimeout(() => {
            if (reachedWindow !== event && marked === element) unmark();
        });
    };
    const onKeyDownLast = (event: KeyboardEvent) => {
        reachedWindow = event;
    };

    doc.addEventListener("focusin", onFocusIn, true);
    doc.addEventListener("focusout", onFocusOut, true);
    win.addEventListener("keydown", onKeyDownFirst, true);
    win.addEventListener("keydown", onKeyDownLast);
    return () => {
        unmark();
        doc.removeEventListener("focusin", onFocusIn, true);
        doc.removeEventListener("focusout", onFocusOut, true);
        win.removeEventListener("keydown", onKeyDownFirst, true);
        win.removeEventListener("keydown", onKeyDownLast);
    };
};
