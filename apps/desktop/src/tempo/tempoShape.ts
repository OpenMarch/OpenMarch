/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): the tempo lane's shapes, Logic-style
 * (docs/tempo/logic-analysis.md). The show stores where a tempo change starts (a flag on the
 * count, `beats.tempo_change`); the count lengths stay the only tempo data. Between two changes
 * the lane reads the shape back from the lengths: steady, a ramp (straight or curved), or uneven
 * (fitted to the music, tapped). Editing a shape writes the lengths of its counts.
 *
 * Tempos here are quarter notes per minute, one per count, indexed by spec beat (beat 0 unused).
 */
import { tempoSegments } from "./tempoMath";

export type StretchShape =
    | { readonly kind: "steady"; readonly bpm: number }
    | {
          readonly kind: "ramp";
          /** Tempo of the first and the last count */
          readonly from: number;
          readonly to: number;
          /** 0 is straight; above 0 the change comes late, below 0 early (see `curveAt`) */
          readonly curve: number;
      }
    | { readonly kind: "uneven" };

/** The counts from one tempo change to the next (`to` exclusive), and their shape */
export interface Stretch {
    readonly from: number;
    readonly to: number;
    readonly shape: StretchShape;
}

/** How far a count may be off a shape (BPM) and still read as it: lengths written by the lane hit it */
const SHAPE_TOLERANCE = 0.02;
/** The curve range a ramp can take: exponents from 1/16 to 16 */
const CURVE_LIMIT = 4;

/** How far along a ramp the tempo is at `t` (0 to 1) */
export const curveAt = (t: number, curve: number) => t ** (2 ** curve);

/** The tempos of `counts` counts going from `from` to `to`, the first and last on the nose */
export function rampTempos(
    counts: number,
    from: number,
    to: number,
    curve = 0,
): number[] {
    return Array.from({ length: counts }, (_, i) => {
        const t = counts <= 1 ? 0 : i / (counts - 1);
        return from + (to - from) * curveAt(t, curve);
    });
}

/**
 * The curve whose middle is `u` of the way from the start tempo to the end: dragging a ramp's
 * handle puts the middle of the ramp under the pointer. Near halfway it snaps straight.
 */
export function curveThrough(u: number): number {
    const v = Math.min(0.97, Math.max(0.03, u));
    if (Math.abs(v - 0.5) < 0.06) return 0;
    return Math.min(
        CURVE_LIMIT,
        Math.max(-CURVE_LIMIT, Math.log2(Math.log(v) / Math.log(0.5))),
    );
}

/** The tempo a ramp is at halfway through, where its handle is drawn */
export const rampMiddle = (from: number, to: number, curve: number) =>
    from + (to - from) * curveAt(0.5, curve);

const maxError = (
    bpms: readonly number[],
    from: number,
    to: number,
    c: number,
) => {
    const fit = rampTempos(bpms.length, from, to, c);
    let worst = 0;
    for (let i = 0; i < bpms.length; i++)
        worst = Math.max(worst, Math.abs(fit[i]! - bpms[i]!));
    return worst;
};

/** The shape a stretch's tempos make */
export function shapeOf(bpms: readonly number[]): StretchShape {
    if (bpms.length === 0) return { kind: "uneven" };
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of bpms) {
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
    }
    if (hi - lo <= SHAPE_TOLERANCE) {
        const bpm = bpms.reduce((a, b) => a + b, 0) / bpms.length;
        return { kind: "steady", bpm };
    }
    if (bpms.length < 3) return { kind: "uneven" };
    const from = bpms[0]!;
    const to = bpms[bpms.length - 1]!;
    // a ramp only goes one way
    const rising = to > from;
    for (let i = 1; i < bpms.length; i++)
        if (
            rising
                ? bpms[i]! < bpms[i - 1]! - SHAPE_TOLERANCE
                : bpms[i]! > bpms[i - 1]! + SHAPE_TOLERANCE
        )
            return { kind: "uneven" };
    // the curve that fits best: the error has one low point along the curve, so a golden-section search
    let a = -CURVE_LIMIT;
    let b = CURVE_LIMIT;
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    for (let i = 0; i < 60; i++) {
        if (maxError(bpms, from, to, c) < maxError(bpms, from, to, d)) b = d;
        else a = c;
        c = b - g * (b - a);
        d = a + g * (b - a);
    }
    let curve = (a + b) / 2;
    if (Math.abs(curve) < 1e-3) curve = 0;
    return maxError(bpms, from, to, curve) <= SHAPE_TOLERANCE
        ? { kind: "ramp", from, to, curve }
        : { kind: "uneven" };
}

/**
 * The stretches between tempo changes, over counts 1..`end - 1`. Count 1 always starts one;
 * changes at or past `end` are ignored.
 */
export function stretchesOf(
    bpms: readonly number[],
    changes: ReadonlySet<number>,
    end: number,
): Stretch[] {
    const starts = [
        1,
        ...[...changes].filter((b) => b > 1 && b < end).sort((x, y) => x - y),
    ];
    return starts.map((from, i) => {
        const to = starts[i + 1] ?? end;
        return { from, to, shape: shapeOf(bpms.slice(from, to)) };
    });
}

/**
 * Where the tempo changes, read from the counts: for a show with none stored yet, and for what
 * Fit lines up. Wobble within `tolerance` BPM doesn't start a change.
 */
export function changesFrom(
    bpms: readonly number[],
    from = 1,
    to = bpms.length,
    tolerance = 1.2,
): Set<number> {
    const out = new Set<number>();
    // tempoSegments reads counts from 1: give it just this range
    const slice = [0, ...bpms.slice(from, to)].map((b) => (b > 0 ? 60 / b : 0));
    for (const s of tempoSegments(slice, tolerance)) out.add(s.from - 1 + from);
    out.delete(1);
    return out;
}

/** A shape's tempos over `counts` counts. An uneven stretch keeps `own`, stretched with its ends. */
export function temposOf(
    shape: StretchShape,
    counts: number,
    own: readonly number[],
    /** Which end new counts are added at, for an uneven stretch */
    grow: "start" | "end",
): number[] {
    if (shape.kind === "steady") return Array<number>(counts).fill(shape.bpm);
    if (shape.kind === "ramp")
        return rampTempos(counts, shape.from, shape.to, shape.curve);
    if (counts <= own.length)
        return grow === "end"
            ? own.slice(0, counts)
            : own.slice(own.length - counts);
    const pad = Array<number>(counts - own.length).fill(
        grow === "end" ? own[own.length - 1]! : own[0]!,
    );
    return grow === "end" ? [...own, ...pad] : [...pad, ...own];
}

/** The tempo a stretch ends on: what carries on when the change after it is removed */
export function endTempo(shape: StretchShape, own: readonly number[]): number {
    if (shape.kind === "steady") return shape.bpm;
    if (shape.kind === "ramp") return shape.to;
    return own[own.length - 1]!;
}
