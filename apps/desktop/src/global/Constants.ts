export const Constants = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages",
    UndoHistoryTableName: "history_undo",
    RedoHistoryTableName: "history_redo",
    HistoryStatsTableName: "history_stats",
    FieldPropertiesTableName: "field_properties",
    MeasureTableName: "measures",
    AudioFilesTableName: "audio_files",
    ShapeTableName: "shapes",
    ShapePageTableName: "shape_pages",
    ShapePageMarcherTableName: "shape_page_marchers",
    BeatsTableName: "beats",
    UtilityTableName: "utility",
    SectionAppearancesTableName: "section_appearances",

    PagePrefix: "page",
    NewPageId: "NEW_PAGE", // deprecated?
    MarcherPrefix: "marcher",
    MarcherPagePrefix: "mp",
    dotRadius: 5, //deprecated?
} as const;

export default Constants;
