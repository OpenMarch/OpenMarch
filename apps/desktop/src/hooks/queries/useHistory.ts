import {
    getRedoStackLength,
    getUndoStackLength,
    performHistoryAction,
} from "@/db-functions";
import { db } from "@/global/database/db";
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { safelyInvalidateQueries } from "./utils";
import { allMarchersQueryOptions } from "./useMarchers";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "../useTimingObjects";

const KEY_BASE = "history";

export const historyKeys = {
    all: () => [KEY_BASE] as const,
    canUndo: () => [KEY_BASE, "canUndo"] as const,
    canRedo: () => [KEY_BASE, "canRedo"] as const,
};

export const canUndoQueryOptions = queryOptions({
    queryKey: historyKeys.canUndo(),
    queryFn: async () => {
        const undoStackLength = await getUndoStackLength(db);
        return undoStackLength > 0;
    },
});

export const canRedoQueryOptions = queryOptions({
    queryKey: historyKeys.canRedo(),
    queryFn: async () => {
        const redoStackLength = await getRedoStackLength(db);
        return redoStackLength > 0;
    },
});

export const usePerformHistoryAction = () => {
    const qc = useQueryClient();
    const { pages } = useTimingObjects();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { setSelectedPage } = useSelectedPage()!;

    return useMutation({
        mutationFn: (type: "undo" | "redo") => performHistoryAction(type, db),
        onSuccess: (response) => {
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });

            if (response.queriesToInvalidate) {
                safelyInvalidateQueries(response.queriesToInvalidate, qc);
            }
            if (response.pageIdToGoTo && pages) {
                setSelectedPage(
                    pages.find((page) => page.id === response.pageIdToGoTo)!,
                );
            }
            if (response.marcherIdsToSelect != null && marchers) {
                setSelectedMarchers(
                    marchers.filter((marcher) =>
                        response.marcherIdsToSelect?.has(marcher.id),
                    ),
                );
            }
        },
    });
};
