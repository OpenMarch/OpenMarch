import { useEffect, useRef } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { Button } from "@openmarch/ui";
import { useTimingObjects } from "@/hooks";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import {
    isolatedTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";

/**
 * How the isolation bar names a timeline, in pages and counts as designers count them:
 * "Page 2's move" when a page box has exactly its range, "Page 2, counts 5–8" inside one page,
 * else "Page 2 count 5 to page 3 count 4". Ranges are spec beats; a page's counts start at 1 on
 * the beat after the previous flag.
 */
export function isolatedTimelineName(
    range: { readonly start: number; readonly end: number },
    pages: readonly (FlagPage & { readonly name: string })[],
): string {
    const boxes = pageFlags(pages).filter((f) => f.range !== null);
    const exact = boxes.find(
        (f) => f.range!.start === range.start && f.range!.end === range.end,
    );
    if (exact) return `Page ${exact.page.name}'s move`;
    const at = (beat: number) =>
        boxes.find((f) => f.range!.start <= beat && beat < f.range!.end);
    const first = at(range.start);
    const last = at(range.end - 1);
    if (!first || !last) return `Beats ${range.start}–${range.end}`;
    const from = range.start - first.range!.start + 1;
    const to = range.end - last.range!.start;
    return first === last
        ? `Page ${first.page.name}, counts ${from}–${to}`
        : `Page ${first.page.name} count ${from} to page ${last.page.name} count ${to}`;
}

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Esc ends isolation (V-14): the first Esc deselects marchers as it always does (the registered
 * Escape action), so isolation ends only on an Esc with nothing selected. Text fields and the line
 * or lasso tool keep their Esc. Listens in the capture phase, before the registered actions, which
 * mark Escape handled.
 */
export function useIsolationEscape(): void {
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const selectedCount = useSelectedMarchers()?.selectedMarchers.length ?? 0;
    const selected = useRef(selectedCount);
    selected.current = selectedCount;
    useEffect(() => {
        if (!isolated) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || isTyping(event.target)) return;
            if (useAlignmentEventStore.getState().alignmentEvent !== "default")
                return;
            if (selected.current > 0) return;
            useTimelineSelectionStore.getState().exitIsolation();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isolated]);
}

/**
 * The bar over the field while a timeline is isolated (docs/timeline/research/ownership/09-isolation.md,
 * _prototype_): which move is isolated, how many marchers are in it, a key for the gray ghosts,
 * and the way out. Renders nothing when no timeline is isolated.
 */
export default function TimelineIsolationBar() {
    useIsolationEscape();
    const timeline = useTimelineSelectionStore(isolatedTimeline);
    const { pages } = useTimingObjects()!;
    if (!timeline) return null;
    const count = timeline.marcherIds.size;
    return (
        <div
            data-testid="timeline-isolation-bar"
            role="status"
            className="border-accent bg-bg-1 text-text rounded-6 text-sub pointer-events-auto absolute top-8 left-1/2 z-10 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-12 border px-12 py-6 whitespace-nowrap shadow-md"
        >
            <span className="text-accent font-medium">Isolated</span>
            <span>
                {isolatedTimelineName(timeline, pages)} · {count}{" "}
                {count === 1 ? "marcher" : "marchers"}
            </span>
            <span className="text-text-subtitle flex min-w-0 items-center gap-4 truncate text-[11px]">
                <svg width="20" height="6" aria-hidden="true">
                    <line
                        x1="0"
                        y1="3"
                        x2="20"
                        y2="3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="2 4"
                    />
                </svg>
                <span className="truncate">
                    where this move would take marchers who left it
                </span>
            </span>
            <Button
                size="compact"
                variant="secondary"
                onClick={() =>
                    useTimelineSelectionStore.getState().exitIsolation()
                }
            >
                Done (Esc)
            </Button>
        </div>
    );
}
