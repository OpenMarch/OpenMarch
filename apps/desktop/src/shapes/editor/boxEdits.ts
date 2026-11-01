import {
    boxBlock,
    boxDistribution,
    boxOutlineSides,
    filesOf,
    isSpread,
    keepRatio,
    ranksOf,
    snapInterval,
    grownFromPivot,
    resizeFiles,
    acrossIsDeep,
    onField,
    withFileCount,
    type BoxParams,
} from "../box/boxGeometry";
import {
    flipShape,
    ROTATION_PX_PER_DEGREE,
    scrubTurn,
    turnShape,
} from "../frame/gestures";
import { boxTool } from "../box/boxTool";
import { pullValue } from "../box/edgePull";
import { gapAsSeen } from "../distribute/outline";
import {
    DEGREE,
    normalizeAngle,
    type FlipAxis,
    type Pivot,
} from "../frame/frame";

import type { ToolEnv } from "../tool/toolKind";
import { filesDistribution } from "../distribute/distribution";
import { layoutOrientations, type LayoutVersion } from "../distribute/layouts";
import { COUNT_RATE, spacingRate, scrubValue } from "./scrub";
import { formatSteps, parseSteps } from "./format";

/**
 * What the floating editor's numbers and buttons do to a box (08-shape-system-ux.md, "The floating
 * editor"). A size change keeps the spacing, a spacing change keeps the count, and both grow from
 * the pivot (back-left by default). Everything here is pure; `spots` is how many spots the box has (holes included).
 */

/** The box with `files` across (clamped to 1 to `spots`), its spacing and center kept */
export function withFiles(
    p: BoxParams,
    spots: number,
    files: number,
    env: ToolEnv,
): BoxParams {
    return resizeFiles(p, spots, files, env);
}

/**
 * The box with `ranks` deep, as near as `spots` allows: the fewest across that fit in that many
 * ranks (13 in 2 deep is 7 across)
 */
export function withRanks(
    p: BoxParams,
    spots: number,
    ranks: number,
    env: ToolEnv,
): BoxParams {
    const n = Math.max(1, spots);
    const now = ranksOf(p, spots);
    const want = Math.min(n, Math.max(1, Math.round(ranks)));
    if (want === now) return p;
    // An outline's spots down a side and across its back always go round the count: a + b is
    // half the loop
    if (boxDistribution(p).mode === "outline")
        return withFiles(p, spots, Math.ceil(n / 2) - want + 2, env);
    // Not every count deep fits: 64 in 9 ranks is still 8 across. Go on until the count changes.
    const step = want > now ? 1 : -1;
    for (let r = want; r >= 1 && r <= n; r += step) {
        const files = Math.ceil(n / r);
        if (files !== filesOf(p)) return withFiles(p, spots, files, env);
    }
    return p;
}

/**
 * The box with a spacing set, in steps: on the drag's ladder, or kept as `typed` (#423). The ratio
 * lock moves the other spacing with it.
 */
export function withSpacing(
    p: BoxParams,
    which: "across" | "deep",
    steps: number,
    spots: number,
    env: ToolEnv,
    typed = false,
): BoxParams {
    const value = snapInterval(steps * env.stepPx, env, typed);
    // A spread's interval is whatever fits its frame (#439): typing back the one shown keeps it
    if (typed && isSpread(p)) {
        const shown = parseSteps(formatSteps(p.across / env.stepPx));
        if (
            shown !== null &&
            Math.abs(snapInterval(shown * env.stepPx, env, true) - value) < 1e-9
        )
            return p;
    }
    // An outline's two spacings are both the designer's: the one set is held, the other
    // stays as it is, and the box's size follows (owner on #459). No ratio lock for it.
    if (boxDistribution(p).mode === "outline") {
        if (value === p[which]) return p;
        return grownFromPivot(p, { ...p, [which]: value }, spots, env);
    }
    let across = which === "across" ? value : p.across;
    let deep = which === "deep" ? value : p.deep;
    if (env.ratioLocked)
        ({ across, deep } = keepRatio(
            p,
            across,
            deep,
            which === "across",
            which === "deep",
            env,
            typed,
        ));
    if (across === p.across && deep === p.deep) return p;
    return grownFromPivot(p, { ...p, across, deep }, spots, env);
}

/** A version of the box's layout, with its size as the field shows it */
interface FieldVersion {
    readonly version: LayoutVersion;
    readonly across: number;
    readonly deep: number;
}

/**
 * The versions of the box's chosen layout (#387), sized on the field, for the size number to move
 * between; null for Short back (or Short back standing in), whose size is any count across
 */
function layoutVersions(p: BoxParams, spots: number): FieldVersion[] | null {
    const block = boxBlock(p, spots);
    if (block.fellBack !== null || block.layout.family === "shortBack")
        return null;
    const swap = acrossIsDeep(p.rotation);
    // Quarter turns included: − on 6 × 4 goes on to 4 × 6
    return layoutOrientations(spots, block.layout.family).map((version) => ({
        version,
        across: swap ? version.deep : version.across,
        deep: swap ? version.across : version.deep,
    }));
}

/** The box laid out in `version`: same intervals and stagger, grown from the pivot */
const inVersion = (
    p: BoxParams,
    spots: number,
    version: LayoutVersion,
    env: ToolEnv,
): BoxParams => {
    const d = boxDistribution(p);
    if (d.mode !== "files") return p;
    return boxTool.closed!.withDistribution(
        p,
        spots,
        { ...d, layout: version.layout },
        env,
    );
};

/** Of `candidates`, the one most like the box now: turned the same way, then nearest in depth */
function likeNow(
    p: BoxParams,
    spots: number,
    candidates: readonly FieldVersion[],
): FieldVersion | undefined {
    const now = boxBlock(p, spots);
    const deep = onField(p, spots).deep;
    return [...candidates].sort(
        (a, b) =>
            Number(a.version.layout.byFile !== now.layout.byFile) -
                Number(b.version.layout.byFile !== now.layout.byFile) ||
            Math.abs(a.deep - deep) - Math.abs(b.deep - deep),
    )[0];
}

/**
 * The size number's − and + (#387): one more or fewer across, or for a layout other than Short
 * back, its next version wider or narrower on the field; null where there is none
 */
export function stepSize(
    p: BoxParams,
    spots: number,
    by: -1 | 1,
    env: ToolEnv,
): BoxParams | null {
    const versions = layoutVersions(p, spots);
    const across = onField(p, spots).across;
    if (!versions) {
        const next = across + by;
        if (next < 1 || next > spots) return null;
        return withFieldCount(p, spots, "across", next, env);
    }
    const ahead = versions.filter((v) => (v.across - across) * by > 0);
    if (ahead.length === 0) return null;
    const nearest = Math.min(...ahead.map((v) => Math.abs(v.across - across)));
    const next = likeNow(
        p,
        spots,
        ahead.filter((v) => Math.abs(v.across - across) === nearest),
    )!;
    return inVersion(p, spots, next.version, env);
}

/** The box with `count` across (or deep) on the field */
export function withFieldCount(
    p: BoxParams,
    spots: number,
    axis: "across" | "deep",
    count: number,
    env: ToolEnv,
): BoxParams {
    const versions = layoutVersions(p, spots);
    if (versions) {
        const now = onField(p, spots);
        if (count === (axis === "across" ? now.across : now.deep)) return p;
        // A size the layout makes keeps the layout; any other is Short back at that size
        const match = likeNow(
            p,
            spots,
            versions.filter((v) => v[axis] === count),
        );
        if (match) return inVersion(p, spots, match.version, env);
        return withFieldCount(asShortBack(p, spots), spots, axis, count, env);
    }
    const swapped = acrossIsDeep(p.rotation);
    if (axis === "across" && swapped) {
        // Side to side on the field is the box's own deep, where only some counts fit (8 in 5
        // ranks is still 2 across, so + jumped from 4 to 8: sims, F3). Turn the box's frame a
        // quarter back first, so its own across runs side to side again: the same grid, the same
        // look, its angle a quarter less.
        if (count === onField(p, spots).across) return p;
        return withFiles(reoriented(p, spots), spots, count, env);
    }
    const ownFiles = (axis === "across") !== swapped;
    return ownFiles
        ? withFiles(p, spots, count, env)
        : withRanks(p, spots, count, env);
}

/**
 * The box as Short back, as many across on its own axes as its block now, ready for a size its
 * layout doesn't make
 */
function asShortBack(p: BoxParams, spots: number): BoxParams {
    const d = boxDistribution(p);
    if (d.mode !== "files") return p;
    const across = boxBlock(p, spots).across;
    return {
        ...p,
        files: across,
        distribution: { ...d, layout: filesDistribution(across).layout },
    };
}

/**
 * The same grid of spots described a quarter turn the other way: its ranks become its files and
 * its two spacings swap. A short rank moves to the new back; who goes where is worked out again by
 * the count change that follows.
 */
export function reoriented(p: BoxParams, spots: number): BoxParams {
    return withFileCount(
        {
            ...p,
            rotation: normalizeAngle(p.rotation - Math.PI / 2),
            across: p.deep,
            deep: p.across,
            flipX: undefined,
            flipY: undefined,
            ...reorientedGap(p, spots),
        },
        ranksOf(p, spots),
    );
}

/** A quarter turn back takes an outline's back to its right, and its left to its back */
const QUARTER_BACK = {
    back: "right",
    right: "front",
    front: "left",
    left: "back",
} as const;

/**
 * An outline's gap where {@link reoriented} puts it: the same spot on the field, with no flip and
 * named by the box's new sides
 */
function reorientedGap(p: BoxParams, spots: number): Partial<BoxParams> {
    const d = boxDistribution(p);
    if (d.mode !== "outline") return {};
    const sides = boxOutlineSides(p, Math.max(1, spots), d.oddGap.side);
    const seen = gapAsSeen(d.oddGap, sides, p.flipX === true, p.flipY === true);
    const len =
        seen.side === "back" || seen.side === "front" ? sides.a : sides.b;
    // The back and front now run front to back, the other way round
    const at =
        seen.at === null || seen.side === "left" || seen.side === "right"
            ? seen.at
            : len - seen.at;
    return {
        distribution: {
            ...d,
            oddGap: { ...seen, side: QUARTER_BACK[seen.side], at },
        },
    };
}

/**
 * A spacing (the box's own `which`) dragged `distance` px for more: ½ step per 8 px, hundredths
 * with fine (still pulled onto the field's lines, #452) or the Snap toggle off (not), from where it
 * started
 */
export function scrubSpacing(
    base: BoxParams,
    which: "across" | "deep",
    distance: number,
    spots: number,
    env: ToolEnv,
): BoxParams {
    const was = (which === "across" ? base.across : base.deep) / env.stepPx;
    // A corner or the center near a field line pulls the spacing onto it (#452): measured from
    // where the drag has the spacing before the ladder rounds it
    const rate = spacingRate(env.snap, "x");
    const raw = (was + (distance / rate.px) * rate.step) * env.stepPx;
    const onLine =
        env.pull !== false ? spacingOnLine(base, which, raw, spots, env) : null;
    if (onLine) return onLine;
    const steps = scrubValue(was, distance, 0, rate);
    // A drag that ends where it started changes nothing; it doesn't round the value
    if (steps === was) return base;
    return withSpacing(base, which, steps, spots, env);
}

/**
 * The box with spacing `which` exactly `value` (field units), grown from the pivot; the ratio
 * lock moves the other spacing exactly with it
 */
function exactSpacing(
    p: BoxParams,
    which: "across" | "deep",
    value: number,
    spots: number,
    env: ToolEnv,
): BoxParams {
    // An outline's spacing set alone, the other as it is (owner on #459)
    if (boxDistribution(p).mode === "outline")
        return grownFromPivot(p, { ...p, [which]: value }, spots, env);
    let across = which === "across" ? value : p.across;
    let deep = which === "deep" ? value : p.deep;
    if (env.ratioLocked && p.across > 0 && p.deep > 0) {
        const ratio = p.deep / p.across;
        if (which === "across") deep = value * ratio;
        else across = value / ratio;
    }
    return grownFromPivot(p, { ...p, across, deep }, spots, env);
}

/**
 * The box with spacing `which` set so one of its snap points (a corner or the center) lands
 * exactly on a field line near where a spacing drag at `raw` (field units) has it (#452), or null
 * with none near. Grown from the pivot, each point moves in a straight line as the spacing
 * changes, so each line gives one spacing. Near is the point's travel on screen, never more than
 * a quarter of how far it moves per half step of spacing, so the half steps stay reachable and a
 * point moving nearly along a line doesn't jump (#448). Never under half a step, the ratio lock's
 * other spacing included.
 */
export function spacingOnLine(
    base: BoxParams,
    which: "across" | "deep",
    raw: number,
    spots: number,
    env: ToolEnv,
): BoxParams | null {
    const lines = env.fieldLines;
    if (!lines || env.pull === false) return null;
    const half = env.stepPx / 2;
    const free = (value: number) =>
        boxTool.snapPoints!(
            exactSpacing(base, which, value, spots, { ...env, snap: false }),
            spots,
        );
    // The spacing, and with the ratio lock the other one it moves exactly, never under half a
    // step: a landing that would take either below is left out, so the ratio stays (review)
    // An outline's spacings are each the designer's: no ratio, hidden or not (review on #459)
    const ratio =
        env.ratioLocked &&
        boxDistribution(base).mode !== "outline" &&
        base.across > 0 &&
        base.deep > 0
            ? base.deep / base.across
            : null;
    const atLeastHalf = (value: number) => {
        const other =
            ratio === null
                ? half
                : which === "across"
                  ? value * ratio
                  : value / ratio;
        return value >= half - 1e-9 && other >= half - 1e-9;
    };
    const value = pullValue(free, raw, lines, env, atLeastHalf);
    if (value === undefined) return null;
    const now = which === "across" ? base.across : base.deep;
    return Math.abs(value - now) < 1e-9
        ? base
        : exactSpacing(base, which, value, spots, env);
}

/** The count across (or deep) on the field dragged `distance` px for more: one per 16 px */
export function scrubSize(
    base: BoxParams,
    axis: "across" | "deep",
    distance: number,
    spots: number,
    env: ToolEnv,
): BoxParams {
    const field = onField(base, spots);
    const was = axis === "across" ? field.across : field.deep;
    const count = scrubValue(was, distance, 0, { axis: "x", ...COUNT_RATE });
    if (count === was) return base;
    const versions = layoutVersions(base, spots);
    if (!versions) return withFieldCount(base, spots, axis, count, env);
    // A layout other than Short back moves between its versions: the one nearest the count
    // dragged to, that way from where it started
    const ahead = versions.filter((v) => (v[axis] - was) * (count - was) > 0);
    if (ahead.length === 0) return base;
    const nearest = Math.min(...ahead.map((v) => Math.abs(v[axis] - count)));
    const next = likeNow(
        base,
        spots,
        ahead.filter((v) => Math.abs(v[axis] - count) === nearest),
    )!;
    return inVersion(base, spots, next.version, env);
}

/** The rotation dragged `distance` px clockwise: 1° per 2 px in 15° steps, whole degrees with `fine`, free with the Snap toggle off */
export const scrubRotation = (
    base: BoxParams,
    distance: number,
    spots: number,
    pivot: Pivot,
    env: ToolEnv,
): BoxParams =>
    scrubTurn(boxTool, base, spots, distance, pivot, env) as BoxParams;

export { ROTATION_PX_PER_DEGREE };

/** The box turned by `degrees` (clockwise on the field) about the pivot */
export function turnBy(
    p: BoxParams,
    spots: number,
    degrees: number,
    pivot: Pivot,
    env: ToolEnv,
): BoxParams {
    return turnShape(
        boxTool,
        p,
        spots,
        p.rotation + degrees * DEGREE,
        pivot,
        env,
    ) as BoxParams;
}

/** The box flipped side to side or front to back about the pivot */
export const flipBox = (
    p: BoxParams,
    spots: number,
    axis: FlipAxis,
    pivot: Pivot,
    env: ToolEnv,
): BoxParams => flipShape(boxTool, p, spots, axis, pivot, env) as BoxParams;

export { acrossIsDeep, onField };
