import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { SidebarCollapsible } from "./SidebarCollapsible";
import { Button } from "../ui/Button";

export default function AlignmentEditor() {
    const {
        alignmentEvent,
        alignmentEventMarchers,
        alignmentEventNewMarcherPages,
    } = useAlignmentEventStore();

    return (
        alignmentEvent === "line" && (
            <SidebarCollapsible
                defaultOpen
                title={`Alignment`}
                className="mt-12 flex flex-col gap-12"
            >
                <div className="flex flex-wrap items-center gap-8">
                    {alignmentEventNewMarcherPages.length > 0 ? (
                        <>
                            <RegisteredActionButton
                                registeredAction={
                                    RegisteredActionsObjects.createMarcherShape
                                }
                            >
                                <Button size="compact">Create Shape</Button>
                            </RegisteredActionButton>
                            <RegisteredActionButton
                                registeredAction={
                                    RegisteredActionsObjects.applyQuickShape
                                }
                            >
                                <Button size="compact" variant="secondary">
                                    Apply coordinates
                                </Button>
                            </RegisteredActionButton>
                        </>
                    ) : (
                        <p className="text-body text-text/75">Draw a line.</p>
                    )}
                    <RegisteredActionButton
                        registeredAction={
                            RegisteredActionsObjects.cancelAlignmentUpdates
                        }
                    >
                        <Button size="compact" variant="secondary">
                            Cancel
                        </Button>
                    </RegisteredActionButton>
                </div>
                <p className="text-sub text-text/80">
                    Marchers{" "}
                    {alignmentEventMarchers
                        .map((marcher) => marcher.drill_number)
                        .join(", ")}
                </p>
            </SidebarCollapsible>
        )
    );
}
