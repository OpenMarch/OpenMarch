import {
    CaretUpIcon,
    CornersInIcon,
    CornersOutIcon,
    DotsThreeVerticalIcon,
    FastForwardIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
    MetronomeIcon,
    PauseIcon,
    PencilSimpleIcon,
    PlayIcon,
    RewindIcon,
    SkipBackIcon,
    SkipForwardIcon,
    SpeakerSimpleHighIcon,
    WaveformIcon,
} from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import clsx from "clsx";
import { useTolgee } from "@tolgee/react";
import { Slider } from "@openmarch/ui";
import ActionButton from "@/shortcuts/ActionButton";
import { getActionLabel } from "@/shortcuts/labels";
import type { ActionId } from "@/shortcuts/definitions";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { TOUCH_TARGET_CLASS } from "./touchTargets";
import { useTimelineLayoutStore } from "./timelineLayoutStore";
import {
    TIMELINE_BASE_PX_PER_SEC,
    TIMELINE_MAX_PX_PER_SEC,
    TIMELINE_MIN_PX_PER_SEC,
    TIMELINE_ZOOM_STEP,
} from "./pinchZoom";

const ICON_BUTTON = clsx(
    "text-text enabled:hover:text-accent flex size-44 shrink-0 items-center justify-center rounded-6 disabled:cursor-not-allowed disabled:opacity-50",
);

const MENU_ROW =
    "text-body text-text hover:text-accent flex min-h-44 w-full items-center gap-8 text-left disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The compact (touch) timeline's transport: previous page, play/pause and
 * next page, then a "…" menu with everything else the full transport card
 * has (first/last page, metronome, volume, fullscreen), the timeline zoom
 * and the audio editor.
 */
export function CompactTransport({
    zoomTo,
}: {
    zoomTo: (pixelsPerSecond: number) => void;
}) {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { t } = useTolgee();
    const label = (id: ActionId) =>
        getActionLabel(id, (key, params) => t(key, params as never));

    const noPrevious =
        !selectedPage || selectedPage.previousPageId === null || isPlaying;
    const noNext =
        !selectedPage || selectedPage.nextPageId === null || isPlaying;

    return (
        <div
            className="flex shrink-0 items-center gap-2"
            aria-label={t("timeline.controls.label")}
        >
            <ActionButton
                action="previousPage"
                className={TOUCH_TARGET_CLASS}
                disabled={noPrevious}
            >
                <SkipBackIcon size={24} />
            </ActionButton>
            <ActionButton
                action="playPause"
                className={TOUCH_TARGET_CLASS}
                disabled={
                    !selectedPage ||
                    (!isPlaying && selectedPage.nextPageId === null)
                }
            >
                {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </ActionButton>
            <ActionButton
                action="nextPage"
                className={TOUCH_TARGET_CLASS}
                disabled={noNext}
            >
                <SkipForwardIcon size={24} />
            </ActionButton>
            <TimelineMoreMenu
                zoomTo={zoomTo}
                label={label}
                noPrevious={noPrevious}
                noNext={noNext}
            />
        </div>
    );
}

// eslint-disable-next-line max-lines-per-function
function TimelineMoreMenu({
    zoomTo,
    label,
    noPrevious,
    noNext,
}: {
    zoomTo: (pixelsPerSecond: number) => void;
    label: (id: ActionId) => string;
    noPrevious: boolean;
    noNext: boolean;
}) {
    const { t } = useTolgee();
    const [open, setOpen] = useState(false);
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );
    const pixels = useUiSettingsStore(
        (s) => s.uiSettings.timelinePixelsPerSecond,
    );
    const audioVolume = useUiSettingsStore((s) => s.uiSettings.audioVolume);
    const setAudioVolume = useUiSettingsStore((s) => s.setAudioVolume);
    const isMetronomeOn = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleMetronome = useMetronomeStore((s) => s.toggleMetronome);
    const close = () => setOpen(false);

    /** An action as a labelled menu row; the menu closes after it runs. */
    const actionRow = (
        id: ActionId,
        icon: React.ReactNode,
        disabled = false,
    ) => (
        <ActionButton
            action={id}
            className={MENU_ROW}
            disabled={disabled}
            onRun={close}
        >
            {icon}
            {label(id)}
        </ActionButton>
    );

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={t("timeline.compact.more")}
                    title={t("timeline.compact.more")}
                >
                    <DotsThreeVerticalIcon size={24} weight="bold" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    side="top"
                    align="start"
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex w-[260px] flex-col gap-2 border p-12 backdrop-blur-md"
                >
                    {actionRow(
                        "firstPage",
                        <RewindIcon size={20} />,
                        noPrevious,
                    )}
                    {actionRow(
                        "lastPage",
                        <FastForwardIcon size={20} />,
                        noNext,
                    )}
                    <button
                        type="button"
                        className={clsx(
                            MENU_ROW,
                            isMetronomeOn && "text-accent",
                        )}
                        aria-pressed={isMetronomeOn}
                        onClick={toggleMetronome}
                    >
                        <MetronomeIcon size={20} />
                        {t("timeline.compact.metronome")}
                    </button>
                    <div className="flex min-h-44 items-center gap-8">
                        <SpeakerSimpleHighIcon size={20} className="shrink-0" />
                        <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[audioVolume]}
                            onValueChange={(values) =>
                                setAudioVolume(values[0] ?? 0)
                            }
                            aria-label="Timeline volume slider"
                        />
                        <span className="text-sub w-36 text-right font-mono">
                            {audioVolume}%
                        </span>
                    </div>
                    <button
                        type="button"
                        className={MENU_ROW}
                        onClick={() => {
                            toggleFullscreen();
                            close();
                        }}
                        disabled={focussedComponent === "timeline"}
                    >
                        {isFullscreen ? (
                            <CornersInIcon size={20} />
                        ) : (
                            <CornersOutIcon size={20} />
                        )}
                        {t("timeline.compact.fullscreen")}
                    </button>
                    {actionRow("focusTimeline", <PencilSimpleIcon size={20} />)}
                    {/* Timeline zoom (pinch zooms too) */}
                    <div className="border-stroke mt-4 flex min-h-44 items-center gap-4 border-t pt-4">
                        <span className="text-sub text-text-subtitle flex-1">
                            {t("timeline.compact.zoom")}
                        </span>
                        <button
                            type="button"
                            className={ICON_BUTTON}
                            onClick={() => zoomTo(pixels / TIMELINE_ZOOM_STEP)}
                            disabled={pixels <= TIMELINE_MIN_PX_PER_SEC}
                            aria-label="Zoom timeline out"
                            title="Zoom timeline out"
                        >
                            <MagnifyingGlassMinusIcon size={22} />
                        </button>
                        <button
                            type="button"
                            className="text-sub min-h-44 w-48 font-mono"
                            onClick={() => zoomTo(TIMELINE_BASE_PX_PER_SEC)}
                            title="Reset timeline zoom"
                        >
                            {Math.round(
                                (pixels / TIMELINE_BASE_PX_PER_SEC) * 100,
                            )}
                            %
                        </button>
                        <button
                            type="button"
                            className={ICON_BUTTON}
                            onClick={() => zoomTo(pixels * TIMELINE_ZOOM_STEP)}
                            disabled={pixels >= TIMELINE_MAX_PX_PER_SEC}
                            aria-label="Zoom timeline in"
                            title="Zoom timeline in"
                        >
                            <MagnifyingGlassPlusIcon size={22} />
                        </button>
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

/**
 * The compact row's right end: show or hide the waveform, and expand to
 * the full timeline.
 */
export function CompactViewToggles({ audioForced }: { audioForced: boolean }) {
    const { t } = useTolgee();
    const showAudio = useTimelineLayoutStore((s) => s.showAudio);
    const setShowAudio = useTimelineLayoutStore((s) => s.setShowAudio);
    const setExpanded = useTimelineLayoutStore((s) => s.setExpanded);
    const audioLabel = t(
        showAudio ? "timeline.compact.hideAudio" : "timeline.compact.showAudio",
    );
    return (
        <div className="border-stroke flex shrink-0 items-center gap-2 border-l pl-4">
            <button
                type="button"
                className={clsx(ICON_BUTTON, showAudio && "text-accent")}
                aria-label={audioLabel}
                title={audioLabel}
                aria-pressed={showAudio || audioForced}
                disabled={audioForced}
                onClick={() => setShowAudio(!showAudio)}
            >
                <WaveformIcon size={24} />
            </button>
            <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t("timeline.compact.expand")}
                title={t("timeline.compact.expand")}
                onClick={() => setExpanded(true)}
            >
                <CaretUpIcon size={24} weight="bold" />
            </button>
        </div>
    );
}
