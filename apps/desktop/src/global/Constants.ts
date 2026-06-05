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

export const OPENMARCH_APP_BASE_URL = ensureEndingSlash(
    import.meta.env.VITE_API_URL ?? "https://dev-app.openmarch.com/",
);

export const OPENMARCH_API_ENDPOINT = OPENMARCH_APP_BASE_URL + "api/editor/";

export default Constants;
