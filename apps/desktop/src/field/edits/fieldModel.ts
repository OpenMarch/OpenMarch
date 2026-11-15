import {
    FieldProperties,
    type Checkpoint,
    type FieldPropertyArgs,
} from "@openmarch/core";
import type {
    CheckpointRef,
    FieldAxis,
    FieldEditIssue,
    FieldGeometry,
} from "./types";

/**
 * Positions round to a hundredth of a step: the precision the templates use (85.33 for the real
 * back sideline), and enough to keep float drift (0.1 + 0.2) out of the stored steps.
 */
export const FIELD_STEP_RESOLUTION = 0.01;

/**
 * Positions closer than this are the same position: half the resolution, so two positions that
 * snap to the same hundredth (26.666667 and 26.67) are one spot, and a float tail never splits one
 */
export const POSITION_EPSILON = FIELD_STEP_RESOLUTION / 2;

/** A field needs at least this many checkpoints on each axis (ReadableCoords needs one) */
export const MIN_CHECKPOINTS_PER_AXIS = 2;

/** The longest checkpoint name the customizer accepts */
export const MAX_CHECKPOINT_NAME_LENGTH = 40;

export function samePosition(a: number, b: number): boolean {
    return Math.abs(a - b) < POSITION_EPSILON;
}

/** Rounds to `resolution` steps, without float tails or -0 */
export function snapSteps(
    steps: number,
    resolution = FIELD_STEP_RESOLUTION,
): number {
    const snapped =
        resolution > 0 ? Math.round(steps / resolution) * resolution : steps;
    const clean = Number(snapped.toFixed(6));
    return clean === 0 ? 0 : clean;
}

/** The constructor args of a field: exactly the stored keys, nothing derived */
export function fieldArgs(fp: FieldProperties): FieldPropertyArgs {
    return {
        name: fp.name,
        xCheckpoints: fp.xCheckpoints,
        yCheckpoints: fp.yCheckpoints,
        yardNumberCoordinates: fp.yardNumberCoordinates,
        sideDescriptions: fp.sideDescriptions,
        halfLineXInterval: fp.halfLineXInterval,
        halfLineYInterval: fp.halfLineYInterval,
        stepSizeInches: fp.stepSizeInches,
        stepSizeWarningThresholdInches: fp.stepSizeWarningThresholdInches,
        measurementSystem: fp.measurementSystem,
        topLabelsVisible: fp.topLabelsVisible,
        bottomLabelsVisible: fp.bottomLabelsVisible,
        leftLabelsVisible: fp.leftLabelsVisible,
        rightLabelsVisible: fp.rightLabelsVisible,
        useHashes: fp.useHashes,
        isCustom: fp.isCustom,
        showFieldImage: fp.showFieldImage,
        imageFillOrFit: fp.imageFillOrFit,
        backgroundImageOpacity: fp.backgroundImageOpacity,
        theme: fp.theme,
    };
}

/** The settings outside the checkpoints, by stored key */
export const SETTING_KEYS = [
    "name",
    "stepSizeInches",
    "stepSizeWarningThresholdInches",
    "measurementSystem",
    "halfLineXInterval",
    "halfLineYInterval",
    "sideDescriptions",
    "yardNumberCoordinates",
    "topLabelsVisible",
    "bottomLabelsVisible",
    "leftLabelsVisible",
    "rightLabelsVisible",
    "useHashes",
    "isCustom",
    "showFieldImage",
    "imageFillOrFit",
    "backgroundImageOpacity",
    "theme",
] as const satisfies readonly (keyof FieldPropertyArgs)[];

export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * A new field from args. Never throws for the edits' own outputs: ids are checked before (the
 * constructor throws on a duplicate id).
 */
export function buildField(args: FieldPropertyArgs): FieldProperties {
    return new FieldProperties(args);
}

export function checkpointsOn(
    fp: FieldProperties | FieldPropertyArgs,
    axis: FieldAxis,
): Checkpoint[] {
    return axis === "x" ? fp.xCheckpoints : fp.yCheckpoints;
}

export function withCheckpoints(
    fp: FieldProperties,
    axis: FieldAxis,
    checkpoints: Checkpoint[],
): FieldPropertyArgs {
    const args = fieldArgs(fp);
    return axis === "x"
        ? { ...args, xCheckpoints: checkpoints }
        : { ...args, yCheckpoints: checkpoints };
}

/** Sorted by position, front to back for Y reads as most negative first, as the customizer lists */
export function sortCheckpoints(checkpoints: Checkpoint[]): Checkpoint[] {
    return [...checkpoints].sort(
        (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
    );
}

/**
 * The id a new checkpoint on an axis gets: one above the highest id on it.
 *
 * Deleting the line with the highest id and then adding one reuses that id. Allocating above the
 * highest id ever used would need a counter stored in the file, which the format doesn't have
 * (and #823 changes no format). So an id names a line only while it exists: a caller holding
 * refs across edits (a preview, an agent) re-reads them from the latest diff or field.
 */
export function nextCheckpointId(checkpoints: readonly Checkpoint[]): number {
    return checkpoints.reduce((max, c) => (c.id > max ? c.id : max), -1) + 1;
}

export function findCheckpoint(
    fp: FieldProperties,
    ref: CheckpointRef,
): Checkpoint | undefined {
    return checkpointsOn(fp, ref.axis).find((c) => c.id === ref.id);
}

/**
 * The X checkpoint mirrored across the center from `checkpoint` (at -steps), if there is one.
 * Twins are found by position; nothing stores the pair. The center line has no twin.
 */
export function mirrorTwin(
    checkpoints: readonly Checkpoint[],
    checkpoint: Checkpoint,
): Checkpoint | undefined {
    if (
        checkpoint.axis !== "x" ||
        samePosition(checkpoint.stepsFromCenterFront, 0)
    )
        return undefined;
    // Several candidates only in a file with stacked lines: the nearest, then the lowest id
    const off = (c: Checkpoint) =>
        Math.abs(c.stepsFromCenterFront + checkpoint.stepsFromCenterFront);
    return checkpoints
        .filter(
            (c) =>
                c.id !== checkpoint.id &&
                samePosition(
                    c.stepsFromCenterFront,
                    -checkpoint.stepsFromCenterFront,
                ),
        )
        .sort((a, b) => off(a) - off(b) || a.id - b.id)[0];
}

/** Swaps the side descriptions in a name ("S1 45" ↔ "S2 45", "Side 1" ↔ "Side 2") */
export function swapSideNames(
    text: string,
    sides: FieldProperties["sideDescriptions"],
): string {
    const pairs: [string, string][] = [
        [sides.verboseLeft, sides.verboseRight],
        [sides.terseLeft, sides.terseRight],
    ].filter(([a, b]) => a && b && a !== b) as [string, string][];
    // Longest first, so "Side 1" is swapped before a terse "S1" inside it could be
    pairs.sort((p, q) => q[0].length - p[0].length);
    let out = text;
    const marks: [string, string][] = [];
    pairs.forEach(([left, right], i) => {
        const leftMark = `\u0001${i}L\u0001`;
        const rightMark = `\u0001${i}R\u0001`;
        out = out.split(left).join(leftMark).split(right).join(rightMark);
        marks.push([leftMark, right], [rightMark, left]);
    });
    for (const [mark, replacement] of marks)
        out = out.split(mark).join(replacement);
    return out;
}

export function fieldGeometry(fp: FieldProperties): FieldGeometry {
    const extent = (cs: readonly Checkpoint[], pick: "min" | "max") =>
        cs.reduce(
            (acc, c) =>
                pick === "min"
                    ? Math.min(acc, c.stepsFromCenterFront)
                    : Math.max(acc, c.stepsFromCenterFront),
            0,
        );
    const minXSteps = extent(fp.xCheckpoints, "min");
    const maxXSteps = extent(fp.xCheckpoints, "max");
    const minYSteps = extent(fp.yCheckpoints, "min");
    const maxYSteps = extent(fp.yCheckpoints, "max");
    return {
        minXSteps,
        maxXSteps,
        minYSteps,
        maxYSteps,
        widthSteps: maxXSteps - minXSteps,
        heightSteps: maxYSteps - minYSteps,
        stepSizeInches: fp.stepSizeInches,
        widthPixels: fp.width,
        heightPixels: fp.height,
        centerFrontPoint: {
            xPixels: fp.centerFrontPoint.xPixels,
            yPixels: fp.centerFrontPoint.yPixels,
        },
    };
}

/**
 * The field's invariants, each violation as an issue:
 * - at least 2 checkpoints per axis;
 * - unique ids per axis;
 * - no two checkpoints at the same steps on an axis;
 * - every Y checkpoint at or behind the front (steps ≤ 0);
 * - a step size above 0;
 * - X symmetric: the leftmost and rightmost X checkpoints equidistant from center (the 2D field
 *   puts its center halfway between them, B8). Reported as `asymmetric-x`, which edits treat as a
 *   warning.
 *
 * Works on args too, so it can check a field the constructor would throw on (duplicate ids).
 */
export function checkFieldInvariants(
    fp: FieldProperties | FieldPropertyArgs,
): FieldEditIssue[] {
    const issues: FieldEditIssue[] = [];
    for (const axis of ["x", "y"] as const) {
        const cs = checkpointsOn(fp, axis);
        if (cs.length < MIN_CHECKPOINTS_PER_AXIS)
            issues.push({
                code: "min-checkpoints",
                axis,
                message: `The ${axis.toUpperCase()} axis needs at least ${MIN_CHECKPOINTS_PER_AXIS} checkpoints`,
            });
        const byId = new Map<number, Checkpoint[]>();
        for (const c of cs) byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
        for (const [id, same] of byId)
            if (same.length > 1)
                issues.push({
                    code: "duplicate-id",
                    axis,
                    checkpoints: same.map((c) => ({ axis, id: c.id })),
                    message: `Two ${axis.toUpperCase()} checkpoints share the id ${id}`,
                });
        for (const same of groupByPosition(cs))
            if (same.length > 1)
                issues.push({
                    code: "duplicate-position",
                    axis,
                    checkpoints: same.map((c) => ({ axis, id: c.id })),
                    message: `There is already a ${axis.toUpperCase()} checkpoint at ${snapSteps(same[0]!.stepsFromCenterFront)} steps`,
                });
    }
    const inFront = fp.yCheckpoints.filter(
        (c) => c.stepsFromCenterFront > POSITION_EPSILON,
    );
    if (inFront.length > 0)
        issues.push({
            code: "y-in-front",
            axis: "y",
            checkpoints: inFront.map((c) => ({ axis: "y", id: c.id })),
            message:
                "Y checkpoints must be at or behind the front of the field (steps ≤ 0)",
        });
    if (!(fp.stepSizeInches === undefined || fp.stepSizeInches > 0))
        issues.push({
            code: "invalid-step-size",
            message: "The step size must be more than 0",
        });
    if (fp.xCheckpoints.length > 0) {
        const xs = fp.xCheckpoints.map((c) => c.stepsFromCenterFront);
        const min = Math.min(0, ...xs);
        const max = Math.max(0, ...xs);
        if (!samePosition(-min, max))
            issues.push({
                code: "asymmetric-x",
                axis: "x",
                message: `The leftmost and rightmost X checkpoints aren't the same distance from center (${min} and ${max} steps)`,
            });
    }
    return issues;
}

/**
 * Checkpoints grouped by spot: sorted by position (then id), each group the run of checkpoints
 * within POSITION_EPSILON of its first. Deterministic for any input order.
 */
export function groupByPosition(
    checkpoints: readonly Checkpoint[],
): Checkpoint[][] {
    const sorted = [...checkpoints].sort(
        (a, b) =>
            a.stepsFromCenterFront - b.stepsFromCenterFront || a.id - b.id,
    );
    const groups: Checkpoint[][] = [];
    for (const c of sorted) {
        const group = groups[groups.length - 1];
        if (
            group &&
            samePosition(group[0]!.stepsFromCenterFront, c.stepsFromCenterFront)
        )
            group.push(c);
        else groups.push([c]);
    }
    return groups;
}

/** Whether every checkpoint `issue` names was named together by one of `before` (same code and axis) */
function withinEarlierGroup(
    issue: FieldEditIssue,
    before: readonly FieldEditIssue[],
): boolean {
    const ids = (issue.checkpoints ?? []).map((r) => r.id);
    return before.some((old) => {
        if (old.code !== issue.code || old.axis !== issue.axis) return false;
        const pool = (old.checkpoints ?? []).map((r) => r.id);
        // Each id used once: a group may shrink, never grow
        return ids.every((id) => {
            const at = pool.indexOf(id);
            if (at < 0) return false;
            pool.splice(at, 1);
            return true;
        });
    });
}

/**
 * Whether `issue` (found after an edit) is one the field already had. Stacked lines and shared
 * ids are the same violation only while their group is a subset of a group that was there: a
 * third line moved onto two stacked lines is new, removing one of three isn't.
 */
export function isExistingIssue(
    issue: FieldEditIssue,
    before: readonly FieldEditIssue[],
): boolean {
    if (issue.code === "duplicate-position" || issue.code === "duplicate-id")
        return withinEarlierGroup(issue, before);
    return before.some(
        (old) => old.code === issue.code && old.axis === issue.axis,
    );
}
