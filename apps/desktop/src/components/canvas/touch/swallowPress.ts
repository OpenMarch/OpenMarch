/**
 * Swallows the rest of a press (its moves, release and click), e.g. the tap
 * that closes a pop-up or an explanation bubble, so it doesn't also act on
 * what is under it.
 */
export function swallowPress(pointerId: number) {
    const stop = (e: Event) => {
        if (
            (e as PointerEvent).pointerId !== undefined &&
            (e as PointerEvent).pointerId !== pointerId &&
            e.type !== "click"
        )
            return;
        e.stopPropagation();
        e.preventDefault();
    };
    const types = ["pointermove", "pointerup", "pointercancel", "click"];
    for (const t of types) window.addEventListener(t, stop, true);
    const done = () => {
        for (const t of types) window.removeEventListener(t, stop, true);
    };
    // The click follows the release; give it a moment
    const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        setTimeout(done, 350);
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
}

/**
 * While a long-press explanation bubble is open anywhere, a press on the field
 * only closes it: the field doesn't see it. Returns the stop.
 */
export function startBubbleDismissGuard(
    field: () => Element | null,
): () => void {
    const onDown = (e: PointerEvent) => {
        if (!document.querySelector('[data-testid="long-press-bubble"]'))
            return;
        const target = e.target as Node | null;
        const fieldEl = field();
        if (!fieldEl || !target || !fieldEl.contains(target)) return;
        // Not stopImmediatePropagation: the bubble's own listener still closes it
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        swallowPress(e.pointerId);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
}
