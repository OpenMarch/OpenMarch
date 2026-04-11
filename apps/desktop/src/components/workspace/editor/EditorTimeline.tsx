import TimelineContainer from "@/components/timeline/TimelineContainer";

/**
 * Full drill timeline with timing editing and default layout.
 */
export default function EditorTimeline() {
    return <TimelineContainer editableTiming compact={false} />;
}
