import { ipcMain } from "electron";
import Database from "libsql";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import AudioFile, {
    ModifiedAudioFileArgs,
} from "../../src/global/classes/AudioFile";
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

    const user_version = (
        db.prepare("PRAGMA user_version").get() as {
            user_version: number;
        }
    ).user_version;
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
        return new Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        console.error(error);

        throw new Error(
            "Failed to connect to database: " + error.message,
            error,
        );
    }
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
export async function handleSqlProxyWithDb(
    db: Database.Database,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        // prevent multiple queries
        // const sqlBody = sql.replace(/;/g, "");

        const result = db.prepare(sql);

        let rows: any;

        switch (method) {
            case "all": {
                // Drizzle's mapResultRow expects all results to be arrays
                // Use raw() method to get the raw array values for all queries
                const rawValues = result.raw().all(...params) as any[][];
                // Return the raw arrays directly - Drizzle's mapResultRow expects arrays
                rows = rawValues;

                const resultObj = {
                    rows: rows || [],
                };
                return resultObj;
            }
            case "get": {
                // Drizzle's mapResultRow expects all results to be arrays
                // Use raw() method to get the raw array values for all queries
                const rawValues = result.raw().get(...params) as any[];
                // Return the raw array directly - Drizzle's mapResultRow expects an array
                rows = rawValues;

                const resultObj2 = {
                    rows: rows || undefined,
                };
                return resultObj2;
            }
            case "run":
                rows = result.run(...params);

                return {
                    rows: [], // no data returned for run
                };
            case "values": {
                // values() returns raw array values, similar to all() but used by migrator
                const rawValues = result.raw().all(...params) as any[][];
                rows = rawValues;

                return {
                    rows: rows || [],
                };
            }
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}

async function handleUnsafeSqlProxyWithDb(db: Database.Database, sql: string) {
    return await db.exec(sql);
}

export const getOrmConnection = () => {
    if (!persistentConnection) throw new Error("Db is not open");
    return getOrm(persistentConnection);
};

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
            persistentConnection.prepare("PRAGMA foreign_keys = ON").run();
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

/** Directly executes the SQL query without any parameters */
async function handleUnsafeSqlProxy(_: any, sql: string) {
    try {
        return await handleUnsafeSqlProxyWithDb(connect(), sql);
    } catch (error: any) {
        console.error("Error from unsafe SQL proxy:", error);
        throw error;
    }
}

/**
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Generic SQL proxy handler for Drizzle ORM
    ipcMain.handle("sql:proxy", handleSqlProxy);
    ipcMain.handle("unsafeSql:proxy", handleUnsafeSqlProxy);

    // File IO handlers located in electron/main/index.ts

    // Audio Files
    // ipcMain.handle("audio:insert") is defined in main/index.ts
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
}

/* ======================= History Functions ======================= */
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
    try {
        const stmt = dbToUse.prepare(
            `SELECT * FROM ${Constants.AudioFilesTableName} WHERE selected = 1`,
        );
        const result = await stmt.get();
        if (result) {
            return result as AudioFile;
        }

        // If no audio file is selected, select the first one
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
    } finally {
        if (!db) {
            dbToUse.close();
        }
    }
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
    const stmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`,
    );
    stmt.run();
    const selectStmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 1 WHERE id = @audioFileId`,
    );
    await selectStmt.run({ audioFileId });
    const result = await getSelectedAudioFile(db);
    db.close();
    return result as AudioFile;
}

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
async function deleteAudioFile(audioFileId: number): Promise<AudioFile | null> {
    const db = connect();
    try {
        const wasSelectedStmt = db.prepare(
            `SELECT selected FROM ${Constants.AudioFilesTableName} WHERE id = ?`,
        );
        const wasSelected = (wasSelectedStmt.get(audioFileId) as any)?.selected;

        const deleteStmt = db.prepare(
            `DELETE FROM ${Constants.AudioFilesTableName} WHERE id = ?`,
        );
        deleteStmt.run(audioFileId);

        if (wasSelected) {
            const newSelectedFile = await getSelectedAudioFile(db);
            if (newSelectedFile) {
                await setSelectAudioFile(newSelectedFile.id);
            }
        }
    } catch (error: any) {
        console.error(error);
        throw error;
    } finally {
        db.close();
    }

    return getSelectedAudioFile();
}
