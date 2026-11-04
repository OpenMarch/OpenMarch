// cspell:words Béziers lerp
import type { XY } from "../types";
import { add, dist, lerp, polar, scale, sub, unit, xy } from "./vec";

/**
 * Paths made of lines, circular arcs and cubic Béziers, measured by arc length so marchers can
 * be spaced along them evenly or at fixed intervals.
 */
export type Segment =
    | { readonly type: "line"; readonly a: XY; readonly b: XY }
    | {
          readonly type: "arc";
          readonly center: XY;
          readonly r: number;
          /** Radians, canvas axes (y down) */
          readonly start: number;
          /** Signed radians; positive turns toward +y */
          readonly sweep: number;
      }
    | {
          /**
           * An arc of an ellipse (#634): the points `center + R(rotation)·(rx cos t, ry sin t)` for
           * t from `start` through `start + sweep` (radians, signed as an arc's)
           */
          readonly type: "ellipse";
          readonly center: XY;
          readonly rx: number;
          readonly ry: number;
          /** Radians, canvas axes: the way the `rx` axis points */
          readonly rotation: number;
          readonly start: number;
          readonly sweep: number;
      }
    | {
          readonly type: "cubic";
          readonly a: XY;
          readonly c1: XY;
          readonly c2: XY;
          readonly b: XY;
      };

const CUBIC_SAMPLES = 64;
/** How many pieces an ellipse arc is measured in, for its length along it */
const ELLIPSE_SAMPLES = 128;

/** The point at angle `t` on an ellipse segment */
export function ellipsePoint(
    seg: Extract<Segment, { type: "ellipse" }>,
    t: number,
): XY {
    const x = seg.rx * Math.cos(t);
    const y = seg.ry * Math.sin(t);
    const c = Math.cos(seg.rotation);
    const s = Math.sin(seg.rotation);
    return xy(seg.center.x + x * c - y * s, seg.center.y + x * s + y * c);
}

interface Measured {
    readonly segment: Segment;
    readonly length: number;
    /**
     * Cubic and ellipse: cumulative length at t = i / CUBIC_SAMPLES of the curve (an ellipse's
     * i / ELLIPSE_SAMPLES of its sweep)
     */
    readonly table?: Float64Array;
}

export interface Path {
    readonly length: number;
    readonly closed: boolean;
    /**
     * The point `s` field units along the path. Past either end it continues the end segment: a
     * line straight on, an arc around its circle, a curve along its end tangent. A closed path
     * wraps.
     */
    at(s: number): XY;
    /** Distance along the path of the point on it nearest to `p` (approximate for curves) */
    project(p: XY): number;
    /** Points for drawing, about every `spacing` field units */
    polyline(spacing: number): XY[];
}

function cubicPoint(seg: Extract<Segment, { type: "cubic" }>, t: number): XY {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return xy(
        a * seg.a.x + b * seg.c1.x + c * seg.c2.x + d * seg.b.x,
        a * seg.a.y + b * seg.c1.y + c * seg.c2.y + d * seg.b.y,
    );
}

function measure(segment: Segment): Measured {
    switch (segment.type) {
        case "line":
            return { segment, length: dist(segment.a, segment.b) };
        case "arc":
            return { segment, length: Math.abs(segment.sweep) * segment.r };
        case "ellipse": {
            const table = new Float64Array(ELLIPSE_SAMPLES + 1);
            let prev = ellipsePoint(segment, segment.start);
            for (let i = 1; i <= ELLIPSE_SAMPLES; i++) {
                const p = ellipsePoint(
                    segment,
                    segment.start + (segment.sweep * i) / ELLIPSE_SAMPLES,
                );
                table[i] = table[i - 1]! + dist(prev, p);
                prev = p;
            }
            return { segment, length: table[ELLIPSE_SAMPLES]!, table };
        }
        case "cubic": {
            const table = new Float64Array(CUBIC_SAMPLES + 1);
            let prev = segment.a;
            for (let i = 1; i <= CUBIC_SAMPLES; i++) {
                const p = cubicPoint(segment, i / CUBIC_SAMPLES);
                table[i] = table[i - 1]! + dist(prev, p);
                prev = p;
            }
            return { segment, length: table[CUBIC_SAMPLES]!, table };
        }
    }
}

/** The point `s` along one segment; `s` may be outside [0, length] (extrapolates). */
function pointOn(m: Measured, s: number): XY {
    const seg = m.segment;
    switch (seg.type) {
        case "line": {
            if (m.length === 0) return seg.a;
            return lerp(seg.a, seg.b, s / m.length);
        }
        case "arc": {
            if (seg.r === 0) return seg.center;
            return polar(
                seg.center,
                seg.r,
                seg.start + Math.sign(seg.sweep || 1) * (s / seg.r),
            );
        }
        case "ellipse": {
            const table = m.table!;
            const at = (k: number) =>
                ellipsePoint(
                    seg,
                    seg.start + (seg.sweep * k) / ELLIPSE_SAMPLES,
                );
            const first = at(0);
            const last = at(ELLIPSE_SAMPLES);
            if (m.length === 0) return first;
            if (s <= 0) {
                const dir = unit(sub(at(1e-3), first));
                return add(first, scale(dir, s));
            }
            if (s >= m.length) {
                const dir = unit(sub(last, at(ELLIPSE_SAMPLES - 1e-3)));
                return add(last, scale(dir, s - m.length));
            }
            let lo = 0;
            let hi = ELLIPSE_SAMPLES;
            while (hi - lo > 1) {
                const midIndex = (lo + hi) >> 1;
                if (table[midIndex]! < s) lo = midIndex;
                else hi = midIndex;
            }
            const span = table[hi]! - table[lo]!;
            const f = span === 0 ? 0 : (s - table[lo]!) / span;
            return at(lo + f);
        }
        case "cubic": {
            const table = m.table!;
            if (s <= 0) {
                const dir = unit(sub(cubicPoint(seg, 1e-4), seg.a));
                return add(seg.a, scale(dir, s));
            }
            if (s >= m.length) {
                const dir = unit(sub(seg.b, cubicPoint(seg, 1 - 1e-4)));
                return add(seg.b, scale(dir, s - m.length));
            }
            let lo = 0;
            let hi = CUBIC_SAMPLES;
            while (hi - lo > 1) {
                const midIndex = (lo + hi) >> 1;
                if (table[midIndex]! < s) lo = midIndex;
                else hi = midIndex;
            }
            const span = table[hi]! - table[lo]!;
            const f = span === 0 ? 0 : (s - table[lo]!) / span;
            return cubicPoint(seg, (lo + f) / CUBIC_SAMPLES);
        }
    }
}

export function makePath(segments: readonly Segment[], closed = false): Path {
    if (segments.length === 0) throw new Error("A path needs a segment");
    const measured = segments.map(measure);
    const starts: number[] = [];
    let total = 0;
    for (const m of measured) {
        starts.push(total);
        total += m.length;
    }
    const length = total;

    const at = (sIn: number): XY => {
        let s = sIn;
        if (closed && length > 0) s = ((s % length) + length) % length;
        if (s <= 0) return pointOn(measured[0]!, s);
        for (let i = 0; i < measured.length; i++) {
            const end = starts[i]! + measured[i]!.length;
            if (s <= end || i === measured.length - 1) {
                return pointOn(measured[i]!, s - starts[i]!);
            }
        }
        return pointOn(measured[measured.length - 1]!, s - starts.at(-1)!);
    };

    const polyline = (spacing: number): XY[] => {
        const count = Math.max(
            2,
            Math.min(4096, Math.ceil(length / Math.max(spacing, 1e-9)) + 1),
        );
        const points: XY[] = [];
        for (let i = 0; i < count; i++)
            points.push(at((length * i) / (count - 1)));
        return points;
    };

    const project = (p: XY): number => {
        // Coarse scan, then refine around the best sample.
        const samples = 256;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i <= samples; i++) {
            const s = (length * i) / samples;
            const d = dist(at(s), p);
            if (d < bestD) {
                bestD = d;
                best = s;
            }
        }
        let step = length / samples;
        for (let k = 0; k < 20 && step > 1e-6; k++) {
            for (const s of [best - step, best + step]) {
                if (!closed && (s < 0 || s > length)) continue;
                const d = dist(at(s), p);
                if (d < bestD) {
                    bestD = d;
                    best = s;
                }
            }
            step /= 2;
        }
        return best;
    };

    return { length, closed, at, project, polyline };
}
