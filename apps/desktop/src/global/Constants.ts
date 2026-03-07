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

export const OPENMARCH_API_ENDPOINT =
    ensureEndingSlash(
        import.meta.env.VITE_API_URL ?? "https://app.dev.openmarch.com/",
    ) + "api/editor/";

export default Constants;
