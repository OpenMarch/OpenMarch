import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useShapeToolStore } from "./shapeToolStore";
import { SelectWholeShape } from "../placed/SelectWholeShape";
import { useBoxSelectionStore } from "../placed/boxSelectionStore";

/**
 * The inspector's **Select box** when the selection is part of a placed shape (`SelectWholeShape`).
 * Shapes start from the toolbar's Shapes tab or their shortcuts, and an open shape or a selected
 * placed one is edited in its floating editor (#435), so the section hides then.
 */
export function ShapeToolSection() {
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const placed = useBoxSelectionStore((s) => s.selected !== null);
    if (selected.length === 0 || toolOpen || placed) return null;
    return <SelectWholeShape />;
}
