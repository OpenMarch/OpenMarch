/**
 * React Query hooks for listing and mutating audio files (set active, add, edit nickname, delete)
 * for the current production via the OpenMarch editor API.
 */

import {
    mutationOptions,
    QueryClient,
    queryOptions,
    useMutation,
    useQuery,
} from "@tanstack/react-query";
import {
    apiGet,
    apiPatch,
    apiPostFormData,
    apiDelete,
} from "@/auth/api-client";
import { NEEDS_AUTH_BASE_QUERY_KEY, useAccessToken } from "@/auth/useAuth";
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

/** Response shape from GET audio_files (index). */
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
    getAccessToken: () => Promise<string | null>,
) =>
    queryOptions<AudioFileListItem[]>({
        queryKey: audioFilesKeys.byProduction(productionId),
        queryFn: async (): Promise<AudioFileListItem[]> => {
            const token = await getAccessToken();
            if (!token) {
                throw new Error("Authentication token is required");
            }
            const response = await apiGet<ListAudioFilesResponse>(
                `v1/productions/${productionId}/audio_files`,
            );
            return (response.audio_files ?? []).map(normalizeAudioFile);
        },
        enabled: productionId != null,
        staleTime: undefined,
    });

/**
 * Fetches the list of audio files for a production from the server.
 */
export function useAudioFiles(productionId: number | undefined) {
    const { getAccessToken } = useAccessToken();
    return useQuery({
        ...audioFilesByProductionQueryOptions(productionId, getAccessToken),
    });
}

/** Response shape from PATCH/DELETE audio file and PATCH production (production only). */
interface ProductionResponse {
    production: Production;
}

/** Response shape from POST audio_files (create). */
interface AddAudioFileResponse extends ProductionResponse {
    audio_file: {
        id: number;
        name: string;
        url: string | null;
        duration_seconds: number | null;
        size_megabytes: number | null;
    };
}

/** Response shape from PATCH audio_files (update nickname). */
interface UpdateAudioFileResponse extends ProductionResponse {
    audio_file: { id: number; name: string; url: string | null };
}

/**
 * Set an audio file as the default (active) for the current production.
 */
export const setActiveAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) => {
    return mutationOptions({
        mutationFn: async ({
            productionId,
            audioFileId,
        }: {
            productionId: number;
            audioFileId: number;
        }) => {
            const response = await apiPatch<ProductionResponse>(
                `v1/productions/${productionId}`,
                { default_audio_file_id: audioFileId },
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

export function useSetActiveAudioFileMutation(queryClient: QueryClient) {
    return useMutation(setActiveAudioFileMutationOptions({ queryClient }));
}

/**
 * Add an audio file to the current production.
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
 */
export const updateAudioFileNicknameMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) => {
    return mutationOptions({
        mutationFn: async ({
            productionId,
            audioFileId,
            nickname,
        }: {
            productionId: number;
            audioFileId: number;
            nickname: string;
        }) => {
            const response = await apiPatch<UpdateAudioFileResponse>(
                `v1/productions/${productionId}/audio_files/${audioFileId}`,
                { nickname },
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

export function useUpdateAudioFileNicknameMutation(queryClient: QueryClient) {
    return useMutation(updateAudioFileNicknameMutationOptions({ queryClient }));
}

/**
 * Delete an audio file from the current production.
 */
export const deleteAudioFileMutationOptions = ({
    queryClient,
}: {
    queryClient: QueryClient;
}) => {
    return mutationOptions({
        mutationFn: async ({
            productionId,
            audioFileId,
        }: {
            productionId: number;
            audioFileId: number;
        }) => {
            const response = await apiDelete<ProductionResponse>(
                `v1/productions/${productionId}/audio_files/${audioFileId}`,
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

export function useDeleteAudioFileMutation(queryClient: QueryClient) {
    return useMutation(deleteAudioFileMutationOptions({ queryClient }));
}
