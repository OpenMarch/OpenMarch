import { _getTimestampIndex } from "@openmarch/core";
import { MarcherAppearanceTimeline } from "./type";
import { ResolvedPerformerAppearance } from "@/entity-components/appearance";

/**
 * Appearance keyframes are a step function — colors/shape don't tween the way
 * coordinates do — so this is a binary-search "most recent timestamp ≤ timeMs"
 * lookup, reusing the same search `@openmarch/core` uses for coordinates
 * (see `get-coordinates-at-time.ts`) instead of reimplementing it.
 *
 * @param timeline A single marcher's appearance timeline for the whole show.
 * @param timeMs Current time in milliseconds.
 * @returns The `ResolvedPerformerAppearance` in effect at `timeMs`.
 */
export const getAppearanceAtTime = (
    timeline: MarcherAppearanceTimeline,
    timeMs: number,
): ResolvedPerformerAppearance => {
    const { timestamps, appearances } = timeline;
    // `timestamps` is a `Float32Array` (see `MarcherAppearanceTimeline`), so every
    // keyframe was silently rounded to Float32 precision when the timeline was built.
    // `timeMs` comes straight from the frame clock as a full float64. When paused
    // exactly on a page boundary, the two are derived from the same page fields via
    // the same arithmetic, so at float64 precision they're bit-identical — but the
    // keyframe's lossy rounding can nudge it a sub-millisecond above or below that
    // shared value. Round the query through the same conversion so both sides compare
    // at identical precision; unlike coordinates (which tween, so landing a hair short
    // of a keyframe is visually invisible), appearance is a step function, so missing
    // the exact keyframe returns a completely different (stale, previous) result.
    const index = _getTimestampIndex(timestamps, Math.fround(timeMs));

    return appearances[index]!;
};

/**
 * @param appearanceTimelines list of all `MarcherAppearanceTimeline`s in the show.
 * @param timeMs timestamp in milliseconds to get appearances for.
 * @returns The appearance in effect for each marcher at `timeMs`, in the same order as
 * `appearanceTimelines`. Each entry is the same object reference stored in the
 * timeline (appearance keyframes are guaranteed to differ from their predecessor —
 * see `dbToMarcherAppearanceTimeline`), so callers can skip re-applying an appearance
 * by comparing references instead of doing a deep-equality check every frame.
 */
export const getAllAppearancesAtTime = (
    appearanceTimelines: MarcherAppearanceTimeline[],
    timeMs: number,
): ResolvedPerformerAppearance[] =>
    appearanceTimelines.map((timeline) =>
        getAppearanceAtTime(timeline, timeMs),
    );
