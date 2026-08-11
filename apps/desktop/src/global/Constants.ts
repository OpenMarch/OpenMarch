export const Constants = {
    UndoHistoryTableName: "history_undo",
    RedoHistoryTableName: "history_redo",
    HistoryStatsTableName: "history_stats",
    AudioFilesTableName: "audio_files",
    PagePrefix: "page",
    NewPageId: "NEW_PAGE", // deprecated?
    MarcherPrefix: "marcher",
    MarcherPagePrefix: "mp",
    dotRadius: 5, //deprecated?
    PageNotesExportCharLimit: 800,
    PageNotesExportMaxLines: 4,
} as const;

const ensureEndingSlash = (url: string) =>
    url.endsWith("/") ? url : url + "/";

function requireEnv(name: string, value: string | undefined): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${name} is not set`);
    }
    return value;
}

export const OPENMARCH_APP_BASE_URL = ensureEndingSlash(
    requireEnv("VITE_API_URL", import.meta.env.VITE_API_URL),
);

export const OPENMARCH_API_ENDPOINT = ensureEndingSlash(
    requireEnv("VITE_EDITOR_API_URL", import.meta.env.VITE_EDITOR_API_URL),
);

export default Constants;
