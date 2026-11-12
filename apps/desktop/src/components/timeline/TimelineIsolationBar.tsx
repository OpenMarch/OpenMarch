import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import { FlagIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import Shortcut from "@/components/ui/Shortcut";
import { TRANSPORT_SHORTCUTS } from "./TransportButtons";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
import { isTyping, overlayOpen, spaceStaysPlay } from "./timelineHotkeys";
import { clipGestureActive } from "./TimelineClipResize";
import { useTimingObjects } from "@/hooks";
import { isShapeHidden, useShapeToolStore } from "@/shapes/tool/shapeToolStore";
import {
    isolatedTimeline,
    useTimelineSelectionStore,
    windowMove,
    type PageBox,
    type TimelineEditSelection,
} from "@/stores/TimelineSelectionStore";
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";
import { isPageTimeline, moveLabels } from "@/timeline/timelineViewModel";
import { joinList } from "@/timeline/translateTimelineText";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useExpertHolds } from "@/timeline/useExpertHolds";
import { holdTerms } from "@/timeline/holdTerms";
import {
    basicPageBox,
    planCanvasEdit,
    TimelineEditRefusedError,
    type CanvasEditPlan,
} from "@/timeline/timelineCoordinateWrites";

/**
 * How the isolation bar names a timeline, in pages and counts as designers count them:
 * "Page 2's move" when a page box has exactly its range, "Page 2, counts 5–8" inside one page,
 * else "Page 2 count 5 to page 3 count 4". Ranges are spec beats; a page's counts start at 1 on
 * the beat after the previous flag.
 */
export function isolatedTimelineName(
    range: { readonly start: number; readonly end: number },
    pages: readonly (FlagPage & { readonly name: string })[],
    /**
     * UI-25: the timeline is a move, not a page's own timeline, though its range may be a page
     * box's (a move split off it): named in counts, "Page 2, counts 1–8"
     */
    asMove = false,
): string {
    const boxes = pageFlags(pages).filter((f) => f.range !== null);
    // Page 1's box starts at beat 1, show time 0, which the store writes as beat 0 (a flag
    // pinned on page 1's start): the same moment, so name it as page 1's
    if (range.start === 0 && boxes[0]?.range?.start === 1)
        range = { start: 1, end: range.end };
    // Both lines held on one beat (UI-21): an empty window, named by its beat, not as a run of
    // pages read backwards ("Pages 5–4")
    if (range.end <= range.start) {
        const flag = boxes.find((f) => f.range!.end === range.start);
        if (flag)
            return tolgee.t("timeline.rangeName.flag", {
                page: flag.page.name,
            });
        const inside = boxes.find(
            (f) => f.range!.start <= range.start && range.start < f.range!.end,
        );
        return inside
            ? tolgee.t("timeline.rangeName.pageCount", {
                  page: inside.page.name,
                  count: range.start - inside.range!.start,
              })
            : tolgee.t("timeline.rangeName.beat", { beat: range.start });
    }
    const exact = boxes.find(
        (f) => f.range!.start === range.start && f.range!.end === range.end,
    );
    if (exact && !asMove)
        return tolgee.t("timeline.rangeName.pageMove", {
            page: exact.page.name,
        });
    const at = (beat: number) =>
        boxes.find((f) => f.range!.start <= beat && beat < f.range!.end);
    const first = at(range.start);
    const last = at(range.end - 1);
    // Past the last flag, where the next page gets written (UI-12)
    const lastBox = boxes[boxes.length - 1];
    if (!first && lastBox && range.start >= lastBox.range!.end)
        return tolgee.t("timeline.rangeName.afterPage", {
            page: lastBox.page.name,
            from: range.start - lastBox.range!.end + 1,
            to: range.end - lastBox.range!.end,
        });
    if (!first || !last)
        return tolgee.t("timeline.rangeName.beats", {
            from: range.start,
            to: range.end,
        });
    // Whole pages: "Pages 2–3" (UI-17 follow-up, plainer than counts from page to page)
    if (
        first !== last &&
        first.range!.start === range.start &&
        last.range!.end === range.end
    )
        return tolgee.t("timeline.rangeName.pages", {
            from: first.page.name,
            to: last.page.name,
        });
    const from = range.start - first.range!.start + 1;
    const to = range.end - last.range!.start;
    // "count 3" for one count, not "counts 3–3" (UI-14 review)
    if (first !== last)
        return tolgee.t("timeline.rangeName.pageToPage", {
            fromPage: first.page.name,
            from,
            toPage: last.page.name,
            to,
        });
    return from === to
        ? tolgee.t("timeline.rangeName.pageCount", {
              page: first.page.name,
              count: from,
          })
        : tolgee.t("timeline.rangeName.pageCounts", {
              page: first.page.name,
              from,
              to,
          });
}

/**
 * Esc ends isolation (V-14). Since the UI-14 round-2 review one Esc leaves isolation however it
 * was entered, also with marchers selected (the registered Escape action deselects them in the
 * same press; **Edit move** selects nobody). Text fields, open popovers, menus and dialogs, and
 * the open shape tool keep their Esc (not a shape waiting out of sight, #416).
 * Listens in the capture phase, before the registered actions, which mark Escape handled.
 */
export function useIsolationEscape(): void {
    const active = useTimelineSelectionStore((s) => s.isolation !== null);
    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || isTyping(event.target)) return;
            // A shape waiting out of sight has no keys listening (#416), so this Esc is ours
            if (useShapeToolStore.getState().tool && !isShapeHidden()) return;
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

/**
 * Where a Basic point edit lands (UI-19): a page (on its flag, `count` null), or a count inside a
 * page, counted from the page's start. Takes the point target `planCanvasEdit` chose, so the line
 * names what a drop writes. `null` when no page ends on the box.
 */
export function basicEditSpot(
    target: {
        readonly beat: number;
        readonly box: { readonly start: number; readonly end: number };
    },
    pages: readonly (FlagPage & { readonly name: string })[],
): { pageName: string; count: number | null } | null {
    const flag = pageFlags(pages).find(
        (f) =>
            f.range?.start === target.box.start &&
            f.range.end === target.box.end,
    );
    if (!flag) return null;
    return {
        pageName: flag.page.name,
        count:
            target.beat === target.box.end
                ? null
                : target.beat - target.box.start,
    };
}

/**
 * Where playing on stopped (UI-17): home, the page Basic would edit at the playhead (its box holds
 * the playhead, or ends on it), or past the last flag. `null` with nothing selected or before the
 * boxes load. A range is placed by its end, which is the playhead.
 */
export type StoppedSpot =
    | { readonly kind: "home" }
    | { readonly kind: "page"; readonly name: string }
    | { readonly kind: "after" };

export function stoppedSpot(
    selection: TimelineEditSelection,
    pageBoxes: readonly PageBox[],
): StoppedSpot | null {
    if (selection.kind === "home") return { kind: "home" };
    if (selection.kind !== "range") return null;
    const box = basicPageBox({ pageBoxes }, selection.end);
    if (box) {
        const name = pageBoxes.find(
            (b) => b.start === box.start && b.end === box.end,
        )?.name;
        return name === undefined ? null : { kind: "page", name };
    }
    const last = pageBoxes[pageBoxes.length - 1];
    return last && selection.end > last.end ? { kind: "after" } : null;
}

/**
 * The field line's note when playing on stops on another page (UI-17), which since UI-24 only a
 * pause does: Stop goes back to where Play was pressed. It names where, because "Stopped on a new
 * page" read as "the app made a page" (basic-past-flag study: all four users went to check). Never
 * home: playing on only moves the playhead forward.
 */
export function stoppedNote(
    spot: Exclude<StoppedSpot, { kind: "home" }>,
): string {
    return spot.kind === "page"
        ? tolgee.t("timeline.windowLine.pausedOnPage", { page: spot.name })
        : tolgee.t("timeline.windowLine.pausedAfterLast");
}

/**
 * What the field line says a drop edits: "Editing …", or, when Basic refuses the edit because the
 * playhead is past the last flag, how to make a page there (the line names what a drop writes).
 */
export function editingWords(
    plan: CanvasEditPlan | null,
    name: string,
): string {
    return plan &&
        !plan.ok &&
        plan.error instanceof TimelineEditRefusedError &&
        plan.error.refusal === "pastLastPage"
        ? tolgee.t("timeline.windowLine.addPageHere")
        : tolgee.t("timeline.windowLine.editing", { name });
}

/** "set 3", "sets 3 and 4", "sets 3, 4 and 5" (UI-17 follow-up: plainer than "page 3's set") */
export const passedSets = (names: readonly string[]) =>
    tolgee.t("timeline.windowLine.passedSets", {
        count: names.length,
        names: joinList(names),
    });

/**
 * The line over the field (UI-12, replacing UI-11's From start badge): what a drag edits now, so
 * the window is never only a tint on the timeline. Quiet (no border, subtitle text) for an
 * ordinary page: a whole page box. Prominent, and flashed
 * once, when anything is unusual: a partial window, a window
 * passing page flags (that part never truncates), or past the last flag. With looping on it
 * names it while it is elsewhere ("Space loops Page 3's move", UI-17). When only some of the
 * selection is Held at the playhead it says how many ("· 1 of 2 Held", #805), since a drag edits
 * each marcher by its own kind and you're looking at the field when you drag. Only the buttons take the pointer, so the field under it stays
 * usable. Screen readers hear the sentence once it settles, not on every scrubbed beat. Hidden
 * while isolated: the isolation bar says it instead.
 */
export function TimelineFromStartBadge() {
    const { t } = useTranslate();
    const selection = useTimelineSelectionStore((s) => s.selection);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const playing = useTimelineSelectionStore((s) => s.playback !== null);
    const { pages } = useTimingObjects()!;
    const basic = useIsBasicMode();
    const range = selection.kind === "range" ? selection : null;
    // UI-17: with looping on, the loop's name when it isn't the window being edited
    const loop = useTimelineSelectionStore((s) => s.loop);
    const loopName =
        loop && !(range && range.start === loop.start && range.end === loop.end)
            ? isolatedTimelineName(loop, pages)
            : null;
    // Only when the loop is elsewhere: on the page being edited, the lit Loop button, the bar and
    // Play's icon say it (owner, 2026-10-09)
    const loopShown = !basic && !isolated && loopName !== null;
    // UI-19: Basic has no start flag or loop; it edits a page, or a count inside one. The line
    // asks the writer's own plan, so it names what a drop writes
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const plan =
        basic && range
            ? planCanvasEdit({ selection, isolation: null, pageBoxes }, basic)
            : null;
    const basicSpot =
        plan?.ok && plan.target.kind === "point"
            ? basicEditSpot(plan.target, pages)
            : null;
    const through = range && !basic ? flagsInside(range, pages) : [];
    // #805: "· 1 of 2 Held" where only some of the selection is Held at the playhead
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers;
    const marcherIds = useMemo(
        () => (selectedMarchers ?? []).map((m) => m.id),
        [selectedMarchers],
    );
    const partlyHeld = useExpertHolds(marcherIds).partlyHeld;
    const heldParams = partlyHeld && {
        ...holdTerms(),
        count: partlyHeld.held,
        total: partlyHeld.total,
    };
    // UI-25: a move split off a page's timeline has the page's range; the line names the move
    const splitMoveName = useTimelineSelectionStore((s) => {
        const move = basic ? null : windowMove(s);
        if (!move || s.isolation) return null;
        if (
            !s.pageBoxes.some(
                (b) => b.start === move.start && b.end === move.end,
            )
        )
            return null;
        return (
            moveLabels(s.storedTimelines ?? [], s.pageBoxes).get(move.id) ??
            null
        );
    });
    const name =
        selection.kind === "home"
            ? t("timeline.windowLine.home")
            : basicSpot
              ? basicSpot.count === null
                  ? t("timeline.windowLine.page", { page: basicSpot.pageName })
                  : t("timeline.windowLine.countOfPage", {
                        count: basicSpot.count,
                        page: basicSpot.pageName,
                    })
              : splitMoveName !== null && range
                ? t("timeline.windowLine.moveAt", {
                      move: splitMoveName,
                      where: isolatedTimelineName(range, pages, true),
                  })
                : range
                  ? isolatedTimelineName(range, pages)
                  : "";
    const wholePage = basicSpot
        ? basicSpot.count === null
        : isWholePageWindow(selection, pages);
    // UI-17: playing on that stops on another page says so loudly (round 3: all four testers
    // missed the quiet line and edited the next page's set). Pages, not names, are compared, so
    // stopping inside the page it started on stays quiet
    const spot = stoppedSpot(selection, pageBoxes);
    const spotKey =
        spot === null
            ? null
            : spot.kind === "page"
              ? `page ${spot.name}`
              : spot.kind;
    const [stoppedAt, setStoppedAt] = useState<string | null>(null);
    const keyAtPlay = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (playing) {
            if (keyAtPlay.current === undefined) keyAtPlay.current = spotKey;
            setStoppedAt(null);
            return;
        }
        const from = keyAtPlay.current;
        keyAtPlay.current = undefined;
        if (from === undefined || spotKey === null || from === spotKey) return;
        setStoppedAt(spotKey);
        const timeout = setTimeout(() => setStoppedAt(null), 4000);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing]);
    // Leaving the page it stopped on drops the note for good (coming back doesn't bring it back)
    useEffect(() => {
        setStoppedAt((at) => (at !== null && at !== spotKey ? null : at));
    }, [spotKey]);
    const stopped =
        !playing && spot && spot.kind !== "home" && stoppedAt === spotKey
            ? stoppedNote(spot)
            : null;
    const movedOn = stopped !== null;
    const editing = editingWords(basic ? plan : null, name);
    const unusual =
        loopShown ||
        through.length > 0 ||
        !wholePage ||
        movedOn ||
        heldParams !== null;
    let sentence = "";
    if (selection.kind !== "none") {
        sentence = through.length
            ? t("timeline.windowLine.editingThrough", {
                  editing,
                  sets: passedSets(through),
              })
            : editing;
        if (heldParams)
            sentence = t("timeline.windowLine.withHeld", {
                ...heldParams,
                rest: sentence,
            });
        if (stopped)
            sentence = t("timeline.windowLine.afterPaused", {
                paused: stopped,
                rest: sentence,
            });
        if (loopShown)
            sentence = t("timeline.windowLine.withLoop", {
                rest: sentence,
                key: TRANSPORT_SHORTCUTS.play,
                loop: loopName ?? "",
            });
    }
    // Flash when it turns prominent for a new reason: a loop elsewhere, or crossing flags
    const flashKey = `${loopShown}|${through.join(",")}`;
    const [fresh, setFresh] = useState(false);
    useEffect(() => {
        if (!loopShown && through.length === 0) return;
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
                          loopShown || through.length
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
                {stopped && (
                    <strong className={START_INK.strongText}>
                        {t("timeline.windowLine.pausedPrefix", {
                            paused: stopped,
                        })}{" "}
                    </strong>
                )}
                {editing}
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
                    {t("timeline.windowLine.through", {
                        sets: passedSets(through),
                    })}
                </span>
            )}
            {heldParams && (
                <span
                    data-testid="timeline-window-held"
                    aria-hidden="true"
                    className="shrink-0 font-medium"
                >
                    {t("timeline.windowLine.held", heldParams)}
                </span>
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
                        <T
                            keyName="timeline.windowLine.loops"
                            params={{
                                keys: () => <Shortcut action="playPause" />,
                                loop: loopName ?? "",
                            }}
                        />
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
    const { t } = useTranslate();
    useIsolationEscape();
    const timeline = useTimelineSelectionStore(isolatedTimeline);
    // UI-25: a move split off a page's timeline is named as a move, not as the page's
    const isPage = useTimelineSelectionStore(
        (s) =>
            timeline !== null &&
            isPageTimeline(timeline, s.storedTimelines ?? [], s.pageBoxes),
    );
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
            <span className="text-accent font-medium">
                {t("timeline.isolation.title")}
            </span>
            <span>
                {t("timeline.isolation.summary", {
                    name: isolatedTimelineName(timeline, pages, !isPage),
                    count,
                })}
            </span>
            <span className="text-text-subtitle text-sub flex min-w-0 items-center gap-4 truncate">
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
                        {t("timeline.isolation.ghostKeySpoken")}
                    </span>
                    <span aria-hidden="true">
                        {t("timeline.isolation.ghostKey")}
                    </span>
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
                <T
                    keyName="timeline.isolation.done"
                    params={{ keys: () => <Shortcut binding="Escape" /> }}
                />
            </Button>
        </div>
    );
}
