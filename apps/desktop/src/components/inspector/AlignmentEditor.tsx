import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import ActionButton from "@/shortcuts/ActionButton";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";

export default function AlignmentEditor() {
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
                            <ActionButton action="createMarcherShape">
                                <Button size="compact">
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
