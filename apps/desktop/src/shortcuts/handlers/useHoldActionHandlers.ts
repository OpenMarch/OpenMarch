import { useMemo } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useMarcherNameOf } from "@/timeline/useKeepLaterPages";
import { canRunOn, useHoldCommands } from "@/timeline/useHoldCommands";
import { useActionHandler } from "../useActionHandler";

/**
 * Holds: **Define as shown** and **Hold from previous page** for the selected marchers on the
 * current page box, the one the field shows (the selected page, which follows the paused
 * playhead). They run the page box menu's commands (`useHoldCommands`), so each is one undo step
 * with the menu's toasts, and is off where the menu would say why not.
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
    const { defineAsShown, holdFromPrevious } = useHoldCommands(
        pages,
        marcherIds,
        nameOf,
    );

    useActionHandler(
        "timelineDefineAsShown",
        () => {
            if (pageId !== undefined) defineAsShown.onSet(pageId);
        },
        { enabled: !isPlaying && canRunOn(defineAsShown, pageId) },
    );
    useActionHandler(
        "timelineHoldFromPrevious",
        () => {
            if (pageId !== undefined) holdFromPrevious.onSet(pageId);
        },
        { enabled: !isPlaying && canRunOn(holdFromPrevious, pageId) },
    );
}
