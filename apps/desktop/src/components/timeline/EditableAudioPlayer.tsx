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
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
// @ts-ignore - Importing the regions plugin
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { EditableTimingMarkersPlugin } from "./EditableTimingMarkersPlugin";
import {
    darkProgressColor,
    lightProgressColor,
    waveColor,
} from "./AudioPlayer";
import { PauseIcon, PlayIcon, RewindIcon } from "@phosphor-icons/react";
import Beat from "@/global/classes/Beat";
import { Button } from "@openmarch/ui";
import {
    replaceAllBeatObjects,
    createNewTemporaryBeats,
    createNewTemporaryMeasures,
} from "./EditableAudioPlayerUtils";
import { useTheme } from "@/context/ThemeContext";
import { conToastError } from "@/utilities/utils";
import { toast } from "sonner";
import Measure from "@/global/classes/Measure";

/**
 * Editable version of the AudioPlayer component.
 * Pass the ref of the timeline container so this component can scroll
 */
export default function EditableAudioPlayer({
    timelineRef,
}: {
    timelineRef: React.RefObject<HTMLDivElement>;
}) {
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    // We'll use beats later for creating regions based on timing objects
    const { beats, pages, measures, fetchTimingObjects } =
        useTimingObjectsStore();
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

    const togglePlayPause = useCallback(() => {
        if (!waveSurfer) return;

        if (isAudioPlaying) {
            waveSurfer.pause();
        } else {
            waveSurfer.play();
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
                    console.log("temporary measures", updatedMeasures);
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
        const pageUpdates = await replaceAllBeatObjects({
            newBeats: temporaryBeats,
            oldBeats: beats,
            newMeasures: temporaryMeasures,
            oldMeasures: measures,
            pages,
            refreshFunction: fetchTimingObjects,
        });
        if (!pageUpdates.success) {
            conToastError("Error creating new beats", pageUpdates);
            return;
        } else {
            toast.success("Beats saved successfully");
            setBeatsToDisplay("real");
        }
    };

    const handleCancel = () => {
        setBeatsToDisplay("real");
        setTemporaryBeats([]);
        setTemporaryMeasures([]);
    };

    return (
        <div className="h-fit pl-[40px]">
            {audioFileUrl && (
                <audio
                    ref={audioRef}
                    src={audioFileUrl}
                    preload="auto"
                    onLoadedMetadata={(event) => handleAudioLoaded(event)}
                />
            )}

            <div id="waveform" ref={waveformRef}></div>
            <div className="flex items-center">
                <button
                    onClick={() => waveSurfer?.seekTo(0)}
                    className="hover:text-accent mr-2 rounded-md px-4 py-2 font-medium text-white transition-colors"
                    disabled={!waveSurfer || !audioFileUrl}
                >
                    <RewindIcon size={24} />
                </button>
                <button
                    onClick={togglePlayPause}
                    className="hover:text-accent mr-2 rounded-md px-4 py-2 font-medium text-white transition-colors"
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
                        className="w-fit min-w-0 px-16 whitespace-nowrap"
                    >
                        Tap New Tempo
                    </Button>
                    <div className="w-full">
                        Tempo tapping is not very polished and is currently
                        &quot;all-or-nothing.&quot;
                        <br />
                        You must tap all in one shot and will need to restart in
                        order to edit.
                        <br />
                        The result is a fun jam session with you and your
                        keyboard. It will certainly be quick and not at all
                        frustrating.
                        <br />
                        Please let us know if you find the tap-tempo feature
                        useful, as we just aren&apos;t predicting that many
                        people will use it.
                        <br />
                        GLHF!
                    </div>
                </div>
            ) : (
                <div className="flex h-fit min-h-0 w-full min-w-0 gap-16">
                    <div
                        id="timeline-editor-button-container"
                        className="flex flex-col gap-4"
                    >
                        <Button
                            className="w-full whitespace-nowrap"
                            size={"compact"}
                            disabled={isAudioPlaying}
                            onClick={handleSave}
                        >
                            Save New Beats
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
                            Restart
                        </Button>
                        <Button
                            className="w-full"
                            size="compact"
                            variant="secondary"
                            onClick={handleCancel}
                        >
                            Exit
                        </Button>
                    </div>
                    <div className="flex w-full flex-col gap-4">
                        <p className="text-text-subtitle text-sm">
                            Instructions
                        </p>
                        <ol className="list-inside list-decimal">
                            <li>Start at the beginning of the audio</li>
                            <li>
                                Press play{" "}
                                <span className="text-text-subtitle">
                                    (space bar works)
                                </span>
                            </li>
                            <li>
                                Tap the tempo{" "}
                                <span className="text-text-subtitle">
                                    (instructions on the right)
                                </span>
                            </li>
                            <li>
                                Pause the audio. Either save the new beats or
                                retry
                            </li>
                        </ol>
                    </div>
                    <div className="flex w-full flex-col gap-4">
                        <p className="text-text-subtitle text-sm">
                            Tapping the tempo
                        </p>

                        <ul className="list-inside list-disc">
                            <li>
                                OpenMarch uses the number keys{" "}
                                <span className="font-mono">[1-9]</span> to tap
                                the tempo
                            </li>
                            <li>
                                The number you press corresponds to the number
                                of beats in the measure
                            </li>
                            <li>
                                For instance in 4/4, you would press the
                                &quot;4&quot; key
                            </li>
                            <li>
                                Press the key at the downbeat of the next
                                measure
                            </li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
