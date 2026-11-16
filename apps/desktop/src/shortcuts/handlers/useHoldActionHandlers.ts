import { useMemo } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useMarcherNameOf } from "@/timeline/useKeepLaterPages";
import {
    canRunOn,
    holdActionOptions,
    useHoldCommands,
} from "@/timeline/useHoldCommands";
import { useExpertHolds } from "@/timeline/useExpertHolds";
import { holdOverWindowOn } from "@/timeline/timelineExpertHolds";
import type { HoldStyle } from "@/timeline/holdStyle";
import {
    useSelectionHoldStyle,
    type SelectionHoldStyle,
} from "@/timeline/useHoldStyle";
import type { ActionId } from "../definitions";
import { useActionHandler } from "../useActionHandler";

/** The hold style actions, and the style each sets (`null` is the show setting). */
export const HOLD_STYLE_ACTIONS = [
    ["timelineHoldStyleDefault", null],
    ["timelineHoldStyleStand", "stand"],
    ["timelineHoldStyleMarkTime", "markTime"],
    ["timelineHoldStyleHighMarkTime", "highMarkTime"],
] as const satisfies readonly (readonly [ActionId, HoldStyle | null])[];

/** The action that sets `style` (`null` is the show setting). */
export const holdStyleActionOf = (style: HoldStyle | null): ActionId =>
    HOLD_STYLE_ACTIONS.find(([, s]) => s === style)![0];

/**
 * One hold style action: on while a selected marcher is Held at the playhead, and checked (so off)
 * when every such hold already has its style.
 */
function useHoldStyleAction(
    [id, style]: (typeof HOLD_STYLE_ACTIONS)[number],
    holdStyle: SelectionHoldStyle,
    isPlaying: boolean,
) {
    const checked = holdStyle.held > 0 && holdStyle.style === style;
    useActionHandler(id, () => holdStyle.set(style), {
        enabled: !isPlaying && holdStyle.held > 0 && !checked,
        checked,
    });
}

/**
 * Holds: **Define as shown** and **Hold from last keyframe** for the selected marchers on the
 * current page box, the one the field shows (the selected page, which follows the paused
 * playhead). They run the page box menu's commands (`useHoldCommands`), so each is one undo step
 * with the menu's toasts, and is off where the menu would say why not or shows it checked (every
 * selected marcher already in its state). Their labels count the marchers they'd change when it's
 * some of the selection (`holdActionOptions`), as the menus do.
 *
 * **Hold from start flag to playhead** (#476) holds the selection over the edit window, in Expert
 * only: one undo step, a toast only about the marchers it left alone, and highlighting it shows
 * the hold it would make.
 *
 * **Hold style** (ADR 0015 D-5, #775): four actions set what the selected marchers' feet do over
 * the Held hold the playhead is in (the show setting, stand, mark time or high mark time). They're
 * on while a selected marcher is Held there, and the one already in effect shows checked.
 */
export function useHoldActionHandlers() {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const idsKey = (selected ?? []).map((m) => m.id).join(",");
    const marcherIds = useMemo(
        () => (idsKey === "" ? [] : idsKey.split(",").map(Number)),
        [idsKey],
    );
    const nameOf = useMarcherNameOf(selected);
    const { pages } = useTimingObjects()!;
    const pageId = useSelectedPage()?.selectedPage?.id;
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const { defineAsShown, holdFromPrevious, entriesOn } = useHoldCommands(
        pages,
        marcherIds,
        nameOf,
    );
    const entries = entriesOn(pageId);
    const expert = useExpertHolds(marcherIds);
    const holdStyle = useSelectionHoldStyle(marcherIds);
    useHoldStyleAction(HOLD_STYLE_ACTIONS[0], holdStyle, isPlaying);
    useHoldStyleAction(HOLD_STYLE_ACTIONS[1], holdStyle, isPlaying);
    useHoldStyleAction(HOLD_STYLE_ACTIONS[2], holdStyle, isPlaying);
    useHoldStyleAction(HOLD_STYLE_ACTIONS[3], holdStyle, isPlaying);

    useActionHandler(
        "timelineDefineAsShown",
        () => {
            if (pageId !== undefined) defineAsShown.onSet(pageId);
        },
        {
            enabled: !isPlaying && canRunOn(defineAsShown, pageId),
            ...holdActionOptions(entries?.defineAsShown),
        },
    );
    useActionHandler(
        "timelineHoldFromPrevious",
        () => {
            if (pageId !== undefined) holdFromPrevious.onSet(pageId);
        },
        {
            enabled: !isPlaying && canRunOn(holdFromPrevious, pageId),
            ...holdActionOptions(entries?.holdFromPrevious),
            preview: (on) => {
                if (pageId !== undefined)
                    holdFromPrevious.onPreview(pageId, on);
            },
        },
    );
    useActionHandler(
        "timelineHoldOverWindow",
        () => {
            if (expert.window)
                void holdOverWindowOn(expert.window, marcherIds, nameOf);
        },
        {
            enabled: !isPlaying && expert.window !== null,
            preview: expert.onPreview,
        },
    );
}
