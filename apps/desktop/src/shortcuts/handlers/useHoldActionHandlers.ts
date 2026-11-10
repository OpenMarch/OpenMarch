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
import { useActionHandler } from "../useActionHandler";

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
