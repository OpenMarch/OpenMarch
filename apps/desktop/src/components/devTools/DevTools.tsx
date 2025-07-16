import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import { useSectionAppearanceStore } from "@/stores/SectionAppearanceStore";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useUndoRedoStore } from "@/stores/UndoRedoStore";
import { useMarchersWithVisuals } from "@/global/classes/MarcherVisualSet";
import StoreTab from "./StoreTab";

const DevTools = () => {
    const alignmentEventState = useAlignmentEventStore();
    const marcherPageState = useMarcherPageStore();
    const { marchers, marcherVisuals } = useMarchersWithVisuals();
    const registeredActionsState = useRegisteredActionsStore();
    const sectionAppearanceState = useSectionAppearanceStore();
    const shapePageState = useShapePageStore();
    const sidebarModalState = useSidebarModalStore();
    const timingObjectsState = useTimingObjectsStore();
    const uiSettingsState = useUiSettingsStore();
    const undoRedoState = useUndoRedoStore();

    return (
        <div className="bg-bg-1 border-stroke text-text text-body absolute top-0 right-0 z-[9999] h-full w-[350px] overflow-y-auto border-l p-4 font-mono">
            <h2 className="text-h4 text-accent mt-0 mb-4">DevTools</h2>
            <StoreTab title="AlignmentEventStore" data={alignmentEventState} />
            <StoreTab title="MarcherPageStore" data={marcherPageState} />
            <StoreTab title="MarcherStore" data={marchers} />
            <StoreTab
                title="RegisteredActionsStore"
                data={registeredActionsState}
            />
            <StoreTab
                title="SectionAppearanceStore"
                data={sectionAppearanceState}
            />
            <StoreTab title="ShapePageStore" data={shapePageState} />
            <StoreTab title="SidebarModalStore" data={sidebarModalState} />
            <StoreTab title="TimingObjectsStore" data={timingObjectsState} />
            <StoreTab title="UiSettingsStore" data={uiSettingsState} />
            <StoreTab title="UndoRedoStore" data={undoRedoState} />
        </div>
    );
};

export default DevTools;
