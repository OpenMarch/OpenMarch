import { DatabaseSync } from "node:sqlite";

export function runInSqliteTransaction<T>(
    db: DatabaseSync,
    callback: () => T,
): T {
    db.exec("BEGIN");
    try {
        const result = callback();
        db.exec("COMMIT");
        return result;
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}
