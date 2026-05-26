/* eslint-disable no-console */
import * as fs from "fs";
import type { DatabaseSync } from "node:sqlite";
import Constants from "../../src/global/Constants";
import AudioFile, {
    ModifiedAudioFileArgs,
} from "../../src/global/classes/AudioFile";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./migrations/schema";

let DB_PATH = "";
let persistentConnection: DatabaseSync | null = null;
let persistentConnectionPath: string | null = null;

export class BrowserDatabaseResponse<T> {
    readonly success: boolean;
    readonly result?: T;
    readonly error?: { message: string; stack?: string };

    constructor(success: boolean, result?: T, error?: Error) {
        this.success = success;
        this.result = result;
        this.error = error
            ? { message: error.message, stack: error.stack }
            : undefined;
    }
}

export function setDbPath(path: string) {
    const failedDb = (message: string, statusCode: number = -1) => {
        console.error(message);
        DB_PATH = "";
        return statusCode;
    };

    if (!path.endsWith(".dots")) {
        return failedDb(`setDbPath: File must be a .dots file: ${path}`, 400);
    }

    if (!fs.existsSync(path)) {
        return failedDb(`setDbPath: File does not exist at path: ${path}`, 404);
    }

    try {
        fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        return failedDb(
            `setDbPath: File is not readable and writable: ${path}`,
            403,
        );
    }

    persistentConnection?.close();
    persistentConnection = null;
    persistentConnectionPath = null;
    DB_PATH = path;

    const db = connect();
    try {
        const user_version = (
            db.prepare("PRAGMA user_version").get() as { user_version: number }
        ).user_version;
        if (user_version === -1) {
            return failedDb(
                "setDbPath: database was not created successfully",
                500,
            );
        }
        return 200;
    } finally {
        db.close();
    }
}

export function getDbPath() {
    return DB_PATH;
}

export function databaseIsReady() {
    return DB_PATH.length > 0 && fs.existsSync(DB_PATH);
}

export function connect() {
    if (!DB_PATH) throw new Error("Database path is empty");
    const sqlite = process.getBuiltinModule?.("node:sqlite") as
        | typeof import("node:sqlite")
        | undefined;
    if (!sqlite?.DatabaseSync)
        throw new Error("node:sqlite module is unavailable");
    return new sqlite.DatabaseSync(DB_PATH);
}

export async function applyMigrations(migrationsFolder: string) {
    const { DrizzleMigrationService } =
        await import("./services/DrizzleMigrationService");
    const db = connect();
    try {
        const drizzleDb = drizzle(
            (async (
                sql: string,
                params: any[],
                method: "all" | "run" | "get" | "values",
            ) => handleSqlProxyWithDb(db, sql, params, method)) as any,
            { schema, casing: "snake_case" },
        );
        const migrator = new DrizzleMigrationService(drizzleDb, db);
        await migrator.applyPendingMigrations(migrationsFolder);
    } finally {
        db.close();
    }
}

export async function handleSqlProxy(
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
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

    return handleSqlProxyWithDb(persistentConnection, sql, params, method);
}

export async function handleSqlProxyWithDb(
    db: DatabaseSync,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    const normalizedParams = params.map((param) =>
        param === undefined ? null : param,
    );
    const statement = db.prepare(sql);

    switch (method) {
        case "all":
        case "values": {
            statement.setReturnArrays(true);
            const rows = statement.all(
                ...normalizedParams,
            ) as unknown as any[][];
            return { rows: rows || [] };
        }
        case "get": {
            statement.setReturnArrays(true);
            const rows = statement.get(...normalizedParams) as
                | any[]
                | undefined;
            return { rows: rows || undefined };
        }
        case "run":
            statement.run(...normalizedParams);
            return { rows: [] };
        default:
            throw new Error(`Unknown method: ${method}`);
    }
}

export async function handleUnsafeSqlProxy(sql: string) {
    const db = connect();
    try {
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
    } finally {
        db.close();
    }
}

export async function getAudioFilesDetails(): Promise<AudioFile[]> {
    const db = connect();
    try {
        return db
            .prepare(
                `SELECT id, path, nickname, selected FROM ${Constants.AudioFilesTableName}`,
            )
            .all() as unknown as AudioFile[];
    } finally {
        db.close();
    }
}

export async function getSelectedAudioFile(): Promise<AudioFile | null> {
    const db = connect();
    try {
        const selected = db
            .prepare(
                `SELECT * FROM ${Constants.AudioFilesTableName} WHERE selected = 1`,
            )
            .get() as unknown as AudioFile | undefined;
        if (selected) return serializeAudioFile(selected);

        const firstAudioFile = db
            .prepare(`SELECT * FROM ${Constants.AudioFilesTableName} LIMIT 1`)
            .get() as unknown as AudioFile | undefined;
        if (!firstAudioFile) return null;
        await setSelectedAudioFile(firstAudioFile.id);
        return serializeAudioFile(firstAudioFile);
    } finally {
        db.close();
    }
}

export async function setSelectedAudioFile(
    audioFileId: number,
): Promise<AudioFile | null> {
    const db = connect();
    try {
        db.prepare(
            `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`,
        ).run();
        db.prepare(
            `UPDATE ${Constants.AudioFilesTableName} SET selected = 1 WHERE id = ?`,
        ).run(audioFileId);
    } finally {
        db.close();
    }
    return getSelectedAudioFile();
}

export async function updateAudioFiles(
    audioFileUpdates: ModifiedAudioFileArgs[],
): Promise<BrowserDatabaseResponse<AudioFile[]>> {
    const db = connect();
    try {
        for (const audioFileUpdate of audioFileUpdates) {
            const setClause = Object.keys(audioFileUpdate)
                .filter((key) => key !== "id")
                .map((key) => `${key} = @${key}`)
                .join(", ");
            if (!setClause) continue;
            db.prepare(
                `UPDATE ${Constants.AudioFilesTableName}
                 SET ${setClause}, updated_at = @new_updated_at
                 WHERE id = @id`,
            ).run({
                ...audioFileUpdate,
                new_updated_at: new Date().toISOString(),
            });
        }
        return new BrowserDatabaseResponse<AudioFile[]>(true);
    } catch (error) {
        return new BrowserDatabaseResponse<AudioFile[]>(
            false,
            undefined,
            error as Error,
        );
    } finally {
        db.close();
    }
}

export async function deleteAudioFile(audioFileId: number) {
    const db = connect();
    try {
        db.prepare(
            `DELETE FROM ${Constants.AudioFilesTableName} WHERE id = ?`,
        ).run(audioFileId);
    } finally {
        db.close();
    }
    return getSelectedAudioFile();
}

function serializeAudioFile(audioFile: AudioFile): AudioFile {
    const data = audioFile.data;
    if (data instanceof Uint8Array) {
        return { ...audioFile, data: Array.from(data) as any };
    }
    return audioFile;
}
