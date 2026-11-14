import { useCallback, useEffect, useRef, useState } from "react";
import { LONG_PRESS_MS, LongPressBubble } from "@openmarch/ui";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import Shortcut from "@/components/ui/Shortcut";
import type { ActionId } from "@/shortcuts/definitions";
import { TIP_DATA } from "./Tip";

/** What the guard watches: things a tap activates. */
const PRESSABLE =
    'button, [role="button"], a[href], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"]';
/** Things with their own long press (or none worth explaining). */
const OWN_LONG_PRESS =
    '[data-own-long-press], canvas, input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]';
/** A menu entry that can't run now, with the reason as its Tip label */
const UNAVAILABLE_MENU_ITEM = `[role^="menuitem"][aria-disabled="true"][${TIP_DATA.label}]`;
const SLOP_PX = 10;
/** How long after the release the click that follows is still swallowed. */
const SWALLOW_MS = 700;
/** The longest a fired hint swallows a click without a release (a press held on). */
const MAX_SWALLOW_MS = 10_000;

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

const isDisabled = (el: Element) =>
    el.matches(":disabled") || el.getAttribute("aria-disabled") === "true";

/** The pressable elements `el` is or holds. */
const controlsIn = (el: Element): Element[] =>
    el.matches(PRESSABLE) ? [el] : [...el.querySelectorAll(PRESSABLE)];

/** What a long press explains: the control to anchor the bubble on, and the `Tip` it reads, if any. */
export type LongPressTarget = { anchor: HTMLElement; tip: HTMLElement | null };

/**
 * The `Tip` explaining `control`: on the control itself, or on a wrapper around it and nothing
 * else that can be pressed (a disabled control's Tip sits on a wrapper, as it gets no hover).
 */
function tipFor(control: Element, start: Element): HTMLElement | null {
    const tip = start.closest<HTMLElement>(`[${TIP_DATA.label}]`);
    if (!tip) return null;
    const controls = controlsIn(tip);
    return controls.length === 1 && controls[0] === control ? tip : null;
}

/**
 * What a long press on `target` would explain, if anything: an enabled pressable element (with
 * its `Tip`, if it has one), or a disabled one that has a `Tip` saying why it's off. A disabled
 * control without a Tip says nothing, as before. Menus have their own long press, except an
 * unavailable entry with its reason in a Tip label, which shows the reason.
 */
export function longPressTarget(
    target: EventTarget | null,
): LongPressTarget | null {
    if (!(target instanceof Element)) return null;
    // A menu has its own long press, but an unavailable entry that gives its reason in a Tip's
    // label (the timeline menus' entries with a ?, #928) explains itself as a disabled control does
    const item = target.closest<HTMLElement>(UNAVAILABLE_MENU_ITEM);
    if (item) return { anchor: item, tip: item };
    const el = target.closest<HTMLElement>(PRESSABLE);
    const own = target.closest(OWN_LONG_PRESS);
    if (el && !isDisabled(el)) {
        if (own) return null;
        return { anchor: el, tip: tipFor(el, el) };
    }
    // A disabled control can't run its own long press. With pointer-events off (ActionButton),
    // the press lands on the wrapper its Tip sits on instead.
    if (own && own !== el) return null;
    const start = el ?? target;
    const tip = start.closest<HTMLElement>(`[${TIP_DATA.label}]`);
    if (!tip) return null;
    const controls = controlsIn(tip);
    if (controls.length !== 1) return null;
    const control = controls[0]!;
    if (el ? control !== el : !isDisabled(control)) return null;
    return { anchor: tip, tip };
}

/** What the bubble says. */
export type LongPressHint = {
    label: string;
    /** The Tip's second line */
    hint?: string;
    action?: ActionId;
    /** A binding of keys that aren't an action */
    shortcut?: string;
};

/**
 * The bubble's words for `target`: its Tip's label, shortcut and hint line where it has a Tip,
 * as the tooltip shows them with a mouse, or else its accessible name. Keycaps only once a
 * keyboard has been seen.
 */
export function longPressHint(
    { anchor, tip }: LongPressTarget,
    showShortcuts: boolean,
): LongPressHint | null {
    if (tip) {
        const label = tip.getAttribute(TIP_DATA.label)?.trim() ?? "";
        if (!label) return null;
        const hint = tip.getAttribute(TIP_DATA.hint)?.trim() || undefined;
        const action = (tip.getAttribute(TIP_DATA.action) || undefined) as
            | ActionId
            | undefined;
        const shortcut = tip.getAttribute(TIP_DATA.shortcut) || undefined;
        return {
            label,
            hint,
            ...(showShortcuts && action ? { action } : {}),
            ...(showShortcuts && !action && shortcut ? { shortcut } : {}),
        };
    }
    let label = accessibleName(anchor);
    // "Lock X movement [Y]": no keycaps on a tablet without a keyboard
    if (!showShortcuts) label = label.replace(SHORTCUT_SUFFIX, "");
    return label ? { label } : null;
}

/**
 * App-wide: a long press with a finger or pen on any button explains it (its
 * name in a bubble) instead of activating it. A short tap works as usual.
 * A control with a `Tip` shows what the tooltip would: its label, shortcut and
 * hint line. A disabled control shows the reason its wrapper's Tip gives.
 * Buttons with their own long press opt out with `data-own-long-press`
 * (ActionButton and the shared Button do, to show richer hints).
 * Mount once.
 */
export default function LongPressGuard() {
    const [hint, setHint] = useState<
        (LongPressHint & { anchor: HTMLElement }) | null
    >(null);
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

        const stopSwallowing = () => {
            swallowClick = false;
            if (swallowExpiry !== null) clearTimeout(swallowExpiry);
            swallowExpiry = null;
        };

        const onPointerDown = (event: PointerEvent) => {
            swallowClick = false;
            cancel();
            if (event.pointerType !== "touch" && event.pointerType !== "pen")
                return;
            if (event.button > 0) return;
            const target = longPressTarget(event.target);
            if (!target) return;
            start = { x: event.clientX, y: event.clientY, id: event.pointerId };
            timer = setTimeout(() => {
                timer = null;
                const content = longPressHint(target, showHintsRef.current);
                if (!content) return;
                swallowClick = true;
                // In any case, stop swallowing soon after the finger lifts (or
                // this long after the hint if no release ever arrives)
                if (swallowExpiry !== null) clearTimeout(swallowExpiry);
                swallowExpiry = setTimeout(stopSwallowing, MAX_SWALLOW_MS);
                setHint({ ...content, anchor: target.anchor });
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
                swallowExpiry = setTimeout(stopSwallowing, SWALLOW_MS);
            }
        };

        // iOS ends a long press with pointercancel and sends no click: nothing to
        // swallow, and a later keyboard click (Enter/Space) must go through
        const onPointerCancel = () => {
            cancel();
            stopSwallowing();
        };
        const onKeyDown = () => stopSwallowing();

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
        document.addEventListener("pointercancel", onPointerCancel, opts);
        document.addEventListener("keydown", onKeyDown, opts);
        document.addEventListener("click", onClick, opts);
        document.addEventListener("contextmenu", onContextMenu, opts);
        return () => {
            cancel();
            if (swallowExpiry !== null) clearTimeout(swallowExpiry);
            document.removeEventListener("pointerdown", onPointerDown, opts);
            document.removeEventListener("pointermove", onPointerMove, opts);
            document.removeEventListener("pointerup", onPointerEnd, opts);
            document.removeEventListener(
                "pointercancel",
                onPointerCancel,
                opts,
            );
            document.removeEventListener("keydown", onKeyDown, opts);
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
            {hint && (
                <>
                    <span className="flex items-center gap-8">
                        <span>{hint.label}</span>
                        {hint.action ? (
                            <Shortcut action={hint.action} />
                        ) : (
                            hint.shortcut && (
                                <Shortcut binding={hint.shortcut} />
                            )
                        )}
                    </span>
                    {hint.hint && (
                        <span
                            className="text-text-subtitle text-sub block"
                            data-testid="long-press-hint-line"
                        >
                            {hint.hint}
                        </span>
                    )}
                </>
            )}
        </LongPressBubble>
    );
}
