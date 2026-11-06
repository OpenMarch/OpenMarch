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
    /**
     * How opaque the dot is drawn: 1, dimmed by isolation, a faint dot outside an open shape,
     * or 0 for the open shape's own marchers once it's drawn (#417).
     */
    opacity: number;
    /** Whether its label is drawn (not for an open shape's faint or hidden marchers) */
    labelShown: boolean;
    /**
     * Drawn Not defined (a dashed edge) because nothing decides its position on the count shown:
     * no move it's walking or arriving in, no Held hold, no shape carried there (#478, holds
     * decisions 8 and 9). Reports the drawn look: false while playing, and false when dimmed,
     * which takes over. A Not defined marcher can still be selected.
     */
    notDefined: boolean;
    /**
     * Its label is drawn bold: on a keyframe (a coordinate of its own on the count shown), while
     * playing, or dimmed. Off a keyframe the label is lighter, whether walking, Held or Not
     * defined (#478).
     */
    labelBold: boolean;
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
 * What the user is doing on the field right now. `shape` covers the whole
 * shape tool, from opening it until it places or cancels; `box` is a drag on a
 * selected placed box (its handles, or inside it); `prop` the prop tool, from
 * the Props panel's Draw until it's turned off.
 */
export type FieldTestGesture =
    | "marquee"
    | "lasso"
    | "move"
    | "scale"
    | "rotate"
    | "pan"
    | "shape"
    | "box"
    | "prop";

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
    /**
     * What the shape tool, or a selected placed box, draws over the field
     * (#204), or null when neither is on the field.
     */
    shapeOverlay?(): FieldTestShapeOverlay | null;
    /**
     * False while the edited shape's marchers (their dots, labels and paths,
     * and the shape's spots and walks) are hidden so the shape is seen on its
     * own (#558, H). Everyone else, and the start ghosts, still show: read
     * who's hidden from each marcher's `opacity` (0)
     */
    marchersShown?(): boolean;
    /** The placed boxes outlined on the field (the View tab's Shapes setting). */
    placedBoxes?(): FieldTestPlacedBox[];
    /**
     * The props and equipment drawn (C2.1), by ascending marcher id. Items Off
     * field at the beat shown, or hidden by the user, are left out.
     */
    items?(): FieldTestItem[];
    /** The prop tool while it's on, or null when it's off (C2.1). */
    propTool?(): FieldTestPropTool | null;
}

/** The prop tool as the field shows it. */
export type FieldTestPropTool = {
    outlineType: string;
    /** The Outline being drawn, in field units, or null before there's enough of it */
    preview: { points: { x: number; y: number }[]; closed: boolean } | null;
};

/** An item's Outline as the field draws it. */
export type FieldTestItem = {
    /** The item's marcher id */
    id: number;
    outlineType: string;
    /** In meters, with any size being dragged */
    width: number;
    depth: number;
    /** In degrees, clockwise on screen */
    rotation: number;
    /** Where the timeline (or a drag) has it, in field units */
    x: number;
    y: number;
    /** Its center in the viewport */
    screen: ScreenPoint;
};

/**
 * A shape drawn over the field: by the open shape tool, or a selected placed
 * box edited in place. Field positions are in field units.
 */
export type FieldTestShapeOverlay = {
    /** The shape's outline, a closed polygon; null before one is drawn. */
    outline: { x: number; y: number }[] | null;
    /** Where its marchers will stand. */
    spots: { x: number; y: number }[];
    /** From each marcher to its spot; empty during a gesture. */
    walks: { from: { x: number; y: number }; to: { x: number; y: number } }[];
    /** The hollow rings where its marchers start (at the start flag), field units. */
    rings: { x: number; y: number }[];
    /** Spots it leaves empty on purpose (an odd-count outline's gap), field units. */
    gaps: { x: number; y: number }[];
    /** Circles it's drawn on (an Arc's whole circle, #634), field units. */
    construction: {
        center: { x: number; y: number };
        rx: number;
        ry: number;
        rotation: number;
        /** Whether the circle itself is drawn (the Guides menu's Circle, #634) */
        shown: boolean;
        /** The ends its angle lines run through from its center (#634), field units; none when hidden */
        spokes: { x: number; y: number }[];
    }[];
    /** Its handles, in the viewport. */
    handles: ScreenPoint[];
    /** Its handles that add a point (a line's segment midpoints, #524), in the viewport. */
    addHandles: ScreenPoint[];
    /** Handles selected by a click (a line's point, #557), also in `handles` */
    selectedHandles: ScreenPoint[];
    /** The ends of a selected point's bar (its tangent, #557), each with the point it runs from */
    barHandles: { at: ScreenPoint; from: ScreenPoint }[];
    /** Drawing (a drag draws it) or open; null for a mode that doesn't say. */
    stage: "drawing" | "open" | null;
    /** The rotate knob and the center dot, in the viewport; null when not drawn. */
    knob: ScreenPoint | null;
    centerDot: ScreenPoint | null;
    /** The pivot's crosshair once it's out of the center (#350), or null at the center */
    pivotMark: ScreenPoint | null;
    /** The pivot a cell of the editor's pivot menu points at (#437), in field units; null without one */
    pivotPreview: { x: number; y: number } | null;
    /** Who will stand on each spot, as labeled. */
    labels: string[];
    /** The readout by the pointer during a gesture ("7½ × 2 steps · ↔ 2½ ↕ 2 apart"), or null. */
    tip: string | null;
    /** The spots are still gliding to where they're going after a change (#387). */
    gliding: boolean;
    /** The controls are faint: the pointer is away from the shape (#403). */
    calm: boolean;
    /** Guides along the field's lines the shape's edges are on, field units (#425). */
    guides: {
        from: { x: number; y: number };
        to: { x: number; y: number };
        label: string | null;
    }[];
    /** The shape's sides on a guide's line, drawn thicker, field units (#425). */
    guideEdges: {
        from: { x: number; y: number };
        to: { x: number; y: number };
    }[];
    /** The shape's corners or center on a guide with no side along it, ringed, field units (#446). */
    guideMarks: { x: number; y: number }[];
    /** The spots standing on a guide, tinted, field units (#425). */
    onGuides: { x: number; y: number }[];
    /**
     * While the editor's menu of a Line's interval groups is open: each spot ringed in its
     * group's color, field units, `faint` with no group pointed at, else that group `lit` and the
     * rest `dim`.
     */
    groupMarks: {
        x: number;
        y: number;
        shade: "faint" | "lit" | "dim";
        group: number;
    }[];
    /**
     * Each gap of the group pointed at, labeled with its interval ("3", "↔ 2½"), at its middle in
     * field units; a `seam` is where the group meets a neighbor, with the interval there.
     */
    groupLabels: { x: number; y: number; text: string; seam: boolean }[];
    /**
     * While a Line's Offset numbers are engaged or an end is dragged: the step from the first
     * marcher to the next, field units, across to `corner` then up or down to `to`, with its two
     * labels ("↔ 2", "↕ −1"). Null otherwise.
     */
    offsetStep: {
        from: { x: number; y: number };
        corner: { x: number; y: number };
        to: { x: number; y: number };
        across: string;
        deep: string;
    } | null;
};

/** A placed box outlined on the field. */
export type FieldTestPlacedBox = {
    /** Its recipe's id. */
    id: number;
    /** The label under it, such as "8 × 4". */
    label: string;
    /** Its outline's corners, in field units: left, top, right, bottom. */
    rect: { left: number; top: number; right: number; bottom: number };
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
