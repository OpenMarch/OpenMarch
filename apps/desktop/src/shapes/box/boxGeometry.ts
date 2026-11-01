import type { BlockParams } from "../kinds/block";
import { pullEdges, reachOf, type BoxField } from "./edgePull";
import type { XY } from "../types";
import {
    filesDistribution,
    storedDistribution,
    type Distribution,
    type SpreadDistribution,
    type FilesDistribution,
    type GapSide,
} from "../distribute/distribution";
import {
    nearestVersion,
    resolveLayout,
    type ResolvedLayout,
} from "../distribute/layouts";
import { spreadScale } from "../distribute/distribute";
import { SPREAD_GENERATOR } from "../distribute/spread";
import { rectRegion, type Region } from "../distribute/region";
import {
    acrossRange,
    OUTLINE_MIN,
    outlineSides,
    type OutlineSides,
} from "../distribute/outline";
import type { ToolEnv } from "../tool/toolKind";
import { pivotOf } from "../frame/pivot";
import {
    fieldToFrame,
    frameToField,
    pivotPoint,
    rotationDegrees,
    squareToField,
    type ShapeFrame,
} from "../frame/frame";

/** What every box has: where it is, its file count and intervals, its turn and flips */
export type BoxSize = Pick<
    BlockParams,
    "center" | "rotation" | "files" | "across" | "deep" | "flipX" | "flipY"
>;

/**
 * A box as the box tool draws it (docs/timeline/research/shapes/06-box-v1.md): a block, its
 * rectangle reaching from marcher to marcher (the edge files and ranks stand on its edges). It is
 * drawn square to the field; turning and flipping it are the shape frame's
 * (08-shape-system-ux.md), so every function here works in the box's own axes.
 *
 * How it is filled is the host's `distribution` (spec #385): Files, Outline or Spread. `files`
 * stays the box's own file count, as recipes have always stored it, and the Files layout's `files`
 * follows it ({@link withFileCount}); read the layout through {@link boxDistribution}. In Outline
 * `files` is the spots across the back and front, which set the outline's proportions
 * ({@link spanOf}). A spread keeps the block's proportions, files by ranks, at the `across`
 * interval.
 */
export type BoxParams = BoxSize & {
    readonly distribution?: Distribution;
    /**
     * A spread's frame, width over depth (#439): the shape the designer drew, which a mode switch
     * and Reshuffle keep and a handle reshapes freely; its size is the interval times the
     * spread's scale for the count. Absent (a spread stored before #439): the block's
     * proportions, files by ranks.
     */
    readonly spreadAspect?: number;
    /** What the box remembers across mode switches (#449, `modeMemory.ts`); absent before */
    readonly modes?: unknown;
    /**
     * Recipes stored before the distributor (#386) say how the box was filled this way: always
     * a grid with the short rank at the back, centered, which reads as Files, Short back. A box
     * no longer writes them.
     */
    readonly pattern?: BlockParams["pattern"];
    readonly shortRank?: BlockParams["shortRank"];
    readonly shortRankAt?: BlockParams["shortRankAt"];
};

/**
 * The rectangle through the edge marchers, in the box's own axes around its center as if it were
 * square to the field, in field units. `top` is the back. A single rank or file has no depth or
 * width. Turned boxes: see {@link boxFrame}.
 */
export interface Footprint {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

/** How much better, in log aspect, another file count must fit to replace the current one */
const SPLIT_HYSTERESIS = 0.15;

/**
 * How far, in log aspect, a split's cells may be from square and still count as fitting the
 * drawn rectangle: within 2× either way. Among the splits that fit, the fewest empty spots wins.
 */
export const SPLIT_BAND = Math.log(2);

/** The box's file count: one when the stored count isn't a number (a recipe edited by hand) */
export const filesOf = (p: BoxSize): number =>
    Number.isFinite(p.files) ? Math.max(1, Math.round(p.files)) : 1;

/**
 * Whether a stored box's numbers can lay it out: a file count and intervals that are finite
 * numbers, the intervals not negative. A recipe edited by hand may hold anything.
 */
export const boxNumbersReadable = (p: unknown): boolean => {
    const { files, across, deep } = (p ?? {}) as Record<string, unknown>;
    const finite = (v: unknown): v is number =>
        typeof v === "number" && Number.isFinite(v);
    return (
        finite(files) &&
        finite(across) &&
        across >= 0 &&
        finite(deep) &&
        deep >= 0
    );
};

/**
 * How the box is filled: its stored distribution, or Files, Short back with no stagger (a recipe
 * from before #386). A Files layout always has the box's own file count.
 */
export function boxDistribution(p: BoxParams): Distribution {
    const d = storedDistribution(p, filesOf(p));
    if (d === undefined) return filesDistribution(filesOf(p));
    if (d.mode !== "files" || d.layout.files === filesOf(p)) return d;
    return { ...d, layout: { ...d.layout, files: filesOf(p) } };
}

/** `p` with `files` across, its Files layout too */
export function withFileCount<P extends BoxParams>(p: P, files: number): P {
    const d = p.distribution;
    return {
        ...p,
        files,
        ...(d?.mode === "files"
            ? { distribution: { ...d, layout: { ...d.layout, files } } }
            : {}),
    };
}

/**
 * The box's block for `n` (#387): its Files layout as laid out for the count (the version it
 * names, its family's nearest, or Short back standing in), and the full block's size on the
 * box's own axes. A box in another mode is sized as Files, Short back.
 */
export function boxBlock(p: BoxParams, n: number): ResolvedLayout {
    const d = boxDistribution(p);
    const layout =
        d.mode === "files" ? d.layout : filesDistribution(filesOf(p)).layout;
    return resolveLayout(layout, n);
}

/**
 * An outline box's sides for `n` (4 or more): `files` − 1 intervals across, as near as the count
 * allows (#390)
 */
export function boxOutlineSides(
    p: BoxParams,
    n: number,
    side: GapSide,
): OutlineSides {
    return outlineSides(n, filesOf(p) - 1, side);
}

/**
 * How many spots the box has across and deep, edge marcher to edge marcher: its Files layout's
 * block (#387); an outline's sides, or a line of all of them under 4 (#390)
 */
export function spanOf(
    p: BoxParams,
    n: number,
): { readonly files: number; readonly ranks: number } {
    const d = boxDistribution(p);
    if (d.mode === "outline") {
        const count = Math.max(1, n);
        if (count < OUTLINE_MIN) return { files: count, ranks: 1 };
        const sides = boxOutlineSides(p, count, d.oddGap.side);
        return { files: sides.a + 1, ranks: sides.b + 1 };
    }
    const block = boxBlock(p, n);
    return { files: block.across, ranks: block.deep };
}

/** The box's ranks: its layout's block front to back, or spots down an outline's sides */
export const ranksOf = (p: BoxParams, n: number): number => spanOf(p, n).ranks;

/** Spots across the box: its layout's block, or spots along an outline's back */
export const acrossOf = (p: BoxParams, n: number): number => spanOf(p, n).files;

/** How many spots of the full block the layout leaves empty: 0 for a full block, and in an outline */
export const shortBy = (p: BoxParams, n: number): number =>
    boxDistribution(p).mode === "outline"
        ? 0
        : acrossOf(p, n) * ranksOf(p, n) - Math.max(1, n);

/**
 * The file counts an outline of `n` can have, from its sides' range; just `n` (a line) under 4
 */
export function outlineFilesRange(
    n: number,
    side: GapSide,
): { readonly min: number; readonly max: number } {
    if (n < OUTLINE_MIN) return { min: n, max: n };
    const { min, max } = acrossRange(n, side);
    return { min: min + 1, max: max + 1 };
}

/** One of an outline's two ways: side to side (across) or front to back (deep) */
export type OutlineAxis = "across" | "deep";

/**
 * An outline round a `width` × `depth` frame kept exactly, as a switch to Outline does (#458,
 * owner on #459): of the splits, the one whose two spacings, each its length over its gaps, come
 * nearest each other (never under half a step: the frame grows that way if it must)
 */
export function keptOutline(
    width: number,
    depth: number,
    n: number,
    side: GapSide,
    half: number,
): {
    readonly a: number;
    readonly b: number;
    readonly across: number;
    readonly deep: number;
} {
    const sum = Math.ceil(n / 2);
    const { min, max } = acrossRange(n, side);
    let best: { a: number; score: number } | null = null;
    for (let a = min; a <= max; a++) {
        const across = width / a;
        const deep = depth / (sum - a);
        const score =
            (Math.min(across, deep) < half - 1e-9 ? 1e6 : 0) +
            Math.abs(Math.log(Math.max(deep, 1e-9) / Math.max(across, 1e-9)));
        if (best === null || score < best.score - 1e-9) best = { a, score };
    }
    const a = best!.a;
    const b = sum - a;
    const across = Math.max(width / a, half);
    const deep = Math.max(depth / b, half);
    return {
        a,
        b,
        across: width > 0 ? across : deep,
        deep: depth > 0 ? deep : across,
    };
}

/**
 * The outline evened out in the frame it has now (#458, owner on #459): the split and the two
 * spacings that come as near one spacing all round as that frame allows ({@link keptOutline}),
 * even off the half steps (shown as about so much until set). The same params when it's as even
 * as it gets already; null for a box not in Outline.
 */
export function evenedOutline(
    p: BoxParams,
    n: number,
    env: ToolEnv,
): BoxParams | null {
    const d = boxDistribution(p);
    if (d.mode !== "outline" || n < OUTLINE_MIN) return null;
    const span = spanOf(p, n);
    const width = (span.files - 1) * p.across;
    const depth = (span.ranks - 1) * p.deep;
    const even = keptOutline(width, depth, n, d.oddGap.side, halfStep(env));
    const same =
        even.a === span.files - 1 &&
        Math.abs(even.across - p.across) < 1e-9 &&
        Math.abs(even.deep - p.deep) < 1e-9;
    return same
        ? p
        : {
              ...withFileCount(p, even.a + 1),
              across: even.across,
              deep: even.deep,
          };
}

/** Whether the box is an even spread, whose frame is the spread's edge rather than its marchers */
export const isSpread = (p: BoxParams): boolean =>
    boxDistribution(p).mode === "spread";

/**
 * The shape a spread box fills: the block's proportions, files by ranks (its cells square), so
 * switching between Files and Spread keeps how wide and deep the shape is
 */
export function spreadShapeOf(p: BoxParams, n: number): Region {
    const aspect = p.spreadAspect;
    if (aspect !== undefined && aspect > 0)
        return rectRegion(aspect / 2, 1 / 2);
    return rectRegion(filesOf(p) / 2, ranksOf(p, n) / 2);
}

/**
 * A spread's frame `width` × `depth`, as its aspect and interval, and (`refile`) the file count
 * nearest it, which Files starts from
 */
function spreadSized(
    p: BoxParams,
    n: number,
    width: number,
    depth: number,
    refile: boolean,
): BoxParams {
    const spreadAspect = width / depth;
    const was = boxDistribution(p);
    if (was.mode !== "spread") throw new Error("Not a spread");
    // Reshaped, a spread from before #439 takes the generator whose frame is its own
    const d = { ...was, generator: SPREAD_GENERATOR };
    return {
        ...(refile ? withFileCount(p, filesFor(width, depth, n)) : p),
        distribution: d,
        spreadAspect,
        // The frame is its scale in intervals deep: the interval is what fits the count in it
        across: depth / spreadDepth(spreadAspect, n, d),
    };
}

/** How many intervals deep a spread of `n` with frame `aspect` is */
const spreadDepth = (aspect: number, n: number, d: SpreadDistribution) =>
    spreadScale(rectRegion(aspect / 2, 1 / 2), n, d, 1);

/** A frame's size, side to side and front to back, in field units */
export interface FrameSize {
    readonly width: number;
    readonly depth: number;
}

/** The size of the box's frame for `n` */
export function frameSizeOf(p: BoxParams, n: number): FrameSize {
    const { halfWidth, halfDepth } = boxFrame(p, n);
    return { width: 2 * halfWidth, depth: 2 * halfDepth };
}

/**
 * `next` (the box switched to Spread) filling a frame `width` × `depth` (#439): its center, size and
 * turn kept, the interval whatever fits the count in it. A frame too small for the count at half
 * a step, the least interval, grows from its center just enough (the one time a switch grows
 * it). A box with no area (a single rank or file) has no frame to fill: undefined, and it keeps
 * its interval.
 */
export function spreadIn(
    { width, depth }: FrameSize,
    next: BoxParams,
    n: number,
    env: ToolEnv,
): BoxParams | undefined {
    if (!(width > 0) || !(depth > 0)) return undefined;
    // Its file count stays, so back in Files it is the box it was
    const sized = spreadSized(next, n, width, depth, false);
    const least = halfStep(env);
    return sized.across < least ? { ...sized, across: least } : sized;
}

/**
 * `next` (a box switched to Files from another mode) in a frame `width` × `depth` (#439, #449): its
 * own file count when that keeps the frame within half a step a side (so Grid → Spread → Grid is
 * the box it was); otherwise, of the file counts whose cells are within 2× of square, the one
 * whose half-step intervals come nearest the frame's size. A single file or rank keeps its
 * interval that way.
 */
export function filesIn(
    { width, depth }: FrameSize,
    next: BoxParams,
    n: number,
    env: ToolEnv,
): BoxParams {
    const { spreadAspect: _aspect, ...flat } = next;
    const fit = (files: number) => {
        const p = withFileCount(flat, files);
        const { across: a, deep: b } = boxBlock(p, n);
        const across = a > 1 ? snapInterval(width / (a - 1), env) : p.across;
        const deep = b > 1 ? snapInterval(depth / (b - 1), env) : p.deep;
        return {
            params: { ...p, across, deep },
            off:
                Math.abs((a - 1) * across - width) +
                Math.abs((b - 1) * deep - depth),
            square: Math.abs(Math.log(across / deep)),
        };
    };
    let best = fit(filesOf(next));
    // Its own file count, when that keeps the frame within half a step a side
    if (best.off <= 2 * halfStep(env) + 1e-9) return best.params;
    for (let files = 1; files <= Math.max(1, n); files++) {
        const f = fit(files);
        if (f.square > SPLIT_BAND) continue;
        if (best.square > SPLIT_BAND || f.off < best.off - 1e-9) best = f;
    }
    return best.params;
}

/** How far a spread box reaches either side of its center, and front to back */
function spreadHalves(p: BoxParams, n: number) {
    const d = boxDistribution(p);
    if (d.mode !== "spread") throw new Error("Not a spread");
    const region = spreadShapeOf(p, n);
    const scale = spreadScale(region, n, d, p.across);
    return {
        halfWidth: region.bounds.right * scale,
        halfDepth: region.bounds.bottom * scale,
    };
}

export function footprintOf(p: BoxParams, n: number): Footprint {
    const halfW = ((acrossOf(p, n) - 1) * p.across) / 2;
    const halfH = ((ranksOf(p, n) - 1) * p.deep) / 2;
    return {
        left: p.center.x - halfW,
        right: p.center.x + halfW,
        top: p.center.y - halfH,
        bottom: p.center.y + halfH,
    };
}

/**
 * The box's frame: its center, the half sizes through its edge marchers (a spread's edge, which
 * its marchers keep their distance from), its turn and flip
 */
export function boxFrame(p: BoxParams, n: number): ShapeFrame {
    const half = isSpread(p)
        ? spreadHalves(p, n)
        : {
              halfWidth: ((acrossOf(p, n) - 1) * p.across) / 2,
              halfDepth: ((ranksOf(p, n) - 1) * p.deep) / 2,
          };
    return {
        center: p.center,
        ...half,
        rotation: p.rotation,
        flipX: p.flipX === true,
        flipY: p.flipY === true,
    };
}

/** The box with `frame`'s center, turn and flip; its size is its own */
export function withBoxFrame<P extends BoxSize>(p: P, frame: ShapeFrame): P {
    return {
        ...p,
        center: frame.center,
        rotation: frame.rotation,
        // Absent rather than false, so a box that was never flipped stores as before
        ...(frame.flipX ? { flipX: true } : { flipX: undefined }),
        ...(frame.flipY ? { flipY: true } : { flipY: undefined }),
    };
}

export const halfStep = (env: ToolEnv): number => env.stepPx / 2;

/**
 * How finely a typed interval is kept, per step: 600ths hold hundredths, thirds, quarters, fifths
 * and eighths (#423)
 */
const TYPED_PER_STEP = 600;

/**
 * An interval as drawn, stretched or typed: half steps, hundredths of a step with fine (spec #344,
 * #411), or as typed (`typed`: 1/600 of a step, so 1⅔ stays exact, #423); never under half a step
 */
export function snapInterval(v: number, env: ToolEnv, typed = false): number {
    const half = halfStep(env);
    if (typed)
        return Math.max(
            half,
            // Whole 600ths times the step, so 5/3 step at 11.25 is 18.75 exactly
            (Math.round((v / env.stepPx) * TYPED_PER_STEP) * env.stepPx) /
                TYPED_PER_STEP,
        );
    const unit = env.snap ? half : env.stepPx / 100;
    return Math.max(half, Math.round(v / unit) * unit);
}

/**
 * The file count for `n` marchers in a `width` × `depth` drag. Evenness comes first: of the
 * counts whose cells are within 2× of square, the one with the fewest empty spots in its short
 * rank, then the one closest to square. When none is within 2×, the fewest empty spots of all.
 * A drag passes through many sizes, so `current` is kept until another count fits clearly
 * better, which stops the count flickering at a boundary.
 */
export function splitFor(
    width: number,
    depth: number,
    n: number,
    current?: number,
): number {
    const count = Math.max(1, n);
    const w = Math.max(width, 1e-6);
    const d = Math.max(depth, 1e-6);
    const score = (files: number) =>
        Math.abs(Math.log(w / files / (d / Math.ceil(count / files))));
    const empty = (files: number) => files * Math.ceil(count / files) - count;
    const outside = (files: number) => (score(files) > SPLIT_BAND ? 1 : 0);
    const better = (a: number, b: number) =>
        outside(a) - outside(b) || empty(a) - empty(b) || score(a) - score(b);
    let best = 1;
    for (let files = 2; files <= count; files++)
        if (better(files, best) < 0) best = files;
    if (
        current !== undefined &&
        current >= 1 &&
        current <= count &&
        outside(current) === outside(best) &&
        empty(current) === empty(best) &&
        score(current) - score(best) < SPLIT_HYSTERESIS
    )
        return current;
    return best;
}

/** Which field axes something holds still: x is side to side, y front to back */
export interface HeldAxes {
    readonly x: boolean;
    readonly y: boolean;
}

/**
 * `p` moved so its marchers stand on the grid: the back-left corner snaps (a spot of the full
 * grid, even when the short back rank leaves it empty), and every other marcher follows, the
 * intervals being whole half steps. Unchanged with the Snap toggle off or fine held (`env.snap`
 * is off), and for a box turned off the field's axes, whose marchers can't all stand on the grid.
 *
 * On a `held` field axis the box isn't moved: the caller has put the marcher being held (a
 * stretch's fixed edge, the pivot's spot) where it was, on the grid if it was. With an interval
 * that isn't a half step, snapping the back-left corner instead would shift the box (#423).
 */
export function snapToGrid(
    p: BoxParams,
    n: number,
    env: ToolEnv,
    /** Which way a corner exactly between two half steps goes; the field's rounding when absent */
    tie?: XY,
    held?: HeldAxes,
): BoxParams {
    // A spread has no corner marcher: its center goes on the grid, as a circle's does
    if (env.snap && isSpread(p)) {
        const snapped = env.gridSnap(p.center);
        // Held: a handle keeps the opposite side where it was (#439)
        return {
            ...p,
            center: {
                x: held?.x ? p.center.x : snapped.x,
                y: held?.y ? p.center.y : snapped.y,
            },
        };
    }
    if (!env.snap || !squareToField(p.rotation)) return p;
    const frame = boxFrame(p, n);
    const first = frameToField(frame, {
        x: -frame.halfWidth,
        y: -frame.halfDepth,
    });
    const snapped = tie
        ? breakTies(first, env.gridSnap(first), tie, halfStep(env))
        : env.gridSnap(first);
    return {
        ...p,
        center: {
            x: p.center.x + (held?.x ? 0 : snapped.x - first.x),
            y: p.center.y + (held?.y ? 0 : snapped.y - first.y),
        },
    };
}

/**
 * The box's own axes (x across, y deep) on which its marchers aren't a whole number of half steps
 * apart, so snapping its corner would shift them off where they were (#423). A single file or
 * rank has nothing apart.
 */
function offHalfSteps(p: BoxParams, n: number, env: ToolEnv): HeldAxes {
    const { files, ranks } = spanOf(p, n);
    const off = (count: number, interval: number) => {
        const halves = interval / halfStep(env);
        return count > 1 && Math.abs(halves - Math.round(halves)) > 1e-6;
    };
    return { x: off(files, p.across), y: off(ranks, p.deep) };
}

/** Axes of the box's own (x across, y deep) as the field's, for a box square to the field */
function toFieldAxes(p: BoxParams, n: number, own: HeldAxes): HeldAxes {
    const frame = boxFrame(p, n);
    const o = frameToField(frame, { x: 0, y: 0 });
    const u = frameToField(frame, { x: 1, y: 0 });
    const acrossIsX = Math.abs(u.x - o.x) >= Math.abs(u.y - o.y);
    return acrossIsX ? own : { x: own.y, y: own.x };
}

/**
 * `snapped`, the grid point the field rounded `at` to, with each axis where `at` was exactly
 * between two grid points taken the way `tie` points instead (left alone where `tie` is 0)
 */
function breakTies(at: XY, snapped: XY, tie: XY, unit: number): XY {
    const axis = (a: number, s: number, t: number) => {
        const d = a - s;
        if (t === 0 || Math.abs(Math.abs(d) - unit / 2) > 1e-6) return s;
        const other = s + 2 * d;
        // The candidate on `t`'s side of `at`
        return Math.sign(other - a) === Math.sign(t) ? other : s;
    };
    return { x: axis(at.x, snapped.x, tie.x), y: axis(at.y, snapped.y, tie.y) };
}

/**
 * A box at 0, 0 from its file count and intervals, filled in `distribution` (Files, Short back
 * when absent)
 */
function sizedBox(
    files: number,
    across: number,
    deep: number,
    distribution?: Distribution,
): BoxParams {
    return withFileCount(
        {
            center: { x: 0, y: 0 },
            rotation: 0,
            files,
            across,
            deep,
            distribution: distribution ?? filesDistribution(files),
        },
        files,
    );
}

/**
 * A box from its file count and intervals, its edge marchers reaching from `anchor` toward
 * `grow` on each axis, or centered on it where `grow` is 0 (`fromCenter`), filled in
 * `distribution` (Files, Short back when absent). Its marchers go on the half-step grid, except
 * on `held` axes (by default those whose marchers aren't half steps apart, pulled onto a line or
 * fine), which stay as built. Centered, an even count with an odd number of half steps between
 * puts them between grid spots, so the box goes a quarter step off `anchor`, toward `tie`.
 */
function boxFrom(
    anchor: XY,
    grow: XY,
    files: number,
    across: number,
    deep: number,
    n: number,
    env: ToolEnv,
    distribution?: Distribution,
    held?: HeldAxes,
    tie?: XY,
): BoxParams {
    const sized = sizedBox(files, across, deep, distribution);
    const span = spanOf(sized, n);
    const box: BoxParams = {
        ...sized,
        center: {
            x: anchor.x + (grow.x * (span.files - 1) * across) / 2,
            y: anchor.y + (grow.y * (span.ranks - 1) * deep) / 2,
        },
    };
    return snapToGrid(box, n, env, tie, held ?? offHalfSteps(box, n, env));
}

const signOf = (v: number) => (v < 0 ? -1 : 1);

/** `constrain`: one interval both ways, between the two the drag gives */
function equalized(across: number, deep: number, env: ToolEnv) {
    const both = snapInterval((across + deep) / 2, env);
    return { across: both, deep: both };
}

/**
 * The interval that spreads `count` marchers across `extent`, edge to edge, or undefined for a
 * single marcher, which has no interval on that axis
 */
const spread = (extent: number, count: number, env: ToolEnv) =>
    count > 1 ? snapInterval(extent / (count - 1), env) : undefined;

/**
 * The layout a `width` × `depth` drag draws for `n` (#387): the layout this drag drew a moment
 * ago (`previous`), else the user's last used (`env.layout`), else Short back. Of its versions,
 * the one nearest the drawn proportions, kept until another fits clearly better; Short back
 * picks its file count as it always has ({@link splitFor}). A layout that can't make `n` is kept
 * as asked, and Short back stands in for it (with the chip's note).
 */
function drawnLayout(
    width: number,
    depth: number,
    n: number,
    env: ToolEnv,
    previous?: BoxParams,
): { distribution: FilesDistribution; block: ResolvedLayout } {
    const was = previous ? boxDistribution(previous) : undefined;
    const family =
        was?.mode === "files" ? was.layout.family : (env.layout ?? "shortBack");
    const files = (layout: FilesDistribution["layout"]) => {
        const distribution = { ...filesDistribution(layout.files), layout };
        return { distribution, block: resolveLayout(layout, n) };
    };
    const split = () =>
        splitFor(width, depth, n, previous ? filesOf(previous) : undefined);
    if (family === "shortBack")
        return files({ family, files: split(), byFile: false });
    const aspect = Math.max(width, 1e-6) / Math.max(depth, 1e-6);
    const best = nearestVersion(family, n, aspect);
    if (!best) return files({ family, files: split(), byFile: false });
    const fit = (b: { across: number; deep: number }) =>
        Math.abs(Math.log(b.across / b.deep / aspect));
    if (previous && was?.mode === "files") {
        const held = resolveLayout(was.layout, n);
        if (
            held.fellBack === null &&
            held.layout.family === family &&
            fit(held) - fit(best) < SPLIT_HYSTERESIS
        )
            return files(held.layout);
    }
    return files(best.layout);
}

/**
 * A box filling `frame`, as if drawn over it: the files suit the frame's proportions and the
 * intervals spread the marchers edge to edge in half steps, turned and flipped like the frame
 */
export function boxInFrame(
    frame: ShapeFrame,
    n: number,
    env: ToolEnv,
): BoxParams {
    const width = 2 * frame.halfWidth;
    const depth = 2 * frame.halfDepth;
    const drawn = drawnLayout(width, depth, n, env);
    const a = spread(width, drawn.block.across, env);
    const d = spread(depth, drawn.block.deep, env);
    const across = a ?? d ?? snapInterval(Math.max(width, depth), env);
    const box: BoxParams = {
        center: frame.center,
        rotation: 0,
        files: drawn.distribution.layout.files,
        across,
        deep: d ?? across,
        distribution: drawn.distribution,
    };
    return snapToGrid(withBoxFrame(box, frame), n, env);
}

/**
 * The box a drag from `from` to `to` draws for `n` marchers: the files suit the rectangle's
 * proportions, a marcher stands on the corner pressed, and the intervals spread the rest to the
 * opposite edges, in half steps (so the far edge lands near the cursor, not always on it). With
 * `fromCenter` the press is the box's center and the pointer one corner, the box reaching as far
 * the other way. `previous` is the box this drag drew a moment ago, so its file count holds until
 * another fits clearly better. Undefined for a drag too short to be a box.
 */
export function drawBox(
    from: XY,
    to: XY,
    n: number,
    env: ToolEnv,
    previous?: BoxParams,
): BoxParams | undefined {
    // From the center, the box is twice as far across as the pointer is from the press
    const width = reachOf(env) * Math.abs(to.x - from.x);
    const depth = reachOf(env) * Math.abs(to.y - from.y);
    if (Math.max(width, depth) < halfStep(env)) return undefined;
    const drawn = drawnLayout(width, depth, n, env, previous);
    // One file or one rank has no interval on that axis: it takes the other's, for a later
    // stretch or file change
    const corner = env.snap ? env.gridSnap(from) : from;
    // The dragged corner's edges land on field lines near the pointer (#425): the count can
    // change on the way, and the edge stays on its line while the interval follows
    const ladder = {
        x: spread(
            reachOf(env) * Math.abs(to.x - corner.x),
            drawn.block.across,
            env,
        ),
        y: spread(
            reachOf(env) * Math.abs(to.y - corner.y),
            drawn.block.deep,
            env,
        ),
    };
    const pull = pullEdges(
        {
            moves: true,
            anchor: corner.x,
            to: to.x,
            count: drawn.block.across,
            ladder: ladder.x,
        },
        {
            moves: true,
            anchor: corner.y,
            to: to.y,
            count: drawn.block.deep,
            ladder: ladder.y,
        },
        // Drawn square to the field, so its own axes are the field's
        env.fieldLines
            ? { lines: env.fieldLines, toField: (p) => p }
            : undefined,
        env,
    );
    const a = pull.x ?? ladder.x;
    const d = pull.y ?? ladder.y;
    let across = a ?? d ?? snapInterval(Math.max(width, depth), env);
    let deep = d ?? across;
    if (env.constrain) ({ across, deep } = equalized(across, deep, env));
    return boxFrom(
        corner,
        env.fromCenter
            ? { x: 0, y: 0 }
            : { x: signOf(to.x - from.x), y: signOf(to.y - from.y) },
        drawn.distribution.layout.files,
        across,
        deep,
        n,
        env,
        drawn.distribution,
        // The pressed corner is on the grid already; with a pulled interval, snapping the
        // back-left corner instead would shift the box off the line (#423)
        env.fromCenter ? undefined : { x: true, y: true },
        // From the center, a box between grid spots goes toward the pointer, so a drag one way
        // and the other draw mirror images
        { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) },
    );
}

/** The handles a box has: four corners and four sides, by compass point (north is the back) */
export type BoxHandleKey = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const BOX_HANDLE_KEYS: readonly BoxHandleKey[] = [
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
];

/**
 * The handles a box shows: a single file has nothing to stretch across and a single rank nothing
 * to stretch deep, so those handles go (both: none)
 */
export function handleKeysOf(p: BoxParams, n: number): BoxHandleKey[] {
    // A spread always has an area to reshape
    if (isSpread(p)) return [...BOX_HANDLE_KEYS];
    const across = acrossOf(p, n) > 1;
    const deep = ranksOf(p, n) > 1;
    return BOX_HANDLE_KEYS.filter((key) => {
        const movesX = key.includes("e") || key.includes("w");
        const movesY = key.includes("n") || key.includes("s");
        return (!movesX || across) && (!movesY || deep);
    });
}

/** Where handle `key` is on the field, on the box's corner or edge marchers, turned with it */
export function boxHandlePoint(p: BoxParams, n: number, key: BoxHandleKey): XY {
    const frame = boxFrame(p, n);
    return frameToField(frame, handleDirection(key, frame));
}

/** Which way handle `key` faces in the box's axes, scaled to reach its corner or side */
export function handleDirection(
    key: BoxHandleKey,
    half: { readonly halfWidth: number; readonly halfDepth: number },
): XY {
    return {
        x: key.includes("w")
            ? -half.halfWidth
            : key.includes("e")
              ? half.halfWidth
              : 0,
        y: key.includes("n")
            ? -half.halfDepth
            : key.includes("s")
              ? half.halfDepth
              : 0,
    };
}

/**
 * The box with handle `key` dragged to `to`: the opposite corner or side stays put and the
 * intervals stretch, in half steps; files and ranks never change here. With `fromCenter` the
 * center stays put instead, the opposite corner or side moving the other way. An outline moves
 * only the dragged edge (both ways from the center), its spacing following and the rest kept
 * exactly (#458, owner on #459).
 */
export function stretchBox(
    base: BoxParams,
    n: number,
    key: BoxHandleKey,
    to: XY,
    env: ToolEnv,
): BoxParams {
    if (isSpread(base))
        return inBoxAxes(
            base,
            n,
            env,
            (flat) =>
                reshapeSpread(
                    flat,
                    n,
                    key,
                    fieldToFrame(boxFrame(base, n), to),
                    env,
                ),
            // The opposite side stays exactly where it was: the center isn't snapped that way
            () => ({
                x: key.includes("e") || key.includes("w"),
                y: key.includes("n") || key.includes("s"),
            }),
        );
    const movesX = key.includes("e") || key.includes("w");
    const movesY = key.includes("n") || key.includes("s");
    const d = boxDistribution(base);
    if (d.mode === "outline" && n >= OUTLINE_MIN)
        // As Grid's handles: the dragged way's spacing follows the pointer, the counts kept, so the
        // edge does what it's told; marchers move between the sides only by Even out (owner on
        // #459). Both spacings are the designer's: no ratio.
        return inBoxAxes(
            base,
            n,
            { ...env, ratioLocked: false },
            (flat, flatEnv, field) =>
                stretchSquare(
                    flat,
                    n,
                    key,
                    fieldToFrame(boxFrame(base, n), to),
                    flatEnv,
                    field,
                ),
            // Its fixed corner and sides stay exactly where they were: a drag one way never
            // shifts the other
            () => ({ x: true, y: true }),
        );
    return inBoxAxes(
        base,
        n,
        env,
        (flat, flatEnv, field) =>
            stretchSquare(
                flat,
                n,
                key,
                fieldToFrame(boxFrame(base, n), to),
                flatEnv,
                field,
            ),
        // The fixed edge stays where it was, and so does an axis the handle doesn't move whose
        // marchers aren't half steps apart (#423). From the center nothing is held on the half
        // steps: the marchers go on the grid, at most a quarter step off the center.
        (out) => {
            const off = offHalfSteps(out, n, env);
            const fixed = !env.fromCenter;
            return {
                x: (fixed && movesX) || off.x,
                y: (fixed && movesY) || off.y,
            };
        },
        env.fromCenter ? backToGrid(base, env) : undefined,
    );
}

/**
 * Which way a resize about the center moves a box whose marchers land exactly between two grid
 * spots: with its center a quarter step off the grid already, back to the grid spot the field's
 * rounding doesn't take it to, so each such center pairs with one spot and resizing again and
 * again doesn't walk the box away; with its center on the grid, the field's rounding (0)
 */
function backToGrid(p: BoxParams, env: ToolEnv): XY {
    const snapped = env.gridSnap(p.center);
    const axis = (d: number) =>
        Math.abs(Math.abs(d) - halfStep(env) / 2) < 1e-6 ? Math.sign(d) : 0;
    return {
        x: axis(p.center.x - snapped.x),
        y: axis(p.center.y - snapped.y),
    };
}

/**
 * `change` worked out in the box's own axes: on a copy of the box centered on 0, 0 and square to
 * the field, with nothing snapped to the field's grid (that grid is the field's, not the box's).
 * The result is put back where the box is, turned and flipped as it was, then snapped.
 */
function inBoxAxes(
    base: BoxParams,
    n: number,
    env: ToolEnv,
    change: (
        flat: BoxParams,
        flatEnv: ToolEnv,
        /** The field's lines, and where a point in the box's own axes is on the field (#446) */
        field: BoxField | undefined,
    ) => BoxParams,
    /** The box's own axes on which `change` holds a marcher where it was, not to be snapped */
    held?: (out: BoxParams) => HeldAxes,
    /** Which way the result goes on the field's axes when its marchers are between grid spots */
    tie?: XY,
): BoxParams {
    const frame = boxFrame(base, n);
    const flat: BoxParams = {
        ...base,
        center: { x: 0, y: 0 },
        rotation: 0,
    };
    const lines = env.fieldLines;
    const out = change(
        flat,
        { ...env, gridSnap: (p) => p, fieldLines: undefined },
        lines && { lines, toField: (p) => frameToField(frame, p) },
    );
    const placed: BoxParams = {
        ...out,
        center: frameToField(frame, out.center),
        rotation: base.rotation,
        flipX: base.flipX,
        flipY: base.flipY,
    };
    return snapToGrid(
        placed,
        n,
        env,
        tie,
        held && toFieldAxes(placed, n, held(out)),
    );
}

/**
 * What a stretch with handle `key` toward `to` holds on each of the box's own axes, `at` among
 * `edges`, and which way the box grows from there, `grow`: the edge opposite the handle (left for
 * an east handle), growing toward `to` and past it flipping over; on an axis the handle doesn't
 * move, the left or back edge, growing as before; or with `fromCenter`, the center, growing both
 * ways (0), so the box reaches as far again the other way
 */
function stretchAnchor(
    edges: Footprint,
    key: BoxHandleKey,
    to: XY,
    env: ToolEnv,
): { at: XY; grow: XY } {
    if (env.fromCenter)
        return {
            at: {
                x: (edges.left + edges.right) / 2,
                y: (edges.top + edges.bottom) / 2,
            },
            grow: { x: 0, y: 0 },
        };
    const movesX = key.includes("e") || key.includes("w");
    const movesY = key.includes("n") || key.includes("s");
    const at = {
        x: !movesX || key.includes("e") ? edges.left : edges.right,
        y: !movesY || key.includes("s") ? edges.top : edges.bottom,
    };
    return {
        at,
        grow: {
            x: movesX ? signOf(to.x - at.x) : 1,
            y: movesY ? signOf(to.y - at.y) : 1,
        },
    };
}

/** {@link stretchBox} in the box's own axes, `to` in them too */
function stretchSquare(
    base: BoxParams,
    n: number,
    key: BoxHandleKey,
    to: XY,
    env: ToolEnv,
    field: BoxField | undefined,
): BoxParams {
    const f = footprintOf(base, n);
    const { files: across0, ranks } = spanOf(base, n);
    const movesX = key.includes("e") || key.includes("w");
    const movesY = key.includes("n") || key.includes("s");
    const { at, grow } = stretchAnchor(f, key, to, env);
    // How far the box reaches on an axis, edge to edge, for the pointer there
    const extent = (a: "x" | "y") => reachOf(env) * Math.abs(to[a] - at[a]);
    // A moving corner lands on a field line near the pointer, at any turn (#425, #446), or the
    // interval steps by halves
    const ladder = {
        x: movesX ? spread(extent("x"), across0, env) : undefined,
        y: movesY ? spread(extent("y"), ranks, env) : undefined,
    };
    const pull = pullEdges(
        movesX
            ? {
                  moves: true,
                  anchor: at.x,
                  to: to.x,
                  count: across0,
                  ladder: ladder.x,
              }
            : { moves: false, edges: [f.left, f.right] },
        movesY
            ? {
                  moves: true,
                  anchor: at.y,
                  to: to.y,
                  count: ranks,
                  ladder: ladder.y,
              }
            : { moves: false, edges: [f.top, f.bottom] },
        field,
        env,
    );
    const x = movesX
        ? { interval: pull.x ?? ladder.x, pulled: pull.x !== undefined }
        : null;
    const y = movesY
        ? { interval: pull.y ?? ladder.y, pulled: pull.y !== undefined }
        : null;
    let across = x?.interval || base.across;
    let deep = y?.interval || base.deep;
    if (env.constrain && movesX && movesY)
        ({ across, deep } = equalized(across, deep, env));
    else if (env.ratioLocked)
        // A pulled value drives the other spacing exactly (#425)
        ({ across, deep } = keepRatio(base, across, deep, movesX, movesY, env, {
            across: x?.pulled === true,
            deep: y?.pulled === true,
        }));
    return boxFrom(
        at,
        grow,
        filesOf(base),
        across,
        deep,
        n,
        env,
        boxDistribution(base),
    );
}

/**
 * {@link stretchBox} for a spread square to the field, `to` in its axes (#439): the frame follows
 * the handle, the opposite corner or side staying put (the center, with `fromCenter`), its edges
 * on half steps (with snap), and the interval is what fits the count in it. A side handle keeps
 * the other side as it was.
 */
function reshapeSpread(
    base: BoxParams,
    n: number,
    key: BoxHandleKey,
    to: XY,
    env: ToolEnv,
): BoxParams {
    const frame = boxFrame(base, n);
    const movesX = key.includes("e") || key.includes("w");
    const movesY = key.includes("n") || key.includes("s");
    // The frame is centered on 0, 0 here
    const { at, grow } = stretchAnchor(
        {
            left: -frame.halfWidth,
            right: frame.halfWidth,
            top: -frame.halfDepth,
            bottom: frame.halfDepth,
        },
        key,
        to,
        env,
    );
    const least = halfStep(env);
    const side = (v: number) =>
        Math.max(least, env.snap ? Math.round(v / least) * least : v);
    const w0 = 2 * frame.halfWidth;
    const d0 = 2 * frame.halfDepth;
    let width = movesX ? side(reachOf(env) * Math.abs(to.x - at.x)) : w0;
    let depth = movesY ? side(reachOf(env) * Math.abs(to.y - at.y)) : d0;
    // The handle stops where the interval would go under half a step, as at the least size
    const d = boxDistribution(base);
    if (d.mode !== "spread") throw new Error("Not a spread");
    const intervalAt = (w: number, h: number) => h / spreadDepth(w / h, n, d);
    if (intervalAt(width, depth) < least && intervalAt(w0, d0) >= least) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 40; i++) {
            const t = (lo + hi) / 2;
            const w = w0 + (width - w0) * t;
            const h = d0 + (depth - d0) * t;
            if (intervalAt(w, h) >= least) lo = t;
            else hi = t;
        }
        width = w0 + (width - w0) * lo;
        depth = d0 + (depth - d0) * lo;
    }
    // Grown from what it holds, toward the handle (past it, the other way)
    return {
        ...spreadSized(base, n, width, depth, true),
        center: {
            x: at.x + grow.x * (width / 2),
            y: at.y + grow.y * (depth / 2),
        },
    };
}

/**
 * The file count whose block, files by ranks, is nearest the shape of a `width` × `depth`
 * rectangle: what a spread box is reshaped to
 */
export function filesFor(width: number, depth: number, n: number): number {
    const count = Math.max(1, n);
    const want = Math.log(Math.max(width, 1e-6) / Math.max(depth, 1e-6));
    let best = 1;
    let bestFit = Infinity;
    for (let files = 1; files <= count; files++) {
        const fit = Math.abs(Math.log(files / Math.ceil(count / files)) - want);
        if (fit < bestFit - 1e-9) {
            bestFit = fit;
            best = files;
        }
    }
    return best;
}

/**
 * The intervals with the ratio lock on: the one the drag changed most, by proportion, decides,
 * and the other keeps the box's deep-to-across ratio. Both stay on half steps (owner,
 * 2026-10-16), so the ratio is as near as half steps allow. A side handle changes only its own.
 * A square box copies the leader as it is, and a typed (or pulled) leader keeps its follower as
 * exact as itself (`typed`, #423, #425), so 2⅔ across makes 2⅔ deep. `typed` says which of the
 * two are exact, or both; it counts only for the one that leads.
 */
export function keepRatio(
    base: Pick<BoxSize, "across" | "deep">,
    across: number,
    deep: number,
    movesX: boolean,
    movesY: boolean,
    env: ToolEnv,
    typed:
        | boolean
        | { readonly across: boolean; readonly deep: boolean } = false,
): { across: number; deep: number } {
    if (!(base.across > 0) || !(base.deep > 0)) return { across, deep };
    const ratio = base.deep / base.across;
    const acrossLeads =
        movesX &&
        (!movesY ||
            Math.abs(Math.log(across / base.across)) >=
                Math.abs(Math.log(deep / base.deep)));
    // A leader on the ladder keeps its follower there too, whatever the other axis was
    const exact =
        typeof typed === "boolean"
            ? typed
            : acrossLeads
              ? typed.across
              : typed.deep;
    const follow = (v: number) =>
        Math.abs(ratio - 1) < 1e-9 ? v : snapInterval(v, env, exact);
    return acrossLeads
        ? { across, deep: follow(across * ratio) }
        : { across: follow(deep / ratio), deep };
}

/**
 * The box moved by `delta`, its marchers back on the grid. A box turned off the field's axes
 * can't stand on the grid, so it moves by whole half steps instead.
 */
export function moveBox(
    base: BoxParams,
    n: number,
    delta: XY,
    env: ToolEnv,
): BoxParams {
    const by =
        env.snap && !squareToField(base.rotation)
            ? {
                  x: Math.round(delta.x / halfStep(env)) * halfStep(env),
                  y: Math.round(delta.y / halfStep(env)) * halfStep(env),
              }
            : delta;
    return snapToGrid(
        {
            ...base,
            center: { x: base.center.x + by.x, y: base.center.y + by.y },
        },
        n,
        env,
    );
}

/** The box with `delta` more files (fewer when negative): same intervals, grown from the pivot */
export function changeFiles(
    p: BoxParams,
    n: number,
    delta: number,
    env: ToolEnv,
): BoxParams {
    return resizeFiles(p, n, filesOf(p) + delta, env);
}

/**
 * The box with `files` across (clamped to 1 to `n`): it keeps its spacing and grows or shrinks
 * around the pivot. (Keeping its size and refitting the spacing instead lost an A/B with the
 * simulated users on 2026-10-18: everyone's typed spacing broke.)
 */
export function resizeFiles(
    p: BoxParams,
    n: number,
    files: number,
    env: ToolEnv,
): BoxParams {
    const d = boxDistribution(p);
    // An outline's spots across stay within what its count can go round
    const { min, max } =
        d.mode === "outline"
            ? outlineFilesRange(Math.max(1, n), d.oddGap.side)
            : { min: 1, max: Math.max(1, n) };
    const clamped = Math.min(max, Math.max(min, Math.round(files)));
    if (clamped === acrossOf(p, n)) return p;
    // A count changed is what's touched: both spacings stay as they are, an outline's too, and
    // the lengths follow (#458, owner on #459)
    return grownFromPivot(p, withFileCount(p, clamped), n, env);
}

/**
 * `after`, a resize of `before` (a new count or spacing), moved so the pivot stays where it was:
 * the shape's own, the center by default (2026-10-18), or where a run of size presses began
 * (`env.anchor`). Then back on the grid.
 *
 * A new count can leave the box's corner exactly between two half steps (4 ranks 2½ apart about
 * a center on the grid, then 3). Rounding that tie the same way every time made the box creep a
 * quarter step per press (owner lab feedback on #387, 2026-10-23), so the tie goes against the
 * way the box grew on that axis: + then − comes back to the same place.
 */
export function grownFromPivot(
    before: BoxParams,
    after: BoxParams,
    n: number,
    env: ToolEnv,
): BoxParams {
    const key = env.pivot ?? pivotOf(before);
    const was = env.anchor ?? pivotPoint(boxFrame(before, n), key);
    const now = pivotPoint(boxFrame(after, n), key);
    const moved: BoxParams = {
        ...after,
        center: {
            x: after.center.x + was.x - now.x,
            y: after.center.y + was.y - now.y,
        },
    };
    // A spread's frame isn't on the grid: the pivot stays exactly where it was (#439)
    if (isSpread(moved)) return moved;
    // Where the marchers aren't half steps apart, the pivot stays exactly where it was (#423)
    return snapToGrid(
        moved,
        n,
        env,
        growthBias(before, moved, n),
        toFieldAxes(moved, n, offHalfSteps(moved, n, env)),
    );
}

/**
 * Which way a tie on the grid goes after `before` became `after`, on the field: against the
 * growth on each of the box's own axes (a box that got deeper rounds toward its back)
 */
function growthBias(before: BoxParams, after: BoxParams, n: number): XY {
    const a = boxFrame(before, n);
    const b = boxFrame(after, n);
    const gx = Math.sign(b.halfWidth - a.halfWidth);
    const gy = Math.sign(b.halfDepth - a.halfDepth);
    const o = frameToField(b, { x: 0, y: 0 });
    const u = frameToField(b, { x: 1, y: 0 });
    const v = frameToField(b, { x: 0, y: 1 });
    return {
        x: -gx * (u.x - o.x) - gy * (v.x - o.x),
        y: -gx * (u.y - o.y) - gy * (v.y - o.y),
    };
}

/**
 * Whether `at` grabs the box to move it: inside its edge marchers, or within half an interval
 * of them, so a single rank or file can be grabbed too
 */
export function insideBox(p: BoxParams, n: number, at: XY): boolean {
    const frame = boxFrame(p, n);
    const local = fieldToFrame(frame, at);
    return (
        Math.abs(local.x) <= frame.halfWidth + p.across / 2 &&
        Math.abs(local.y) <= frame.halfDepth + p.deep / 2
    );
}

/** The outline through the box's edge marchers, turned with it: back-left first */
export function boxCorners(p: BoxParams, n: number): XY[] {
    const frame = boxFrame(p, n);
    const { halfWidth: w, halfDepth: d } = frame;
    return [
        frameToField(frame, { x: -w, y: -d }),
        frameToField(frame, { x: w, y: -d }),
        frameToField(frame, { x: w, y: d }),
        frameToField(frame, { x: -w, y: d }),
    ];
}

/**
 * Whether the box is turned far enough that its own deep runs side to side on the field: between
 * 45° and 135° (or 225° and 315°). The editor's numbers then follow the field, so "across" is
 * always side to side as people see it (owner, 2026-10-17). Exactly 45° keeps the box's own.
 */
export function acrossIsDeep(rotation: number): boolean {
    const d = rotationDegrees(rotation) % 180;
    return d > 45 && d < 135;
}

/** The box's counts and spacings as the field shows them: across is side to side */
export function onField(p: BoxParams, spots: number) {
    const swap = acrossIsDeep(p.rotation);
    const { files, ranks } = spanOf(p, spots);
    return {
        swap,
        across: swap ? ranks : files,
        deep: swap ? files : ranks,
        acrossSpacing: swap ? p.deep : p.across,
        deepSpacing: swap ? p.across : p.deep,
        /** The box's own parameter each field number edits */
        acrossKey: (swap ? "deep" : "across") as "across" | "deep",
        deepKey: (swap ? "across" : "deep") as "across" | "deep",
    };
}
