import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { useTimingObjects } from "@/hooks";
import { moveMarchersToNeighborPageMutationOptions } from "@/hooks/queries";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
    type NeighborPageScope,
} from "@/utilities/setMarchersToNeighborPage";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

/** "Set all or selected marchers to the previous or next page" (`setMarchersToNeighborPage`, P7.6). */
export function useBatchEditActionHandlers() {
    const { t } = useTolgee();
    const { selectedPage, ready, selectedMarchers } = useEditorReadiness();
    const { pages } = useTimingObjects()!;
    // Writes over the selected page's box (P7.6)
    const { mutateAsync: moveMarchersToNeighborPageAsync } = useMutation(
        moveMarchersToNeighborPageMutationOptions(),
    );
    const enabled = ready && !!pages && pages.length > 0;
    const hasSelection = enabled && selectedMarchers.length > 0;

    const run = (direction: NeighborPageDirection, scope: NeighborPageScope) =>
        void setMarchersToNeighborPage({
            direction,
            scope,
            selectedPage: selectedPage!,
            pages,
            selectedMarcherIds: selectedMarchers.map((m) => m.id),
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
