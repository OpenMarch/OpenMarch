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
                    <p className="text-body text-text">Shapes</p>
                </div>
                <div className="h-full w-[1px] bg-stroke" />
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.deleteMarcherShape
                    }
                >
                    Delete shape
                </RegisteredActionButton>
            </ToolbarSection>
        )
    );
}
