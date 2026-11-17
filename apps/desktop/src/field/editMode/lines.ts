import type { Checkpoint, FieldProperties } from "@openmarch/core";
import {
    FIELD_STEP_RESOLUTION,
    mirrorTwin,
    type CheckpointRef,
    type FieldAxis,
} from "@/field/edits";
import type { FieldView } from "@/field/editor/view";

/**
 * The field's lines (checkpoints) as the Edit field mode (#824) sees them: where each one is on
 * the field and on screen, which one a press hits, which ones a box takes, where a drag puts a
 * line and what the readout says about it. Pure, so the overlay and the tests share it.
 *
 * Coordinates: steps are steps from the center (X) or from the front (Y, ≤ 0), as stored. Field
 * units are the canvas pixels marchers are stored in (`fieldProperties.pixelsPerStep` per step,
 * the center front point at `centerFrontPoint`). Element pixels are CSS pixels from the field
 * element's top-left corner (`FieldView`).
 */

export type FieldLineRef = CheckpointRef;

export const lineKey = (ref: FieldLineRef) => `${ref.axis}:${ref.id}`;

export const sameLine = (a: FieldLineRef, b: FieldLineRef) =>
    a.axis === b.axis && a.id === b.id;

export const toRef = (checkpoint: Checkpoint): FieldLineRef => ({
    axis: checkpoint.axis,
    id: checkpoint.id,
});

/** The axis's checkpoints, front to back (Y) or side 1 to side 2 (X): the order the ruler shows */
export function linesOn(fp: FieldProperties, axis: FieldAxis): Checkpoint[] {
    const list = axis === "x" ? fp.xCheckpoints : fp.yCheckpoints;
    const sorted = [...list].sort(
        (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
    );
    // Y reads front (0) to back (most negative)
    return axis === "y" ? sorted.reverse() : sorted;
}

/** Every line: X side 1 to side 2, then Y front to back. Tab walks them in this order. */
export function allLines(fp: FieldProperties): Checkpoint[] {
    return [...linesOn(fp, "x"), ...linesOn(fp, "y")];
}

export function findLine(
    fp: FieldProperties,
    ref: FieldLineRef,
): Checkpoint | undefined {
    return (ref.axis === "x" ? fp.xCheckpoints : fp.yCheckpoints).find(
        (c) => c.id === ref.id,
    );
}

/** A line's position along its axis, in field units */
export function stepsToField(
    fp: FieldProperties,
    axis: FieldAxis,
    steps: number,
): number {
    const origin =
        axis === "x"
            ? fp.centerFrontPoint.xPixels
            : fp.centerFrontPoint.yPixels;
    return origin + steps * fp.pixelsPerStep;
}

/** The steps at a position along an axis, in field units: the inverse of {@link stepsToField} */
export function fieldToSteps(
    fp: FieldProperties,
    axis: FieldAxis,
    coordinate: number,
): number {
    const origin =
        axis === "x"
            ? fp.centerFrontPoint.xPixels
            : fp.centerFrontPoint.yPixels;
    return (coordinate - origin) / fp.pixelsPerStep;
}

/** A position along an axis in field units, in element pixels */
export function fieldToScreen(
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
    axis: FieldAxis,
    coordinate: number,
): number {
    return (axis === "x" ? view.panX : view.panY) + coordinate * view.zoom;
}

/** A position along an axis in element pixels, in field units */
export function screenToField(
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
    axis: FieldAxis,
    pixel: number,
): number {
    return (pixel - (axis === "x" ? view.panX : view.panY)) / view.zoom;
}

/** A line's position on screen, along its axis, in element pixels */
export function lineScreen(
    fp: FieldProperties,
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
    checkpoint: Checkpoint,
): number {
    return fieldToScreen(
        view,
        checkpoint.axis,
        stepsToField(fp, checkpoint.axis, checkpoint.stepsFromCenterFront),
    );
}

/** The field's rectangle in element pixels */
export function fieldScreenRect(
    fp: FieldProperties,
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
) {
    return {
        left: view.panX,
        top: view.panY,
        right: view.panX + fp.width * view.zoom,
        bottom: view.panY + fp.height * view.zoom,
    };
}

/**
 * The lines a box (element px, any corner order) takes: a line is taken when it runs through the
 * box, so a thin box across the field between the hashes takes the yard lines and no hash.
 */
export function linesInBox(
    fp: FieldProperties,
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
    box: { x0: number; y0: number; x1: number; y1: number },
): Checkpoint[] {
    const left = Math.min(box.x0, box.x1);
    const right = Math.max(box.x0, box.x1);
    const top = Math.min(box.y0, box.y1);
    const bottom = Math.max(box.y0, box.y1);
    const rect = fieldScreenRect(fp, view);
    const crossesDepth = top <= rect.bottom && bottom >= rect.top;
    const crossesWidth = left <= rect.right && right >= rect.left;
    return allLines(fp).filter((checkpoint) => {
        const at = lineScreen(fp, view, checkpoint);
        return checkpoint.axis === "x"
            ? crossesDepth && at >= left && at <= right
            : crossesWidth && at >= top && at <= bottom;
    });
}

/** How far apart a drag's positions are, in steps: whole steps, half with Fine */
export const DRAG_SNAP_STEPS = 1;
export const FINE_DRAG_SNAP_STEPS = 0.5;

/**
 * Where a drag at `pixel` (element px along the axis) puts a line, in steps, snapped to `snap`
 * steps. Y stays at or behind the front.
 */
export function dragSteps(
    fp: FieldProperties,
    view: Pick<FieldView, "zoom" | "panX" | "panY">,
    axis: FieldAxis,
    pixel: number,
    snap = DRAG_SNAP_STEPS,
): number {
    const raw = fieldToSteps(fp, axis, screenToField(view, axis, pixel));
    const step = snap > 0 ? snap : FIELD_STEP_RESOLUTION;
    let steps = Math.round(raw / step) * step;
    if (axis === "y") steps = Math.min(0, steps);
    steps = Number(steps.toFixed(6));
    return steps === 0 ? 0 : steps;
}

/** How thick each ruler is, in element px. The X ruler runs along the top, the Y ruler down the left. */
export const RULER_PX = 22;
/** The rulers in the touch layout: a finger's width, so the tabs and the strip can be hit */
export const TOUCH_RULER_PX = 44;

/** How thick the rulers are in the current layout: desktop keeps its density, touch gets 44 px */
export const rulerPx = (touch: boolean) => (touch ? TOUCH_RULER_PX : RULER_PX);

/** Half the width of the strip a press takes a line in, in element px (44 px wide with a finger) */
export const linePadPx = (touch: boolean) => (touch ? 22 : 5);

/** Whether an element point is over an axis's ruler: where a drag deletes, or starts a new line */
export function overRuler(
    axis: FieldAxis,
    point: { x: number; y: number },
    ruler = RULER_PX,
): boolean {
    return axis === "x" ? point.y <= ruler : point.x <= ruler;
}

/**
 * Whether a line drag at `point` is over its ruler, where letting go deletes it. A drag that
 * starts on a ruler tab is already over the ruler, and sliding the tab along its ruler moves the
 * line: it only counts once the drag has left the ruler and come back. `armed` is whether it
 * has left (start with `!fromTab`); the result's `armed` is the value to keep for the next move.
 */
export function dragOverRuler(
    axis: FieldAxis,
    point: { x: number; y: number },
    armed: boolean,
    ruler = RULER_PX,
): { over: boolean; armed: boolean } {
    const inRuler = overRuler(axis, point, ruler);
    const nowArmed = armed || !inRuler;
    return { over: nowArmed && inRuler, armed: nowArmed };
}

/** The name a line goes by in readouts and lists: "S1 45", "50", "FH" */
export function lineLabel(
    fp: Pick<FieldProperties, "sideDescriptions">,
    checkpoint: Pick<Checkpoint, "axis" | "stepsFromCenterFront" | "terseName">,
): string {
    if (checkpoint.axis === "y") return checkpoint.terseName;
    const steps = checkpoint.stepsFromCenterFront;
    if (Math.abs(steps) < 1e-6) return checkpoint.terseName;
    const side =
        steps < 0
            ? fp.sideDescriptions.terseLeft
            : fp.sideDescriptions.terseRight;
    return side ? `${side} ${checkpoint.terseName}` : checkpoint.terseName;
}

/** Which side of the 50 a position is on: X only, null at the center and on Y */
export function sideOf(
    axis: FieldAxis,
    steps: number,
): "left" | "right" | null {
    if (axis === "y" || Math.abs(steps) < 1e-6) return null;
    return steps < 0 ? "left" : "right";
}

export interface LineReadout {
    readonly axis: FieldAxis;
    /** Side 1 (left), side 2 (right) or the center/Y (null) */
    readonly side: "left" | "right" | null;
    /** The side's short name ("S2"), or "" */
    readonly sideName: string;
    /** Steps from the center (X) or behind the front (Y), never negative */
    readonly distance: number;
    /** The lines on either side of it, nearest first in each direction */
    readonly neighbors: readonly { distance: number; label: string }[];
}

/**
 * What a drag's readout says about a position: its side, how far it is from the center (or
 * behind the front) and how far it is from the lines on either side ("S2 · 44 steps · 4 to S2 25
 * · 4 to S2 20"). `exclude` leaves out the lines being moved.
 */
export function lineReadout(
    fp: FieldProperties,
    axis: FieldAxis,
    steps: number,
    exclude: readonly FieldLineRef[] = [],
): LineReadout {
    const others = linesOn(fp, axis).filter(
        (c) => !exclude.some((ref) => sameLine(ref, toRef(c))),
    );
    const below = others
        .filter((c) => c.stepsFromCenterFront < steps - 1e-6)
        .sort((a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront)[0];
    const above = others
        .filter((c) => c.stepsFromCenterFront > steps + 1e-6)
        .sort((a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront)[0];
    const neighbor = (c: Checkpoint | undefined) =>
        c
            ? [
                  {
                      distance: round(Math.abs(c.stepsFromCenterFront - steps)),
                      label: lineLabel(fp, c),
                  },
              ]
            : [];
    const side = sideOf(axis, steps);
    return {
        axis,
        side,
        sideName:
            side === "left"
                ? fp.sideDescriptions.terseLeft
                : side === "right"
                  ? fp.sideDescriptions.terseRight
                  : "",
        distance: round(Math.abs(steps)),
        // The line toward the center (X) or the front (Y) first, then the one further out
        neighbors:
            axis === "x" && steps > 0
                ? [...neighbor(below), ...neighbor(above)]
                : [...neighbor(above), ...neighbor(below)],
    };
}

const round = (n: number) => Number(n.toFixed(2));

/** A line and its mirror twin (X, when it has one), the pair mirror edits move together */
export function withTwin(
    fp: FieldProperties,
    checkpoint: Checkpoint,
): Checkpoint[] {
    if (checkpoint.axis !== "x") return [checkpoint];
    const twin = mirrorTwin(fp.xCheckpoints, checkpoint);
    return twin ? [checkpoint, twin] : [checkpoint];
}

/** The field's width and depth in steps, from its outermost lines */
export function fieldSizeSteps(fp: FieldProperties): {
    width: number;
    depth: number;
} {
    const xs = fp.xCheckpoints.map((c) => c.stepsFromCenterFront);
    const ys = fp.yCheckpoints.map((c) => c.stepsFromCenterFront);
    return {
        width: round(Math.max(0, ...xs) - Math.min(0, ...xs)),
        depth: round(Math.max(0, ...ys) - Math.min(0, ...ys)),
    };
}
