import type Beat from "@/global/classes/Beat";
import { compareBeats } from "@/global/classes/Beat";

/**
 * Converts a lighting effect's beat window (offsets from scene start) into scene‑local milliseconds.
 *
 * @param beatsSortedAscending - All show beats sorted by {@link compareBeats}
 * @param sceneStartBeatPosition - Global beat position where the lighting scene begins (typically `page.beats[0].position`).
 */
export function lightingEffectBeatWindowToSceneLocalMs(
    beatsSortedAscending: Beat[],
    sceneStartBeatPosition: number,
    startOffsetBeats: number,
    durationBeats: number,
): { startMs: number; durationMs: number } {
    const beats = [...beatsSortedAscending].sort(compareBeats);

    let sceneIdx = beats.findIndex(
        (b) => b.position === sceneStartBeatPosition,
    );
    if (sceneIdx < 0) {
        sceneIdx = beats.findIndex((b) => b.position >= sceneStartBeatPosition);
    }
    if (sceneIdx < 0) return { startMs: 0, durationMs: 0 };

    const startIdx = sceneIdx + startOffsetBeats;
    const clampedDuration = Math.max(0, durationBeats);

    let startMs = 0;
    for (let i = sceneIdx; i < Math.min(startIdx, beats.length); i++) {
        startMs += Math.max(0, beats[i]!.duration) * 1000;
    }

    let durationMs = 0;
    for (
        let i = startIdx;
        i < Math.min(startIdx + clampedDuration, beats.length);
        i++
    ) {
        durationMs += Math.max(0, beats[i]!.duration) * 1000;
    }

    return {
        startMs: Math.round(startMs),
        durationMs: Math.round(durationMs),
    };
}
