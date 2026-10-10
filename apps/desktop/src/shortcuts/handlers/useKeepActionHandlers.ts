import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks";
import { toggleKeepOnPage } from "@/timeline/timelineKeepCommands";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

/** UI-18 keep later pages (timeline mode) */
export function useKeepActionHandlers() {
    const { selectedPage, ready, selectedMarchers, timelineMode } =
        useEditorReadiness();
    const { pages } = useTimingObjects()!;
    const isPlaying = useIsPlaying()?.isPlaying ?? false;

    // K keeps the selection where it holds on this page (on the next page where it moves here),
    // or lets it follow again. No toast: the chain and the inspector line show it
    useActionHandler(
        "toggleKeepOnPage",
        () =>
            void toggleKeepOnPage({
                pages,
                currentPageId: selectedPage!.id,
                marcherIds: selectedMarchers.map((m) => m.id),
            }),
        { enabled: ready && timelineMode && !isPlaying && !!pages },
    );
}
