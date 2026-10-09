import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import { FlagIcon, PushPinSlashIcon } from "@phosphor-icons/react";
import { Keycaps } from "./ShortcutTooltip";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
import { isTyping, overlayOpen, spaceStaysPlay } from "./timelineHotkeys";
import { clipGestureActive } from "./TimelineClipResize";
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
    // Page 1's box starts at beat 1, show time 0, which the store writes as beat 0 (a flag
    // pinned on page 1's start): the same moment, so name it as page 1's
    if (range.start === 0 && boxes[0]?.range?.start === 1)
        range = { start: 1, end: range.end };
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
    // Whole pages: "Pages 2–3" (UI-17 follow-up, plainer than counts from page to page)
    if (
        first !== last &&
        first.range!.start === range.start &&
        last.range!.end === range.end
    )
        return `Pages ${first.page.name}–${last.page.name}`;
    const from = range.start - first.range!.start + 1;
    const to = range.end - last.range!.start;
    // "count 3" for one count, not "counts 3–3" (UI-14 review)
    const counts = from === to ? `count ${from}` : `counts ${from}–${to}`;
    return first === last
        ? `Page ${first.page.name}, ${counts}`
        : `Page ${first.page.name} count ${from} to page ${last.page.name} count ${to}`;
}

/**
 * Esc ends isolation (V-14). Since the UI-14 round-2 review one Esc leaves isolation however it
 * was entered, also with marchers selected (the registered Escape action deselects them in the
 * same press; **Edit move** selects nobody). Text fields, open popovers, menus and dialogs, and
 * the line or lasso tool keep their Esc.
 * Listens in the capture phase, before the registered actions, which mark Escape handled.
 */
export function useIsolationEscape(): void {
    const active = useTimelineSelectionStore((s) => s.isolation !== null);
    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || isTyping(event.target)) return;
            if (useAlignmentEventStore.getState().alignmentEvent !== "default")
                return;
            if (overlayOpen()) return;
            // A clip move or resize in progress takes this Esc (resize-move E14)
            if (clipGestureActive()) return;
            // UI-14 round-2 review: the bar says "Done (Esc)", so one Esc leaves isolation, with
            // or without a selection (the registered Escape action deselects in the same press)
            useTimelineSelectionStore.getState().exitIsolation();
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

/** "set 3", "sets 3 and 4", "sets 3, 4 and 5" (UI-17 follow-up: plainer than "page 3's set") */
export const passedSets = (names: readonly string[]) =>
    names.length === 1
        ? `set ${names[0]}`
        : `sets ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The line over the field (UI-12, replacing UI-11's From start badge): what a drag edits now, so
 * the window is never only a tint on the timeline. Quiet (no border, subtitle text) for an
 * ordinary page: a whole page box, start flag not pinned. Prominent, and flashed
 * once, when anything is unusual: a partial window, a pinned start flag (with **Unpin**), a window
 * passing page flags (that part never truncates), or past the last flag. With looping on it
 * names it while it is elsewhere ("Space loops Page 3's move", UI-17). Only the buttons take the pointer, so the field under it stays
 * usable. Screen readers hear the sentence once it settles, not on every scrubbed beat. Hidden
 * while isolated: the isolation bar says it instead.
 */
export function TimelineFromStartBadge() {
    const selection = useTimelineSelectionStore((s) => s.selection);
    const startBeat = useTimelineSelectionStore((s) => s.startBeat);
    const pinned = useTimelineSelectionStore((s) => s.startPinned);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const playing = useTimelineSelectionStore((s) => s.playback !== null);
    const { pages } = useTimingObjects()!;
    const range = selection.kind === "range" ? selection : null;
    // The pin only matters while it bounds the window (not when P is on or before it)
    const pinShown = pinned && range !== null && range.start === startBeat;
    // UI-17: with looping on, the loop's name when it isn't the window being edited
    const loop = useTimelineSelectionStore((s) => s.loop);
    const loopName =
        loop && !(range && range.start === loop.start && range.end === loop.end)
            ? isolatedTimelineName(loop, pages)
            : null;
    // Only when the loop is elsewhere: on the page being edited, the lit Loop button, the bar and
    // Play's icon say it (owner, 2026-10-09)
    const loopShown = !isolated && loopName !== null;
    const through = range ? flagsInside(range, pages) : [];
    const name =
        selection.kind === "home"
            ? "home positions"
            : range
              ? isolatedTimelineName(range, pages)
              : "";
    const wholePage = isWholePageWindow(selection, pages);
    // UI-17: playing on that stops on another page says so loudly (round 3: all four testers
    // missed the quiet line and edited the next page's set)
    const [movedOn, setMovedOn] = useState(false);
    const nameAtPlay = useRef<string | null>(null);
    useEffect(() => {
        if (playing) {
            nameAtPlay.current ??= name;
            setMovedOn(false);
            return;
        }
        const from = nameAtPlay.current;
        nameAtPlay.current = null;
        if (from === null || from === name) return;
        setMovedOn(true);
        const timeout = setTimeout(() => setMovedOn(false), 4000);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing]);
    const unusual =
        loopShown || pinShown || through.length > 0 || !wholePage || movedOn;
    const sentence =
        selection.kind === "none"
            ? ""
            : `${movedOn ? "Stopped on a new page. " : ""}Editing ${name}${through.length ? `, through ${passedSets(through)}` : ""}${pinShown ? ", start flag pinned" : ""}${loopShown ? `. Space loops ${loopName}` : ""}`;
    // Flash when it turns prominent for a new reason: a pin, or crossing flags
    const flashKey = `${loopShown}|${pinShown}|${through.join(",")}`;
    const [fresh, setFresh] = useState(false);
    useEffect(() => {
        if (!loopShown && !pinShown && through.length === 0) return;
        setFresh(true);
        const timeout = setTimeout(() => setFresh(false), 900);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flashKey]);
    // Announced once the window settles, not on every beat of a scrub; and at once when the line
    // comes back (leaving isolation, UI-14 round-2 review), not with what it said while hidden
    const hidden = isolated || selection.kind === "none";
    const [announced, setAnnounced] = useState(sentence);
    const wasHidden = useRef(hidden);
    // Before paint, so the live region never shows the stale sentence
    useLayoutEffect(() => {
        const reappeared = wasHidden.current && !hidden;
        wasHidden.current = hidden;
        if (reappeared) {
            setAnnounced(sentence);
            return;
        }
        const timeout = setTimeout(() => setAnnounced(sentence), 600);
        return () => clearTimeout(timeout);
    }, [sentence, hidden]);
    if (hidden) return null;
    return (
        <div
            data-testid="timeline-window-line"
            data-prominent={unusual || undefined}
            className={clsx(
                "rounded-6 text-sub pointer-events-none absolute top-8 left-8 z-10 flex max-w-[calc(50%-24px)] items-center gap-8 px-8 py-4 whitespace-nowrap transition-[opacity,box-shadow] duration-300",
                unusual
                    ? clsx(
                          "bg-bg-1 text-text border shadow-md",
                          loopShown || pinShown || through.length
                              ? START_INK.border
                              : "border-stroke",
                      )
                    : "bg-bg-1/70 text-text-subtitle",
                (fresh || movedOn) && `ring-4 ${START_INK.ring}`,
                playing && "opacity-60",
            )}
        >
            <span className="sr-only" role="status">
                {announced}
            </span>
            <FlagIcon
                size={14}
                aria-hidden="true"
                weight={loopShown ? "fill" : "regular"}
                className={clsx("shrink-0", START_INK.text)}
            />
            <span className="truncate" aria-hidden="true">
                {movedOn && (
                    <strong className={START_INK.strongText}>
                        Stopped on a new page ·{" "}
                    </strong>
                )}
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
                    · through {passedSets(through)}
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
            {loopShown && (
                <span
                    data-testid="timeline-loop-badge"
                    className="border-stroke flex shrink-0 items-center gap-6 border-l pl-8"
                >
                    <span
                        aria-hidden="true"
                        className="flex items-center gap-4"
                    >
                        <Keycaps shortcut="Space" />
                        loops {loopName}
                    </span>
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
            // UI-14 round-2 review: Enter presses Done, Space plays
            data-timeline-own-keys="true"
            onKeyDown={spaceStaysPlay}
            onKeyUp={spaceStaysPlay}
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
                    {/* UI-14 review: read as a key, not run on into the line before */}
                    <span className="sr-only">
                        Key: dotted gray paths show{" "}
                    </span>
                    where this move would take marchers who left it
                </span>
            </span>
            <Button
                size="compact"
                variant="secondary"
                className="focus-visible:ring-accent focus-visible:ring-2"
                onClick={() =>
                    useTimelineSelectionStore.getState().exitIsolation()
                }
            >
                Done (Esc)
            </Button>
        </div>
    );
}
