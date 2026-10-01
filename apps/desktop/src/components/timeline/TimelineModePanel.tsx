import { useMemo, useState } from "react";
import { CornersInIcon, CornersOutIcon } from "@phosphor-icons/react";
import { useTimingObjects } from "@/hooks";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { db } from "@/global/database/db";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { useTimelineTracks } from "@/timeline/useTimelineTracks";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { AudioClock } from "./Clock";
import {
    TimelineMetronomeButton,
    TimelineMuteButton,
} from "./TimelineControls";
import { Timeline, type TimelineSelection } from "./Timeline";
import { useTimelineCommands } from "./useTimelineCommands";
import { useTimelinePlayback } from "./useTimelinePlayback";

/** The page timeline's fullscreen toggle, for the timeline's transport */
function FullscreenButton() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    return (
        <button
            className="text-text enabled:hover:text-accent focus-visible:ring-accent duration-150 ease-out focus-visible:ring-2 focus-visible:outline-none"
            onClick={toggleFullscreen}
            aria-label="Toggle timeline fullscreen"
            aria-pressed={isFullscreen}
        >
            {isFullscreen ? (
                <CornersInIcon size={20} />
            ) : (
                <CornersOutIcon size={20} />
            )}
        </button>
    );
}

/**
 * The timeline (ui.md, from the 0.2 branch) for a file whose timeline dev flag is on. It takes the
 * file's real beats, pages and measures, and plays through the app's existing audio clock.
 */
export default function TimelineModePanel() {
    const { beats, pages, measures } = useTimingObjects()!;
    const playback = useTimelinePlayback({ beats, pages });
    const [selection, setSelection] = useState<TimelineSelection>(null);
    const { isPlaying } = useIsPlaying()!;
    const { setSelectedPage } = useSelectedPage()!;
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers;
    const selectedIdsKey = (selectedMarchers ?? []).map((m) => m.id).join(",");
    const selectedMarcherIds = useMemo(
        () =>
            new Set(
                selectedIdsKey === ""
                    ? []
                    : selectedIdsKey.split(",").map(Number),
            ),
        [selectedIdsKey],
    );
    const timelines = useTimelineTracks({
        database: db,
        enabled: useTimelineMode(),
        selectedMarcherIds,
    });
    const commands = useTimelineCommands({
        database: db,
        timelines,
        selectedMarcherIds,
    });
    const changeSelection = (next: TimelineSelection) => {
        setSelection(next);
        commands.noteSelection(next);
        // Clicking a page in the ruler also seeks to its first beat, which `pageForSeek` reads as
        // the end of the page before it. Select the clicked page itself.
        if (next?.kind === "page" && !isPlaying)
            setSelectedPage({ id: Number(next.pageId) });
    };

    return (
        <Timeline
            mode="expanded"
            className="w-full"
            beats={beats}
            pages={pages}
            measures={measures}
            timelines={timelines}
            playback={playback}
            transportClock={<AudioClock />}
            transportAccessories={
                <>
                    <TimelineMuteButton />
                    <TimelineMetronomeButton />
                    <FullscreenButton />
                </>
            }
            selection={selection}
            selectedTarget={commands.selectedTarget}
            onSelectionChange={changeSelection}
            onTimelineRangeCommit={commands.commitTimelineRange}
            onCreateTrack={commands.createTrack}
        />
    );
}
