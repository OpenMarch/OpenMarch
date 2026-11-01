import { isSnapOn, useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { FieldEditorOptions } from "./fieldEditor";
import { ruledMove, type MoveRules } from "./moveRules";

/**
 * The field editor's options that read the app's settings, as they are on each pointer event:
 * a marcher drag follows #197's rules (coordinate rounding, Lock X / Lock Y, and the Snap toggle,
 * which off turns the rounding off), and the rotate handles turn freely with the Snap toggle off
 * (modifier roles, version A). Fine and constrain come from the held roles. `grid` is the field
 * rounding is measured on, null before there is one.
 */
export function settingsMoveOptions(
    grid: () => MoveRules["grid"],
): Pick<FieldEditorOptions, "moveTransform" | "snap"> {
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
            };
        }),
        snap: isSnapOn,
    };
}
