import {
    getRedoStackLength,
    getUndoStackLength,
    performHistoryAction,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { useEffect, useState } from "react";
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
import { coordinateDataKeys } from "./useCoordinateData";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";

const KEY_BASE = "history";

export const historyKeys = {
    all: () => [KEY_BASE] as const,
    canUndo: () => [KEY_BASE, "canUndo"] as const,
    canRedo: () => [KEY_BASE, "canRedo"] as const,
};

export const canUndoQueryOptions = (enabled = true) =>
    queryOptions({
        queryKey: historyKeys.canUndo(),
        queryFn: async () => {
            const undoStackLength = await getUndoStackLength(db);
            return undoStackLength > 0;
        },
        enabled,
    });

export const canRedoQueryOptions = (enabled = true) =>
    queryOptions({
        queryKey: historyKeys.canRedo(),
        queryFn: async () => {
            const redoStackLength = await getRedoStackLength(db);
            return redoStackLength > 0;
        },
        enabled,
    });

/** Messages for an undo or redo that didn't apply, as Tolgee keys with English defaults */
export const HISTORY_FAILURE_MESSAGES = {
    "page-era-frozen": {
        undo: {
            key: "actions.edit.undoSkippedFrozen",
            defaultMessage:
                "That step can't be undone in timeline mode, because it changes page positions from before the show was converted. It was skipped.",
        },
        redo: {
            key: "actions.edit.redoSkippedFrozen",
            defaultMessage:
                "That step can't be redone in timeline mode, because it changes page positions from before the show was converted. It was skipped.",
        },
    },
    error: {
        undo: {
            key: "actions.edit.undoFailed",
            defaultMessage: "The undo couldn't be applied, so nothing changed.",
        },
        redo: {
            key: "actions.edit.redoFailed",
            defaultMessage: "The redo couldn't be applied, so nothing changed.",
        },
    },
} as const;

type HistoryActionFailure = NonNullable<
    Awaited<ReturnType<typeof performHistoryAction>>["failure"]
>;

/**
 * Tells the user an undo or redo didn't apply: a step the page-era freeze refused (P9.5), which
 * was dropped from its stack, or any other failure, which left the stacks alone.
 */
export const toastHistoryActionFailure = (
    type: "undo" | "redo",
    failure: HistoryActionFailure,
) => {
    const { key, defaultMessage } =
        HISTORY_FAILURE_MESSAGES[failure.kind][type];
    const message = tolgee.t(key, defaultMessage);
    if (failure.kind === "page-era-frozen") toast.warning(message);
    else {
        console.error(`${type} failed:`, failure.message);
        toast.error(message);
    }
};

/** Where an undo or redo asked to go, kept until that page is in the page list. */
interface PendingFocus {
    pageId: number;
    marcherIds: Set<number> | undefined;
}

export const usePerformHistoryAction = () => {
    const qc = useQueryClient();
    const { pages } = useTimingObjects();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const selectedMarchersContext = useSelectedMarchers();
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});
    const selectedPageContext = useSelectedPage();
    const setSelectedPage = selectedPageContext?.setSelectedPage ?? (() => {});
    const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);

    const selectMarchers = (ids: Set<number>) => {
        // The marchers as fetched again after the action, so restored marchers can be selected
        const current =
            qc.getQueryData(allMarchersQueryOptions().queryKey) ?? marchers;
        if (current) setSelectedMarchers(current.filter((m) => ids.has(m.id)));
    };

    // An action can target a page it just restored (redo "add page", undo "delete page"), which
    // the page list only has after it is fetched again. Go there, and select the marchers, once
    // it is in the list; the marchers are selected only together with that page.
    useEffect(() => {
        if (!pendingFocus) return;
        const page = pages?.find((p) => p.id === pendingFocus.pageId);
        if (!page) return;
        setPendingFocus(null);
        if (selectedPageContext?.selectedPage?.id !== page.id)
            setSelectedPage(page);
        if (pendingFocus.marcherIds) selectMarchers(pendingFocus.marcherIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingFocus, pages]);

    return useMutation({
        mutationFn: (type: "undo" | "redo") =>
            performHistoryAction(type, db, {
                currentPageId: selectedPageContext?.selectedPage?.id,
            }),
        onSuccess: async (response, type) => {
            // Invalidate history query
            void qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });

            if (response.failure) {
                toastHistoryActionFailure(type, response.failure);
                return;
            }

            if (response.queriesToInvalidate) {
                await safelyInvalidateQueries(response.queriesToInvalidate, qc);
            }

            // Greedily invalidate all coordinate data queries
            // The better thing to do would be to check the pages that were modified
            // (In timeline mode these queries don't run; the resolver store follows the action's
            // change batch instead.)
            void qc.invalidateQueries({ queryKey: coordinateDataKeys.all });

            // Page 0 has id 0, so compare with undefined. The page and its marchers are applied by
            // the effect above, once the page is in the page list.
            if (response.pageIdToGoTo != null)
                setPendingFocus({
                    pageId: response.pageIdToGoTo,
                    marcherIds: response.marcherIdsToSelect,
                });
            else if (response.marcherIdsToSelect != null)
                selectMarchers(response.marcherIdsToSelect);
        },
    });
};
