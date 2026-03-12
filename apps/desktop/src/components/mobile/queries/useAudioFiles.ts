/**
 * App-specific React Query hooks for audio files.
 *
 * Keeps only logic that cannot be auto-generated:
 *   - camelCase normalization (useAudioFiles)
 *   - setting the active audio file (requires a type cast on the PATCH body)
 *   - adding an audio file (custom multi-field FormData upload)
 *
 * For rename / delete, use the generated hooks directly:
 *   usePatchApiEditorV1ProductionsProductionIdAudioFilesId
 *   useDeleteApiEditorV1ProductionsProductionIdAudioFilesId
 */

import {
    mutationOptions,
    QueryClient,
    useMutation,
    useQuery,
} from "@tanstack/react-query";
import {
    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions,
    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey,
    postApiEditorV1ProductionsProductionIdAudioFiles,
} from "@/api/generated/audio-files/audio-files";
import {
    patchApiEditorV1ProductionsId,
    getGetApiEditorV1ProductionsIdQueryKey,
} from "@/api/generated/productions/productions";
import type { GetApiEditorV1ProductionsProductionIdAudioFiles200AudioFilesItem } from "@/api/generated/model";

/** Normalized audio file shape for UI (camelCase, parsed Date). */
export type AudioFileListItem = {
    id: number;
    name: string;
    nickname?: string;
    sizeMb: number;
    durationSeconds: number;
    createdAt: Date;
    checksum?: string;
};

function normalizeAudioFile(
    api: GetApiEditorV1ProductionsProductionIdAudioFiles200AudioFilesItem,
): AudioFileListItem {
    return {
        id: api.id ?? 0,
        name: api.name ?? "",
        sizeMb: Number(api.size_megabytes ?? 0),
        durationSeconds: Number(api.duration_seconds ?? 0),
        createdAt: new Date(api.created_at ?? 0),
        checksum: api.checksum ?? undefined,
    };
}

/**
 * Fetches audio files for a production, normalized to camelCase for the UI.
 * Uses the generated query options so the cache key is shared with
 * getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions prefetches.
 */
export function useAudioFiles(productionId: number | undefined) {
    const id = productionId ?? 0;
    return useQuery(
        getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions<
            AudioFileListItem[]
        >(id, {
            query: {
                queryKey:
                    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey(
                        id,
                    ),
                enabled: productionId != null,
                select: (data) => data.audio_files.map(normalizeAudioFile),
            },
        }),
    );
}

/**
 * Sets an audio file as the default (active) for the production.
 * Requires a type cast because `default_audio_file_id` is not in the
 * generated PATCH body type.
 */
export const setActiveAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) =>
    mutationOptions({
        mutationFn: async ({
            productionId,
            audioFileId,
        }: {
            productionId: number;
            audioFileId: number;
        }) =>
            patchApiEditorV1ProductionsId(productionId, {
                default_audio_file_id: audioFileId,
            } as Parameters<typeof patchApiEditorV1ProductionsId>[1]),
        onSuccess: (_, { productionId }) => {
            void queryClient.invalidateQueries({
                queryKey: getGetApiEditorV1ProductionsIdQueryKey(productionId),
            });
            void queryClient.invalidateQueries({
                queryKey:
                    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey(
                        productionId,
                    ),
            });
        },
    });

export function useSetActiveAudioFileMutation(queryClient: QueryClient) {
    return useMutation(setActiveAudioFileMutationOptions({ queryClient }));
}

/** Adds a new audio file to a production with optional nickname / set-as-default. */
export const addAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) =>
    mutationOptions({
        mutationFn: async ({
            productionId,
            file,
            nickname,
            setAsDefault,
            durationSeconds,
            sizeMegabytes,
        }: {
            productionId: number;
            file: File;
            nickname?: string;
            setAsDefault?: boolean;
            durationSeconds: number;
            sizeMegabytes: number;
        }) =>
            postApiEditorV1ProductionsProductionIdAudioFiles(productionId, {
                file,
                nickname: nickname || undefined,
                set_as_default: setAsDefault,
                duration_seconds: durationSeconds,
                size_megabytes: sizeMegabytes,
            }),
        onSuccess: (_, { productionId }) => {
            void queryClient.invalidateQueries({
                queryKey: getGetApiEditorV1ProductionsIdQueryKey(productionId),
            });
            void queryClient.invalidateQueries({
                queryKey:
                    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey(
                        productionId,
                    ),
            });
        },
    });

export function useAddAudioFileMutation(queryClient: QueryClient) {
    return useMutation(addAudioFileMutationOptions({ queryClient }));
}
