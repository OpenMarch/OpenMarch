// Database instance and types
export {
    getDb,
    initializeDatabase,
    isDatabaseInitialized,
    resetDatabase,
    schema,
    type DB,
    type DbConnection,
    type DbTransaction,
} from "./db";

// Re-export individual schema tables for convenience
export {
    beats,
    measures,
    pages,
    marchers,
    marcher_pages,
    midsets,
    pathways,
    field_properties,
    audio_files,
    shapes,
    shape_pages,
    shape_page_marchers,
    section_appearances,
    tags,
    tag_appearances,
    marcher_tags,
    utility,
    workspace_settings,
    history_undo,
    history_redo,
    history_stats,
    timing_objects,
    appearance_columns,
} from "./schema";
