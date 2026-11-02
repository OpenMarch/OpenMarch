/**
 * The shape tool's contract (docs/timeline/research/shapes/README.md, 03-shape-model.md §2).
 *
 * A shape kind is one module that declares its parameters, handles and slot generator. The
 * panel, the canvas preview, assignment and validation are generic and never switch on the kind,
 * so a new kind is one file plus one registry line.
 *
 * Shapes are in place: a kind only says where the selected marchers stand at one moment. Motion
 * and timing stay in the timeline, which the tool writes through like a canvas drag.
 *
 * Units: points and lengths are field units (canvas pixels). The panel shows lengths in steps,
 * converting with {@link ShapeContext.stepPx}.
 */

import type { Path } from "./geometry/path";

export interface XY {
    readonly x: number;
    readonly y: number;
}

/** What every kind's functions may read about the field. */
export interface ShapeContext {
    /** Field units per 8-to-5 step */
    readonly stepPx: number;
    /**
     * Snaps a point to the grid the canvas uses. Identity when snapping is off (the Snap
     * toggle off, or fine held).
     */
    readonly snapPoint: (p: XY) => XY;
    /**
     * Mid-gesture (a handle drag): the spots only show where the shape is going, so a spread may
     * stretch its last layout to the new frame instead of laying out again each move (#439). The
     * gesture's end asks without it, and gets the exact spots.
     */
    readonly draft?: boolean;
    /** The field's size in field units (from 0, 0), to warn about spots off it */
    readonly field?: { readonly width: number; readonly height: number };
    /**
     * The move's length and the biggest step it allows, to warn about walks needing bigger steps
     * than the field's step size warning (sims, round 7). Absent at Home or with no move.
     */
    readonly steps?: {
        readonly counts: number;
        /** Field units a marcher may cover in one count */
        readonly maxPerCount: number;
        /** A distance covered in the move, as drill writers say it: "6.2 to 5" */
        readonly describe: (distance: number) => string;
        /** The limit itself, as drill writers say it: "4 to 5" */
        readonly limit: string;
    };
}

/**
 * One run of the older path kinds' mixed interval (`kinds/`): `count` gaps of `steps` steps each.
 * The typed list counts marchers instead (`IntervalGroup` in `spacing.ts`, spec #522).
 */
export interface IntervalRun {
    readonly steps: number;
    readonly count: number;
}

/**
 * How marchers are spaced along a path. Shared by every path kind so spacing reads and behaves
 * the same everywhere. There are three states, which the panel shows as two locks:
 *
 * - `fit` (interval unlocked): the shape is as drawn and the marchers spread evenly over it.
 *   Its `sizeLocked` remembers the size lock for when the interval is locked.
 * - `interval` with `size: "follow"` (interval locked, "Keep interval"): the gaps are fixed (one
 *   interval, or runs of gaps) and the shape is resized to fit them as it is edited.
 *   `anchor` is the point that stays put when the length changes.
 * - `interval` with `size: "keep"` (interval and size locked, "on the path"): the shape is as
 *   drawn and the run is laid along it from `anchor`; a run longer than the shape continues past
 *   its end. Absent `size` reads as `keep`.
 */
export type Spacing =
    | {
          readonly mode: "fit";
          /**
           * The size lock, closed by typing a size or clicking its padlock. In Fit the shape is
           * as drawn either way; it decides what locking the interval does: with the size
           * locked the run is laid on the shape ("on the path"), otherwise the shape follows.
           */
          readonly sizeLocked?: boolean;
      }
    | {
          readonly mode: "interval";
          readonly runs: readonly IntervalRun[];
          readonly anchor: "start" | "center" | "end";
          readonly size?: "follow" | "keep";
      };

/** Whether the shape is resized to keep the interval (the "Keep interval" state) */
/** Whether the size lock is closed */
export const sizeIsLocked = (spacing: Spacing): boolean =>
    spacing.mode === "fit"
        ? spacing.sizeLocked === true
        : spacing.size !== "follow";

export const followsInterval = (
    spacing: Spacing,
): spacing is Extract<Spacing, { mode: "interval" }> =>
    spacing.mode === "interval" && spacing.size === "follow";

/** A spot a marcher can be put on. The tags let assignment and later tools reason about it. */
export interface Slot extends XY {
    /** Distance along the path from its start, in field units (path kinds) */
    readonly s?: number;
    /** Lattice cell (fill kinds) */
    readonly row?: number;
    readonly col?: number;
}

export type HandleRole =
    /** A defining point, such as a line's end */
    | "point"
    /** Moves the whole shape */
    | "move"
    /** Changes curvature or radius along one axis */
    | "bulge"
    /** Turns the shape about its origin */
    | "rotate";

export interface HandleDef {
    /** Stable for the kind, so a drag keeps its handle while the shape changes */
    readonly key: string;
    readonly role: HandleRole;
    readonly at: XY;
    /** Where the shape starts: marked on the field so "Lay from Start" has a visible end */
    readonly start?: boolean;
    /** The far end of an open path; with `start`, the handles a resize keeps the other one of */
    readonly end?: boolean;
    /** What dragging it does, shown on hover ("Bend", "Files"); a default by role otherwise */
    readonly hint?: string;
}

/**
 * A size the panel shows as a typed field although the kind stores it some other way, such as a
 * line's length (two end points) or an arc's radius (ends and bulge). `set` returns params that
 * give the typed value.
 */
export interface Measure<P> {
    readonly key: string;
    readonly label: string;
    /** Lengths are shown and typed in steps, angles in degrees */
    readonly unit: "length" | "angle";
    readonly min?: number;
    get(params: P, n: number, ctx: ShapeContext): number;
    set(params: P, value: number, n: number, ctx: ShapeContext): P;
    /** Hidden unless this holds */
    visibleWhen?(params: P): boolean;
    /**
     * The shape's size (a circle's radius). With a locked interval it is derived, and the panel
     * puts the size lock beside it. Path kinds without one get a generic Length.
     */
    readonly size?: boolean;
}

export interface DragModifiers {
    /** The `constrain` role: angles to 45°, for example */
    readonly constrain: boolean;
}

export type IssueLevel = "error" | "warning" | "info";

export interface ShapeIssue {
    readonly level: IssueLevel;
    readonly message: string;
    /** Slot indexes the issue is about, for highlighting */
    readonly slots?: readonly number[];
    /** `steps`: steps too big, drawn apart from the rest */
    readonly mark?: "steps";
}

/**
 * A parameter the panel renders without knowing the kind. `key` names a top-level field of the
 * kind's params. Point parameters aren't listed: they are edited with handles.
 */
export type ParamField =
    | {
          readonly type: "length";
          readonly key: string;
          readonly label: string;
          /** Smallest value, in steps */
          readonly min?: number;
      }
    | {
          readonly type: "count";
          readonly key: string;
          readonly label: string;
          readonly min: number;
      }
    | {
          readonly type: "angle";
          readonly key: string;
          readonly label: string;
      }
    | {
          readonly type: "enum";
          readonly key: string;
          readonly label: string;
          readonly options: readonly {
              readonly value: string;
              readonly label: string;
          }[];
      }
    | { readonly type: "bool"; readonly key: string; readonly label: string }
    /** A boolean shown as a padlock, for "keep this value" settings, so locks look the same */
    | {
          readonly type: "lock";
          readonly key: string;
          readonly label: string;
          readonly lockedHelp: string;
          readonly unlockedHelp: string;
      }
    /** The shared spacing control; the field must hold a {@link Spacing} */
    | {
          readonly type: "spacing";
          readonly key: string;
          readonly label: string;
      };

export interface ParamGroup<P> {
    readonly label: string;
    readonly fields: readonly ParamField[];
    /** Collapsed under "More" until opened */
    readonly advanced?: boolean;
    /** Hidden unless this holds */
    readonly visibleWhen?: (params: P) => boolean;
}

/** A read-only line in the panel, such as "Length 30 steps". */
export interface Readout {
    readonly label: string;
    readonly value: string;
}

export interface FitInput {
    /** The selected marchers where the edit window arrives, in selection order */
    readonly current: readonly XY[];
}

export interface ShapeKind<P> {
    /** Stored with recipes; never reuse an id */
    readonly id: string;
    /** Bump when `generate` gives different slots for the same params */
    readonly version: number;
    readonly label: string;
    readonly family: "path" | "fill";
    /**
     * Who goes where when the tool opens: an open path keeps the marchers' order along it, a
     * closed or filled shape has no natural start, so nearest spots usually read better
     */
    readonly defaultOrder?: "keep" | "nearest";
    readonly groups: readonly ParamGroup<P>[];

    /** Params that make a first preview land on or near the marchers' current spots. Pure. */
    fit(input: FitInput, ctx: ShapeContext): P;
    handles(params: P, n: number, ctx: ShapeContext): HandleDef[];
    /** Params after dragging handle `key` to `to` (already snapped by the caller). Pure. */
    drag(
        params: P,
        key: string,
        to: XY,
        modifiers: DragModifiers,
        n: number,
        ctx: ShapeContext,
    ): P;
    /** Lines to draw under the slots: the part of the shape the marchers stand on */
    outline(params: P, n: number, ctx: ShapeContext): readonly XY[][];
    /** Fainter lines for the rest of the shape, such as a path longer than an interval run */
    guide?(params: P, n: number, ctx: ShapeContext): readonly XY[][];
    /** Sizes typed in the panel's Size section, before the kind's own groups */
    readonly measures?: readonly Measure<P>[];
    /**
     * With a locked interval, keep the drawn path and lay the run along it (Pyware's fixed
     * interval float) instead of resizing the shape: for free-form shapes, where a resize would
     * move points away from where they were drawn.
     */
    readonly keepsPath?: boolean;
    /** Adds a defining point at `at`, where the shape was double-clicked */
    insertPoint?(params: P, at: XY): P;
    /** Removes the defining point of handle `key` (double-clicked); undefined if it can't go */
    removePoint?(params: P, key: string): P | undefined;
    /** The path marchers are spaced along (path kinds) */
    path?(params: P): Path;
    /** The shape scaled by `k` about `pivot` (path kinds that can keep a locked interval) */
    scale?(params: P, pivot: XY, k: number): P;
    /**
     * Resizes the shape to hold `gaps` (field units, measured straight between neighbors) when
     * the generic scale is the wrong feel: a circle keeps its center, an arc's dragged end
     * stays under the cursor. `dragged` is the handle just dragged, if any. Undefined means
     * "use the generic scale".
     */
    float?(
        params: P,
        gaps: readonly number[],
        ctx: ShapeContext,
        dragged?: HandleDef,
    ): P | undefined;
    /** The spots for `n` marchers, in the kind's natural order. Deterministic. */
    generate(params: P, n: number, ctx: ShapeContext): Slot[];
    /**
     * A sort key for a point, comparable with the same key of the slots, used by "Keep order"
     * assignment: path kinds return the distance along the path, fills their rank then file.
     * `n` is the marcher count, for kinds whose lattice depends on it (a block's ranks).
     */
    orderKey(
        params: P,
        point: XY,
        ctx: ShapeContext,
        n: number,
    ): readonly number[];
    readouts?(params: P, n: number, ctx: ShapeContext): Readout[];
    /** Kind-specific checks; the generic ones run for every kind (`validate.ts`) */
    validate?(
        params: P,
        slots: readonly Slot[],
        ctx: ShapeContext,
    ): ShapeIssue[];
}

// The registry stores kinds of different params side by side; the tool keeps each kind's params
// with the kind that made them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyShapeKind = ShapeKind<any>;
