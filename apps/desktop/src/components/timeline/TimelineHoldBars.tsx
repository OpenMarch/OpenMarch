import {
    memo,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import tolgee from "@/global/singletons/Tolgee";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { holdTerms } from "@/timeline/holdTerms";
import {
    notDefinedOver,
    type BeatRange,
    type SelectionDeparture,
    type SelectionHoldBar,
    type SelectionHolds,
} from "@/timeline/timelineHoldBars";
import type { TimelinePageMarker } from "./TimelineViewModel";
import {
    beatToX,
    getPageCountAt,
    TIMELINE_PAGE_ROW_BOTTOM,
} from "./TimelineGeometry";

/**
 * A bar's drawn line at rest (px): a thin, quiet line, Held and Not defined alike, so only solid vs
 * dashed tells them apart
 */
const LINE_HEIGHT = 2;
/** A lit bar's line (px): it grows, in the accent, where an edit would carry */
const LIT_LINE_HEIGHT = 6;
/**
 * A bar's box (px), taller than its line: what a right-click finds (`holdBarPageAt`), so a thin
 * line is still easy to hit. Half of it sits over the measure row.
 */
const HIT_HEIGHT = 10;
/** How long a line takes to grow or shrink as it lights (ms) */
const GROW_MS = 120;
/** A Not defined bar's dashes and the gaps between them (px) */
const DASH = 5;
const GAP = 3;
/** A departure tick (px) */
const TICK_WIDTH = 2;
const TICK_HEIGHT = 8;
/**
 * A borrowed hold's hatching: thin stripes over a lighter fill of the same color. At rest (2 px)
 * it reads as a lighter, still unbroken line, so it stays Held next to the dashes of Not defined;
 * lit (6 px), as a hatched one
 */
const HATCH = `repeating-linear-gradient(-45deg, currentColor 0 1px, transparent 1px 4px), color-mix(in srgb, currentColor 50%, transparent)`;
/**
 * How far above the bars a borrowed hold's line back to its source runs, its chip centered on it
 * (px): clear of the Not defined dashes under it, and under the page names
 */
const SOURCE_LIFT = 7;
/** The narrowest borrowed bar that still shows its chip (px) */
const CHIP_MIN_WIDTH = 28;

/** Marks a hold bar, so a right-click on it can find the page box under it (`holdBarPageAt`) */
const HOLD_BAR_ATTRIBUTE = "data-timeline-hold-bar";

/**
 * The selection's holds (holds README decisions 10 and 11; fork #472, #477), at exact counts on
 * the page row's bottom edge, where the keyframe diamonds are: **Held** solid, **Not defined**
 * lighter and dashed, a shape carried on solid (it is the shape's hold), Held dashed where some of
 * the selection is Not defined over the same counts, and a tick at each
 * **departure**, where the next move takes over. At rest each is a thin, quiet line. A bar an edit
 * would carry into is lit: it grows thicker, in the accent, during a field drag and while
 * **Remove keyframe, Pages N–M move back too** is hovered or focused.
 *
 * A **borrowed** Held hold (nothing arrives at its start; fork #474, holds 04-anchors "Display")
 * draws lighter and hatched, with a small chip naming the spot it holds ("Held · Page 2's spot").
 * Its line back to that spot shows only while the bar is hovered, lit, or holds the count the
 * selected page or window ends on. In Basic it draws as plain Held, the spot named in its label.
 *
 * Under the diamonds and the flag grips, and they take no pointer: the page boxes under them still
 * select and scrub, and a right-click on one opens its page box's menu (`holdBarPageAt`), with
 * **Define as shown**. Nothing selected, no bars.
 */
export const TimelineHoldBars = memo(function TimelineHoldBars({
    holds,
    pages,
    pixelsPerBeat,
    selectedEnd = null,
}: {
    /** In view beats */
    holds: SelectionHolds;
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
    /**
     * The count a drag would edit, in view beats: the selected page box's or window's end. A
     * borrowed hold it's inside shows its line back to the spot it holds
     */
    selectedEnd?: number | null;
}) {
    const labels = useMemo(
        () => holds.bars.map((bar) => holdBarLabel(bar, pages)),
        [holds.bars, pages],
    );
    const tickLabels = useMemo(
        () =>
            holds.departures.map((departure) =>
                departureLabel(departure, pages),
            ),
        [holds.departures, pages],
    );
    const basic = useIsBasicMode();
    const borrowed = useMemo(
        () =>
            basic
                ? NO_BARS
                : holds.bars.filter((bar) => bar.borrowedFrom !== undefined),
        [basic, holds.bars],
    );
    const hovered = useHoveredBar(borrowed);
    if (holds.bars.length === 0 && holds.departures.length === 0) return null;
    // Unlit bars first, so a lit one overlapping them is drawn over them; then Not defined under
    // Held, whose dashes over a mixed stretch then show in the Held color
    const order = holds.bars
        .map((bar, index) => ({ bar, index }))
        .sort(
            (a, b) =>
                Number(a.bar.lit) - Number(b.bar.lit) ||
                Number(a.bar.kind === "held") - Number(b.bar.kind === "held"),
        );
    // Keyed without the lit state where that's unique, so a bar that lights or goes out keeps its
    // element and its line grows or shrinks in place
    const keys = new Set<string>();
    const keyOf = (bar: SelectionHoldBar) => {
        const key = `${bar.kind}:${bar.start}:${bar.end}:${bar.shape}`;
        if (!keys.has(key)) {
            keys.add(key);
            return key;
        }
        return `${key}:${bar.lit}`;
    };
    return (
        <>
            {order.map(({ bar, index }) => (
                <HoldBar
                    key={keyOf(bar)}
                    bar={bar}
                    mixed={
                        bar.kind === "held"
                            ? notDefinedOver(bar, holds.bars)
                            : NONE
                    }
                    label={labels[index]!}
                    borrowed={!basic && bar.borrowedFrom !== undefined}
                    pixelsPerBeat={pixelsPerBeat}
                />
            ))}
            {borrowed.map((bar) => (
                <BorrowedSource
                    key={`source:${keyOf(bar)}`}
                    bar={bar}
                    pages={pages}
                    pixelsPerBeat={pixelsPerBeat}
                    showLine={
                        bar.lit ||
                        hovered === bar ||
                        (selectedEnd !== null &&
                            bar.start < selectedEnd &&
                            selectedEnd <= bar.end)
                    }
                />
            ))}
            {holds.departures.map((departure, index) => (
                <div
                    key={departure.beat}
                    role="img"
                    aria-label={tickLabels[index]}
                    data-testid={`timeline-departure-${departure.beat}`}
                    // Under the diamonds (z-36) and the flag grips (z-35)
                    className="bg-text-subtitle pointer-events-none absolute z-[34] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                        left: beatToX(departure.beat, pixelsPerBeat),
                        top: TIMELINE_PAGE_ROW_BOTTOM,
                        width: TICK_WIDTH,
                        height: TICK_HEIGHT,
                    }}
                />
            ))}
        </>
    );
});

const NONE: readonly BeatRange[] = [];
const NO_BARS: readonly SelectionHoldBar[] = [];

/** Marks a borrowed hold's bar and chip, so the pointer over either finds it (`useHoveredBar`) */
const BORROWED_ATTRIBUTE = "data-timeline-borrowed";

/**
 * The borrowed bar under the pointer, if any. The bars take no pointer, so presses still reach the
 * page boxes under them: the pointer is followed on the window instead, and only while some
 * borrowed bar is drawn.
 */
function useHoveredBar(
    bars: readonly SelectionHoldBar[],
): SelectionHoldBar | null {
    const [hovered, setHovered] = useState<string | null>(null);
    useEffect(() => {
        if (bars.length === 0) {
            setHovered(null);
            return;
        }
        const onMove = (event: PointerEvent) => {
            const over = [
                ...document.querySelectorAll(`[${BORROWED_ATTRIBUTE}]`),
            ].find((el) => {
                const rect = el.getBoundingClientRect();
                return (
                    event.clientX >= rect.left &&
                    event.clientX <= rect.right &&
                    event.clientY >= rect.top &&
                    event.clientY <= rect.bottom
                );
            });
            setHovered(over?.getAttribute(BORROWED_ATTRIBUTE) ?? null);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
    }, [bars]);
    return bars.find((bar) => borrowedId(bar) === hovered) ?? null;
}

const borrowedId = (bar: SelectionHoldBar) =>
    `${bar.start}:${bar.end}:${bar.borrowedFrom}`;

/**
 * A borrowed hold's source (fork #474): a chip at the bar's start naming the spot it holds, and,
 * with `showLine`, a dotted line back to where that spot was reached, ending at the chip. Both sit
 * above the bars, clear of the Not defined bar under the line.
 */
function BorrowedSource({
    bar,
    pages,
    pixelsPerBeat,
    showLine,
}: {
    bar: SelectionHoldBar;
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
    showLine: boolean;
}) {
    const from = bar.borrowedFrom!;
    const left = beatToX(bar.start, pixelsPerBeat);
    const width = beatToX(bar.end, pixelsPerBeat) - left;
    const source = beatToX(from, pixelsPerBeat);
    const top = TIMELINE_PAGE_ROW_BOTTOM - SOURCE_LIFT;
    const color = bar.lit ? "text-accent" : "text-text-subtitle";
    return (
        <>
            {width >= CHIP_MIN_WIDTH && (
                <span
                    aria-hidden
                    {...{ [BORROWED_ATTRIBUTE]: borrowedId(bar) }}
                    data-testid={`timeline-borrowed-chip-${bar.start}-${bar.end}`}
                    className={clsx(
                        "text-micro pointer-events-none absolute z-[34] -translate-y-1/2 truncate leading-none whitespace-nowrap",
                        color,
                    )}
                    style={{
                        left: left + 4,
                        top,
                        maxWidth: width - 6,
                    }}
                >
                    {borrowedChip(from, pages)}
                </span>
            )}
            {showLine && source < left && (
                <div
                    aria-hidden
                    data-testid={`timeline-borrowed-line-${bar.start}-${bar.end}`}
                    className={clsx(
                        "pointer-events-none absolute z-[34]",
                        color,
                    )}
                    style={{
                        left: source,
                        width: left - source,
                        top,
                        height: 1,
                    }}
                >
                    <div className="absolute inset-x-0 top-0 border-t border-dotted border-current" />
                    <div className="absolute top-0 left-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                </div>
            )}
        </>
    );
}

/** "Held · Page 2's spot": the page the borrowed spot was reached on (`from`, a count in it) */
const borrowedChip = (
    from: number,
    pages: readonly TimelinePageMarker[],
): string =>
    tolgee.t("timeline.heldBar.borrowedChip", "{held} · Page {page}'s spot", {
        ...holdTerms(),
        page: getPageCountAt({ pages }, from).pageLabel,
    });

/**
 * The dashes, as a background or mask: one dash per tile, the tiles pinned to the timeline's
 * start (`position`), so overlapping bars of different marchers dash in step and never fill each
 * other's gaps.
 */
const dashes = (color: string, left: number) => ({
    image: `linear-gradient(to right, ${color} 0 ${DASH}px, transparent ${DASH}px)`,
    size: `${DASH + GAP}px 100%`,
    position: `${-left}px 0`,
});

/**
 * One bar: solid (Held, or a shape carried on) or dashed (Not defined), lit or not. A Held bar
 * draws dashed, in its own color, over `mixed` (`notDefinedOver`): where some of the selection is
 * Not defined over the same counts, the stretch mustn't read as solid.
 *
 * The bar's box is a strip taller than the line it draws, so a right-click finds it; the line is
 * centered in it, thin at rest and thicker while lit.
 */
function HoldBar({
    bar,
    mixed,
    label,
    borrowed,
    pixelsPerBeat,
}: {
    bar: SelectionHoldBar;
    mixed: readonly BeatRange[];
    label: string;
    /** Draw it as a borrowed hold: lighter and hatched (Expert only) */
    borrowed: boolean;
    pixelsPerBeat: number;
}) {
    const line = useRef<HTMLDivElement>(null);
    // A bar that mounts lit (lighting split it off a longer one) grows in, like one that lights in
    // place does through its transition
    useLayoutEffect(() => {
        if (
            !bar.lit ||
            !line.current?.animate ||
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        )
            return;
        line.current.animate(
            [
                { height: `${LINE_HEIGHT}px` },
                { height: `${LIT_LINE_HEIGHT}px` },
            ],
            { duration: GROW_MS, easing: "ease-out" },
        );
        // Only on mount: a change of lit state afterwards is the transition's
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const left = beatToX(bar.start, pixelsPerBeat);
    const width = beatToX(bar.end, pixelsPerBeat) - left;
    const solid = bar.kind === "held";
    const dash = dashes(solid ? "black" : "currentColor", left);
    // Over a mixed stretch, a Held bar keeps only its dashes: a mask, solid outside those stretches
    // (the first layer) and dashed inside them (the second)
    const mask =
        solid && mixed.length > 0
            ? {
                  maskImage: `${solidOutside(mixed, pixelsPerBeat, left)}, ${dash.image}`,
                  maskSize: `100% 100%, ${dash.size}`,
                  maskPosition: `0 0, ${dash.position}`,
                  maskRepeat: "no-repeat, repeat-x",
              }
            : {};
    return (
        <div
            role="img"
            aria-label={label}
            {...{ [HOLD_BAR_ATTRIBUTE]: "" }}
            data-testid={`timeline-${solid ? "held" : "not-defined"}-bar-${bar.start}-${bar.end}`}
            data-held={solid ? bar.marcherIds.length : undefined}
            data-borrowed={borrowed || undefined}
            {...(borrowed ? { [BORROWED_ATTRIBUTE]: borrowedId(bar) } : {})}
            data-shape={bar.shape || undefined}
            data-lit={bar.lit}
            data-mixed={mixed.length > 0 || undefined}
            // Under the diamonds (z-36) and the flag grips (z-35)
            className="pointer-events-none absolute z-[34] -translate-y-1/2"
            style={{
                left,
                width,
                top: TIMELINE_PAGE_ROW_BOTTOM,
                height: HIT_HEIGHT,
            }}
        >
            <div
                ref={line}
                data-hold-line=""
                className={clsx(
                    "absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full transition-[height,color] ease-out motion-reduce:transition-none",
                    bar.lit
                        ? "text-accent"
                        : solid
                          ? "text-text-subtitle"
                          : "text-text-subtitle opacity-75",
                )}
                style={{
                    height: bar.lit ? LIT_LINE_HEIGHT : LINE_HEIGHT,
                    transitionDuration: `${GROW_MS}ms`,
                    ...(solid
                        ? {
                              background: borrowed ? HATCH : "currentColor",
                              ...mask,
                          }
                        : {
                              backgroundImage: dash.image,
                              backgroundSize: dash.size,
                              backgroundPosition: dash.position,
                              backgroundRepeat: "repeat-x",
                          }),
                }}
            />
        </div>
    );
}

/**
 * A mask layer that's opaque across a bar starting at `left` px except over `mixed`, which it
 * leaves clear for the dashes
 */
function solidOutside(
    mixed: readonly BeatRange[],
    pixelsPerBeat: number,
    left: number,
): string {
    const x = (beat: number) => beatToX(beat, pixelsPerBeat) - left;
    const stops = mixed.flatMap((r) => [
        `black ${x(r.start)}px`,
        `transparent ${x(r.start)}px`,
        `transparent ${x(r.end)}px`,
        `black ${x(r.end)}px`,
    ]);
    return `linear-gradient(to right, black 0, ${stops.join(", ")}, black 100%)`;
}

/**
 * The page box under a right-click on a hold bar, if there is one: the bars take no pointer, and
 * the lower half of one sits over the measure row, so a right-click there finds the box above it,
 * whose menu has **Define as shown** for that page. Null away from every bar.
 *
 * @param root the element holding the ruler (the timeline)
 */
export function holdBarPageAt(
    root: Element,
    clientX: number,
    clientY: number,
): Element | null {
    const inside = (rect: DOMRect) =>
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top - 1 &&
        clientY <= rect.bottom + 1;
    const onBar = [...root.querySelectorAll(`[${HOLD_BAR_ATTRIBUTE}]`)].some(
        (bar) => inside(bar.getBoundingClientRect()),
    );
    if (!onBar) return null;
    return (
        [...root.querySelectorAll("[data-timeline-range-page]")].find((box) => {
            const rect = box.getBoundingClientRect();
            return clientX >= rect.left && clientX < rect.right;
        }) ?? null
    );
}

/** The bar's pages: "Page 3", or "Pages 2–3" over several (`{page}` / `{first}`, `{last}`) */
function barPages(
    bar: SelectionHoldBar,
    pages: readonly TimelinePageMarker[],
): { first: string; last: string } {
    // The first count inside the hold is the one after its start
    return {
        first: getPageCountAt({ pages }, bar.start + 1).pageLabel,
        last: getPageCountAt({ pages }, bar.end).pageLabel,
    };
}

/**
 * "Held · Page 3" or "Not defined · Pages 2–3", then why a shape's bar is solid, then, with more
 * than one marcher selected, "2 of 3 selected".
 */
function holdBarLabel(
    bar: SelectionHoldBar,
    pages: readonly TimelinePageMarker[],
): string {
    const { first, last } = barPages(bar, pages);
    const held = bar.kind === "held";
    const params = { ...holdTerms(), page: last, first, last };
    let title = held
        ? first === last
            ? tolgee.t("timeline.heldBar.title", "{held} · Page {page}", params)
            : tolgee.t(
                  "timeline.heldBar.titleRange",
                  "{held} · Pages {first}–{last}",
                  params,
              )
        : first === last
          ? tolgee.t(
                "timeline.notDefinedBar.title",
                "{notDefined} · Page {page}",
                params,
            )
          : tolgee.t(
                "timeline.notDefinedBar.titleRange",
                "{notDefined} · Pages {first}–{last}",
                params,
            );
    if (bar.borrowedFrom !== undefined)
        title = tolgee.t(
            "timeline.heldBar.titleWithDetail",
            "{title}. {detail}",
            {
                title,
                detail: tolgee.t(
                    "timeline.heldBar.borrowed",
                    "Standing at Page {page}'s spot",
                    {
                        page: getPageCountAt({ pages }, bar.borrowedFrom)
                            .pageLabel,
                    },
                ),
            },
        );
    if (bar.shape)
        title = tolgee.t(
            "timeline.heldBar.titleWithDetail",
            "{title}. {detail}",
            {
                title,
                detail: tolgee.t(
                    "timeline.heldBar.shape",
                    "Its shape carries on here",
                ),
            },
        );
    if (bar.total === 1) return title;
    return tolgee.t("timeline.heldBar.titleWithDetail", "{title}. {detail}", {
        title,
        detail: tolgee.t(
            "timeline.heldBar.detail",
            "{held} of {total} selected",
            { held: bar.marcherIds.length, total: bar.total },
        ),
    });
}

/**
 * "Moves again · Page 4, count 1" (the first count it moves on), then "2 of 3 selected" with more
 * than one selected
 */
function departureLabel(
    departure: SelectionDeparture,
    pages: readonly TimelinePageMarker[],
): string {
    const { pageLabel, count } = getPageCountAt({ pages }, departure.beat + 1);
    const title = tolgee.t(
        "timeline.departure.title",
        "Moves again · Page {page}, count {count}",
        { page: pageLabel, count },
    );
    if (departure.total === 1) return title;
    return tolgee.t("timeline.heldBar.titleWithDetail", "{title}. {detail}", {
        title,
        detail: tolgee.t(
            "timeline.heldBar.detail",
            "{held} of {total} selected",
            { held: departure.marcherIds.length, total: departure.total },
        ),
    });
}
