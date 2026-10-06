import { useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { Button } from "@openmarch/ui";
import { FlagIcon, PushPinSlashIcon, XIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
import { isTyping, overlayOpen } from "./timelineHotkeys";
import { useTimingObjects } from "@/hooks";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import {
    isolatedTimeline,
    useTimelineSelectionStore,
    type TimelineEditSelection,
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
    // Past the last flag, where the next page gets written (UI-12)
    const lastBox = boxes[boxes.length - 1];
    if (!first && lastBox && range.start >= lastBox.range!.end)
        return `After page ${lastBox.page.name}, counts ${range.start - lastBox.range!.end + 1}–${range.end - lastBox.range!.end}`;
    if (!first || !last) return `Beats ${range.start}–${range.end}`;
    const from = range.start - first.range!.start + 1;
    const to = range.end - last.range!.start;
    return first === last
        ? `Page ${first.page.name}, counts ${from}–${to}`
        : `Page ${first.page.name} count ${from} to page ${last.page.name} count ${to}`;
}

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

/** The page flags strictly inside `[start, end)`: the pages a window passes through (UI-12) */
export function flagsInside(
    range: { readonly start: number; readonly end: number },
    pages: readonly (FlagPage & { readonly name: string })[],
): string[] {
    return pageFlags(pages).flatMap((f) =>
        f.range && f.range.end > range.start && f.range.end < range.end
            ? [f.page.name]
            : [],
    );
}

/**
 * The window is an ordinary page's: home, or exactly a page box's range. The field line stays
 * quiet for it (UI-12); anything else is unusual.
 */
export function isWholePageWindow(
    selection: TimelineEditSelection,
    pages: readonly FlagPage[],
): boolean {
    if (selection.kind === "home") return true;
    if (selection.kind !== "range") return false;
    return pageFlags(pages).some(
        (f) =>
            f.range !== null &&
            f.range.start === selection.start &&
            f.range.end === selection.end,
    );
}

/** "page 3's set", "pages 3 and 4's sets", "pages 3, 4 and 5's sets" */
export const passedSets = (names: readonly string[]) =>
    names.length === 1
        ? `page ${names[0]}'s set`
        : `pages ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}'s sets`;

/**
 * The line over the field (UI-12, replacing UI-11's From start badge): what a drag edits now, so
 * the window is never only a tint on the timeline. Quiet (no border, subtitle text) for an
 * ordinary page: a whole page box, start flag not pinned, From start off. Prominent, and flashed
 * once, when anything is unusual: a partial window, a pinned start flag (with **Unpin**), a window
 * passing page flags (that part never truncates), past the last flag, or From start on ("Space
 * replays it", with the way out). Only the buttons take the pointer, so the field under it stays
 * usable. Screen readers hear the sentence once it settles, not on every scrubbed beat. Hidden
 * while isolated: the isolation bar says it instead.
 */
export function TimelineFromStartBadge() {
    const on = useTimelineSelectionStore((s) => s.playFromStart);
    const selection = useTimelineSelectionStore((s) => s.selection);
    const startBeat = useTimelineSelectionStore((s) => s.startBeat);
    const pinned = useTimelineSelectionStore((s) => s.startPinned);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const playing = useTimelineSelectionStore((s) => s.playback !== null);
    const holding = useTimelineSelectionStore(
        (s) => s.playback === null && s.cursorBeat !== null,
    );
    const { pages } = useTimingObjects()!;
    const range = selection.kind === "range" ? selection : null;
    const fromStartShown = on && !isolated && range !== null;
    // The pin only matters while it bounds the window (not after Stop, when P is on or before it)
    const pinShown = pinned && range !== null && range.start === startBeat;
    const through = range ? flagsInside(range, pages) : [];
    const name =
        selection.kind === "home"
            ? "home positions"
            : range
              ? isolatedTimelineName(range, pages)
              : "";
    const wholePage = isWholePageWindow(selection, pages);
    const unusual =
        fromStartShown || pinShown || through.length > 0 || !wholePage;
    const sentence =
        selection.kind === "none"
            ? ""
            : `Editing ${name}${through.length ? `, passing through ${passedSets(through)}` : ""}${pinShown ? ", start flag pinned" : ""}${fromStartShown ? ". Space replays it" : ""}`;
    // Flash when it turns prominent for a new reason: From start, a pin, or crossing flags
    const flashKey = `${fromStartShown}|${pinShown}|${through.join(",")}`;
    const [fresh, setFresh] = useState(false);
    useEffect(() => {
        if (!fromStartShown && !pinShown && through.length === 0) return;
        setFresh(true);
        const timeout = setTimeout(() => setFresh(false), 900);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flashKey]);
    // Announced once the window settles, not on every beat of a scrub
    const [announced, setAnnounced] = useState(sentence);
    useEffect(() => {
        const timeout = setTimeout(() => setAnnounced(sentence), 600);
        return () => clearTimeout(timeout);
    }, [sentence]);
    if (isolated || selection.kind === "none") return null;
    return (
        <div
            data-testid="timeline-window-line"
            data-prominent={unusual || undefined}
            className={clsx(
                "rounded-6 text-sub pointer-events-none absolute top-8 left-8 z-10 flex max-w-[calc(50%-24px)] items-center gap-8 px-8 py-4 whitespace-nowrap transition-[opacity,box-shadow] duration-300",
                unusual
                    ? clsx(
                          "bg-bg-1 text-text border shadow-md",
                          fromStartShown || pinShown || through.length
                              ? START_INK.border
                              : "border-stroke",
                      )
                    : "bg-bg-1/70 text-text-subtitle",
                fresh && `ring-4 ${START_INK.ring}`,
                (playing || holding) && "opacity-60",
            )}
        >
            <span className="sr-only" role="status">
                {announced}
            </span>
            <FlagIcon
                size={14}
                aria-hidden="true"
                weight={fromStartShown ? "fill" : "regular"}
                className={clsx("shrink-0", START_INK.text)}
            />
            <span className="truncate" aria-hidden="true">
                Editing {name}
            </span>
            {through.length > 0 && (
                <span
                    data-testid="timeline-window-through"
                    aria-hidden="true"
                    className={clsx(
                        "shrink-0 font-medium",
                        START_INK.strongText,
                    )}
                >
                    · passes through {passedSets(through)}
                </span>
            )}
            {holding && (
                <span
                    aria-hidden="true"
                    className="text-text-subtitle shrink-0"
                >
                    · paused frame
                </span>
            )}
            {pinShown && (
                <button
                    type="button"
                    data-testid="timeline-window-unpin"
                    title="The start flag is pinned: it stays here when you move to other pages. Unpin it to follow the page again."
                    className={clsx(
                        "rounded-4 hover:bg-fg-2 pointer-events-auto flex shrink-0 items-center gap-4 border px-6 py-1 text-[11px]",
                        START_INK.border,
                        START_INK.strongText,
                    )}
                    onClick={() =>
                        useTimelineSelectionStore.getState().unpinStart()
                    }
                >
                    <PushPinSlashIcon size={11} weight="fill" />
                    Unpin
                </button>
            )}
            {fromStartShown && (
                <span
                    data-testid="timeline-from-start-badge"
                    className="border-stroke flex shrink-0 items-center gap-6 border-l pl-8"
                >
                    <span aria-hidden="true">Space replays it</span>
                    <button
                        type="button"
                        aria-label="Turn off From start"
                        title="Turn off From start (C or Esc)"
                        className="text-text-subtitle hover:text-text pointer-events-auto flex items-center"
                        onClick={() =>
                            useTimelineSelectionStore
                                .getState()
                                .setPlayFromStart(false)
                        }
                    >
                        <XIcon size={12} weight="bold" />
                    </button>
                </span>
            )}
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
