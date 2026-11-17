import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslate } from "@tolgee/react";
import { usePerformHistoryAction } from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useActionHandler } from "../useActionHandler";
import {
    queueHistoryAction,
    setHistoryPerformer,
    type HistoryDirection,
} from "./historyQueue";

const NOTHING_TO_DO_KEYS = {
    undo: "actions.edit.noUndoAvailable",
    redo: "actions.edit.noRedoAvailable",
} as const;

const DONE_KEYS = {
    undo: "touch.undone",
    redo: "touch.redone",
} as const;

/**
 * The action argument that adds a short "Undone"/"Redone" note when the step did something.
 * Field finger taps pass it (tablet plan 1.6): there's no menu or key to show what happened.
 */
export const ANNOUNCE_HISTORY_ARG = "announce";

export function useHistoryActionHandlers() {
    const { t } = useTranslate();
    const databaseReady = useDatabaseReady();
    const { mutateAsync: performHistoryAction } = usePerformHistoryAction();

    // Whether there is anything to undo or redo is decided by the action itself, in its lock turn,
    // not by the canUndo/canRedo queries: those refetch only after a write commits, so a press
    // right after an edit or another undo would read them stale (#223).
    const run = async (direction: HistoryDirection): Promise<boolean> => {
        const response = await performHistoryAction(direction);
        if (response.nothingToDo) {
            toast.warning(t(NOTHING_TO_DO_KEYS[direction]), {
                duration: 1500,
            });
            return false;
        }
        return true;
    };
    const runRef = useRef(run);
    useLayoutEffect(() => {
        runRef.current = run;
    });

    // Undo and redo presses run through upstream's shared queue (historyQueue), in order, each on
    // the stack the previous one left. Placed-shape saves (commitBox) run in it too, so an undo
    // waits for them. Its touch gestures and toast Undo are meant to use it too; the fork's toast
    // Undo buttons and title bar buttons still call the action directly.
    useEffect(
        () =>
            setHistoryPerformer((direction) =>
                runRef.current(direction).catch((error: unknown) => {
                    // The queue swallows a failed press, so it's logged here
                    console.error(`${direction} failed:`, error);
                    throw error;
                }),
            ),
        [],
    );

    // A held key's repeats are skipped while a press is still running or waiting, so holding
    // Ctrl+Z undoes as fast as the app can, with nothing left to run after release.
    const [pending] = useState(() => ({ count: 0 }));
    const press = (direction: HistoryDirection, announce = false) => {
        pending.count++;
        void queueHistoryAction(direction)
            .then((did) => {
                if (did && announce)
                    toast(t(DONE_KEYS[direction]), { duration: 1200 });
            })
            .finally(() => {
                pending.count--;
            });
    };
    const options = {
        enabled: databaseReady,
        ignoreRepeat: () => pending.count > 0,
    };
    useActionHandler(
        "performUndo",
        (args) => press("undo", args?.[ANNOUNCE_HISTORY_ARG] === true),
        options,
    );
    useActionHandler(
        "performRedo",
        (args) => press("redo", args?.[ANNOUNCE_HISTORY_ARG] === true),
        options,
    );
}
