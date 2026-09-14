import type { ShortcutContext } from "./keymap";

const TEXT_INPUT_SELECTOR = [
    "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable=false])",
    "#sentry-feedback",
    "#__tolgee_dev_tools",
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
        // Radix sets pointer-events: none on <body> while a modal Dialog, AlertDialog or DropdownMenu is open.
        modalOpen: document.body.style.pointerEvents === "none",
    };
}
