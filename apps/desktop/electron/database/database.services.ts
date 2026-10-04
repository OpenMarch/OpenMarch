/* eslint-disable no-console */
import { ipcMain } from "electron";
import type { DatabaseSync } from "node:sqlite";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import type AudioFile from "../../src/global/classes/AudioFile";
import type { ModifiedAudioFileArgs } from "../../src/global/classes/AudioFile";
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

let persistentConnection: DatabaseSync | null = null;
let persistentConnectionPath: string | null = null;

/** Closes the long-lived SQL proxy connection so the database file can be moved or deleted. */
export function closePersistentConnection() {
    persistentConnection?.close();
    persistentConnection = null;
    persistentConnectionPath = null;
}

/**
 * Change the location of the database file the application and actively updates.
 *
 * @param path the path to the database file
 * @returns 200 if successful, HTTP status codes if appropriate, or -1 otherwise
 */
export function setDbPath(path: string, isNewFile = false) {
    const failedDb = (message: string, statusCode: number = -1) => {
        console.error(message);
        DB_PATH = "";
        return statusCode;
    };

    if (!isNewFile) {
        if (!fs.existsSync(path)) {
            return failedDb(
                `setDbPath: File does not exist at path: ${path}`,
                404,
            );
        }

        try {
            fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
        } catch (err) {
            return failedDb(
                `setDbPath: File is not readable and writable: ${path}`,
                403,
            );
        }
    }

    // Reset any existing long-lived DB handle before opening a new path.
    closePersistentConnection();

    DB_PATH = path;
    const db = connect();

    try {
        const user_version = (
            db.prepare("PRAGMA user_version").get() as {
                user_version: number;
            }
        ).user_version;
        if (user_version === -1) {
            return failedDb(
                `setDbPath: user_version is -1, meaning the database was not created successfully`,
                500,
            );
        }

        // Probe write access: on macOS, fs.accessSync can pass for Documents/Downloads
        // even when the app lacks Full Disk Access, but SQLite writes fail with "disk I/O error".
        try {
            const probeTable = "__om_write_probe__";
            db.prepare(`DROP TABLE IF EXISTS ${probeTable}`).run();
            db.prepare(`CREATE TABLE ${probeTable} (x INTEGER)`).run();
            db.prepare(`DROP TABLE ${probeTable}`).run();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/disk\s*i\/o\s*error|i\/o\s*error/i.test(msg)) {
                return failedDb(
                    `setDbPath: Cannot write to database (missing folder access): ${path}`,
                    403,
                );
            }
            throw err;
        }

        return 200;
    } finally {
        // setDbPath only validates connectivity; close this temporary handle.
        db.close();
    }
}

export function getDbPath() {
    return DB_PATH;
}

let lastLoggedReadyState: boolean | null = null;
let lastLoggedPath: string | null = null;

export function databaseIsReady() {
    const isReady = DB_PATH.length > 0 && fs.existsSync(DB_PATH);
    // Only log when state or path changes to avoid noisy polling output
    if (isReady !== lastLoggedReadyState || DB_PATH !== lastLoggedPath) {
        console.log("databaseIsReady:", isReady);
        if (DB_PATH.length > 0) {
            console.log("Database path:", DB_PATH);
        } else {
            console.log("Database path is empty");
        }
        lastLoggedReadyState = isReady;
        lastLoggedPath = DB_PATH;
    }
    return isReady;
}

export function connect() {
    if (!DB_PATH) {
        throw new Error("Database path is empty");
    }
    try {
        const sqlite = process.getBuiltinModule?.("node:sqlite") as
            | typeof import("node:sqlite")
            | undefined;
        if (!sqlite?.DatabaseSync) {
            throw new Error("node:sqlite module is unavailable");
        }
        return new sqlite.DatabaseSync(DB_PATH);
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
    db: DatabaseSync,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        // node:sqlite rejects `undefined` bind values while previous drivers
        // tolerated them. Coerce to null for compatibility.
        const normalizedParams = params.map((param) =>
            param === undefined ? null : param,
        );

        // prevent multiple queries
        // const sqlBody = sql.replace(/;/g, "");

        const statement = db.prepare(sql);

        let rows: any;

        switch (method) {
            case "all": {
                // Drizzle's mapResultRow expects all results to be arrays
                statement.setReturnArrays(true);
                const rawValues = statement.all(
                    ...normalizedParams,
                ) as unknown as any[][];
                // Return the raw arrays directly - Drizzle's mapResultRow expects arrays
                rows = rawValues;

                const resultObj = {
                    rows: rows || [],
                };
                return resultObj;
            }
            case "get": {
                // Drizzle's mapResultRow expects all results to be arrays
                statement.setReturnArrays(true);
                const rawValues = statement.get(...normalizedParams) as
                    | any[]
                    | undefined;
                // Return the raw array directly - Drizzle's mapResultRow expects an array
                rows = rawValues;

                const resultObj2 = {
                    rows: rows || undefined,
                };
                return resultObj2;
            }
            case "run":
                rows = statement.run(...normalizedParams);

                return {
                    rows: [], // no data returned for run
                };
            case "values": {
                // values() returns raw array values, similar to all() but used by migrator
                statement.setReturnArrays(true);
                const rawValues = statement.all(
                    ...normalizedParams,
                ) as unknown as any[][];
                rows = rawValues;

                return {
                    rows: rows || [],
                };
            }
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        const describeParam = (value: unknown): string => {
            if (value === null) return "null";
            if (value === undefined) return "undefined";
            if (value instanceof Uint8Array) return "Uint8Array";
            if (value instanceof Date) return "Date";
            if (Array.isArray(value)) return "Array";
            return typeof value;
        };

        console.error("Error from SQL proxy:", error);
        console.error("SQL proxy context:", {
            method,
            sql,
            params: params.map((param) => (param === undefined ? null : param)),
            paramTypes: params.map(describeParam),
        });
        throw error;
    }
}

async function handleUnsafeSqlProxyWithDb(db: DatabaseSync, sql: string) {
    const beforeTotalChanges = (
        db.prepare("SELECT total_changes() AS totalChanges").get() as {
            totalChanges: number;
        }
    ).totalChanges;
    db.exec(sql);
    const afterTotalChanges = (
        db.prepare("SELECT total_changes() AS totalChanges").get() as {
            totalChanges: number;
        }
    ).totalChanges;
    return {
        success: true,
        changes: Math.max(0, afterTotalChanges - beforeTotalChanges),
    };
}

export const getOrmConnection = () => {
    if (!persistentConnection) throw new Error("Db is not open");
    return getOrm(persistentConnection);
};

export async function handleSqlProxy(
    _: any,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        if (persistentConnectionPath !== DB_PATH) {
            closePersistentConnection();
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
    const db = connect();
    try {
        return await handleUnsafeSqlProxyWithDb(db, sql);
    } catch (error: any) {
        console.error("Error from unsafe SQL proxy:", error);
        throw error;
    } finally {
        db.close();
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
async function getAudioFilesDetails(db?: DatabaseSync): Promise<AudioFile[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT id, path, nickname, selected FROM ${Constants.AudioFilesTableName}`,
    );
    const response = stmt.all() as unknown as AudioFile[];
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
    db?: DatabaseSync,
): Promise<AudioFile | null> {
    const dbToUse = db || connect();
    try {
        const stmt = dbToUse.prepare(
            `SELECT * FROM ${Constants.AudioFilesTableName} WHERE selected = 1`,
        );
        const result = await stmt.get();
        if (result) {
            return result as unknown as AudioFile;
        }

        // If no audio file is selected, select the first one
        const firstAudioFileStmt = dbToUse.prepare(
            `SELECT * FROM ${Constants.AudioFilesTableName} LIMIT 1`,
        );
        const firstAudioFile =
            (await firstAudioFileStmt.get()) as unknown as AudioFile;
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

type AudioFileInsert = {
    data?: ArrayBuffer | Uint8Array;
    path: string;
    nickname?: string;
    selected?: boolean;
};

export async function insertAudioFile(
    audioFile: AudioFileInsert,
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
        const dataForInsert =
            audioFile.data == null
                ? null
                : audioFile.data instanceof Uint8Array
                  ? audioFile.data
                  : new Uint8Array(audioFile.data);
        const insertResult = insertStmt.run({
            data: dataForInsert,
            path: audioFile.path,
            nickname: audioFile.nickname ?? null,
            selected: 1,
            created_at,
            updated_at: created_at,
        });
        const id = insertResult.lastInsertRowid;

        output = {
            success: true,
            result: [
                {
                    ...audioFile,
                    id: id as number,
                    selected: true,
                } as AudioFile,
            ],
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
