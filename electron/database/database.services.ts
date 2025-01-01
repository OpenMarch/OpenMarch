import { ipcMain } from "electron";
import Database from "better-sqlite3";
import path from "path";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import * as History from "./database.history";
import * as Utilities from "./utilities";
import FieldProperties from "../../src/global/classes/FieldProperties";
import AudioFile, { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import FieldPropertiesTemplates from "../../src/global/classes/FieldProperties.templates";
import * as MarcherTable from "./tables/MarcherTable";
import * as PageTable from "./tables/PageTable";
import * as MarcherPageTable from "./tables/MarcherPageTable";
import { DatabaseResponse } from "./DatabaseActions";
import { DatabaseMarcher } from "@/global/classes/Marcher";
import { ModifiedPageArgs } from "@/global/classes/Page";
import * as ShapeTable from "./tables/ShapeTable";
import * as ShapePageTable from "./tables/ShapePageTable";
import * as ShapePageMarcherTable from "./tables/ShapePageMarcherTable";

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
    if (!fs.existsSync(path) && !isNewFile) {
        console.error(`setDbPath: File does not exist at path: ${path}`);
        DB_PATH = "";
        return -1;
    }
    DB_PATH = path;
    return 200;
}

export function getDbPath() {
    return DB_PATH;
}

export function databaseIsReady() {
    console.log("databaseIsReady", DB_PATH);
    return DB_PATH.length > 0 && fs.existsSync(DB_PATH);
}

/**
 * Initiates the database by creating the tables if they do not exist.
 */
export function initDatabase() {
    const db = connect();
    console.log(db);
    console.log("Creating database...");
    if (!db) return;
    History.createHistoryTables(db);
    MarcherTable.createMarcherTable(db);
    PageTable.createPageTable(db);
    MarcherPageTable.createMarcherPageTable(db);
    createFieldPropertiesTable(
        db,
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
    );
    createMeasureTable(db);
    createAudioFileTable(db);
    ShapeTable.createShapeTable(db);
    ShapePageTable.createShapePageTable(db);
    ShapePageMarcherTable.createShapePageMarcherTable(db);
    console.log("Database created.");
    db.close();
}

export function connect() {
    try {
        const dbPath =
            DB_PATH.length > 0
                ? DB_PATH
                : path.resolve(
                      __dirname,
                      "../../",
                      "electron/database/",
                      "database.db",
                  );
        return Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        throw new Error(
            "Failed to connect to database:\nPLEASE RUN 'node_modules/.bin/electron-rebuild -f -w better-sqlite3' to resolve this",
            error,
        );
    }
}

function createFieldPropertiesTable(
    db: Database.Database,
    fieldProperties: FieldProperties,
) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.FieldPropertiesTableName}" (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json_data TEXT
            );
        `);
    } catch (error) {
        throw new Error(`Failed to create field properties table: ${error}`);
    }
    const stmt = db.prepare(`
        INSERT INTO ${Constants.FieldPropertiesTableName} (
            id,
            json_data
        ) VALUES (
            1,
            @json_data
        );
    `);
    stmt.run({ json_data: JSON.stringify(fieldProperties) });
    console.log("Field properties table created.");
    History.createUndoTriggers(db, Constants.FieldPropertiesTableName);
}

/**
 * Measures in OpenMarch use a simplified version of ABC notation.
 * There is only ever one entry in this table, and it is the ABC notation string.
 * When updating measures, this string will be modified.
 *
 * @param db Database object to use
 */
function createMeasureTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MeasureTableName}" (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                abc_data TEXT,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
        // Create a default entry
        const stmt = db.prepare(`
            INSERT INTO ${Constants.MeasureTableName} (
                id,
                abc_data,
                "created_at",
                "updated_at"
            ) VALUES (
                1,
                @abc_data,
                @created_at,
                @updated_at
            );
        `);
        const created_at = new Date().toISOString();
        stmt.run({
            abc_data: defaultMeasures,
            created_at,
            updated_at: created_at,
        });
        History.createUndoTriggers(db, Constants.MeasureTableName);
        console.log("Measures table created.");
    } catch (error) {
        throw new Error(`Failed to create Measures table: ${error}`);
    }
}

/**
 * Audio files are stored in the database as BLOBs.
 * There can be multiple audio files in the database, but only one is used at a time.
 * They can be used to differentiate tracks with metronome, simplified parts, etc.
 *
 * @param db Database object to use
 */
function createAudioFileTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.AudioFilesTableName}" (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                nickname TEXT,
                data BLOB,
                selected INTEGER NOT NULL DEFAULT 0,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
        History.createUndoTriggers(db, Constants.AudioFilesTableName);
    } catch (error) {
        throw new Error(`Failed to create audio file table: ${error}`);
    }
    console.log("audio file table created.");
}

/* ============================ Handlers ============================ */
async function connectWrapper<T>(
    func: (args: any) => DatabaseResponse<T | undefined>,
    args: any = {},
): Promise<DatabaseResponse<T | undefined>> {
    const db = connect();
    let result: Promise<DatabaseResponse<T | undefined>>;
    try {
        result = Promise.resolve(func({ ...args, db }));
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
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Field properties
    ipcMain.handle("field_properties:get", async () => getFieldProperties());
    ipcMain.handle("field_properties:update", async (_, field_properties) =>
        updateFieldProperties(field_properties),
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

    // Page
    ipcMain.handle("page:getAll", async () =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.getPages),
    );
    ipcMain.handle("page:insert", async (_, args) =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.createPages, {
            newPages: args,
        }),
    );
    ipcMain.handle("page:update", async (_, pages: ModifiedPageArgs[]) =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.updatePages, {
            modifiedPages: pages,
        }),
    );
    ipcMain.handle("page:delete", async (_, pageIds) =>
        connectWrapper<PageTable.DatabasePage[]>(PageTable.deletePages, {
            pageIds,
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

    // Measure
    ipcMain.handle("measure:getAll", async () => getMeasures());
    ipcMain.handle("measure:update", async (_, abcString: string) =>
        updateMeasuresAbcString(abcString),
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

/* ======================== Field Properties ======================== */
/**
 * Gets the field properties from the database.
 *
 * @param db
 * @returns
 */
export function getFieldProperties(db?: Database.Database): FieldProperties {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.FieldPropertiesTableName}`,
    );
    const result = stmt.get({});
    const jsonData = (result as any).json_data;
    const fieldProperties = JSON.parse(jsonData) as FieldProperties;
    if (!db) dbToUse.close();
    return fieldProperties;
}

/**
 * Updates the field properties in the database.
 *
 * @param fieldProperties The new field properties
 * @returns {success: boolean, result?: FieldProperties, error?: string}
 */
export function updateFieldProperties(
    fieldProperties: FieldProperties,
    db?: Database.Database,
): LegacyDatabaseResponse<FieldProperties> {
    const dbToUse = db || connect();
    let output: LegacyDatabaseResponse<FieldProperties> = { success: true };

    try {
        const stmt = dbToUse.prepare(`
            UPDATE ${Constants.FieldPropertiesTableName}
            SET json_data = @json_data
            WHERE id = 1
        `);
        stmt.run({ json_data: JSON.stringify(fieldProperties) });
        const newFieldProperties = getFieldProperties(dbToUse);
        output = { success: true, result: newFieldProperties };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        History.incrementUndoGroup(dbToUse);
        if (!db) dbToUse.close();
    }
    return output;
}

/* ============================ Measures ============================ */
const defaultMeasures = `X:1
Q:1/4=120
M:4/4
V:1 baritone
V:1
z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |
`;
/***** NOTE - Measures are currently not part of the history table *****/

/**
 * Gets all of the measures from the database.
 *
 * @param db The database connection
 * @returns Array of measures
 */
async function getMeasures(db?: Database.Database): Promise<string> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.MeasureTableName} WHERE id = 1`,
    );
    const response = stmt.all() as {
        abc_data: string;
        created_at: string;
        updated_at: string;
    }[];
    if (response.length === 0 || response[0].abc_data.length < 20) {
        response[0].abc_data = defaultMeasures;
        updateMeasuresAbcString(defaultMeasures);
    }
    if (!db) dbToUse.close();
    return response[0].abc_data;
}

/**
 * Updates the ABC representation of the measures in the database.
 *
 * @param abcString The new ABC string to put into the database
 * @returns LegacyDatabaseResponse
 */
async function updateMeasuresAbcString(
    abcString: string,
): Promise<LegacyDatabaseResponse<string>> {
    const db = connect();
    let output: LegacyDatabaseResponse<string> = { success: false };
    try {
        History.incrementUndoGroup(db);
        const stmt = db.prepare(`
                UPDATE ${Constants.MeasureTableName}
                SET abc_data = @abc_data, updated_at = @new_updated_at
                WHERE id = 1
            `);
        await stmt.run({
            abc_data: abcString,
            new_updated_at: new Date().toISOString(),
        });
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
