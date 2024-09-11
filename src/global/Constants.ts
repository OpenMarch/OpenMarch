export const Constants = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages",
    UndoHistoryTableName: "history_undo",
    RedoHistoryTableName: "history_redo",
    FieldPropertiesTableName: "field_properties",
    MeasureTableName: "measures",
    AudioFilesTableName: "audio_files",
    MarcherLineTableName: "marcher_lines",

    PagePrefix: "page",
    NewPageId: "NEW_PAGE", // deprecated?
    MarcherPrefix: "marcher",
    MarcherPagePrefix: "mp",
    dotRadius: 5, //deprecated?
} as const;

/**
 * Tables whose changes are added to the history table
 */
export const TablesWithHistory = [
    Constants.MarcherTableName,
    Constants.PageTableName,
    Constants.MarcherPageTableName,
] as const;

export default Constants;
