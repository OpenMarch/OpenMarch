/**
 * An musicXml file object that represents an musicXml file in the database.
 *
 * "State" for musicXml files is handled by the database, so this class is just a wrapper around the database.
 * State is stored in the database because the selected musicXml file should persist between sessions
 * and likely won't change too often.
 */
export default class MusicXmlFile {
    /** ID of the Xml file in the database */
    readonly id: number;
    /** The data buffer of which is the makeup of the Xml file */
    readonly data?: ArrayBuffer;
    /** The original file path of the Xml file */
    readonly path: string;
    /** The user defined nickname of the Xml file. By default, just the file name */
    readonly nickname?: string;
    /** 1 if selected, 0 if not (boolean from sql) */
    readonly selected: boolean;

    constructor({ id, data, path, nickname, selected }: MusicXmlFile) {
        this.id = id;
        this.data = data;
        this.path = path;
        this.nickname = nickname || path.replace(/^.*[\\/]/, "");
        this.selected = selected;
    }

    /**
     * An array of all the AudioFile objects in the database without the audio data.
     * This is used for the front end to display the audio files without loading the whole file into memory.
     *
     * @returns An array of AudioFile objects without the audio data.
     */
    public static async getMusicXmlFilesDetails(): Promise<MusicXmlFile[]> {
        const dbResponse = await window.electron.getMusicXmlFilesDetails();
        return dbResponse.map(
            (musicXmlFileData: any) => new MusicXmlFile(musicXmlFileData),
        );
    }

    /**
     * Set the selected audio file in the database.
     *
     * @param musicXmlFileId The id of the audio file to select
     * @returns The newly selected audio file including the audio data
     */
    public static setSelectedMusicXmlFile(
        musicXmlFileId: number,
    ): Promise<MusicXmlFile> {
        return window.electron.setSelectedMusicXmlFile(musicXmlFileId);
    }

    /**
     * @returns The currently selected audio file in the database including the audio data
     */
    public static async getSelectedMusicXmlFile(): Promise<MusicXmlFile | null> {
        let response = await window.electron.getSelectedMusicXmlFile();
        if (!response) {
            return null;
        }
        return new MusicXmlFile(response);
    }
}
