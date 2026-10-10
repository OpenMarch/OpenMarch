import type { Resolver, SpanInfo } from "@openmarch/core";
import type {
    TimelineEditTarget,
    TimelineMoveResult,
} from "@/db-functions/timelineMoves";
import type { PageBox } from "@/stores/TimelineSelectionStore";
import { resolverSpans } from "./timelineStore";

/**
 * What an edit also changed after its window (docs/timeline/ui.md UI-18, defined-coordinates 07c
 * §6–7): a marcher holds where it last was until its own next move, so an edit carries forward
 * over every later page flag the marcher holds through, and stops at the page where that next
 * move ends. Read from the resolver after the edit, per moved marcher, from its spans alone: no
 * positions, and nothing else in the show is compared. No toast says this any more
 * (defined-coordinates 08).
 */

/** The parts of a resolver span this reads. */
export type CarrySpan = Pick<SpanInfo, "start" | "end" | "kind">;

/** One marcher's carry-forward after an edit ending at a beat. */
export interface MarcherCarry {
    /** The page flags after the edit whose position the edit changed, ascending */
    flags: number[];
    /**
     * The first page flag the edit no longer reaches (at or after the end of the marcher's next
     * own move), or null when the marcher holds to the end of the show
     */
    stop: number | null;
}

/**
 * Which later page flags an edit ending at `editEnd` changed for one marcher: every flag after
 * `editEnd` before the end of its next own move (any span that isn't a hold). The next move's
 * start is moved too, so a flag partway through that move changes as well; the flag at or after
 * its end doesn't.
 *
 * @param flags every page flag, ascending
 */
export function marcherCarry(
    spans: readonly CarrySpan[],
    editEnd: number,
    flags: readonly number[],
): MarcherCarry {
    const nextMoveEnd = Math.min(
        ...spans
            .filter((s) => s.kind !== "hold" && s.end > editEnd)
            .map((s) => s.end),
    );
    return {
        flags: flags.filter((f) => f > editEnd && f < nextMoveEnd),
        stop: Number.isFinite(nextMoveEnd)
            ? (flags.find((f) => f >= nextMoveEnd) ?? null)
            : null,
    };
}

/** The pages an edit carried into, across marchers. */
export interface CarryForwardSummary {
    /** The first and last page whose set also changed, by name; equal for one page */
    first: string;
    last: string;
    /** Where every carried marcher stops, when they all stop at the same page */
    stop?: string;
}

/**
 * The pages the edit also moved, across marchers: from the first to the last flag any marcher
 * carried to (each marcher's run starts at the first flag after the edit, so together they are
 * one run), and the page they stop at when every carried marcher stops at the same one. Marchers
 * that carry nowhere (their next move ends at the next flag) don't count. `null` when no marcher
 * carried, or a flag has no named page.
 */
export function summarizeCarryForward(
    carries: readonly MarcherCarry[],
    boxes: readonly PageBox[],
): CarryForwardSummary | null {
    const carried = carries.filter((c) => c.flags.length > 0);
    if (carried.length === 0) return null;
    const beats = carried.flatMap((c) => c.flags);
    const nameAt = (beat: number) => boxes.find((b) => b.end === beat)?.name;
    const first = nameAt(Math.min(...beats));
    const last = nameAt(Math.max(...beats));
    if (first === undefined || last === undefined) return null;
    const stops = new Set(carried.map((c) => c.stop));
    const [stop] = stops;
    const stopName =
        stops.size === 1 && stop !== null && stop !== undefined
            ? nameAt(stop)
            : undefined;
    return stopName === undefined
        ? { first, last }
        : { first, last, stop: stopName };
}

/**
 * The marchers an edit moved, each with the beat its edit ends at: the window's end for a range
 * move (marchers whose own move it cleared too), 0 for homes, and the end of the edited transition
 * for a stored timeline (an isolated move).
 */
export function editedMarcherEnds(
    target: TimelineEditTarget,
    result: Pick<TimelineMoveResult, "homes" | "slots" | "cleared">,
    spansOf: (marcherId: number) => readonly SpanInfo[],
): Map<number, number> {
    const ends = new Map<number, number>();
    if (target.kind === "home") {
        for (const id of result.homes) ends.set(id, 0);
        return ends;
    }
    for (const { marcherId, transitionId } of result.slots) {
        if (target.kind === "range") {
            ends.set(marcherId, target.end);
            continue;
        }
        const span = spansOf(marcherId).find(
            (s) => s.transitionId === transitionId,
        );
        if (span) ends.set(marcherId, span.end);
    }
    if (target.kind === "range")
        for (const id of result.cleared ?? []) ends.set(id, target.end);
    return ends;
}

/**
 * The carry-forward of an edit (see the module comment), read from `resolver` after the edit has
 * reached it. `null` when nothing carried past the edit.
 */
export function editCarryForward(
    resolver: Resolver,
    target: TimelineEditTarget,
    result: Pick<TimelineMoveResult, "homes" | "slots" | "cleared">,
    boxes: readonly PageBox[],
): CarryForwardSummary | null {
    const spansOf = (id: number) => resolverSpans(resolver, id);
    const flags = [...new Set(boxes.map((b) => b.end))].sort((a, b) => a - b);
    const carries = [...editedMarcherEnds(target, result, spansOf)].map(
        ([id, end]) => marcherCarry(spansOf(id), end, flags),
    );
    return summarizeCarryForward(carries, boxes);
}
