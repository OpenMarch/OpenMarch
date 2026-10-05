import { useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { Button } from "@openmarch/ui";
import { FlagIcon, XIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
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

/** A popover, menu or dialog is open: its Esc closes it, and nothing else */
const overlayOpen = () =>
    document.querySelector(
        '[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"][data-state="open"], [role="alertdialog"]',
    ) !== null;

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Esc ends isolation (V-14), and after that turns **From start** off (UI-11): the first Esc
 * deselects marchers as it always does (the registered Escape action), so these happen only on an
 * Esc with nothing selected, one per press. Text fields, open popovers, menus and dialogs, and the
 * line or lasso tool keep their Esc.
 * Listens in the capture phase, before the registered actions, which mark Escape handled.
 */
export function useIsolationEscape(): void {
    const active = useTimelineSelectionStore(
        (s) => s.isolation !== null || s.playFromStart,
    );
    const selectedCount = useSelectedMarchers()?.selectedMarchers.length ?? 0;
    const selected = useRef(selectedCount);
    selected.current = selectedCount;
    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || isTyping(event.target)) return;
            if (useAlignmentEventStore.getState().alignmentEvent !== "default")
                return;
            if (selected.current > 0 || overlayOpen()) return;
            const store = useTimelineSelectionStore.getState();
            if (store.isolation) store.exitIsolation();
            else if (store.playFromStart) store.setPlayFromStart(false);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [active]);
}

/**
 * The badge over the field while **From start** is on (UI-11): what Space will replay, and the
 * ways out (the badge's ✕, C, Esc). It flashes once when it appears, since a dragged range turns
 * the mode on without a key press. Shows only with a window to play; renders nothing otherwise.
 */
export function TimelineFromStartBadge() {
    const on = useTimelineSelectionStore((s) => s.playFromStart);
    const selection = useTimelineSelectionStore((s) => s.selection);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const { pages } = useTimingObjects()!;
    const shown = on && !isolated && selection.kind === "range";
    const [fresh, setFresh] = useState(false);
    useEffect(() => {
        if (!shown) return;
        setFresh(true);
        const timeout = setTimeout(() => setFresh(false), 900);
        return () => clearTimeout(timeout);
    }, [shown]);
    if (!shown) return null;
    return (
        <div
            data-testid="timeline-from-start-badge"
            role="status"
            className={clsx(
                "bg-bg-1 text-text rounded-6 text-sub pointer-events-auto absolute top-8 left-8 z-10 flex max-w-[calc(50%-24px)] items-center gap-8 border px-8 py-4 whitespace-nowrap shadow-md transition-shadow duration-300",
                START_INK.border,
                fresh && `ring-4 ${START_INK.ring}`,
            )}
        >
            <FlagIcon
                size={14}
                weight="fill"
                className={clsx("shrink-0", START_INK.text)}
            />
            <span className="truncate">
                Space replays {isolatedTimelineName(selection, pages)}
            </span>
            <button
                type="button"
                aria-label="Turn off From start"
                title="Turn off (C or Esc)"
                className="text-text-subtitle hover:text-text flex items-center"
                onClick={() =>
                    useTimelineSelectionStore.getState().setPlayFromStart(false)
                }
            >
                <XIcon size={12} weight="bold" />
            </button>
        </div>
    );
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
