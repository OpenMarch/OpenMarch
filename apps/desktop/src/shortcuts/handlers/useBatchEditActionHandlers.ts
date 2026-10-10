import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { useTimingObjects } from "@/hooks";
import {
    marcherPagesByPageQueryOptions,
    moveMarchersToNeighborPageMutationOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
    type NeighborPageScope,
} from "@/utilities/setMarchersToNeighborPage";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

/** "Set all or selected marchers to the previous or next page" in either mode (`setMarchersToNeighborPage`; timeline mode is P7.6). */
export function useBatchEditActionHandlers() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { selectedPage, ready, selectedMarchers, timelineMode } =
        useEditorReadiness();
    const { pages } = useTimingObjects()!;
    // Only page mode reads these; timeline mode reads the resolver instead (P7.6), so they don't run there
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            timelineMode ? null : selectedPage?.previousPageId,
        ),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            timelineMode ? null : selectedPage?.nextPageId,
        ),
    );
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    // Timeline mode writes over the selected page's box (P7.6)
    const { mutateAsync: moveMarchersToNeighborPageAsync } = useMutation(
        moveMarchersToNeighborPageMutationOptions(),
    );
    const enabled = ready && !!pages && pages.length > 0;
    const hasSelection = enabled && selectedMarchers.length > 0;

    const run = (direction: NeighborPageDirection, scope: NeighborPageScope) =>
        void setMarchersToNeighborPage({
            timelineMode,
            direction,
            scope,
            selectedPage: selectedPage!,
            pages,
            selectedMarcherIds: selectedMarchers.map((m) => m.id),
            neighborMarcherPages:
                direction === "previous"
                    ? previousMarcherPages
                    : nextMarcherPages,
            writePages: updateMarcherPages,
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
        { enabled: hasSelection },
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
