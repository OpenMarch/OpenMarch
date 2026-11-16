import { overlapsBox } from "./basicSimple";
import type { PageKeepState } from "./timelineKeepLater";

/**
 * What the hold commands would do for the selection on one page, so the menus that offer them
 * (the field menu, the page box menu) and their actions (palette, H) say it before they run.
 *
 * A marcher's state on a page (`holdTerms`): **Defined** (a move of its own ends there), **Held**
 * (a stored Held mark covers the page) or **Not defined** (neither). The resolver can't tell Held
 * from Not defined: a Held marcher has no row there either, so the keep state counts it in
 * `follows`, and only its mark (`useHeldMarksStore`) says otherwise. A fourth case, **partway**
 * through a move that runs across one of the page's flags, is none of the three.
 */

export type MarcherPageState = "defined" | "held" | "notDefined" | "midMove";

/** A stored Held mark, as much of it as this reads */
interface Mark {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
}

/**
 * The state on the page `state` is for of each selected marcher without a move of its own there,
 * by marcher id; every other selected marcher is Defined there.
 *
 * @param marks every Held mark (`useHeldMarksStore`); a mark over any of the box makes it Held, as
 *   the commands read it
 */
export function marcherPageStates(
    state: PageKeepState,
    marks: readonly Mark[],
): Map<number, MarcherPageState> {
    const follows = new Set(state.follows);
    const midMove = new Set(state.midMove);
    const held = new Set(
        marks
            .filter(
                (m) => follows.has(m.marcherId) && overlapsBox(m, state.box),
            )
            .map((m) => m.marcherId),
    );
    const out = new Map<number, MarcherPageState>();
    for (const id of [...follows, ...midMove])
        out.set(
            id,
            midMove.has(id) ? "midMove" : held.has(id) ? "held" : "notDefined",
        );
    return out;
}

export type HoldCommand =
    | "defineAsShown"
    | "holdFromPrevious"
    | "clearThisPage";

/** One hold command's entry for the selection on a page. */
export interface HoldEntryState {
    /** Every selected marcher is already in the state the command sets: it would do nothing */
    readonly checked: boolean;
    /** How many selected marchers it would change */
    readonly changes: number;
    /** How many marchers are selected */
    readonly selected: number;
}

/**
 * The three hold commands' entries for the selection on the page `state` is for:
 *
 * - **Define as shown** makes Not defined marchers Defined; it leaves Held ones alone by design,
 *   and those partway through a move.
 * - **Hold from last keyframe** makes Defined and Not defined marchers Held; one partway through
 *   a move can't be (its move crosses the page's flag).
 * - **Clear this page** makes every other marcher Not defined.
 *
 * It counts only what the states say; a command can still refuse some marchers for reasons only
 * the write sees (a shape, follow the leader), and its toast names them.
 */
export function holdEntryStates(
    state: PageKeepState,
    marks: readonly Mark[],
): Record<HoldCommand, HoldEntryState> {
    const selected = state.selected;
    const known = marcherPageStates(state, marks);
    // Those not in `follows` or `midMove` have a move of their own there
    const counts = {
        defined: selected - known.size,
        held: 0,
        notDefined: 0,
        midMove: 0,
    };
    for (const s of known.values()) counts[s]++;
    const entry = (changes: number, checked: boolean): HoldEntryState => ({
        checked: selected > 0 && checked,
        changes,
        selected,
    });
    return {
        defineAsShown: entry(counts.notDefined, counts.defined === selected),
        holdFromPrevious: entry(
            counts.defined + counts.notDefined,
            counts.held === selected,
        ),
        clearThisPage: entry(
            selected - counts.notDefined,
            counts.notDefined === selected,
        ),
    };
}
