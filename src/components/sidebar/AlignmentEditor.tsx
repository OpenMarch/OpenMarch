import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

export default function AlignmentEditor() {
    const {
        alignmentEvent,
        alignmentEventMarchers,
        alignmentEventNewMarcherPages,
    } = useAlignmentEventStore();

    return alignmentEvent === "default" ? null : (
        <>
            <div className="mb-2 mr-4 flex">
                {alignmentEventNewMarcherPages.length > 0 && (
                    <RegisteredActionButton
                        className="btn-secondary mx-2 flex-grow"
                        registeredAction={
                            RegisteredActionsObjects.applyAlignmentUpdates
                        }
                    >
                        Apply
                    </RegisteredActionButton>
                )}
                <RegisteredActionButton
                    className="btn-secondary mx-2 flex-grow"
                    registeredAction={
                        RegisteredActionsObjects.cancelAlignmentUpdates
                    }
                >
                    Cancel
                </RegisteredActionButton>
            </div>
            <div>
                Marchers
                <div>
                    {alignmentEventMarchers
                        .map((marcher) => marcher.drill_number)
                        .join(", ")}
                </div>
            </div>
        </>
    );
}
