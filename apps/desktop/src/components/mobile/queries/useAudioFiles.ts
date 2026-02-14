/**
 * React Query hooks for listing and mutating audio files (set active, add, edit nickname, delete)
 * for the current production via the OpenMarch editor API.
 * Uses Orval-generated API for list, set active, patch nickname, delete; keeps api-client for add (FormData POST).
 */

import {
    mutationOptions,
    QueryClient,
    queryOptions,
    useMutation,
    useQuery,
} from "@tanstack/react-query";
import {
    getApiEditorV1ProductionsProductionIdAudioFiles,
    getPatchApiEditorV1ProductionsProductionIdAudioFilesIdMutationOptions,
    getDeleteApiEditorV1ProductionsProductionIdAudioFilesIdMutationOptions,
} from "@/api/generated/audio-files/audio-files";
import { patchApiEditorV1ProductionsId } from "@/api/generated/productions/productions";
import { NEEDS_AUTH_BASE_QUERY_KEY, useAccessToken } from "@/auth/useAuth";
import { apiPostFormData } from "@/auth/api-client";
import { OTM_BASE_QUERY_KEY } from "./constants";
import type { Production } from "./useProductions";
import { productionKeys } from "./useProductions";

const AUDIO_FILES_KEY_BASE = "audio_files";

type AudioFileApi = {
    id: number;
    name: string;
    url: string | null;
    duration_seconds: number | null;
    size_megabytes: number | null;
    created_at: string;
};

/** Normalized audio file for UI (camelCase, Date). */
export type AudioFileListItem = {
    id: number;
    name: string;
    nickname?: string;
    sizeMb: number;
    durationSeconds: number;
    createdAt: Date;
    checksum?: string;
};

/** Response shape from GET audio_files (index); spec types as void so we cast. */
interface ListAudioFilesResponse {
    audio_files: AudioFileApi[];
}

/** Query key factory for audio files by production. */
export const audioFilesKeys = {
    byProduction: (productionId: number | undefined) =>
        [
            NEEDS_AUTH_BASE_QUERY_KEY,
            OTM_BASE_QUERY_KEY,
            AUDIO_FILES_KEY_BASE,
            productionId,
        ] as const,
};

function normalizeAudioFile(api: AudioFileApi): AudioFileListItem {
    return {
        id: api.id,
        name: api.name,
        sizeMb: Number(api.size_megabytes ?? 0),
        durationSeconds: Number(api.duration_seconds ?? 0),
        createdAt: new Date(api.created_at),
    };
}

export const audioFilesByProductionQueryOptions = (
    productionId: number | undefined,
    _getAccessToken: () => Promise<string | null>,
) => {
    if (productionId == null) {
        return queryOptions<AudioFileListItem[]>({
            queryKey: audioFilesKeys.byProduction(productionId),
            queryFn: () => Promise.resolve([]),
            enabled: false,
        });
    }
    const id = productionId;
    return queryOptions<AudioFileListItem[]>({
        queryKey: audioFilesKeys.byProduction(id),
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
            const data = await getApiEditorV1ProductionsProductionIdAudioFiles(
                id,
                undefined,
                signal,
            );
            const list =
                (data as unknown as ListAudioFilesResponse).audio_files ?? [];
            return list.map(normalizeAudioFile);
        },
        enabled: true,
        staleTime: undefined,
    });
};

/**
 * Fetches the list of audio files for a production from the server.
 */
export function useAudioFiles(productionId: number | undefined) {
    const { getAccessToken } = useAccessToken();
    return useQuery({
        ...audioFilesByProductionQueryOptions(productionId, getAccessToken),
    });
}

/** Response shape from POST audio_files (create) - not in OpenAPI spec. */
interface AddAudioFileResponse {
    production: Production;
    audio_file: {
        id: number;
        name: string;
        url: string | null;
        duration_seconds: number | null;
        size_megabytes: number | null;
    };
}

/**
 * Set an audio file as the default (active) for the current production.
 * Uses generated PATCH production fetcher; spec body has name/position only so we cast default_audio_file_id.
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
                queryKey: productionKeys.byId(productionId),
            });
            void queryClient.invalidateQueries({
                queryKey: productionKeys.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: audioFilesKeys.byProduction(productionId),
            });
        },
    });

export function useSetActiveAudioFileMutation(queryClient: QueryClient) {
    return useMutation(setActiveAudioFileMutationOptions({ queryClient }));
}

/**
 * Add an audio file to the current production.
 * Kept as custom mutation (POST with FormData) until OpenAPI spec includes this endpoint.
 */
export const addAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) => {
    return mutationOptions({
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
        }) => {
            const formData = new FormData();
            formData.append("file", file);
            if (nickname != null && nickname !== "") {
                formData.append("nickname", nickname);
            }
            formData.append(
                "set_as_default",
                setAsDefault === true ? "true" : "false",
            );
            formData.append("duration_seconds", String(durationSeconds));
            formData.append("size_megabytes", String(sizeMegabytes));
            const response = await apiPostFormData<AddAudioFileResponse>(
                `v1/productions/${productionId}/audio_files`,
                formData,
            );
            return response;
        },
        onSuccess: (_, { productionId }) => {
            void queryClient.invalidateQueries({
                queryKey: productionKeys.byId(productionId),
            });
            void queryClient.invalidateQueries({
                queryKey: productionKeys.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: audioFilesKeys.byProduction(productionId),
            });
        },
    });
};

export function useAddAudioFileMutation(queryClient: QueryClient) {
    return useMutation(addAudioFileMutationOptions({ queryClient }));
}

/**
 * Update an audio file's nickname.
 * Uses generated PATCH audio file mutation with onSuccess invalidation.
 */
export const updateAudioFileNicknameMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) =>
    getPatchApiEditorV1ProductionsProductionIdAudioFilesIdMutationOptions({
        mutation: {
            onSuccess: (
                _: unknown,
                variables: {
                    productionId: number;
                    id: number;
                    data: { nickname?: string };
                },
            ) => {
                void queryClient.invalidateQueries({
                    queryKey: productionKeys.byId(variables.productionId),
                });
                void queryClient.invalidateQueries({
                    queryKey: productionKeys.all(),
                });
                void queryClient.invalidateQueries({
                    queryKey: audioFilesKeys.byProduction(
                        variables.productionId,
                    ),
                });
            },
        },
    });

export function useUpdateAudioFileNicknameMutation(queryClient: QueryClient) {
    return useMutation(updateAudioFileNicknameMutationOptions({ queryClient }));
}

/**
 * Delete an audio file from the current production.
 * Uses generated DELETE mutation with onSuccess invalidation.
 */
export const deleteAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) => {
    return getDeleteApiEditorV1ProductionsProductionIdAudioFilesIdMutationOptions(
        {
            mutation: {
                onSuccess: (
                    _: unknown,
                    variables: { productionId: number; id: number },
                ) => {
                    void queryClient.invalidateQueries({
                        queryKey: productionKeys.byId(variables.productionId),
                    });
                    void queryClient.invalidateQueries({
                        queryKey: productionKeys.all(),
                    });
                    void queryClient.invalidateQueries({
                        queryKey: audioFilesKeys.byProduction(
                            variables.productionId,
                        ),
                    });
                },
            },
        },
    );
};

export function useDeleteAudioFileMutation(queryClient: QueryClient) {
    return useMutation(deleteAudioFileMutationOptions({ queryClient }));
}
