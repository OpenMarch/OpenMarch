import WaveSurfer from "wavesurfer.js";
import { keepWaveformFromScrolling } from "./keepWaveformFromScrolling";
import {
    SyntheticEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { TAP_BEATS_ACTION_IDS, type ActionId } from "@/shortcuts/definitions";
import { runAction } from "@/shortcuts/registry";
import ActionButton from "@/shortcuts/ActionButton";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { TOUCH_TARGET_CLASS } from "../touchTargets";
import clsx from "clsx";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
// @ts-ignore - Importing the regions plugin
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import {
    EditableTimingMarkersPlugin,
    PX_PER_SEC_CSS_VAR,
} from "./EditableTimingMarkersPlugin";
import {
    darkProgressColor,
    lightProgressColor,
    waveColor,
} from "./AudioPlayer";
import {
    BooksIcon,
    CaretLeftIcon,
    CaretRightIcon,
    HandTapIcon,
    PauseIcon,
    PlayIcon,
    RewindIcon,
} from "@phosphor-icons/react";
import Beat from "@/global/classes/Beat";
import { Button } from "@openmarch/ui";
import {
    useReplaceAllBeatObjects,
    createNewTemporaryBeats,
    createNewTemporaryMeasures,
} from "./EditableAudioPlayerUtils";
import { useTheme } from "@/context/ThemeContext";
import Measure from "@/global/classes/Measure";
import { T, useTolgee } from "@tolgee/react";
import { normalizeVolume } from "./volume";

/**
 * Editable version of the AudioPlayer component.
 * Pass the ref of the timeline container so this component can scroll
 */
// eslint-disable-next-line max-lines-per-function
export default function EditableAudioPlayer() {
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const setCanvasFocussed = () =>
        useUiSettingsStore.setState((state) => ({
            uiSettings: { ...state.uiSettings, focussedComponent: "canvas" },
        }));
    // We'll use beats later for creating regions based on timing objects
    const { beats, pages, measures, utility, fetchTimingObjects } =
        useTimingObjects();
    const { selectedAudioFile } = useSelectedAudioFile()!;
    const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);
    const timingMarkersPlugin = useRef<TimingMarkersPlugin | null>(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

    const [beatsToDisplay, setBeatsToDisplay] = useState<"real" | "temporary">(
        "real",
    );
    const [temporaryBeats, setTemporaryBeats] = useState<Beat[]>([]);
    const [temporaryMeasures, setTemporaryMeasures] = useState<Measure[]>([]);
    const replaceAllBeatObjectsMutation = useReplaceAllBeatObjects();
    const isTouchMode = useIsTouchMode();
    const { t } = useTolgee();
    // Beats added per press of the on-screen Tap button (keys 1-9 pick their own)
    const [beatsPerTap, setBeatsPerTap] = useState(1);
    const tapBeats = useCallback(
        () => runAction(`timelineTapBeats${beatsPerTap}` as ActionId),
        [beatsPerTap],
    );

    const togglePlayPause = useCallback(() => {
        if (!waveSurfer) return;

        if (isAudioPlaying) {
            waveSurfer.pause();
        } else {
            void waveSurfer.play();
        }
        setIsAudioPlaying(!isAudioPlaying);
    }, [waveSurfer, isAudioPlaying]);

    useEffect(() => {
        if (!selectedAudioFile) return;
        AudioFile.getSelectedAudioFile().then((audioFile) => {
            if (!audioFile || !audioFile.data) return;
            const blob = new Blob([audioFile.data], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            setAudioFileUrl(url);
        });
        return () => {
            if (audioFileUrl) window.URL.revokeObjectURL(audioFileUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAudioFile]);

    useEffect(() => {
        if (audioRef.current && waveformRef.current && waveSurfer == null) {
            const ws = WaveSurfer.create({
                // sync with the main audio element
                media: audioRef.current,
                container: waveformRef.current,

                // this should be dynamic, but the parent is given height through tailwind currently
                height: 120,
                width: audioDuration * 40,

                // hide the default cursor
                cursorWidth: 4,

                // this should be dynamic, and not hardcoded in the parent. this probably belongs in a store
                minPxPerSec: 40,

                // pretty up the waveform
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                barHeight: 1.2,
                waveColor,
                progressColor:
                    theme === "dark" ? darkProgressColor : lightProgressColor,

                // make it dumb
                interact: true,
                hideScrollbar: true,
                autoScroll: false,
            });

            // Initialize regions plugin
            const regions = ws.registerPlugin(RegionsPlugin.create());

            const timelineMarkersPlugin = new EditableTimingMarkersPlugin(
                regions,
                beats,
                measures,
                fetchTimingObjects,
                utility?.default_beat_duration ?? 0.5,
            );
            timingMarkersPlugin.current = timelineMarkersPlugin;
            // Create regions when the audio is decoded
            ws.on("decode", () => {
                timelineMarkersPlugin.createTimingMarkers();
            });

            keepWaveformFromScrolling(ws);
            setWaveSurfer(ws);
        }
        return () => {
            waveSurfer?.destroy();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioRef, waveformRef, audioDuration]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = uiSettings.audioMuted;
            audioRef.current.volume = normalizeVolume(uiSettings.audioVolume);
        }
    }, [audioFileUrl, uiSettings.audioMuted, uiSettings.audioVolume]);

    useActionHandlerGroup(
        TAP_BEATS_ACTION_IDS,
        (_id, args) => {
            if (!waveSurfer) return;
            const eventNum = Number(args?.count);
            if (
                !isNaN(eventNum) &&
                beatsToDisplay === "temporary" &&
                eventNum > 0
            ) {
                const currentTime = waveSurfer.getCurrentTime();
                const totalDuration = waveSurfer.getDuration();

                const updatedBeats = createNewTemporaryBeats({
                    currentTime,
                    totalDuration,
                    existingTemporaryBeats: temporaryBeats,
                    numNewBeats: eventNum,
                });

                if (updatedBeats.length > 0) {
                    setTemporaryBeats(updatedBeats);
                }

                const updatedMeasures = createNewTemporaryMeasures({
                    currentBeats: updatedBeats,
                    currentMeasures: temporaryMeasures,
                    newCounts: eventNum,
                    currentTime,
                });
                console.debug("temporary measures", updatedMeasures);
                setTemporaryMeasures(updatedMeasures);

                timingMarkersPlugin.current?.updateTimingMarkers(
                    updatedBeats,
                    updatedMeasures,
                );
            }
        },
        { enabled: beatsToDisplay === "temporary" && !!waveSurfer },
    );
    useActionHandler("timelinePlayPause", () => togglePlayPause());

    // Update measures and beats when they change
    useEffect(() => {
        if (timingMarkersPlugin.current == null || beatsToDisplay !== "real")
            return;
        timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
    }, [beats, beatsToDisplay, measures, temporaryBeats]);

    useEffect(() => {
        if (waveSurfer == null) return;

        waveSurfer.setOptions({
            minPxPerSec: uiSettings.timelinePixelsPerSecond,
            width: audioDuration * uiSettings.timelinePixelsPerSecond,
        });
    }, [audioDuration, waveSurfer, uiSettings.timelinePixelsPerSecond]);

    const handleAudioLoaded = (event: SyntheticEvent<HTMLAudioElement>) => {
        let audioElement = event.target as HTMLAudioElement;
        setAudioDuration(audioElement.duration);
    };

    /**
     * Resets beat mapping by creating a new temporary beat configuration
     * based on the first existing beat and the current audio playback time.
     * Sets the display mode to show temporary beats.
     */
    const triggerTapNewTempo = () => {
        if (!waveSurfer) return;

        const temporaryBeats = [
            beats[0],
            {
                id: -1,
                position: 1,
                duration: waveSurfer.getCurrentTime(),
                includeInMeasure: true,
                notes: null,
                index: 1,
                timestamp: 0,
            },
        ];
        const temporaryMeasures: Measure[] = [];
        setTemporaryBeats(temporaryBeats);
        setTemporaryMeasures(temporaryMeasures);
        setBeatsToDisplay("temporary");
        timingMarkersPlugin.current?.updateTimingMarkers(
            temporaryBeats,
            temporaryMeasures,
        );
    };

    const handleSave = async () => {
        try {
            await replaceAllBeatObjectsMutation.mutateAsync({
                newBeats: temporaryBeats,
                oldBeats: beats,
                newMeasures: temporaryMeasures,
                oldMeasures: measures,
                pages,
            });
            setBeatsToDisplay("real");
        } catch (error) {
            // Error handling is done in the mutation hook
            console.error("Error saving beats:", error);
        }
    };

    const handleCancel = () => {
        setBeatsToDisplay("real");
        setTemporaryBeats([]);
        setTemporaryMeasures([]);
    };

    return (
        <div className="relative h-128 pl-[40px]">
            {audioFileUrl && (
                <audio
                    ref={audioRef}
                    src={audioFileUrl}
                    preload="auto"
                    onLoadedMetadata={(event) => handleAudioLoaded(event)}
                />
            )}

            <div
                id="waveform"
                ref={waveformRef}
                // The zoom, for the beat markers' touch hit strips
                style={
                    {
                        [PX_PER_SEC_CSS_VAR]:
                            uiSettings.timelinePixelsPerSecond,
                    } as React.CSSProperties
                }
            ></div>
            <div className="border-stroke rounded-6 bg-modal backdrop-blur-32 shadow-modal fixed bottom-[212px] z-50 flex w-fit min-w-0 items-center gap-12 border p-6">
                <p className="text-sub text-text-subtitle whitespace-nowrap">
                    <T keyName="audio.tapTempo.label" />
                </p>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => waveSurfer?.seekTo(0)}
                        className={clsx(
                            "hover:text-accent text-text transition-colors",
                            TOUCH_TARGET_CLASS,
                        )}
                        disabled={!waveSurfer || !audioFileUrl}
                    >
                        <RewindIcon size={24} />
                    </button>
                    <button
                        onClick={togglePlayPause}
                        className={clsx(
                            "hover:text-accent text-text transition-colors",
                            TOUCH_TARGET_CLASS,
                        )}
                        disabled={!waveSurfer || !audioFileUrl}
                    >
                        {isAudioPlaying ? (
                            <PauseIcon size={24} />
                        ) : (
                            <PlayIcon size={24} />
                        )}
                    </button>
                    {isTouchMode && (
                        <>
                            <ActionButton
                                action="timelinePreviousPage"
                                className={TOUCH_TARGET_CLASS}
                            >
                                <CaretLeftIcon size={24} />
                            </ActionButton>
                            <ActionButton
                                action="timelineNextPage"
                                className={TOUCH_TARGET_CLASS}
                            >
                                <CaretRightIcon size={24} />
                            </ActionButton>
                        </>
                    )}
                </div>

                {beatsToDisplay === "real" ? (
                    <div className="flex h-fit min-h-0 gap-8">
                        <Button
                            onClick={triggerTapNewTempo}
                            size={"compact"}
                            className="touch:min-h-44 w-fit min-w-0 whitespace-nowrap"
                        >
                            <T keyName="audio.tapNewTempo.label" />
                        </Button>
                        <Button
                            onClick={() => setCanvasFocussed()}
                            size={"compact"}
                            variant="secondary"
                            className="touch:min-h-44 w-fit min-w-0 whitespace-nowrap"
                        >
                            <T keyName="audio.tapNewTempo.exit" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex h-fit min-h-0 w-full min-w-0 items-center gap-16">
                        <div className="flex items-center gap-6">
                            <button
                                type="button"
                                className="bg-accent text-text-invert rounded-6 touch:min-h-56 touch:min-w-96 touch:text-h5 flex min-h-26 items-center justify-center gap-6 px-12 font-medium select-none active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={t("audio.tapTempo.tapButton", {
                                    count: beatsPerTap,
                                })}
                                title={t("audio.tapTempo.tapButton", {
                                    count: beatsPerTap,
                                })}
                                disabled={!waveSurfer}
                                onPointerDown={(e) => {
                                    // On press, not release, so the beat lands on the tap
                                    if (
                                        e.pointerType === "mouse" &&
                                        e.button !== 0
                                    )
                                        return;
                                    e.preventDefault();
                                    tapBeats();
                                }}
                                onClick={(e) => {
                                    // Keyboard activation (Enter/Space) has no pointer press
                                    if (e.detail === 0) tapBeats();
                                }}
                            >
                                <HandTapIcon size={20} />
                                <T keyName="audio.tapTempo.tap" />
                            </button>
                            <label className="text-sub text-text-subtitle flex items-center gap-4 whitespace-nowrap">
                                <T keyName="audio.tapTempo.beatsPerTap" />
                                <select
                                    className="bg-fg-2 border-stroke rounded-6 text-body text-text touch:h-44 touch:min-w-56 h-26 border px-4"
                                    value={beatsPerTap}
                                    onChange={(e) =>
                                        setBeatsPerTap(Number(e.target.value))
                                    }
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div
                            id="timeline-editor-button-container"
                            className="flex gap-4"
                        >
                            <Button
                                className="touch:min-h-44 w-full whitespace-nowrap"
                                size={"compact"}
                                disabled={
                                    isAudioPlaying ||
                                    replaceAllBeatObjectsMutation.isPending
                                }
                                onClick={handleSave}
                            >
                                <T keyName="audio.saveNewBeats.label" />
                            </Button>
                            <Button
                                className="touch:min-h-44 w-full"
                                variant={"red"}
                                onClick={() => {
                                    triggerTapNewTempo();
                                    waveSurfer?.seekTo(0);
                                }}
                                size={"compact"}
                            >
                                <T keyName="audio.tapNewTempo.restart" />
                            </Button>
                            <Button
                                className="touch:min-h-44 w-full"
                                size="compact"
                                variant="secondary"
                                onClick={handleCancel}
                            >
                                <T keyName="audio.tapNewTempo.exit" />
                            </Button>
                        </div>
                    </div>
                )}
                <div className="bg-text-disabled size-4 rounded-full" />
                <a
                    href="https://openmarch.com/guides/music/tempo/#tapping-tempo"
                    target="_blank"
                    rel="noreferrer"
                >
                    <Button
                        size={"compact"}
                        variant="primary"
                        className="touch:min-h-44 w-fit min-w-fit whitespace-nowrap"
                    >
                        <BooksIcon size={22} />
                        <T keyName="audio.seeDocs.label" />
                    </Button>
                </a>
            </div>
        </div>
    );
}
