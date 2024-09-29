import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import EditorContainer from "./sharedComponents/EditorContainer";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

export default function AlignmentEditor() {
    const {
        alignmentEvent,
        alignmentEventMarchers,
        alignmentEventNewMarcherPages,
    } = useAlignmentEventStore();

    return alignmentEvent === "default" ? null : (
        <EditorContainer
            headerLeftText="Alignment"
            headerRightText={`${alignmentEvent
                .charAt(0)
                .toUpperCase()}${alignmentEvent.substring(1)}`}
        >
            <div className="flex mr-4 mb-2">
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
        </EditorContainer>
    );
}
