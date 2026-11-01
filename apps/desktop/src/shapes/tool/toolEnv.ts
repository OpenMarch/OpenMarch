import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import type { ShapeField } from "../field/shapeField";
import { useShapeEditorStore } from "../frame/shapeEditorStore";
import type { XY } from "../types";
import type { FieldProperties } from "@openmarch/core";
import { fieldReferenceLines } from "@/field/fieldPlan";
import type { FieldLines, ToolEnv } from "./toolKind";
import { useLastLayoutStore } from "./lastLayout";
import type { Roles } from "@/input/modifierRoles";
import type { NudgeArgs } from "@/shortcuts/definitions";
import { isSnapOn } from "@/stores/UiSettingsStore";

/** How far from a handle a press still takes it, in screen pixels */
export const HANDLE_REACH_PX = 10;

/**
 * How near one of the field's lines a box's moving edge must come to land on it, in screen
 * pixels (#425). Kept small so half steps win away from lines; the lab tunes it.
 */
export const EDGE_PULL_PX = 6;

/** The field's lines, worked out once per field */
const linesByField = new WeakMap<FieldProperties, FieldLines>();
const fieldLinesOf = (fieldProperties: FieldProperties): FieldLines => {
    let lines = linesByField.get(fieldProperties);
    if (!lines) {
        lines = fieldReferenceLines(fieldProperties);
        linesByField.set(fieldProperties, lines);
    }
    return lines;
};

/** Marchers drawn by the shape tool stand on half steps from the center front point */
const HALF_STEP_ROUNDING = {
    coordinateRounding: { nearestXSteps: 0.5, nearestYSteps: 0.5 },
} as const;

/** No role held: what a change from outside a drag (a menu, a button, a typed number) reads */
export const NO_ROLES: Roles = {
    fine: false,
    constrain: false,
    fromCenter: false,
};

/**
 * The tool's view of the field for one pointer event, with the roles held then (version A,
 * docs/timeline/research/shapes/modifier-roles.md). `snapOn` is the Snap toggle, read from the
 * settings when the env is made unless given, so a change mid-drag applies on the next move. A
 * dragged pivot snaps to every marcher drawn, and to `spots` (an open shape's, where its marchers
 * will stand).
 */
export function toolEnvFor(
    field: ShapeField,
    roles: Roles = NO_ROLES,
    {
        snapOn = isSnapOn(),
        spots,
    }: { snapOn?: boolean; spots?: () => readonly XY[] } = {},
): ToolEnv {
    const { fieldProperties } = field;
    const editor = useShapeEditorStore.getState();
    // fine is off the half-step ladder and still pulled onto the field's lines (owner on #453); the
    // Snap toggle off snaps nothing
    const snap = snapOn && !roles.fine;
    return {
        stepPx: fieldProperties.pixelsPerStep,
        snap,
        pull: snapOn,
        fine: roles.fine,
        constrain: roles.constrain,
        fromCenter: roles.fromCenter,
        gridSnap: (p) => {
            if (!snap) return p;
            const r = getRoundCoordinates2({
                coordinate: { xPixels: p.x, yPixels: p.y },
                fieldProperties,
                uiSettings: HALF_STEP_ROUNDING,
            });
            return { x: r.xPixels, y: r.yPixels };
        },
        hitRadius: HANDLE_REACH_PX / (field.zoom() || 1),
        fieldLines: fieldLinesOf(fieldProperties),
        pullRadius: EDGE_PULL_PX / (field.zoom() || 1),
        // constrain flips the box's ratio lock for the drag: one idea, not two (modifier roles, 2)
        ratioLocked: editor.ratioLocked !== roles.constrain,
        layout: useLastLayoutStore.getState().family,
        pivotSnaps: () => [
            ...field.drawn(field.marchers().map((m) => m.id)).values(),
            ...(spots?.() ?? []),
        ],
    };
}

/**
 * The env a keyboard nudge moves a shape with: the Fine and Tenth nudges are `fine`, the Free ones
 * move with snapping off, as the Snap toggle does; with the toggle off, none snaps
 */
export function nudgeEnvFor(
    field: ShapeField,
    nudge: Pick<NudgeArgs, "step" | "snap">,
): ToolEnv {
    const fine =
        !nudge.snap && (nudge.step === "quarter" || nudge.step === "tenth");
    return toolEnvFor(
        field,
        { ...NO_ROLES, fine },
        { snapOn: isSnapOn() && (nudge.snap || fine) },
    );
}
