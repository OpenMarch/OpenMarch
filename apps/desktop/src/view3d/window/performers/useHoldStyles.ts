/**
 * The styles the show's Held holds carry, for the 3D View window's compile
 * (ADR 0015 D-5; fork #775).
 *
 * The window reads the styled holds from the file itself, as it reads the
 * timeline (`positions.ts`). The editor invalidates
 * `VIEW3D_HOLD_STYLES_QUERY_KEY` after every edit, undo or redo that touched
 * the Held marks (`useView3dPublisher`), so a style set in the editor plays
 * here at once.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { readStyledHeldMarks } from "@/db-functions/timelineHoldStyle";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import type { CountClock } from "@/view3d/core/marchers/countClock";
import { holdStyleSpans } from "@/view3d/core/marchers/holdStyles";
import { VIEW3D_HOLD_STYLES_QUERY_KEY } from "@/view3d/sync/protocol";

/** The window's styled Held holds, read from the file. */
export const view3dHoldStylesQueryOptions = () => ({
    queryKey: VIEW3D_HOLD_STYLES_QUERY_KEY,
    queryFn: () => readStyledHeldMarks(db),
});

/**
 * The compile's hold styles (`holdStyleSpans`) as JSON, so callers can key on
 * the content: `"[]"` until the holds have loaded, and where none has a style.
 *
 * @param clock the window's count clock
 */
export function useHoldStyles(clock: CountClock): string {
    const { data: holds } = useQuery(view3dHoldStylesQueryOptions());
    const { countGrid } = useTimingObjects();
    return useMemo(
        () =>
            JSON.stringify(
                holdStyleSpans(
                    holds ?? [],
                    (beat) => countGrid.timeAtBeat(beat),
                    clock,
                ),
            ),
        [holds, countGrid, clock],
    );
}
