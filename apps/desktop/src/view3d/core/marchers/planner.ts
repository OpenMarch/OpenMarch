/**
 * Which clip each 3D View marcher plays on each count, and where its body is
 * (ADR 0002 D-7; om-pose `docs/openmarch-3d.md`, "Driving clips from drill").
 *
 * The planner doesn't know about pages. For every count it looks at how far
 * the marcher's dot moves during that count and in which direction:
 *
 * - no travel: a rest count, `marktime` while any marcher moves on that
 *   count, `attention` while the whole band holds;
 * - travel: a step along that count's own vector. The family and leg turn
 *   come from `travelDirection`, the two sizes and weight from `pickBlend`.
 *   A curved path is a new vector every count. A run of slide counts faces
 *   the 50: forward when the run ends nearer the 50 than it started, backward
 *   when farther (`facing.ts`).
 *
 * From the sequence of counts it builds clip events:
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
} from "../../vendor/om-pose/step-blend.js";
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

export interface PlanInput {
    manifest: Manifest;
    heightClass: HeightClass;
    /** Heading of the upper body, radians about +Y (0 faces the audience). */
    heading: number;
    /** Drill position at each count boundary 0..K: x, z interleaved (world meters). */
    positions: Float64Array;
    /** Tempo of each count 0..K-1. */
    bpm: Float64Array;
    /** 1 when any marcher travels during that count. */
    bandMoving: Uint8Array;
    /**
     * What the dot marks (docs/3d/technique.md): `foot` (the default) puts
     * the landing foot's ankle on the dot at the end of each count of a
     * move, the body half a step behind it with the weight 50-50; `body`
     * keeps the body's center over the dot. Not offered in the UI yet.
     */
    dotMode?: DotMode;
}

/** What a marcher's dot marks: the landing foot's ankle, or the body's center. */
export type DotMode = "foot" | "body";

export type EventKind = "rest" | "loop" | "transition" | "crossfade";

export interface PlanEvent {
    /** First count it covers; it lasts until the next event's count. */
    count: number;
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
    /** The count clock value at which the clip is at its time 0. */
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
    /** The correction span this event lies in: counts a..b and the corrections there (raw offset minus target). */
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

/**
 * Which way each count's slide goes relative to the 50 (x = 0): decided per
 * run of consecutive slide counts in the same lateral direction, by whether
 * the run ends nearer the 50 than it started. One gait per run, so a slide
 * across the 50 doesn't flip halfway.
 */
function slideSenses(input: PlanInput): SlideSense[] {
    const { positions, heading } = input;
    const K = positions.length / 2 - 1;
    const out: SlideSense[] = new Array(K).fill(null);
    let k = 0;
    while (k < K) {
        const dx = positions[(k + 1) * 2] - positions[k * 2];
        const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
        const side = Math.sign(dx);
        if (
            !(Math.hypot(dx, dz) > REST_EPS) ||
            side === 0 ||
            !isSlide(travelDirection(dx, dz, heading))
        ) {
            k++;
            continue;
        }
        let end = k + 1;
        while (end < K) {
            const ex = positions[(end + 1) * 2] - positions[end * 2];
            const ez = positions[(end + 1) * 2 + 1] - positions[end * 2 + 1];
            if (
                !(Math.hypot(ex, ez) > REST_EPS) ||
                Math.sign(ex) !== side ||
                !isSlide(travelDirection(ex, ez, heading))
            )
                break;
            end++;
        }
        const x0 = Math.abs(positions[k * 2]);
        const x1 = Math.abs(positions[end * 2]);
        const sense: SlideSense =
            x1 < x0 - REST_EPS ? "toward" : x1 > x0 + REST_EPS ? "away" : null;
        for (let i = k; i < end; i++) out[i] = sense;
        k = end;
    }
    return out;
}

/** The states of every count from the drill. */
function countStates(input: PlanInput): State[] {
    const { positions, bpm, bandMoving, manifest, heightClass, heading } =
        input;
    const K = positions.length / 2 - 1;
    const senses = slideSenses(input);
    const out: State[] = [];
    for (let k = 0; k < K; k++) {
        const dx = positions[(k + 1) * 2] - positions[k * 2];
        const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
        const d = Math.hypot(dx, dz);
        if (!(d > REST_EPS)) {
            out.push({ type: bandMoving[k] ? "marktime" : "attention" });
            continue;
        }
        const dir = travelDirection(dx, dz, heading, senses[k]);
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
    root: TurnedPair | ClipPair | null;
    /** Crossfades: the fade window. */
    fadeStart?: number;
    fadeEnd?: number;
    /** The second count of a two-count crossfade: no event of its own. */
    continued?: boolean;
    /** See `PlanEvent.prep`. */
    prep?: number | null;
}

/** A single clip's root travel as a pair (for change and mark time clips). */
function soloPair(manifest: Manifest, name: string): ClipPair {
    const c = clipByName(manifest, name);
    return { a: name, b: null, weight: 0, clipA: c, clipB: c };
}

/** Root travel at u of a transition's count, in the marcher's frame. */
export function rootAt(
    manifest: Manifest,
    pair: TurnedPair | ClipPair,
    u: number,
): [number, number] {
    return turnRoot(manifest, pair as TurnedPair, u);
}

/** Plans one marcher's clips and body placement for the whole show. */
// eslint-disable-next-line max-lines-per-function
export function planMarcher(input: PlanInput): MarcherPlan {
    const { manifest, heightClass: h, heading, positions } = input;
    const sfx = classSuffix(h);
    const names = clipNames(manifest);
    const has = (base: string) => names.has(base + sfx);
    const states = countStates(input);
    const K = states.length;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);

    // 1. Clip drafts per count, and the raw offset (body - drill) at each boundary.
    const drafts: Draft[] = [];
    const ox = new Float64Array(K + 1);
    const oz = new Float64Array(K + 1);
    let prev: State = { type: "attention" };
    let parity = 0; // the running loop's time on this count: 0 or 1 (x 0.5 s)
    let prevYaw = 0;
    for (let k = 0; k < K; k++) {
        const s = states[k];
        // the loop's time on this count, before this count updates it
        const p = parity;
        let draft: Draft;
        const loopOf = (st: State, yaw: Draft["legYaw"]): Draft =>
            st.type === "move"
                ? {
                      kind: "loop",
                      clip: st.pick.a,
                      clip2: st.pick.weight > 0 ? st.pick.b : null,
                      weight: st.pick.weight,
                      legYaw: yaw,
                      phaseStart: k - p,
                      root: null,
                  }
                : {
                      kind: "rest",
                      clip: restBase(st) + sfx,
                      clip2: null,
                      weight: 0,
                      legYaw: 0,
                      // attention is still; only mark time's phase matters
                      phaseStart: st.type === "attention" ? 0 : k - p,
                      root: null,
                  };
        /**
         * A halt keeps the closing leg on its line: the residual turn that
         * squares the legs waits until the foot has closed, the last fifth
         * of the count, instead of easing through the clip's swing window.
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
                phaseStart: k,
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
         * A change of move at this count. Centered on the boundary when the
         * previous count is a plain loop of the old move: that draft becomes
         * the fade's first count and this one continues it. Otherwise the fade
         * covers this count alone.
         */
        const crossfade = (from: State, to: State): Draft => {
            const a = soloLoop(from);
            const b = soloLoop(to);
            const last = drafts[k - 1];
            const centered =
                k > 0 &&
                last !== undefined &&
                last.kind === "loop" &&
                !last.continued;
            const fade: Draft = {
                kind: "crossfade",
                clip: a,
                clip2: b === a ? null : b,
                weight: 0,
                legYaw: [yawOf(from), yawOf(to), 0, 1],
                phaseStart: centered ? last.phaseStart : k - p,
                root: null,
                fadeStart: centered ? k - 0.5 : k,
                fadeEnd: centered ? k + 0.5 : k + 1,
                // the old move's last landing, at boundary k, is the prep step
                prep: centered ? (((k - last.phaseStart) % 2) + 2) % 2 : null,
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
                parity = 0; // stepoff covers this count; the loop starts at time 0 next count
                prevYaw = s.dir.legYaw;
            } else {
                const sameMove =
                    prev.type === "move" &&
                    prev.family === s.family &&
                    Math.abs(prev.d - s.d) <= SIZE_JUMP;
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
        // vector, or nothing); a transition moves the body by its root travel
        // while the drill moves by its own vector.
        let nx = ox[k];
        let nz = oz[k];
        if (draft.kind === "transition" && draft.root) {
            const [rx, rz] = rootAt(manifest, draft.root, 1);
            const dx = positions[(k + 1) * 2] - positions[k * 2];
            const dz = positions[(k + 1) * 2 + 1] - positions[k * 2 + 1];
            nx += rx * cos + rz * sin - dx;
            nz += -rx * sin + rz * cos - dz;
        }
        ox[k + 1] = nx;
        oz[k + 1] = nz;
        prev = s;
    }

    // 2. Targets: where the body should be against the drill at each
    // boundary. Foot on the dot: half the count's step behind the dot after
    // a moving count (the ankle on the dot, the weight between the feet), on
    // the dot after a rest. Body center: on the dot.
    const dotMode: DotMode = input.dotMode ?? "foot";
    const tx = new Float64Array(K + 1);
    const tz = new Float64Array(K + 1);
    if (dotMode === "foot")
        for (let k = 1; k <= K; k++) {
            if (states[k - 1].type !== "move") continue;
            tx[k] = -0.5 * (positions[k * 2] - positions[(k - 1) * 2]);
            tz[k] = -0.5 * (positions[k * 2 + 1] - positions[(k - 1) * 2 + 1]);
        }

    // 3. Anchors, where the correction pins the body to its target: the
    // boundaries next to a rest count, the ends, and at least every
    // MAX_ANCHOR_SPAN counts inside long runs (between two loop counts, never
    // across a transition). Foot on the dot also pins both ends of a count
    // whose target changes (a step-off, a close, a new direction or size), so
    // the half step behind swings to the new direction from count 8 to
    // count 1. Body center pins every boundary.
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
        if (dotMode === "body") {
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

    // 4. Events: one per transition count; consecutive loop or rest counts
    // with the same clip state merge, within one anchor span.
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
        if (d.continued) {
            // the second count of a centered fade: the same fade, but in its
            // own correction span when an anchor splits the fade (the body
            // swings to the new direction during count 1)
            const fade = events[events.length - 1];
            if (fade && fade.a !== a)
                events.push({
                    ...fade,
                    count: k,
                    baseX: ox[k],
                    baseZ: oz[k],
                    a,
                    b,
                    oaX: cx[a],
                    oaZ: cz[a],
                    obX: cx[b],
                    obZ: cz[b],
                });
            continue;
        }
        const isTransition = d.kind === "transition";
        const oneCount = isTransition || d.kind === "crossfade";
        const lastEvent = events[events.length - 1];
        // The correction is constant across this count (the offset doesn't
        // change between its anchors): then a span change doesn't matter.
        const flat = (e: PlanEvent) => e.oaX === e.obX && e.oaZ === e.obZ;
        const sameSpan =
            lastEvent &&
            (lastEvent.a === a ||
                (lastEvent.b === a &&
                    flat(lastEvent) &&
                    cx[a] === lastEvent.obX &&
                    cz[a] === lastEvent.obZ &&
                    cx[b] === cx[a] &&
                    cz[b] === cz[a]));
        const mergeable =
            !oneCount &&
            lastEvent &&
            lastEvent.kind === d.kind &&
            sameSpan &&
            lastEvent.clip === d.clip &&
            lastEvent.clip2 === d.clip2 &&
            Math.abs(lastEvent.weight - d.weight) < 1e-6 &&
            typeof lastEvent.legYaw === "number" &&
            typeof d.legYaw === "number" &&
            Math.abs(lastEvent.legYaw - d.legYaw) < 1e-6 &&
            Math.abs(lastEvent.phaseStart - d.phaseStart) % 2 === 0 &&
            Math.abs(lastEvent.baseX - ox[k]) < 1e-9 &&
            Math.abs(lastEvent.baseZ - oz[k]) < 1e-9;
        if (mergeable) {
            if (lastEvent.a !== a) {
                // extend the event's flat span
                lastEvent.b = b;
                lastEvent.obX = cx[b];
                lastEvent.obZ = cz[b];
            }
            continue;
        }
        events.push({
            count: k,
            kind: d.kind,
            clip: d.clip,
            clip2: d.clip2,
            weight: d.weight,
            legYaw: d.legYaw,
            phaseStart: d.phaseStart,
            root: d.root,
            prep: d.prep ?? null,
            fadeStart: d.fadeStart ?? k,
            fadeEnd: d.fadeEnd ?? k + 1,
            baseX: isTransition ? positions[k * 2] + ox[k] : ox[k],
            baseZ: isTransition ? positions[k * 2 + 1] + oz[k] : oz[k],
            a,
            b,
            oaX: cx[a],
            oaZ: cz[a],
            obX: cx[b],
            obZ: cz[b],
        });
    }
    return { events, counts: K + 1 };
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
    heading: number,
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
        const u = Math.min(Math.max(c - e.count, 0), 1);
        const [rx, rz] = rootAt(manifest, e.root, u);
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
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

/** The rows an event plays: its clips, as prep rows when it carries a prep step. */
export function eventRows(e: PlanEvent): [string, string | null] {
    const row = (c: string) => (e.prep === null ? c : prepName(c, e.prep));
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
