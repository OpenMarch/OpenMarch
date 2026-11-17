/**
 * Field edits (#823): the one way the field's properties change.
 *
 * Each edit is a pure function `(fieldProperties, args) → { next, diff }` with plain-data args
 * (`types.ts`). Calling one is the dry run: nothing is written and the input is never mutated.
 * `diff` lists the checkpoints added, removed, moved, renamed and changed, the settings changed,
 * whether the size, center or step size changed, and why the edit was refused (`errors`, with
 * `ok: false`) or what to know (`warnings`). Applying one is `applyFieldEdit`
 * (`db-functions/fieldEdits.ts`): one transaction with history, so one undo step.
 *
 * The invariants every edit keeps (`checkFieldInvariants`): at least 2 checkpoints per axis,
 * unique ids per axis, no two checkpoints at the same steps, Y at or behind the front, a step
 * size above 0. An edit may leave a field as broken as it found it, never more. X asymmetry is a
 * warning (it's allowed today, with a banner); mirrored edits keep X symmetric.
 *
 * Each also takes `FieldEditOptions`: the `namer` that words automatic names (the app passes one
 * built from its translations; English without) and `allowGeometryChange`.
 *
 * Callers: the field customizer, the command palette (`useFieldEditActionHandlers`); next the
 * "Edit field" mode (#824), previews (#825) and agents, which call `runFieldEdit` by name.
 */
import type { FieldProperties } from "@openmarch/core";
import {
    addCheckpoint,
    addCheckpointSeries,
    moveCheckpoints,
    removeCheckpoints,
    updateCheckpoints,
} from "./checkpointEdits";
import { applyTemplate, setFieldSettings } from "./settingsEdits";
import { diffFieldProperties, fieldResized } from "./diff";
import type {
    FieldEditArgsMap,
    FieldEditIssue,
    FieldEditName,
    FieldEditOptions,
    FieldEditRequest,
    FieldEditResult,
} from "./types";

export * from "./types";
export {
    addCheckpoint,
    addCheckpointSeries,
    largestGapMidpoint,
    moveCheckpoints,
    removeCheckpoints,
    updateCheckpoints,
} from "./checkpointEdits";
export {
    applyTemplate,
    FIELD_TEMPLATE_IDS,
    GEOMETRY_KEYS,
    LOOK_KEYS,
    setFieldSettings,
    type FieldTemplateId,
} from "./settingsEdits";
export {
    checkFieldInvariants,
    FIELD_STEP_RESOLUTION,
    fieldGeometry,
    MIN_CHECKPOINTS_PER_AXIS,
    mirrorTwin,
    swapSideNames,
} from "./fieldModel";
export {
    autoCheckpointNames,
    autoNamesFor,
    ENGLISH_CHECKPOINT_NAMER,
    hasAutoNames,
    type AutoCheckpointNames,
    type CheckpointNamer,
} from "./naming";
export { diffFieldProperties } from "./diff";

type FieldEditFn<K extends FieldEditName> = (
    fp: FieldProperties,
    args: FieldEditArgsMap[K],
    options?: FieldEditOptions,
) => FieldEditResult;

/** Every edit by name */
export const FIELD_EDITS: { readonly [K in FieldEditName]: FieldEditFn<K> } = {
    addCheckpoint,
    addCheckpointSeries,
    removeCheckpoints,
    moveCheckpoints,
    updateCheckpoints,
    setFieldSettings,
    applyTemplate,
};

export const FIELD_EDIT_NAMES = Object.keys(FIELD_EDITS) as FieldEditName[];

export function isFieldEditName(name: unknown): name is FieldEditName {
    return (
        typeof name === "string" &&
        (FIELD_EDIT_NAMES as readonly string[]).includes(name)
    );
}

function refused(
    fp: FieldProperties,
    edit: string,
    errors: readonly FieldEditIssue[],
    warnings: readonly FieldEditIssue[] = [],
): FieldEditResult {
    return {
        next: fp,
        diff: diffFieldProperties(edit, fp, fp, { errors, warnings }),
    };
}

/** With `allowGeometryChange: false`, a result that resizes or moves the field becomes a refusal */
function guardGeometry(
    fp: FieldProperties,
    result: FieldEditResult,
    options: FieldEditOptions | undefined,
): FieldEditResult {
    const { diff } = result;
    if (
        options?.allowGeometryChange !== false ||
        !diff.ok ||
        !(diff.geometry.sizeChanged || diff.geometry.centerChanged)
    )
        return result;
    return refused(
        fp,
        diff.edit,
        [fieldResized(diff.geometry)],
        diff.warnings.filter((w) => w.code !== "field-resized"),
    );
}

/**
 * Runs an edit by name: the dry run. Unknown names and malformed args come back as a refused
 * diff, never a throw, so an agent can send anything.
 */
export function runFieldEdit(
    fp: FieldProperties,
    request: FieldEditRequest | { edit: string; args: unknown },
    options?: FieldEditOptions,
): FieldEditResult {
    if (!isFieldEditName(request?.edit))
        return refused(fp, String(request?.edit), [
            {
                code: "unknown-edit",
                message: `No field edit "${String(request?.edit)}". Edits: ${FIELD_EDIT_NAMES.join(", ")}`,
            },
        ]);
    const run = FIELD_EDITS[request.edit] as FieldEditFn<FieldEditName>;
    try {
        return guardGeometry(
            fp,
            run(fp, (request.args ?? {}) as never, options),
            options,
        );
    } catch (error) {
        // A malformed arg the checks missed: still a refusal, not a crash
        return refused(fp, request.edit, [
            {
                code: "invalid-args",
                message: error instanceof Error ? error.message : String(error),
            },
        ]);
    }
}

/**
 * Runs several edits as one (one request, one undo step when applied): each sees the field the
 * one before left. If any is refused, all are, and the diff carries that edit's errors. The diff
 * compares the field before the first with the field after the last; its `edit` names them all.
 * Anything but a list comes back refused (`invalid-args`), never a throw; an empty list is an
 * empty edit.
 */
export function runFieldEdits(
    fp: FieldProperties,
    requests: readonly (FieldEditRequest | { edit: string; args: unknown })[],
    options?: FieldEditOptions,
): FieldEditResult {
    if (!Array.isArray(requests))
        return refused(fp, "runFieldEdits", [
            {
                code: "invalid-args",
                message: "Field edits must be a list of { edit, args }",
            },
        ]);
    // One edit keeps its own diff (applyTemplate pairs checkpoints by position and lists `kept`)
    if (requests.length === 1) return runFieldEdit(fp, requests[0]!, options);
    const name = requests.map((r) => String(r?.edit)).join("+");
    let current = fp;
    // Whether the field ends up resized is the chain's to say, not each step's
    const steps = { ...options, allowGeometryChange: true };
    const warnings: FieldEditIssue[] = [];
    const add = (issues: readonly FieldEditIssue[]) =>
        warnings.push(...issues.filter((w) => w.code !== "field-resized"));
    for (const request of requests) {
        const { next, diff } = runFieldEdit(current, request, steps);
        if (!diff.ok) {
            add(diff.warnings);
            return refused(fp, name, diff.errors, warnings);
        }
        add(diff.warnings);
        current = next;
    }
    const diff = diffFieldProperties(name, fp, current, { warnings });
    return guardGeometry(
        fp,
        { next: diff.empty ? fp : current, diff },
        options,
    );
}
