import type { ShortcutContext } from "./keymap";

const TEXT_INPUT_SELECTOR = [
    "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable=false])",
    "#sentry-feedback",
    "#__tolgee_dev_tools",
].join(", ");

// Content elements of Radix layers that can be modal: Dialog, AlertDialog, Popover, DropdownMenu, ContextMenu, Select.
const OPEN_MODAL_LAYER_SELECTOR = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
].join(", ");

export function readShortcutContext(
    baseScope: ShortcutContext["baseScope"],
): ShortcutContext {
    const active = document.activeElement;
    return {
        baseScope,
        inTextInput:
            active instanceof Element &&
            (active.matches(TEXT_INPUT_SELECTOR) ||
                active.closest("#sentry-feedback, #__tolgee_dev_tools") !==
                    null),
        // Radix sets pointer-events: none on <body> while a modal layer is open, but can leave it behind
        // when a layer unmounts while open. Require a live open layer too so a stale style can't block every shortcut.
        modalOpen:
            document.body.style.pointerEvents === "none" &&
            document.querySelector(OPEN_MODAL_LAYER_SELECTOR) !== null,
    };
}
