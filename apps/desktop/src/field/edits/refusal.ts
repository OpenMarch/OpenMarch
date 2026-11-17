import type { FieldProperties } from "@openmarch/core";
import { runFieldEdits } from "./index";
import { fieldEditIssueMessage } from "./messages";
import type { FieldEditOptions, FieldEditRequest } from "./types";

type Translate = (
    key: string,
    params?: Record<string, string | number>,
) => string;

/**
 * Why `edits` would be refused on `fp`, in words for the user, or undefined when they'd run. The
 * edits are only worked out, never written: a control shows this greyed out beforehand instead of
 * a toast after the press. No field yet, or no edit, gives no reason.
 */
export function fieldEditRefusal(
    fp: FieldProperties | undefined,
    edits: FieldEditRequest | readonly FieldEditRequest[] | null | undefined,
    t: Translate,
    options?: FieldEditOptions,
): string | undefined {
    if (!fp || !edits) return undefined;
    const list = Array.isArray(edits) ? edits : [edits as FieldEditRequest];
    if (list.length === 0) return undefined;
    const issue = runFieldEdits(fp, list, options).diff.errors[0];
    return issue ? fieldEditIssueMessage(issue, t, true) : undefined;
}
