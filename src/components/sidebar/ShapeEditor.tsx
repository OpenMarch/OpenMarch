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
                <div className="flex gap-8">
                    {alignmentEventNewMarcherPages.length > 0 && (
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.applyQuickShape
                            }
                        >
                            <Button>Apply</Button>
                        </RegisteredActionButton>
                    )}
                    <RegisteredActionButton
                        registeredAction={
                            RegisteredActionsObjects.cancelAlignmentUpdates
                        }
                    >
                        <Button variant="secondary">Cancel</Button>
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
