import { resizeCursor } from "../frame/frame";
import type { ToolEnv, ToolKind } from "../tool/toolKind";
import { distributionFor, type Distribution } from "../distribute/distribution";
import { layoutCatalogue, resolveLayout } from "../distribute/layouts";
import { nearestSides, OUTLINE_MIN } from "../distribute/outline";
import { BOX_PARAMS } from "./boxParams";
import { leftAs, readMemory, sameSize, type ModeMemory } from "./modeMemory";
import { boxRegion, boxShape } from "./boxShape";
import {
    boxBlock,
    filesIn,
    spreadIn,
    frameSizeOf,
    type FrameSize,
    boxDistribution,
    filesOf,
    grownFromPivot,
    withFileCount,
    type BoxHandleKey,
    type BoxParams,
    boxCorners,
    boxFrame,
    boxHandlePoint,
    boxInFrame,
    drawBox,
    handleDirection,
    handleKeysOf,
    insideBox,
    moveBox,
    evenedOutline,
    keptOutline,
    halfStep,
    snapToGrid,
    stretchBox,
    withBoxFrame,
} from "./boxGeometry";

/**
 * The box tool: drawn corner to corner, stretched by its corners and sides (the handles sit on the
 * edge marchers), moved from inside, and turned and flipped through its frame like every kind
 */
export const boxTool: ToolKind<BoxParams> = {
    shape: boxShape,
    params: BOX_PARAMS,
    scaling: "interval",
    ratioLock: true,
    draw: drawBox,
    handles(params, n) {
        const frame = boxFrame(params, n);
        return handleKeysOf(params, n).map((key) => ({
            key,
            at: boxHandlePoint(params, n, key),
            // The cursor faces the way the handle does, however the box is turned
            cursor: resizeCursor(
                frame,
                handleDirection(key, { halfWidth: 1, halfDepth: 1 }),
            ),
        }));
    },
    dragHandle: (base, n, key, to, env) =>
        stretchBox(base, n, key as BoxHandleKey, to, env),
    // An outline's spacings are each held as set, the other worked out (#459): no proportion lock
    ratioLockFor: (params) => boxDistribution(params).mode !== "outline",
    // A draw or a corner makes the spacings equal, a side flips the ratio lock for the drag; all
    // of them go from the center (#510). A Spread's handles reshape it with neither, and an
    // Outline's sides hold no ratio (`stretchBox`)
    honors: {
        draw: { constrain: "equalSpacings", fromCenter: "fromCenter" },
        handle: (key, ratioLocked, params, n) => {
            const corner = key.length === 2;
            const mode = boxDistribution(params).mode;
            if (
                mode === "spread" ||
                (mode === "outline" && n >= OUTLINE_MIN && !corner)
            )
                return { fromCenter: "fromCenter" };
            return {
                constrain: corner
                    ? "equalSpacings"
                    : ratioLocked
                      ? "freeRatio"
                      : "keepRatio",
                fromCenter: "fromCenter",
            };
        },
    },
    outline: boxCorners,
    snapPoints: (params, n) => [
        ...boxCorners(params, n),
        boxFrame(params, n).center,
    ],
    contains: insideBox,
    move: moveBox,
    frameOf: boxFrame,
    withFrame: (params, _n, frame) => withBoxFrame(params, frame),
    fromFrame: boxInFrame,
    settle: snapToGrid,
    closed: {
        modes: ["files", "outline", "spread"],
        region: boxRegion,
        intervals: (params) => ({ across: params.across, deep: params.deep }),
        distribution: boxDistribution,
        layouts: {
            catalogue: layoutCatalogue,
            resolved: (params, n) =>
                boxDistribution(params).mode === "files"
                    ? boxBlock(params, n)
                    : null,
        },
        evenOut: (params, n, env) => evenedOutline(params, n, env) ?? undefined,
        startMode: (params, n, mode) =>
            distributionFor(mode, filesOf(params), n),
        withDistribution(params, n, distribution, env) {
            // How recipes said it before the distributor goes: the distribution says it now
            const {
                pattern: _pattern,
                shortRank: _shortRank,
                shortRankAt: _shortRankAt,
                ...rest
            } = params;
            // A layout at a width it can't make the count with (a saved shape's family at the
            // drawn file count) is stored as its nearest version; one whose family can't make
            // the count at all is kept as asked, Short back standing in (#387)
            const resolved =
                distribution.mode === "files"
                    ? resolveLayout(distribution.layout, n)
                    : null;
            const filled =
                distribution.mode === "files" && resolved?.fellBack === null
                    ? { ...distribution, layout: resolved.layout }
                    : distribution;
            const was = boxDistribution(params).mode;
            // Into another mode, the drawn box stays (#439, #449)
            if (was !== filled.mode)
                return switched(params, rest, n, filled, env);
            if (filled.mode === "spread") {
                const next: BoxParams = { ...rest, distribution: filled };
                // Reshuffle and a typed seed: the same frame, another layout in it
                const before = boxDistribution(params);
                if (
                    before.mode === "spread" &&
                    (before.edge === true) === (filled.edge === true)
                )
                    return next;
                // Edge on or off (#450): the same frame, the interval refitted to it; what the
                // box remembers of its other modes stands, at the frame it has now
                return withEdgeIn(params, next, n, env);
            }
            const { spreadAspect: _aspect, ...flat } = rest;
            const next: BoxParams = { ...flat, distribution: filled };
            // The same mode laid out another way (a layout, a gap): it grows from the pivot
            return grownFromPivot(
                params,
                filled.mode === "files"
                    ? withFileCount(next, filled.layout.files)
                    : next,
                n,
                env,
            );
        },
    },
};

/**
 * `next` (the spread with its edge turned on or off, #450) in the frame `params` has, its interval
 * refitted (half a step at least); a box with no area keeps its interval. The frame it remembers
 * across mode switches stays, and the frame this change leaves is the one it last saw, so a
 * switch afterwards still finds Grid's and Outline's numbers.
 */
function withEdgeIn(
    params: BoxParams,
    next: BoxParams,
    n: number,
    env: ToolEnv,
): BoxParams {
    const fitted = spreadIn(frameSizeOf(params, n), next, n, env) ?? next;
    const memory = readMemory(params);
    return memory && sameSize(memory.seen, frameSizeOf(params, n))
        ? { ...fitted, modes: { ...memory, seen: frameSizeOf(fitted, n) } }
        : fitted;
}

/**
 * The box switched to `distribution`'s mode (#439, #449): its center and turn kept, and its size
 * fitted to the frame the designer drew or last shaped ({@link ModeMemory}), never to the frame
 * a switch left, so switching back and forth doesn't walk the box. A mode left since that frame
 * was drawn comes back with the numbers it had (Grid its file count and intervals, Outline its
 * sides, Spread its seed), so a round trip is the box it was.
 */
function switched(
    params: BoxParams,
    rest: BoxParams,
    n: number,
    distribution: Distribution,
    env: ToolEnv,
): BoxParams {
    const was = boxDistribution(params);
    const now = frameSizeOf(params, n);
    const memory = readMemory(params);
    const stands =
        memory !== undefined &&
        memory.count === n &&
        sameSize(memory.seen, now);
    const frame = stands ? memory.frame : now;
    const left = {
        ...(stands ? memory.left : {}),
        [was.mode]: leftAs(params, was),
    };
    const { spreadAspect: _aspect, ...flat } = rest;
    const back = left[distribution.mode];
    let next: BoxParams;
    if (back) next = { ...flat, ...back, center: params.center };
    else if (distribution.mode === "files")
        next = filesIn(
            frame,
            withFileCount({ ...flat, distribution }, distribution.layout.files),
            n,
            env,
        );
    else if (distribution.mode === "outline")
        next = outlineIn(
            frame,
            params,
            { ...flat, distribution },
            n,
            distribution,
            env,
        );
    else
        next =
            spreadIn(frame, { ...rest, distribution }, n, env) ??
            // A single rank or file has no frame to fill: it grows from the pivot
            grownFromPivot(params, { ...rest, distribution }, n, env);
    const modes: ModeMemory = {
        frame,
        seen: frameSizeOf(next, n),
        count: n,
        left,
    };
    return { ...next, modes };
}

/**
 * `next` (the box switched to Outline) in a frame `width` × `depth`, kept exactly (owner on
 * #458, #459): each spacing is its length over its gaps, even off the half steps (shown as about
 * so much until set), the split the one whose two spacings come nearest each other ({@link
 * keptOutline}). Under {@link OUTLINE_MIN} marchers it is a line, and a box with no area
 * (a single rank or file) keeps its intervals and goes round as wide (or deep) as it can.
 */
function outlineIn(
    { width, depth }: FrameSize,
    params: BoxParams,
    next: BoxParams,
    n: number,
    distribution: Extract<Distribution, { mode: "outline" }>,
    env: ToolEnv,
): BoxParams {
    if (n < OUTLINE_MIN) return withFileCount(next, Math.max(1, n));
    const side = distribution.oddGap.side;
    if (!(width > 0) || !(depth > 0)) {
        const aspect = width / params.across / (depth / params.deep);
        return withFileCount(next, nearestSides(n, aspect, side).a + 1);
    }
    // The frame kept exactly: across fits the width as typed, deep the depth (owner on #459)
    const { a, across, deep } = keptOutline(
        width,
        depth,
        n,
        side,
        halfStep(env),
    );
    return { ...withFileCount(next, a + 1), across, deep };
}
