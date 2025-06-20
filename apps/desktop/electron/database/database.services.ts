import { ipcMain } from "electron";
import Database from "better-sqlite3";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import * as History from "./database.history";
import * as Utilities from "./utilities";
import FieldProperties from "../../src/global/classes/FieldProperties";
import AudioFile, {
    ModifiedAudioFileArgs,
} from "../../src/global/classes/AudioFile";
import * as MarcherTable from "./tables/MarcherTable";
import * as PageTable from "./tables/PageTable";
import * as MarcherPageTable from "./tables/MarcherPageTable";
import { DatabaseResponse } from "./DatabaseActions";
import { DatabaseMarcher } from "../../src/global/classes/Marcher";
import * as ShapeTable from "./tables/ShapeTable";
import * as ShapePageTable from "./tables/ShapePageTable";
import * as ShapePageMarcherTable from "./tables/ShapePageMarcherTable";
import * as FieldPropertiesTable from "./tables/FieldPropertiesTable";
import * as MeasureTable from "./tables/MeasureTable";
import * as BeatTable from "./tables/BeatTable";
import * as UtilityTable from "./tables/UtilityTable";
import { getOrm } from "./db";

export class LegacyDatabaseResponse<T> {
    readonly success: boolean;
    /**
     * Resulting data from the database action. This isn't very well implemented
     * and likely will not be used.
     */
    readonly result?: T;
    readonly error?: { message: string; stack?: string };

    constructor(success: boolean, result?: any, error?: Error) {
        this.success = success;
        this.result = result;
        this.error = error;
    }
}

/**
 * History response customized for the OpenMarch database.
 */
export interface HistoryResponse extends History.HistoryResponse {
    /** The ids of the marchers that were modified from this history action */
    marcherIds: number[];
    /**
     * The id of the page that was modified from this history action.
     * If multiple, it chooses the page with the highest id
     */
    pageId?: number;
}

/* ============================ DATABASE ============================ */
let DB_PATH = "";

/**
 * Change the location of the database file the application and actively updates.
 *
 * @param path the path to the database file
 * @returns 200 if successful, -1 if the file does not exist
 */
export function setDbPath(path: string, isNewFile = false) {
    const failedDb = (message: string) => {
        console.error(message);
        DB_PATH = "";
        return -1;
    };
    if (!fs.existsSync(path) && !isNewFile) {
        return failedDb(`setDbPath: File does not exist at path: ${path}`);
    }

    DB_PATH = path;
    const db = connect();

    const user_version = db.pragma("user_version", { simple: true });
    if (user_version === -1) {
        return failedDb(
            `setDbPath: user_version is -1, meaning the database was not created successfully`,
        );
    }

    return 200;
}

export function getDbPath() {
    return DB_PATH;
}

export function databaseIsReady() {
    const isReady = DB_PATH.length > 0 && fs.existsSync(DB_PATH);
    console.log("databaseIsReady:", isReady);
    if (DB_PATH.length > 0) {
        console.log("Database path:", DB_PATH);
    } else {
        console.log("Database path is empty");
    }
    return isReady;
}

export function connect() {
    if (!DB_PATH) {
        throw new Error("Database path is empty");
    }
    try {
        const dbPath = DB_PATH;
        return Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        console.error(error);

        throw new Error(
            "Failed to connect to database:\nPLEASE RUN 'node_modules/.bin/electron-rebuild -f -w better-sqlite3' to resolve this",
            error,
        );
    }
}

/* ============================ Handlers ============================ */
async function connectWrapper<T>(
    func: (args: any) => DatabaseResponse<T | undefined> | T,
    args: any = {},
): Promise<DatabaseResponse<T | undefined>> {
    const db = connect();
    db.pragma("foreign_keys = ON");
    const orm = getOrm(db);
    let result: Promise<DatabaseResponse<T | undefined>>;
    try {
        let fnResult = func({ ...args, db, orm });
        if (
            !fnResult ||
            typeof fnResult !== "object" ||
            !("success" in fnResult)
        ) {
            fnResult = { success: true, data: fnResult };
        }
        result = Promise.resolve(fnResult);
    } catch (error: any) {
        console.error(error);
        result = Promise.resolve({
            success: false,
            data: undefined,
            error: { message: error.message, stack: error.stack },
        });
    } finally {
        db.close();
    }
    return result;
}

/**
 * Core SQL proxy logic with dependency injection for Drizzle ORM
 *
 * Per Drizzle documentation:
 * - When method is "get", return {rows: string[]}
 * - Otherwise, return {rows: string[][]}
 *
 * https://orm.drizzle.team/docs/connect-drizzle-proxy
 */
async function handleSqlProxyWithDb(
    db: Database.Database,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        // prevent multiple queries
        const sqlBody = sql.replace(/;/g, "");

        const result = db.prepare(sqlBody);

        let rows: any;
        switch (method) {
            case "all":
                rows = result.all(...params);
                return {
                    rows: rows
                        ? rows.map((row: { [key: string]: any }) =>
                              Object.values(row),
                          )
                        : [],
                };
            case "get":
                rows = result.get(...params);
                return {
                    rows: rows
                        ? Object.values(rows as Record<string, any>)
                        : [],
                };
            case "run":
                rows = result.run(...params);
                return {
                    rows: [], // no data returned for run
                };
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}

let persistentConnection: Database.Database | null = null;
let persistentConnectionPath: string | null = null;
async function handleSqlProxy(
    _: any,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        if (persistentConnectionPath !== DB_PATH) {
            persistentConnection?.close();
            persistentConnection = null;
            persistentConnectionPath = null;
        }

        if (!persistentConnection) {
            persistentConnection = connect();
            persistentConnection.pragma("foreign_keys = ON");
            persistentConnectionPath = DB_PATH;
        }

        return await handleSqlProxyWithDb(
            persistentConnection,
            sql,
            params,
            method,
        );
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}

export const _handleSqlProxyWithDb = handleSqlProxyWithDb;
/**
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Generic SQL proxy handler for Drizzle ORM
    ipcMain.handle("sql:proxy", handleSqlProxy);

    // Field properties
    ipcMain.handle("field_properties:get", async () =>
        connectWrapper<FieldProperties>(
            FieldPropertiesTable.getFieldProperties,
            {},
        ),
    );
    ipcMain.handle("field_properties:update", async (_, fieldProperties) =>
        connectWrapper<FieldProperties | null>(
            FieldPropertiesTable.updateFieldProperties,
            { fieldProperties },
        ),
    );
    ipcMain.handle("field_properties:get_image", async () =>
        connectWrapper<Buffer | null>(
            FieldPropertiesTable.getFieldPropertiesImage,
            {},
        ),
    );

    // File IO handlers located in electron/main/index.ts
    // Marcher
    ipcMain.handle("marcher:getAll", async () =>
        connectWrapper<DatabaseMarcher[]>(MarcherTable.getMarchers, {}),
    );
    ipcMain.handle("marcher:insert", async (_, args) =>
        connectWrapper<DatabaseMarcher[]>(MarcherTable.createMarchers, {
            newMarchers: args,
        }),
    );
    ipcMain.handle("marcher:update", async (_, args) =>
        connectWrapper<DatabaseMarcher[]>(MarcherTable.updateMarchers, {
            modifiedMarchers: args,
        }),
    );
    ipcMain.handle("marcher:delete", async (_, marcherIds) =>
        connectWrapper<DatabaseMarcher[]>(MarcherTable.deleteMarchers, {
            marcherIds,
        }),
    );

    // MarcherPage
    ipcMain.handle("marcher_page:getAll", async (_, args) =>
        connectWrapper(MarcherPageTable.getMarcherPages, args),
    );
    ipcMain.handle("marcher_page:get", async (_, args) =>
        connectWrapper(MarcherPageTable.getMarcherPage, args),
    );
    ipcMain.handle("marcher_page:update", async (_, args) =>
        connectWrapper(MarcherPageTable.updateMarcherPages, {
            marcherPageUpdates: args,
        }),
    );

    // **** Timing Objects ****

    // Page
    ipcMain.handle("page:getAll", async () =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.getPages),
    );
    ipcMain.handle("page:insert", async (_, args) =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.createPages, {
            newPages: args,
        }),
    );
    ipcMain.handle(
        "page:update",
        async (_, pages: PageTable.ModifiedPageArgs[]) =>
            connectWrapper<PageTable.DatabasePage[]>(PageTable.updatePages, {
                modifiedPages: pages,
            }),
    );
    ipcMain.handle("page:delete", async (_, pageIds) =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.deletePages, {
            pageIds,
        }),
    );

    // Beats
    ipcMain.handle("beat:getAll", async () =>
        connectWrapper(BeatTable.getBeats),
    );
    ipcMain.handle("beat:insert", async (_, newBeats, startingPosition) =>
        connectWrapper(BeatTable.createBeats, {
            newBeats,
            startingPosition,
        }),
    );
    ipcMain.handle("beat:update", async (_, modifiedBeats) =>
        connectWrapper(BeatTable.updateBeats, {
            modifiedBeats,
        }),
    );
    ipcMain.handle("beat:delete", async (_, beatIds) =>
        connectWrapper(BeatTable.deleteBeats, {
            beatIds,
        }),
    );

    // Measures
    ipcMain.handle("measure:getAll", async () =>
        connectWrapper(MeasureTable.getMeasures),
    );
    ipcMain.handle("measure:insert", async (_, newMeasures) =>
        connectWrapper(MeasureTable.createMeasures, {
            newMeasures,
        }),
    );
    ipcMain.handle("measure:update", async (_, modifiedMeasures) =>
        connectWrapper(MeasureTable.updateMeasures, {
            modifiedMeasures,
        }),
    );
    ipcMain.handle("measure:delete", async (_, measureIds) =>
        connectWrapper(MeasureTable.deleteMeasures, {
            measureIds,
        }),
    );

    // Audio Files
    // Insert audio file is defined in main index.ts
    ipcMain.handle("audio:getAll", async () => getAudioFilesDetails());
    ipcMain.handle("audio:getSelected", async () => getSelectedAudioFile());
    ipcMain.handle("audio:select", async (_, audioFileId: number) =>
        setSelectAudioFile(audioFileId),
    );
    ipcMain.handle("audio:update", async (_, args: ModifiedAudioFileArgs[]) =>
        updateAudioFiles(args),
    );
    ipcMain.handle("audio:delete", async (_, audioFileId: number) =>
        deleteAudioFile(audioFileId),
    );

    /*********** SHAPES ***********/
    // Shape
    ipcMain.handle("shape:getAll", async () =>
        connectWrapper<ShapeTable.Shape[]>(ShapeTable.getShapes),
    );
    ipcMain.handle("shape:insert", async (_, args: ShapeTable.NewShapeArgs[]) =>
        connectWrapper<ShapeTable.Shape[]>(ShapeTable.createShapes, { args }),
    );
    ipcMain.handle(
        "shape:update",
        async (_, args: ShapeTable.ModifiedShapeArgs[]) =>
            connectWrapper<ShapeTable.Shape[]>(ShapeTable.updateShapes, {
                args,
            }),
    );
    ipcMain.handle("shape:delete", async (_, shapeIds: Set<number>) =>
        connectWrapper<ShapeTable.Shape[]>(ShapeTable.deleteShapes, {
            ids: shapeIds,
        }),
    );

    // ShapePage
    ipcMain.handle("shape_page:getAll", async () =>
        connectWrapper<ShapePageTable.ShapePage[]>(
            ShapePageTable.getShapePages,
        ),
    );
    ipcMain.handle(
        "shape_page:insert",
        async (_, args: ShapePageTable.NewShapePageArgs[]) =>
            connectWrapper<ShapePageTable.ShapePage[]>(
                ShapePageTable.createShapePages,
                { args },
            ),
    );
    ipcMain.handle(
        "shape_page:update",
        async (_, args: ShapePageTable.ModifiedShapePageArgs[]) =>
            connectWrapper<ShapePageTable.ShapePage[]>(
                ShapePageTable.updateShapePages,
                {
                    args,
                },
            ),
    );
    ipcMain.handle("shape_page:delete", async (_, shapePageIds: Set<number>) =>
        connectWrapper<ShapePageTable.ShapePage[]>(
            ShapePageTable.deleteShapePages,
            {
                ids: shapePageIds,
            },
        ),
    );

    ipcMain.handle(
        "shape_page:copy",
        async (_, shapePageId: number, targetPageId: number) =>
            connectWrapper<ShapePageTable.ShapePage | null>(
                ShapePageTable.copyShapePageToPage,
                {
                    shapePageId,
                    targetPageId,
                },
            ),
    );

    // ShapePageMarcher
    ipcMain.handle(
        "shape_page_marcher:get",
        async (_, shapePageId: number, marcherIds: Set<number>) =>
            connectWrapper<ShapePageMarcherTable.ShapePageMarcher[]>(
                ShapePageMarcherTable.getShapePageMarchers,
                {
                    shapePageId,
                    marcherIds,
                },
            ),
    );
    ipcMain.handle(
        "shape_page_marcher:get_by_marcher_page",
        async (_, marcherPage: { marcher_id: number; page_id: number }) =>
            connectWrapper<ShapePageMarcherTable.ShapePageMarcher | null>(
                ShapePageMarcherTable.getSpmByMarcherPage,
                { marcherPage },
            ),
    );
    ipcMain.handle(
        "shape_page_marcher:insert",
        async (_, args: ShapePageMarcherTable.NewShapePageMarcherArgs[]) =>
            connectWrapper<ShapePageMarcherTable.ShapePageMarcher[]>(
                ShapePageMarcherTable.createShapePageMarchers,
                { args },
            ),
    );
    ipcMain.handle(
        "shape_page_marcher:update",
        async (_, args: ShapePageMarcherTable.ModifiedShapePageMarcherArgs[]) =>
            connectWrapper<ShapePageMarcherTable.ShapePageMarcher[]>(
                ShapePageMarcherTable.updateShapePageMarchers,
                {
                    args,
                },
            ),
    );
    ipcMain.handle(
        "shape_page_marcher:delete",
        async (_, shapePageMarcherIds: Set<number>) =>
            connectWrapper<ShapePageMarcherTable.ShapePageMarcher[]>(
                ShapePageMarcherTable.deleteShapePageMarchers,
                {
                    ids: shapePageMarcherIds,
                },
            ),
    );

    // utilities

    ipcMain.handle(
        "utilities:swap_marchers",
        async (_, args: Utilities.SwapMarchersArgs) =>
            connectWrapper(Utilities.swapMarchers, args),
    );

    ipcMain.handle("utility:getRecord", async () =>
        connectWrapper<UtilityTable.UtilityRecord | null>(
            UtilityTable.getUtilityRecord,
            {},
        ),
    );
    ipcMain.handle(
        "utility:updateRecord",
        async (
            _,
            utilityRecord: UtilityTable.ModifiedUtilityRecord,
            useNextUndoGroup: boolean,
        ) =>
            connectWrapper<UtilityTable.UtilityRecord>(
                UtilityTable.updateUtilityRecord,
                { utilityRecord, useNextUndoGroup },
            ),
    );

    // History utilities
    ipcMain.handle("history:flattenUndoGroupsAbove", async (_, group: number) =>
        connectWrapper(({ db }) => {
            History.flattenUndoGroupsAbove(db, group);
            return { success: true, data: null };
        }),
    );

    ipcMain.handle("history:getCurrentRedoGroup", async () =>
        connectWrapper(({ db }) => {
            const redoGroup = History.getCurrentRedoGroup(db);
            return { success: true, data: redoGroup };
        }),
    );

    ipcMain.handle("history:getCurrentUndoGroup", async () =>
        connectWrapper(({ db }) => {
            const undoGroup = History.getCurrentUndoGroup(db);
            return { success: true, data: undoGroup };
        }),
    );

    // for (const tableController of Object.values(ALL_TABLES)) {
    //     tableController.ipcCrudHandlers();
    // }
}

/* ======================= History Functions ======================= */
/**
 * Retrieves the table name from an SQL statement.
 * Assumes the table name is surrounded by double quotes. E.g.`UPDATE "table_name"`
 *
 * @param sql The SQL statement to get the table name from
 * @returns The table name from the SQL statement
 */
const tableNameFromSql = (sql: string): string => {
    return sql.match(/"(.*?)"/)?.[0].replaceAll('"', "") || "";
};

/**
 * Get the action from an SQL statement used in the history table.
 * Only "UPDATE", "DELETE", or "INSERT" - "ERROR" if invalid
 *
 * @param sql The SQL statement to get the action from
 * @returns The action from the SQL statement.
 */
const sqlActionFromSql = (
    sql: string,
): "UPDATE" | "DELETE" | "INSERT" | "ERROR" => {
    const action = sql.split(" ")[0].toUpperCase();
    if (action === "UPDATE" || action === "DELETE" || action === "INSERT")
        return action;
    return "ERROR";
};

const rowIdFromSql = (sql: string): number => {
    return parseInt(sql.match(/WHERE rowid=(\d+)/)?.[0] || "-1");
};

/**
 *
 * @param type The type of history action to perform, either "undo" or "redo"
 * @param db The database connection to use, or undefined to create a new connection
 * @returns Response from the history action
 */
export function performHistoryAction(
    type: "undo" | "redo",
    db?: Database.Database,
): HistoryResponse {
    const dbToUse = db || connect();
    let response: History.HistoryResponse;

    let marcherIds: number[] = [];
    let pageId: number | undefined;

    try {
        if (type === "undo") response = History.performUndo(dbToUse);
        else response = History.performRedo(dbToUse);

        // Get the marcher ids and page id from the SQL statements
        for (const sqlStatement of response.sqlStatements) {
            // Do not record the pageId or marcherIds if it is a DELETE statement
            if (sqlActionFromSql(sqlStatement) !== "DELETE") {
                const tableName = tableNameFromSql(sqlStatement);
                if (tableName === Constants.MarcherTableName) {
                    const marcherId = rowIdFromSql(sqlStatement);
                    marcherIds.push(marcherId);
                } else if (tableName === Constants.PageTableName) {
                    const newPageId = rowIdFromSql(sqlStatement);
                    if (newPageId > (pageId || -1)) pageId = newPageId;
                } else if (tableName === Constants.MarcherPageTableName) {
                    // If it's a marcher page, get the marcher id and page id of that marcher page
                    const marcherPageId = rowIdFromSql(sqlStatement);
                    const marcherPage = dbToUse
                        .prepare(
                            `SELECT marcher_id, page_id FROM ${Constants.MarcherPageTableName} WHERE rowid = (?)`,
                        )
                        .get(marcherPageId) as
                        | { marcher_id: number; page_id: number }
                        | undefined;
                    if (marcherPage) {
                        marcherIds.push(marcherPage.marcher_id);
                        if (marcherPage.page_id > (pageId || -1))
                            pageId = marcherPage.page_id;
                    }
                }
            }
        }
    } catch (error: any) {
        response = {
            success: false,
            error: {
                message: error?.message || "Could not get error message",
                stack: error?.stack || "Could not get stack",
            },
            tableNames: new Set(),
            sqlStatements: [],
        };
        console.error(error);
    } finally {
        if (!db) dbToUse.close();
    }

    return { ...response, marcherIds, pageId };
}

/* ============================ Audio Files ============================ */
/**
 * Gets the information on the audio files in the database.
 * I.e. just the path and nickname. This is to save memory so the whole audio file isn't loaded when not needed.
 *
 * @param db The database connection
 * @returns Array of measures
 */
async function getAudioFilesDetails(
    db?: Database.Database,
): Promise<AudioFile[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT id, path, nickname, selected FROM ${Constants.AudioFilesTableName}`,
    );
    const response = stmt.all() as AudioFile[];
    if (!db) dbToUse.close();
    return response;
}

/**
 * Gets the currently selected audio file in the database.
 *
 * If no audio file is selected, the first audio file in the database is selected.
 *
 * @returns The currently selected audio file in the database. Includes audio data.
 */
export async function getSelectedAudioFile(
    db?: Database.Database,
): Promise<AudioFile | null> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.AudioFilesTableName} WHERE selected = 1`,
    );
    const result = await stmt.get();
    if (!result) {
        const firstAudioFileStmt = dbToUse.prepare(
            `SELECT * FROM ${Constants.AudioFilesTableName} LIMIT 1`,
        );
        const firstAudioFile = (await firstAudioFileStmt.get()) as AudioFile;
        if (!firstAudioFile) {
            console.error("No audio files in the database");
            return null;
        }
        await setSelectAudioFile(firstAudioFile.id);
        return firstAudioFile as AudioFile;
    }
    dbToUse.close();
    return result as AudioFile;
}

/**
 * Sets the audio file with the given ID as "selected" meaning that this audio file will be used for playback.
 * This is done by setting the selected column to 1 for the selected audio file and 0 for all others.
 *
 * @param audioFileId The ID of the audio file to get
 * @returns The newly selected AudioFile object including the audio data
 */
async function setSelectAudioFile(
    audioFileId: number,
): Promise<AudioFile | null> {
    const db = connect();
    History.incrementUndoGroup(db);
    const stmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`,
    );
    stmt.run();
    const selectStmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 1 WHERE id = @audioFileId`,
    );
    await selectStmt.run({ audioFileId });
    const result = await getSelectedAudioFile(db);
    History.incrementUndoGroup(db);
    db.close();
    return result as AudioFile;
}

/**
 * Creates new measures in the database, completely replacing the old ABC string.
 * See documentation in createMeasureTable for how measures in OpenMarch are stored.
 * This also selects the newly created audio file.
 *
 * @param new_ABC_data The new ABC string to put into the database
 * @returns LegacyDatabaseResponse
 */
export async function insertAudioFile(
    audioFile: AudioFile,
): Promise<LegacyDatabaseResponse<AudioFile[]>> {
    const db = connect();
    const stmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`,
    );
    stmt.run();
    let output: LegacyDatabaseResponse<AudioFile[]> = { success: false };
    try {
        History.incrementUndoGroup(db);
        const insertStmt = db.prepare(`
                INSERT INTO ${Constants.AudioFilesTableName} (
                    data,
                    path,
                    nickname,
                    selected,
                    created_at,
                    updated_at
                )
                VALUES (
                    @data,
                    @path,
                    @nickname,
                    @selected,
                    @created_at,
                    @updated_at
                )
            `);
        const created_at = new Date().toISOString();
        const insertResult = insertStmt.run({
            ...audioFile,
            selected: 1,
            created_at,
            updated_at: created_at,
        });
        const id = insertResult.lastInsertRowid;

        output = {
            success: true,
            result: [{ ...audioFile, id: id as number }],
        };
    } catch (error: any) {
        console.error("Insert audio file error:", error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        History.incrementUndoGroup(db);
        db.close();
    }
    return output;
}

/**
 * Updates a list of audio files. The only thing that can be changed is the nickname.
 *
 * @param audioFileUpdates: Array of ModifiedAudioFileArgs objects to update the objects with
 * @returns - LegacyDatabaseResponse{success: boolean, result: Database.result | string}
 */
async function updateAudioFiles(
    audioFileUpdates: ModifiedAudioFileArgs[],
): Promise<LegacyDatabaseResponse<AudioFile[]>> {
    const db = connect();
    let output: LegacyDatabaseResponse<AudioFile[]> = { success: true };
    try {
        History.incrementUndoGroup(db);
        for (const audioFileUpdate of audioFileUpdates) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(audioFileUpdate)
                .map((key) => `${key} = @${key}`)
                .join(", ");

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error("No valid properties to update");
            }

            let existingAudioFiles = await getAudioFilesDetails();
            const previousState = existingAudioFiles.find(
                (audioFile) => audioFile.id === audioFileUpdate.id,
            );
            if (!previousState) {
                console.error(
                    `No audio file found with ID ${audioFileUpdate.id}`,
                );
                continue;
            }
            const stmt = db.prepare(`
                UPDATE ${Constants.AudioFilesTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);

            await stmt.run({
                ...audioFileUpdate,
                new_updated_at: new Date().toISOString(),
            });

            // Get the new audio file
            existingAudioFiles = await getAudioFilesDetails();
            const newAudioFile = existingAudioFiles.find(
                (audioFile) => audioFile.id === audioFileUpdate.id,
            );
            if (!newAudioFile) {
                console.error(
                    `No audio file found with ID ${audioFileUpdate.id}`,
                );
                continue;
            }
        }
        output = { success: true };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        History.incrementUndoGroup(db);
        db.close();
    }
    return output;
}

/**
 * Deletes an audio file with the given id.
 *
 * @param audioFileId
 * @returns {success: boolean, error?: string}
 */
async function deleteAudioFile(
    audioFileId: number,
): Promise<LegacyDatabaseResponse<AudioFile>> {
    const db = connect();
    let output: LegacyDatabaseResponse<AudioFile> = { success: true };
    try {
        History.incrementUndoGroup(db);
        const pageStmt = db.prepare(`
            DELETE FROM ${Constants.AudioFilesTableName}
            WHERE id = @audioFileId
        `);
        pageStmt.run({ audioFileId });
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: error };
    } finally {
        History.incrementUndoGroup(db);
        db.close();
    }
    return output;
}
