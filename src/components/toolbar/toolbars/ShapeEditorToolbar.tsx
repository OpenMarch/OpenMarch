import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { Shapes } from "@phosphor-icons/react";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";

export default function ShapeEditorToolbar() {
    const { selectedMarcherShapes } = useShapePageStore()!;

    return (
        selectedMarcherShapes.length > 0 && (
            <ToolbarSection>
                <div className="flex items-center gap-6">
                    <Shapes size={24} />
                    <h5 className="text-h5">Shape</h5>
                </div>
                <div className="h-full w-[1px] bg-stroke" />
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.applySelectedMarchersShapesToPreviousPage
                    }
                >
                    Apply to prev page
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.applySelectedMarchersShapesToNextPage
                    }
                >
                    Apply to next page
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.deleteMarcherShape
                    }
                    className="hover:text-red"
                >
                    Delete
                </RegisteredActionButton>
            </ToolbarSection>
        )
    );
}
