/**
 * The field test API: one read-only view of the field for the browser scenario
 * harness (`e2e/browser`), so the same scenarios run against any field renderer.
 *
 * It says what the field shows, never how it's drawn. Keep this file free of
 * renderer imports: each field renderer implements it and installs it with
 * `installFieldTestApi`.
 *
 * Units: field positions are in field units, as the timeline stores them.
 * Screen positions are CSS pixels in the window's viewport, ready for mouse
 * events.
 */

import type { FieldQuality, GlKind, LowQualityReason } from "./fieldQuality";

/** A point in viewport CSS pixels. */
export type ScreenPoint = { x: number; y: number };

export type FieldTestMarcher = {
    id: number;
    /** The marcher's label text, as drawn on the field (its drill number). */
    label: string;
    /** Where the dot is drawn, in field units. */
    x: number;
    y: number;
    /** The dot's center in the viewport. */
    screen: ScreenPoint;
    /** False when the dot is scrolled out of the visible field. */
    onScreen: boolean;
    /** How the marcher is drawn: its appearance at the beat shown. */
    look: FieldTestLook;
    /**
     * Drawn dimmed because it's outside the isolated move (UI-9); a dimmed
     * marcher can't be selected.
     */
    dimmed: boolean;
};

/**
 * A marcher's look on the field. Colors are `rgba(r, g, b, a)` as
 * `rgbaToString` writes them.
 */
export type FieldTestLook = {
    /** False for a hidden marcher: neither its dot nor its label is drawn. */
    visible: boolean;
    labelVisible: boolean;
    shape: "circle" | "square" | "triangle" | "x";
    /** The dot's fill; an X's line color. */
    fill: string;
    /** The dot's outline; null for an X, which is lines only. */
    outline: string | null;
    labelColor: string;
};

export type FieldTestHandle =
    | "nw"
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w"
    | "rot";

/**
 * What the user is doing on the field right now. `line` covers the whole line
 * tool, from choosing it until it applies or cancels.
 */
export type FieldTestGesture =
    | "marquee"
    | "lasso"
    | "move"
    | "scale"
    | "rotate"
    | "pan"
    | "line";

/** How the field draws on this machine (the new field only, #205). */
export type FieldTestQuality = {
    /** `low` in low-quality mode. */
    mode: FieldQuality["mode"];
    /** Why it's in low-quality mode, or null at full quality. */
    reason: LowQualityReason | null;
    /** What draws WebGL: a GPU, software, or nothing; null before it's known. */
    gl: GlKind | null;
    /** The WebGL renderer string, when there's WebGL. */
    renderer: string | null;
    /** Device pixels per CSS pixel the field draws at; null with no canvas. */
    pixelRatio: number | null;
    /** Marcher labels are hidden below this many CSS pixels per em. */
    labelsHiddenBelow: number;
    /** The field's WebGL context is lost and not yet recovered. */
    contextLost: boolean;
};

export interface FieldTestApi {
    /** Every marcher on the field, hidden ones included (`look.visible`). */
    marchers(): FieldTestMarcher[];
    /** The ids of the selected marchers, ascending. */
    selection(): number[];
    /**
     * `zoom` is screen pixels per field unit; `pan` is where field point (0, 0)
     * sits, in CSS pixels from the field's top-left corner.
     */
    viewport(): { zoom: number; pan: { x: number; y: number } };
    /** The selection box's handles, or null when none are shown. */
    handles(): Record<FieldTestHandle, ScreenPoint> | null;
    /** The gesture in progress, or null. */
    activeGesture(): FieldTestGesture | null;
    /** The id of the page the field shows, or null before one is shown. */
    pageId(): number | null;
    /** How the field draws on this machine. Only the new field has quality modes. */
    quality?(): FieldTestQuality;
    /**
     * Where the show's field image is drawn, in field units, and how opaque;
     * null when none is shown (no image, hidden, or not loaded yet).
     */
    fieldImage(): FieldTestImage | null;
    /** The line tool (L) while it's on, or null when it's off (#203). */
    lineTool?(): FieldTestLineTool | null;
}

/** The line tool as the field shows it. Positions are in field units. */
export type FieldTestLineTool = {
    /** The marchers it lines up (outlined on the field), ascending. */
    marchers: number[];
    /**
     * The line drawn, or null before the first click and after a right-click.
     * `drawing` while its end follows the pointer, before the second click.
     */
    line: {
        start: { x: number; y: number };
        end: { x: number; y: number };
        drawing: boolean;
    } | null;
    /**
     * Where the dashed previews put each marcher, by ascending id: what
     * Shift+Enter applies. Empty until a line is finished.
     */
    previews: { id: number; x: number; y: number }[];
};

export type FieldTestImage = {
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
};

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        /** The field test API of the field on screen; see `fieldTestApi.ts`. */
        fieldTest?: FieldTestApi;
    }
}

/** Makes `api` the page's field test API (`window.fieldTest`). */
export function installFieldTestApi(api: FieldTestApi | undefined) {
    window.fieldTest = api;
}
