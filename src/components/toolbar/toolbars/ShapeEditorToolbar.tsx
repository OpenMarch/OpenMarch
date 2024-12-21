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
                    className="outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Apply to prev page
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.applySelectedMarchersShapesToNextPage
                    }
                    className="outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Apply to next page
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.deleteMarcherShape
                    }
                    className="outline-none duration-150 ease-out hover:text-red focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Delete
                </RegisteredActionButton>
            </ToolbarSection>
        )
    );
}
