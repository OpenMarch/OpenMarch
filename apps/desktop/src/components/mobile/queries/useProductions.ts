/**
 * App-specific React Query hooks for productions that cannot be replaced by
 * generated Orval code: reading workspace settings and uploading revisions.
 *
 * Generated hooks for productions list / single production should be used
 * directly from @/api/generated/productions/productions.
 */

import { useMemo } from "react";
import { mutationOptions, QueryClient, useQuery } from "@tanstack/react-query";
import {
    getGetApiEditorV1ProductionsIdQueryOptions,
    getGetApiEditorV1ProductionsIdQueryKey,
} from "@/api/generated/productions/productions";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { uploadDatabaseToServer } from "../utilities/upload-service";
import { db } from "@/global/database/db";

/**
 * Stricter production data structure. The generated type has all fields
 * optional and is missing audio_files; this interface captures the actual
 * response shape so consuming components retain type-safety.
 */
export interface Production {
    id: number;
    name: string;
    background_image_url: string | null;
    background_image_checksum: string | null;
    revisions: RevisionPreview[];
    active_revision_id: number | null;
    audio_files: ProductionAudioFile[];
    default_audio_file_id: number | null;
    ensemble: { id: number; name: string };
    created_at: string;
    updated_at: string;
}

export interface RevisionPreview {
    id: number;
    pushed_at: string;
    title: string;
    show_data_url: string | null;
    active: boolean;
}

export interface ProductionAudioFile {
    id: number;
    name: string;
    url: string | null;
    checksum?: string;
    duration_seconds?: number | null;
    size_megabytes?: number | null;
    created_at?: string;
}

/**
 * Mutation options for uploading the current .dots database as a new revision.
 * Invalidates all ensembles and productions cache on success so the UI reflects
 * the newly created revision immediately.
 */
export const uploadRevisionMutationOptions = ({
    queryClient,
    onSuccess,
    onError,
}: {
    queryClient: QueryClient;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}) => {
    return mutationOptions({
        mutationFn: async ({ title }: { title: string }) =>
            uploadDatabaseToServer(db, title),
        onSuccess: () => {
            // Prefix-invalidate the full ensembles tree (includes
            // productions-by-ensemble) and the productions tree (includes
            // production-by-id and audio-files-by-production).
            void queryClient.invalidateQueries({
                queryKey: [`/api/editor/v1/ensembles`],
            });
            void queryClient.invalidateQueries({
                queryKey: [`/api/editor/v1/productions`],
            });
            onSuccess?.();
        },
        onError: (error) => {
            console.error("Failed to upload revision", error);
            onError?.(error);
        },
    });
};

/** Returns the OTM production ID stored in workspace settings, or undefined. */
export const useOtmProductionId = (): number | undefined => {
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    return useMemo(
        () => workspaceSettings?.otmProductionId,
        [workspaceSettings],
    );
};

/**
 * Fetches the production attached to this .dots file via workspace settings.
 * Uses the generated query options with a stricter return type cast.
 */
export function useCurrentProduction() {
    const productionId = useOtmProductionId();

    const id = productionId ?? 0;
    return useQuery(
        getGetApiEditorV1ProductionsIdQueryOptions<Production>(id, {
            query: {
                queryKey: getGetApiEditorV1ProductionsIdQueryKey(id),
                enabled: productionId != null,
                select: (data) => data.production as unknown as Production,
            },
        }),
    );
}
