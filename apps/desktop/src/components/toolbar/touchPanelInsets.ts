import { useEffect, useState } from "react";

type Box = Pick<DOMRect, "left" | "right">;

/** Room between the panel and the field display bar */
const DISPLAY_BAR_GAP = 8;

export interface PanelInsets {
    left: number;
    right: number;
}

/**
 * Where the touch toolbar's panel may sit, as insets from its positioned parent (the workspace
 * column): over the field only, so the sidebar beside it stays reachable, and short of the
 * field display bar at the field's top right (Paths, Labels, Shapes), which stays tappable.
 * Without a field the panel spans the whole column.
 */
export function panelInsets(
    parent: Box,
    field: Box | null,
    displayBar: Box | null,
): PanelInsets {
    if (!field) return { left: 0, right: 0 };
    const left = Math.max(0, field.left - parent.left);
    const end = displayBar ? displayBar.left - DISPLAY_BAR_GAP : field.right;
    const right = Math.max(0, parent.right - Math.min(end, field.right));
    return { left, right };
}

const FIELD_SELECTOR = '[data-testid="threeField"]';
const DISPLAY_BAR_SELECTOR = '[data-testid="field-display-bar"]';

/**
 * `panelInsets` for `parent`, kept up to date while `active`: on window resizes, and when the
 * column, the field or the display bar change size (the inspector opening, the timeline split
 * moving).
 */
export function usePanelInsets(
    parent: HTMLElement | null,
    active: boolean,
): PanelInsets | null {
    const [insets, setInsets] = useState<PanelInsets | null>(null);
    useEffect(() => {
        if (!parent || !active) return;
        const measure = () => {
            const field = document.querySelector(FIELD_SELECTOR);
            const bar = document.querySelector(DISPLAY_BAR_SELECTOR);
            const next = panelInsets(
                parent.getBoundingClientRect(),
                field?.getBoundingClientRect() ?? null,
                bar?.getBoundingClientRect() ?? null,
            );
            setInsets((last) =>
                last?.left === next.left && last.right === next.right
                    ? last
                    : next,
            );
        };
        measure();
        const observer =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(measure)
                : null;
        observer?.observe(parent);
        for (const selector of [FIELD_SELECTOR, DISPLAY_BAR_SELECTOR]) {
            const element = document.querySelector(selector);
            if (element) observer?.observe(element);
        }
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [parent, active]);
    return insets;
}
