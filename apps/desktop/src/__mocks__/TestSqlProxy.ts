import Database from "libsql";
import { getOrm } from "../../electron/database/db";
import { DrizzleMigrationService } from "../../electron/database/services/DrizzleMigrationService";
import { handleSqlProxyWithDb } from "../../electron/database/database.services";

/**
 * Test SQL Proxy implementation for unit tests
 * Creates an in-memory SQLite database with the proper schema
 */
export class TestSqlProxy {
    private db: Database.Database;

    constructor() {
        this.db = new Database(":memory:");
        this.db.prepare("PRAGMA foreign_keys = ON").run();
        this.db.prepare("PRAGMA user_version = 7").run();
    }

    async initializeSchema() {
        const orm = getOrm(this.db);
        const migrator = new DrizzleMigrationService(orm, this.db);
        await migrator.applyPendingMigrations();
        await DrizzleMigrationService.initializeDatabase(
            this.db as any,
            this.db,
        );
    }

    async handleSqlProxy(
        sql: string,
        params: any[],
        method: "all" | "run" | "get" | "values",
    ) {
        return handleSqlProxyWithDb(this.db, sql, params, method);
    }
}

export async function setupTestSqlProxy() {
    const testSqlProxy = new TestSqlProxy();
    await testSqlProxy.initializeSchema();
    window.electron = {
        ...window.electron,
        sqlProxy: testSqlProxy.handleSqlProxy.bind(testSqlProxy),
    };
}
