/**
 * Tempo mode: keeping the tempo lanes' text readable. Labels
 * are placed in order of importance and one that would overlap another is left out (or shortened),
 * and popovers are kept on the screen.
 */
import { useLayoutEffect, useState, type CSSProperties } from "react";

let measureContext: CanvasRenderingContext2D | null | undefined;

/** How wide `text` draws in `font` (a CSS font shorthand), in CSS pixels */
export function textWidth(text: string, font: string): number {
    if (measureContext === undefined)
        measureContext =
            typeof document === "undefined"
                ? null
                : document.createElement("canvas").getContext("2d");
    if (!measureContext) return text.length * 6;
    measureContext.font = font;
    return measureContext.measureText(text).width;
}

/** A label's box, in the band's coordinates */
export interface LabelBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Whether two boxes overlap or come closer than `gap` side to side */
const overlap = (a: LabelBox, b: LabelBox, gap: number) =>
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h;

/**
 * Places labels without overlaps: each `place` call takes the first of its boxes (the full text,
 * then shorter ones) that overlaps nothing placed so far, or none. Place the important labels
 * first.
 */
export function createLabelPlacer(obstacles: LabelBox[] = [], gap = 4) {
    const placed = [...obstacles];
    return {
        place(boxes: LabelBox[]): number {
            const index = boxes.findIndex((box) =>
                placed.every((other) => !overlap(box, other, gap)),
            );
            if (index >= 0) placed.push(boxes[index]!);
            return index;
        },
    };
}

/**
 * Where a popover anchored at (`x`, `y`) in the window goes so it stays on the screen: `above`
 * puts its bottom edge just over the anchor (below it when there's no room), `below` its top edge
 * at the anchor (above it when there's no room); near the right edge it opens to the anchor's left.
 * Measured before paint, so it never shows off the screen. `token` re-measures when the content
 * changes at the same anchor.
 */
export function useOnScreen(
    ref: React.RefObject<HTMLElement | null>,
    x: number,
    y: number,
    side: "above" | "below",
    token?: unknown,
): CSSProperties {
    const [position, setPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        const margin = 8;
        const maxLeft = window.innerWidth - width - margin;
        const maxTop = window.innerHeight - height - margin;
        // Near the right edge it opens left of the pointer rather than over it (sam)
        const flipped = x + width > window.innerWidth - margin ? x - width : x;
        const left = Math.max(margin, Math.min(flipped, maxLeft));
        let top: number;
        if (side === "above") {
            top = y - 8 - height;
            if (top < margin) top = y + 8;
        } else {
            top = y;
            if (top > maxTop) top = y - height;
        }
        top = Math.max(margin, Math.min(top, maxTop));
        setPosition((p) =>
            p && p.left === left && p.top === top ? p : { left, top },
        );
    }, [ref, x, y, side, token]);
    // Unmeasured, it is laid out but not seen (and still takes focus): measured before paint
    return position ?? { left: x, top: y, opacity: 0 };
}
