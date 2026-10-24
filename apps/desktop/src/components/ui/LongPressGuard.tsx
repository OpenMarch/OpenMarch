import { useCallback, useEffect, useRef, useState } from "react";
import { LONG_PRESS_MS, LongPressBubble } from "@openmarch/ui";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";

/** What the guard watches: things a tap activates. */
const PRESSABLE =
    'button, [role="button"], a[href], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"]';
/** Things with their own long press (or none worth explaining). */
const OWN_LONG_PRESS =
    '[data-own-long-press], canvas, input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]';
const SLOP_PX = 10;

/** A trailing " [⌘K]"-style shortcut in a title. */
const SHORTCUT_SUFFIX = /\s*\[[^\]]+\]\s*$/;

/** The element's accessible name, roughly: aria-label, labelledby, title, then its text. */
export function accessibleName(el: Element): string {
    const label = el.getAttribute("aria-label")?.trim();
    if (label) return label;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
        const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim();
        if (text) return text;
    }
    const title = el.getAttribute("title")?.trim();
    if (title) return title;
    // Text nodes joined with spaces: "In Place" + "Delete this page…" must not run together
    const parts: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (text) parts.push(text);
    }
    return parts.join(" ").replace(/\s+/g, " ").slice(0, 120);
}

/** The pressable element a long press on `target` would explain, if any. */
export function longPressTarget(
    target: EventTarget | null,
): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    if (target.closest(OWN_LONG_PRESS)) return null;
    const el = target.closest<HTMLElement>(PRESSABLE);
    if (!el) return null;
    if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true")
        return null;
    return el;
}

/**
 * App-wide: a long press with a finger or pen on any button explains it (its
 * name in a bubble) instead of activating it. A short tap works as usual.
 * Buttons with their own long press opt out with `data-own-long-press`
 * (ActionButton and the shared Button do, to show richer hints).
 * Mount once.
 */
export default function LongPressGuard() {
    const [hint, setHint] = useState<{
        anchor: HTMLElement;
        text: string;
    } | null>(null);
    const showHints = useShowShortcutHints();
    const showHintsRef = useRef(showHints);
    showHintsRef.current = showHints;
    const close = useCallback(() => setHint(null), []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let start: { x: number; y: number; id: number } | null = null;
        let swallowClick = false;
        let swallowExpiry: ReturnType<typeof setTimeout> | null = null;

        const cancel = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            start = null;
        };

        const onPointerDown = (event: PointerEvent) => {
            swallowClick = false;
            cancel();
            if (event.pointerType !== "touch" && event.pointerType !== "pen")
                return;
            if (event.button > 0) return;
            const el = longPressTarget(event.target);
            if (!el) return;
            start = { x: event.clientX, y: event.clientY, id: event.pointerId };
            timer = setTimeout(() => {
                timer = null;
                let text = accessibleName(el);
                // "Lock X movement [Y]": no keycaps on a tablet without a keyboard
                if (!showHintsRef.current)
                    text = text.replace(SHORTCUT_SUFFIX, "");
                if (!text) return;
                swallowClick = true;
                setHint({ anchor: el, text });
            }, LONG_PRESS_MS);
        };

        const onPointerMove = (event: PointerEvent) => {
            if (!start || event.pointerId !== start.id) return;
            if (
                Math.hypot(event.clientX - start.x, event.clientY - start.y) >
                SLOP_PX
            )
                cancel();
        };

        const onPointerEnd = () => {
            cancel();
            // The click follows the release at once; don't keep swallowing after it
            if (swallowClick) {
                if (swallowExpiry !== null) clearTimeout(swallowExpiry);
                swallowExpiry = setTimeout(() => {
                    swallowClick = false;
                }, 800);
            }
        };

        const onClick = (event: MouseEvent) => {
            if (!swallowClick) return;
            swallowClick = false;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };

        const onContextMenu = (event: MouseEvent) => {
            // Android's long-press menu: the hint replaces it on buttons
            if (timer !== null || swallowClick) event.preventDefault();
        };

        const opts = { capture: true } as const;
        document.addEventListener("pointerdown", onPointerDown, opts);
        document.addEventListener("pointermove", onPointerMove, opts);
        document.addEventListener("pointerup", onPointerEnd, opts);
        document.addEventListener("pointercancel", cancel, opts);
        document.addEventListener("click", onClick, opts);
        document.addEventListener("contextmenu", onContextMenu, opts);
        return () => {
            cancel();
            if (swallowExpiry !== null) clearTimeout(swallowExpiry);
            document.removeEventListener("pointerdown", onPointerDown, opts);
            document.removeEventListener("pointermove", onPointerMove, opts);
            document.removeEventListener("pointerup", onPointerEnd, opts);
            document.removeEventListener("pointercancel", cancel, opts);
            document.removeEventListener("click", onClick, opts);
            document.removeEventListener("contextmenu", onContextMenu, opts);
        };
    }, []);

    return (
        <LongPressBubble
            anchor={hint?.anchor ?? null}
            open={hint !== null}
            onClose={close}
        >
            {hint?.text}
        </LongPressBubble>
    );
}
