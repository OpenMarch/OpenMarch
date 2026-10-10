import { createPortal } from "react-dom";
import { TooltipClassName } from "@openmarch/ui";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type { FlagPage } from "@/timeline/timelinePlayhead";
import { useTimelineKeptMarks } from "@/timeline/useTimelineKeptMarks";

/**
 * The kept marks on the field in timeline mode (docs/timeline/ui.md UI-18, kept marchers on the
 * field) and their tooltip. Its own component, so a hover or a scrub re-renders only this, not
 * the canvas.
 */
export default function TimelineKeptMarks({
    canvas,
    isPlaying,
    pages,
    pageId,
    marcherIds,
}: {
    canvas: OpenMarchCanvas | null;
    isPlaying: boolean;
    pages: readonly (FlagPage & { readonly name: string })[];
    pageId: number | null | undefined;
    marcherIds: readonly number[] | undefined;
}) {
    const tooltip = useTimelineKeptMarks({
        canvas,
        enabled: true,
        isPlaying,
        pages,
        pageId,
        marcherIds,
    });
    if (!tooltip) return null;
    // In a portal: the canvas's container sets a perspective, which would anchor `fixed` to it
    return createPortal(
        <div
            role="tooltip"
            data-testid="timeline-kept-mark-tooltip"
            className={`${TooltipClassName} pointer-events-none fixed`}
            style={{ left: tooltip.clientX + 12, top: tooltip.clientY + 16 }}
        >
            <span className="block text-[12px]">{tooltip.text}</span>
        </div>,
        document.body,
    );
}
