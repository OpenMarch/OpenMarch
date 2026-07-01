import type Beat from "@/global/classes/Beat";
import { resolveLightingEffectWindowMs } from "@openmarch/core";

/**
 * Converts a lighting effect's beat window (offsets from scene start) into scene‑local milliseconds.
 *
 * @param beatsSortedAscending - All show beats sorted by position ascending
 * @param sceneStartBeatPosition - Global beat position where the lighting scene begins (typically `page.beats[0].position`).
 */
export function lightingEffectBeatWindowToSceneLocalMs(
    beatsSortedAscending: Beat[],
    sceneStartBeatPosition: number,
    startOffsetBeats: number,
    durationBeats: number,
): { startMs: number; durationMs: number } {
    return resolveLightingEffectWindowMs(
        beatsSortedAscending,
        sceneStartBeatPosition,
        { startOffsetBeats, durationBeats },
    );
}
