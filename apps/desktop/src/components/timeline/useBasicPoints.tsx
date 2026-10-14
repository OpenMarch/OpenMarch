import { useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useBasicLocksStore, lockedOnBox } from "@/timeline/basicLocks";
import { pointsInBox } from "@/timeline/basicSimple";
import { removePositionAtBeatMutationOptions } from "@/hooks/queries/useMarcherPages";

/** A mid-page position on the counts strip: its beat, its page box, and whose it is. */
export interface BasicPoint {
    readonly beat: number;
    readonly box: { readonly start: number; readonly end: number };
    readonly marcherIds: readonly number[];
}

/**
 * The selected marchers' mid-page positions (UI-19: ticks on the counts strip), and
 * **Remove this count's position**, which merges each one's two moves back into one. Marchers
 * locked on a page (`basicLocks`) show no ticks there: Basic can't remove them.
 */
export function useBasicPoints(): {
    points: readonly BasicPoint[];
    removePoint: (point: BasicPoint) => void;
} {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const rows = useBasicLocksStore((s) => s.rows);
    const boxes = useBasicLocksStore((s) => s.boxes);
    const locked = useBasicLocksStore((s) => s.locked);
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
            for (const [beat, marcherIds] of byBeat)
                out.push({
                    beat,
                    box: { start: box.start, end: box.end },
                    marcherIds,
                });
        }
        return out.sort((a, b) => a.beat - b.beat);
    }, [rows, boxes, locked, idsKey]);
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
