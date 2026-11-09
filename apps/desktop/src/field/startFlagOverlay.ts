import type { FieldProperties, Resolver } from "@openmarch/core";
import { SELECTION_RGBA01 } from "./three/selectionRing";
import { markerShapeOf, type MarkerShape } from "./markerShape";
import type {
    StartFlagLevel,
    StartFlagLevels,
} from "@/timeline/startFlagLevels";
import {
    evaluatePathWarning,
    STEP_SIZE_WARNING_COLOR,
    STEP_SIZE_WARNING_STROKE_WIDTH,
    WARNING_PATHWAY_DASH,
} from "@/timeline/stepSizeWarning";
import {
    PATH_DRAW_TOLERANCE,
    sampleTimelinePath,
    sampleTimelinePathStretches,
} from "@/timeline/timelinePaths";
import {
    rgbaOf,
    type DotPlan,
    type OverlayPlan,
    type Rgba,
    type StrokePlan,
} from "./timelineOverlays";

/**
 * Start flag positions (fork #331): what the field draws for where marchers are at the start
 * flag (S) and how they walk from there to the playhead (P). Renderer-independent, like the other
 * timeline overlay plans.
 */

/**
 * Marchers are drawn with radius 5 field units; a dot is a third of that across, in the marcher's
 * shape (`markerShape.ts`).
 */
export const START_FLAG_DOT_RADIUS = 5 / 3;
/** Solid black: the field stays white in the dark theme too. */
export const START_FLAG_DOT_COLOR: Rgba = [0, 0, 0, 1];

/** A thin gray line, the same on screen at any zoom. */
export const START_FLAG_PATH_WIDTH = 1;
export const START_FLAG_PATH_COLOR: Rgba = [0.5, 0.5, 0.5, 1];

/**
 * Route squares (holds decision 9, fork #479): on a selected marcher's drawn route, a small square
 * at each spot where a coordinate is set, the way After Effects draws a motion path. In field
 * units, like the dots: a little wider than a dot, so a dot on a set spot sits inside its square.
 * Outlined in the selection blue, since only selected marchers get them, with a white inside that
 * keeps them visible on a green field (owner, 2026-10-30, from the research in fork #521).
 */
export const ROUTE_SQUARE_SIZE = 4.5;
export const ROUTE_SQUARE_OUTLINE = 0.75;
const [selR, selG, selB] = SELECTION_RGBA01 as [number, number, number];
export const ROUTE_SQUARE_COLOR: Rgba = [selR, selG, selB, 1];
export const ROUTE_SQUARE_FILL: Rgba = [1, 1, 1, 1];

/**
 * Where a selected marcher came from (owner, 2026-10-29): the last move it started before the
 * start flag, drawn behind S dotted and lighter than the route, with lighter squares at its set
 * spots. Shown even when the marcher stands still at S. Screen pixels, like the route.
 */
export const ROUTE_TAIL_COLOR: Rgba = [0.75, 0.75, 0.75, 1];
export const ROUTE_TAIL_DASH: readonly [number, number] = [2, 4];
/** The selection blue, 55% of the way to white. */
const towardWhite = (c: number) => c + (1 - c) * 0.55;
export const ROUTE_TAIL_SQUARE_COLOR: Rgba = [
    towardWhite(selR),
    towardWhite(selG),
    towardWhite(selB),
    1,
];

export type StartFlagOverlayInput = {
    readonly resolver: Pick<
        Resolver,
        "positionAt" | "spanInfos" | "marcherIds"
    >;
    /** The marchers on the field, in draw order */
    readonly marcherIds: readonly number[];
    /** The selected marchers, for the "selected" level */
    readonly selectedIds: ReadonlySet<number>;
    /** The start flag (S) */
    readonly fromBeat: number;
    /** The playhead (P) */
    readonly toBeat: number;
    /** The levels in effect; paths wider than dots are clamped to the dots level */
    readonly levels: StartFlagLevels;
    readonly stepSizeWarnings: boolean;
    readonly fieldProperties: FieldProperties;
    /**
     * A marcher's Set beats (`marcherSetBeats`: the ends of its own moves, the timeline's
     * keyframes), for the squares on the selected marchers' routes. Without it, no squares.
     */
    readonly setBeatsOf?: (marcherId: number) => readonly number[];
    /** A marcher's shape, so its dot is drawn in it (`markerShape.ts`); circles without it. */
    readonly shapeOf?: (marcherId: number) => MarkerShape;
};

/**
 * Two plans, as a plan has one unit system. `dots` is in field units (it scales with the zoom):
 * the red dashed step-size warning stretches, drawn under the dots, with the same width and dash
 * as the next paths' warnings. `paths` is in screen pixels: the calm 1 px gray routes.
 */
export type StartFlagOverlay = {
    readonly dots: OverlayPlan;
    readonly paths: OverlayPlan;
};

/** The window and drawing inputs every marcher shares. */
export type StartFlagWindow = Omit<
    StartFlagOverlayInput,
    "marcherIds" | "selectedIds" | "levels" | "setBeatsOf" | "shapeOf"
>;

/** One marcher's share of the overlay. */
export type StartFlagMarcherPlan = {
    /** Where it is at the start flag */
    readonly dot: DotPlan;
    /** Its route's calm stretches (screen units); empty when its path isn't drawn */
    readonly paths: readonly StrokePlan[];
    /** Its route's too-fast stretches (field units); empty when its path isn't drawn */
    readonly warnings: readonly StrokePlan[];
    /**
     * A square at each set spot on its route (field units, drawn over the warnings and under the
     * dots); empty when its path isn't drawn or no Set beats were given
     */
    readonly squares: readonly StrokePlan[];
    /**
     * The move it came from, behind the start flag (screen units, dotted and light); empty unless
     * it has squares
     */
    readonly tail: readonly StrokePlan[];
};

/** Whether a level draws for this marcher. */
export const levelDraws = (
    level: StartFlagLevel,
    marcherId: number,
    selectedIds: ReadonlySet<number>,
): boolean =>
    level === "all" || (level === "selected" && selectedIds.has(marcherId));

type OverlayResolver = StartFlagOverlayInput["resolver"];

/** The resolver's marcher ids as a set, per id list (a new list each time marchers change). */
const knownIdSets = new WeakMap<readonly number[], ReadonlySet<number>>();
function knows(resolver: OverlayResolver, marcherId: number): boolean {
    const ids = resolver.marcherIds();
    let known = knownIdSets.get(ids);
    if (!known) {
        known = new Set(ids);
        knownIdSets.set(ids, known);
    }
    return known.has(marcherId);
}

/**
 * Whether the marcher's position changes anywhere in `[fromBeat, toBeat]`, given where it is at
 * `fromBeat`. Cheap for the common cases: different ends, or only holds in the window; a move
 * that comes back to where it started is sampled.
 */
function movesWithin(
    resolver: OverlayResolver,
    marcherId: number,
    [x0, y0]: readonly [number, number],
    fromBeat: number,
    toBeat: number,
): boolean {
    const [x1, y1] = resolver.positionAt(marcherId, toBeat);
    if (x0 !== x1 || y0 !== y1) return true;
    const moving = resolver
        .spanInfos(marcherId)
        .some((s) => s.kind !== "hold" && s.start < toBeat && s.end > fromBeat);
    if (!moving) return false;
    const path = sampleTimelinePath(
        resolver,
        marcherId,
        fromBeat,
        toBeat,
        PATH_DRAW_TOLERANCE,
    );
    return path !== null && path.points.length > 1;
}

const calmStroke = (points: StrokePlan["points"]): StrokePlan => ({
    points,
    color: START_FLAG_PATH_COLOR,
    width: START_FLAG_PATH_WIDTH,
    dash: null,
    round: true,
});

const warningStroke = (points: StrokePlan["points"]): StrokePlan => ({
    points,
    color: rgbaOf(STEP_SIZE_WARNING_COLOR),
    width: STEP_SIZE_WARNING_STROKE_WIDTH,
    dash: [WARNING_PATHWAY_DASH[0]!, WARNING_PATHWAY_DASH[1]!],
    round: false,
});

type Route = { paths: StrokePlan[]; warnings: StrokePlan[] };

/** The marcher's route over the window as one gray stroke; none when it doesn't move. */
function calmRoute(window: StartFlagWindow, marcherId: number): Route {
    const path = sampleTimelinePath(
        window.resolver,
        marcherId,
        window.fromBeat,
        window.toBeat,
        PATH_DRAW_TOLERANCE,
    );
    return {
        paths: path && path.points.length > 1 ? [calmStroke(path.points)] : [],
        warnings: [],
    };
}

/**
 * The marcher's route over the window, with each stretch over the step-size threshold red and
 * dashed and the rest gray; neighboring stretches of the same kind share a stroke. None when it
 * doesn't move.
 */
function warnedRoute(window: StartFlagWindow, marcherId: number): Route {
    const stretches = sampleTimelinePathStretches(
        window.resolver,
        marcherId,
        window.fromBeat,
        window.toBeat,
        PATH_DRAW_TOLERANCE,
    );
    const runs: { warning: boolean; points: { x: number; y: number }[] }[] = [];
    for (const stretch of stretches) {
        if (stretch.points.length < 2) continue;
        const warning = evaluatePathWarning({
            start: stretch.points[0]!,
            end: stretch.points[stretch.points.length - 1]!,
            distance: stretch.stride,
            counts: 1,
            fieldProperties: window.fieldProperties,
            pathEnabled: true,
            allowForceShow: false,
            warningsEnabled: true,
        }).isWarning;
        const last = runs[runs.length - 1];
        if (last && last.warning === warning)
            // Stretches meet end to end: skip the shared point
            last.points.push(...stretch.points.slice(1));
        else runs.push({ warning, points: [...stretch.points] });
    }
    const route: Route = { paths: [], warnings: [] };
    for (const run of runs)
        if (run.warning) route.warnings.push(warningStroke(run.points));
        else route.paths.push(calmStroke(run.points));
    return route;
}

/**
 * A filled square centered on `(x, y)`: one butt-capped segment as wide as it is long.
 */
const filledSquare = (
    x: number,
    y: number,
    size: number,
    color: Rgba,
): StrokePlan => ({
    points: [
        { x: x - size / 2, y },
        { x: x + size / 2, y },
    ],
    color,
    width: size,
    dash: null,
    round: false,
});

/**
 * The squares on a marcher's route over the window: one at each Set beat in `[fromBeat, toBeat]`.
 * The start flag gets one only when a coordinate is set on that count (a move end, or home):
 * standing there on a spot set earlier doesn't count (owner, 2026-10-29). Each is an outline square with a white one inside.
 */
function routeSquares(
    window: StartFlagWindow,
    marcherId: number,
    setBeats: readonly number[],
): StrokePlan[] {
    const { resolver, fromBeat, toBeat } = window;
    const beats = setBeats.filter((b) => b >= fromBeat && b <= toBeat);
    // Home is always set (`isSetAt`), though no move ends there
    if (fromBeat === 0 && beats[0] !== 0) beats.unshift(0);
    return beats.flatMap((beat) =>
        outlinedSquare(
            resolver.positionAt(marcherId, beat),
            ROUTE_SQUARE_COLOR,
        ),
    );
}

/** An outline square with a white one inside it, centered on `[x, y]`. */
function outlinedSquare([x, y]: readonly [number, number], color: Rgba) {
    const inner = ROUTE_SQUARE_SIZE - 2 * ROUTE_SQUARE_OUTLINE;
    return [
        filledSquare(x, y, ROUTE_SQUARE_SIZE, color),
        filledSquare(x, y, inner, ROUTE_SQUARE_FILL),
    ];
}

/**
 * Where the marcher came from: the last move it started before the start flag, from that move's
 * start up to the start flag (or the move's end, when it arrived before it), dotted and light,
 * with a light square where it left from and one where it arrived before the start flag. Empty
 * when no move starts before the start flag.
 */
function routeTail(
    window: StartFlagWindow,
    marcherId: number,
    setBeats: readonly number[],
): { tail: StrokePlan[]; squares: StrokePlan[] } {
    const { resolver, fromBeat } = window;
    let from: number | null = null;
    let to = 0;
    for (const span of resolver.spanInfos(marcherId))
        if (
            span.kind !== "hold" &&
            Number.isFinite(span.start) &&
            span.start < fromBeat &&
            (from === null || span.start > from)
        ) {
            from = span.start;
            to = Math.min(span.end, fromBeat);
        }
    if (from === null) return { tail: [], squares: [] };
    const path = sampleTimelinePath(
        resolver,
        marcherId,
        from,
        to,
        PATH_DRAW_TOLERANCE,
    );
    if (!path || path.points.length < 2) return { tail: [], squares: [] };
    const spots = [from, ...setBeats.filter((b) => b > from && b < fromBeat)];
    return {
        tail: [
            {
                points: path.points,
                color: ROUTE_TAIL_COLOR,
                width: START_FLAG_PATH_WIDTH,
                dash: ROUTE_TAIL_DASH,
                round: true,
            },
        ],
        squares: spots.flatMap((beat) =>
            outlinedSquare(
                resolver.positionAt(marcherId, beat),
                ROUTE_TAIL_SQUARE_COLOR,
            ),
        ),
    };
}

/** Home (beat 0) has no window, and neither does S at or past P. */
const emptyWindow = ({ fromBeat, toBeat }: StartFlagWindow) =>
    !(fromBeat < toBeat) || toBeat <= 0;

/**
 * One marcher's start flag position over the window: its dot where it is at the start flag and,
 * with `withPath`, the route it walks to the playhead as the resolver samples it, with a square
 * at each of `setBeats` on it (pass them for a selected marcher only). `null` when it doesn't
 * move across the window, the window is empty, or the resolver doesn't know it yet (marcher rows
 * ahead of a resolver rebuild).
 */
export function planStartFlagMarcher(
    window: StartFlagWindow,
    marcherId: number,
    withPath: boolean,
    setBeats: readonly number[] | null = null,
): StartFlagMarcherPlan | null {
    const { resolver, fromBeat, toBeat } = window;
    if (emptyWindow(window) || !knows(resolver, marcherId)) return null;
    const start = resolver.positionAt(marcherId, fromBeat);
    let route: Route = { paths: [], warnings: [] };
    if (withPath) {
        route = window.stepSizeWarnings
            ? warnedRoute(window, marcherId)
            : calmRoute(window, marcherId);
        if (route.paths.length === 0 && route.warnings.length === 0)
            return null;
    } else if (!movesWithin(resolver, marcherId, start, fromBeat, toBeat))
        return null;
    return {
        dot: {
            x: start[0],
            y: start[1],
            radius: START_FLAG_DOT_RADIUS,
            fill: START_FLAG_DOT_COLOR,
            stroke: null,
            strokeWidth: 0,
        },
        ...route,
        ...(withPath && setBeats
            ? (() => {
                  const behind = routeTail(window, marcherId, setBeats);
                  return {
                      // Behind the start flag first, so the route draws over it
                      squares: [
                          ...behind.squares,
                          ...routeSquares(window, marcherId, setBeats),
                      ],
                      tail: behind.tail,
                  };
              })()
            : { squares: [], tail: [] }),
    };
}

/** The marcher's share with its dot in `shape` (`markerShape.ts`): a circle when markers don't follow shapes. */
export function inShape(
    plan: StartFlagMarcherPlan,
    shape: MarkerShape | undefined,
): StartFlagMarcherPlan {
    const drawn = markerShapeOf(shape);
    return drawn === "circle"
        ? plan
        : { ...plan, dot: { ...plan.dot, shape: drawn } };
}

/** The overlay's two plans from each drawn marcher's share, in draw order. */
export function startFlagOverlayOf(
    marchers: Iterable<StartFlagMarcherPlan>,
): StartFlagOverlay {
    const dots: DotPlan[] = [];
    const paths: StrokePlan[] = [];
    const warnings: StrokePlan[] = [];
    const squares: StrokePlan[] = [];
    const tails: StrokePlan[] = [];
    for (const marcher of marchers) {
        dots.push(marcher.dot);
        tails.push(...marcher.tail);
        paths.push(...marcher.paths);
        warnings.push(...marcher.warnings);
        squares.push(...marcher.squares);
    }
    return {
        dots: {
            units: "field",
            strokes: [...warnings, ...squares],
            dots,
            labels: [],
        },
        paths: {
            units: "screen",
            strokes: [...tails, ...paths],
            dots: [],
            labels: [],
        },
    };
}

/**
 * Start flag positions over the window `[fromBeat, toBeat)`: a dot where each marcher the dots
 * level covers is at the start flag, and, for those the paths level covers too, the route it
 * walks to the playhead as the resolver samples it (curves and several moves included), with
 * squares at the set spots of the selected marchers' routes (`setBeatsOf`). Marchers who don't
 * move across the window get neither. Empty plans at home or when S isn't before P.
 */
export function planStartFlagOverlay(
    input: StartFlagOverlayInput,
): StartFlagOverlay {
    const { selectedIds, levels } = input;
    const marchers: StartFlagMarcherPlan[] = [];
    if (!emptyWindow(input))
        for (const marcherId of input.marcherIds) {
            // A path only where its dot is drawn: paths never go wider than dots
            if (!levelDraws(levels.dots, marcherId, selectedIds)) continue;
            const marcher = planStartFlagMarcher(
                input,
                marcherId,
                levelDraws(levels.paths, marcherId, selectedIds),
                selectedIds.has(marcherId)
                    ? (input.setBeatsOf?.(marcherId) ?? null)
                    : null,
            );
            if (marcher)
                marchers.push(inShape(marcher, input.shapeOf?.(marcherId)));
        }
    return startFlagOverlayOf(marchers);
}
