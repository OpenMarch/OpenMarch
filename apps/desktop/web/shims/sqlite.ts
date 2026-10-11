/**
 * TEMPORARY (see ../README.md). Stands in for `node:sqlite` in the web build:
 * `DatabaseSync` over sql.js, with every show held in memory.
 *
 * The app opens several connections to one file (the SQL proxy's long-lived
 * one, the audio handlers', the open's own). Here they all share one sql.js
 * database per path, as connections to one file share its contents, and
 * `close()` only closes the connection, never the shared database.
 */
import initSqlJs, {
    type BindParams,
    type Database,
    type SqlJsStatic,
    type SqlValue,
} from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let SQL: SqlJsStatic | null = null;
const databases = new Map<string, Database>();

/** Loads sql.js. Call once before anything opens a show. */
export async function loadSqlite() {
    SQL ??= await initSqlJs({ locateFile: () => sqlWasmUrl });
}

function sql(): SqlJsStatic {
    if (!SQL) throw new Error("sql.js is not loaded; call loadSqlite() first");
    return SQL;
}

/** Puts a show's bytes at `path`, replacing whatever was there. */
export function writeDatabase(path: string, bytes: Uint8Array) {
    databases.get(path)?.close();
    databases.set(path, new (sql().Database)(bytes));
}

/** The show at `path` as a `.dots` file. */
export function exportDatabase(path: string): Uint8Array {
    const db = databases.get(path);
    if (!db) throw new Error(`No database at ${path}`);
    return db.export();
}

export function databaseExists(path: string) {
    return databases.has(path);
}

export function deleteDatabase(path: string) {
    databases.get(path)?.close();
    databases.delete(path);
}

/** The shared database for `path`; a missing file is created empty, as SQLite does. */
function openShared(path: string): Database {
    let db = databases.get(path);
    if (!db) {
        db = new (sql().Database)();
        databases.set(path, db);
    }
    return db;
}

type Param = SqlValue | boolean | bigint | undefined;

function toBindable(value: Param): SqlValue {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "bigint") return Number(value);
    return value;
}

/** node:sqlite takes positional values, or one object of named ones (bare names allowed). */
function toBindParams(params: unknown[]): BindParams {
    const [first] = params;
    if (
        params.length === 1 &&
        first !== null &&
        typeof first === "object" &&
        !(first instanceof Uint8Array) &&
        !Array.isArray(first)
    ) {
        const named: Record<string, SqlValue> = {};
        for (const [key, value] of Object.entries(first)) {
            const bound = toBindable(value as Param);
            if (/^[:$@]/.test(key)) named[key] = bound;
            else {
                named[`:${key}`] = bound;
                named[`$${key}`] = bound;
                named[`@${key}`] = bound;
            }
        }
        return named;
    }
    return params.map((value) => toBindable(value as Param));
}

export class StatementSync {
    private returnArrays = false;

    constructor(
        private readonly db: Database,
        readonly sourceSQL: string,
    ) {
        // Prepare once now so syntax errors throw from prepare(), as in node:sqlite.
        db.prepare(sourceSQL).free();
    }

    setReturnArrays(enabled: boolean) {
        this.returnArrays = enabled;
    }

    setReadBigInts() {}
    setAllowBareNamedParameters() {}

    private rows(params: unknown[], limit = Infinity) {
        const statement = this.db.prepare(this.sourceSQL);
        try {
            statement.bind(toBindParams(params));
            const rows: unknown[] = [];
            while (rows.length < limit && statement.step())
                rows.push(
                    this.returnArrays
                        ? statement.get()
                        : { ...statement.getAsObject() },
                );
            return rows;
        } finally {
            statement.free();
        }
    }

    all(...params: unknown[]) {
        return this.rows(params);
    }

    get(...params: unknown[]) {
        return this.rows(params, 1)[0];
    }

    run(...params: unknown[]) {
        const statement = this.db.prepare(this.sourceSQL);
        try {
            statement.run(toBindParams(params));
        } finally {
            statement.free();
        }
        const changes = this.db.getRowsModified();
        const lastId = this.db.exec("SELECT last_insert_rowid()")[0]
            ?.values[0]?.[0];
        return { changes, lastInsertRowid: Number(lastId ?? 0) };
    }

    *iterate(...params: unknown[]) {
        yield* this.rows(params);
    }
}

export class DatabaseSync {
    private db: Database | null;

    constructor(
        readonly path: string,
        _options?: { readOnly?: boolean },
    ) {
        this.db = openShared(path);
    }

    get isOpen() {
        return this.db !== null;
    }

    private open(): Database {
        if (!this.db) throw new Error("database is not open");
        return this.db;
    }

    prepare(source: string) {
        return new StatementSync(this.open(), source);
    }

    exec(source: string) {
        this.open().exec(source);
    }

    close() {
        this.db = null;
    }
}

const sqlite = { DatabaseSync, StatementSync };
export default sqlite;
