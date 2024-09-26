/**
 * All tables in the database.
 *
 * Whenever a new table is created, it should be added here and its invokers should be
 * added to the `APP_API` object in `electron/preload/index.ts`.
 */
const ALL_TABLES = {
    // marcherLine: new MarcherLineTable(connect),
} as const;

export default ALL_TABLES;
