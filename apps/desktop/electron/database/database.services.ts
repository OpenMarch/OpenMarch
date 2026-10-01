/* eslint-disable no-console */
import { ipcMain } from "electron";
import type { DatabaseSync } from "node:sqlite";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import type AudioFile from "../../src/global/classes/AudioFile";
import type { ModifiedAudioFileArgs } from "../../src/global/classes/AudioFile";
import { getOrm } from "./db";
import { handleSqlProxyWithDb } from "./sqlProxy";
import {
    decideFileVersion,
    FILE_TOO_NEW_STATUS,
    fileTooNewMessage,
    readUserVersion,
} from "./fileVersion";

export { handleSqlProxyWithDb };

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
 * @returns 200 if successful, HTTP status codes if appropriate (426 when the
 * file is from a newer release; nothing is written to it), or -1 otherwise
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
        const user_version = readUserVersion(db);
        if (user_version === -1) {
            return failedDb(
                `setDbPath: user_version is -1, meaning the database was not created successfully`,
                500,
            );
        }

        // Refuse a file from a newer release before anything below writes to it
        // (ADR 0001 §6).
        if (
            decideFileVersion(user_version, isNewFile).action ===
            "refuse-too-new"
        ) {
            return failedDb(
                `setDbPath: ${fileTooNewMessage(user_version)} [path=${path}]`,
                FILE_TOO_NEW_STATUS,
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
    return connectToPath(DB_PATH);
}

/**
 * Opens a connection to `path`, whatever the active path is. An open uses it to
 * reconnect to its own file after the convert-on-open worker (P9.8), since the
 * active path is global.
 */
export function connectToPath(path: string) {
    if (!path) {
        throw new Error("Database path is empty");
    }
    try {
        const sqlite = process.getBuiltinModule?.("node:sqlite") as
            | typeof import("node:sqlite")
            | undefined;
        if (!sqlite?.DatabaseSync) {
            throw new Error("node:sqlite module is unavailable");
        }
        return new sqlite.DatabaseSync(path);
    } catch (error: any) {
        console.error(error);

        throw new Error(
            "Failed to connect to database: " + error.message,
            error,
        );
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

/** The current suspension of the renderer's SQL, or null when it isn't suspended. */
let sqlProxySuspension: { token: number; reason: string } | null = null;
let lastSqlProxySuspensionToken = 0;

/**
 * Refuses the renderer's SQL (`sql:proxy`, `unsafeSql:proxy`) until
 * `resumeSqlProxy` is called with the returned token. Convert on open (P9.3)
 * suspends it for an open, so the page still showing the previous file can't
 * reach the file being opened and converted; it resumes once the window has
 * reloaded. A newer suspension takes over: resuming an older token then does
 * nothing, so one open's late resume can't lift the next open's suspension.
 */
export function suspendSqlProxy(reason: string): number {
    const token = ++lastSqlProxySuspensionToken;
    sqlProxySuspension = { token, reason };
    return token;
}

/** Lifts the suspension `token` started. Returns false when a newer suspension owns it. */
export function resumeSqlProxy(token: number): boolean {
    if (sqlProxySuspension?.token !== token) return false;
    sqlProxySuspension = null;
    return true;
}

/** Lifts any suspension. For tests and for recovering from an unexpected error. */
export function forceResumeSqlProxy() {
    sqlProxySuspension = null;
}

export function isSqlProxySuspended() {
    return sqlProxySuspension !== null;
}

function assertSqlProxyNotSuspended() {
    if (sqlProxySuspension !== null)
        throw new Error(
            `The database is not available: ${sqlProxySuspension.reason}`,
        );
}

/** How long the audio handlers' connections wait for another connection's lock. */
const AUDIO_BUSY_TIMEOUT_MS = 5000;

/**
 * A connection for the `audio:*` handlers. Like the renderer's SQL, they are
 * refused while an open suspends it (P9.8: the file may be converting in the
 * worker), and they wait for a lock instead of failing at once.
 */
function audioConnection(): DatabaseSync {
    assertSqlProxyNotSuspended();
    const db = connect();
    db.exec(`PRAGMA busy_timeout = ${AUDIO_BUSY_TIMEOUT_MS}`);
    return db;
}

export async function handleSqlProxy(
    _: any,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    assertSqlProxyNotSuspended();
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
export async function handleUnsafeSqlProxy(_: any, sql: string) {
    assertSqlProxyNotSuspended();
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
    const dbToUse = db || audioConnection();
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
    const dbToUse = db || audioConnection();
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
    const db = audioConnection();
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
    const db = audioConnection();
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
    const db = audioConnection();
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
    const db = audioConnection();
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
