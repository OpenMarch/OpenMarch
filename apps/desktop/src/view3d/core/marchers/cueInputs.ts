/**
 * Turns one marcher's compiled cues and hold style into the planner's
 * per-count inputs (ADR 0015; docs/3d/performer-behavior.md section 8.2).
 *
 * Counting. A cue's instant is its count's click, where that count's heel
 * lands. The planner lands the step of drill count k at the end of that
 * count, and the window plays the plan `STEP_AHEAD` (one) count ahead of the
 * show (`marcherMotion.ts`), so:
 *
 * - the step of planner count k lands on show count k's click: its hold
 *   style is the one at show count k;
 * - the body at plan boundary b is what the show draws at count b - 1: its
 *   heading is the Facing at show count b - 1.
 *
 * The feet. Pace and step style belong to the move and aren't built, so every
 * count has the defaults; the step-off foot is a show setting (`stepOffFoot`);
 * what a hold does is the compile's hold style, which is not a cue. A kneel
 * has no Feet animation yet, so the feet stand under it.
 *
 * Facing values, as headings in radians about +Y (0 faces the audience,
 * +pi/2 faces side 2; facing.ts):
 *
 * - front 0, back pi, side 1 -pi/2, side 2 +pi/2;
 * - angle: `degrees` the same way round, 0 the audience, 90 side 2,
 *   180 the backfield, 270 side 1;
 * - point: toward field point (`x`, `y`) from where the marcher stands.
 *   The stored settings are field coordinates, the dots' space (ADR 0004
 *   amendment of 2026-10-15); the window passes `pointToWorld` to convert
 *   them as positions are. Without it they're read as world meters, `x`
 *   toward side 2 and `y` toward the audience;
 * - direction of travel: where the step landing at that boundary went,
 *   keeping the last direction on a hold (the next one before any travel).
 *
 * A Facing transition eases from the heading before it to its value over
 * its counts, the short way round. A snap is keyed in fixed time
 * ({@link SNAP_SECONDS} before its click, at the tempo of the count before
 * it): `turnSpan` says what part of that count, at its end, the turn takes.
 * A momentary Facing cue turns back when it ends, over the count after it.
 *
 * Pure: no React, three.js or database.
 */
import {
    holdStyleAt,
    type CompiledCues,
    type CueSegment,
} from "@openmarch/core";
import { DEFAULT_FEET, type FeetSettings, type Foot } from "./planner";
import { FRONT_HEADING } from "./facing";
import { SNAP_SECONDS } from "./hornChannel";

/** How many counts the window plays the plan ahead of the show (`STEP_AHEAD`). */
export const CUE_LEAD = 1;

/** Less travel than this in a count is a hold (meters), as the planner's `REST_EPS`. */
const TRAVEL_EPS = 0.01;

export interface MarcherCueInputs {
    /** Feet settings per planner count (K). */
    feet: FeetSettings[];
    /** Heading per count boundary (K + 1), for `PlanInput.heading`. */
    heading: Float64Array;
    /**
     * Per count boundary (K + 1): the part of the count before it, at its
     * end, that the turn into it takes. 1 turns over the whole count; a snap
     * less. For `PlanInput.turnSpan`.
     */
    turnSpan: Float64Array;
}

export interface CueInputOptions {
    /** A Facing point's settings to world x, z. Defaults to meters, y toward the audience. */
    pointToWorld?: (x: number, y: number) => [x: number, z: number];
    /** Seconds per show count k (the tempo). Defaults to 120 bpm. */
    secondsPerCount?: (k: number) => number;
    /** The show's step-off foot (Show settings). Defaults to the left. */
    stepOffFoot?: Foot;
}

/**
 * The segment that owns count clock `c`: the last non-empty segment starting
 * at or before it. Snaps (zero length) never own a count.
 */
function segmentAt(
    segments: readonly CueSegment[],
    c: number,
): CueSegment | undefined {
    let found: CueSegment | undefined;
    for (const seg of segments) {
        if (seg.from > c) break;
        if (seg.to > seg.from && c < seg.to) found = seg;
    }
    return found;
}

const KNEEL = "builtin:posture.kneel";

/**
 * The Feet settings of each planner count: the defaults, the show's step-off
 * foot, and the hold style at that count (standing under a kneel).
 */
function feetPerCount(
    compiled: CompiledCues,
    marcherId: number,
    K: number,
    stepOffFoot: Foot = DEFAULT_FEET.stepOffFoot,
): FeetSettings[] {
    const holds = compiled.holdStyle(marcherId);
    const posture = compiled.segments(marcherId, "posture");
    const out: FeetSettings[] = [];
    for (let k = 0; k < K; k++) {
        // kneeling, or going down into it: no Feet animation yet, so stand still
        const kneels = segmentAt(posture, k)?.value === KNEEL;
        out.push({
            ...DEFAULT_FEET,
            stepOffFoot,
            onHolds: kneels ? "stand" : holdStyleAt(holds, k),
        });
    }
    return out;
}

const DEG = Math.PI / 180;

/** The short-way angle from `a` to `b`. */
function angleDelta(a: number, b: number): number {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

/** An angle in (-pi, pi]. */
const wrap = (a: number) => {
    const d = angleDelta(0, a);
    return d === -Math.PI ? Math.PI : d;
};

const smooth = (u: number) => {
    const x = Math.min(Math.max(u, 0), 1);
    return x * x * (3 - 2 * x);
};

/**
 * Turns one marcher's compiled cues into per-count planner inputs.
 * `positions` are the planner's drill positions (x, z at each count
 * boundary, world meters); their length sets the count.
 */
export function marcherCueInputs(
    compiled: CompiledCues,
    marcherId: number,
    positions: Float64Array,
    options: CueInputOptions = {},
): MarcherCueInputs {
    const K = positions.length / 2 - 1;
    const feet = feetPerCount(compiled, marcherId, K, options.stepOffFoot);
    const facing = compiled.segments(marcherId, "facing");
    const pointToWorld =
        options.pointToWorld ??
        ((x: number, y: number) => [x, y] as [number, number]);

    // The travel heading landing at each boundary (the step of count b - 1),
    // carried over holds, and back-filled before the first travel.
    const travel = new Float64Array(K + 1).fill(Number.NaN);
    let last = Number.NaN;
    for (let b = 1; b <= K; b++) {
        const dx = positions[b * 2] - positions[(b - 1) * 2];
        const dz = positions[b * 2 + 1] - positions[(b - 1) * 2 + 1];
        if (Math.hypot(dx, dz) > TRAVEL_EPS) last = Math.atan2(dx, dz);
        travel[b] = last;
    }
    const first = travel.find((h) => !Number.isNaN(h));
    for (let b = 0; b <= K; b++)
        if (Number.isNaN(travel[b])) travel[b] = first ?? FRONT_HEADING;

    /** A Facing value's heading at boundary b. */
    const valueHeading = (seg: CueSegment | undefined, b: number): number => {
        const s = seg?.settings ?? {};
        switch (seg?.value) {
            case "builtin:facing.back":
                return Math.PI;
            case "builtin:facing.side1":
                return -Math.PI / 2;
            case "builtin:facing.side2":
                return Math.PI / 2;
            case "builtin:facing.angle":
                return wrap(Number(s.degrees ?? 0) * DEG);
            case "builtin:facing.point": {
                const [px, pz] = pointToWorld(
                    Number(s.x ?? 0),
                    Number(s.y ?? 0),
                );
                const dx = px - positions[b * 2];
                const dz = pz - positions[b * 2 + 1];
                return Math.hypot(dx, dz) > 1e-9
                    ? Math.atan2(dx, dz)
                    : FRONT_HEADING;
            }
            case "builtin:facing.travel":
                return travel[b];
            default:
                return FRONT_HEADING;
        }
    };

    // a snap lands on its click in fixed time, at the end of the count before
    const turnSpan = new Float64Array(K + 1).fill(1);
    const secondsPerCount = options.secondsPerCount ?? (() => 0.5);
    for (const seg of facing) {
        if (seg.kind !== "transition" || !(seg.snap || seg.to <= seg.from))
            continue;
        const b = Math.round(seg.to) + CUE_LEAD;
        if (b < 1 || b > K) continue;
        const k = Math.max(Math.round(seg.to) - 1, 0);
        turnSpan[b] = Math.min(SNAP_SECONDS / secondsPerCount(k), 1);
    }

    const heading = new Float64Array(K + 1);
    for (let b = 0; b <= K; b++) {
        const c = Math.max(b - CUE_LEAD, 0);
        const seg = segmentAt(facing, c);
        if (seg?.kind !== "transition") {
            heading[b] = valueHeading(seg, b);
            continue;
        }
        // ease from what the performer faced as the turn began
        const before = segmentAt(facing, seg.from - 1e-9);
        const startB = Math.min(
            Math.max(Math.round(seg.from) + CUE_LEAD, 0),
            K,
        );
        const h0 = before ? valueHeading(before, startB) : FRONT_HEADING;
        const h1 = valueHeading(seg, b);
        const u = smooth((c - seg.from) / (seg.to - seg.from));
        heading[b] = h0 + angleDelta(h0, h1) * u;
    }
    return { feet, heading, turnSpan };
}
