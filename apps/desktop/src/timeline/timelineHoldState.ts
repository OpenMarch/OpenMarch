import type { CarrySpan } from "./timelineCarryForward";

/**
 * Whether a selected marcher has its own move on the current page or holds there
 * (docs/timeline/ui.md UI-18, defined-coordinates 07c §6: the inspector line "Holding since Page
 * X" or "Moves here", with a jump). Read from the marcher's resolver spans alone.
 */

/** A page flag the line can name and jump to. */
export interface NamedFlag {
    /** The page's flag: its end beat, or 0 for the first page */
    readonly beat: number;
    readonly name: string;
}

export type HoldState =
    /** A move of the marcher's own ends on the current page (in its box, up to its flag) */
    | { readonly kind: "movesHere" }
    /**
     * The marcher holds at the current flag, where it has been since `page`'s flag; `fromStart`
     * when that is the first page's (it hasn't moved since its starting set)
     */
    | {
          readonly kind: "holding";
          readonly page: NamedFlag;
          readonly fromStart: boolean;
          /** What decides the hold, where it's known (`withHoldKind`); the line names it */
          readonly how?: HoldKind;
      };

/**
 * What a hold at the current flag is (holds decisions 2 and 8, fork #478): **Held** on purpose (a
 * Held mark over the flag), a shape **carried** there (the shape's hold, owner 2026-11-01 on #477),
 * or **Not defined** (nothing decided yet; it shows the last position for now).
 */
export type HoldKind = "held" | "carried" | "notDefined";

/** Where a hold is held from: the page it names and jumps to (`heldSince`). */
export type HeldFrom = { page: NamedFlag; fromStart: boolean };

/**
 * `state` with what decides its hold (`HoldKind`), for a marcher holding at the flag `current`.
 * A Held hold names the page its Held mark starts on, not the marcher's last arrival: Hold from
 * previous page holds that page only (holds review R3, demo M7), so Not defined pages may lie
 * between the arrival and the mark. A carried shape's hold reads as Held too (owner, holds wave
 * 2), and names the page the shape was placed or last laid out on, where the carry comes from.
 *
 * @param held where the Held mark of the marcher covering `current` (`start < current <= end`)
 *   starts (`heldSince`), or `null` for none
 * @param carried where the shape carried onto `current` with the marcher in it was placed
 *   (`heldSince` of `carriedSince`'s beat), or `null` when no shape carries the marcher there
 */
export function withHoldKind(
    state: HoldState | null,
    {
        held,
        carried,
    }: {
        held: HeldFrom | null;
        carried: HeldFrom | null;
    },
): HoldState | null {
    if (state?.kind !== "holding") return state;
    if (held) return { ...state, ...held, how: "held" };
    if (carried) return { ...state, ...carried, how: "carried" };
    return { ...state, how: "notDefined" };
}

/** Whether a hold reads as Held: a Held mark, or a shape carried there (owner, holds wave 2) */
export const readsHeld = (how: HoldKind | undefined) =>
    how === "held" || how === "carried";

/**
 * The page a Held mark starting at `start` holds from: the first flag at or after it (the first
 * page's for a hold from the starting spot), as `marcherHoldState` names an arrival.
 *
 * @param flags every page flag, ascending, the first page's (beat 0) first
 */
export function heldSince(
    start: number,
    flags: readonly NamedFlag[],
): HeldFrom | null {
    const since = flags.findIndex((f) => f.beat >= start);
    return since < 0 ? null : { page: flags[since]!, fromStart: since === 0 };
}

/**
 * One marcher's state at the flag `current`. `null` on the first page (its home is its own), when
 * the marcher is partway through a move at the flag (a move passing it), or when `current` isn't
 * a flag.
 *
 * @param flags every page flag, ascending, the first page's (beat 0) first
 */
export function marcherHoldState(
    spans: readonly CarrySpan[],
    current: number,
    flags: readonly NamedFlag[],
): HoldState | null {
    const index = flags.findIndex((f) => f.beat === current);
    if (index <= 0) return null;
    const previous = flags[index - 1]!.beat;
    if (
        spans.some(
            (s) => s.kind !== "hold" && s.end > previous && s.end <= current,
        )
    )
        return { kind: "movesHere" };
    // The span that brought it to the flag (a move starting there hasn't moved it yet)
    const at = spans.find((s) => s.start < current && current <= s.end);
    if (!at || at.kind !== "hold") return null;
    // Held since the move before it ended: the first flag at or after that end (home's for none)
    const since = flags.findIndex((f) => f.beat >= at.start);
    return since < 0
        ? null
        : { kind: "holding", page: flags[since]!, fromStart: since === 0 };
}

/** What the selection shows: the state every marcher shares, or `null` when they differ. */
export function sharedHoldState(
    states: readonly (HoldState | null)[],
): HoldState | null {
    const [first] = states;
    if (!first) return null;
    const same = (s: HoldState | null) =>
        s !== null &&
        s.kind === first.kind &&
        (s.kind === "movesHere" ||
            (first.kind === "holding" && s.page.beat === first.page.beat));
    if (!states.every(same)) return null;
    // Held and Not defined marchers on the same page share the line, without naming either.
    // Held and carried ones both read Held, so they share it as Held
    const reads = (how: HoldKind | undefined) =>
        readsHeld(how) ? "held" : how;
    if (
        first.kind === "holding" &&
        states.some(
            (s) => s?.kind === "holding" && reads(s.how) !== reads(first.how),
        )
    )
        return {
            kind: "holding",
            page: first.page,
            fromStart: first.fromStart,
        };
    return first;
}
