/**
 * Playback controls (ui.md UI-4): previous page, play or pause, next page.
 * The editor owns playback, so each button asks it to run the matching
 * action, exactly as its own timeline buttons do. The window follows the
 * clock the editor then sends.
 */
import { useTranslate } from "@tolgee/react";
import {
    PauseIcon,
    PlayIcon,
    SkipBackIcon,
    SkipForwardIcon,
} from "@phosphor-icons/react";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { Panel, ToggleButton } from "./Panel";
import { transportState } from "./playback";

export function TransportBar() {
    const { t } = useTranslate();
    const { pages } = useTimingObjects();
    const selectedPageId = useView3dSyncStore(
        (s) => s.selection.selectedPageId,
    );
    const playing = useView3dSyncStore((s) => !!s.clock?.playing);
    const can = transportState(pages, selectedPageId, playing);
    const request = window.view3d.requestPlayback;

    const playLabel = t(
        playing ? "view3d.playback.pause" : "view3d.playback.play",
    );
    return (
        <Panel
            label={t("view3d.playback.label")}
            testId="view3d-transport"
            className="shrink-0"
        >
            <ToggleButton
                onClick={() => request("previousPage")}
                disabled={!can.previousPage}
                icon={<SkipBackIcon size={16} />}
                label={t("view3d.playback.previousPage")}
                tooltip={t("view3d.playback.previousPage")}
                tooltipSide="top"
                iconOnly
                testId="view3d-previous-page"
            />
            <ToggleButton
                onClick={() => request("playPause")}
                disabled={!can.playPause}
                icon={
                    playing ? (
                        <PauseIcon size={16} weight="fill" />
                    ) : (
                        <PlayIcon size={16} weight="fill" />
                    )
                }
                label={playLabel}
                tooltip={playLabel}
                tooltipSide="top"
                iconOnly
                testId="view3d-play-pause"
            />
            <ToggleButton
                onClick={() => request("nextPage")}
                disabled={!can.nextPage}
                icon={<SkipForwardIcon size={16} />}
                label={t("view3d.playback.nextPage")}
                tooltip={t("view3d.playback.nextPage")}
                tooltipSide="top"
                iconOnly
                testId="view3d-next-page"
            />
        </Panel>
    );
}
