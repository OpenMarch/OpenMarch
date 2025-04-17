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
import Beat, { deleteBeats } from "@/global/classes/Beat";
import { toast } from "sonner";
import { Button } from "../ui/Button";

/**
 * Creates new temporary beats by subdividing the time between the last existing beat and the current time.
 *
 * @param currentTime The current timestamp where a new beat will be created
 * @param totalDuration The total duration of the audio
 * @param existingTemporaryBeats Array of existing temporary beats
 * @param numNewBeats Number of beats to create between the last beat and current time
 * @returns An object containing updated beats and a flag indicating whether the display should be updated
 */
export const createNewTemporaryBeat = (
    currentTime: number,
    totalDuration: number,
    existingTemporaryBeats: Beat[],
    numNewBeats: number,
): { updatedBeats: Beat[]; shouldUpdateDisplay: boolean } => {
    // If no existing beats, we can't update anything
    if (existingTemporaryBeats.length === 0) {
        return { updatedBeats: [], shouldUpdateDisplay: false };
    }

    if (numNewBeats <= 0) {
        console.warn(
            "createNewTemporaryBeat: numNewBeats must be greater than 0",
        );
        return { updatedBeats: [], shouldUpdateDisplay: false };
    }

    // Create an array of new beats with the last beat as the first beat
    const lastBeat = existingTemporaryBeats[existingTemporaryBeats.length - 1];
    const newDuration = currentTime - lastBeat.timestamp;
    const newBeats: Beat[] = existingTemporaryBeats.slice(0, -1);

    for (let i = 0; i < numNewBeats; i++) {
        const durationToUse = newDuration / numNewBeats;
        // Update the previous beat's duration
        newBeats.push({
            ...lastBeat,
            duration: durationToUse,
            timestamp: lastBeat.timestamp + durationToUse * i,
        });
    }

    // Calculate remaining duration for the new beat
    const tempDuration = totalDuration - currentTime;

    // Create a new temporary beat at the current timestamp
    newBeats.push({
        id: -Date.now(), // Negative ID to indicate temporary
        position: existingTemporaryBeats.length,
        duration: tempDuration,
        includeInMeasure: false,
        notes: null,
        index: existingTemporaryBeats.length,
        timestamp: currentTime,
    });

    return {
        updatedBeats: newBeats,
        shouldUpdateDisplay: true,
    };
};

/**
 * The audio player handles the playback of the audio file.
 * There are no controls here for the audio player, it is controlled by isPlaying and selectedPage stores/contexts.
 */
export default function EditableAudioPlayer({ theme }: { theme?: string }) {
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();
    // We'll use beats later for creating regions based on timing objects
    const { beats, measures, fetchTimingObjects } = useTimingObjectsStore();
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
            const eventNum = Number(event.key);
            if (!isNaN(eventNum) && eventNum > 0 && waveSurfer) {
                const currentTime = waveSurfer.getCurrentTime();
                const totalDuration = waveSurfer.getDuration();

                const { updatedBeats, shouldUpdateDisplay } =
                    createNewTemporaryBeat(
                        currentTime,
                        totalDuration,
                        temporaryBeats,
                        eventNum,
                    );

                console.log("updatedBeats", updatedBeats);

                if (updatedBeats.length > 0) {
                    setTemporaryBeats(updatedBeats);

                    if (beatsToDisplay === "real" && shouldUpdateDisplay) {
                        setBeatsToDisplay("temporary");
                    }
                }
            }
        },
        [waveSurfer, temporaryBeats, beatsToDisplay],
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

    const togglePlayPause = () => {
        if (!waveSurfer) return;

        if (isAudioPlaying) {
            waveSurfer.pause();
        } else {
            waveSurfer.play();
        }
        setIsAudioPlaying(!isAudioPlaying);
    };

    /**
     * Deletes all beats from the current audio timeline.
     * Collects beat IDs, calls the deletion API, and displays a success or error toast notification.
     */
    const deleteAllBeats = async () => {
        const beatIds = new Set(beats.map((beat) => beat.id));
        const response = await deleteBeats(beatIds, fetchTimingObjects);
        if (response.success) {
            toast.success("Beats deleted successfully");
        } else {
            toast.error("Failed to delete beats");
        }
    };

    const triggerRedoBeatMapping = async () => {
        setTemporaryBeats([beats[0]]);
        setBeatsToDisplay("temporary");
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

            <div id="timeline-editor-button-container">
                {beatsToDisplay === "real" ? (
                    <Button onClick={triggerRedoBeatMapping} size={"compact"}>
                        Redo Beat Mapping
                    </Button>
                ) : (
                    <Button>Save New Beats</Button>
                )}

                <Button
                    variant={"red"}
                    onClick={deleteAllBeats}
                    size={"compact"}
                >
                    Delete All Beats
                </Button>
            </div>
        </div>
    );
}
