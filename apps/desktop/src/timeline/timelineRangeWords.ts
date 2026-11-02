import { getPageCountAt } from "@/components/timeline/TimelineGeometry";
import { moveLabels } from "./timelineViewModel";
import {
    text,
    textList,
    type TimelineText,
    type TimelineTextArg,
} from "./timelineText";

/**
 * Where things are on the timeline, in pages and counts as the field line counts them (UI-12,
 * UI-13), and what a move is called (UI-14), for toasts and refusals. Never beats. Pure, with no
 * React, store, database or Tolgee imports, so the write path (db-functions) words its refusals
 * the same way the renderer words its toasts. Each phrase is a `TimelineText`, translated where it
 * is shown (`translateTimelineText`).
 */

/** A page box, previous flag to flag (UI-9), as `[start, end)` spec beats, with its page's name. */
export interface NamedPageBox {
    readonly start: number;
    readonly end: number;
    /** The page's name ("2", "2A"); absent where only the range matters */
    readonly name?: string;
}

/** A stored move, for its name (UI-14): its id, range and stored name. */
export interface NamedMove {
    readonly id: number;
    readonly start: number;
    readonly end: number;
    readonly name?: string | null;
}

/** A `[start, end)` range of spec beats. */
export interface WordsRange {
    readonly start: number;
    readonly end: number;
}

const countModel = (boxes: readonly NamedPageBox[]) => ({
    pages: boxes.map((b) => ({
        id: b.start,
        label: b.name ?? "",
        atBeat: b.start,
        endBeat: b.end,
        isInitial: false,
    })),
});

type CountAt = ReturnType<typeof getPageCountAt>;

const named = (c: CountAt) => !c.home && !!c.pageLabel;

const countText = (c: CountAt): TimelineText =>
    c.after
        ? text.t("timeline.where.countAfterPage", {
              count: c.count,
              page: c.pageLabel,
          })
        : text.t("timeline.where.pageCount", {
              page: c.pageLabel,
              count: c.count,
          });

/**
 * Where the moment at `beat` is (the end of the count that ends there): "Page 2 count 8", or
 * "count 3 after Page 4" past the last flag. `null` at home or where a count has no named page.
 */
export function beatWhere(
    beat: number,
    boxes: readonly NamedPageBox[],
): TimelineText | null {
    const at = getPageCountAt(countModel(boxes), beat);
    return named(at) ? countText(at) : null;
}

/** Where a range is (`rangeWhere`): the phrase, and the counts at its two ends. */
interface RangeAt {
    readonly where: TimelineText;
    readonly span: "page" | "after" | "flag";
    readonly from: TimelineText;
    readonly to: TimelineText;
}

const rangeAt = (
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): RangeAt | null => {
    const model = countModel(boxes);
    // A move's first count is the beat after its start
    const from = getPageCountAt(model, range.start + 1);
    const to = getPageCountAt(model, range.end);
    if (!named(from) || !named(to)) return null;
    const ends = { from: countText(from), to: countText(to) };
    if (from.pageLabel === to.pageLabel && !!from.after === !!to.after) {
        const page = from.pageLabel;
        const one = from.count === to.count;
        if (from.after)
            return {
                ...ends,
                span: "after",
                where: one
                    ? text.t("timeline.where.afterPageCount", {
                          page,
                          count: from.count,
                      })
                    : text.t("timeline.where.afterPageCounts", {
                          page,
                          from: from.count,
                          to: to.count,
                      }),
            };
        return {
            ...ends,
            span: "page",
            where: one
                ? text.t("timeline.where.inPageCount", {
                      page,
                      count: from.count,
                  })
                : text.t("timeline.where.inPageCounts", {
                      page,
                      from: from.count,
                      to: to.count,
                  }),
        };
    }
    return {
        ...ends,
        span: "flag",
        where: text.t("timeline.where.countToCount", ends),
    };
};

/**
 * Where `range` is, from the page boxes: "Page 2, counts 1–4" (or "count 3") inside one page,
 * "Page 2 count 5 to Page 3 count 4" across a flag, "after Page 4, counts 1–4" past the last flag.
 * `null` where a count has no named page. `span` says which of the three it is.
 */
export function rangeWhere(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): {
    readonly where: TimelineText;
    readonly span: "page" | "after" | "flag";
} | null {
    const at = rangeAt(range, boxes);
    return at && { where: at.where, span: at.span };
}

/**
 * `range` as the object of a sentence: "Page 2, counts 1–4", "the counts from Page 2 count 5 to
 * Page 3 count 4", or "these counts" where a count has no named page.
 */
export function countsText(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): TimelineText {
    const at = rangeAt(range, boxes);
    if (!at) return text.t("timeline.where.theseCounts");
    return at.span === "flag"
        ? text.t("timeline.where.countsFromTo", { from: at.from, to: at.to })
        : at.where;
}

/**
 * `moveName` inside a sentence, where a page's box reads as "Page 2's move" ("T3 is in Page 2's
 * move", "comes from Page 2's move").
 */
export function moveInSentence(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
    moves: readonly NamedMove[] = [],
): TimelineTextArg {
    const box = pageBoxOf(range, boxes);
    return box
        ? text.t("timeline.where.pageMove", { page: box.name })
        : moveName(range, boxes, moves);
}

/** The named page box that is exactly `range`. */
const pageBoxOf = (
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): (NamedPageBox & { readonly name: string }) | undefined =>
    boxes.find(
        (b): b is NamedPageBox & { readonly name: string } =>
            b.name !== undefined &&
            b.start === range.start &&
            b.end === range.end,
    );

/**
 * How a message names the move over `range`: "Page 2" for a page's box; else the move's label
 * (`moveLabels`: its name, "Move 2") with where it is, "Move 2 (Page 2, counts 1–4)", or "the
 * move on Page 2, counts 1–4" when no stored move has the range ("another move" when the range
 * has no named page either).
 */
export function moveName(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
    moves: readonly NamedMove[] = [],
): TimelineTextArg {
    const box = pageBoxOf(range, boxes);
    if (box) return text.t("timeline.where.page", { page: box.name });
    const labels = moveLabels(moves, boxes);
    const names = [
        ...new Set(
            moves
                .filter((m) => m.start === range.start && m.end === range.end)
                .flatMap((m) => labels.get(m.id) ?? []),
        ),
    ];
    const at = rangeAt(range, boxes);
    if (names.length > 0)
        return at
            ? text.t("timeline.where.movesAt", {
                  names: textList(names),
                  where: at.where,
              })
            : textList(names);
    if (!at) return text.t("timeline.where.anotherMove");
    return at.span === "after"
        ? text.t("timeline.where.moveAfter", { where: at.where })
        : at.span === "flag"
          ? text.t("timeline.where.moveFromTo", { from: at.from, to: at.to })
          : text.t("timeline.where.moveOn", { where: at.where });
}
