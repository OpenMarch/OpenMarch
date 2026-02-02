/**
 * Utilities for syncing the selected local audio file when uploading a revision
 * to the server (checksum matching, set active vs upload).
 */

import { getAudioDuration, getAudioSizeMegabytes } from "../audio-files/utils";

export const SILENT_AUDIO_PATH = "silent-audio.wav";

/**
 * Local audio file shape used for sync (path, id, data, nickname).
 * Compatible with AudioFile instances.
 */
export type LocalAudioFileForSync = {
    path: string;
    id: number;
    data?: ArrayBuffer;
    nickname?: string;
};

/**
 * Server audio file shape with at least id and optional checksum for matching.
 */
export type ServerAudioFileWithChecksum = { id: number; checksum?: string };

/**
 * Result of preparing audio sync: whether the file exists on the server (by id)
 * and the local file with data for upload if needed.
 */
export type AudioSyncResult = {
    serverAudioFileId: number | null;
    selectedAudioFileWithData: LocalAudioFileForSync;
};

/**
 * Returns true if the given path/id represent the in-memory silent placeholder
 * (not a real file to sync).
 */
export function isSilentPlaceholder(path: string, id: number): boolean {
    return path === SILENT_AUDIO_PATH || id === -1;
}

/**
 * Finds the server audio file id that matches the given checksum, or null.
 */
export function findServerAudioFileIdByChecksum(
    localChecksum: string,
    serverAudioFiles: ServerAudioFileWithChecksum[],
): number | null {
    const match = serverAudioFiles.find((af) => af.checksum === localChecksum);
    return match?.id ?? null;
}

/**
 * Prepares the audio sync result: compute checksum of local file, find matching server file.
 * Returns null if file has no data or is silent placeholder.
 *
 * @param fullFile - Local audio file with data
 * @param serverAudioFiles - List of server audio files (with id and checksum)
 * @param computeChecksum - Async checksum function (e.g. AudioFile.computeChecksum)
 */
export async function prepareAudioSyncResult(
    fullFile: LocalAudioFileForSync,
    serverAudioFiles: ServerAudioFileWithChecksum[],
    computeChecksum: (data: ArrayBuffer | Uint8Array) => Promise<string>,
): Promise<AudioSyncResult | null> {
    if (isSilentPlaceholder(fullFile.path, fullFile.id)) return null;
    const data = fullFile.data;
    if (data == null) return null;
    const checksum = await computeChecksum(data);
    const serverAudioFileId = findServerAudioFileIdByChecksum(
        checksum,
        serverAudioFiles,
    );
    return {
        serverAudioFileId,
        selectedAudioFileWithData: fullFile,
    };
}

/** MIME types for upload; server accepts these in AddAudioFileToProductionService. */
const EXTENSION_TO_MIME: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".mpeg": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
    ".m4a": "audio/x-m4a",
    ".mp4": "audio/mp4",
};

function mimeTypeFromFilename(pathOrName: string): string {
    const lower = pathOrName.toLowerCase();
    for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME)) {
        if (lower.endsWith(ext)) return mime;
    }
    return "application/octet-stream";
}

/**
 * Returns a short display name for the server (nickname). Prefers file nickname
 * when it does not look like a filesystem path; otherwise uses basename.
 */
function displayNameForUpload(
    file: LocalAudioFileForSync,
    filename: string,
): string {
    const n = file.nickname?.trim();
    if (n && n !== filename && !/[/\\]/.test(n)) return n;
    return filename;
}

/**
 * Builds FormData for uploading an audio file and setting it as default.
 * Uses MIME type from filename so the server accepts the file; uses a short
 * display name for nickname (avoids sending full paths). Server requires
 * duration_seconds and size_megabytes.
 * Throws if file has no data.
 */
export function buildAudioUploadFormData(
    file: LocalAudioFileForSync,
    durationSeconds: number,
    sizeMegabytes: number,
): FormData {
    const data = file.data;
    if (data == null) throw new Error("Audio file has no data");
    const filename =
        file.path.replace(/^.*[/\\]/, "") ||
        file.nickname?.replace(/^.*[/\\]/, "") ||
        "audio";
    const mime = mimeTypeFromFilename(file.path || filename);
    const formData = new FormData();
    const blob = new Blob([data], { type: mime });
    formData.append("file", blob, filename);
    formData.append("nickname", displayNameForUpload(file, filename));
    formData.append("set_as_default", "true");
    formData.append("duration_seconds", String(durationSeconds));
    formData.append("size_megabytes", String(sizeMegabytes));
    return formData;
}

/**
 * Builds FormData for uploading an audio file with duration and size computed
 * via the shared audio-files utils (Web Audio API for duration, blob size for MB).
 * Use this when uploading from local file data (e.g. revision sync). Server
 * requires duration_seconds and size_megabytes.
 */
export async function buildAudioUploadFormDataWithDuration(
    file: LocalAudioFileForSync,
): Promise<FormData> {
    const data = file.data;
    if (data == null) throw new Error("Audio file has no data");
    const filename =
        file.path.replace(/^.*[/\\]/, "") ||
        file.nickname?.replace(/^.*[/\\]/, "") ||
        "audio";
    const mime = mimeTypeFromFilename(file.path || filename);
    const blob = new Blob([data], { type: mime });
    const [durationSeconds, sizeMegabytes] = await Promise.all([
        getAudioDuration(blob),
        Promise.resolve(getAudioSizeMegabytes(blob)),
    ]);
    return buildAudioUploadFormData(file, durationSeconds ?? 0, sizeMegabytes);
}
