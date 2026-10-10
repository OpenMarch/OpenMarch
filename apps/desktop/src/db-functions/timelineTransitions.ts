import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection } from "./types";
import { transactionWithHistory } from "./history";
import { clearKeptMarkersInTransaction } from "./timelineKeptMarkers";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
    type DatabaseTimelineTransition,
    type ModifiedTimelineTransitionArgs,
    type TimelineTransitionDestination,
} from "./timelineTransitionsInTransaction";

export * from "./timelineTransitionsInTransaction";

/**
 * `updateTimelineTransitionsInTransaction` for one transition, as one undoable edit (the
 * inspector's transition editor, P8.3). An edit that writes nothing is refused by
 * `transactionWithHistory`, so skip no-op changes before calling it.
 */
export const updateTimelineTransition = async ({
    db,
    modified,
}: {
    db: DbConnection;
    modified: ModifiedTimelineTransitionArgs;
}): Promise<DatabaseTimelineTransition> => {
    const [row] = await transactionWithHistory(
        db,
        "updateTimelineTransition",
        (tx) =>
            updateTimelineTransitionsInTransaction({
                tx,
                modifiedTransitions: [modified],
            }),
    );
    return row!;
};

/**
 * `setTimelineTransitionDestinationInTransaction` as one undoable edit (P8.3). A kept spot whose
 * destination the inspector sets is the marcher's own move from then on, so its kept marker goes
 * in the same edit (keep later pages, 2026-10-09).
 */
export const setTimelineTransitionDestination = async ({
    db,
    transitionId,
    destination,
}: {
    db: DbConnection;
    transitionId: number;
    destination: TimelineTransitionDestination;
}): Promise<DatabaseTimelineTransition> =>
    await transactionWithHistory(
        db,
        "setTimelineTransitionDestination",
        async (tx) => {
            const row = await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId,
                destination,
            });
            const a = schema.timeline_assignments;
            const members = await tx
                .select({ id: a.id })
                .from(a)
                .where(eq(a.transition_id, transitionId))
                .all();
            await clearKeptMarkersInTransaction(
                tx,
                members.map((m) => m.id),
            );
            return row;
        },
    );
