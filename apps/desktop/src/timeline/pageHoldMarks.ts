import { sameCoordinate } from "@/db-functions/marcherPage";
import type { CarrySpan } from "./timelineCarryForward";

/**
 * Where the selected marchers hold, page by page (docs/timeline/ui.md UI-18, defined-coordinates
 * 08: a standing view on the page boxes instead of a carry-forward toast). For each page after the
 * first, the selection either moves there (every selected marcher has its own move on the page),
 * holds there (every one holds from an earlier page), or is mixed. Marchers partway through a move
 * at the page's flag count as neither. The same marks are drawn in timeline and page mode; only
 * how a marcher's state is read differs.
 */

/** One marcher's state on one page. */
export type MarcherPageState =
    /** The marcher's own move ends on this page */
    | { readonly kind: "moves" }
    /**
     * The marcher holds here, where it has been since the page at index `since`; `kept` when its
     * only move here is a stored kept spot (keep later pages): it stays, so the mark reads as a hold
     */
    | { readonly kind: "holds"; readonly since: number; readonly kept?: true }
    /** Neither: the first page, partway through a move, or unknown */
    | null;

/** What a page box shows for the selection. */
export type PageHoldMark =
    | { readonly kind: "moves" }
    /**
     * Every selected marcher with a state holds. `from` is the page they hold from, or null when
     * they hold from different pages; `fromStart` when that page is the first (they have held
     * since their starting set); `kept` when every one is kept here (pre-merge review, lead
     * default: a kept page is a hold, not a move)
     */
    | {
          readonly kind: "holds";
          readonly from: string | null;
          readonly fromStart?: true;
          readonly kept?: true;
      }
    /** Some move here and some hold; `from` and `fromStart` as for "holds", over the ones that hold */
    | {
          readonly kind: "mixed";
          readonly from: string | null;
          readonly fromStart?: true;
      };

const MOVES: MarcherPageState = { kind: "moves" };
const NO_KEPT: ReadonlySet<number> = new Set();

/** The first index in ascending `values` whose value is above `target` (or at least, `orEqual`). */
function firstAbove(
    values: readonly number[],
    target: number,
    orEqual = false,
): number {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        const value = values[mid]!;
        if (value < target || (!orEqual && value === target)) low = mid + 1;
        else high = mid;
    }
    return low;
}

/**
 * One marcher's state on every page, in timeline mode, from its resolver spans alone. Matches
 * `marcherHoldState` page by page (it moves on a page where a move of its own ends in the page's
 * box, up to its flag; it holds where the span reaching the flag is a hold; a move passing the
 * flag is neither), in one pass rather than one per page. A page whose move is a kept spot (the
 * one move ending in the box, over the whole box, its assignment in `kept`) holds, kept.
 *
 * @param spans the marcher's spans, sorted by start (`resolverSpans`)
 * @param flags every page flag, ascending, the first page's (beat 0) first
 * @param kept the kept assignments' ids (`useKeptAssignmentsStore`)
 */
export function timelineMarcherPageStates(
    spans: readonly (CarrySpan & { readonly assignmentId?: number | null })[],
    flags: readonly number[],
    kept: ReadonlySet<number> = NO_KEPT,
): MarcherPageState[] {
    const moves = spans
        .filter((s) => s.kind !== "hold")
        .sort((a, b) => a.end - b.end);
    const moveEnds = moves.map((s) => s.end);
    const states: MarcherPageState[] = flags.map(() => null);
    let spanIndex = 0;
    for (let i = 1; i < flags.length; i++) {
        const previous = flags[i - 1]!;
        const current = flags[i]!;
        // A move of its own ends in its box, (previous, current]
        const first = firstAbove(moveEnds, previous);
        if ((moveEnds[first] ?? Infinity) <= current) {
            const move = moves[first]!;
            const only = (moveEnds[first + 1] ?? Infinity) > current;
            states[i] =
                only &&
                move.start === previous &&
                move.end === current &&
                move.assignmentId != null &&
                kept.has(move.assignmentId)
                    ? { kind: "holds", since: i, kept: true }
                    : MOVES;
            continue;
        }
        // The span that brought it to the flag (a move starting there hasn't moved it yet)
        while (spanIndex < spans.length && spans[spanIndex]!.end < current)
            spanIndex++;
        const at = spans[spanIndex];
        if (!at || at.start >= current || at.kind !== "hold") continue;
        // Held since the first flag at or after the hold's start (home's for none before it)
        const since = firstAbove(flags, at.start, true);
        if (since < flags.length) states[i] = { kind: "holds", since };
    }
    return states;
}

/**
 * One marcher's state on every page, in page mode, from its position on each page: it holds on a
 * page whose position equals the previous page's (within `COORDINATE_TOLERANCE`), since the page
 * it last moved on, and moves on any other. A page without a row is unknown, and breaks the run.
 *
 * @param positions the marcher's position on each page, in page order
 */
export function pageModeMarcherPageStates(
    positions: readonly (
        | { readonly x: number; readonly y: number }
        | undefined
    )[],
): MarcherPageState[] {
    const states: MarcherPageState[] = positions.map(() => null);
    let since = 0;
    for (let i = 1; i < positions.length; i++) {
        const previous = positions[i - 1];
        const current = positions[i];
        if (!previous || !current) {
            since = i;
            continue;
        }
        if (
            sameCoordinate(previous.x, current.x) &&
            sameCoordinate(previous.y, current.y)
        )
            states[i] = { kind: "holds", since };
        else {
            states[i] = MOVES;
            since = i;
        }
    }
    return states;
}

/**
 * What one page shows for the selection, from each selected marcher's state on it. `null` (no
 * mark) when no selected marcher has a state there: the first page, or all partway through a move.
 *
 * @param pageNames every page's name, by index, for the page they hold from
 */
export function classifyPage(
    states: readonly MarcherPageState[],
    pageNames: readonly string[],
): PageHoldMark | null {
    let moves = 0;
    let holds = 0;
    let keptHolds = 0;
    let since: number | null | undefined;
    for (const state of states) {
        if (!state) continue;
        if (state.kind === "moves") {
            moves++;
            continue;
        }
        holds++;
        // A kept marcher stays here: it holds from no earlier page the others could name
        if (state.kept) {
            keptHolds++;
            since = null;
        } else if (since === undefined) since = state.since;
        else if (since !== state.since) since = null;
    }
    if (moves === 0 && holds === 0) return null;
    if (holds === 0) return { kind: "moves" };
    if (moves === 0 && keptHolds === holds)
        return { kind: "holds", from: null, kept: true };
    const from = since == null ? null : (pageNames[since] ?? null);
    const kind = moves === 0 ? "holds" : "mixed";
    return since === 0 ? { kind, from, fromStart: true } : { kind, from };
}

/**
 * Every page's mark for the selection, by page index (`null` for no mark).
 *
 * @param byMarcher each selected marcher's states, by page index
 */
export function pageHoldMarks(
    byMarcher: readonly (readonly MarcherPageState[])[],
    pageNames: readonly string[],
): (PageHoldMark | null)[] {
    if (byMarcher.length === 0) return pageNames.map(() => null);
    return pageNames.map((_, page) =>
        classifyPage(
            byMarcher.map((states) => states[page] ?? null),
            pageNames,
        ),
    );
}

/** A translate function, as Tolgee's `t` with a default value. */
export type HoldMarkTranslate = (
    key: string,
    defaultValue: string,
    params?: Record<string, string>,
) => string;

const english: HoldMarkTranslate = (_key, defaultValue, params) =>
    defaultValue.replace(
        /\{(\w+)\}/g,
        (_, name: string) => params?.[name] ?? "",
    );

/** The page box's tooltip and accessible description for a mark. */
export function pageHoldMarkLabel(
    mark: PageHoldMark,
    t: HoldMarkTranslate = english,
): string {
    switch (mark.kind) {
        case "moves":
            return t(
                "timeline.holdMarks.moves",
                "Selected marchers move on this page",
            );
        case "holds":
            if (mark.kept)
                return t(
                    "timeline.holdMarks.kept",
                    "Selected marchers are kept here",
                );
            if (mark.fromStart)
                return t(
                    "timeline.holdMarks.holdsFromStart",
                    "Selected marchers hold from the start",
                );
            return mark.from === null
                ? t(
                      "timeline.holdMarks.holdsHere",
                      "Selected marchers hold on this page",
                  )
                : t(
                      "timeline.holdMarks.holds",
                      "Selected marchers hold from Page {page}",
                      { page: mark.from },
                  );
        case "mixed":
            if (mark.fromStart)
                return t(
                    "timeline.holdMarks.mixedFromStart",
                    "Some selected marchers hold from the start",
                );
            return mark.from === null
                ? t(
                      "timeline.holdMarks.mixedHere",
                      "Some selected marchers hold on this page",
                  )
                : t(
                      "timeline.holdMarks.mixed",
                      "Some selected marchers hold from Page {page}",
                      { page: mark.from },
                  );
    }
}

/** The tooltip's second line for a mark: what the mark means on the field. */
export function pageHoldMarkHint(
    mark: PageHoldMark,
    t: HoldMarkTranslate = english,
): string {
    switch (mark.kind) {
        case "moves":
            return t(
                "timeline.holdMarks.movesHint",
                "They have their own move here",
            );
        case "holds":
            if (mark.kept)
                return t(
                    "timeline.holdMarks.keptHint",
                    "They stay here when earlier pages change",
                );
            if (mark.fromStart)
                return t(
                    "timeline.holdMarks.holdsFromStartHint",
                    "They stand where they started",
                );
            return mark.from === null
                ? t(
                      "timeline.holdMarks.holdsHereHint",
                      "They stand where their last move left them",
                  )
                : t(
                      "timeline.holdMarks.holdsHint",
                      "They stand where Page {page} left them",
                      { page: mark.from },
                  );
        case "mixed":
            return t(
                "timeline.holdMarks.mixedHint",
                "Some have their own move here",
            );
    }
}
