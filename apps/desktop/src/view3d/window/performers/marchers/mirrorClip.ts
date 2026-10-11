/**
 * Mirrors a clip left to right, so a band can step off on the right foot
 * (docs/3d/instruments.md follows; owner, 2026-10-09). The v4 skeleton's
 * left and right bones are exact mirror images, so a pose reflected in the
 * body's sagittal plane is: swap each `.L` track with its `.R` partner,
 * negate the y and z of every local rotation, and negate the x of every
 * local translation. Travel mirrors too, so a mirrored left slide is a right
 * slide: `mirrorName` says which source clip a mirrored row comes from.
 */
import * as THREE from "three";

/** GLTFLoader's sanitized bone names end in L or R without the dot. */
const SIDE = /^(.*?)([LR])(\.(quaternion|position|scale))$/;

function swapSide(name: string): string {
    const m = SIDE.exec(name);
    if (!m) return name;
    return `${m[1]}${m[2] === "L" ? "R" : "L"}${m[3]}`;
}

export function mirrorClip(
    clip: THREE.AnimationClip,
    name: string,
): THREE.AnimationClip {
    const tracks = clip.tracks.map((t) => {
        const values = Float32Array.from(t.values);
        if (t instanceof THREE.QuaternionKeyframeTrack) {
            for (let i = 0; i < values.length; i += 4) {
                values[i + 1] = -values[i + 1];
                values[i + 2] = -values[i + 2];
            }
            return new THREE.QuaternionKeyframeTrack(
                swapSide(t.name),
                Array.from(t.times),
                Array.from(values),
            );
        }
        if (t instanceof THREE.VectorKeyframeTrack) {
            if (t.name.endsWith(".position"))
                for (let i = 0; i < values.length; i += 3)
                    values[i] = -values[i];
            return new THREE.VectorKeyframeTrack(
                swapSide(t.name),
                Array.from(t.times),
                Array.from(values),
            );
        }
        return t.clone();
    });
    return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** The clip whose mirror plays as `name`: slides and built turns swap sides. */
export function mirrorName(name: string): string {
    return name
        .replace(
            /slide([LR])/g,
            (_, s: string) => `slide${s === "L" ? "R" : "L"}`,
        )
        .replace(/_([LR])45/g, (_, s: string) => `_${s === "L" ? "R" : "L"}45`);
}
