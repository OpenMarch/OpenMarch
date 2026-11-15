import type { FieldProperties } from "@openmarch/core";
import type { FieldTestFieldEdit } from "@/field/fieldTestApi";
import type { FieldView } from "@/field/editor/view";
import { useFieldEditModeStore } from "./fieldEditModeStore";
import {
    allLines,
    fieldScreenRect,
    lineKey,
    lineLabel,
    lineScreen,
    rulerPx,
    toRef,
} from "./lines";
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    existingSelection,
    isSelected,
    selectionWithTwins,
} from "./lineSelection";

/**
 * The Edit field mode as the field test API reports it (#824): the lines with where to press
 * them, the rulers, the pick, a drag in progress and what's open. Null while the mode is off.
 * `rect` is the field element's box in the viewport.
 */
export function fieldEditTestState(
    fp: FieldProperties | undefined,
    view: Pick<FieldView, "zoom" | "panX" | "panY" | "width" | "height">,
    rect: { left: number; top: number } | null,
): FieldTestFieldEdit | null {
    const state = useFieldEditModeStore.getState();
    if (!state.active || !fp || !rect) return null;
    const selection = existingSelection(fp, state.selection);
    const lit = new Set(
        selectionWithTwins(fp, selection, state.mirror).map(lineKey),
    );
    const field = fieldScreenRect(fp, view);
    const ruler = rulerPx(useInputModeStore.getState().mode === "touch");
    // The middle of the field's part on screen, below and right of the rulers
    const midX =
        (Math.max(field.left, ruler) + Math.min(field.right, view.width)) / 2;
    const midY =
        (Math.max(field.top, ruler) + Math.min(field.bottom, view.height)) / 2;
    const point = (x: number, y: number) => ({
        x: rect.left + x,
        y: rect.top + y,
    });
    return {
        mirror: state.mirror,
        lines: allLines(fp).map((c) => {
            const at = lineScreen(fp, view, c);
            const ref = toRef(c);
            return {
                axis: c.axis,
                id: c.id,
                name: c.name,
                shortName: c.terseName,
                label: lineLabel(fp, c),
                steps: c.stepsFromCenterFront,
                visible: c.visible,
                reference: c.useAsReference,
                fieldLabel: c.fieldLabel ?? null,
                selected: isSelected(selection, ref),
                highlighted: lit.has(lineKey(ref)),
                screen: c.axis === "x" ? point(at, midY) : point(midX, at),
                tab:
                    c.axis === "x"
                        ? point(at, ruler / 2)
                        : point(ruler / 2, at),
            };
        }),
        rulers: {
            x: {
                from: point(ruler, ruler / 2),
                to: point(view.width, ruler / 2),
            },
            y: {
                from: point(ruler / 2, ruler),
                to: point(ruler / 2, view.height),
            },
        },
        drag: state.drag && {
            kind: state.drag.kind,
            axis: state.drag.axis,
            steps: state.drag.steps,
            overRuler: state.drag.overRuler,
        },
    };
}
