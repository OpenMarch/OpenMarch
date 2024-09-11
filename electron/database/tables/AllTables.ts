import MarcherLineTable from "./MarcherLineTable";
import { connect } from "../database.services";

/**
 * All tables in the database.
 *
 * Whenever a new table is created, it should be added here and its invokers should be
 * added to the `APP_API` object in `electron/preload/index.ts`.
 */
const AllTables = {
    marcherLine: new MarcherLineTable(connect),
} as const;

export default AllTables;
