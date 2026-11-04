import tolgee from "@/global/singletons/Tolgee";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import MarcherRotationInput from "@/components/inspector/marcher/MarcherRotationInput";
import { setShapePivot, useShapeEditorStore } from "../frame/shapeEditorStore";
import { useBoxSelectionStore } from "../placed/boxSelectionStore";
import { useShapeToolStore } from "../tool/shapeToolStore";
import { selectionPivot } from "./selectionTransform";
import { PivotGrid } from "../editor/PivotGrid";

/**
 * The inspector's Transform section (#349, spec #344, "Editing and transforming") for a plain
 * selection of two or more marchers: the pivot grid and the rotation around it (one marcher has
 * nothing to turn around). Only positions change: no scale, no recipe. The same in Basic and
 * Expert. A shape, open or placed and
 * selected, is transformed in its floating editor instead (#435), so the section hides then; a
 * kind armed with nothing drawn yet has no shape, so the selection's controls show.
 */
export function TransformSection() {
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const drawn = useShapeToolStore((s) => s.tool?.params != null);
    const placed = useBoxSelectionStore((s) => s.selected !== null);
    if (selected.length < 2 || drawn || (!toolOpen && placed)) return null;
    return (
        <div className="flex flex-col gap-8" data-testid="transform-section">
            <h5 className="text-h5">
                {tolgee.t("shapes.transform.title", "Transform")}
            </h5>
            <div className="flex items-start gap-12">
                <SelectionPivotGrid />
                <SelectionTransform />
            </div>
        </div>
    );
}

/** A plain selection's pivot: the session's, as there is no shape to keep it */
function SelectionPivotGrid() {
    const pivot = useShapeEditorStore((s) => s.pivot);
    return <PivotGrid pivot={pivot} onPick={setShapePivot} />;
}

/**
 * A plain selection's rotation: positions only. It turns the marchers on the field as it's typed
 * or dragged and saves when the input is left, as before (user story 54). The Align row's flips
 * mirror the selection.
 */
function SelectionTransform() {
    const pivot = useShapeEditorStore((s) => s.pivot);
    const around = (box: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }) =>
        selectionPivot(
            [
                { x: box.left, y: box.top },
                { x: box.right, y: box.bottom },
            ],
            pivot,
        )!;
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <MarcherRotationInput around={around} />
        </div>
    );
}
