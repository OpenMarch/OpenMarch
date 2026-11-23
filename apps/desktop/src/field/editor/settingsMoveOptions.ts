import type { FieldProperties } from "@openmarch/core";
import { isSnapOn, useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { FieldEditorOptions } from "./fieldEditor";
import { LINE_PULL_PX, fieldLinesOf, type LinePull } from "./linePull";
import { ruledMove, type MoveRules } from "./moveRules";

/**
 * The field editor's options that read the app's settings, as they are on each pointer event:
 * a marcher drag follows #197's rules (coordinate rounding, Lock X / Lock Y, and the Snap toggle,
 * which off turns the rounding off), and the rotate handles turn freely with the Snap toggle off
 * (modifier roles, version A). Fine and constrain come from the held roles. `grid` is the field
 * rounding is measured on, null before there is one.
 *
 * With `field` (the field and its zoom), a dragged or resized selection also lands on the field's
 * lines (#585), within {@link LINE_PULL_PX} on screen, on each axis coordinate rounding leaves
 * free: where rounding is on, the grid decides, so a group keeps its offset from it.
 */
export function settingsMoveOptions(
    grid: () => MoveRules["grid"],
    field?: () => { properties: FieldProperties; zoom: number } | null,
): Pick<FieldEditorOptions, "moveTransform" | "snap" | "pull"> {
    const pull = (): LinePull | null => {
        const now = field?.();
        if (!now) return null;
        const reach = LINE_PULL_PX / (now.zoom || 1);
        const { coordinateRounding } = useUiSettingsStore.getState().uiSettings;
        const free = (steps: number | undefined) => (steps ? 0 : reach);
        return {
            lines: fieldLinesOf(now.properties),
            radius: {
                x: free(coordinateRounding?.nearestXSteps),
                y: free(coordinateRounding?.nearestYSteps),
            },
        };
    };
    return {
        moveTransform: ruledMove(() => {
            const { coordinateRounding, lockX, lockY } =
                useUiSettingsStore.getState().uiSettings;
            return {
                rounding: coordinateRounding,
                lockX,
                lockY,
                grid: grid(),
                snap: isSnapOn(),
                pull: pull(),
            };
        }),
        snap: isSnapOn,
        pull,
    };
}
