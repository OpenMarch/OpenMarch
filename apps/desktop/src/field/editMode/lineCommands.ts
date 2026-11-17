import type { FieldProperties } from "@openmarch/core";
import {
    autoCheckpointNames,
    type CheckpointNamer,
    type FieldAxis,
    type FieldEditRequest,
} from "@/field/edits";
import { findLine, type FieldLineRef } from "./lines";
import { selectionForEdit, selectionWithTwins } from "./lineSelection";

/**
 * The edits behind the Edit field mode's line commands (#824), as data: the keys, the buttons,
 * the menus and the Field panel's rows all build their edits here, so the same command makes the
 * same edit wherever it's run from. Each returns the edits to apply as one undo step, or null
 * when there's nothing to do.
 */

/** Delete lines (with mirror, their twins too) */
export function deleteLinesEdit(
    fp: FieldProperties,
    lines: readonly FieldLineRef[],
    mirror: boolean,
): FieldEditRequest | null {
    const ids = selectionForEdit(fp, lines, mirror);
    if (ids.length === 0) return null;
    return { edit: "removeCheckpoints", args: { ids, mirror } };
}

/**
 * Hide or show lines (H): hides them all when every one is visible, else shows them all. The same
 * for Use as reference (R).
 */
export function toggleLinesEdit(
    fp: FieldProperties,
    lines: readonly FieldLineRef[],
    key: "visible" | "useAsReference",
    mirror: boolean,
): FieldEditRequest | null {
    const ids = selectionForEdit(fp, lines, mirror);
    const checkpoints = ids.flatMap((ref) => findLine(fp, ref) ?? []);
    if (checkpoints.length === 0) return null;
    const allOn = checkpoints.every((c) => c[key]);
    return {
        edit: "updateCheckpoints",
        args: { ids, patch: { [key]: !allOn }, mirror },
    };
}

/** Move lines on one axis by some steps (the arrows); lines on the other axis stay */
export function nudgeLinesEdit(
    fp: FieldProperties,
    lines: readonly FieldLineRef[],
    axis: FieldAxis,
    by: number,
    mirror: boolean,
): FieldEditRequest | null {
    const ids = selectionForEdit(
        fp,
        lines.filter((ref) => ref.axis === axis),
        mirror,
    );
    if (ids.length === 0 || by === 0) return null;
    return { edit: "moveCheckpoints", args: { ids, by, mirror } };
}

/** Move one line (and with mirror its twin) to a position, in steps */
export function moveLineEdit(
    line: FieldLineRef,
    to: number,
    mirror: boolean,
): FieldEditRequest {
    return {
        edit: "moveCheckpoints",
        args: { ids: [line], to, mirror: mirror && line.axis === "x" },
    };
}

/** Add a line at a position (steps), or halfway into the largest gap without one */
export function addLineEdit(
    axis: FieldAxis,
    steps: number | undefined,
    mirror: boolean,
): FieldEditRequest {
    return {
        edit: "addCheckpoint",
        args: {
            axis,
            ...(steps === undefined ? {} : { steps }),
            ...(axis === "x" && mirror ? { mirror: true } : {}),
        },
    };
}

/**
 * Give lines back the names their position gives them ("47.5 yard line", "47.5"), and the yard
 * number when the position has one. Each line (and with mirror its twin) gets its own names.
 */
export function resetNamesEdits(
    fp: FieldProperties,
    lines: readonly FieldLineRef[],
    mirror: boolean,
    /** The words, in the app's language (`createCheckpointNamer`); English without one */
    namer?: CheckpointNamer,
): FieldEditRequest[] {
    return selectionWithTwins(fp, lines, mirror).flatMap((ref) => {
        const line = findLine(fp, ref);
        if (!line) return [];
        const auto = autoCheckpointNames(
            fp,
            line.axis,
            line.stepsFromCenterFront,
            namer,
        );
        if (
            line.name === auto.name &&
            line.terseName === auto.terseName &&
            (line.axis === "y" || line.fieldLabel === auto.fieldLabel)
        )
            return [];
        return [
            {
                edit: "updateCheckpoints" as const,
                args: {
                    ids: [ref],
                    patch: {
                        name: auto.name,
                        shortName: auto.terseName,
                        ...(line.axis === "x"
                            ? { fieldLabel: auto.fieldLabel ?? null }
                            : {}),
                    },
                },
            },
        ];
    });
}
