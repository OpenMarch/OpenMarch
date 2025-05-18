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
    readonly data?: Buffer;
    /** The original file path of the audio file */
    readonly path: string;
    /** The user defined nickname of the audio file. By default, just the file name */
    readonly nickname?: string;
    /** 1 if selected, 0 if not (boolean from sql) */
    readonly selected: boolean;

    constructor({ id, data, path, nickname, selected }: AudioFile) {
        this.id = id;
        this.data = data;
        this.path = path;
        // TODO split this to just be the last string of the file
        this.nickname = nickname || path.replace(/^.*[\\/]/, "");
        this.selected = selected;
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
    public static getSelectedAudioFile(): Promise<AudioFile> {
        return window.electron.getSelectedAudioFile();
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
