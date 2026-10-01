import type { Resolver } from "@openmarch/core";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import { beatAtTime, timeAtBeat, type BeatTiming } from "./timeMap";

/**
 * Keyframe export from the resolver (spec §11, docs/timeline/phases/07-page-parity.md P7.9).
 *
 * Keyframes (a time plus coordinates, with linear interpolation between them) are the wire format
 * for a player that doesn't include the resolver. They are produced FROM the resolver and are
 * never read back into the editor as state (D-2): nothing here writes to the database, the store
 * or the canvas, and no editor code imports the result.
 *
 * For each marcher the generator emits:
 *
 * 1. a keyframe at every span boundary (R-2): the start and end beat of each span, plus the start
 *    and the end of the show. The leading and trailing holds have no finite outer edge, so the
 *    show's start (beat 1, show time 0) and end (beat `beats.length`) stand in for it;
 * 2. extra keyframes inside every move span (anything but a hold), found by bisecting the span in
 *    show time until linear interpolation between adjacent keyframes stays, at 7 probe points
 *    per piece (a sampled bound, not a proof between the probes), within
 *    {@link DEFAULT_KEYFRAME_TOLERANCE} of the resolver (or `options.tolerance`). Bisecting in
 *    time, not beats, accounts for tempo changes: the player interpolates in time.
 *
 * Positions are continuous at span boundaries (P-1), so one keyframe per boundary is exact.
 * Beat 0 is the app's zero-length beat and shares show time 0 with beat 1 (see `timeMap.ts`), so
 * the export starts at beat 1.
 *
 * Coordinates are rounded to `Float32` by default (`Math.fround`): a player gains nothing from
 * more, and §10.1's `Float64` requirement is for the resolver's own state. The rounding adds at
 * most `2^-24 * |coordinate|` to the error; the resolver itself is never rounded.
 */

/** The default chord-error tolerance, in field units (a fifth of a step is far under a pixel). */
export const DEFAULT_KEYFRAME_TOLERANCE = 0.01;

/**
 * At most 2^MAX_DEPTH pieces per span; a guard for pathological input, not a quality knob. When
 * a piece hits it with error above the tolerance, the excess is reported as
 * `maxErrorAboveTolerance` and logged.
 */
const MAX_DEPTH = 14;

/** Where in a piece the chord error is probed (the ends are keyframes and exact). */
const PROBES = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;

/**
 * The probes for drawn paths (`sampleMarcherPath`): fewer, since a path is drawn on every page
 * change. Count seeding there catches zig-zags whose corners these would straddle.
 */
const PATH_PROBES = [0.25, 0.5, 0.75] as const;

/** One keyframe: a show time in seconds and a position in field units. */
export interface ExportKeyframe {
    time: number;
    x: number;
    y: number;
}

export interface MarcherKeyframes {
    marcherId: number;
    /** Ascending by `time`, strictly increasing */
    keyframes: ExportKeyframe[];
    /**
     * How far above the tolerance the worst probe is where bisection hit the depth cap. 0 when
     * every piece met the tolerance (the normal case).
     */
    maxErrorAboveTolerance: number;
}

export interface KeyframeExportOptions {
    /** The largest allowed chord error, in field units. Defaults to 0.01. */
    tolerance?: number;
    /** Round coordinates to Float32. Defaults to true. */
    float32?: boolean;
    /** Bisection depth cap, for tests; defaults to 14 (at most 2^14 pieces per span) */
    maxDepth?: number;
}

/**
 * Builds every marcher's keyframes from the resolver.
 *
 * @param resolver a ready resolver for the show
 * @param beats the show's beats, ascending by position, with cumulative timestamps (seconds)
 * @returns one entry per marcher, in `resolver.marcherIds()` order; empty when there are no beats
 */
export function buildKeyframes(
    resolver: Pick<Resolver, "marcherIds" | "positionAt" | "spanInfos">,
    beats: readonly BeatTiming[],
    options: KeyframeExportOptions = {},
): MarcherKeyframes[] {
    if (beats.length === 0) return [];
    const tolerance = options.tolerance ?? DEFAULT_KEYFRAME_TOLERANCE;
    if (!(tolerance > 0)) throw new RangeError("tolerance must be positive");
    const round = options.float32 === false ? (n: number) => n : Math.fround;

    const maxDepth = options.maxDepth ?? MAX_DEPTH;
    const result = resolver.marcherIds().map((marcherId) => {
        const { keyframes, excess } = marcherKeyframes(
            resolver,
            beats,
            marcherId,
            tolerance,
            round,
            maxDepth,
        );
        return { marcherId, keyframes, maxErrorAboveTolerance: excess };
    });
    const worst = Math.max(0, ...result.map((m) => m.maxErrorAboveTolerance));
    if (worst > 0)
        console.warn(
            `Keyframe export: the depth cap was hit; chord error is up to ${worst} above the ${tolerance} tolerance`,
        );
    return result;
}

function marcherKeyframes(
    resolver: Pick<Resolver, "positionAt" | "spanInfos">,
    beats: readonly BeatTiming[],
    marcherId: number,
    tolerance: number,
    round: (n: number) => number,
    maxDepth: number,
): { keyframes: ExportKeyframe[]; excess: number } {
    const firstBeat = Math.min(1, beats.length);
    const lastBeat = beats.length;
    const spans = resolver.spanInfos(marcherId);

    const boundaries = new Set<number>([firstBeat, lastBeat]);
    for (const span of spans)
        for (const edge of [span.start, span.end])
            if (Number.isFinite(edge) && edge > firstBeat && edge < lastBeat)
                boundaries.add(edge);
    const sorted = [...boundaries].sort((a, b) => a - b);

    const at = (beat: number): [number, number] => {
        const [x, y] = resolver.positionAt(marcherId, beat);
        return [x, y];
    };
    const frame = (time: number, p: [number, number]): ExportKeyframe => ({
        time,
        x: round(p[0]),
        y: round(p[1]),
    });

    const out: ExportKeyframe[] = [];
    let excess = 0;
    let prevBeat = sorted[0]!;
    let prevTime = timeAtBeat(beats, prevBeat);
    let prevPos = at(prevBeat);
    out.push(frame(prevTime, prevPos));

    for (let i = 1; i < sorted.length; i++) {
        const beat = sorted[i]!;
        const time = timeAtBeat(beats, beat);
        // Beats that share a show time (a zero-length beat) leave nothing to interpolate across
        if (!(time > prevTime)) continue;
        const pos = at(beat);

        // The interval lies inside one span (every span edge is a boundary); a hold is constant
        const from = prevBeat;
        const span = spans.find((s) => s.start <= from && from < s.end);
        if (span && span.kind !== "hold") {
            const over = subdivide(
                (t) => at(beatAtTime(beats, t)),
                prevTime,
                prevPos,
                time,
                pos,
                tolerance,
                0,
                maxDepth,
                (t, p) => out.push(frame(t, p)),
            );
            excess = Math.max(excess, over);
        }
        out.push(frame(time, pos));
        prevBeat = beat;
        prevTime = time;
        prevPos = pos;
    }
    return { keyframes: out, excess };
}

/** One marcher's path between two beats, as a polyline (see {@link sampleMarcherPath}). */
export interface MarcherPathSample {
    /**
     * The polyline, from the position at `fromBeat` to the one at `toBeat`, with consecutive
     * repeats (holds) removed; a single point when the marcher doesn't move
     */
    points: [number, number][];
    /** As in {@link MarcherKeyframes}: 0 unless the depth cap left a piece above the tolerance */
    maxErrorAboveTolerance: number;
    /**
     * The stride of the fastest moving stretch: the largest sampled length per beat over the
     * marcher's non-hold spans clipped to the range. 0 when the marcher holds throughout.
     */
    stride: number;
}

/**
 * Samples one marcher's path between two beats as a polyline whose chords stay within
 * `tolerance` of the resolver's path: the span-edge keyframes and probe-based bisection of
 * {@link buildKeyframes}, but in beats rather than show time (a drawn path has no time axis),
 * with 3 probes per piece instead of 7, and with a moving span cut at every whole count first
 * when any count leaves its chord (so zig-zags with corners on the counts aren't straddled).
 * Arcs and follow-the-leader moves come back curved; a direct move is just its two ends.
 *
 * @param fromBeat the start beat; must be below `toBeat`
 */
export function sampleMarcherPath(
    resolver: Pick<Resolver, "positionAt" | "spanInfos">,
    marcherId: number,
    fromBeat: number,
    toBeat: number,
    options: Pick<KeyframeExportOptions, "tolerance" | "maxDepth"> = {},
): MarcherPathSample {
    if (!(fromBeat < toBeat))
        throw new RangeError("fromBeat must be below toBeat");
    const tolerance = options.tolerance ?? DEFAULT_KEYFRAME_TOLERANCE;
    if (!(tolerance > 0)) throw new RangeError("tolerance must be positive");
    const maxDepth = options.maxDepth ?? MAX_DEPTH;

    const spans = resolver.spanInfos(marcherId);
    const edges = new Set<number>([fromBeat, toBeat]);
    for (const span of spans)
        for (const edge of [span.start, span.end])
            if (edge > fromBeat && edge < toBeat) edges.add(edge);
    const sorted = [...edges].sort((a, b) => a - b);

    const at = (beat: number): [number, number] => {
        const [x, y] = resolver.positionAt(marcherId, beat);
        return [x, y];
    };
    const all: [number, number][] = [];
    const emit = (_beat: number, p: [number, number]) => {
        all.push(p);
    };

    let excess = 0;
    let stride = 0;
    let prevBeat = sorted[0]!;
    let prevPos = at(prevBeat);
    emit(prevBeat, prevPos);
    for (let i = 1; i < sorted.length; i++) {
        const beat = sorted[i]!;
        const pos = at(beat);
        const from = prevBeat;
        const span = spans.find((s) => s.start <= from && from < s.end);
        if (span && span.kind !== "hold") {
            // The interval is one span clipped to the range (span edges are boundaries)
            const first = all.length - 1;
            const pieces = countSeeds(at, from, prevPos, beat, pos, tolerance);
            let a = from;
            let pa = prevPos;
            for (const [b, pb] of pieces) {
                excess = Math.max(
                    excess,
                    subdivide(
                        at,
                        a,
                        pa,
                        b,
                        pb,
                        tolerance,
                        0,
                        maxDepth,
                        emit,
                        PATH_PROBES,
                    ),
                );
                if (b !== beat) emit(b, pb);
                a = b;
                pa = pb;
            }
            all.push(pos);
            stride = Math.max(
                stride,
                polylineLength(all, first) / (beat - from),
            );
            all.pop();
        }
        emit(beat, pos);
        prevBeat = beat;
        prevPos = pos;
    }

    const points: [number, number][] = [];
    for (const p of all) {
        const last = points[points.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
    }
    return { points, maxErrorAboveTolerance: excess, stride };
}

/** The length of `points` from index `from` to the end, as a polyline. */
function polylineLength(points: readonly [number, number][], from: number) {
    let length = 0;
    for (let i = from + 1; i < points.length; i++)
        length += Math.hypot(
            points[i]![0] - points[i - 1]![0],
            points[i]![1] - points[i - 1]![1],
        );
    return length;
}

/**
 * The pieces to bisect a moving span `[a, b]` in, as their end beats and positions (the last is
 * `b`). A span that leaves the chord at a whole count is cut at every whole count inside it, so a
 * zig-zag with corners on the counts, which the 7 probes of one piece can straddle, isn't missed;
 * otherwise the span is one piece. The check costs one position per whole count.
 */
function countSeeds(
    at: (beat: number) => [number, number],
    a: number,
    pa: [number, number],
    b: number,
    pb: [number, number],
    tolerance: number,
): [number, [number, number]][] {
    const seeds: [number, [number, number]][] = [];
    for (let k = Math.floor(a) + 1; k < b; k++) seeds.push([k, at(k)]);
    const offChord = seeds.some(
        ([, p]) => distanceToSegment(p, pa, pb) > tolerance,
    );
    return offChord ? [...seeds, [b, pb]] : [[b, pb]];
}

function distanceToSegment(
    p: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t =
        len2 === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2),
              );
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Emits the keyframes strictly between `t0` and `t1` (in order) that bring the chord error of the
 * piece within `tolerance`, by bisecting at the midpoint while any probe is too far off.
 *
 * @param probes where in each piece to measure the chord error; the position at 0.5, when
 * probed, is reused as the bisection point
 */
function subdivide(
    evalAt: (time: number) => [number, number],
    t0: number,
    p0: [number, number],
    t1: number,
    p1: [number, number],
    tolerance: number,
    depth: number,
    maxDepth: number,
    emit: (time: number, p: [number, number]) => void,
    probes: readonly number[] = PROBES,
): number {
    let worst = 0;
    let half: [number, number] | null = null;
    for (const f of probes) {
        const p = evalAt(t0 + f * (t1 - t0));
        if (f === 0.5) half = p;
        const error = Math.hypot(
            p[0] - (p0[0] + f * (p1[0] - p0[0])),
            p[1] - (p0[1] + f * (p1[1] - p0[1])),
        );
        if (error > worst) worst = error;
    }
    if (worst <= tolerance) return 0;

    const tm = t0 + 0.5 * (t1 - t0);
    if (depth >= maxDepth || !(tm > t0 && tm < t1)) return worst - tolerance;
    const pm = half ?? evalAt(tm);
    const next = (
        a: number,
        pa: [number, number],
        b: number,
        pb: [number, number],
    ) =>
        subdivide(
            evalAt,
            a,
            pa,
            b,
            pb,
            tolerance,
            depth + 1,
            maxDepth,
            emit,
            probes,
        );
    const left = next(t0, p0, tm, pm);
    emit(tm, pm);
    const right = next(tm, pm, t1, p1);
    return Math.max(left, right);
}

/**
 * The position a player would show at `time`: linear interpolation between the surrounding
 * keyframes, clamped to the first and last. Null for no keyframes.
 */
export function interpolateKeyframes(
    keyframes: readonly ExportKeyframe[],
    time: number,
): { x: number; y: number } | null {
    const n = keyframes.length;
    if (n === 0) return null;
    if (time <= keyframes[0]!.time) return pick(keyframes[0]!);
    if (time >= keyframes[n - 1]!.time) return pick(keyframes[n - 1]!);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (keyframes[mid]!.time <= time) lo = mid;
        else hi = mid;
    }
    const a = keyframes[lo]!;
    const b = keyframes[hi]!;
    const f = (time - a.time) / (b.time - a.time);
    return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
}

const pick = (k: ExportKeyframe) => ({ x: k.x, y: k.y });

/**
 * The keyframes in the page-mode `MarcherTimeline` shape (milliseconds, plain coordinates), for a
 * consumer that already reads that format, such as an exporter. Keys are rounded to whole
 * milliseconds, so two keyframes less than 1 ms apart merge into one key (the later wins).
 * Straight chords only: there are
 * no `path` entries. Export data only; never feed it back as state (D-2).
 */
export function keyframesToMarcherTimelines(
    marchers: readonly MarcherKeyframes[],
): Map<number, MarcherTimeline> {
    const timelines = new Map<number, MarcherTimeline>();
    for (const { marcherId, keyframes } of marchers) {
        const pathMap: MarcherTimeline["pathMap"] = new Map();
        for (const k of keyframes)
            pathMap.set(Math.round(k.time * 1000), { x: k.x, y: k.y });
        timelines.set(marcherId, {
            pathMap,
            sortedTimestamps: [...pathMap.keys()].sort((a, b) => a - b),
        });
    }
    return timelines;
}

/** The export as JSON text: `{ tolerance, marchers: [{ marcherId, keyframes: [[t, x, y], ...] }] }`. */
export function keyframesToJson(
    marchers: readonly MarcherKeyframes[],
    tolerance = DEFAULT_KEYFRAME_TOLERANCE,
): string {
    return JSON.stringify({
        format: "openmarch-keyframes",
        version: 1,
        tolerance,
        maxErrorAboveTolerance: Math.max(
            0,
            ...marchers.map((m) => m.maxErrorAboveTolerance),
        ),
        marchers: marchers.map((m) => ({
            marcherId: m.marcherId,
            keyframes: m.keyframes.map((k) => [k.time, k.x, k.y]),
        })),
    });
}
