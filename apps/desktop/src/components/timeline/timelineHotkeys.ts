/**
 * Guards for the timeline's raw window key listeners (G, Shift+Z, Esc), which sit outside the
 * app's registered keyboard actions and so must check for themselves what owns the key.
 */

/**
 * A popover, menu or dialog is open: its keys (Esc above all) are its own, and nothing else's.
 * Tooltips share Radix's popper wrapper but take no keys, so a hovered tooltip doesn't count.
 */
export const overlayOpen = () =>
    Array.from(
        document.querySelectorAll("[data-radix-popper-content-wrapper]"),
    ).some((wrapper) => wrapper.querySelector('[role="tooltip"]') === null) ||
    document.querySelector(
        '[role="menu"], [role="dialog"][data-state="open"], [role="alertdialog"]',
    ) !== null;

/** The key goes to a text field */
export const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
