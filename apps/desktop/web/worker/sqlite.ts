/**
 * Stands in for `node:sqlite` in the worker: `DatabaseSync` and
 * `StatementSync` over the official SQLite WebAssembly build, with every
 * show held in memory. `./storage.ts` keeps a copy in browser storage.
 *
 * In-memory databases are much faster here than SQLite's OPFS VFSes
 * (opfs-sahpool made updates that fire the undo triggers ~75x slower), and
 * need no cross-origin isolation headers.
 *
 * The app opens several connections to one file (the SQL proxy's long-lived
 * one, and short-lived ones for opening a show and for audio). All of them
 * share one SQLite connection per path: the worker is single-threaded, so
 * they could never run at the same moment anyway. `close()` closes the
 * stand-in, never the shared connection.
 */
import sqlite3InitModule, {
    type Database,
    type PreparedStatement,
    type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";

let sqlite3: Sqlite3Static | null = null;
const connections = new Map<string, Connection>();

/** Loads SQLite. Call once, before anything opens a show. */
export async function loadSqlite() {
    sqlite3 = await sqlite3InitModule();
}

function lib(): Sqlite3Static {
    if (!sqlite3) throw new Error("SQLite is not loaded; call loadSqlite()");
    return sqlite3;
}

/** Every show in memory, by path. */
export function listDatabases(): string[] {
    return [...connections.keys()];
}

export function databaseExists(path: string): boolean {
    return connections.has(path);
}

/** Puts a show's bytes at `path`, replacing whatever was there. */
export function writeDatabase(path: string, bytes: Uint8Array) {
    deleteDatabase(path);
    const connection = openConnection(path);
    const { capi, wasm } = lib();
    const pointer = wasm.allocFromTypedArray(bytes);
    const rc = capi.sqlite3_deserialize(
        connection.db.pointer!,
        "main",
        pointer,
        bytes.byteLength,
        bytes.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE |
            capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    connection.db.checkRc(rc);
    // Fail now, not on the first query, if these bytes aren't a database.
    connection.db.exec("SELECT count(*) FROM sqlite_schema");
}

/** The show at `path` as the bytes of a `.dots` file. */
export function exportDatabase(path: string): Uint8Array {
    const connection = connections.get(path);
    if (!connection) throw new Error(`No database at ${path}`);
    return lib().capi.sqlite3_js_db_export(connection.db);
}

/**
 * How many rows the show at `path` has changed since it opened, and whether
 * it is between transactions (so a copy of it is consistent).
 */
export function changeState(path: string) {
    const connection = connections.get(path);
    if (!connection) return null;
    const { capi } = lib();
    return {
        changes: Number(capi.sqlite3_total_changes(connection.db)),
        idle: capi.sqlite3_get_autocommit(connection.db) !== 0,
    };
}

/** Moves a show to a new path, e.g. a new-show draft to its name. */
export function renameDatabase(from: string, to: string) {
    if (from === to) return;
    const bytes = exportDatabase(from);
    writeDatabase(to, bytes);
    deleteDatabase(from);
}

export function deleteDatabase(path: string) {
    connections.get(path)?.close();
    connections.delete(path);
}

/** The SQLite connection every stand-in for `path` shares. */
class Connection {
    readonly db: Database;
    private readonly statements = new Map<string, PreparedStatement>();

    constructor() {
        this.db = new (lib().oo1.DB)(":memory:", "c");
        // The app's connections use node:sqlite's defaults.
        this.db.exec("PRAGMA foreign_keys = ON");
    }

    /**
     * A prepared statement for `sql`, reused between calls: Drizzle sends
     * the same few hundred statements over and over, and preparing is most
     * of the cost of a small query. Every use runs to completion before the
     * next starts, so one statement per SQL string is enough.
     */
    statement(sql: string): PreparedStatement {
        let statement = this.statements.get(sql);
        if (statement) {
            // Most recently used last, so the oldest is first to go.
            this.statements.delete(sql);
        } else {
            statement = this.db.prepare(sql);
            if (this.statements.size >= 500) {
                const [oldest, old] = this.statements.entries().next()
                    .value as [string, PreparedStatement];
                old.finalize();
                this.statements.delete(oldest);
            }
        }
        this.statements.set(sql, statement);
        return statement;
    }

    close() {
        for (const statement of this.statements.values()) statement.finalize();
        this.statements.clear();
        this.db.close();
    }
}

function openConnection(path: string): Connection {
    let connection = connections.get(path);
    if (!connection) {
        connection = new Connection();
        connections.set(path, connection);
    }
    return connection;
}

/** Closes every connection, e.g. before the page goes away. */
export function closeAll() {
    for (const connection of connections.values()) connection.close();
    connections.clear();
}

type Param = null | number | string | bigint | boolean | Uint8Array | undefined;

function toBindable(value: Param) {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
}

/**
 * node:sqlite takes positional values, or one object of named values whose
 * names may leave out the `:`, `@` or `$` prefix.
 */
function bind(statement: PreparedStatement, params: unknown[]) {
    statement.clearBindings();
    if (params.length === 0) return;
    const [first] = params;
    if (
        params.length === 1 &&
        first !== null &&
        typeof first === "object" &&
        !(first instanceof Uint8Array) &&
        !Array.isArray(first)
    ) {
        const named: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(first)) {
            const name = /^[:@$]/.test(key)
                ? key
                : ([":", "@", "$"]
                      .map((prefix) => prefix + key)
                      .find((candidate) =>
                          statement.getParamIndex(candidate),
                      ) ?? `:${key}`);
            named[name] = toBindable(value as Param);
        }
        statement.bind(named as never);
        return;
    }
    statement.bind(params.map((value) => toBindable(value as Param)) as never);
}

/** Integers past 2^53 come back as BigInt; node:sqlite returns numbers unless asked. */
function toNumber(value: unknown) {
    return typeof value === "bigint" ? Number(value) : value;
}

export class StatementSync {
    private returnArrays = false;

    constructor(
        private readonly connection: Connection,
        readonly sourceSQL: string,
    ) {
        // Prepare now so a syntax error throws from prepare(), as in node:sqlite.
        connection.statement(sourceSQL);
    }

    setReturnArrays(enabled: boolean) {
        this.returnArrays = enabled;
    }

    setReadBigInts() {}
    setAllowBareNamedParameters() {}

    private rows(params: unknown[], limit = Infinity): unknown[] {
        const statement = this.connection.statement(this.sourceSQL);
        try {
            bind(statement, params);
            const rows: unknown[] = [];
            while (rows.length < limit && statement.step()) {
                if (this.returnArrays) {
                    rows.push((statement.get([]) as unknown[]).map(toNumber));
                } else {
                    const row = statement.get({}) as Record<string, unknown>;
                    for (const key in row) row[key] = toNumber(row[key]);
                    rows.push(row);
                }
            }
            return rows;
        } finally {
            statement.reset();
        }
    }

    all(...params: unknown[]) {
        return this.rows(params);
    }

    get(...params: unknown[]) {
        return this.rows(params, 1)[0];
    }

    run(...params: unknown[]) {
        const statement = this.connection.statement(this.sourceSQL);
        try {
            bind(statement, params);
            while (statement.step()) {
                // Run to the end, as node:sqlite does.
            }
        } finally {
            statement.reset();
        }
        const { capi } = lib();
        const db = this.connection.db;
        return {
            changes: capi.sqlite3_changes(db),
            lastInsertRowid: Number(capi.sqlite3_last_insert_rowid(db)),
        };
    }

    /** Eager, unlike node:sqlite: the shared statement must be free for the next caller. */
    *iterate(...params: unknown[]) {
        yield* this.rows(params);
    }
}

export class DatabaseSync {
    private connection: Connection | null;

    constructor(
        readonly path: string,
        _options?: { readOnly?: boolean },
    ) {
        this.connection = openConnection(path);
    }

    get isOpen() {
        return this.connection !== null;
    }

    private open(): Connection {
        if (!this.connection) throw new Error("database is not open");
        return this.connection;
    }

    prepare(source: string) {
        return new StatementSync(this.open(), source);
    }

    exec(source: string) {
        this.open().db.exec(source);
    }

    close() {
        this.connection = null;
    }
}

const sqlite = { DatabaseSync, StatementSync };
export default sqlite;
