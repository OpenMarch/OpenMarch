import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { useTimingObjects } from "@/hooks";
import {
    allMarchersQueryOptions,
    moveMarchersToNeighborPageMutationOptions,
} from "@/hooks/queries";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
    type NeighborPageScope,
} from "@/utilities/setMarchersToNeighborPage";
import { holdActionOptions, useHoldCommands } from "@/timeline/useHoldCommands";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

/**
 * "Set all or selected marchers to the previous or next page" (`setMarchersToNeighborPage`, P7.6).
 * Previous page is **Clear this page**: for the selection, it's off where every selected marcher
 * is already Not defined, when it shows checked, as the hold commands are (`useHoldCommands`). On
 * the first page it still runs and says there's no previous page.
 */
export function useBatchEditActionHandlers() {
    const { t } = useTolgee();
    const { selectedPage, ready, selectedMarchers } = useEditorReadiness();
    const { pages } = useTimingObjects()!;
    // "All" means the performers: props and equipment stay put
    const { data: performers } = useQuery(allMarchersQueryOptions());
    // Writes over the selected page's box (P7.6)
    const { mutateAsync: moveMarchersToNeighborPageAsync } = useMutation(
        moveMarchersToNeighborPageMutationOptions(),
    );
    const enabled = ready && !!pages && pages.length > 0;
    const hasSelection = enabled && selectedMarchers.length > 0;
    const idsKey = selectedMarchers.map((m) => m.id).join(",");
    const marcherIds = useMemo(
        () => (idsKey === "" ? [] : idsKey.split(",").map(Number)),
        [idsKey],
    );
    const clearEntry = useHoldCommands(pages, marcherIds, undefined).entriesOn(
        selectedPage?.id,
    )?.clearThisPage;

    const run = (direction: NeighborPageDirection, scope: NeighborPageScope) =>
        void setMarchersToNeighborPage({
            direction,
            scope,
            selectedPage: selectedPage!,
            pages,
            selectedMarcherIds: selectedMarchers.map((m) => m.id),
            performerIds: performers?.map((m) => m.id),
            writeTimeline: moveMarchersToNeighborPageAsync,
            notify: toast,
            t: (key, params) => t(key, params),
        });

    useActionHandler(
        "setAllMarchersToPreviousPage",
        () => run("previous", "all"),
        { enabled },
    );
    useActionHandler(
        "setSelectedMarchersToPreviousPage",
        () => run("previous", "selected"),
        {
            enabled:
                hasSelection &&
                (clearEntry === undefined || clearEntry.changes > 0),
            ...holdActionOptions(clearEntry),
        },
    );
    useActionHandler("setAllMarchersToNextPage", () => run("next", "all"), {
        enabled,
    });
    useActionHandler(
        "setSelectedMarchersToNextPage",
        () => run("next", "selected"),
        { enabled: hasSelection },
    );
}
