import { ArrowUUpLeftIcon, XIcon } from "@phosphor-icons/react";
import { useIsVisualsView } from "@/stores/WorkspaceViewStore";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useShapeAway, useShapeToolStore } from "../tool/shapeToolStore";
import { goBackTo, momentLabel } from "../tool/shapeMoment";
import { discardShapeTool } from "../tool/shapeLeave";
import { keepFocus } from "./keepFocus";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";

/**
 * Shown at the top of the field while the paused playhead is away from the open shape's moment
 * (#416): the shape and its editor are hidden until the timeline comes back, by Go back or any
 * other way. In the accent color, so a shape left open isn't forgotten (owner lab feedback).
 * Dismiss (×) discards it as Escape would at its moment: undo right after brings it back.
 * Not while playing, nor in Visuals or Preview, where the shape waits without it.
 */
export function ShapeAwayChip() {
    const moment = useShapeToolStore((s) => s.moment);
    const away = useShapeAway();
    const playing = useTimelineSelectionStore((s) => s.playback !== null);
    const visuals = useIsVisualsView();
    const preview = usePreviewModeStore((s) => s.isPreview);
    if (!moment || !away || playing || visuals || preview) return null;
    return (
        <div
            className="rounded-6 bg-accent text-body text-text-invert shadow-modal absolute top-12 left-1/2 z-10 flex -translate-x-1/2 items-center gap-8 py-4 pr-4 pl-12 whitespace-nowrap"
            data-testid="shape-away-chip"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <span data-testid="shape-away-chip-text">
                {tolgee.t("shapes.edit.away.text", "Shape open at {moment}", {
                    moment: momentLabel(moment),
                })}
            </span>
            <button
                type="button"
                className="rounded-6 bg-text-invert/20 hover:bg-text-invert/30 text-sub flex items-center gap-4 px-8 py-2 font-medium"
                onPointerDown={keepFocus}
                onClick={() => goBackTo(moment)}
            >
                <ArrowUUpLeftIcon size={14} weight="bold" />
                {tolgee.t("shapes.edit.away.goBack", "Go back")}
            </button>
            <Tip
                label={tolgee.t(
                    "shapes.edit.away.dismissTip",
                    "Dismiss the shape (undo brings it back)",
                )}
            >
                <button
                    type="button"
                    aria-label={tolgee.t("shapes.edit.away.dismiss", "Dismiss")}
                    className="rounded-6 hover:bg-text-invert/20 flex items-center p-4"
                    onPointerDown={keepFocus}
                    onClick={discardShapeTool}
                >
                    <XIcon size={14} weight="bold" />
                </button>
            </Tip>
        </div>
    );
}
