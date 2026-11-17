import type { FieldProperties, FieldPropertyArgs } from "@openmarch/core";
import { diffFieldProperties, type CheckpointMatch } from "./diff";
import {
    buildField,
    checkFieldInvariants,
    checkpointsOn,
    isExistingIssue,
} from "./fieldModel";
import type { FieldEditIssue, FieldEditResult } from "./types";

/**
 * The invariant violations `after` has that `before` didn't. An edit may leave a field as broken
 * as it found it (an imported field with Y in front can still be renamed), never more.
 */
export function newViolations(
    before: FieldProperties,
    after: FieldPropertyArgs,
): FieldEditIssue[] {
    const beforeIssues = checkFieldInvariants(before);
    return checkFieldInvariants(after).flatMap((issue): FieldEditIssue[] => {
        if (issue.code === "min-checkpoints") {
            const axis = issue.axis!;
            return checkpointsOn(after, axis).length <
                checkpointsOn(before, axis).length ||
                !isExistingIssue(issue, beforeIssues)
                ? [issue]
                : [];
        }
        if (issue.code === "y-in-front") {
            const wasInFront = new Set(
                before.yCheckpoints
                    .filter((c) => c.stepsFromCenterFront > 0)
                    .map((c) => c.id),
            );
            const fresh = (issue.checkpoints ?? []).filter(
                (ref) => !wasInFront.has(ref.id),
            );
            return fresh.length > 0 ? [{ ...issue, checkpoints: fresh }] : [];
        }
        return isExistingIssue(issue, beforeIssues) ? [] : [issue];
    });
}

/**
 * Ends every edit: refuses it on its own errors or on a new invariant violation (a new X
 * asymmetry is only a warning), builds the field and diffs it. A refused or empty edit returns
 * the input itself as `next`, so applying it writes nothing.
 */
export function finishEdit(
    edit: string,
    before: FieldProperties,
    after: FieldPropertyArgs | null,
    {
        errors = [],
        warnings = [],
        match,
        kept,
    }: {
        errors?: readonly FieldEditIssue[];
        warnings?: readonly FieldEditIssue[];
        match?: CheckpointMatch;
        kept?: readonly string[];
    } = {},
): FieldEditResult {
    const refuse = (why: readonly FieldEditIssue[]): FieldEditResult => ({
        next: before,
        diff: diffFieldProperties(edit, before, before, {
            errors: why,
            warnings,
        }),
    });
    if (errors.length > 0 || after === null)
        return refuse(
            errors.length > 0
                ? errors
                : [{ code: "invalid-args", message: "Nothing to do" }],
        );
    const violations = newViolations(before, after);
    const hard = violations.filter((issue) => issue.code !== "asymmetric-x");
    if (hard.length > 0) return refuse(hard);
    const soft = violations.filter((issue) => issue.code === "asymmetric-x");
    const next = buildField(after);
    const diff = diffFieldProperties(edit, before, next, {
        match,
        warnings: [...warnings, ...soft],
        kept,
    });
    return { next: diff.empty ? before : next, diff };
}

export function invalidArgs(message: string): FieldEditIssue {
    return { code: "invalid-args", message };
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
