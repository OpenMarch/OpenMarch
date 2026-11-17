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

/**
 * A two-count loop started a count later: every keyed track turned half way
 * round. Tracks that hold one value (two keys) are left alone.
 */
export function shiftLoop(
    clip: THREE.AnimationClip,
    name: string,
): THREE.AnimationClip {
    const tracks = clip.tracks.map((t) => {
        const keys = t.times.length;
        const size = t.getValueSize();
        const n = keys - 1; // the last key repeats the first
        if (keys <= 2 || n % 2 !== 0) return t.clone();
        const values = new Float32Array(t.values.length);
        for (let i = 0; i < keys; i++) {
            const from = ((i + n / 2) % n) * size;
            for (let k = 0; k < size; k++)
                values[i * size + k] = t.values[from + k];
        }
        const track = t.clone();
        track.values = values;
        return track;
    });
    return new THREE.AnimationClip(name, clip.duration, tracks);
}

/**
 * A clip's last pose held for the clip's whole length: the still count of a
 * crab stop-and-go holds where its stop ended (`still_of` in the manifest).
 */
export function stillClip(
    clip: THREE.AnimationClip,
    name: string,
): THREE.AnimationClip {
    const tracks = clip.tracks.map((t) => {
        const size = t.getValueSize();
        const last = t.values.slice(t.values.length - size);
        const track = t.clone();
        track.times = Float32Array.from([0, clip.duration]);
        const values = new Float32Array(size * 2);
        values.set(last, 0);
        values.set(last, size);
        track.values = values;
        return track;
    });
    return new THREE.AnimationClip(name, clip.duration, tracks);
}

/**
 * The clip whose mirror plays as `name`: slides, crabs and built turns
 * swap sides (both moves of a direction change, `place_8to5__slideL8to5`).
 */
export function mirrorName(name: string): string {
    return name
        .replace(
            /slide([LR])/g,
            (_, s: string) => `slide${s === "L" ? "R" : "L"}`,
        )
        .replace(
            /crab([LR])/g,
            (_, s: string) => `crab${s === "L" ? "R" : "L"}`,
        )
        .replace(
            /_([LR])(45|90)/g,
            (_, s: string, d: string) => `_${s === "L" ? "R" : "L"}${d}`,
        );
}
