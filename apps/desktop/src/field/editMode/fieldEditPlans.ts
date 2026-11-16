import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    diffFieldProperties,
    FIELD_TEMPLATE_IDS,
    type FieldEditRequest,
    type FieldTemplateId,
} from "@/field/edits";
import { linesOn } from "./lines";

/**
 * The Edit field mode's plans (#824) that are more than one edit's args: which template the
 * field is based on and how far it has moved from it, and a new width or depth as edits.
 */

/** The template a field is based on: the one with its name (a customized field keeps it) */
export function baseTemplateOf(
    fp: Pick<FieldProperties, "name">,
): { id: FieldTemplateId; template: FieldProperties } | null {
    for (const id of FIELD_TEMPLATE_IDS) {
        const template = FieldPropertiesTemplates[id] as FieldProperties;
        if (template.name === fp.name) return { id, template };
    }
    return null;
}

/** Settings that say nothing about how the field differs from its template */
const NOT_A_CHANGE = new Set(["name", "isCustom"]);

/**
 * How many things differ between the field and its template: lines added, removed, renamed or
 * changed (lines are paired by position, so a moved line counts as one removed and one added),
 * and settings. The mode's bar shows it ("Based on College football · 3 changes").
 */
export function changesFromTemplate(
    fp: FieldProperties,
    template: FieldProperties,
): number {
    const diff = diffFieldProperties("compare", template, fp, {
        match: "position",
    });
    const { added, removed, moved, renamed, changed } = diff.checkpoints;
    return (
        added.length +
        removed.length +
        moved.length +
        renamed.length +
        changed.length +
        diff.settings.filter(
            (s) => !NOT_A_CHANGE.has(s.key.split(".")[0] ?? ""),
        ).length
    );
}

export type ResizePlan =
    | { readonly ok: true; readonly edits: readonly FieldEditRequest[] }
    | {
          readonly ok: false;
          /** "too-small": a line inside would end up on or outside the new edge; "invalid": not a size */
          readonly reason: "too-small" | "invalid";
      };

/**
 * A new width (steps, X) or depth (steps behind the front, Y) as edits: the outer lines move to
 * the new edge (owner, #824: no margin around them), the rest stay put. The width stays centered
 * on the 50. Refused when a line inside would end up on or past the new edge.
 */
export function resizeField(
    fp: FieldProperties,
    axis: "x" | "y",
    size: number,
): ResizePlan {
    if (!Number.isFinite(size) || size <= 0)
        return { ok: false, reason: "invalid" };
    const lines = linesOn(fp, axis);
    if (lines.length < 2) return { ok: false, reason: "invalid" };
    if (axis === "x") {
        const half = Number((size / 2).toFixed(6));
        const left = lines[0]!;
        const right = lines[lines.length - 1]!;
        const inside = lines.slice(1, -1);
        if (inside.some((c) => Math.abs(c.stepsFromCenterFront) >= half))
            return { ok: false, reason: "too-small" };
        const edits: FieldEditRequest[] = [];
        if (right.stepsFromCenterFront !== half)
            edits.push(move(right.id, "x", half));
        if (left.stepsFromCenterFront !== -half)
            edits.push(move(left.id, "x", -half));
        return { ok: true, edits };
    }
    // Y lists front to back: the last is the back line
    const back = lines[lines.length - 1]!;
    const to = -Number(size.toFixed(6));
    if (lines.slice(0, -1).some((c) => c.stepsFromCenterFront <= to + 1e-6))
        return { ok: false, reason: "too-small" };
    return {
        ok: true,
        edits: back.stepsFromCenterFront === to ? [] : [move(back.id, "y", to)],
    };
}

const move = (id: number, axis: "x" | "y", to: number): FieldEditRequest => ({
    edit: "moveCheckpoints",
    args: { ids: [{ axis, id }], to },
});
