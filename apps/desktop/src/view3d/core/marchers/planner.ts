/**
 * Which clip each 3D View marcher plays on each count, and where its body is
 * (ADR 0002 D-7; om-pose `docs/openmarch-3d.md`, "Driving clips from drill").
 *
 * The planner doesn't know about pages. It turns the counts into steps by
 * the Feet pace (docs/3d/performer-behavior.md section 3, 8.2): one step a
 * count in single time, one every two counts in half time, two a count in
 * double time. The dots set the distance and the pace the stride, so 8-to-5
 * dots in half time are 4-to-5 strides played at half the clip rate. For
 * every step it looks at how far the marcher's dot moves and which way:
 *
 * - no travel: a rest, `attention` by default ("stand" on holds), or
 *   `marktime` when the Feet's on-holds technique is mark time or high mark
 *   time. There is no automatic mark time any more;
 * - travel: a step along that step's own vector, relative to the heading
 *   (the Facing channel turns the whole performer; the legs pick forward,
 *   backward or a slide relative to it). The family and leg turn come from
 *   `travelDirection`, the two sizes and weight from `pickBlend`. A curved
 *   path is a new vector every step. With the front facing, a run of slide
 *   steps faces the 50: forward when the run ends nearer the 50 than it
 *   started, backward when farther (`facing.ts`).
 *
 * Each move plays off the step-off foot set on its step-off count; a
 * right-foot move plays mirrored rows (`mirrorRow`).
 *
 * From the sequence of steps it builds clip events:
 *
 * - rest to step: `stepoff_<move>` (turned via `turnedClips`), or from mark
 *   time `change_marktime__<move>` when that clip exists;
 * - step to step: the loop, phased from its step-off. A change of move (a
 *   different family, a size jump, or a sharp leg turn) is a `crossfade`
 *   centered on the count boundary: from the middle of the last count of the
 *   old move to the middle of the first count of the new one, the old loop
 *   blends into the new, both at the running loop time, while the leg turn
 *   eases from the old travel to the new. The foot that lands on the new
 *   page's first count is already turning, so the change reads from count 8
 *   into count 1 instead of snapping on the downbeat. When the last count
 *   can't host it (a step-off, or another change), the fade covers the first
 *   count alone;
 * - step to rest: `halt_<move>` when the loop is at time 0, `halt2_<move>`
 *   when it is at 0.5 s (to mark time: `change_<move>__marktime` when it
 *   exists, or a crossfade).
 *
 * Body placement (docs/3d/technique.md, "Foot on the dot"): during loops,
 * crossfades and rests the body follows the drill; during a one-count
 * transition it moves by the clip's own root travel. By default the dot
 * marks the landing foot's ankle, so after each moving count the body sits
 * half that count's step behind the dot, with the weight between the feet,
 * and it reaches the dot only as the feet close. The step-off's root travel
 * (about 0.31 m against an 8-to-5 step's 0.57 m) leaves the body about
 * there by itself. The landing correction spreads what remains linearly
 * between anchors, the boundaries next to a rest and both ends of a count
 * whose step changes, where the body is exactly at its target: the ankle
 * is on the dot on count 8 and the body swings to the new direction during
 * count 1, while the legs' fade stays centered on the boundary. With
 * `dotMode: "body"` the target is the dot itself at every boundary.
 *
 * Pure: no three.js, React or database.
 */

import {
    pickBlend,
    turnedClips,
    turnEase,
    turnRoot,
    type ClipPair,
    type Direction,
    type Family,
    type Manifest,
    type ManifestClip,
    type Pick,
    type TurnedPair,
} from "../../render/step-blend.js";
import { classSuffix, type HeightClass } from "./looks";
import { isSlide, travelDirection, type SlideSense } from "./facing";

/** Less travel than this in a count is a rest (meters). */
export const REST_EPS = 0.01;
/** A size change bigger than this between counts is a change of move (meters per count). */
export const SIZE_JUMP = 0.05;
/** Blend weights this close to 0 or 1 play the exact size alone (0.1 mm per count at most). */
export const WEIGHT_SNAP = 1e-3;
/** Leg turns within this count as unturned, for change clips (radians). */
export const TURN_EPS = (1 * Math.PI) / 180;
/**
 * A leg turn this big between counts is a change of direction, faded like a
 * change of move with a prep step (docs/3d/technique.md): under it the legs
 * just ease to the new direction (radians).
 */
export const SHARP_TURN = (10 * Math.PI) / 180;
/** A halt's residual leg turn starts this far into its count: after the foot has closed. */
export const HALT_TURN_START = 0.8;
/** Between rests, a landing correction anchor at least this often (counts). */
export const MAX_ANCHOR_SPAN = 16;
/** A change in the foot-on-dot target bigger than this (meters) pins the boundaries around it. */
export const TARGET_EPS = 0.01;

/** How often the feet step: once a count, every two counts, twice a count. */
export type Pace = "single" | "half" | "double";
/** How the feet step while moving. Bent leg and high step play straight leg for now. */
export type MovingTechnique = "straightLeg" | "bentLeg" | "highStep";
/** What the feet do on a hold. High mark time plays mark time for now. */
export type HoldTechnique = "stand" | "markTime" | "highMarkTime";
/** The performer's own foot. */
export type Foot = "left" | "right";

/** The Feet channel's settings for one count (performer-behavior.md section 3). */
export interface FeetSettings {
    pace: Pace;
    moving: MovingTechnique;
    onHolds: HoldTechnique;
    stepOffFoot: Foot;
}

/** The Feet defaults: single time, straight leg, stand on holds, left foot. */
export const DEFAULT_FEET: Readonly<FeetSettings> = Object.freeze({
    pace: "single",
    moving: "straightLeg",
    onHolds: "stand",
    stepOffFoot: "left",
});

export interface PlanInput {
    manifest: Manifest;
    heightClass: HeightClass;
    /**
     * Where the whole performer faces, radians about +Y (0 faces the
     * audience): one heading, or one per count boundary 0..K (the Facing
     * channel, `cueInputs.ts`). Between boundaries it turns the short way.
     */
    heading: number | Float64Array;
    /**
     * Per count boundary 0..K: the part of the count before it, at its end,
     * that turning into its heading takes (a snap, `cueInputs.ts`). Omitted,
     * every turn spans its whole count.
     */
    turnSpan?: Float64Array;
    /** Drill position at each count boundary 0..K: x, z interleaved (world meters). */
    positions: Float64Array;
    /** Tempo of each count 0..K-1. */
    bpm: Float64Array;
    /**
     * The Feet settings of each count 0..K-1: count k is the step that
     * lands at the end of drill count k. Defaults to `DEFAULT_FEET`.
     */
    feet?: readonly FeetSettings[];
    /**
     * What the dot marks (docs/3d/technique.md), for every count or per
     * count 0..K-1 (a set's mode covers the counts of the move into it):
     * `foot` (the default) puts the landing foot's ankle on the dot at the
     * end of each count of a move, the body half a step behind it with the
     * weight 50-50; `body` keeps the body's center over the dot. Not offered
     * in the UI yet.
     */
    dotMode?: DotMode | readonly DotMode[];
}

/** What a marcher's dot marks: the landing foot's ankle, or the body's center. */
export type DotMode = "foot" | "body";

export type EventKind = "rest" | "loop" | "transition" | "crossfade";

export interface PlanEvent {
    /** First count it covers (count clock); it lasts until the next event's count. */
    count: number;
    /**
     * Steps per count: 1 in single time, 0.5 in half, 2 in double. The clip
     * plays at this rate; a transition lasts `1 / rate` counts.
     */
    rate: number;
    /** The heading the legs step relative to (radians), as `PlanInput.heading`. */
    heading: number;
    /** The foot this event's move stepped off on: `right` plays mirrored rows. */
    foot: Foot;
    kind: EventKind;
    /** Clip names (with the height class suffix), as `bake.rows` keys. */
    clip: string;
    /** Loops: the second size. Crossfades: the loop faded in, or null for a turn alone. */
    clip2: string | null;
    /** Crossfades: unused; the weight runs 0 to 1 over the fade window (`crossfadeWeight`). */
    weight: number;
    /** Crossfades: `[from, to, 0, 1]`, eased over the fade window by the caller. */
    legYaw: number | [number, number, number, number];
    /** Crossfades: the count clock values the fade runs between. Otherwise the event's own span. */
    fadeStart: number;
    fadeEnd: number;
    /** The count clock value at which the clip is at its time 0 (clip time is `(c - phaseStart) * rate`). */
    phaseStart: number;
    /**
     * Crossfades centered on a change of move: the loop time (0 or 1 count)
     * of the old move's last landing, the prep step, which plays on the
     * platform of the foot (`prepName` rows). Otherwise null.
     */
    prep: number | null;
    /** Transitions: the pair whose root travel places the body. */
    root: TurnedPair | ClipPair | null;
    /**
     * Transitions: drill position at `count` plus the offset then (the body
     * is base + root(u)). Loops and rests: the offset (body - drill).
     */
    baseX: number;
    baseZ: number;
    /** The correction span this event lies in: count clock a..b and the corrections there (raw offset minus target). */
    a: number;
    b: number;
    oaX: number;
    oaZ: number;
    obX: number;
    obZ: number;
}

export interface MarcherPlan {
    events: PlanEvent[];
    /** Count boundaries (K + 1). */
    counts: number;
    /** Heading at each count boundary (K + 1): `headingAt` turns between them. */
    headings: Float64Array;
    /** `PlanInput.turnSpan`, or null when every turn spans its count. */
    turnSpan?: Float64Array | null;
}

type State =
    | { type: "attention" }
    | { type: "marktime" }
    | {
          type: "move";
          family: Family;
          dir: Direction;
          pick: Pick;
          d: number;
          dx: number;
          dz: number;
      };

const clipsOf = (m: Manifest): ManifestClip[] =>
    Array.isArray(m) ? m : m.clips;

const namesCache = new WeakMap<object, Set<string>>();
function clipNames(manifest: Manifest): Set<string> {
    const key = manifest as object;
    let names = namesCache.get(key);
    if (!names) {
        names = new Set(clipsOf(manifest).map((c) => c.name));
        namesCache.set(key, names);
    }
    return names;
}
function clipByName(manifest: Manifest, name: string): ManifestClip {
    const c = clipsOf(manifest).find((x) => x.name === name);
    if (!c) throw new Error(`planner: no clip ${name}`);
    return c;
}

/** The move's nearest exact size (its base), for change clips. */
const nearestBase = (p: Pick) => (p.weight < 0.5 ? p.baseA : p.baseB);
const isRest = (s: State) => s.type !== "move";
const restBase = (s: State) =>
    s.type === "marktime" ? "marktime" : "attention";

/** Drill sizes are never exact: play a size alone when the weight is within WEIGHT_SNAP of it. */
function snapPick(p: Pick): Pick {
    if (p.weight > 0 && p.weight < WEIGHT_SNAP)
        return {
            ...p,
            b: p.a,
            baseB: p.baseA,
            stepB: p.stepA,
            weight: 0,
            d: p.stepA,
        };
    if (p.weight > 1 - WEIGHT_SNAP && p.weight < 1)
        return {
            ...p,
            a: p.b,
            baseA: p.baseB,
            stepA: p.stepB,
            weight: 0,
            d: p.stepB,
        };
    return p;
}

/** `a mod 2` in [0, 2). */
const mod2 = (a: number) => ((a % 2) + 2) % 2;

/** The signed angle from `a` to `b`, the short way round (radians). */
function angleDelta(a: number, b: number): number {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

/**
 * The heading at count clock `c` from headings at each count boundary. A
 * turn spanning part of its count (a snap) holds, then eases into the
 * boundary over that last part.
 */
function headingFrom(
    headings: Float64Array,
    c: number,
    turnSpan?: Float64Array | null,
): number {
    const last = headings.length - 1;
    if (last <= 0) return headings[0] ?? 0;
    if (!(c > 0)) return headings[0];
    if (c >= last) return headings[last];
    const k = Math.floor(c);
    const h0 = headings[k];
    const span = turnSpan?.[k + 1] ?? 1;
    let u = c - k;
    if (span < 1) {
        const x = Math.min(Math.max((u - (1 - span)) / span, 0), 1);
        u = x * x * (3 - 2 * x);
    }
    return h0 + angleDelta(h0, headings[k + 1]) * u;
}

/** A heading this close to 0 is the front facing, where slides face the 50. */
const FRONT_EPS = 1e-6;
const facesFront = (h: number) => Math.abs(angleDelta(0, h)) <= FRONT_EPS;

/**
 * The marcher's steps: the counts split or joined by pace. Step i runs
 * over count clock t[i]..t[i+1] from pos[i] to pos[i+1].
 */
interface Steps {
    n: number;
    t: Float64Array;
    /** x, z at each step boundary, interleaved. */
    pos: Float64Array;
    /** Steps per count. */
    rate: Float64Array;
    /** Steps per minute, for the clips' tempo. */
    bpm: Float64Array;
    /** The heading the legs step relative to: the heading at the step's landing. */
    heading: Float64Array;
    feet: FeetSettings[];
    dot: DotMode[];
}

/**
 * Splits or joins the counts by pace. In half time two counts of the same
 * kind (moving, or holding) make one step, paired from the start of each
 * run; an odd count left over is a step of its own. In double time each
 * count is two steps, the dot halfway between them.
 */
function buildSteps(input: PlanInput, headings: Float64Array): Steps {
    const { positions, bpm } = input;
    const K = positions.length / 2 - 1;
    const feetOf = (k: number) => input.feet?.[k] ?? DEFAULT_FEET;
    const dotOf = (k: number): DotMode =>
        (typeof input.dotMode === "string"
            ? input.dotMode
            : input.dotMode?.[k]) ?? "foot";
    const moving = (k: number) =>
        Math.hypot(
            positions[(k + 1) * 2] - positions[k * 2],
            positions[(k + 1) * 2 + 1] - positions[k * 2 + 1],
        ) > REST_EPS;
    const t: number[] = [0];
    const pos: number[] = [positions[0], positions[1]];
    const rate: number[] = [];
    const spm: number[] = [];
    const feet: FeetSettings[] = [];
    const dot: DotMode[] = [];
    /** A step of count k's settings ending at count clock `end`, on the drill there. */
    const push = (k: number, end: number, r: number) => {
        const i = Math.floor(end - 1e-9);
        const u = end - i;
        t.push(end);
        pos.push(
            positions[i * 2] + (positions[(i + 1) * 2] - positions[i * 2]) * u,
            positions[i * 2 + 1] +
                (positions[(i + 1) * 2 + 1] - positions[i * 2 + 1]) * u,
        );
        rate.push(r);
        spm.push(bpm[k] * r);
        feet.push(feetOf(k));
        dot.push(dotOf(k));
    };
    let k = 0;
    while (k < K) {
        const pace = feetOf(k).pace;
        if (
            pace === "half" &&
            k + 1 < K &&
            feetOf(k + 1).pace === "half" &&
            moving(k) === moving(k + 1)
        ) {
            push(k, k + 2, 0.5);
            k += 2;
        } else if (pace === "double") {
            push(k, k + 0.5, 2);
            push(k, k + 1, 2);
            k += 1;
        } else {
            push(k, k + 1, 1);
            k += 1;
        }
    }
    const n = rate.length;
    const heading = new Float64Array(n);
    for (let i = 0; i < n; i++)
        heading[i] = headingFrom(headings, t[i + 1], input.turnSpan);
    return {
        n,
        t: Float64Array.from(t),
        pos: Float64Array.from(pos),
        rate: Float64Array.from(rate),
        bpm: Float64Array.from(spm),
        heading,
        feet,
        dot,
    };
}

/**
 * Which way each step's slide goes relative to the 50 (x = 0): decided per
 * run of consecutive slide steps in the same lateral direction, by whether
 * the run ends nearer the 50 than it started. One gait per run, so a slide
 * across the 50 doesn't flip halfway. Only with the front facing
 * (technique.md, "Slides"); any other facing leaves the legs to
 * `pickDirection`.
 */
function slideSenses(steps: Steps): SlideSense[] {
    const { pos: positions, heading, n: K } = steps;
    const out: SlideSense[] = new Array(K).fill(null);
    const slideAt = (k: number, side: number) => {
        const dx = positions[(k + 1) * 2] - positions[k * 2];
        const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
        return (
            Math.hypot(dx, dz) > REST_EPS &&
            facesFront(heading[k]) &&
            (side === 0 ? Math.sign(dx) !== 0 : Math.sign(dx) === side) &&
            isSlide(travelDirection(dx, dz, heading[k]))
        );
    };
    let k = 0;
    while (k < K) {
        if (!slideAt(k, 0)) {
            k++;
            continue;
        }
        const side = Math.sign(positions[(k + 1) * 2] - positions[k * 2]);
        let end = k + 1;
        while (end < K && slideAt(end, side)) end++;
        const x0 = Math.abs(positions[k * 2]);
        const x1 = Math.abs(positions[end * 2]);
        const sense: SlideSense =
            x1 < x0 - REST_EPS ? "toward" : x1 > x0 + REST_EPS ? "away" : null;
        for (let i = k; i < end; i++) out[i] = sense;
        k = end;
    }
    return out;
}

/** The states of every step from the drill and the Feet settings. */
function stepStates(input: PlanInput, steps: Steps): State[] {
    const { manifest, heightClass } = input;
    const { pos: positions, bpm, heading, feet, n: K } = steps;
    const senses = slideSenses(steps);
    const out: State[] = [];
    for (let k = 0; k < K; k++) {
        const dx = positions[(k + 1) * 2] - positions[k * 2];
        const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
        const d = Math.hypot(dx, dz);
        if (!(d > REST_EPS)) {
            // stand by default; high mark time plays mark time for now
            out.push({
                type: feet[k].onHolds === "stand" ? "attention" : "marktime",
            });
            continue;
        }
        // bent leg and high step play straight leg for now
        const dir = travelDirection(dx, dz, heading[k], senses[k]);
        const family = dir.family as Family;
        const pick = snapPick(
            pickBlend(manifest, family, d, {
                height: heightClass,
                bpm: bpm[k],
            }),
        );
        out.push({ type: "move", family, dir, pick, d, dx, dz });
    }
    return out;
}

/** The blend weight of a crossfade at `u` in [0, 1] of its count. */
export function crossfadeWeight(u: number): number {
    return turnEase(u);
}

interface Draft {
    kind: EventKind;
    clip: string;
    clip2: string | null;
    weight: number;
    legYaw: number | [number, number, number, number];
    phaseStart: number;
    rate: number;
    foot: Foot;
    root: TurnedPair | ClipPair | null;
    /** Crossfades: the fade window. */
    fadeStart?: number;
    fadeEnd?: number;
    /** The second step of a two-step crossfade: no event of its own. */
    continued?: boolean;
    /** See `PlanEvent.prep`. */
    prep?: number | null;
}

/** A single clip's root travel as a pair (for change and mark time clips). */
function soloPair(manifest: Manifest, name: string): ClipPair {
    const c = clipByName(manifest, name);
    return { a: name, b: null, weight: 0, clipA: c, clipB: c };
}

/** Root travel at u of a transition's step, in the marcher's frame. */
export function rootAt(
    manifest: Manifest,
    pair: TurnedPair | ClipPair,
    u: number,
): [number, number] {
    return turnRoot(manifest, pair as TurnedPair, u);
}

/** The headings at each count boundary from `PlanInput.heading`. */
function headingsOf(input: PlanInput): Float64Array {
    const K = input.positions.length / 2 - 1;
    if (typeof input.heading !== "number") {
        if (input.heading.length !== K + 1)
            throw new Error(
                `planner: ${input.heading.length} headings for ${K + 1} count boundaries`,
            );
        return input.heading;
    }
    return new Float64Array(K + 1).fill(input.heading);
}

/** Plans one marcher's clips and body placement for the whole show. */
// eslint-disable-next-line max-lines-per-function
export function planMarcher(input: PlanInput): MarcherPlan {
    const { manifest, heightClass: h } = input;
    const sfx = classSuffix(h);
    const names = clipNames(manifest);
    const has = (base: string) => names.has(base + sfx);
    const headings = headingsOf(input);
    const steps = buildSteps(input, headings);
    const { t: T, pos: positions } = steps;
    const states = stepStates(input, steps);
    const K = states.length;

    // 1. Clip drafts per step, and the raw offset (body - drill) at each boundary.
    const drafts: Draft[] = [];
    const ox = new Float64Array(K + 1);
    const oz = new Float64Array(K + 1);
    let prev: State = { type: "attention" };
    let parity = 0; // the running loop's time on this step: 0 or 1 (in steps)
    let prevYaw = 0;
    let prevRate = steps.rate[0] ?? 1;
    let foot: Foot = "left"; // the current move's step-off foot
    for (let k = 0; k < K; k++) {
        const s = states[k];
        const rate = steps.rate[k];
        const dur = 1 / rate;
        // the loop's time on this step, before this step updates it
        const p = parity;
        // a move (or mark time) from attention steps off on this step's foot
        if (prev.type === "attention" && s.type !== "attention")
            foot = steps.feet[k].stepOffFoot;
        const moveFoot = foot;
        let draft: Draft;
        const loopOf = (st: State, yaw: Draft["legYaw"]): Draft =>
            st.type === "move"
                ? {
                      kind: "loop",
                      clip: st.pick.a,
                      clip2: st.pick.weight > 0 ? st.pick.b : null,
                      weight: st.pick.weight,
                      legYaw: yaw,
                      phaseStart: T[k] - p * dur,
                      rate,
                      foot: moveFoot,
                      root: null,
                  }
                : {
                      kind: "rest",
                      clip: restBase(st) + sfx,
                      clip2: null,
                      weight: 0,
                      legYaw: 0,
                      // attention is still; only mark time's phase matters
                      phaseStart: st.type === "attention" ? 0 : T[k] - p * dur,
                      rate,
                      foot: st.type === "attention" ? "left" : moveFoot,
                      root: null,
                  };
        /**
         * A halt keeps the closing leg on its line: the residual turn that
         * squares the legs waits until the foot has closed, the last fifth
         * of the step, instead of easing through the clip's swing window.
         */
        const lateTurn = (pair: TurnedPair): TurnedPair =>
            pair.kind === "stepoff"
                ? pair
                : {
                      ...pair,
                      window: [HALT_TURN_START, 1],
                      legYaw: [
                          pair.legYaw[0],
                          pair.legYaw[1],
                          HALT_TURN_START,
                          1,
                      ],
                  };
        const transition = (pair: TurnedPair | ClipPair): Draft => {
            const turned: TurnedPair | ClipPair =
                "legYaw" in pair ? lateTurn(pair) : pair;
            return {
                kind: "transition",
                clip: turned.a,
                clip2: turned.b && turned.weight > 0 ? turned.b : null,
                weight: turned.b ? turned.weight : 0,
                legYaw: "legYaw" in turned ? (turned as TurnedPair).legYaw : 0,
                phaseStart: T[k],
                rate,
                foot: moveFoot,
                root: turned,
            };
        };
        const change = (from: string, to: string): Draft | null => {
            const base = `${p === 0 ? "change" : "change2"}_${from}__${to}`;
            return has(base)
                ? transition(soloPair(manifest, base + sfx))
                : null;
        };
        const unturned = (st: State) =>
            st.type !== "move" || Math.abs(st.dir.legYaw) <= TURN_EPS;
        const baseOf = (st: State) =>
            st.type === "move" ? nearestBase(st.pick) : "marktime";
        // the loop a state plays alone (its nearest size), for a crossfade
        const soloLoop = (st: State) =>
            st.type === "move"
                ? st.pick.weight < 0.5
                    ? st.pick.a
                    : st.pick.b
                : restBase(st) + sfx;
        const yawOf = (st: State) => (st.type === "move" ? st.dir.legYaw : 0);
        /**
         * A change of move at this step. Centered on the boundary when the
         * previous step is a plain loop of the old move at the same pace:
         * that draft becomes the fade's first step and this one continues
         * it. Otherwise the fade covers this step alone.
         */
        const crossfade = (from: State, to: State): Draft => {
            const a = soloLoop(from);
            const b = soloLoop(to);
            const last = drafts[k - 1];
            const centered =
                k > 0 &&
                last !== undefined &&
                last.kind === "loop" &&
                !last.continued &&
                last.rate === rate;
            const fade: Draft = {
                kind: "crossfade",
                clip: a,
                clip2: b === a ? null : b,
                weight: 0,
                legYaw: [yawOf(from), yawOf(to), 0, 1],
                phaseStart: centered ? last.phaseStart : T[k] - p * dur,
                rate,
                foot: moveFoot,
                root: null,
                fadeStart: centered ? (T[k - 1] + T[k]) / 2 : T[k],
                fadeEnd: centered ? (T[k] + T[k + 1]) / 2 : T[k + 1],
                // the old move's last landing, at boundary k, is the prep step
                prep: centered ? mod2((T[k] - last.phaseStart) * rate) : null,
            };
            if (centered) {
                drafts[k - 1] = fade;
                return { ...fade, continued: true };
            }
            return fade;
        };

        if (s.type === "move") {
            if (prev.type === "attention") {
                draft = transition(
                    turnedClips(manifest, s.pick, s.dir, "stepoff"),
                );
                parity = 0; // stepoff covers this step; the loop starts at time 0 next step
                prevYaw = s.dir.legYaw;
            } else {
                const sameMove =
                    prev.type === "move" &&
                    prev.family === s.family &&
                    Math.abs(prev.d - s.d) <= SIZE_JUMP &&
                    prevRate === rate;
                const yaw = s.dir.legYaw;
                if (sameMove && Math.abs(yaw - prevYaw) <= SHARP_TURN) {
                    // the same move, drifting: ease the legs over half a loop
                    draft = loopOf(
                        s,
                        Math.abs(yaw - prevYaw) > 1e-6
                            ? [prevYaw, yaw, p / 2, p / 2 + 0.5]
                            : yaw,
                    );
                } else {
                    // from mark time, the hand-made change clip when it exists
                    draft =
                        (prev.type === "marktime" && unturned(s)
                            ? change("marktime", baseOf(s))
                            : null) ?? crossfade(prev, s);
                }
                prevYaw = s.dir.legYaw;
                parity ^= 1;
            }
        } else if (prev.type === "move") {
            if (s.type === "attention") {
                draft = transition(
                    turnedClips(
                        manifest,
                        prev.pick,
                        prev.dir,
                        parity === 0 ? "halt" : "halt2",
                    ),
                );
            } else {
                draft =
                    (unturned(prev)
                        ? change(nearestBase(prev.pick), "marktime")
                        : null) ?? crossfade(prev, s);
                parity ^= 1;
            }
        } else if (prev.type === "attention" && s.type === "marktime") {
            draft = transition(soloPair(manifest, `stepoff_marktime${sfx}`));
            parity = 0;
        } else if (prev.type === "marktime" && s.type === "attention") {
            draft = transition(
                soloPair(
                    manifest,
                    `${parity === 0 ? "halt" : "halt2"}_marktime${sfx}`,
                ),
            );
        } else {
            draft = loopOf(s, 0);
            if (s.type === "marktime") parity ^= 1;
        }
        drafts.push(draft);

        // Raw offset: loops and rests keep it (they travel exactly the drill's
        // vector, or nothing); a transition moves the body by its root travel,
        // turned to the heading, while the drill moves by its own vector.
        let nx = ox[k];
        let nz = oz[k];
        if (draft.kind === "transition" && draft.root) {
            const [rx, rz] = rootAt(manifest, draft.root, 1);
            const cos = Math.cos(steps.heading[k]);
            const sin = Math.sin(steps.heading[k]);
            const dx = positions[(k + 1) * 2] - positions[k * 2];
            const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
            nx += rx * cos + rz * sin - dx;
            nz += -rx * sin + rz * cos - dz;
        }
        ox[k + 1] = nx;
        oz[k + 1] = nz;
        prev = s;
        prevRate = rate;
    }

    // 2. Targets: where the body should be against the drill at each
    // boundary. Foot on the dot: half the step's stride behind the dot after
    // a moving step (the ankle on the dot, the weight between the feet), on
    // the dot after a rest. Body center: on the dot.
    const tx = new Float64Array(K + 1);
    const tz = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) {
        if (states[k - 1].type !== "move" || steps.dot[k - 1] !== "foot")
            continue;
        tx[k] = -0.5 * (positions[k * 2] - positions[(k - 1) * 2]);
        tz[k] = -0.5 * (positions[k * 2 + 1] - positions[(k - 1) * 2 + 1]);
    }

    // 3. Anchors, where the correction pins the body to its target: the
    // boundaries next to a rest step, the ends, and at least every
    // MAX_ANCHOR_SPAN steps inside long runs (between two loop steps, never
    // across a transition). Foot on the dot also pins both ends of a step
    // whose target changes (a step-off, a close, a new direction or size), so
    // the half step behind swings to the new direction from count 8 to
    // count 1. Body center pins both ends of each of its steps.
    const anchor = new Uint8Array(K + 1);
    anchor[0] = 1;
    anchor[K] = 1;
    for (let b = 1; b < K; b++) {
        const before = drafts[b - 1];
        const after = drafts[b];
        if (
            (before.kind === "rest" && isRest(states[b - 1])) ||
            (after.kind === "rest" && isRest(states[b]))
        )
            anchor[b] = 1;
    }
    for (let b = 1; b <= K; b++) {
        if (steps.dot[b - 1] === "body") {
            anchor[b - 1] = anchor[b] = 1;
            continue;
        }
        if (Math.hypot(tx[b] - tx[b - 1], tz[b] - tz[b - 1]) <= TARGET_EPS)
            continue;
        anchor[b - 1] = anchor[b] = 1;
    }
    // the correction at each boundary: raw offset minus target
    const cx = new Float64Array(K + 1);
    const cz = new Float64Array(K + 1);
    for (let k = 0; k <= K; k++) {
        cx[k] = ox[k] - tx[k];
        cz[k] = oz[k] - tz[k];
    }
    let last = 0;
    for (let b = 1; b <= K; b++) {
        if (anchor[b]) {
            last = b;
            continue;
        }
        if (
            b - last >= MAX_ANCHOR_SPAN &&
            drafts[b - 1].kind === "loop" &&
            drafts[b].kind === "loop"
        ) {
            anchor[b] = 1;
            last = b;
        }
    }

    // 4. Events: one per transition step; consecutive loop or rest steps
    // with the same clip state merge, within one anchor span. Spans are
    // written as count clock values.
    const events: PlanEvent[] = [];
    let a = 0;
    let b = 0;
    const nextAnchor = (from: number) => {
        let x = from + 1;
        while (x < K && !anchor[x]) x++;
        return Math.min(x, K);
    };
    b = nextAnchor(0);
    for (let k = 0; k < K; k++) {
        if (k >= b) {
            a = b;
            b = nextAnchor(b);
        }
        const d = drafts[k];
        const heading = steps.heading[k];
        if (d.continued) {
            // the second step of a centered fade: the same fade, but in its
            // own correction span when an anchor splits the fade (the body
            // swings to the new direction during count 1)
            const fade = events[events.length - 1];
            if (fade && fade.a !== T[a])
                events.push({
                    ...fade,
                    count: T[k],
                    heading,
                    baseX: ox[k],
                    baseZ: oz[k],
                    a: T[a],
                    b: T[b],
                    oaX: cx[a],
                    oaZ: cz[a],
                    obX: cx[b],
                    obZ: cz[b],
                });
            continue;
        }
        const isTransition = d.kind === "transition";
        const oneStep = isTransition || d.kind === "crossfade";
        const lastEvent = events[events.length - 1];
        // The correction is constant across this step (the offset doesn't
        // change between its anchors): then a span change doesn't matter.
        const flat = (e: PlanEvent) => e.oaX === e.obX && e.oaZ === e.obZ;
        const sameSpan =
            lastEvent &&
            (lastEvent.a === T[a] ||
                (lastEvent.b === T[a] &&
                    flat(lastEvent) &&
                    cx[a] === lastEvent.obX &&
                    cz[a] === lastEvent.obZ &&
                    cx[b] === cx[a] &&
                    cz[b] === cz[a]));
        const inPhase = (e: PlanEvent) => {
            const off = mod2((e.phaseStart - d.phaseStart) * d.rate);
            return Math.min(off, 2 - off) < 1e-9;
        };
        const mergeable =
            !oneStep &&
            lastEvent &&
            lastEvent.kind === d.kind &&
            sameSpan &&
            lastEvent.clip === d.clip &&
            lastEvent.clip2 === d.clip2 &&
            lastEvent.rate === d.rate &&
            lastEvent.foot === d.foot &&
            Math.abs(lastEvent.heading - heading) < 1e-9 &&
            Math.abs(lastEvent.weight - d.weight) < 1e-6 &&
            typeof lastEvent.legYaw === "number" &&
            typeof d.legYaw === "number" &&
            Math.abs(lastEvent.legYaw - d.legYaw) < 1e-6 &&
            inPhase(lastEvent) &&
            Math.abs(lastEvent.baseX - ox[k]) < 1e-9 &&
            Math.abs(lastEvent.baseZ - oz[k]) < 1e-9;
        if (mergeable) {
            if (lastEvent.a !== T[a]) {
                // extend the event's flat span
                lastEvent.b = T[b];
                lastEvent.obX = cx[b];
                lastEvent.obZ = cz[b];
            }
            continue;
        }
        events.push({
            count: T[k],
            rate: d.rate,
            heading,
            foot: d.foot,
            kind: d.kind,
            clip: d.clip,
            clip2: d.clip2,
            weight: d.weight,
            legYaw: d.legYaw,
            phaseStart: d.phaseStart,
            root: d.root,
            prep: d.prep ?? null,
            fadeStart: d.fadeStart ?? T[k],
            fadeEnd: d.fadeEnd ?? T[k + 1],
            baseX: isTransition ? positions[k * 2] + ox[k] : ox[k],
            baseZ: isTransition ? positions[k * 2 + 1] + oz[k] : oz[k],
            a: T[a],
            b: T[b],
            oaX: cx[a],
            oaZ: cz[a],
            obX: cx[b],
            obZ: cz[b],
        });
    }
    return {
        events,
        counts: input.positions.length / 2,
        headings,
        turnSpan: input.turnSpan ?? null,
    };
}

/**
 * Where the whole performer faces at count clock `c` (radians about +Y):
 * the plan's headings at the count boundaries, turning the short way
 * between them.
 */
export function headingAt(plan: MarcherPlan, c: number): number {
    return headingFrom(plan.headings, c, plan.turnSpan);
}

/** Index of the event covering count clock `c`, starting the search at `hint`. */
export function eventIndexAt(plan: MarcherPlan, c: number, hint = 0): number {
    const ev = plan.events;
    if (ev.length === 0) return -1;
    let i = Math.min(Math.max(hint, 0), ev.length - 1);
    if (c >= ev[i].count && (i + 1 >= ev.length || c < ev[i + 1].count))
        return i;
    // binary search: the last event with count <= c
    let lo = 0;
    let hi = ev.length - 1;
    if (c < ev[0].count) return 0;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ev[mid].count <= c) lo = mid;
        else hi = mid - 1;
    }
    i = lo;
    return i;
}

/**
 * Where the body is at count clock `c`, given the drill position then
 * (`drillX`, `drillZ`). Writes x, z into `out`.
 */
export function bodyAt(
    manifest: Manifest,
    plan: MarcherPlan,
    index: number,
    c: number,
    drillX: number,
    drillZ: number,
    out: { x: number; z: number },
): void {
    const e = plan.events[index];
    if (!e) {
        out.x = drillX;
        out.z = drillZ;
        return;
    }
    const span = e.b - e.a;
    const t = span > 0 ? Math.min(Math.max((c - e.a) / span, 0), 1) : 0;
    const cx = -(e.oaX + (e.obX - e.oaX) * t);
    const cz = -(e.oaZ + (e.obZ - e.oaZ) * t);
    if (e.kind === "transition" && e.root) {
        const u = Math.min(Math.max((c - e.count) * e.rate, 0), 1);
        const [rx, rz] = rootAt(manifest, e.root, u);
        const cos = Math.cos(e.heading);
        const sin = Math.sin(e.heading);
        out.x = e.baseX + rx * cos + rz * sin + cx;
        out.z = e.baseZ - rx * sin + rz * cos + cz;
    } else {
        out.x = drillX + e.baseX + cx;
        out.z = drillZ + e.baseZ + cz;
    }
}

/** The bake row of `clip` with a prep landing on the platform at loop time `landing`. */
export function prepName(clip: string, landing: number): string {
    return `${clip}~prep${landing}`;
}

const MIRROR = "~mirror";

/**
 * The bake row of `clip` played off the right foot: baked from the clip's
 * mirrored partner (`mirrorClip.ts`), so slides and turns keep their travel
 * while the feet swap. It goes before any prep suffix.
 */
export function mirrorRow(clip: string): string {
    return clip + MIRROR;
}

/** Whether a row plays mirrored, and the row without the mirror marker. */
export function plainRow(row: string): { row: string; mirrored: boolean } {
    const i = row.indexOf(MIRROR);
    return i < 0
        ? { row, mirrored: false }
        : {
              row: row.slice(0, i) + row.slice(i + MIRROR.length),
              mirrored: true,
          };
}

/**
 * The rows an event plays: its clips, mirrored when its move stepped off
 * on the right foot, and as prep rows when it carries a prep step.
 */
export function eventRows(e: PlanEvent): [string, string | null] {
    const row = (c: string) => {
        const footed = e.foot === "right" ? mirrorRow(c) : c;
        return e.prep === null ? footed : prepName(footed, e.prep);
    };
    return [row(e.clip), e.clip2 ? row(e.clip2) : null];
}

/** Every row a set of plans plays: what to bake. */
export function plannedClips(plans: Iterable<MarcherPlan>): Set<string> {
    const out = new Set<string>();
    for (const p of plans)
        for (const e of p.events) {
            const [a, b] = eventRows(e);
            out.add(a);
            if (b) out.add(b);
        }
    return out;
}
