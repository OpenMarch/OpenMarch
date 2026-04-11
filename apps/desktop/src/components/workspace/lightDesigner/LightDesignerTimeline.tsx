import TimelineContainer from "@/components/timeline/TimelineContainer";

/**
 * Compact timeline: playback and navigation only; no beat/page timing edits.
 */
export default function LightDesignerTimeline() {
    return <TimelineContainer editableTiming={false} compact />;
}
