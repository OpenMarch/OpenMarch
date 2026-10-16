import { create } from "zustand";
import type { FieldSize, FieldView } from "@/field/editor/view";

export type { FieldView } from "@/field/editor/view";

/**
 * The new field's view store: the one shared view (ADR 0005 D-2.4). The WebGL
 * camera, the field test API and the SVG overlay all read it, so they can't
 * drift apart. Navigation (`fieldNavigation.ts`) writes it, following the
 * rules in `src/field/editor/view.ts`.
 */
export type FieldViewState = FieldView & {
    /**
     * The zoom shown as 100% in the zoom controls: the zoom the field was last
     * centered at. Kept, so resizing the panes doesn't change the percentage.
     */
    baseZoom: number;
    /** A right- or middle-drag pan is in progress. */
    panning: boolean;
    /** The size of the field shown, in field units, for the pan limit. */
    field: FieldSize;
};

/** A field point's position in the element, in CSS pixels. */
export function fieldToElement(
    view: FieldView,
    x: number,
    y: number,
): { x: number; y: number } {
    return { x: view.panX + x * view.zoom, y: view.panY + y * view.zoom };
}

/** The field point at a position in the element, in CSS pixels: the inverse of {@link fieldToElement}. */
export function elementToField(
    view: FieldView,
    x: number,
    y: number,
): { x: number; y: number } {
    return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
}

/**
 * The orthographic camera bounds, in field units, that draw `view`. `top` is
 * less than `bottom` because field y grows downward on screen.
 */
export function cameraBounds(view: FieldView) {
    const { width, height, zoom, panX, panY } = view;
    return {
        left: -panX / zoom,
        right: (width - panX) / zoom,
        top: -panY / zoom,
        bottom: (height - panY) / zoom,
    };
}

export const useFieldViewStore = create<FieldViewState>(() => ({
    width: 0,
    height: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    baseZoom: 1,
    panning: false,
    field: { width: 0, height: 0 },
}));
