/**
 * Read-only SQL checks for the 3D View window (ADR 0002 D-3).
 *
 * The window's `sqlRead` proxy only accepts statements whose first keyword is
 * `SELECT` or `WITH`. Main also runs them with `PRAGMA query_only` on, so a
 * `WITH … DELETE` or a second statement can't write either.
 */

/** Methods the window's Drizzle proxy may use. `run` is for writes, so it is refused. */
export const VIEW3D_SQL_READ_METHODS = ["all", "get", "values"] as const;
export type View3dSqlReadMethod = (typeof VIEW3D_SQL_READ_METHODS)[number];

/** Returns the first keyword of a statement in upper case, skipping whitespace and SQL comments. */
export function firstSqlKeyword(sql: string): string {
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        if (/\s/.test(ch)) {
            i++;
        } else if (sql.startsWith("--", i)) {
            const end = sql.indexOf("\n", i);
            i = end === -1 ? sql.length : end + 1;
        } else if (sql.startsWith("/*", i)) {
            const end = sql.indexOf("*/", i + 2);
            i = end === -1 ? sql.length : end + 2;
        } else {
            break;
        }
    }
    const match = /^[A-Za-z]+/.exec(sql.slice(i));
    return match ? match[0].toUpperCase() : "";
}

/** True when the statement starts with `SELECT` or `WITH`. */
export function isReadOnlySql(sql: unknown): boolean {
    if (typeof sql !== "string") return false;
    const keyword = firstSqlKeyword(sql);
    return keyword === "SELECT" || keyword === "WITH";
}

export function isView3dSqlReadMethod(
    method: unknown,
): method is View3dSqlReadMethod {
    return (VIEW3D_SQL_READ_METHODS as readonly unknown[]).includes(method);
}
