import { memo } from "react";
import { useTranslate } from "@tolgee/react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as ToolTip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import { beatToX } from "./TimelineGeometry";
import type {
    TimelineBasicPoint,
    TimelinePageMarker,
} from "./TimelineViewModel";

/**
 * Basic mode's page boxes (UI-19, docs/timeline/research/basic-mode, "Basic's panel"): the ruler's
 * page boxes are each box's header, and these layers make the rest of the box, under it. The
 * waveform and the count ticks are drawn inside the bodies by the timeline itself.
 */

/**
 * The page box bodies under the ruler: one frame from the first page to the end of the show.
 * Home has no counts, so nothing is drawn under its house.
 */
export const TimelineBasicBodies = memo(function TimelineBasicBodies({
    top,
    height,
    width,
}: {
    /** Where the bodies start: under the ruler */
    top: number;
    height: number;
    /** The show's width, without home's box */
    width: number;
}) {
    return (
        <div
            aria-hidden="true"
            data-testid="timeline-basic-bodies"
            className="border-stroke bg-fg-2/40 rounded-b-6 pointer-events-none absolute left-0 border border-t-0"
            style={{ top, height, width }}
        />
    );
});

/**
 * The Expert mark on a page box's header (V-202): some marchers on the page use Expert moves, so
 * Basic can't edit them there. Its tooltip says how many.
 */
export const TimelineBasicExpertMarks = memo(function TimelineBasicExpertMarks({
    pages,
    marks,
    pixelsPerBeat,
}: {
    /** Page markers, each at its box's start */
    pages: readonly TimelinePageMarker[];
    marks: ReadonlyMap<string | number, number>;
    pixelsPerBeat: number;
}) {
    const { t } = useTranslate();
    if (marks.size === 0) return null;
    return (
        <>
            {pages.map((page) => {
                const count = marks.get(page.id) ?? 0;
                if (page.isInitial || count === 0) return null;
                // A page marker is at its box's start (its flag is the next page's start)
                const start = page.atBeat;
                const text = t("timeline.basic.expertMark.tooltip", {
                    count,
                    page: page.label,
                });
                return (
                    <ToolTip.Root key={page.id} delayDuration={300}>
                        <ToolTip.Trigger asChild>
                            <span
                                data-testid="basic-expert-mark"
                                data-timeline-interactive="true"
                                aria-label={text}
                                className="bg-fg-1 border-stroke text-text-subtitle text-micro pointer-events-auto absolute top-6 z-20 rounded-full border px-4 font-sans leading-[14px]"
                                style={{
                                    left: beatToX(start, pixelsPerBeat) + 4,
                                }}
                            >
                                {t("timeline.basic.expertMark.letter")}
                            </span>
                        </ToolTip.Trigger>
                        <ToolTip.Portal>
                            <ToolTip.Content
                                className={TooltipClassName}
                                side="top"
                            >
                                {text}
                            </ToolTip.Content>
                        </ToolTip.Portal>
                    </ToolTip.Root>
                );
            })}
        </>
    );
});

/**
 * The selected marchers' mid-page positions (UI-19): a tick through the box body at each one.
 * Clicking it seeks there; its right-click menu removes it.
 */
export const TimelineBasicPoints = memo(function TimelineBasicPoints({
    points,
    top,
    height,
    pixelsPerBeat,
    onSeek,
    onRemove,
}: {
    points: readonly TimelineBasicPoint[];
    top: number;
    height: number;
    pixelsPerBeat: number;
    onSeek?: (beat: number) => void;
    onRemove?: (beat: number) => void;
}) {
    const { t } = useTranslate();
    return (
        <>
            {points.map((point) => (
                <ContextMenu.Root key={point.beat}>
                    <ContextMenu.Trigger asChild>
                        <button
                            type="button"
                            data-testid="basic-point-tick"
                            data-timeline-interactive="true"
                            // A finger's long press opens its menu (tablet 3.4), not the hint
                            data-own-long-press={onRemove ? "" : undefined}
                            aria-label={t("timeline.basic.point.label", {
                                count: point.count,
                                page: point.page,
                            })}
                            title={t("timeline.basic.point.tooltip", {
                                count: point.count,
                                page: point.page,
                            })}
                            className="group/tick pointer-events-auto absolute z-20 flex w-8 -translate-x-1/2 cursor-pointer justify-center"
                            style={{
                                top,
                                height,
                                left: beatToX(point.beat, pixelsPerBeat),
                            }}
                            onClick={() => onSeek?.(point.beat)}
                            // Kept from the menu's own long press, which opens while a finger
                            // is still down: the timeline's opens it on release (tablet 3.4)
                            onPointerDown={(event) => {
                                if (event.pointerType === "touch")
                                    event.preventDefault();
                            }}
                            // The page menu on the surface must not open too
                            onContextMenu={(event) => event.stopPropagation()}
                        >
                            <span className="bg-accent h-full w-[3px] rounded-full group-hover/tick:w-[5px]" />
                        </button>
                    </ContextMenu.Trigger>
                    {onRemove && (
                        <ContextMenu.Portal>
                            <ContextMenu.Content
                                // React bubbles the portal's presses to the timeline, which
                                // would scrub and capture the pointer
                                data-timeline-interactive="true"
                                className="bg-modal text-text rounded-6 border-stroke shadow-modal backdrop-blur-32 z-50 flex flex-col border p-4"
                            >
                                <ContextMenu.Item
                                    className="text-body hover:text-red rounded-4 cursor-pointer px-8 py-4 outline-none"
                                    onSelect={() => onRemove(point.beat)}
                                >
                                    {t("timeline.basic.point.remove")}
                                </ContextMenu.Item>
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    )}
                </ContextMenu.Root>
            ))}
        </>
    );
});
