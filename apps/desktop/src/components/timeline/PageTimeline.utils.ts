import {
    canCreateLastPage,
    createLastPage,
    createTempoGroupAndPageFromWorkspaceSettings,
} from "@/db-functions";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { conToastError } from "@/utilities/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useCallback } from "react";
import { db } from "@/global/database/db";
import { invalidatePageQueries, measureKeys } from "@/hooks/queries";

/**
 * If there are not enough beats to create a new page, use the WorkspaceSettings, create a new tempo group
 * (beats and measures) and a new page that starts on that group
 *
 * If there are enough beats to create a new page, create a new page at the next available beat.
 */
export const useCreateLastPastOnTimeline = () => {
    const queryClient = useQueryClient();
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const tolgee = useTolgee();

    const fn = useCallback(async () => {
        if (!workspaceSettings) {
            conToastError(
                tolgee.t("pages.createFailed", {
                    error: "Workspace settings not found",
                }),
            );
            return;
        }
        const canCreate = await canCreateLastPage({
            tx: db,
            newPageCounts: workspaceSettings.defaultNewPageCounts,
        });
        if (canCreate)
            return await createLastPage({
                db,
                newPageCounts: workspaceSettings?.defaultNewPageCounts ?? 0,
            });
        else
            return await createTempoGroupAndPageFromWorkspaceSettings({
                db,
                workspaceSettings,
            });
    }, [tolgee, workspaceSettings]);

    return useMutation({
        mutationFn: async () => {
            return await fn();
        },
        onSuccess: async () => {
            await invalidatePageQueries(queryClient);
            await queryClient.invalidateQueries({
                queryKey: measureKeys.all(),
            });
        },
    });
};
