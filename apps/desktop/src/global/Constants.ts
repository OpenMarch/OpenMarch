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
    MusicXmlFilesTableName: "music_xml_files",
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

/**
 * Tables whose changes are added to the history table
 */
export const TablesWithHistory = [
    Constants.MarcherTableName,
    Constants.PageTableName,
    Constants.MarcherPageTableName,
    Constants.ShapeTableName,
    Constants.ShapePageTableName,
    Constants.ShapePageMarcherTableName,
    Constants.FieldPropertiesTableName,
    Constants.MeasureTableName,
    Constants.SectionAppearancesTableName,
    Constants.BeatsTableName,
] as const;

export default Constants;
