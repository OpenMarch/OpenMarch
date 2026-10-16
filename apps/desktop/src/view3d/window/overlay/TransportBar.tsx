/**
 * Playback controls (ui.md UI-4): the editor's own Previous, Play and Next
 * and its speed button, with their tooltips and modifier clicks. The editor
 * owns playback, so each one asks it to run the matching action, as its own
 * transport does; the window follows the clock the editor then sends.
 */
import { useCallback } from "react";
import { useTranslate } from "@tolgee/react";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { PlaybackSpeedButton } from "@/components/timeline/PlaybackSpeedButton";
import { TransportTooltipProvider } from "@/components/timeline/ShortcutTooltip";
import {
    TransportNavigationButton,
    TransportPlayButton,
} from "@/components/timeline/TransportButtons";
import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import type { View3dPlaybackAction } from "@/view3d/sync/protocol";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { Panel, PanelSeparator } from "./Panel";

/** The editor's action for each of Previous's and Next's moves */
const NAVIGATION_ACTIONS: Record<TimelineNavigation, View3dPlaybackAction> = {
    "previous-page": "previousPage",
    "next-page": "nextPage",
    "first-page": "firstPage",
    "last-page": "lastPage",
    "previous-beat": "previousBeat",
    "next-beat": "nextBeat",
};

const request = (action: View3dPlaybackAction) =>
    window.view3d.requestPlayback(action);

export function TransportBar() {
    const { t } = useTranslate();
    const { pages } = useTimingObjects();
    const playing = useView3dSyncStore((s) => !!s.clock?.playing);
    const playLoops = useView3dSyncStore((s) => !!s.clock?.playLoops);
    // As in the editor, the buttons work whenever the show has pages; a move
    // with nowhere to go does nothing
    const ready = pages.length > 0;
    const onNavigate = useCallback(
        (target: TimelineNavigation) => request(NAVIGATION_ACTIONS[target]),
        [],
    );
    const onPlayingChange = useCallback(() => request("playPause"), []);
    const onPlayFromPlayhead = useCallback(() => request("playPage"), []);

    return (
        <TransportTooltipProvider>
            <Panel
                label={t("view3d.playback.label")}
                testId="view3d-transport"
                className="shrink-0"
            >
                <TransportNavigationButton
                    direction="previous"
                    onNavigate={ready ? onNavigate : undefined}
                    testIdPrefix="view3d"
                />
                <TransportPlayButton
                    isPlaying={playing}
                    onPlayingChange={ready ? onPlayingChange : undefined}
                    playLoops={playLoops}
                    onPlayFromPlayhead={ready ? onPlayFromPlayhead : undefined}
                    testIdPrefix="view3d"
                />
                <TransportNavigationButton
                    direction="next"
                    onNavigate={ready ? onNavigate : undefined}
                    testIdPrefix="view3d"
                />
                <PanelSeparator />
                <SpeedButton />
            </Panel>
        </TransportTooltipProvider>
    );
}

/**
 * The editor's playback speed, with the editor's own speed button: its
 * tooltip, click and Shift+click steps, and right-click slider and chips.
 */
function SpeedButton() {
    const speed = useView3dSyncStore((s) => s.clock?.speed ?? 1);
    const chosen = useView3dSyncStore((s) => s.clock?.chosenSpeed ?? 1);
    return (
        <PlaybackSpeedButton
            speed={chosen}
            playing={speed}
            held={speed !== chosen}
            onStep={(back) =>
                request(back ? "previousPlaybackSpeed" : "nextPlaybackSpeed")
            }
            onSetSpeed={(next) => window.view3d.requestPlaybackSpeed(next)}
            className="h-24 min-w-40"
            testId="view3d-speed"
        />
    );
}
