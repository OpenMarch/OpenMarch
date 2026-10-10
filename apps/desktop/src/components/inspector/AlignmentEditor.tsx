import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import ActionButton from "@/shortcuts/ActionButton";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";

/** Why Create Shape is off in timeline mode (P7.11). */
export const CREATE_SHAPE_TIMELINE_TEXT =
    "Create Shape makes a page shape, which timeline mode doesn't use. Apply the coordinates to move these marchers onto the line, or draw a shape in the Shapes part of the Timeline section.";

export default function AlignmentEditor() {
    const timelineMode = useTimelineMode();
    const {
        alignmentEvent,
        alignmentEventMarchers,
        alignmentEventNewMarcherPages,
    } = useAlignmentEventStore();

    return (
        alignmentEvent === "line" && (
            <InspectorCollapsible
                defaultOpen
                title={`Alignment`}
                className="mt-12 flex flex-col gap-12"
            >
                <div className="flex flex-wrap items-center gap-8">
                    {alignmentEventNewMarcherPages.length > 0 ? (
                        <>
                            <ActionButton
                                action="createMarcherShape"
                                disabled={timelineMode}
                            >
                                <Button size="compact" disabled={timelineMode}>
                                    <T keyName="inspector.alignment.createShape" />
                                </Button>
                            </ActionButton>
                            <ActionButton action="applyQuickShape">
                                <Button size="compact" variant="secondary">
                                    <T keyName="inspector.alignment.applyCoordinates" />
                                </Button>
                            </ActionButton>
                        </>
                    ) : (
                        <p className="text-body text-text/75">
                            <T keyName="inspector.alignment.drawLine" />
                        </p>
                    )}
                    <ActionButton action="cancelAlignmentUpdates">
                        <Button size="compact" variant="secondary">
                            <T keyName="inspector.alignment.cancelUpdates" />
                        </Button>
                    </ActionButton>
                </div>
                {timelineMode && (
                    <p
                        className="text-sub text-text/60"
                        data-testid="alignment-create-shape-timeline"
                    >
                        <T
                            keyName="inspector.alignment.createShapeTimeline"
                            defaultValue={CREATE_SHAPE_TIMELINE_TEXT}
                        />
                    </p>
                )}
                <p className="text-sub text-text/80 font-mono">
                    Marchers{" "}
                    {alignmentEventMarchers
                        .map((marcher) => marcher.drill_number)
                        .join(", ")}
                </p>
            </InspectorCollapsible>
        )
    );
}
