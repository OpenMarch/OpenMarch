import Database from "better-sqlite3";
import Constants from "../../../src/global/Constants";
import AbstractTableController from "./AbstractTableController";
import * as MarcherLine from "@/global/classes/canvasObjects/MarcherLine";

/**
 * THIS TABLE IS NOT CURRENTLY IN USE
 */
export default class MarcherLineTable extends AbstractTableController<
    MarcherLine.DatabaseLine,
    MarcherLine.NewLineArgs,
    MarcherLine.ModifiedLineArgs
> {
    tableName = Constants.MarcherLineTableName;

    createTable(db: Database.Database) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${this.tableName}" (
                    "id"	            INTEGER PRIMARY KEY AUTOINCREMENT,
                    "notes"	            TEXT,
                    "start_page_id"	    INTEGER NOT NULL,
                    "end_page_id"	    INTEGER NOT NULL,
                    "x1"                REAL NOT NULL,
                    "y1"                REAL NOT NULL,
                    "x2"                REAL NOT NULL,
                    "y2"                REAL NOT NULL,
                    "group_id"	        INTEGER,
                    "created_at"	    TEXT NOT NULL,
                    "updated_at"	    TEXT NOT NULL
                );
            `);
        } catch (error) {
            console.error(`Failed to create ${this.tableName} table: ${error}`);
        }
    }
}

// If this should be used, the following invokers should be added to the `APP_API` object in `electron/preload/index.ts`:
// /**
//  * IPC invokers for the MarcherLineTable
//  */
// const marcherLine: CrudInvokers<
//     MarcherLine.DatabaseLine,
//     MarcherLine.NewLineArgs,
//     MarcherLine.ModifiedLineArgs
// > = {
//     create: (newItems: MarcherLine.NewLineArgs[]) =>
//         ipcRenderer.invoke(`marcher_lines:insert`, newItems) as Promise<
//             DatabaseResponse<MarcherLine.DatabaseLine[]>
//         >,
//     read: (id: number) =>
//         ipcRenderer.invoke("marcher_lines:get", id) as Promise<
//             DatabaseResponse<MarcherLine.DatabaseLine>
//         >,
//     readAll: () =>
//         ipcRenderer.invoke("marcher_lines:getAll") as Promise<
//             DatabaseResponse<MarcherLine.DatabaseLine[]>
//         >,
//     update: (modifiedItems: MarcherLine.ModifiedLineArgs[]) =>
//         ipcRenderer.invoke("marcher_lines:update", modifiedItems) as Promise<
//             DatabaseResponse<MarcherLine.DatabaseLine[]>
//         >,
//     delete: (id: number) => ipcRenderer.invoke("marcher_lines:delete", id),
// } as const;
