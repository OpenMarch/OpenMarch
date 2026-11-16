import { equipmentCatalog, EQUIPMENT_NONE } from "@openmarch/core";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useCueCommands, type CueCommands } from "@/cues/useCueCommands";
import { useCueCarryNotices } from "@/cues/useCueCarryNotices";
import { itemValueId } from "@/cues/equipmentItems";
import {
    setCueLaneShown,
    useCueLaneShown,
    type CueLaneDefinition,
    CUE_LANES,
} from "@/cues/cueLanes";
import {
    EQUIPMENT_FAMILY_KEYS,
    EQUIPMENT_ITEM_KEYS,
    equipmentActionOf,
    selectFamilyActionOf,
    selectHoldingActionOf,
    type ActionId,
} from "../definitions";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";

/** Every Equipment action, by what it sets: each catalog item, their own instrument, nothing. */
const SET_CHOICES = ["usual", ...EQUIPMENT_ITEM_KEYS, "none"] as const;

/** One Equipment action: on with a selection at a count, checked when they all hold it already. */
function useSetEquipment(
    choice: (typeof SET_CHOICES)[number],
    commands: CueCommands,
    isPlaying: boolean,
) {
    const checked = commands.holdsAlready(choice);
    useActionHandler(
        equipmentActionOf(choice),
        () => commands.setEquipment(choice),
        { enabled: !isPlaying && commands.canSet(choice) && !checked, checked },
    );
}

/** What each Select action selects: the Equipment values it covers, by action. */
const SELECT_VALUES: ReadonlyMap<ActionId, readonly string[]> = new Map<
    ActionId,
    readonly string[]
>([
    ...EQUIPMENT_ITEM_KEYS.map((key): [ActionId, string[]] => [
        selectHoldingActionOf(key),
        [itemValueId(key)],
    ]),
    ...EQUIPMENT_FAMILY_KEYS.map((family): [ActionId, string[]] => [
        selectFamilyActionOf(family),
        equipmentCatalog(family).map((v) => v.id),
    ]),
    [selectHoldingActionOf("none"), [EQUIPMENT_NONE]],
]);
const SELECT_ACTIONS = [...SELECT_VALUES.keys()];

/** One lane's show/hide action, checked while it shows. */
function useCueLaneToggle(lane: CueLaneDefinition) {
    const shown = useCueLaneShown(lane.type);
    useActionHandler(
        lane.toggleAction,
        () => setCueLaneShown(lane.type, !shown),
        { checked: shown },
    );
}

/**
 * Equipment cues (ADR 0015; fork #992): set what the selection holds from the paused playhead
 * (an item from the catalog, their own instrument, or nothing), select who holds something there,
 * edit the picked cue, and show or hide the cue lanes. Every edit is one undo step
 * (`useCueCommands`). Also says what a beat deletion did to the cues on those beats
 * (`useCueCarryNotices`).
 */
export function useCueActionHandlers() {
    useCueCarryNotices();
    const commands = useCueCommands();
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    // A fixed list, so the hooks run in the same order every render
    for (const choice of SET_CHOICES)
        // eslint-disable-next-line react-hooks/rules-of-hooks -- SET_CHOICES never changes
        useSetEquipment(choice, commands, isPlaying);
    useActionHandlerGroup(
        SELECT_ACTIONS,
        (id) => commands.selectHolding(SELECT_VALUES.get(id) ?? []),
        { enabled: !isPlaying && commands.count !== null },
    );

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
    useActionHandler("cueMoveToPlayhead", () => commands.moveToPlayhead(), {
        enabled:
            editable &&
            commands.beatId !== null &&
            commands.cue?.beatId !== commands.beatId,
    });
    useActionHandler("cueDelete", () => commands.deleteCue(), {
        enabled: editable,
    });

    for (const lane of CUE_LANES)
        // eslint-disable-next-line react-hooks/rules-of-hooks -- CUE_LANES never changes
        useCueLaneToggle(lane);
}
