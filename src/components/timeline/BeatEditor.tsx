import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useEffect } from "react";
import EditableBeatAudioPlayer from "./EditableBeatAudioPlayer";

/**
 * A component for editing beat durations using the waveform visualization.
 * Allows users to resize beats by dragging their edges.
 */
export default function BeatEditor() {
    const { fetchTimingObjects } = useTimingObjectsStore();

    // Fetch timing objects when the component mounts
    useEffect(() => {
        fetchTimingObjects();
    }, [fetchTimingObjects]);

    return (
        <div className="flex flex-col gap-4 p-4">
            <h2 className="text-xl font-semibold">Beat Editor</h2>
            <p className="text-text/80">
                Resize beats by dragging the right edge of each beat region.
                Changes are automatically saved to the database.
            </p>
            <div className="mt-4">
                <EditableBeatAudioPlayer />
            </div>
        </div>
    );
}
