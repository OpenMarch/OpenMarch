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
      };

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
    return states.every(same) ? first : null;
}
