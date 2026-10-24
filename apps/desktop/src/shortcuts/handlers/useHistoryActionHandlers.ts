import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import {
    canRedoQueryOptions,
    canUndoQueryOptions,
    usePerformHistoryAction,
} from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { getRedoStackLength, getUndoStackLength } from "@/db-functions";
import { db } from "@/global/database/db";
import { useActionHandler } from "../useActionHandler";

export function useHistoryActionHandlers() {
    const { t } = useTolgee();
    const databaseReady = useDatabaseReady();
    const { data: canUndo } = useQuery(canUndoQueryOptions(databaseReady));
    const { data: canRedo } = useQuery(canRedoQueryOptions(databaseReady));
    const { mutateAsync: performHistoryAction } = usePerformHistoryAction();
    const isPerforming = useRef(false);

    const perform = async (
        direction: "undo" | "redo",
        available: boolean | undefined,
        emptyKey: string,
    ) => {
        if (!available) {
            // The cached answer can lag just after a change: ask the database
            const length = await (
                direction === "undo"
                    ? getUndoStackLength(db)
                    : getRedoStackLength(db)
            ).catch(() => 0);
            if (length === 0) {
                toast.warning(t(emptyKey));
                return;
            }
        }
        if (isPerforming.current) return;
        isPerforming.current = true;
        void performHistoryAction(direction).finally(() => {
            isPerforming.current = false;
        });
    };

    useActionHandler(
        "performUndo",
        () => void perform("undo", canUndo, "actions.edit.noUndoAvailable"),
        { enabled: databaseReady },
    );
    useActionHandler(
        "performRedo",
        () => void perform("redo", canRedo, "actions.edit.noRedoAvailable"),
        { enabled: databaseReady },
    );
}
