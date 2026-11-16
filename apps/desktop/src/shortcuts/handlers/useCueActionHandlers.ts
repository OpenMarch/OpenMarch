import type { PerformerCarry } from "@openmarch/core";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useCueCommands, type CueCommands } from "@/cues/useCueCommands";
import { useCueCarryNotices } from "@/cues/useCueCarryNotices";
import type { EquipmentChoice } from "@/cues/equipment";
import type { ActionId } from "../definitions";
import { useActionHandler } from "../useActionHandler";

/** The Equipment actions, by what they set. */
export const EQUIPMENT_ACTIONS = [
    ["equipmentInstrument", "instrument"],
    ["equipmentFlag", "flag"],
    ["equipmentRifle", "rifle"],
    ["equipmentSabre", "sabre"],
    ["equipmentNone", "none"],
] as const satisfies readonly (readonly [ActionId, EquipmentChoice])[];

/** The Select-by-equipment actions, by what they select; "instrument" is horns and drums. */
export const SELECT_HOLDING_ACTIONS = [
    ["selectHoldingRifle", "rifle"],
    ["selectHoldingFlag", "flag"],
    ["selectHoldingSabre", "sabre"],
    ["selectHoldingInstrument", "instrument"],
    ["selectHoldingNone", "none"],
] as const satisfies readonly (readonly [
    ActionId,
    Exclude<PerformerCarry, "winds" | "battery"> | "instrument",
])[];

/** Whether `choice` is what every selected performer holds at the playhead. */
const holdsAlready = (commands: CueCommands, choice: EquipmentChoice) => {
    const holds = commands.selectionHolds;
    if (holds === null) return false;
    return choice === "instrument"
        ? holds === "winds" || holds === "battery"
        : holds === choice;
};

function useEquipmentAction(
    [id, choice]: (typeof EQUIPMENT_ACTIONS)[number],
    commands: CueCommands,
    isPlaying: boolean,
) {
    const checked = holdsAlready(commands, choice);
    useActionHandler(id, () => commands.setEquipment(choice), {
        enabled: !isPlaying && commands.canSet(choice) && !checked,
        checked,
    });
}

function useSelectHoldingAction(
    [id, holds]: (typeof SELECT_HOLDING_ACTIONS)[number],
    commands: CueCommands,
    isPlaying: boolean,
) {
    useActionHandler(
        id,
        () => {
            if (holds === "instrument") {
                commands.selectHolding("winds", "battery");
            } else commands.selectHolding(holds);
        },
        { enabled: !isPlaying && commands.count !== null },
    );
}

/**
 * Equipment cues (ADR 0015; fork #992): set what the selection holds from the paused playhead,
 * select who holds something there, edit the picked cue, and show or hide the Equipment lane.
 * Every edit is one undo step (`useCueCommands`). Also says what a beat deletion did to the cues
 * on those beats (`useCueCarryNotices`).
 */
export function useCueActionHandlers() {
    useCueCarryNotices();
    const commands = useCueCommands();
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    useEquipmentAction(EQUIPMENT_ACTIONS[0], commands, isPlaying);
    useEquipmentAction(EQUIPMENT_ACTIONS[1], commands, isPlaying);
    useEquipmentAction(EQUIPMENT_ACTIONS[2], commands, isPlaying);
    useEquipmentAction(EQUIPMENT_ACTIONS[3], commands, isPlaying);
    useEquipmentAction(EQUIPMENT_ACTIONS[4], commands, isPlaying);
    useSelectHoldingAction(SELECT_HOLDING_ACTIONS[0], commands, isPlaying);
    useSelectHoldingAction(SELECT_HOLDING_ACTIONS[1], commands, isPlaying);
    useSelectHoldingAction(SELECT_HOLDING_ACTIONS[2], commands, isPlaying);
    useSelectHoldingAction(SELECT_HOLDING_ACTIONS[3], commands, isPlaying);
    useSelectHoldingAction(SELECT_HOLDING_ACTIONS[4], commands, isPlaying);

    const editable = !isPlaying && commands.cue !== null;
    useActionHandler("cueAddSelected", () => commands.editPerformers("add"), {
        enabled: editable && commands.edited("add") !== null,
    });
    useActionHandler(
        "cueRemoveSelected",
        () => commands.editPerformers("remove"),
        { enabled: editable && commands.edited("remove") !== null },
    );
    const lasting = commands.cue?.length === null;
    useActionHandler("cueMakeLasting", () => commands.setLength(null), {
        enabled: editable && !lasting,
        checked: editable && lasting,
    });
    useActionHandler(
        "cueMakeMomentary",
        (args) => {
            const length = Number(args?.length ?? 8);
            if (Number.isInteger(length) && length >= 1)
                commands.setLength(length);
        },
        { enabled: editable },
    );
    useActionHandler("cueDelete", () => commands.deleteCue(), {
        enabled: editable,
    });

    const laneShown = useUiSettingsStore(
        (s) => s.uiSettings.timelineEquipmentLane,
    );
    useActionHandler(
        "toggleEquipmentLane",
        () => {
            const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
            setUiSettings({
                ...uiSettings,
                timelineEquipmentLane: !uiSettings.timelineEquipmentLane,
            });
        },
        { checked: laneShown },
    );
}
