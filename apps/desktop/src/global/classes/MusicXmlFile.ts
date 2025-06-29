// Dummy implementation mirroring AudioFile.ts
// You should adapt this if you have a database layer or IPC for MusicXML files.

export default class MusicXmlFile {
    id: number;
    nickname: string;
    path: string;

    constructor({
        id,
        nickname,
        path,
    }: {
        id: number;
        nickname: string;
        path: string;
    }) {
        this.id = id;
        this.nickname = nickname;
        this.path = path;
    }

    // Fetches all MusicXML files (replace with actual API/IPC/database call)
    static async getMusicXmlFilesDetails(): Promise<MusicXmlFile[]> {
        // Placeholder: Replace with your actual fetching logic (e.g. window.electron or fetch API)
        const raw = (await window.electron?.invoke?.("getMusicXmlFiles")) as
            | { id: number; nickname: string; path: string }[]
            | undefined;
        if (!raw) return [];
        return raw.map((data) => new MusicXmlFile(data));
    }

    // Sets the selected MusicXML file (replace with actual API/IPC/database call)
    static async setSelectedMusicXmlFile(id: number): Promise<MusicXmlFile> {
        const data = (await window.electron?.invoke?.(
            "setSelectedMusicXmlFile",
            id,
        )) as { id: number; nickname: string; path: string } | undefined;
        if (!data) throw new Error("Could not set selected MusicXML file");
        return new MusicXmlFile(data);
    }
}
