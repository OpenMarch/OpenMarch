import { getPageCountAt } from "@/components/timeline/TimelineGeometry";
import { moveLabels } from "./timelineViewModel";

/**
 * Where things are on the timeline, in pages and counts as the field line counts them (UI-12,
 * UI-13), and what a move is called (UI-14), for toasts and refusals. Never beats. Pure, with no
 * React, store or database imports, so the write path (db-functions) words its refusals the same
 * way the renderer words its toasts.
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

/** "A", "A and B", "A, B and C". */
export const joinList = (items: readonly string[]): string =>
    items.length <= 1
        ? (items[0] ?? "")
        : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

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

const countText = (c: CountAt) =>
    c.after
        ? `count ${c.count} after Page ${c.pageLabel}`
        : `Page ${c.pageLabel} count ${c.count}`;

/**
 * Where the moment at `beat` is (the end of the count that ends there): "Page 2 count 8", or
 * "count 3 after Page 4" past the last flag. `null` at home or where a count has no named page.
 */
export function beatWhere(
    beat: number,
    boxes: readonly NamedPageBox[],
): string | null {
    const at = getPageCountAt(countModel(boxes), beat);
    return named(at) ? countText(at) : null;
}

/**
 * Where `range` is, from the page boxes: "Page 2, counts 1–4" (or "count 3") inside one page,
 * "Page 2 count 5 to Page 3 count 4" across a flag, "after Page 4, counts 1–4" past the last flag.
 * `null` where a count has no named page. `span` says which of the three it is.
 */
export function rangeWhere(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): { readonly where: string; readonly span: "page" | "after" | "flag" } | null {
    const model = countModel(boxes);
    // A move's first count is the beat after its start
    const from = getPageCountAt(model, range.start + 1);
    const to = getPageCountAt(model, range.end);
    if (!named(from) || !named(to)) return null;
    const counts =
        from.count === to.count
            ? `count ${from.count}`
            : `counts ${from.count}–${to.count}`;
    if (from.pageLabel === to.pageLabel && !!from.after === !!to.after)
        return from.after
            ? {
                  where: `after Page ${from.pageLabel}, ${counts}`,
                  span: "after",
              }
            : { where: `Page ${from.pageLabel}, ${counts}`, span: "page" };
    return { where: `${countText(from)} to ${countText(to)}`, span: "flag" };
}

/**
 * `range` as the object of a sentence: "Page 2, counts 1–4", "the counts from Page 2 count 5 to
 * Page 3 count 4", or "these counts" where a count has no named page.
 */
export function countsText(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
): string {
    const at = rangeWhere(range, boxes);
    if (!at) return "these counts";
    return at.span === "flag" ? `the counts from ${at.where}` : at.where;
}

/**
 * `moveName` inside a sentence, where a page's box reads as "Page 2's move" ("T3 is in Page 2's
 * move", "comes from Page 2's move").
 */
export function moveInSentence(
    range: WordsRange,
    boxes: readonly NamedPageBox[],
    moves: readonly NamedMove[] = [],
): string {
    const name = moveName(range, boxes, moves);
    const isPage = boxes.some(
        (b) =>
            b.name !== undefined &&
            b.start === range.start &&
            b.end === range.end,
    );
    return isPage ? `${name}'s move` : name;
}

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
): string {
    const box = boxes.find(
        (b) => b.start === range.start && b.end === range.end,
    );
    if (box?.name !== undefined) return `Page ${box.name}`;
    const labels = moveLabels(moves, boxes);
    const names = [
        ...new Set(
            moves
                .filter((m) => m.start === range.start && m.end === range.end)
                .flatMap((m) => labels.get(m.id) ?? []),
        ),
    ];
    const at = rangeWhere(range, boxes);
    if (names.length > 0)
        return at ? `${joinList(names)} (${at.where})` : joinList(names);
    if (!at) return "another move";
    return at.span === "after"
        ? `the move ${at.where}`
        : at.span === "flag"
          ? `the move from ${at.where}`
          : `the move on ${at.where}`;
}
