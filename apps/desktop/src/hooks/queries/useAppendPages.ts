import {
    mutationOptions,
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import { db } from "@/global/database/db";
import {
    appendPageOfCounts,
    appendPagesToEnd,
} from "@/db-functions/appendPages";
import type { AddedPageFlag } from "@/db-functions/pageFlags";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { defaultWorkspaceSettings } from "@/settings/workspaceSettings";
import { invalidatePageQueries } from "./usePages";
import { measureKeys } from "./useMeasures";
import { workspaceSettingsQueryOptions } from "./useWorkspaceSettings";

/**
 * Pages after the last one (endless counts): **+ N counts** after the last page, and pages
 * every N counts to the end of the music. Both can store counts and measures (and add pages), so
 * they invalidate those queries. A refusal shows its message as a toast.
 */

const invalidateAppendedPages = async (qc: QueryClient) => {
    await invalidatePageQueries(qc);
    await qc.invalidateQueries({ queryKey: measureKeys.all() });
};

/** **+ N counts**: a page of `counts` counts after the last page. `onAdded` gets the new page. */
export const appendPageOfCountsMutationOptions = (
    qc: QueryClient,
    onAdded?: (added: AddedPageFlag) => void,
) =>
    mutationOptions({
        mutationFn: (counts: number) => appendPageOfCounts({ db, counts }),
        onSuccess: async (added) => {
            await invalidateAppendedPages(qc);
            onAdded?.(added);
        },
        onError: (e) => toastTimelineError(e),
    });

/** Adds a page every `counts` counts to `untilBeat`, the music's end (EC-10). Resolves to the pages added. */
export const appendPagesToEndMutationOptions = (
    qc: QueryClient,
    onAdded?: (pages: number) => void,
) =>
    mutationOptions({
        mutationFn: ({
            counts,
            untilBeat,
        }: {
            counts: number;
            untilBeat: number;
        }) => appendPagesToEnd({ db, counts, untilBeat }),
        onSuccess: async (pages) => {
            await invalidateAppendedPages(qc);
            onAdded?.(pages);
        },
        onError: (e) => toastTimelineError(e),
    });

/**
 * Pages every "new page counts" counts after the last page, up to a beat (EC-10): the timeline's
 * "Create pages every N counts to the end" and the export tabs' "moves past the end" warning.
 * `counts` is the file's "Default new page counts" setting; `addPagesToEnd(untilBeat)` is one
 * undoable edit (pages of `counts`, or of the length given), and says how many pages it added in
 * a toast; `onDone` runs once it has committed.
 */
export function usePagesToEnd(): {
    readonly counts: number;
    readonly addPagesToEnd: (
        untilBeat: number,
        pageCounts?: number,
        onDone?: () => void,
    ) => void;
    readonly isPending: boolean;
} {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const counts =
        useQuery(workspaceSettingsQueryOptions()).data?.defaultNewPageCounts ??
        defaultWorkspaceSettings.defaultNewPageCounts;
    const { mutate, isPending } = useMutation(
        appendPagesToEndMutationOptions(queryClient, (added) => {
            if (added > 0)
                toast.success(
                    t("timeline.appendCounts.pagesAdded", { pages: added }),
                );
        }),
    );
    return {
        counts,
        addPagesToEnd: (untilBeat, pageCounts = counts, onDone) =>
            mutate(
                { counts: pageCounts, untilBeat },
                { onSuccess: () => onDone?.() },
            ),
        isPending,
    };
}
