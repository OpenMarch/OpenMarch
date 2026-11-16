/**
 * The timeline's cue lanes (ADR 0015 D-7): one per cue type, each shown or hidden from the
 * timeline's lane menu, all hidden by default. Only the lanes that are built are listed: a new
 * type's lane joins `CUE_LANES` with its toggle action when it is built (Facing, Position, Look…).
 */
import type { CueType } from "@openmarch/core";
import type { ActionId } from "@/shortcuts/definitions";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

export interface CueLaneDefinition {
    readonly type: CueType;
    /** The lane's name, in the menu and its heading */
    readonly labelKey: string;
    /** Shows or hides it, so the palette and the menu run the same command */
    readonly toggleAction: ActionId;
}

export const CUE_LANES: readonly CueLaneDefinition[] = [
    {
        type: "equipment",
        labelKey: "cues.lane.equipment",
        toggleAction: "toggleEquipmentLane",
    },
];

/** Whether the timeline shows `type`'s lane. */
export const useCueLaneShown = (type: CueType): boolean =>
    useUiSettingsStore((s) => s.uiSettings.timelineCueLanes.includes(type));

/** Whether `type`'s lane is folded into its summary row. */
export const useCueLaneFolded = (type: CueType): boolean =>
    useUiSettingsStore((s) =>
        s.uiSettings.timelineFoldedCueLanes.includes(type),
    );

const toggled = (list: readonly string[], type: string, on: boolean) =>
    on ? [...new Set([...list, type])] : list.filter((t) => t !== type);

/** Shows or hides `type`'s lane (saved with the UI settings, per device). */
export function setCueLaneShown(type: CueType, shown: boolean): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        timelineCueLanes: toggled(uiSettings.timelineCueLanes, type, shown),
    });
}

/** Folds or opens `type`'s lane. */
export function setCueLaneFolded(type: CueType, folded: boolean): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        timelineFoldedCueLanes: toggled(
            uiSettings.timelineFoldedCueLanes,
            type,
            folded,
        ),
    });
}
