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
import { Pause, Play } from "@phosphor-icons/react";
import Beat from "@/global/classes/Beat";
import { Button } from "../ui/Button";
import {
    createNewBeatObjects,
    createNewTemporaryBeat,
} from "./EditableAudioPlayerUtils";
import { useTheme } from "@/context/ThemeContext";
import { conToastError } from "@/utilities/utils";
import { toast } from "sonner";

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
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();
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

    useEffect(() => {
        setPixelsPerSecond(120);
    }, [setPixelsPerSecond]);

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
                height: 160,
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

                const updatedBeats = createNewTemporaryBeat(
                    currentTime,
                    totalDuration,
                    temporaryBeats,
                    eventNum,
                );

                if (updatedBeats.length > 0) {
                    setTemporaryBeats(updatedBeats);
                }
            } else if (event.key === " ") {
                togglePlayPause();
            }
        },
        [beatsToDisplay, waveSurfer, temporaryBeats, togglePlayPause],
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
        if (timingMarkersPlugin.current == null) return;
        timingMarkersPlugin.current.updateTimingMarkers(
            beatsToDisplay === "real" ? beats : temporaryBeats,
            measures,
        );
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
    const triggerRedoBeatMapping = () => {
        if (!waveSurfer) return;

        console.log("triggerRedoBeatMapping", [
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
        ]);
        setTemporaryBeats([
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
        ]);
        setBeatsToDisplay("temporary");
    };

    const handleSave = async () => {
        const pageUpdates = await createNewBeatObjects({
            newBeats: temporaryBeats,
            oldBeats: beats,
            pages: pages,
            measures: measures,
            refreshFunction: fetchTimingObjects,
        });
        if (!pageUpdates.success) {
            conToastError("Error creating new beats", pageUpdates);
            return;
        } else {
            toast.success("Beats saved successfully");
        }
    };

    return (
        <div className="pl-[40px]">
            {audioFileUrl && (
                <audio
                    ref={audioRef}
                    src={audioFileUrl}
                    preload="auto"
                    onLoadedMetadata={(event) => handleAudioLoaded(event)}
                />
            )}

            <div id="waveform" ref={waveformRef}></div>
            <div className="mb-2 flex items-center">
                <button
                    onClick={togglePlayPause}
                    className="bg-blue-500 hover:bg-blue-600 rounded-md mr-2 px-4 py-2 font-medium text-white transition-colors"
                    disabled={!waveSurfer || !audioFileUrl}
                >
                    {isAudioPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
            </div>

            {beatsToDisplay === "real" ? (
                <Button onClick={triggerRedoBeatMapping} size={"compact"}>
                    Redo Beat Mapping
                </Button>
            ) : (
                <div
                    id="timeline-editor-button-container"
                    className="flex gap-4"
                >
                    <Button
                        size={"compact"}
                        disabled={isAudioPlaying}
                        onClick={handleSave}
                    >
                        Save New Beats
                    </Button>
                    <Button
                        variant={"red"}
                        onClick={triggerRedoBeatMapping}
                        size={"compact"}
                    >
                        Restart
                    </Button>
                </div>
            )}
        </div>
    );
}
