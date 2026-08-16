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
    const index = _getTimestampIndex(timestamps, timeMs);

    return appearances[index]!;
};

/**
 * @param appearanceTimelines list of all `MarcherAppearanceTimeline`s in the show.
 * @param timeMs timestamp in milliseconds to get appearances for.
 * @returns The appearance in effect for each marcher at `timeMs`, in the same order as
 * `appearanceTimelines`. Each entry is the same object reference stored in the
 * timeline (appearance keyframes are guaranteed to differ from their predecessor —
 * see `_toMarcherAppearanceTimeline`), so callers can skip re-applying an appearance
 * by comparing references instead of doing a deep-equality check every frame.
 */
export const getAllAppearancesAtTime = (
    appearanceTimelines: MarcherAppearanceTimeline[],
    timeMs: number,
): ResolvedPerformerAppearance[] =>
    appearanceTimelines.map((timeline) =>
        getAppearanceAtTime(timeline, timeMs),
    );
