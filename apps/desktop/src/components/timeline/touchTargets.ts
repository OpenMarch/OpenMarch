/**
 * Finger-sized hit area for small icon buttons in touch mode (>= 44px).
 * Only `touch:` classes, so the mouse layout is unchanged.
 */
export const TOUCH_TARGET_CLASS =
    "touch:inline-flex touch:min-h-44 touch:min-w-44 touch:items-center touch:justify-center";

/** A finger's target: at least this many pixels each way (tablet parity, section 2) */
export const TOUCH_HIT_SIZE = 44;

/**
 * The timeline's small drag targets (flags, page flag grips, clip edges, the ⋯ chip, hold edges,
 * keyframes, loop ends, tablet plan 3.3) get an invisible hit area in touch mode: a span inside the
 * target, marked `data-touch-hit`, so a press on it goes to the target's own handlers. This class
 * centers it on the target and makes it at least 44px each way. It only shows in the touch layout
 * (`touch:block`), so mouse hit areas don't change.
 */
export const TOUCH_HIT_AREA_CLASS =
    "pointer-events-auto absolute top-1/2 left-1/2 hidden h-full min-h-44 w-full min-w-44 -translate-x-1/2 -translate-y-1/2 touch:block";

/** A rectangle in client pixels */
export interface TouchRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

/** A target whose hit area contains or is near a press (see {@link pickTouchTarget}) */
export interface TouchHitCandidate<K> {
    readonly key: K;
    /** Its hit area */
    readonly hit: TouchRect;
    /** The target as drawn (the grip, the edge handle, the flag's stem): distance is to this */
    readonly drawn: TouchRect;
    /** Part of the selected object (the selected clip's edges and ⋯, the selected page's grips) */
    readonly selected: boolean;
    /** The object it belongs to, such as its clip (`data-touch-group`) */
    readonly group?: string;
    /**
     * The press is right on the target, where a mouse would hit it (its own button, or its mark
     * as drawn). Without it, only a press on `drawn` counts
     */
    readonly on?: boolean;
}

const contains = (rect: TouchRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** How far a point is from a rectangle: 0 inside it */
export const distanceToRect = (rect: TouchRect, x: number, y: number) =>
    Math.hypot(
        Math.max(rect.left - x, 0, x - rect.right),
        Math.max(rect.top - y, 0, y - rect.bottom),
    );

/**
 * Which target a finger's press at (`x`, `y`) belongs to, where hit areas overlap (tablet plan
 * 3.3). Of the targets whose hit area holds the press:
 *
 * 1. A target the press is right on (`on`) wins, as it would for a mouse: of those, the nearest
 *    mark, then the one on top. So where the start flag's line or the playhead sits on the selected
 *    clip's end, a finger right on the line takes the line (UI-21), as a mouse does.
 * 2. A press on an object that keeps its presses (`keep`: a clip's body or another control under
 *    the hit areas, named by its group) stays that object's, unless it's on one of that object's
 *    own targets. So a finger on a clip selects or moves that clip, even inside the playhead's or
 *    the selected clip's hit areas over it, while the clip's own edges reach inside it.
 * 3. A target of the selected object wins.
 * 4. Then the nearest target as drawn.
 * 5. Then the one on top (later in `candidates`, which is paint order).
 *
 * Returns null when no target takes the press: it goes where it landed.
 */
export function pickTouchTarget<K>(
    x: number,
    y: number,
    candidates: readonly TouchHitCandidate<K>[],
    keep?: string,
): K | null {
    type Ranked = { key: K; on: boolean; selected: boolean; distance: number };
    let best: Ranked | null = null;
    // Better than `than`: right on it first, then (off every target) selected, then nearest; a
    // tie goes to the later one, on top
    const beats = (a: Ranked, than: Ranked) => {
        if (a.on !== than.on) return a.on;
        if (!a.on && a.selected !== than.selected) return a.selected;
        return a.distance <= than.distance;
    };
    for (const candidate of candidates) {
        if (!contains(candidate.hit, x, y)) continue;
        const distance = distanceToRect(candidate.drawn, x, y);
        const on = candidate.on ?? distance === 0;
        if (keep !== undefined && candidate.group !== keep && !on) continue;
        const ranked = {
            key: candidate.key,
            on,
            selected: candidate.selected,
            distance,
        };
        if (best === null || beats(ranked, best)) best = ranked;
    }
    return best?.key ?? null;
}

/**
 * How far a clip edge's hit area reaches into the clip, of {@link TOUCH_HIT_SIZE}: half of it, but
 * at most a third of the clip, so the middle third of a short clip still moves it. Never less than
 * the drawn handle. The rest reaches out past the clip's end.
 */
export const clipEdgeHitInside = (clipWidth: number, handleWidth: number) =>
    Math.max(
        handleWidth,
        Math.min(TOUCH_HIT_SIZE / 2, Math.floor(clipWidth / 3)),
    );

/**
 * Where a dragged target is drawn relative to a finger: a finger's press may land up to 22px off
 * a target (its hit area), and a drag that puts the target where the pointer is would jump it
 * there. So a finger's drag keeps the offset it was grabbed at: add this to each `clientX`. So
 * does a pen in the touch layout, where the widened hit areas take it too. A mouse's press (and a
 * pen's in the mouse layout) is on the target, and keeps 0, as before.
 */
export const touchGrabOffset = (
    pointerType: string,
    pressClientX: number,
    drawnClientX: number,
    touchLayout: boolean = isTouchLayout(),
) =>
    pointerType === "touch" || (pointerType === "pen" && touchLayout)
        ? drawnClientX - pressClientX
        : 0;

/** Whether the interface is laid out for touch (`<html data-input="touch">`, `InputModeStore`) */
export const isTouchLayout = () =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.input === "touch";

/** The horizontal center of an element on screen */
export const centerClientX = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.left + rect.width / 2;
};
