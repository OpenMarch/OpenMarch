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
import {
    clearPageFollowBackReader,
    clearPageLabel,
    clearPageScopedLabel,
    useClearPagePage,
} from "@/timeline/timelineClearPage";
import { holdActionOptions, useHoldCommands } from "@/timeline/useHoldCommands";
import type { HoldEntryState } from "@/timeline/holdMenuState";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

/** Clear this page's partial result is a quiet message, not a warning (#573) */
const clearPageNotify = {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
    note: (message: string) => toast.message(message),
};

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

    const run = (
        direction: NeighborPageDirection,
        scope: NeighborPageScope,
        followBack = false,
    ) =>
        void setMarchersToNeighborPage({
            direction,
            scope,
            selectedPage: selectedPage!,
            pages,
            selectedMarcherIds: selectedMarchers.map((m) => m.id),
            followBack,
            performerIds: performers?.map((m) => m.id),
            writeTimeline: moveMarchersToNeighborPageAsync,
            notify: clearPageNotify,
            t: (key, params) => t(key, params),
        });

    useClearPageActionHandlers({
        run: (scope, followBack) => run("previous", scope, followBack),
        enabled,
        hasSelection,
        selectedPage,
        selectedIds: marcherIds,
        performers,
        clearEntry,
    });
    useActionHandler("setAllMarchersToNextPage", () => run("next", "all"), {
        enabled,
    });
    useActionHandler(
        "setSelectedMarchersToNextPage",
        () => run("next", "selected"),
        { enabled: hasSelection },
    );
}

/**
 * Clear this page's four actions (#573): **Clear Page N** for all or the selected marchers, named
 * for the selected page in the palette, and **Clear Page N, Pages N–M follow back**, on only when
 * a later page would follow back. Their labels are read only when asked; the follow-back check
 * runs only for the follow-back actions (`clearPageFollowBackReader`).
 */
function useClearPageActionHandlers({
    run,
    enabled,
    hasSelection,
    selectedPage,
    selectedIds,
    performers,
    clearEntry,
}: {
    run: (scope: NeighborPageScope, followBack: boolean) => void;
    enabled: boolean;
    hasSelection: boolean;
    selectedPage: Parameters<typeof useClearPagePage>[0];
    /** The selected marchers, stable while the selection is */
    selectedIds: readonly number[];
    performers: readonly { readonly id: number }[] | undefined;
    /** Clear this page's entry for the selection on the selected page (`useHoldCommands`) */
    clearEntry: HoldEntryState | undefined;
}) {
    const performerIds = useMemo(
        () => (performers ?? []).map((m) => m.id),
        [performers],
    );
    const clearPage = useClearPagePage(selectedPage);
    // The plain labels only name the page; the follow-back check runs only for the follow-back
    // actions, when the palette asks, and once for both of an action's reads
    const plain = (scope: "all" | "selected") =>
        clearPage
            ? clearPageScopedLabel(clearPageLabel(clearPage.name), scope)
            : undefined;
    const readFollowBack = useMemo(() => clearPageFollowBackReader(), []);
    const all = () => readFollowBack(clearPage, performerIds);
    const selected = () => readFollowBack(clearPage, selectedIds);
    useActionHandler("setAllMarchersToPreviousPage", () => run("all", false), {
        enabled,
        label: () => plain("all"),
    });
    useActionHandler(
        "setSelectedMarchersToPreviousPage",
        () => run("selected", false),
        {
            enabled:
                hasSelection &&
                (clearEntry === undefined || clearEntry.changes > 0),
            ...holdActionOptions(clearEntry),
            label: () => plain("selected"),
        },
    );
    useActionHandler(
        "setAllMarchersToPreviousPageAndFollowing",
        () => run("all", true),
        {
            enabled: () => enabled && all() !== null,
            label: () => {
                const followBack = all();
                return followBack
                    ? clearPageScopedLabel(followBack, "all")
                    : undefined;
            },
        },
    );
    useActionHandler(
        "setSelectedMarchersToPreviousPageAndFollowing",
        () => run("selected", true),
        {
            enabled: () => hasSelection && selected() !== null,
            label: () => {
                const followBack = selected();
                return followBack
                    ? clearPageScopedLabel(followBack, "selected")
                    : undefined;
            },
        },
    );
}
