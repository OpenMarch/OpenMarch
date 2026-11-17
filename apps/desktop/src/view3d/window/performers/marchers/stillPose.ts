/**
 * Puts back the tracks a clip pack stores once (scripts/view3d-assets/pack-om-pose.mjs).
 *
 * A track that holds one value for a whole clip, at the pack's still pose,
 * isn't stored in the clip: the pack's `__still` animation has it once. Each
 * clip gets a 2-key copy of every still track it lacks, over its own length,
 * so it plays exactly as the unpacked clip did. The pack script imports this
 * to check its packs, so keep it free of the app's imports.
 */
import type { AnimationClip } from "three";

/** The pack's still pose animation. */
export const STILL_POSE = "__still";

/** The clips without the still pose, each with its missing still tracks added. */
export function restoreStillPose(clips: AnimationClip[]): AnimationClip[] {
    const still = clips.find((c) => c.name === STILL_POSE);
    if (!still) return clips;
    const out = clips.filter((c) => c !== still);
    for (const clip of out) {
        const have = new Set(clip.tracks.map((t) => t.name));
        for (const t of still.tracks) {
            if (have.has(t.name)) continue;
            const track = t.clone();
            track.times = Float32Array.from([0, clip.duration]);
            clip.tracks.push(track);
        }
    }
    return out;
}
