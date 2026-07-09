import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";

export type IlluminantVisualizerAudioInput = {
    id: number;
    data?: ArrayBuffer | Uint8Array | Buffer;
    path: string;
};

export type WorkspaceAudioSettings = {
    audioOffsetSeconds: number;
};

export function shouldIncludeAudioInVisualizerRequest(
    audioFile: IlluminantVisualizerAudioInput | null | undefined,
): audioFile is IlluminantVisualizerAudioInput & {
    data: ArrayBuffer | Uint8Array | Buffer;
} {
    if (audioFile == null || audioFile.id === -1 || audioFile.data == null) {
        return false;
    }
    const byteLength = Buffer.isBuffer(audioFile.data)
        ? audioFile.data.length
        : audioFile.data.byteLength;
    return byteLength > 0;
}

export function audioFileToBuffer(
    data: ArrayBuffer | Uint8Array | Buffer,
): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (data instanceof Uint8Array) {
        return Buffer.from(data);
    }
    return Buffer.from(new Uint8Array(data));
}

export function buildTempAudioPath(
    audioFilePath: string,
    tempDirectory: string,
): string {
    const extension = extname(audioFilePath) || ".wav";
    return join(tempDirectory, `illuminant-audio-${randomUUID()}${extension}`);
}

export function enrichIlluminantVisualizerRequestWithAudio<
    T extends Record<string, unknown>,
>(
    request: T,
    audioPath: string,
    settings: WorkspaceAudioSettings,
): T & { audioPath: string; audioOffsetSeconds: number } {
    return {
        ...request,
        audioPath,
        audioOffsetSeconds: settings.audioOffsetSeconds,
    };
}
