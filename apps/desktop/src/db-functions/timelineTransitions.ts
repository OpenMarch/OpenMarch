import type { DbConnection } from "./types";
import { transactionWithHistory } from "./history";
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

/** `setTimelineTransitionDestinationInTransaction` as one undoable edit (P8.3). */
export const setTimelineTransitionDestination = async ({
    db,
    transitionId,
    destination,
}: {
    db: DbConnection;
    transitionId: number;
    destination: TimelineTransitionDestination;
}): Promise<DatabaseTimelineTransition> =>
    await transactionWithHistory(db, "setTimelineTransitionDestination", (tx) =>
        setTimelineTransitionDestinationInTransaction({
            tx,
            transitionId,
            destination,
        }),
    );
