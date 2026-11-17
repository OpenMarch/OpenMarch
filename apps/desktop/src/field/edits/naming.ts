import type { Checkpoint, FieldProperties } from "@openmarch/core";
import { snapSteps } from "./fieldModel";
import type { FieldAxis } from "./types";

export interface AutoCheckpointNames {
    readonly name: string;
    /** The short name, stored as the checkpoint's `terseName` */
    readonly terseName: string;
    /** The yard number painted on the field, when the position has one */
    readonly fieldLabel?: string;
}

/**
 * The words automatic checkpoint names are made of. Every number comes in formatted ("47.5").
 * The edits take one in their options; without one they name in English
 * (`ENGLISH_CHECKPOINT_NAMER`, for tests and agents). The app builds one from its translations
 * (`createCheckpointNamer` in `messages.ts`), so new lines are named in the user's language.
 */
export interface CheckpointNamer {
    /** "47.5 yard line"; the short name is the number itself */
    readonly yardLine: (yards: string) => string;
    /** The end zone's back line, 10 yards past the goal line: "end zone" */
    readonly endZone: () => string;
    /** "EZ" */
    readonly endZoneShort: () => string;
    /** A line `yards` into the end zone: "end zone 5" */
    readonly endZoneLine: (yards: string) => string;
    /** "EZ5" */
    readonly endZoneLineShort: (yards: string) => string;
    /** A grid line numbered down from 5 at the center: "4.5 line"; the short name is the number */
    readonly gridLine: (line: string) => string;
    /** Past the grid's 0 line: steps from the center on a side, "Side 1 24 steps from center" */
    readonly sideSteps: (side: string, steps: string) => string;
    /** "S1 24" */
    readonly sideStepsShort: (side: string, steps: string) => string;
    /** A Y line: "12 steps from front" */
    readonly stepsFromFront: (steps: string) => string;
    /** "F12" */
    readonly stepsFromFrontShort: (steps: string) => string;
}

/** The names the templates use */
export const ENGLISH_CHECKPOINT_NAMER: CheckpointNamer = {
    yardLine: (yards) => `${yards} yard line`,
    endZone: () => "end zone",
    endZoneShort: () => "EZ",
    endZoneLine: (yards) => `end zone ${yards}`,
    endZoneLineShort: (yards) => `EZ${yards}`,
    gridLine: (line) => `${line} line`,
    sideSteps: (side, steps) => `${side} ${steps} steps from center`,
    sideStepsShort: (side, steps) => `${side} ${steps}`,
    stepsFromFront: (steps) => `${steps} steps from front`,
    stepsFromFrontShort: (steps) => `F${steps}`,
};

/** 47.5, not 47.50000001 */
function formatSteps(n: number): string {
    return String(snapSteps(n, 0.01));
}

const DEFAULT_SIDES = {
    verboseLeft: "Side 1",
    verboseRight: "Side 2",
    terseLeft: "S1",
    terseRight: "S2",
};

type NamingField = Pick<FieldProperties, "useHashes"> &
    Partial<Pick<FieldProperties, "sideDescriptions">>;

/**
 * The names a checkpoint gets from its position, as the templates name theirs:
 * - X on a football field (`useHashes`): yard lines, 8 steps to 5 yards from the 50 ("47.5 yard
 *   line", "47.5"; a yard number on multiples of 10). Past the goal line: "end zone 5", "EZ5"
 *   ("end zone", "EZ" at 10 yards, as the end zone templates).
 * - X elsewhere: grid lines every 4 steps from the "5 line" at center ("4.5 line", "4.5"), down
 *   to the 0 line 20 steps out. Past it, steps from center on the field's side ("Side 1 24 steps
 *   from center", "S1 24"; negative steps are side 1, as everywhere in the app).
 * - Y: steps behind the front ("12 steps from front", "F12").
 *
 * Inside the grid and on a football field, names carry no side: as in the templates, the side
 * comes from the sign of the steps.
 */
export function autoCheckpointNames(
    field: NamingField,
    axis: FieldAxis,
    steps: number,
    namer: CheckpointNamer = ENGLISH_CHECKPOINT_NAMER,
): AutoCheckpointNames {
    if (axis === "x") {
        if (field.useHashes) {
            const yardLine = 50 - (Math.abs(steps) * 5) / 8;
            if (yardLine >= -1e-9) {
                const yards = formatSteps(Math.max(0, yardLine));
                const labelled = yardLine > 0 && Math.abs(yardLine % 10) < 1e-9;
                return {
                    name: namer.yardLine(yards),
                    terseName: yards,
                    ...(labelled ? { fieldLabel: yards } : {}),
                };
            }
            const into = -yardLine;
            if (Math.abs(into - 10) < 1e-9)
                return {
                    name: namer.endZone(),
                    terseName: namer.endZoneShort(),
                };
            const yards = formatSteps(into);
            return {
                name: namer.endZoneLine(yards),
                terseName: namer.endZoneLineShort(yards),
            };
        }
        const line = 5 - Math.abs(steps) / 4;
        if (line >= -1e-9) {
            const text = formatSteps(Math.max(0, line));
            return { name: namer.gridLine(text), terseName: text };
        }
        const sides = field.sideDescriptions ?? DEFAULT_SIDES;
        const outward = formatSteps(Math.abs(steps));
        return {
            name: namer.sideSteps(
                steps < 0 ? sides.verboseLeft : sides.verboseRight,
                outward,
            ),
            terseName: namer.sideStepsShort(
                steps < 0 ? sides.terseLeft : sides.terseRight,
                outward,
            ),
        };
    }
    const behind = formatSteps(Math.abs(steps));
    return {
        name: namer.stepsFromFront(behind),
        terseName: namer.stepsFromFrontShort(behind),
    };
}

/**
 * The automatic names the checkpoint has for where it is, if it still has them (so they may
 * follow it): `namer`'s, or English, so a file named in one language stays automatic in another.
 */
export function autoNamesFor(
    field: NamingField,
    checkpoint: Checkpoint,
    namer: CheckpointNamer = ENGLISH_CHECKPOINT_NAMER,
): AutoCheckpointNames | undefined {
    const namers =
        namer === ENGLISH_CHECKPOINT_NAMER
            ? [namer]
            : [namer, ENGLISH_CHECKPOINT_NAMER];
    return namers
        .map((n) =>
            autoCheckpointNames(
                field,
                checkpoint.axis,
                checkpoint.stepsFromCenterFront,
                n,
            ),
        )
        .find(
            (auto) =>
                checkpoint.name === auto.name &&
                checkpoint.terseName === auto.terseName,
        );
}

/** Whether a checkpoint still has the automatic names for where it is (see `autoNamesFor`) */
export function hasAutoNames(
    field: NamingField,
    checkpoint: Checkpoint,
    namer: CheckpointNamer = ENGLISH_CHECKPOINT_NAMER,
): boolean {
    return autoNamesFor(field, checkpoint, namer) !== undefined;
}
