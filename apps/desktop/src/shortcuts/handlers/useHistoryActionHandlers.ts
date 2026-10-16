import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { usePerformHistoryAction } from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useActionHandler } from "../useActionHandler";
import {
    createHistoryPressQueue,
    type HistoryDirection,
} from "./historyPressQueue";

const NOTHING_TO_DO_KEYS = {
    undo: "actions.edit.noUndoAvailable",
    redo: "actions.edit.noRedoAvailable",
} as const;

export function useHistoryActionHandlers() {
    const { t } = useTolgee();
    const databaseReady = useDatabaseReady();
    const { mutateAsync: performHistoryAction } = usePerformHistoryAction();

    // Whether there is anything to undo or redo is decided by the action itself, in its lock turn,
    // not by the canUndo/canRedo queries: those refetch only after a write commits, so a press
    // right after an edit or another undo would read them stale (#223).
    const run = async (direction: HistoryDirection) => {
        const response = await performHistoryAction(direction);
        if (response.nothingToDo)
            toast.warning(t(NOTHING_TO_DO_KEYS[direction]));
    };
    const runRef = useRef(run);
    useLayoutEffect(() => {
        runRef.current = run;
    });
    const [queue] = useState(() =>
        createHistoryPressQueue((direction) => runRef.current(direction)),
    );

    // Every press runs, in order. A held key's repeats are skipped while one is still running, so
    // holding Ctrl+Z undoes as fast as the app can, with nothing left to run after release.
    const options = { enabled: databaseReady, ignoreRepeat: queue.busy };
    useActionHandler("performUndo", () => void queue.press("undo"), options);
    useActionHandler("performRedo", () => void queue.press("redo"), options);
}
