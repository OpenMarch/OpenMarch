import type React from "react";

/** Whether the app is laid out for touch (`<html data-input="touch">`, set by the desktop app). */
export const isTouchLayout = (): boolean =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.input === "touch";

const isNumeric = (input: HTMLInputElement) =>
    input.type === "number" ||
    input.inputMode === "numeric" ||
    input.inputMode === "decimal";

/**
 * In touch mode, a number field selects its whole value when it gains focus, so
 * typing replaces it: a finger can't easily drag-select "16" to type "8".
 * Returns an onFocus handler that calls `onFocus` too.
 */
export const selectNumberOnTouchFocus =
    (onFocus?: React.FocusEventHandler<HTMLInputElement>) =>
    (event: React.FocusEvent<HTMLInputElement>) => {
        onFocus?.(event);
        const input = event.currentTarget;
        if (!isTouchLayout() || !isNumeric(input)) return;
        input.select();
        // The tap's own mouseup/click can drop the selection; select again after it
        setTimeout(() => {
            if (document.activeElement === input) input.select();
        }, 0);
    };
