import { useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useBasicLocksStore, lockedOnBox } from "@/timeline/basicLocks";
import { pointsInBox } from "@/timeline/basicSimple";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import { holdTerms } from "@/timeline/holdTerms";
import tolgee from "@/global/singletons/Tolgee";
import { removePositionAtBeatMutationOptions } from "@/hooks/queries/useMarcherPages";

/** A mid-page position on the counts strip: its beat, its page box, and whose it is. */
export interface BasicPoint {
    readonly beat: number;
    readonly box: { readonly start: number; readonly end: number };
    readonly marcherIds: readonly number[];
    /**
     * Why **Remove this count's position** can't run here, or `null` when it can: every marcher
     * with the tick is Held from the count, so the point is the hold's arrival
     * (`rejoinedHoldEnd`). The menu shows the entry unavailable, with this, rather than a dead click.
     */
    readonly removeReason: string | null;
}

/**
 * The selected marchers' mid-page positions (UI-19: ticks on the counts strip), and
 * **Remove this count's position**, which takes each one's position there away
 * (`removePositionAtBeat`). Marchers locked on a page (`basicLocks`) show no ticks there: Basic
 * can't remove them.
 */
export function useBasicPoints(): {
    points: readonly BasicPoint[];
    removePoint: (point: BasicPoint) => void;
} {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const rows = useBasicLocksStore((s) => s.rows);
    const boxes = useBasicLocksStore((s) => s.boxes);
    const locked = useBasicLocksStore((s) => s.locked);
    const marks = useHeldMarksStore((s) => s.marks);
    const idsKey = (selected ?? []).map((m) => m.id).join(",");
    const points = useMemo(() => {
        if (!rows || idsKey === "") return [];
        const ids = idsKey.split(",").map(Number);
        const out: BasicPoint[] = [];
        for (const box of boxes) {
            const lockedHere = lockedOnBox(box, { boxes, locked });
            const byBeat = new Map<number, number[]>();
            for (const id of ids) {
                if (lockedHere.has(id)) continue;
                for (const beat of pointsInBox(rows, id, box))
                    byBeat.set(beat, [...(byBeat.get(beat) ?? []), id]);
            }
            for (const [beat, marcherIds] of byBeat) {
                const heldFromHere = marcherIds.filter((id) =>
                    marks.some((m) => m.marcherId === id && m.start === beat),
                );
                out.push({
                    beat,
                    box: { start: box.start, end: box.end },
                    marcherIds,
                    removeReason:
                        heldFromHere.length === marcherIds.length
                            ? tolgee.t("timeline.basic.point.removeHeld", {
                                  ...holdTerms(),
                                  count: marcherIds.length,
                              })
                            : null,
                });
            }
        }
        return out.sort((a, b) => a.beat - b.beat);
    }, [rows, boxes, locked, marks, idsKey]);
    const { mutate } = useMutation(removePositionAtBeatMutationOptions());
    // Stable, so the timeline's memoized layers don't rebuild on every render
    const removePoint = useCallback(
        (point: BasicPoint) =>
            mutate({
                beat: point.beat,
                box: point.box,
                marcherIds: point.marcherIds,
            }),
        [mutate],
    );
    return { points, removePoint };
}
