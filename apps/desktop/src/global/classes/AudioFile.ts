/**
 * An audio file object that represents an audio file in the database.
 *
 * "State" for audio files is handled by the database, so this class is just a wrapper around the database.
 * State is stored in the database because the selected audio file should persist between sessions
 * and likely won't change too often.
 */
export default class AudioFile {
    /** ID of the audio file in the database */
    readonly id: number;
    /** The data buffer of which is the makeup of the audio file */
    readonly data?: ArrayBuffer;
    /** The original file path of the audio file */
    readonly path: string;
    /** The user defined nickname of the audio file. By default, just the file name */
    readonly nickname?: string;
    /** 1 if selected, 0 if not (boolean from sql) */
    readonly selected: boolean;

    constructor({
        id,
        data,
        path,
        nickname,
        selected,
    }: {
        id: number;
        data?: ArrayBuffer | Uint8Array;
        path: string;
        nickname?: string;
        selected: boolean;
    }) {
        this.id = id;

        // Handle the case where data is undefined (for getAudioFilesDetails)
        if (data === undefined) {
            this.data = undefined;
        } else if (data instanceof Uint8Array) {
            this.data = data.buffer.slice(
                data.byteOffset,
                data.byteOffset + data.byteLength,
            ) as ArrayBuffer;
        } else if (data instanceof ArrayBuffer) {
            this.data = data;
        } else {
            throw new Error(
                "Unable to create AudioFile: data must be an " +
                    "ArrayBuffer or Uint8Array, but instead got: " +
                    typeof data,
            );
        }

        this.path = path;
        // TODO split this to just be the last string of the file
        this.nickname = nickname || path.replace(/^.*[\\/]/, "");
        this.selected = selected;
    }

    /**
     * Computes a SHA256 checksum of the raw audio data (hex string).
     * Matches the output of Digest::SHA256.hexdigest(data) used by om-online.
     *
     * @param data Raw audio file bytes (ArrayBuffer or Uint8Array)
     * @returns Hex string of the SHA256 hash
     */
    public static async computeChecksum(
        data: ArrayBuffer | Uint8Array,
    ): Promise<string> {
        const buffer: ArrayBuffer =
            data instanceof Uint8Array
                ? (data.buffer.slice(
                      data.byteOffset,
                      data.byteOffset + data.byteLength,
                  ) as ArrayBuffer)
                : data;
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    /**
     * An array of all the AudioFile objects in the database without the audio data.
     * This is used for the front end to display the audio files without loading the whole file into memory.
     *
     * @returns An array of AudioFile objects without the audio data.
     */
    public static async getAudioFilesDetails(): Promise<AudioFile[]> {
        const dbResponse = await window.electron.getAudioFilesDetails();
        return dbResponse.map((audioFileData) => new AudioFile(audioFileData));
    }

    /**
     * Set the selected audio file in the database.
     *
     * @param audioFileId The id of the audio file to select
     * @returns The newly selected audio file including the audio data
     */
    public static setSelectedAudioFile(
        audioFileId: number,
    ): Promise<AudioFile> {
        return window.electron.setSelectedAudioFile(audioFileId);
    }

    /**
     * @returns The currently selected audio file in the database including the audio data
     */
    public static async getSelectedAudioFile(
        minDuration?: number,
    ): Promise<AudioFile> {
        let response = await window.electron.getSelectedAudioFile();
        if (!response) {
            // Create silent audio with at least the requested duration
            // Default to 10 seconds for initial load, but allow extension
            const duration = Math.max(10, minDuration ?? 10);
            const silentAudio = createSilentAudio(duration);
            const silentAudioFile = new AudioFile({
                id: -1,
                data: silentAudio,
                path: "silent-audio.wav",
                nickname: "Silent Audio",
                selected: true,
            });
            response = silentAudioFile;
        }
        return new AudioFile(response);
        // return window.electron.getSelectedAudioFile();
    }

    /**
     * Deletes an audio file from the database.
     *
     * @param audioFileId The id of the audio file to delete
     * @returns The newly selected audio file including the audio data
     */
    public static async deleteAudioFile(
        audioFileId: number,
    ): Promise<AudioFile | null> {
        const result = await window.electron.deleteAudioFile(audioFileId);
        if (result) {
            return new AudioFile({ ...result });
        }
        return null;
    }
}

/**
 * Editable fields for audio files
 */
export interface ModifiedAudioFileArgs {
    /** The id of the audio file to modify  */
    id: number;
    nickname: string;
}

/**
 * Creates a silent audio file of the specified duration.
 * @param duration Duration in seconds. By default, 10 seconds to minimize startup lag.
 *                 This is just a placeholder until the user adds real audio.
 * @returns A buffer containing the silent audio file
 */
function createSilentAudio(duration: number = 10): ArrayBuffer {
    // Audio context setup
    const sampleRate = 44100;
    const numberOfChannels = 2;
    const bitsPerSample = 16;
    const totalSamples = Math.ceil(sampleRate * duration);

    // Create the audio buffer
    const buffer = new ArrayBuffer(
        44 + totalSamples * numberOfChannels * (bitsPerSample / 8),
    );
    const view = new DataView(buffer);

    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, "RIFF");
    view.setUint32(
        4,
        36 + totalSamples * numberOfChannels * (bitsPerSample / 8),
        true,
    );
    writeString(view, 8, "WAVE");

    // "fmt " sub-chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(
        28,
        sampleRate * numberOfChannels * (bitsPerSample / 8),
        true,
    ); // ByteRate
    view.setUint16(32, numberOfChannels * (bitsPerSample / 8), true); // BlockAlign
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    writeString(view, 36, "data");
    view.setUint32(
        40,
        totalSamples * numberOfChannels * (bitsPerSample / 8),
        true,
    );

    // Write silent audio data (all zeros)
    // The data is already initialized to zero, so we don't need to explicitly write zeros

    return buffer;
}

/**
 * Helper function to write a string to a DataView
 */
function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
