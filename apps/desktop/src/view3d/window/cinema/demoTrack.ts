/**
 * A demo camera track for the Director, until shots are stored in the show:
 * it walks the built-in presets across the show's counts.
 */
import {
    BUILTIN_PRESETS,
    shotsFromCounts,
    type CinemaShot,
    type CinemaShotInCounts,
} from "@openmarch/core";

/** A new shot starts every this many counts. */
export const DEMO_SHOT_COUNTS = 16;

/**
 * One shot every {@link DEMO_SHOT_COUNTS} counts, cycling the built-in
 * presets in their order and skipping a preset on the same rig as the shot
 * before it. Each shot takes its preset's transition, at the transition's
 * default length. A show with no counts gets the first preset alone.
 *
 * @param totalCounts - how many counts the show has
 * @param countToMs - show time of a count, in milliseconds
 */
export function demoTrack(
    totalCounts: number,
    countToMs: (count: number) => number,
): CinemaShot[] {
    const shotCount = Math.max(
        1,
        Number.isFinite(totalCounts)
            ? Math.ceil(totalCounts / DEMO_SHOT_COUNTS)
            : 1,
    );
    const shots: CinemaShotInCounts[] = [];
    let next = 0;
    let previousRig: string | null = null;
    while (shots.length < shotCount) {
        const preset = BUILTIN_PRESETS[next % BUILTIN_PRESETS.length];
        next++;
        const rig = JSON.stringify(preset.shot.rig);
        if (rig === previousRig) continue;
        previousRig = rig;
        shots.push({
            ...preset.shot,
            id: `demo-${shots.length}-${preset.id}`,
            startCount: shots.length * DEMO_SHOT_COUNTS,
        });
    }
    return shotsFromCounts(shots, countToMs);
}
