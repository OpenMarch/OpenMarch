import { useEffect } from "react";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { usePerformHistoryAction } from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { getRedoStackLength, getUndoStackLength } from "@/db-functions";
import { db } from "@/global/database/db";
import { useActionHandler } from "../useActionHandler";
import { queueHistoryAction, setHistoryPerformer } from "./historyQueue";

export function useHistoryActionHandlers() {
    const { t } = useTolgee();
    const databaseReady = useDatabaseReady();
    const { mutateAsync: performHistoryAction } = usePerformHistoryAction();

    // Each queued press checks the stack the previous one left, then acts
    useEffect(
        () =>
            setHistoryPerformer(async (direction) => {
                const length = await (
                    direction === "undo"
                        ? getUndoStackLength(db)
                        : getRedoStackLength(db)
                ).catch(() => 0);
                if (length === 0) {
                    toast.warning(
                        t(
                            direction === "undo"
                                ? "actions.edit.noUndoAvailable"
                                : "actions.edit.noRedoAvailable",
                        ),
                        { duration: 1500 },
                    );
                    return false;
                }
                await performHistoryAction(direction);
                return true;
            }),
        [performHistoryAction, t],
    );

    useActionHandler("performUndo", () => void queueHistoryAction("undo"), {
        enabled: databaseReady,
    });
    useActionHandler("performRedo", () => void queueHistoryAction("redo"), {
        enabled: databaseReady,
    });
}
