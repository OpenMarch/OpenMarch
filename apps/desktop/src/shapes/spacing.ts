import tolgee from "@/global/singletons/Tolgee";
import { fractionText, readSteps } from "./editor/format";
import type { Path } from "./geometry/path";
import { falsePosition } from "./solve";
import type { IntervalRun, Slot, Spacing } from "./types";

/**
 * Spacing along a path, shared by every path kind.
 *
 * An interval list is typed on a numpad (spec #522, "Mixed intervals"): groups of marchers, each
 * a count and an interval in steps.
 * - one number is everyone at that interval: `2`;
 * - `count * interval` is a group of that many marchers: `2*3+4*2` is 2 marchers at 3 steps,
 *   then 4 at 2. `x` or `×` work for `*`, and `,` for `+`;
 * - at most one group has no count: it's the rest, so `2.5+3*4` puts the last 3 at 4 steps and
 *   `2*3+2+2*3` 2 at each end. Where it sits decides where the counted groups go.
 *
 * Each interval is read by {@link readSteps}, so fractions stay exact (`2*5/3`, `3*2⅔`).
 */
export interface IntervalGroup {
    /** Steps between neighbors */
    readonly steps: number;
    /** How many marchers; absent for the rest */
    readonly count?: number;
}

export type ParsedIntervals =
    | { readonly ok: true; readonly groups: IntervalGroup[] }
    | { readonly ok: false; readonly message: string };

/** A count, `*` or `x`, then the interval; or the interval alone */
const GROUP = /^(?:([^*x×]+?)\s*[x×*]\s*)?([^*x×]+)$/i;

/** The most marchers one group can have */
export const MAX_GROUP_COUNT = 999;

/** A list's groups apart (`2*3+4*2` is `2*3` and `4*2`), or why they can't be */
function listParts(
    text: string,
): { readonly parts: string[] } | { readonly message: string } {
    const parts = text.split(/[+,;]/).map((part) => part.trim());
    // One separator at the end is a list still being typed (`2*3+`)
    if (parts.length > 1 && parts.at(-1) === "") parts.pop();
    if (parts.length === 1 && parts[0] === "")
        return {
            message: tolgee.t(
                "shapes.spacing.empty",
                "Enter an interval in steps",
            ),
        };
    if (parts.includes(""))
        return {
            message: tolgee.t(
                "shapes.spacing.emptyGroup",
                "There's an empty group in the list. Type a group between each +: 2*3+4*2",
            ),
        };
    return { parts };
}

/** One group of a list (`2*3`, or `2` for the rest), or why it isn't one */
function parseGroup(
    part: string,
): IntervalGroup | { readonly message: string } {
    const match = GROUP.exec(part);
    const steps = match && readSteps(match[2]!.replace(/\s*steps?$/i, ""));
    if (!match || steps === null)
        return {
            message: tolgee.t(
                "shapes.spacing.notInterval",
                '"{part}" isn\'t an interval. Type steps (2), or a count and steps for each group (2*3+4*2)',
                { part },
            ),
        };
    const countText = match[1]?.trim();
    if (countText !== undefined && !/^\d+$/.test(countText))
        return {
            message: tolgee.t(
                "shapes.spacing.notCount",
                '"{count}" isn\'t a number of marchers. Type a whole count before the interval: 2*3',
                { count: countText },
            ),
        };
    if (!(steps > 0))
        return {
            message: tolgee.t(
                "shapes.spacing.notPositive",
                "An interval must be more than 0 steps",
            ),
        };
    if (countText === undefined) return { steps };
    const count = Number(countText);
    if (!(count >= 1))
        return {
            message: tolgee.t(
                "shapes.spacing.noMarchers",
                "A group needs at least 1 marcher",
            ),
        };
    if (count > MAX_GROUP_COUNT)
        return {
            message: tolgee.t(
                "shapes.spacing.tooManyMarchers",
                "A group can have at most {max} marchers",
                { max: MAX_GROUP_COUNT },
            ),
        };
    return { count, steps };
}

export function parseIntervals(text: string): ParsedIntervals {
    const list = listParts(text);
    if ("message" in list) return { ok: false, message: list.message };
    const groups: IntervalGroup[] = [];
    for (const part of list.parts) {
        const group = parseGroup(part);
        if ("message" in group) return { ok: false, message: group.message };
        groups.push(group);
    }
    if (groups.filter((g) => g.count === undefined).length > 1)
        return {
            ok: false,
            message: tolgee.t(
                "shapes.spacing.twoRests",
                "Only one group can go without a count (the rest). Type a count before the others: 2*3",
            ),
        };
    return { ok: true, groups };
}

/** Steps as a list shows them: decimals, or a glyph where decimals can't be exact (2⅔) */
const trim = (n: number) =>
    fractionText(n, [3, 6]) ?? String(Number(n.toFixed(4)));

/** An interval list as it's typed: `2*3+4*2` */
export function formatIntervals(groups: readonly IntervalGroup[]): string {
    return groups
        .map((g) =>
            g.count === undefined
                ? trim(g.steps)
                : `${g.count}*${trim(g.steps)}`,
        )
        .join("+");
}

/** A group as laid out for a number of marchers */
export interface LaidGroup {
    /** Marchers in it; 0 for a group dropped off the end */
    readonly count: number;
    /** How many more than its count it took: the last group grown, with no rest to take them */
    readonly grown: number;
}

/**
 * How many of `n` marchers each group takes (spec #522, "Groups to gaps"). The counted groups
 * take theirs in order and the rest what's left; without a rest, the last group grows to take
 * the extra marchers. When there are too few, groups drop from the end.
 */
export function layGroups(
    groups: readonly { readonly count?: number }[],
    n: number,
): LaidGroup[] {
    let left = Math.max(0, n);
    const laid = groups.map((g) => {
        if (g.count === undefined) return { count: 0, grown: 0 };
        const count = Math.min(g.count, left);
        left -= count;
        return { count, grown: 0 };
    });
    const rest = groups.findIndex((g) => g.count === undefined);
    if (rest >= 0) laid[rest] = { count: left, grown: 0 };
    else if (left > 0 && laid.length > 0) {
        const last = laid.at(-1)!;
        laid[laid.length - 1] = { count: last.count + left, grown: left };
    }
    return laid;
}

/**
 * The `n − 1` gaps between `n` marchers in a row laid out in `groups`: each group's interval
 * between its own marchers, and the larger of two groups' intervals at the seam between them
 */
export function groupGaps<G extends { readonly count?: number }>(
    groups: readonly G[],
    n: number,
    intervalOf: (group: G) => number,
): number[] {
    const each: number[] = [];
    layGroups(groups, n).forEach(({ count }, i) => {
        for (let k = 0; k < count; k++) each.push(intervalOf(groups[i]!));
    });
    return each.slice(1).map((interval, i) => Math.max(interval, each[i]!));
}

/**
 * The `gapCount` gaps, in steps, that the older path kinds' `runs` give (`kinds/`; the typed list
 * is groups of marchers now, {@link IntervalGroup}). Runs repeat from the first when there are more
 * gaps than they cover; extra runs past `gapCount` are unused.
 */
export function gapsInSteps(
    runs: readonly IntervalRun[],
    gapCount: number,
): number[] {
    const gaps: number[] = [];
    if (runs.length === 0 || gapCount <= 0) return gaps;
    if (runs.length === 1 && runs[0]!.count === 0) {
        return Array.from({ length: gapCount }, () => runs[0]!.steps);
    }
    while (gaps.length < gapCount) {
        for (const run of runs) {
            for (let i = 0; i < run.count && gaps.length < gapCount; i++)
                gaps.push(run.steps);
        }
    }
    return gaps;
}

/**
 * Arc-length offsets along `path` for marchers whose neighbors are `gaps` apart in a straight
 * line, starting at `from`. On a straight path that is the gaps themselves; on a curve each gap
 * reaches a little farther along the path than its chord.
 *
 * A gap never jumps a stretch of the path. It is how far the path's points get from the marcher
 * before it, straight across, counted all the way along: where the path turns back toward the
 * marcher, the way back counts too, so a gap can't skip the bit that curls back. And at one of
 * `bends` (offsets of corners on the path that hold no marcher) the gap goes on from the corner
 * with what is left of it, so a run never cuts across a spike's tip and lands far down its other
 * side. Where the path keeps leading away that is the chord. Where a gap lands moves on
 * continuously as the gaps grow, so a search on them (Fit) finds one even interval.
 */
export function chordOffsets(
    path: Path,
    from: number,
    gaps: readonly number[],
    bends: readonly number[] = [],
): number[] {
    const offsets = [from];
    let s = from;
    for (const gap of gaps) offsets.push((s = acrossTo(path, s, gap, bends)));
    return offsets;
}

/** How many steps a gap is walked out in, at most, over the path's length */
const WALK_STEPS = 512;

/** The offset `gap` past `s` straight across ({@link chordOffsets}) */
function acrossTo(
    path: Path,
    s: number,
    gap: number,
    bends: readonly number[],
): number {
    if (!(gap > 0)) return s;
    const step = Math.max(path.length, gap) / WALK_STEPS;
    const tolerance = Math.max(gap, 1) * 1e-9;
    let origin = path.at(s);
    const far = (t: number) => {
        const q = path.at(t);
        return Math.hypot(q.x - origin.x, q.y - origin.y);
    };
    let bend = nextBend(bends, s, tolerance);
    let lo = s;
    let reach = 0;
    // The distance changes no faster than the path goes, so a gap is used up within its own length
    // along: at most WALK_STEPS steps, and one more for each corner it starts again from
    for (let i = 0; i < 2 * WALK_STEPS + bends.length + 2; i++) {
        const hi = Math.min(lo + step, bend);
        const there = far(hi);
        const change = Math.abs(there - reach);
        if (change >= gap) {
            // Within one short step the distance goes one way, all but straight: false position
            // finds it in a few calls, where halving took dozens (a layout straight across is
            // searched for, and a drag searches layouts)
            const from = reach;
            const left = gap;
            const short = (t: number) => Math.abs(far(t) - from) - left;
            return (
                falsePosition(
                    short,
                    lo,
                    -left,
                    hi,
                    change - left,
                    (hi - lo) * 1e-12,
                ) ?? lo + left
            );
        }
        gap -= change;
        lo = hi;
        reach = there;
        if (hi === bend) {
            if (gap <= tolerance) return bend;
            origin = path.at(bend);
            reach = 0;
            bend = nextBend(bends, bend, tolerance);
        }
    }
    return lo + gap;
}

/** The first of `bends` past offset `s`, or Infinity */
const nextBend = (bends: readonly number[], s: number, tolerance: number) =>
    bends.reduce(
        (first, b) => (b > s + tolerance && b < first ? b : first),
        Infinity,
    );

/**
 * `n` slots along `path`, tagged with their distance `s` from the path's start.
 *
 * Fit spreads them over the whole path (around it when closed). Interval puts neighbors the
 * typed distance apart (`chordOffsets`), laid from the anchor: from the start, centered on the
 * path, or back from the end; a run longer than the path continues past its end (`Path.at`). A
 * shape that follows the interval is already sized to the run, so it is laid from the start.
 */
export function sampleAlong(
    path: Path,
    spacing: Spacing,
    n: number,
    stepPx: number,
): Slot[] {
    if (n <= 0) return [];
    let offsets: number[] = [];
    if (spacing.mode === "fit") {
        if (n === 1) offsets.push(path.closed ? 0 : path.length / 2);
        else {
            const divisions = path.closed ? n : n - 1;
            for (let i = 0; i < n; i++)
                offsets.push((path.length * i) / divisions);
        }
    } else {
        const gaps = gapsInSteps(spacing.runs, n - 1).map((g) => g * stepPx);
        offsets = chordOffsets(path, 0, gaps);
        if (spacing.size !== "follow" && spacing.anchor !== "start") {
            const extent = offsets.at(-1)! - offsets[0]!;
            const from =
                spacing.anchor === "end"
                    ? path.length - extent
                    : (path.length - extent) / 2;
            offsets = chordOffsets(path, from, gaps);
        }
    }
    return offsets.map((s) => ({ ...path.at(s), s }));
}
