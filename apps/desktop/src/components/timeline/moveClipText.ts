import type { FlagPage } from "@/timeline/timelinePlayhead";
import { moveLabels } from "@/timeline/timelineViewModel";
import type { TimelineInput } from "./Timeline";
import { isolatedTimelineName } from "./TimelineIsolationBar";

type StoredRange = {
    readonly id: number;
    readonly start: number;
    readonly end: number;
    readonly name?: string | null;
};

/**
 * What the clips of moves say (docs/timeline/ui.md UI-14, round-2 review), for `TimelineModePanel`:
 *
 * - **Label:** the move's label (`moveLabels`: its name, "Move 2").
 * - **Accessible name:** "<label>, move, Page 3, counts 1–4", in counts as designers count, not
 *   beats. The clip adds ", selected" itself.
 * - **Description:** why a clip is dashed where it is, "Overridden by Move 4 on Page 3, counts
 *   1–4", from `overriddenBy` (the other timeline whose spans take every member there). A page's
 *   own timeline is named "Page 4's move". The same text goes to the Move card, by stored id.
 */
export function describeMoveClips<T extends TimelineInput>({
    clips,
    storedTimelines,
    pageBoxes,
    pages,
}: {
    clips: readonly T[];
    storedTimelines: readonly StoredRange[];
    pageBoxes: readonly { readonly start: number; readonly end: number }[];
    pages: readonly (FlagPage & { readonly name: string })[];
}): { clips: T[]; overridden: Map<number, string> } {
    const labels = moveLabels(storedTimelines, pageBoxes);
    const nameOf = (id: number) => {
        const label = labels.get(id);
        if (label !== undefined) return label;
        const stored = storedTimelines.find((t) => t.id === id);
        return stored ? isolatedTimelineName(stored, pages) : `another move`;
    };
    const overridden = new Map<number, string>();
    const described = clips.map((clip) => {
        const id = clip.linkId === undefined ? undefined : Number(clip.linkId);
        const label =
            id === undefined ? clip.label : (labels.get(id) ?? clip.label);
        const where = isolatedTimelineName(
            { start: clip.startBeatIndex, end: clip.endBeatIndex },
            pages,
        );
        const note =
            clip.overriddenBy && clip.overriddenBy.length > 0
                ? clip.overriddenBy
                      .map(
                          (o) =>
                              `Overridden by ${nameOf(o.timelineId)} on ${isolatedTimelineName(o, pages)}`,
                      )
                      .join("; ")
                : undefined;
        if (id !== undefined && note) overridden.set(id, note);
        return {
            ...clip,
            label,
            accessibleName: `${label}, move, ${where}`,
            ...(note ? { description: note } : {}),
        };
    });
    return { clips: described, overridden };
}
