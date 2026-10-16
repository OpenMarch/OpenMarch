export type HistoryDirection = "undo" | "redo";

/**
 * Runs undo and redo presses one after another, in the order they were pressed. A press made
 * while an earlier one is still running waits for it instead of being dropped (#223): the stacks
 * the earlier one leaves behind are the ones the later one should act on.
 *
 * @param run performs one press and settles once its result is shown
 */
export function createHistoryPressQueue(
    run: (direction: HistoryDirection) => Promise<void>,
) {
    let tail: Promise<void> = Promise.resolve();
    let pending = 0;
    return {
        /** Queues a press. The promise settles once that press has run. */
        press(direction: HistoryDirection): Promise<void> {
            pending++;
            tail = tail
                .then(() => run(direction))
                .catch((error: unknown) =>
                    console.error(`${direction} failed:`, error),
                )
                .finally(() => {
                    pending--;
                });
            return tail;
        },
        /** True while a press is running or waiting to run */
        busy: () => pending > 0,
    };
}
