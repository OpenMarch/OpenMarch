import {
    canCreateLastPage,
    createLastPage,
    createTempoGroupAndPageFromWorkspaceSettings,
    DatabasePage,
} from "@/db-functions";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { conToastError } from "@/utilities/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useCallback } from "react";
import { db } from "@/global/database/db";
import { invalidatePageQueries, measureKeys } from "@/hooks/queries";
import Page from "@/global/classes/Page";
import Beat from "@/global/classes/Beat";
import { useSelectedPage } from "@/context/SelectedPageContext";

export const getAvailableOffsets = ({
    currentPage,
    nextPage,
    allBeats,
}: {
    currentPage: Pick<Page, "beats" | "duration">;
    nextPage: Pick<Page, "beats"> | null;
    allBeats: Pick<Beat, "duration" | "position">[];
}): number[] => {
    if (!allBeats.length) return [];
    const offsets: number[] = [];

    // Get the current page's total duration
    const currentPageDuration =
        currentPage.duration ??
        currentPage.beats.reduce((acc, beat) => acc + beat.duration, 0);

    // Add all possible negative offsets from the current page
    let runningTime = -currentPageDuration + currentPage.beats[0].duration;
    for (let i = 1; i < currentPage.beats.length; i++) {
        offsets.push(runningTime);
        runningTime += currentPage.beats[i].duration;
    }

    // Add 0 (current position)
    offsets.push(0);

    // If there's a next page, add all possible positive offsets
    if (nextPage) {
        runningTime = 0;
        for (let i = 0; i < nextPage.beats.length - 1; i++) {
            runningTime += nextPage.beats[i].duration;
            offsets.push(runningTime);
        }
    } else {
        // If there's no next page, use all of the following beats
        runningTime = 0;
        const lastBeat = currentPage.beats[currentPage.beats.length - 1];
        for (const beat of allBeats) {
            if (beat.position <= lastBeat.position) continue;
            runningTime += beat.duration;
            offsets.push(runningTime);
        }
    }

    // Remove -0 if it exists
    const output = offsets.map((offset) =>
        Object.is(offset, -0) ? 0 : offset,
    );
    const filteredOutput = output.filter((offset) => !isNaN(offset));
    return filteredOutput;
};
/**
 * If there are not enough beats to create a new page, use the WorkspaceSettings, create a new tempo group
 * (beats and measures) and a new page that starts on that group
 *
 * If there are enough beats to create a new page, create a new page at the next available beat.
 */
export const useCreateLastPageOnTimeline = () => {
    const queryClient = useQueryClient();
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const tolgee = useTolgee();
    const { setPageToSelect } = useSelectedPage()!;
    const fn = useCallback(async (): Promise<DatabasePage> => {
        if (!workspaceSettings) {
            conToastError(
                tolgee.t("pages.createFailed", {
                    error: "Workspace settings not found",
                }),
            );
            throw new Error("Workspace settings not found");
        }
        const canCreate = await canCreateLastPage({
            tx: db,
            newPageCounts: workspaceSettings.defaultNewPageCounts,
        });
        let result: DatabasePage;
        if (canCreate)
            result = await createLastPage({
                db,
                newPageCounts: workspaceSettings?.defaultNewPageCounts ?? 0,
            });
        else
            result = await createTempoGroupAndPageFromWorkspaceSettings({
                db,
                workspaceSettings,
            });
        setPageToSelect({ id: result.id });
        return result;
    }, [setPageToSelect, tolgee, workspaceSettings]);

    return useMutation({
        mutationFn: fn,
        onSuccess: async () => {
            await invalidatePageQueries(queryClient);
            await queryClient.invalidateQueries({
                queryKey: measureKeys.all(),
            });
        },
    });
};
