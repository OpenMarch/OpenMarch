// cspell:words Interpolant
/**
 * Marching on the platform of the foot (docs/3d/technique.md, owner,
 * 2026-10-09): on a close and in backward marching the weight is on the
 * ball of the foot, the heel about an inch off the ground. The clips are
 * keyed flat-footed, so this lifts them at bake time: each foot tips down
 * about its ankle (toes counter-rotated to stay flat on the ground) and the
 * whole body rises by what that drops the ball, so the ball stays where it
 * was and the heel comes up `HEEL_LIFT`.
 *
 * `platformWeight` says which clips go up on the platform and how much at
 * each point in the clip: backward loops all the way, a backward step-off
 * rising through its first half, and every close (halt) on the platform
 * until the feet meet, then down flat.
 */
import * as THREE from "three";

/** How far the heel comes off the ground (m): about an inch. */
export const HEEL_LIFT = 0.0254;

/** The back of the heel from the ankle in the bind pose (m): 1 cm up, 4.5 cm back. */
const HEEL_FROM_ANKLE = new THREE.Vector3(0, 0.01, -0.045);

/** What the transform needs from the skeleton, measured once per bake. */
export interface PlatformRig {
    /** The foot's tip (radians) at full weight, signed per side so it tips the toes down. */
    foot: Record<"L" | "R", number>;
    /** The toe's counter-tip, signed per side. */
    toe: Record<"L" | "R", number>;
    /** The body's rise at full weight, in the root bone's parent space. */
    lift: THREE.Vector3;
}

const smooth = (t: number) => {
    const x = Math.min(Math.max(t, 0), 1);
    return x * x * (3 - 2 * x);
};

const PREP = /~prep([01])$/;

/** A prep row's clip without its prep suffix (`prepName` in the planner). */
export function prepBase(name: string): string {
    return name.replace(PREP, "");
}

/**
 * A prep step on a two-count loop (docs/3d/technique.md, "Prep steps"):
 * up onto the platform over the 0.6 count before the landing at loop time
 * `landing`, and down flat over the half count after it, as the next step
 * swings.
 */
function prepPeak(landing: number): (u: number) => number {
    return (u) => {
        let d = u * 2 - landing;
        d -= 2 * Math.round(d / 2); // wrap to (-1, 1]
        return d < 0 ? smooth((d + 0.6) / 0.6) : 1 - smooth(d / 0.5);
    };
}

/** How much of the platform a clip uses at fraction `u` of its length, or null for none. */
export function platformWeight(name: string): ((u: number) => number) | null {
    const prep = PREP.exec(name);
    if (prep) {
        const base = platformWeight(prepBase(name));
        const peak = prepPeak(Number(prep[1]));
        return base ? (u) => Math.max(base(u), peak(u)) : peak;
    }
    if (/^back/.test(name)) return () => 1;
    if (/^stepoff_back/.test(name)) return (u) => smooth(u / 0.5);
    const halt = /^halt2?_(.*)$/.exec(name);
    if (!halt) return null;
    // a close: already up from a backward march, else rising as it starts;
    // down flat over the last fifth, as the feet meet
    const fromBack = /^back/.test(halt[1]);
    return (u) =>
        (fromBack ? 1 : smooth(u / 0.3)) * (1 - smooth((u - 0.8) / 0.2));
}

/** Bind-pose world matrix of a bone. */
function bindWorld(skeleton: THREE.Skeleton, name: string): THREE.Matrix4 {
    const i = skeleton.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error(`3D View: no bone ${name} for the platform`);
    return skeleton.boneInverses[i].clone().invert();
}

/**
 * The tip that lifts the heel `HEEL_LIFT` with the ball held in place, and
 * the body's rise that holds it, from the bind pose's ankle and ball.
 */
export function platformRig(skeleton: THREE.Skeleton): PlatformRig {
    const tilt = { L: 0, R: 0 };
    const toe = { L: 0, R: 0 };
    let rise = 0;
    for (const s of ["L", "R"] as const) {
        const foot = bindWorld(skeleton, `DEF-foot${s}`);
        const toeM = bindWorld(skeleton, `DEF-toe${s}`);
        const ankle = new THREE.Vector3().setFromMatrixPosition(foot);
        const ball = new THREE.Vector3().setFromMatrixPosition(toeM).sub(ankle);
        const h = HEEL_FROM_ANKLE;
        // a tip of a about world +X turns (y, z) into (y cos a − z sin a, y sin a + z cos a)
        const lifted = (a: number) => {
            const c = Math.cos(a);
            const n = Math.sin(a);
            const drop = ball.y - (ball.y * c - ball.z * n);
            const heelRise = h.y * c - h.z * n - h.y;
            return { total: drop + heelRise, drop };
        };
        let lo = 0;
        let hi = 0.6;
        for (let k = 0; k < 40; k++) {
            const mid = (lo + hi) / 2;
            if (lifted(mid).total < HEEL_LIFT) lo = mid;
            else hi = mid;
        }
        const a = (lo + hi) / 2;
        rise += lifted(a).drop / 2;
        // the bones' own X axes may point either way across the body
        const xFoot = new THREE.Vector3().setFromMatrixColumn(foot, 0);
        const xToe = new THREE.Vector3().setFromMatrixColumn(toeM, 0);
        tilt[s] = a * Math.sign(xFoot.x || 1);
        toe[s] = -a * Math.sign(xToe.x || 1);
    }
    const root = skeleton.bones.find((b) => b.name === "root");
    const lift = new THREE.Vector3(0, rise, 0);
    if (root?.parent) {
        root.parent.updateWorldMatrix(true, false);
        const toParent = new THREE.Matrix3().setFromMatrix4(
            root.parent.matrixWorld.clone().invert(),
        );
        lift.applyMatrix3(toParent);
    }
    return { foot: tilt, toe, lift };
}

/** Samples per clip the lifted tracks get at least, so a weight that varies has keys to vary on. */
const MIN_SAMPLES = 31;

/** A track's times merged with an even grid over `duration`, and its values there. */
function resampled(
    t: THREE.KeyframeTrack,
    duration: number,
): { times: number[]; values: Float32Array } {
    const set = new Set<number>(Array.from(t.times));
    for (let i = 0; i < MIN_SAMPLES; i++)
        set.add((i / (MIN_SAMPLES - 1)) * duration);
    const times = [...set].sort((a, b) => a - b);
    const size = t.getValueSize();
    // three builds this at runtime; its type definitions leave it out
    const sampler = (
        t as unknown as { createInterpolant(): THREE.Interpolant }
    ).createInterpolant();
    const values = new Float32Array(times.length * size);
    times.forEach((time, i) => values.set(sampler.evaluate(time), i * size));
    return { times, values };
}

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

/** `clip` on the platform by `weight` (from `platformWeight`), as a new clip of the same name. */
export function platformClip(
    clip: THREE.AnimationClip,
    rig: PlatformRig,
    weight: (u: number) => number,
): THREE.AnimationClip {
    const d = clip.duration || 1;
    const tracks = clip.tracks.map((t) => {
        const tip = /^DEF-foot([LR])\.quaternion$/.exec(t.name);
        const toeTip = /^DEF-toe([LR])\.quaternion$/.exec(t.name);
        if (tip || toeTip) {
            const angle = tip
                ? rig.foot[tip[1] as "L" | "R"]
                : rig.toe[toeTip![1] as "L" | "R"];
            const { times, values } = resampled(t, d);
            for (let i = 0; i < times.length; i++) {
                const w = weight(times[i] / d);
                if (w === 0) continue;
                _q.fromArray(values, i * 4).normalize();
                _r.setFromAxisAngle(X, angle * w);
                _q.multiply(_r).toArray(values, i * 4);
            }
            return new THREE.QuaternionKeyframeTrack(
                t.name,
                times,
                Array.from(values),
            );
        }
        if (t.name === "root.position") {
            const { times, values } = resampled(t, d);
            for (let i = 0; i < times.length; i++) {
                const w = weight(times[i] / d);
                values[i * 3] += rig.lift.x * w;
                values[i * 3 + 1] += rig.lift.y * w;
                values[i * 3 + 2] += rig.lift.z * w;
            }
            return new THREE.VectorKeyframeTrack(
                t.name,
                times,
                Array.from(values),
            );
        }
        return t;
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
