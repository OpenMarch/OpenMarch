/**
 * The exact-path converter (spec EP-C, ADR 0018 §8, exact-path step 2): resolved motion turned
 * into exact paths, one per marcher per span that moves. It reads R-20's drawable walked paths,
 * so it covers whatever R-20 covers, and never changes a position.
 *
 * Shapes come from R-20's segments (EP-C2). Timing keys are chosen so the exact path, played as
 * EP-R says, stays within the tolerance of R-20's walk at every moment (EP-C3, EP-C4): the walk's
 * distance along the path is sampled at every tick and at every place its speed may change, and
 * keys are kept only where that distance would otherwise drift by more than the key budget
 * ({@link keyBudget}): the tolerance less a margin and less R-20's own gap to the resolver.
 */
import { S_MIN } from "./geom";
import {
    EXACT_MIN_LENGTH,
    TICKS_PER_BEAT,
    exactPieces,
    measureCubic,
    type ExactKey,
    type ExactPath,
    type ExactShape,
} from "./exactPath";
import type { Beat, SpanInfo, TimelineSnapshot, XY } from "./types";
import {
    WALKED_SAMPLE_TOLERANCE,
    createWalkedPaths,
    walkedCubicParamAt,
    type WalkResolver,
    type WalkedArc,
    type WalkedSegment,
} from "./walkedPath";

/** EP-C4: 1/100 of an 8-to-5 step on the default field, in field units. */
export const EXACT_DEFAULT_TOLERANCE = S_MIN / 100;

/** One exact path of the converter (EP-C1): one marcher, one span that moves. */
export interface ExactMove {
    marcherId: number;
    transitionId: number;
    /** The span's first beat: tick 0 */
    start: Beat;
    /** The span's last beat */
    end: Beat;
    path: ExactPath;
}

export interface ExactPathsOptions {
    /** EP-C4, field units; {@link EXACT_DEFAULT_TOLERANCE} by default */
    tolerance?: number;
    /** Only these marchers; every marcher of the resolver by default */
    marcherIds?: readonly number[];
}

/**
 * How far R-20's walk may be from the resolver (R-20 item 7, QA-WP-15): a polyline's points are
 * within half of `WALKED_SAMPLE_TOLERANCE`; lines, arcs and cubics within 1e-3.
 */
const WALKED_POLYLINE_GAP = WALKED_SAMPLE_TOLERANCE / 2;
const WALKED_EXACT_GAP = 1e-3;

/**
 * EP-C3: how far the keyed distance may drift from the walk's: 90% of the tolerance, less R-20's
 * own gap to the resolver for the kinds of segment the path has.
 */
export function keyBudget(
    segments: readonly WalkedSegment[],
    tolerance: number,
): number {
    const walked = segments.some((s) => s.kind === "polyline")
        ? WALKED_POLYLINE_GAP
        : WALKED_EXACT_GAP;
    return Math.max(tolerance * 0.9 - walked, tolerance * 0.1);
}

/** EP-C2: an R-20 arc's bend (signed sagitta over chord, apex side by the +90° normal). */
export function bendOfWalkedArc(seg: WalkedArc): number {
    const { from, to, center, radius, startAngle, sweep } = seg;
    const k = Math.tan(Math.abs(sweep) / 4) / 2;
    const a = startAngle + sweep / 2;
    const apex: XY = [
        center[0] + radius * Math.cos(a),
        center[1] + radius * Math.sin(a),
    ];
    const M: XY = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    // n = chord direction turned +90°: (-dy, dx)
    const side =
        (apex[0] - M[0]) * -(to[1] - from[1]) +
        (apex[1] - M[1]) * (to[0] - from[0]);
    return side >= 0 ? k : -k;
}

/** EP-C2: the shapes for R-20's segments, consecutive lines and polylines merged into points. */
function shapesOf(segments: readonly WalkedSegment[]): ExactShape[] {
    const out: ExactShape[] = [];
    const points = (pts: XY[]) => {
        const last = out[out.length - 1];
        if (last?.kind === "points") last.points.push(...pts);
        else out.push({ kind: "points", points: pts });
    };
    for (const seg of segments) {
        switch (seg.kind) {
            case "line":
                points([seg.to]);
                break;
            case "polyline":
                points(seg.points.slice(1));
                break;
            case "arc":
                out.push({
                    kind: "arc",
                    to: seg.to,
                    bend: bendOfWalkedArc(seg),
                });
                break;
            case "cubic":
                out.push({ kind: "cubic", c1: seg.c1, c2: seg.c2, to: seg.to });
                break;
        }
    }
    return out;
}

/** How many pieces a segment makes (spec M.2). */
const pieceCount = (seg: WalkedSegment) =>
    seg.kind === "polyline" ? seg.points.length - 1 : 1;

/**
 * The walk's distance along the exact path at any beat: R-20's place, measured by true length.
 * Between and around segments the marcher stands, so the distance holds.
 */
function distanceFunction(
    segments: readonly WalkedSegment[],
    cum: readonly number[],
): (beat: Beat) => number {
    const firstPiece: number[] = [];
    let p = 0;
    for (const seg of segments) {
        firstPiece.push(p);
        p += pieceCount(seg);
    }
    const total = cum[cum.length - 1]!;
    const cubics = new Map<WalkedSegment, ReturnType<typeof measureCubic>>();
    let i = 0;
    return (beat) => {
        // segments are in beat order and beats are asked in order, mostly: walk from the last one
        if (i >= segments.length || segments[i]!.start > beat) i = 0;
        while (i < segments.length - 1 && segments[i]!.end <= beat) i++;
        const seg = segments[i]!;
        const base = firstPiece[i]!;
        if (beat <= seg.start) return i === 0 ? 0 : cum[base]!;
        if (beat >= seg.end)
            return i === segments.length - 1
                ? total
                : cum[base + pieceCount(seg)]!;
        const f = (beat - seg.start) / (seg.end - seg.start);
        switch (seg.kind) {
            case "line":
            case "arc":
                return cum[base]! + f * (cum[base + 1]! - cum[base]!);
            case "cubic": {
                const t = walkedCubicParamAt(seg, f);
                if (t === null)
                    return cum[base]! + f * (cum[base + 1]! - cum[base]!);
                let m = cubics.get(seg);
                if (!m)
                    cubics.set(
                        seg,
                        (m = measureCubic(seg.from, seg.c1, seg.c2, seg.to)),
                    );
                return cum[base]! + m.lengthTo(t);
            }
            case "polyline": {
                const { beats } = seg;
                let j = 1;
                while (j < beats.length - 1 && beats[j]! < beat) j++;
                const span = beats[j]! - beats[j - 1]!;
                const g =
                    span > 0
                        ? Math.min(
                              1,
                              Math.max(0, (beat - beats[j - 1]!) / span),
                          )
                        : 1;
                const a = cum[base + j - 1]!;
                return a + g * (cum[base + j]! - a);
            }
        }
    };
}

/**
 * EP-C3: the keys, as few as keep the keyed distance within `tol` of the walk's at every sample.
 * `ticks` are the sample ticks (sorted; whole ones may become keys, the rest are only checked)
 * and `D` the walk's distance at each.
 */
function chooseKeys(
    ticks: readonly number[],
    D: readonly number[],
    tol: number,
): number[] {
    const n = ticks.length;
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack: [number, number][] = [[0, n - 1]];
    while (stack.length) {
        const [a, b] = stack.pop()!;
        if (b - a < 2) continue;
        const ta = ticks[a]!;
        const tb = ticks[b]!;
        const da = D[a]!;
        const slope = (D[b]! - da) / (tb - ta);
        let worst = 0;
        let pick = -1;
        let pickErr = -1;
        for (let j = a + 1; j < b; j++) {
            const err = Math.abs(D[j]! - (da + slope * (ticks[j]! - ta)));
            if (err > worst) worst = err;
            if (Number.isInteger(ticks[j]!) && err > pickErr) {
                pickErr = err;
                pick = j;
            }
        }
        if (worst <= tol || pick < 0) continue;
        keep[pick] = 1;
        stack.push([a, pick], [pick, b]);
    }
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (keep[j]) out.push(j);
    return out;
}

/** The exact path of one span's walked segments, or null when it goes nowhere (EP-6). */
export function exactPathOfSegments(
    segments: readonly WalkedSegment[],
    start: Beat,
    end: Beat,
    tolerance: number = EXACT_DEFAULT_TOLERANCE,
): ExactPath | null {
    if (segments.length === 0) return null;
    for (let i = 1; i < segments.length; i++) {
        const a = segments[i - 1]!.to;
        const b = segments[i]!.from;
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6)
            throw new Error(
                `walked segments don't join at beat ${segments[i]!.start} (transition ${segments[i]!.transitionId})`,
            );
    }
    const shapes = shapesOf(segments);
    const draft: ExactPath = {
        v: 1,
        from: segments[0]!.from,
        shapes,
        keys: [],
    };
    const pieces = exactPieces(draft);
    if (!pieces) throw new Error("a converted arc breaks EP-3");
    const cum = [0];
    for (const piece of pieces) cum.push(cum[cum.length - 1]! + piece.length);
    const N = pieces.length;
    const L = cum[N]!;
    if (!(L >= EXACT_MIN_LENGTH)) return null;
    const distanceAt = distanceFunction(segments, cum);

    // samples: every whole tick, plus every place the walk's speed may change (checked only)
    const total = Math.max(1, Math.round((end - start) * TICKS_PER_BEAT));
    const extra: number[] = [];
    const tickOf = (b: Beat) => (b - start) * TICKS_PER_BEAT;
    for (const seg of segments) {
        extra.push(tickOf(seg.start), tickOf(seg.end));
        if (seg.kind === "polyline")
            for (const b of seg.beats) extra.push(tickOf(b));
    }
    const ticks: number[] = [];
    for (let t = 0; t <= total; t++) ticks.push(t);
    for (const t of extra)
        if (t > 0 && t < total && !Number.isInteger(t)) ticks.push(t);
    ticks.sort((a, b) => a - b);
    const D = ticks.map((t) => distanceAt(start + t / TICKS_PER_BEAT));
    D[0] = distanceAt(start);
    D[D.length - 1] = L;

    const chosen = chooseKeys(ticks, D, keyBudget(segments, tolerance));
    const placeAt = (d: number) => {
        if (d <= 0) return 0;
        if (d >= L) return N;
        let lo = 0;
        let hi = N;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid]! <= d) lo = mid;
            else hi = mid;
        }
        const len = pieces[lo]!.length;
        return len > 0 ? lo + Math.min(1, (d - cum[lo]!) / len) : lo;
    };
    const keys: ExactKey[] = chosen.map((j) => ({
        tick: ticks[j]!,
        u: placeAt(D[j]!),
    }));
    keys[0] = { tick: 0, u: keys[0]!.u };
    keys[keys.length - 1] = { tick: total, u: N };
    // a walk that starts later than the span stands at its start: place 0 exactly
    if (keys[0]!.u !== 0) keys.unshift({ tick: 0, u: 0 });
    for (let i = 1; i < keys.length; i++)
        if (keys[i]!.u < keys[i - 1]!.u) keys[i]!.u = keys[i - 1]!.u;
    return { v: 1, from: segments[0]!.from, shapes, keys };
}

/**
 * EP-C: every exact path of a snapshot, one per marcher per span that moves (EP-C1), in marcher
 * then beat order. `host` is the snapshot `resolver` was built from.
 */
export function exactPathsOf(
    host: TimelineSnapshot,
    resolver: WalkResolver & { marcherIds(): readonly number[] },
    options: ExactPathsOptions = {},
): ExactMove[] {
    const tolerance = options.tolerance ?? EXACT_DEFAULT_TOLERANCE;
    const walked = createWalkedPaths(host, resolver);
    const out: ExactMove[] = [];
    for (const marcherId of options.marcherIds ?? resolver.marcherIds()) {
        for (const span of resolver.spanInfos(marcherId)) {
            const move = exactMoveOfSpan(walked, marcherId, span, tolerance);
            if (move) out.push(move);
        }
    }
    return out;
}

function exactMoveOfSpan(
    walked: ReturnType<typeof createWalkedPaths>,
    marcherId: number,
    span: SpanInfo,
    tolerance: number,
): ExactMove | null {
    if (span.kind === "hold" || span.transitionId === null) return null;
    if (!Number.isFinite(span.start) || !Number.isFinite(span.end)) return null;
    if (!(span.end > span.start)) return null;
    const segments = walked
        .path(marcherId, span.start, span.end)
        .segments.filter(
            (s) => s.start >= span.start - 1e-12 && s.end <= span.end + 1e-12,
        );
    const path = exactPathOfSegments(segments, span.start, span.end, tolerance);
    if (!path) return null;
    return {
        marcherId,
        transitionId: span.transitionId,
        start: span.start,
        end: span.end,
        path,
    };
}
