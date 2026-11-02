import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import { keepFocus } from "../editor/keepFocus";
import { FlipHorizontalIcon, FlipVerticalIcon } from "@phosphor-icons/react";
import { getButtonClassName } from "@openmarch/ui";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useUpdateSelectedMarchersOnSelectedPage } from "@/hooks/queries/useMarcherPages";
import MarcherRotationInput from "@/components/inspector/marcher/MarcherRotationInput";
import type { FlipAxis } from "../frame/frame";
import { setShapePivot, useShapeEditorStore } from "../frame/shapeEditorStore";
import { useBoxSelectionStore } from "../placed/boxSelectionStore";
import { useShapeToolStore } from "../tool/shapeToolStore";
import { flipSelection, selectionPivot } from "./selectionTransform";
import { GlyphText } from "../editor/GlyphText";
import { Tip } from "@/components/ui/Tip";
import { PivotGrid } from "../editor/PivotGrid";

/**
 * The inspector's Transform section (#349, spec #344, "Editing and transforming") for a plain
 * selection: the pivot grid, the rotation and the two flips, all around the pivot. Only positions
 * change: no scale, no recipe. The same in Basic and Expert. A shape, open or placed and
 * selected, is transformed in its floating editor instead (#435), so the section hides then; a
 * kind armed with nothing drawn yet has no shape, so the selection's controls show.
 */
export function TransformSection() {
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const drawn = useShapeToolStore((s) => s.tool?.params != null);
    const placed = useBoxSelectionStore((s) => s.selected !== null);
    if (selected.length === 0 || drawn || (!toolOpen && placed)) return null;
    return (
        <div className="flex flex-col gap-8" data-testid="transform-section">
            <h5 className="text-h5">
                {tolgee.t("shapes.transform.title", "Transform")}
            </h5>
            <div className="flex items-start gap-12">
                <SelectionPivotGrid />
                <SelectionTransform count={selected.length} />
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
 * A plain selection's rotation and flips: positions only. The rotation turns the marchers on the
 * field as it's typed or dragged and saves when the input is left, as before (user story 54).
 */
function SelectionTransform({ count }: { count: number }) {
    const pivot = useShapeEditorStore((s) => s.pivot);
    const { mutate: update } = useUpdateSelectedMarchersOnSelectedPage();
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
            <Flips
                disabled={count < 2}
                onFlip={(axis) =>
                    update(({ currentCoordinates }) =>
                        flipSelection(currentCoordinates, axis, pivot),
                    )
                }
            />
        </div>
    );
}

function Flips({
    onFlip,
    disabled,
}: {
    onFlip: (axis: FlipAxis) => void;
    disabled?: boolean;
}) {
    const button = clsx(
        getButtonClassName({ variant: "secondary", size: "compact" }),
        "flex items-center gap-4",
    );
    return (
        <div className="flex gap-4">
            <Tip
                label={tolgee.t(
                    "shapes.transform.flipAcrossTip",
                    "Flip side to side around the pivot",
                )}
            >
                <button
                    type="button"
                    className={button}
                    disabled={disabled}
                    onPointerDown={keepFocus}
                    onClick={() => onFlip("across")}
                    data-testid="transform-flip-across"
                >
                    <FlipHorizontalIcon size={14} />
                    <GlyphText
                        text={tolgee.t("shapes.transform.flipAcross", "Flip ↔")}
                    />
                </button>
            </Tip>
            <Tip
                label={tolgee.t(
                    "shapes.transform.flipDeepTip",
                    "Flip front to back around the pivot",
                )}
            >
                <button
                    type="button"
                    className={button}
                    disabled={disabled}
                    onPointerDown={keepFocus}
                    onClick={() => onFlip("deep")}
                    data-testid="transform-flip-deep"
                >
                    <FlipVerticalIcon size={14} />
                    <GlyphText
                        text={tolgee.t("shapes.transform.flipDeep", "Flip ↕")}
                    />
                </button>
            </Tip>
        </div>
    );
}
