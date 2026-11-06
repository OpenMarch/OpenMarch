import type { SpanInfo } from "@openmarch/core";
import { heldSince, type NamedFlag } from "./timelineHoldState";
import { heldOneAt, windowWinsOverHold } from "./heldRules";

/**
 * **What a drag will do, before you let go** (holds 04-anchors "Display", review R1; fork #476):
 * for a selection with some marchers Held at the count a drag edits, how many are Held, and what a
 * drag there would do to each, so the inspector can say it ("1 of 2 selected Held · Drag: moves
 * Page 2's position · adds a move on Page 4"). No toast: a mixed drag edits each marcher by its
 * own kind (R1).
 *
 * It follows the write's routing (`splitHeldEditsInTransaction`): a marcher Held at the count edits
 * the move its hold grows out of, so the drag moves that page's position (or the starting position),
 * unless an Expert window starts inside its hold, which wins (R2, `windowWinsOverHold`): it adds a
 * move and ends the hold at the start flag ("adds a move on Page 4 · ends the hold"). Every other
 * marcher changes its own move ending at the count, or gets a new one there. It reads the resolver's
 * spans and the stored marks, not the database, so it can't see the few marchers the write would
 * still skip (a hold growing out of a shape's move); the write names those.
 */

/** A stored Held mark, as much of it as this reads */
interface Mark {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
}

/** A spec beat inside a mark (`isInsideHeldMark`): `start < beat <= end`. */
const inside = (mark: Mark, beat: number) =>
    mark.start < beat && beat <= mark.end;

/** Where a drag lands (`planCanvasEdit`'s target): an Expert window, or Basic's count. */
export type DragTarget =
    | { readonly kind: "range"; readonly start: number; readonly end: number }
    | { readonly kind: "point"; readonly beat: number };

/** One thing a drag would do. */
export type DragOutcome =
    /** Moves the position the hold grows out of: a page's, or the starting position (`page` null) */
    | { readonly kind: "movesHold"; readonly page: string | null }
    /** Changes the marcher's own position on the page holding the count */
    | { readonly kind: "movesOwn"; readonly page: string }
    /** Adds a move ending at the count, on the page holding it */
    | { readonly kind: "addsMove"; readonly page: string }
    /**
     * Adds a move ending at the count, on the page holding it, and ends a Held marcher's hold at
     * the start flag: an Expert window starting inside the hold wins (R2). It says what `addsMove`
     * on the same page says too, so that one isn't listed beside it
     */
    | { readonly kind: "endsHold"; readonly page: string };

export interface DragPreview {
    /** The selected marchers Held at the count */
    readonly held: number;
    /** The selected marchers */
    readonly total: number;
    /** What a drag would do, each different outcome once, the holds' first */
    readonly outcomes: readonly DragOutcome[];
}

/**
 * The preview for a drag at `target` of `marcherIds`, or null when none of them is Held at the
 * count (a drag there means what it always has) or the count has no page.
 *
 * @param spansOf each marcher's resolver spans (`resolverSpans`)
 * @param flags every page flag, ascending, the first page's (beat 0) first
 */
export function holdDragPreview({
    target,
    marcherIds,
    marks,
    spansOf,
    flags,
}: {
    target: DragTarget;
    marcherIds: readonly number[];
    marks: readonly Mark[];
    spansOf: (marcherId: number) => readonly SpanInfo[];
    flags: readonly NamedFlag[];
}): DragPreview | null {
    const beat = target.kind === "range" ? target.end : target.beat;
    const page = heldSince(beat, flags)?.page.name;
    if (page === undefined || marcherIds.length === 0) return null;
    const markAt = new Map<number, Mark>();
    for (const mark of marks)
        if (inside(mark, beat) && marcherIds.includes(mark.marcherId))
            markAt.set(mark.marcherId, mark);
    if (markAt.size === 0) return null;

    const outcomes = new Map<string, DragOutcome>();
    const add = (outcome: DragOutcome) =>
        outcomes.set(`${outcome.kind}:${outcome.page}`, outcome);
    const rest: DragOutcome[] = [];
    const endsHold = new Set<string>();
    for (const marcherId of marcherIds) {
        const moves = spansOf(marcherId).filter((s) => s.kind !== "hold");
        const mark = markAt.get(marcherId);
        const windowWins =
            target.kind === "range" &&
            mark !== undefined &&
            windowWinsOverHold(target.start, mark);
        if (mark && !windowWins) {
            if (moves.some((s) => s.end === mark.start)) {
                const since = heldSince(mark.start, flags);
                add({
                    kind: "movesHold",
                    page: since && !since.fromStart ? since.page.name : null,
                });
                continue;
            }
            if (!moves.some((s) => s.start < mark.start)) {
                add({ kind: "movesHold", page: null });
                continue;
            }
        }
        if (mark && windowWins) {
            endsHold.add(page);
            continue;
        }
        rest.push(
            moves.some((s) => s.end === beat && s.assignmentEnd === beat)
                ? { kind: "movesOwn", page }
                : { kind: "addsMove", page },
        );
    }
    for (const endsOn of endsHold) add({ kind: "endsHold", page: endsOn });
    for (const outcome of rest)
        if (!(outcome.kind === "addsMove" && endsHold.has(outcome.page)))
            add(outcome);
    return {
        held: markAt.size,
        total: marcherIds.length,
        outcomes: [...outcomes.values()],
    };
}

/**
 * How many of `marcherIds` **Make all selected Held** at `beat` would hold (`makeSelectedHeld`):
 * with one of them Held there, the others that stand still there without a hold (not partway
 * through a move, and no move of their own ending there) and whose last arrival isn't earlier than
 * the Held one's start (`heldOneAt`; a borrowed start waits for #474). 0 when none is Held at
 * `beat`. Like the preview, it can't see the few the write would still skip; the write names those.
 */
export function makeHeldCount({
    beat,
    marcherIds,
    marks,
    spansOf,
}: {
    beat: number;
    marcherIds: readonly number[];
    marks: readonly Mark[];
    spansOf: (marcherId: number) => readonly SpanInfo[];
}): number {
    const selected = marks.filter((m) => marcherIds.includes(m.marcherId));
    const like = heldOneAt(selected, beat);
    if (!like) return 0;
    const held = new Set(
        selected.filter((m) => inside(m, beat)).map((m) => m.marcherId),
    );
    return marcherIds.filter((id) => {
        if (held.has(id)) return false;
        const moves = spansOf(id).filter((s) => s.kind !== "hold");
        const ends = moves.map((s) => s.assignmentEnd ?? s.end);
        if (moves.some((s, i) => s.start < beat && beat <= ends[i]!))
            return false;
        const before = ends.filter((end) => end < beat);
        return before.length === 0 || Math.max(...before) >= like.start;
    }).length;
}
