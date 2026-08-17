import { fabric } from "fabric";
import type MarcherPage from "@/global/classes/MarcherPage";
import type {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";
import { resolvePropsForPage } from "@/global/classes/propSelectors";
import CanvasProp from "./CanvasProp";

/**
 * Props keyed by their marcher id — the same shape as `canvasMarchersById` in
 * the export paths, so the two read as siblings.
 */
export type CanvasPropsById = Record<number, CanvasProp>;

/**
 * Display concerns that only the interactive canvas cares about. All optional,
 * so export callers omit the whole object and get plain props.
 */
export interface PropDisplayOptions {
    /** Prop ids (as strings) the user has toggled out of view. */
    hiddenPropIds?: Record<string, boolean>;
    /** Whether this prop's name label should be shown. */
    showNameFor?: (prop: PropWithMarcher) => boolean;
    /** The cached background image for this prop, if it has one. */
    imageFor?: (prop: PropWithMarcher) => HTMLImageElement | undefined;
}

export interface AddPropsToCanvasArgs {
    canvas: fabric.Canvas | fabric.StaticCanvas;
    props: PropWithMarcher[];
    geometries: DatabasePropPageGeometry[];
    /** The marcher_pages for the page being rendered. */
    marcherPages: MarcherPage[] | Record<number, MarcherPage>;
    pixelsPerFoot: number;
    /** The page the coordinates belong to. */
    pageId?: number;
    display?: PropDisplayOptions;
}

/** A prop's on-canvas label: its name, or drill number as a fallback. */
export const propDisplayName = (prop: PropWithMarcher): string =>
    prop.marcher.name ||
    `${prop.marcher.drill_prefix}${prop.marcher.drill_order}`;

/**
 * Builds a CanvasProp for every prop on a page and adds it to the canvas.
 *
 * This is the single place a CanvasProp gets constructed for display. The
 * interactive canvas, the SVG exporter and the video exporter previously each
 * ran their own copy of this loop, which drifted twice: video export shipped
 * without rendering props at all, and a later schema change had to be applied
 * in three places.
 *
 * Returns the created props keyed by marcher id, for the caller to hold onto
 * and hand back to {@link removePropsFromCanvas}.
 */
export function addPropsToCanvas({
    canvas,
    props,
    geometries,
    marcherPages,
    pixelsPerFoot,
    pageId,
    display,
}: AddPropsToCanvasArgs): CanvasPropsById {
    const canvasPropsById: CanvasPropsById = {};
    const resolved = resolvePropsForPage({ props, geometries, marcherPages });

    for (const { prop, marcherPage, geometry } of resolved) {
        if (display?.hiddenPropIds?.[prop.id.toString()]) continue;

        const showName = display?.showNameFor?.(prop) ?? false;
        const canvasProp = new CanvasProp({
            marcher: prop.marcher,
            prop,
            geometry,
            coordinate: { x: marcherPage.x, y: marcherPage.y },
            pixelsPerFoot,
            pageId,
            showName,
            imageElement: display?.imageFor?.(prop),
            imageOpacity: prop.image_opacity,
        });

        canvas.add(canvasProp);
        // The label is a sibling object on the canvas (same pattern as
        // CanvasMarcher.textLabel). Only add it when it will actually show, so
        // export canvases stay free of invisible objects.
        if (showName) canvas.add(canvasProp.propNameLabel);

        canvasPropsById[prop.marcher_id] = canvasProp;
    }

    return canvasPropsById;
}

/**
 * Removes props previously added by {@link addPropsToCanvas}, including their
 * name labels. Removing an object the canvas does not hold is a no-op, so this
 * is safe whether or not labels were added.
 */
export function removePropsFromCanvas(
    canvas: fabric.Canvas | fabric.StaticCanvas,
    canvasProps: CanvasPropsById | CanvasProp[],
): void {
    const list = Array.isArray(canvasProps)
        ? canvasProps
        : Object.values(canvasProps);
    for (const canvasProp of list) {
        canvas.remove(canvasProp.propNameLabel);
        canvas.remove(canvasProp);
    }
}
