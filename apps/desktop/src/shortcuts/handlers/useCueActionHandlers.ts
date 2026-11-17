import { equipmentCatalog, EQUIPMENT_NONE } from "@openmarch/core";
import { useIsPlaying } from "@/context/IsPlayingContext";
import tolgee from "@/global/singletons/Tolgee";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useCueCommands, type CueCommands } from "@/cues/useCueCommands";
import { useCueCarryNotices } from "@/cues/useCueCarryNotices";
import { itemValueId } from "@/cues/equipmentItems";
import {
    setLaneShown,
    useLaneShown,
    TIMELINE_LANES,
    type TimelineLaneDefinition,
} from "@/timeline/timelineLanes";
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
        {
            enabled: !isPlaying && commands.canSet(choice) && !checked,
            checked,
            // Greyed out says why (#1039); in effect, it shows ticked instead
            disabledReason: checked
                ? undefined
                : setReason(commands, isPlaying),
        },
    );
}

/** Why setting equipment (or selecting by it) can't run now, or undefined when it can. */
function setReason(
    commands: CueCommands,
    isPlaying: boolean,
    needsSelection = true,
): string | undefined {
    if (isPlaying) return tolgee.t("cues.reason.paused");
    if (needsSelection && commands.selectedIds.length === 0)
        return tolgee.t("actions.shape.noMarchersSelected");
    if (commands.count === null) return tolgee.t("cues.reason.noCount");
    return undefined;
}

/** Why a cue command can't run now, or undefined when it can. */
function cueReason(
    commands: CueCommands,
    isPlaying: boolean,
): string | undefined {
    if (isPlaying) return tolgee.t("cues.reason.paused");
    if (!commands.cue) return tolgee.t("cues.reason.noCue");
    return undefined;
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

/** One lane's show/hide action, checked while it shows. Moves has move tracks only in Expert. */
function useLaneToggle(lane: TimelineLaneDefinition, basic: boolean) {
    const shown = useLaneShown(lane.id);
    useActionHandler(lane.toggleAction, () => setLaneShown(lane.id, !shown), {
        checked: shown,
        enabled: !(lane.id === "moves" && basic),
        disabledReason:
            lane.id === "moves" && basic
                ? tolgee.t("cues.reason.movesBasic")
                : undefined,
    });
}

/**
 * Equipment cues (ADR 0015; fork #992): set what the selection holds from the paused playhead
 * (an item from the catalog, their own instrument, or nothing), select who holds something there,
 * edit the picked cue, and show or hide the timeline's lanes (Moves and the cue lanes). Every edit is one undo step
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
        {
            enabled: !isPlaying && commands.count !== null,
            disabledReason: setReason(commands, isPlaying, false),
        },
    );
    const cueWhy = cueReason(commands, isPlaying);

    const editable = !isPlaying && commands.cue !== null;
    useActionHandler("cueAddSelected", () => commands.editPerformers("add"), {
        enabled: editable && commands.edited("add") !== null,
        disabledReason:
            cueWhy ??
            (commands.selectedIds.length === 0
                ? tolgee.t("actions.shape.noMarchersSelected")
                : commands.edited("add") === null
                  ? tolgee.t("cues.reason.allIn")
                  : undefined),
    });
    useActionHandler(
        "cueRemoveSelected",
        () => commands.editPerformers("remove"),
        {
            enabled: editable && commands.edited("remove") !== null,
            disabledReason:
                cueWhy ??
                (commands.selectedIds.length === 0
                    ? tolgee.t("actions.shape.noMarchersSelected")
                    : commands.edited("remove") === null
                      ? tolgee.t("cues.reason.noneIn")
                      : undefined),
        },
    );
    const lasting = commands.cue?.length === null;
    useActionHandler("cueMakeLasting", () => commands.setLength(null), {
        enabled: editable && !lasting,
        checked: editable && lasting,
        disabledReason: cueWhy,
    });
    useActionHandler(
        "cueMakeMomentary",
        (args) => {
            const length = Number(args?.length ?? 8);
            if (Number.isInteger(length) && length >= 1)
                commands.setLength(length);
        },
        { enabled: editable, disabledReason: cueWhy },
    );
    useActionHandler("cueMoveToPlayhead", () => commands.moveToPlayhead(), {
        enabled:
            editable &&
            commands.beatId !== null &&
            commands.cue?.beatId !== commands.beatId,
        disabledReason:
            cueWhy ??
            (commands.beatId === null
                ? tolgee.t("cues.reason.noCount")
                : commands.cue?.beatId === commands.beatId
                  ? tolgee.t("cues.reason.atPlayhead")
                  : undefined),
    });
    useActionHandler("cueDelete", () => commands.deleteCue(), {
        enabled: editable,
        disabledReason: cueWhy,
    });

    const basic = useIsBasicMode();
    for (const lane of TIMELINE_LANES)
        // eslint-disable-next-line react-hooks/rules-of-hooks -- TIMELINE_LANES never changes
        useLaneToggle(lane, basic);
}
