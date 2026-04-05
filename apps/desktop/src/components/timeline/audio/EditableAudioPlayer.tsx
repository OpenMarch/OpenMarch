import WaveSurfer from "wavesurfer.js";
import {
    SyntheticEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
// @ts-ignore - Importing the regions plugin
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { EditableTimingMarkersPlugin } from "./EditableTimingMarkersPlugin";
import {
    darkProgressColor,
    lightProgressColor,
    waveColor,
} from "./AudioPlayer";
import {
    BooksIcon,
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
import { T } from "@tolgee/react";
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

    // Then in the component:
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (
                !document.activeElement?.matches(
                    "input, textarea, select, [contenteditable]",
                )
            ) {
                event.preventDefault();
                const eventNum = Number(event.key);
                if (
                    !isNaN(eventNum) &&
                    beatsToDisplay === "temporary" &&
                    eventNum > 0 &&
                    waveSurfer
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
                } else if (event.key === " ") {
                    togglePlayPause();
                }
            }
        },
        [
            beatsToDisplay,
            waveSurfer,
            temporaryBeats,
            temporaryMeasures,
            togglePlayPause,
        ],
    );

    // Add event listener for keyboard shortcuts
    useEffect(() => {
        // Add the event listener when the component mounts
        window.addEventListener("keydown", handleKeyDown);

        // Remove the event listener when the component unmounts
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleKeyDown]);

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

            <div id="waveform" ref={waveformRef}></div>
            <div className="border-stroke rounded-6 bg-modal backdrop-blur-32 shadow-modal fixed bottom-[212px] z-50 flex w-fit min-w-0 items-center gap-12 border p-6">
                <p className="text-sub text-text-subtitle whitespace-nowrap">
                    <T keyName="audio.tapTempo.label" />
                </p>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => waveSurfer?.seekTo(0)}
                        className="hover:text-accent text-text transition-colors"
                        disabled={!waveSurfer || !audioFileUrl}
                    >
                        <RewindIcon size={24} />
                    </button>
                    <button
                        onClick={togglePlayPause}
                        className="hover:text-accent text-text transition-colors"
                        disabled={!waveSurfer || !audioFileUrl}
                    >
                        {isAudioPlaying ? (
                            <PauseIcon size={24} />
                        ) : (
                            <PlayIcon size={24} />
                        )}
                    </button>
                </div>

                {beatsToDisplay === "real" ? (
                    <div className="flex h-fit min-h-0 gap-8">
                        <Button
                            onClick={triggerTapNewTempo}
                            size={"compact"}
                            className="w-fit min-w-0 whitespace-nowrap"
                        >
                            <T keyName="audio.tapNewTempo.label" />
                        </Button>
                        <Button
                            onClick={() => setCanvasFocussed()}
                            size={"compact"}
                            variant="secondary"
                            className="w-fit min-w-0 whitespace-nowrap"
                        >
                            <T keyName="audio.tapNewTempo.exit" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex h-fit min-h-0 w-full min-w-0 gap-16">
                        <div
                            id="timeline-editor-button-container"
                            className="flex gap-4"
                        >
                            <Button
                                className="w-full whitespace-nowrap"
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
                                className="w-full"
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
                                className="w-full"
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
                        className="w-fit min-w-fit whitespace-nowrap"
                    >
                        <BooksIcon size={22} />
                        <T keyName="audio.seeDocs.label" />
                    </Button>
                </a>
            </div>
        </div>
    );
}
