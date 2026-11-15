import type { Checkpoint, FieldProperties } from "@openmarch/core";
import type { FieldAxis } from "@/field/edits";
import {
    allLines,
    findLine,
    lineKey,
    linesOn,
    sameLine,
    toRef,
    withTwin,
    type FieldLineRef,
} from "./lines";

/**
 * The Edit field mode's line selection (#824): plain refs, in the order they were picked (the
 * last is the one Enter edits and Tab walks from). Pure, so the field, the Field panel's list and
 * the keys share it.
 */
export type LineSelection = readonly FieldLineRef[];

export const isSelected = (selection: LineSelection, ref: FieldLineRef) =>
    selection.some((r) => sameLine(r, ref));

/**
 * A click on a line: the line alone, or with `additive` (Shift, or the touch Select many pill)
 * added to the selection, or taken out of it when it's there.
 */
export function clickLine(
    selection: LineSelection,
    ref: FieldLineRef,
    additive: boolean,
): LineSelection {
    if (!additive) return [ref];
    return isSelected(selection, ref)
        ? selection.filter((r) => !sameLine(r, ref))
        : [...selection, ref];
}

/**
 * Shift-click in the list: the rows from the last picked one (that's in `rows`) to `ref`, in the
 * list's order; just `ref` when nothing in the list is picked
 */
export function rangeOf(
    rows: readonly FieldLineRef[],
    selection: LineSelection,
    ref: FieldLineRef,
): LineSelection {
    const to = rows.findIndex((r) => sameLine(r, ref));
    const anchor = [...selection]
        .reverse()
        .map((s) => rows.findIndex((r) => sameLine(r, s)))
        .find((i) => i >= 0);
    if (to < 0 || anchor === undefined) return [ref];
    const [a, b] = anchor <= to ? [anchor, to] : [to, anchor];
    const range = rows.slice(a, b + 1);
    // The clicked row last, so it's the one the Line section and Tab go from
    return [...range.filter((r) => !sameLine(r, ref)), ref];
}

/** A box: its lines, added to the selection with `additive` */
export function boxSelect(
    selection: LineSelection,
    lines: readonly Checkpoint[],
    additive: boolean,
): LineSelection {
    const picked = lines.map(toRef);
    if (!additive) return picked;
    return [...selection, ...picked.filter((r) => !isSelected(selection, r))];
}

/** The selection without lines the field no longer has (after an undo, a delete) */
export function existingSelection(
    fp: FieldProperties,
    selection: LineSelection,
): LineSelection {
    const kept = selection.filter((ref) => findLine(fp, ref) !== undefined);
    return kept.length === selection.length ? selection : kept;
}

/**
 * Tab and Shift+Tab: the next or previous line after the last picked one, X side 1 to side 2
 * then Y front to back, round again at the end. With nothing selected, the first (or last).
 */
export function walkLines(
    fp: FieldProperties,
    selection: LineSelection,
    direction: 1 | -1,
): LineSelection {
    const lines = allLines(fp);
    if (lines.length === 0) return selection;
    const last = selection[selection.length - 1];
    const at = last
        ? lines.findIndex((c) => sameLine(toRef(c), last))
        : direction === 1
          ? -1
          : 0;
    const next = (at + direction + lines.length) % lines.length;
    return [toRef(lines[next]!)];
}

/** Every line, or every line on one axis */
export function selectAll(
    fp: FieldProperties,
    axis?: FieldAxis,
): LineSelection {
    return (axis ? linesOn(fp, axis) : allLines(fp)).map(toRef);
}

/**
 * Every other line of the selection on each axis, in field order, keeping the first: a box from
 * the S1 5 to the S2 5 then Every other leaves the ten 5-yard lines.
 */
export function everyOther(
    fp: FieldProperties,
    selection: LineSelection,
): LineSelection {
    const out: FieldLineRef[] = [];
    for (const axis of ["x", "y"] as const) {
        const picked = linesOn(fp, axis).filter((c) =>
            isSelected(selection, toRef(c)),
        );
        picked.forEach((c, i) => {
            if (i % 2 === 0) out.push(toRef(c));
        });
    }
    return out;
}

/**
 * What a selection reaches: its lines and, with mirror on, their X twins. What's highlighted, and
 * what the edits act on (they take `mirror` themselves; this is for showing it).
 */
export function selectionWithTwins(
    fp: FieldProperties,
    selection: LineSelection,
    mirror: boolean,
): LineSelection {
    if (!mirror) return selection;
    const keys = new Set<string>();
    const out: FieldLineRef[] = [];
    for (const ref of selection) {
        const line = findLine(fp, ref);
        if (!line) continue;
        for (const c of withTwin(fp, line)) {
            const key = lineKey(toRef(c));
            if (keys.has(key)) continue;
            keys.add(key);
            out.push(toRef(c));
        }
    }
    return out;
}

/**
 * The selection for an edit that takes `mirror`: with mirror on, one of each twin pair, so the
 * edit doesn't get both a line and its twin to lead (a pair picked whole moves as a pair either
 * way).
 */
export function selectionForEdit(
    fp: FieldProperties,
    selection: LineSelection,
    mirror: boolean,
): LineSelection {
    if (!mirror) return selection;
    const covered = new Set<string>();
    const out: FieldLineRef[] = [];
    for (const ref of selection) {
        const line = findLine(fp, ref);
        if (!line || covered.has(lineKey(ref))) continue;
        out.push(ref);
        for (const c of withTwin(fp, line)) covered.add(lineKey(toRef(c)));
    }
    return out;
}
