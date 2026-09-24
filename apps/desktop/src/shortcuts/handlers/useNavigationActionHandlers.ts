import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import Page, { getNextPage, getPreviousPage } from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

export function useNavigationActionHandlers() {
    const { selectedPage, ready } = useEditorReadiness();
    const setSelectedPage =
        useSelectedPage()?.setSelectedPage ?? (() => undefined);
    const { pages } = useTimingObjects()!;
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying ?? (() => {});
    const toggleMetronome = useMetronomeStore()?.toggleMetronome ?? (() => {});
    const canNavigate = ready && !!pages && pages.length > 0;

    const go = (target: Page | null | undefined) => {
        if (target && !isPlaying) setSelectedPage(target);
    };

    useActionHandler("nextPage", () => go(getNextPage(selectedPage!, pages)), {
        enabled: canNavigate,
    });
    useActionHandler(
        "previousPage",
        () => go(getPreviousPage(selectedPage!, pages)),
        { enabled: canNavigate },
    );
    useActionHandler("firstPage", () => go(pages[0]), {
        enabled: canNavigate,
    });
    useActionHandler("lastPage", () => go(pages[pages.length - 1]), {
        enabled: canNavigate,
    });
    useActionHandler(
        "playPause",
        () => {
            if (getNextPage(selectedPage!, pages)) setIsPlaying(!isPlaying);
        },
        { enabled: canNavigate },
    );
    useActionHandler("toggleMetronome", () => toggleMetronome());
}
