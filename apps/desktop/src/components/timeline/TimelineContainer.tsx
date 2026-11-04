import AudioPlayer from "./audio/AudioPlayer";
import TimelineModePanel from "./TimelineModePanel";
import VisualsTimeline from "@/components/visuals/VisualsTimeline";
import { useIsVisualsView } from "@/stores/WorkspaceViewStore";
import { useIsPreviewMode } from "@/stores/PreviewModeStore";
import { PreviewTimelinePanel } from "./TimelineNavigationPanel";

/**
 * The timeline with the audio player beside it: the drill timeline, in Visuals mode its own
 * (performer-behavior.md section 7.1), or in Preview only the music, the pages and the playhead.
 * The player stays mounted across the switch. The timeline draws its own waveform lane, so the
 * player is headless: it runs playback and the timeline reads its clock.
 */
export default function TimelineContainer() {
    const visuals = useIsVisualsView();
    const preview = useIsPreviewMode();
    return (
        <div
            className="flex min-h-0 flex-1 gap-8"
            data-testid="timeline-mode-container"
        >
            {preview ? (
                <PreviewTimelinePanel />
            ) : visuals ? (
                <VisualsTimeline />
            ) : (
                <TimelineModePanel />
            )}
            <AudioPlayer />
        </div>
    );
}
