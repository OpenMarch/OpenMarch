import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import { BoundingBoxIcon } from "@phosphor-icons/react";
import { getButtonClassName } from "@openmarch/ui";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import {
    placedBoxesAt,
    usePlacedBoxStore,
    usePlacedBoxBeat,
} from "./placedBoxStore";
import { selectOnField } from "./boxSelection";
import { setInsideBox } from "./boxSelectionStore";

/**
 * **Select box** (**Select circle**…) in the inspector when some of a placed shape's marchers are
 * selected but not all of it (07-placed-boxes.md). A shape selected whole is edited in its
 * floating editor (#435), so the inspector shows nothing of it.
 */
export function SelectWholeShape() {
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    // Re-read when the boxes or the moment change
    usePlacedBoxStore((s) => s.recipes);
    usePlacedBoxStore((s) => s.ends);
    useTimelineResolverStore((s) => s.version);
    const beat = usePlacedBoxBeat();
    const ids = new Set(selected.map((m) => m.id));
    const partOf = placedBoxesAt(beat).find((b) =>
        b.recipe.members.some((m) => ids.has(m.marcherId)),
    );
    if (!partOf) return null;
    return (
        <button
            type="button"
            className={clsx(
                getButtonClassName({ variant: "secondary", size: "compact" }),
                "flex items-center gap-6",
            )}
            onClick={() => {
                selectOnField(partOf.recipe.members.map((m) => m.marcherId));
                setInsideBox(null);
            }}
            data-testid="placed-box-select"
        >
            <BoundingBoxIcon size={16} weight="bold" />
            {tolgee.t(
                "shapes.placed.selectWholeShape",
                "Select {shape, select, block {box} circle {circle} other {shape}}",
                {
                    shape: partOf.kind.shape.id,
                },
            )}
        </button>
    );
}
