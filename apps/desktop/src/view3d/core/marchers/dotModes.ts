/**
 * What each count's dot marks, from the stored performer settings (ADR 0004 D-4;
 * docs/3d/technique.md, "Foot on the dot and body center"): a set's dot mode covers the counts of
 * the move into it, and a set with no stored mode uses the show default, so a set's mode reverts
 * on the next set.
 *
 * Pure: no React or database.
 */
import type { DotMode } from "./planner";

/**
 * The dot mode of every count on the count clock.
 *
 * @param pages - each set with the beats of the move into it (`Page.beats`)
 * @param countBeatIds - the beat id of each count, in the count clock's order
 * @param stored - the sets with a stored dot mode
 * @param showDefault - the show's default (`performerDefaults.dotMode`)
 */
export function dotModesPerCount(
    pages: readonly { id: number; beats: readonly { id: number }[] }[],
    countBeatIds: readonly number[],
    stored: readonly { pageId: number; dotMode: DotMode }[],
    showDefault: DotMode,
): DotMode[] {
    const out = new Array<DotMode>(countBeatIds.length).fill(showDefault);
    if (stored.length === 0) return out;
    const countOf = new Map(countBeatIds.map((id, k) => [id, k]));
    const modeOf = new Map(stored.map((s) => [s.pageId, s.dotMode]));
    for (const page of pages) {
        const mode = modeOf.get(page.id);
        if (!mode) continue;
        for (const beat of page.beats) {
            const k = countOf.get(beat.id);
            if (k !== undefined) out[k] = mode;
        }
    }
    return out;
}
