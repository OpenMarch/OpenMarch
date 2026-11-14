import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * One placement rule for what floats over the field in the touch layout (#927). Each layer says
 * what it is with `data-field-layer`:
 *
 * - `task`: a bar or card that holds the current task's buttons and stays where it is: the line
 *   and prop tools' cards, the isolation bar, the "Editing Page N's move" line. It always wins.
 * - `mover`: a task bar that moves itself clear of the controls and covers instead of making them
 *   move: the shape editor bar, which follows its shape.
 * - `info`: a line that only says something, with no buttons: the "Editing …" line. The pill's
 *   automatic spot keeps off it, but a spot the user chose doesn't give way to it.
 * - `control`: a fixed control over the field's edge: the zoom box, the Inspector's edge tab, the
 *   field display bar.
 * - `cover`: the touch toolbar's panel over the top of the field.
 *
 * Who keeps clear of whom:
 * - the modifier pill keeps clear of everything else (`PILL_AVOIDS`),
 * - the zoom box rises above `task` layers, and once rising, above other controls it meets too
 *   (`liftClear`),
 * - a `mover` keeps clear of controls and covers (`MOVER_AVOIDS`, `clearSpot`),
 * - layers at the field's top sit below a cover (`coverInset`, the `--field-top-inset` variable
 *   on the field).
 *
 * Desktop has no pill, panel or touch rules, so nothing there changes.
 */

export type FieldLayerKind = "task" | "mover" | "info" | "control" | "cover";

export const FIELD_LAYER_ATTRIBUTE = "data-field-layer";
/** The CSS variable on the field: how far a cover reaches down over its top, in px */
export const FIELD_TOP_INSET_VARIABLE = "--field-top-inset";

export const PILL_AVOIDS: readonly FieldLayerKind[] = [
    "task",
    "mover",
    "info",
    "control",
    "cover",
];
/** What moves the pill off a spot the user chose; it comes back once they're gone */
export const SAVED_PILL_YIELDS_TO: readonly FieldLayerKind[] = [
    "task",
    "mover",
    "cover",
];
export const MOVER_AVOIDS: readonly FieldLayerKind[] = ["control", "cover"];
export const ZOOM_AVOIDS: readonly FieldLayerKind[] = ["task"];
/** Once it rises, also the other controls it meets on the way (the Inspector's tab) */
export const ZOOM_RISING_AVOIDS: readonly FieldLayerKind[] = [
    "task",
    "control",
];

/** Room kept between two layers */
export const LAYER_GAP = 8;

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Whether two boxes overlap, with `gap` kept between them */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
    return (
        a.left < b.left + b.width + gap &&
        b.left < a.left + a.width + gap &&
        a.top < b.top + b.height + gap &&
        b.top < a.top + a.height + gap
    );
}

/** Moving up or down costs this much more than sideways: a bar under a shape slides along first */
const VERTICAL_COST = 4;

/**
 * Where `rect` goes to keep clear of `obstacles` (with `gap` between) inside `bounds`: where it is
 * when nothing is in the way, else the nearest spot that is clear, trying beside and above or
 * below each obstacle in the way, sideways preferred, kept inside `bounds` along each way it moves.
 * With no clear spot it stays where it is, and `clear` is false.
 */
export function clearSpot(
    rect: Rect,
    obstacles: readonly Rect[],
    bounds: Rect,
    gap = LAYER_GAP,
): { left: number; top: number; clear: boolean } {
    // Inside `bounds` along each way it moved (a bar already past an edge can still slide along it)
    const inside = (r: Rect) =>
        (r.left === rect.left ||
            (r.left >= bounds.left &&
                r.left + r.width <= bounds.left + bounds.width)) &&
        (r.top === rect.top ||
            (r.top >= bounds.top &&
                r.top + r.height <= bounds.top + bounds.height));
    const clear = (r: Rect) => !obstacles.some((o) => overlaps(r, o, gap));
    if (clear(rect)) return { left: rect.left, top: rect.top, clear: true };
    // Each obstacle's four sides, then the same again from those (two obstacles side by side)
    let spots: Rect[] = [rect];
    const tried: Rect[] = [];
    for (let round = 0; round < 2; round++) {
        const next: Rect[] = [];
        for (const spot of spots)
            for (const o of obstacles) {
                if (!overlaps(spot, o, gap)) continue;
                next.push(
                    { ...spot, left: o.left - gap - spot.width },
                    { ...spot, left: o.left + o.width + gap },
                    { ...spot, top: o.top - gap - spot.height },
                    { ...spot, top: o.top + o.height + gap },
                );
            }
        tried.push(...next);
        spots = next;
    }
    let best: Rect | null = null;
    let bestCost = Infinity;
    for (const spot of tried) {
        if (!inside(spot) || !clear(spot)) continue;
        const cost =
            Math.abs(spot.left - rect.left) +
            VERTICAL_COST * Math.abs(spot.top - rect.top);
        if (cost < bestCost) {
            best = spot;
            bestCost = cost;
        }
    }
    return best
        ? { left: best.left, top: best.top, clear: true }
        : { left: rect.left, top: rect.top, clear: false };
}

/**
 * How far `rect` (the zoom box, at its usual spot) rises to keep clear of `obstacles`, staying
 * below `top`: 0 when nothing is in the way, `null` when there's no room above them.
 */
export function liftClear(
    rect: Rect,
    obstacles: readonly Rect[],
    top: number,
    gap = LAYER_GAP,
): number | null {
    let lift = 0;
    // Each rise can bring it onto another obstacle higher up
    for (let i = 0; i <= obstacles.length; i++) {
        const at = { ...rect, top: rect.top - lift };
        const hit = obstacles.filter((o) => overlaps(at, o, gap));
        if (hit.length === 0) return at.top >= top ? lift : null;
        const highest = Math.min(...hit.map((o) => o.top));
        lift = rect.top - (highest - gap - rect.height);
    }
    return null;
}

/**
 * How far a cover reaches down over the top of `field`: what layers at the field's top move down
 * by. Nothing when it doesn't overlap the field side to side.
 */
export function coverInset(field: Rect, covers: readonly Rect[]): number {
    let inset = 0;
    for (const c of covers) {
        if (c.width <= 0 || c.height <= 0) continue;
        if (
            c.left >= field.left + field.width ||
            field.left >= c.left + c.width
        )
            continue;
        inset = Math.max(inset, c.top + c.height - field.top);
    }
    return Math.max(0, Math.round(inset));
}

/** The shown layers of `kinds`, in `parent`'s pixels (top-left origin) */
export function fieldLayersIn(
    parent: Element,
    kinds: readonly FieldLayerKind[],
    except?: Element | null,
): Rect[] {
    const at = parent.getBoundingClientRect();
    const rects: Rect[] = [];
    const selector = kinds
        .map((kind) => `[${FIELD_LAYER_ATTRIBUTE}="${kind}"]`)
        .join(",");
    for (const el of document.querySelectorAll(selector)) {
        if (except && (el === except || except.contains(el))) continue;
        const box = el.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        // A layer with no room to show (the zoom box) is out of the way
        if (getComputedStyle(el).visibility === "hidden") continue;
        rects.push({
            left: box.left - at.left,
            top: box.top - at.top,
            width: box.width,
            height: box.height,
        });
    }
    return rects;
}

// Change notes: a layer appearing, going, changing size or settling somewhere new. Batched to a
// frame, so many notes in a row place things once.
const listeners = new Set<() => void>();
let pending = false;

export function noteFieldLayersChanged() {
    if (pending) return;
    pending = true;
    const run = () => {
        pending = false;
        for (const listener of [...listeners]) listener();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
}

export function subscribeFieldLayers(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/**
 * A ref for a floating layer's element that notes when it appears, goes and (unless
 * `watchSize` is false) changes size, so the layers that keep clear of it are placed again. A
 * line whose words change on every scrubbed beat doesn't watch its size, so the pill isn't placed
 * again on every beat.
 */
export function useFieldLayerRef<T extends Element>({
    watchSize = true,
}: { watchSize?: boolean } = {}): (el: T | null) => void {
    const observer = useRef<ResizeObserver | null>(null);
    useEffect(
        () => () => {
            observer.current?.disconnect();
        },
        [],
    );
    return useCallback(
        (el: T | null) => {
            observer.current?.disconnect();
            observer.current = null;
            if (el && watchSize && typeof ResizeObserver === "function") {
                observer.current = new ResizeObserver(noteFieldLayersChanged);
                observer.current.observe(el);
            }
            noteFieldLayersChanged();
        },
        [watchSize],
    );
}

/**
 * Keeps `--field-top-inset` on `field` at how far a cover (the touch toolbar's panel) reaches over
 * its top, so the layers at the field's top sit below it.
 */
export function useFieldTopInset(fieldRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const field = fieldRef.current;
        if (!field) return;
        let last = -1;
        const measure = () => {
            const box = field.getBoundingClientRect();
            const inset = coverInset(
                { left: 0, top: 0, width: box.width, height: box.height },
                fieldLayersIn(field, ["cover"]),
            );
            if (inset === last) return;
            last = inset;
            field.style.setProperty(FIELD_TOP_INSET_VARIABLE, `${inset}px`);
            // The layers at the top moved
            noteFieldLayersChanged();
        };
        measure();
        const off = subscribeFieldLayers(measure);
        window.addEventListener("resize", measure);
        return () => {
            off();
            window.removeEventListener("resize", measure);
            field.style.removeProperty(FIELD_TOP_INSET_VARIABLE);
        };
    }, [fieldRef]);
}
