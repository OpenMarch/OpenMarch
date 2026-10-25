export type HistoryDirection = "undo" | "redo";

/** Undoes or redoes once; resolves whether anything was undone or redone. */
export type HistoryPerformer = (
    direction: HistoryDirection,
) => Promise<boolean>;

let performer: HistoryPerformer | null = null;
let tail: Promise<unknown> = Promise.resolve();

/** Installs what queued undo/redo presses run; returns the uninstall. */
export function setHistoryPerformer(next: HistoryPerformer): () => void {
    performer = next;
    return () => {
        if (performer === next) performer = null;
    };
}

/**
 * Undo or redo, after any earlier presses have finished. Fast presses queue
 * up instead of being dropped (each runs when the previous one is done, so
 * each sees the stack the previous one left), and each resolves whether it
 * actually undid or redid something.
 */
export function queueHistoryAction(
    direction: HistoryDirection,
): Promise<boolean> {
    const run = tail.then(async () =>
        performer ? await performer(direction) : false,
    );
    tail = run.catch(() => undefined);
    return run.catch(() => false);
}
