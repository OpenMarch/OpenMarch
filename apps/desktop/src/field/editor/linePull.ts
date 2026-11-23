import type { FieldProperties } from "@openmarch/core";
import { fieldReferenceLines } from "@/field/fieldPlan";
import type { FieldPoint } from "./fieldEditor";

/**
 * Catching the field's lines while marchers are dragged (#585): yard lines, hashes and sidelines,
 * the checkpoints the coordinate sheets count from (`fieldReferenceLines`). A
 * selection's edge or center that comes within a few pixels of one lands on it, as a box shape's
 * corner does (#425). Pure, in field units.
 */

/** How near one of the field's lines an edge must come to land on it, in screen pixels (#425). */
export const LINE_PULL_PX = 6;

/** The field's lines, in field units: x for lines side to side, y for front to back. */
export type FieldLines = {
    readonly x: readonly number[];
    readonly y: readonly number[];
};

/**
 * What a drag can be pulled onto: the field's lines, and how far it reaches for one on each
 * axis, in field units.
 */
export type LinePull = {
    readonly lines: FieldLines;
    readonly radius: { readonly x: number; readonly y: number };
};

/**
 * The field's checkpoints a selection lands on, worked out once per field: the reference yard
 * lines, hashes and sidelines, not the half lines between them, which would catch nearly every
 * drag.
 */
const linesByField = new WeakMap<FieldProperties, FieldLines>();
export function fieldLinesOf(field: FieldProperties): FieldLines {
    let lines = linesByField.get(field);
    if (!lines) {
        lines = fieldReferenceLines(field, { halfLines: false });
        linesByField.set(field, lines);
    }
    return lines;
}

/** Near enough to a line to be on it, in field units (as a box shape's guides). */
const ON_LINE = 1e-3;

/**
 * How far to shift `values` (points on one axis that move together: a selection's two edges and
 * its center) so the one nearest a line lands on it: the smallest shift no larger than `radius`.
 * Null with no line that near.
 */
export function pullShift(
    values: readonly number[],
    lines: readonly number[],
    radius: number,
): number | null {
    if (!(radius > 0)) return null;
    let best: number | null = null;
    for (const value of values)
        for (const line of lines) {
            const shift = line - value;
            if (Math.abs(shift) > radius) continue;
            if (best === null || Math.abs(shift) < Math.abs(best)) best = shift;
        }
    return best;
}

/** The two edges and the center of `positions` along `axis`: what lands on a line. */
export function edgesAndCenter(
    positions: readonly FieldPoint[],
    axis: "x" | "y",
): number[] {
    let low = Infinity;
    let high = -Infinity;
    for (const p of positions) {
        low = Math.min(low, p[axis]);
        high = Math.max(high, p[axis]);
    }
    if (!Number.isFinite(low)) return [];
    return low === high ? [low] : [low, high, (low + high) / 2];
}

/**
 * The lines `positions`' edges or center lie on, each axis's in order: what a guide is drawn
 * along while marchers are dragged.
 */
export function linesUnder(
    positions: readonly FieldPoint[],
    lines: FieldLines,
): { x: number[]; y: number[] } {
    const on = (axis: "x" | "y") => {
        const values = edgesAndCenter(positions, axis);
        return lines[axis].filter((line) =>
            values.some((v) => Math.abs(v - line) < ON_LINE),
        );
    };
    return { x: on("x"), y: on("y") };
}
