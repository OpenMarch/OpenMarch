import tolgee from "@/global/singletons/Tolgee";
import type { SpanInfo } from "@openmarch/core";
import { pageBoxStateOf, type PageBoxRange } from "./timelinePageBoxState";
import { joinList } from "./translateTimelineText";

/**
 * Keep later pages in timeline mode (docs/timeline/ui.md UI-18; defined-coordinates 10, owner
 * decision 2026-10-09): which page boxes the selected marchers follow into (Not set), for the
 * chains on the page boxes, the inspector line and the page box menu's **Set as shown**. Pure:
 * works over each marcher's resolver spans; the command is `setAsShownOnPage`.
 *
 * A marcher **follows** on a box where it has no move of its own (`PageBoxState` "follows"): an
 * edit of the page it last moved on carries into the box. Before its first move it holds from the
 * start, and follows that too, so it can be set ahead of any move (wp19, after the final study).
 * Stored kept spots are gone (holds decision 1, #467): a page kept where it was is an ordinary
 * move of the marcher's own, so it is Set there.
 */

/** A page with its flag and box (`pageFlags`), and its name as the app shows it. */
export interface KeepPage {
    readonly id: number;
    readonly name: string;
    /** The page's flag; 0 for home */
    readonly flag: number;
    /** The page's box; `null` for home */
    readonly range: PageBoxRange | null;
}

/** The selection's keep state on one page box. */
export interface PageKeepState {
    readonly pageId: number;
    readonly pageName: string;
    readonly box: PageBoxRange;
    /** The selected marchers that follow into the box (no move of their own there), ascending */
    readonly follows: number[];
    /** Those of `follows` that haven't moved yet: they hold from the start, ascending */
    readonly fromStart: number[];
    /**
     * The pages those marchers follow into the box: where each last moved before it, in page
     * order. Empty when they hold from the start.
     */
    readonly from: string[];
    /**
     * The selected marchers partway through a move at the box (a move of theirs runs across one of
     * its flags), ascending. The others not in `follows` have a move of their own ending there
     */
    readonly midMove: number[];
    /** How many marchers are selected */
    readonly selected: number;
}

type Row = { id: number; marcher: number; start: number; end: number };

/** A marcher's moves (its spans that aren't holds), as the rows `pageBoxStateOf` reads. */
export function movesFromSpans(spans: readonly SpanInfo[]): Row[] {
    return spans.flatMap((s) =>
        s.kind === "hold" || s.assignmentId === null
            ? []
            : [
                  {
                      id: s.assignmentId,
                      marcher: s.marcherId,
                      start: s.start,
                      end: s.end,
                  },
              ],
    );
}

/** The first index in ascending `values` above `target` (or at least it, `orEqual`). */
const firstAbove = (
    values: readonly number[],
    target: number,
    orEqual = false,
): number => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        const value = values[mid]!;
        if (value < target || (!orEqual && value === target)) low = mid + 1;
        else high = mid;
    }
    return low;
};

/**
 * The page whose box holds `beat` (start, flag], by index into `pages` (-1 for none), by binary
 * search over the page boxes (which don't overlap): O(log pages) per lookup, for `pageKeepStates`
 * over every box.
 */
const pageLookup = (pages: readonly KeepPage[]) => {
    const boxed = pages.flatMap((p, index) =>
        p.range ? [{ start: p.range.start, flag: p.flag, index }] : [],
    );
    boxed.sort((a, b) => a.start - b.start);
    const starts = boxed.map((b) => b.start);
    return (beat: number): number => {
        // The last box starting before `beat`
        const box = boxed[firstAbove(starts, beat, true) - 1];
        return box && beat <= box.flag ? box.index : -1;
    };
};

/**
 * One marcher's moves indexed by end, so each box finds the moves over it and the last move
 * before it by binary search (`pageKeepStates` over every box, pre-merge review): the same rows,
 * in the same order, as filtering every move per box.
 */
const indexMoves = (rows: readonly Row[]) => {
    // Stable: equal ends keep their order, so the first of them is the one `lastMoveBefore` keeps
    const byEnd = rows
        .map((row, order) => ({ row, order }))
        .sort((a, b) => a.row.end - b.row.end);
    const ends = byEnd.map((m) => m.row.end);
    // The smallest start from each index on, so the scan over a box can stop early
    const minStartFrom = new Array<number>(byEnd.length + 1).fill(Infinity);
    for (let i = byEnd.length - 1; i >= 0; i--)
        minStartFrom[i] = Math.min(byEnd[i]!.row.start, minStartFrom[i + 1]!);
    return {
        /** Its rows that cover any beat of `box`, in their original order */
        over: (box: PageBoxRange): Row[] => {
            const found: { row: Row; order: number }[] = [];
            for (
                let i = firstAbove(ends, box.start);
                i < byEnd.length && minStartFrom[i]! < box.end;
                i++
            )
                if (byEnd[i]!.row.start < box.end) found.push(byEnd[i]!);
            return found.sort((a, b) => a.order - b.order).map((m) => m.row);
        },
        /** `lastMoveBefore(rows, box)` */
        before: (box: PageBoxRange): Row | null => {
            let i = firstAbove(ends, box.start) - 1;
            if (i < 0) return null;
            while (i > 0 && ends[i - 1] === ends[i]) i--;
            return byEnd[i]!.row;
        },
    };
};

/**
 * The selection's keep state on every page box, in page order (home has none). Each marcher's
 * moves are indexed once, so it costs about O(boxes × marchers × log moves).
 *
 * @param spansOf a marcher's resolver spans (`resolverSpans`)
 */
export function pageKeepStates({
    pages,
    marcherIds,
    spansOf,
}: {
    pages: readonly KeepPage[];
    marcherIds: readonly number[];
    spansOf: (marcherId: number) => readonly SpanInfo[];
}): PageKeepState[] {
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    const moves = new Map(
        ids.map((id) => [id, indexMoves(movesFromSpans(spansOf(id)))]),
    );
    const sourceOf = pageLookup(pages);
    const out: PageKeepState[] = [];
    for (const page of pages) {
        const box = page.range;
        if (!box) continue;
        const follows: number[] = [];
        const fromStart: number[] = [];
        const fromPages = new Set<number>();
        const midMove: number[] = [];
        for (const id of ids) {
            const indexed = moves.get(id)!;
            const state = pageBoxStateOf(indexed.over(box), box);
            if (state === "midMove") midMove.push(id);
            if (state !== "follows") continue;
            const before = indexed.before(box);
            follows.push(id);
            if (!before) fromStart.push(id);
            const source = before ? sourceOf(before.end) : -1;
            if (source >= 0) fromPages.add(source);
        }
        out.push({
            pageId: page.id,
            pageName: page.name,
            box: { start: box.start, end: box.end },
            follows,
            fromStart,
            from: [...fromPages]
                .sort((a, b) => a - b)
                .map((i) => pages[i]!.name),
            midMove,
            selected: ids.length,
        });
    }
    return out;
}

/** The index into `states` of the box after the page `pageId` (home's is the first box). */
const nextBoxIndex = (
    states: readonly PageKeepState[],
    pageId: number,
    homePageId: number | null,
): number => {
    const current = states.findIndex((s) => s.pageId === pageId);
    if (current >= 0) return current + 1;
    return pageId === homePageId ? 0 : -1;
};

/**
 * The later pages that follow the selection from the page `currentPageId` (an edit there carries
 * into them): for each marcher, the boxes right after it, in a row, that it follows into, in page
 * order. `all` says whether every selected marcher follows into every one of them. Null for none.
 * Marchers that haven't moved yet don't count (lead default, wp19): every later page follows
 * them, which says nothing on a fresh show.
 */
export function followingPages(
    states: readonly PageKeepState[],
    currentPageId: number,
    homePageId: number | null = null,
): { names: string[]; all: boolean } | null {
    const first = nextBoxIndex(states, currentPageId, homePageId);
    if (first < 0 || first >= states.length) return null;
    const selected = states[first]!.selected;
    const names: string[] = [];
    let all = true;
    const moved = (s: PageKeepState) => {
        const start = new Set(s.fromStart);
        return s.follows.filter((id) => !start.has(id));
    };
    let still = new Set(moved(states[first]!));
    for (let i = first; i < states.length && still.size > 0; i++) {
        const here = new Set(moved(states[i]!));
        still = new Set([...still].filter((id) => here.has(id)));
        if (still.size === 0) break;
        names.push(states[i]!.pageName);
        if (still.size !== selected) all = false;
    }
    return names.length === 0 ? null : { names, all };
}

/**
 * Each marcher's own run of `followingPages`: the page boxes after `currentPageId`, in a row,
 * that it follows into from a page (not its starting spot), up to the first it doesn't. Only the
 * marchers that follow the first of them are in it. `followingPages` names the union of these.
 */
export function followingRuns(
    states: readonly PageKeepState[],
    currentPageId: number,
    homePageId: number | null = null,
): Map<number, PageKeepState[]> {
    const runs = new Map<number, PageKeepState[]>();
    const first = nextBoxIndex(states, currentPageId, homePageId);
    if (first < 0 || first >= states.length) return runs;
    const moved = (s: PageKeepState) => {
        const start = new Set(s.fromStart);
        return new Set(s.follows.filter((id) => !start.has(id)));
    };
    for (const id of moved(states[first]!)) {
        const run: PageKeepState[] = [];
        for (let i = first; i < states.length; i++) {
            if (!moved(states[i]!).has(id)) break;
            run.push(states[i]!);
        }
        runs.set(id, run);
    }
    return runs;
}

/** "Page 3" or "Pages 3–4" (first to last of `names`, in page order). */
export function pagesText(names: readonly string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1)
        return tolgee.t("timeline.pagesText.one", { page: names[0]! });
    return tolgee.t("timeline.pagesText.range", {
        first: names[0]!,
        last: names[names.length - 1]!,
    });
}

/** A translate function, as Tolgee's `t` with a default value and ICU arguments. */
export type KeepTranslate = (
    key: string,
    defaultValue: string,
    params?: Record<string, string | number>,
) => string;

/** The Tolgee singleton, in the app's language now. */
const appTranslate: KeepTranslate = (key, defaultValue, params) =>
    tolgee.t(key, defaultValue, params);

/** A marcher's name as the app shows it (its drill number), or undefined when unknown. */
export type MarcherNameOf = (marcherId: number) => string | undefined;

/** How many names the words list before they count the rest ("OT1, OT2 and 4 others"). */
export const NAMES_SHOWN = 3;

/** The marchers' names in drill order, or null when some aren't known. */
const namesOf = (
    ids: readonly number[],
    nameOf: MarcherNameOf | undefined,
): string[] | null => {
    if (!nameOf || ids.length === 0) return null;
    const names = ids.map(nameOf);
    if (names.some((n) => !n)) return null;
    return (names as string[]).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
    );
};

/**
 * The marchers by name for the keep words (wp19, after the final study): "OT1", "OT1 and OT8",
 * "OT1, OT2 and OT3", then "OT1, OT2 and 4 others", joined as the app's language joins a list.
 * Null when a name isn't known, so the words fall back to a count.
 */
export function marcherNamesText(
    ids: readonly number[],
    nameOf: MarcherNameOf | undefined,
    t: KeepTranslate = appTranslate,
): string | null {
    const names = namesOf(ids, nameOf);
    if (!names) return null;
    if (names.length <= NAMES_SHOWN) return joinList(names);
    return joinList([
        names[0]!,
        names[1]!,
        t(
            "timeline.keep.names.others",
            "{count, plural, one {# other} other {# others}}",
            { count: names.length - 2 },
        ),
    ]);
}
