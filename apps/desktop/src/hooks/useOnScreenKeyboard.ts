// cspell:words geometrychange
import { useEffect } from "react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { isWebBuild } from "@/utilities/webBuild";

/**
 * Keeps the text field being typed in visible above a tablet's on-screen
 * keyboard.
 *
 * In touch mode, when a text field gets focus, it waits for the keyboard to
 * open (the visual viewport shrinks, or the VirtualKeyboard API reports its
 * size), then scrolls the field to the middle of what is still visible if
 * the keyboard covers it.
 *
 * In Electron (Windows tablets) the keyboard is told to overlay the page, so
 * its size is known; `.app-frame` (src/styles/index.css) pads the app by
 * `env(keyboard-inset-height)` so the layout ends above it. Browsers keep
 * their own handling (Safari and Chrome shrink the visual viewport), which
 * this only completes.
 */

interface VirtualKeyboardLike extends EventTarget {
    overlaysContent: boolean;
    boundingRect: DOMRect;
}

const virtualKeyboard = (): VirtualKeyboardLike | undefined =>
    (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike })
        .virtualKeyboard;

/** Whether typing into `element` opens the on-screen keyboard. */
export function isTextEntry(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    if (element instanceof HTMLTextAreaElement) return !element.readOnly;
    if (element instanceof HTMLInputElement) {
        if (element.readOnly || element.disabled) return false;
        return !NON_TEXT_INPUTS.has(element.type);
    }
    return false;
}

const NON_TEXT_INPUTS = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
]);

/** The part of the window, top to bottom in CSS pixels, not under the keyboard. */
export interface VisibleBand {
    top: number;
    bottom: number;
}

/**
 * What is visible: the visual viewport, cut off at the top of a keyboard
 * that overlays the page (`keyboardTop`, or null when there's none).
 */
export function visibleBand(
    viewport: { offsetTop: number; height: number },
    keyboardTop: number | null,
): VisibleBand {
    const bottom = viewport.offsetTop + viewport.height;
    return {
        top: viewport.offsetTop,
        bottom: keyboardTop === null ? bottom : Math.min(bottom, keyboardTop),
    };
}

/** Whether a field at `rect` is not wholly inside `band`. */
export function isHidden(
    rect: { top: number; bottom: number },
    band: VisibleBand,
): boolean {
    return rect.bottom > band.bottom || rect.top < band.top;
}

function currentBand(): VisibleBand {
    const viewport = window.visualViewport ?? {
        offsetTop: 0,
        height: window.innerHeight,
    };
    const keyboard = virtualKeyboard()?.boundingRect;
    return visibleBand(
        viewport,
        keyboard && keyboard.height > 0 ? keyboard.top : null,
    );
}

/** How long to wait for a keyboard that never says it opened. */
const KEYBOARD_WAIT_MS = 400;

export function useOnScreenKeyboard() {
    const isTouchMode = useIsTouchMode();

    useEffect(() => {
        // Electron only: a browser tab that overlays the keyboard would lose
        // the browser's own scrolling to the field.
        const keyboard = virtualKeyboard();
        if (!isWebBuild && keyboard) keyboard.overlaysContent = true;
    }, []);

    useEffect(() => {
        if (!isTouchMode) return;
        let field: HTMLElement | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const reveal = () => {
            clearTimeout(timer);
            const target = field;
            if (!target || document.activeElement !== target) return;
            // After the layout has followed the keyboard
            requestAnimationFrame(() => {
                if (isHidden(target.getBoundingClientRect(), currentBand()))
                    target.scrollIntoView({
                        block: "center",
                        inline: "nearest",
                    });
            });
        };
        const onFocusIn = (event: FocusEvent) => {
            const target = event.target as Element | null;
            if (!isTextEntry(target)) return;
            field = target;
            clearTimeout(timer);
            // Also when the keyboard is already open (moving between fields)
            timer = setTimeout(reveal, KEYBOARD_WAIT_MS);
        };
        const onFocusOut = () => {
            field = null;
            clearTimeout(timer);
        };

        const keyboard = virtualKeyboard();
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
        window.visualViewport?.addEventListener("resize", reveal);
        keyboard?.addEventListener("geometrychange", reveal);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
            window.visualViewport?.removeEventListener("resize", reveal);
            keyboard?.removeEventListener("geometrychange", reveal);
        };
    }, [isTouchMode]);
}
