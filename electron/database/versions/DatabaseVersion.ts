import Database from "better-sqlite3";
import { createUndoTriggers } from "../database.history";

export default abstract class DatabaseVersion {
    public static readonly VERSION = 1;
    databaseConnector: () => Database.Database;

    constructor(databaseConnector: () => Database.Database) {
        this.databaseConnector = databaseConnector;
    }

    /**
     * Creates the necessary database tables for this version of the database.
     * This method should be implemented by concrete subclasses of `DatabaseVersion`
     * to handle the creation of tables specific to that database version.
     */
    abstract createTables(): void;

    /**
     * Creates a database table with the specified schema and optionally creates undo triggers for the table.
     * @param schema - The SQL schema to execute for creating the table.
     * @param tableName - The name of the table to create.
     * @param createHistoryTriggers - Whether to create undo triggers for the table. Defaults to `true`.
     * @param db - The database connection. Defaults to the database connection provided in the constructor.
     * @throws {Error} If the table creation fails.
     */
    protected createTable({
        schema,
        tableName,
        createHistoryTriggers = true,
        db = this.databaseConnector(),
    }: {
        schema: string;
        tableName: string;
        createHistoryTriggers?: boolean;
        db?: Database.Database;
    }) {
        try {
            db.exec(schema);
            console.log(`Table ${tableName} created.`);
            if (createHistoryTriggers) {
                createUndoTriggers(db, tableName);
                console.log(`\tHistory triggers created for ${tableName}.`);
            }
        } catch (error) {
            throw new Error(`Failed to create table ${tableName}: ${error}`);
        }
    }

    /**
     * Migrates the database from the previous version to the current version.
     * This method should be implemented by concrete subclasses of `DatabaseVersion`
     * to handle any necessary database schema changes or data migrations.
     */
    abstract migrateFromPreviousVersion(): void;

    /**
     * Retrieves the version of the database.
     * @param database - The database instance to retrieve the version from.
     * @returns The version of the database.
     * @throws {Error} If the version of the database could not be retrieved.
     */
    static getVersion(database: Database.Database): number {
        const version = database.pragma("user_version", {
            simple: true,
        }) as number;
        if (version === undefined) {
            throw new Error("Failed to get the version of the database.");
        }
        return version;
    }

    /**
     * Throws an error indicating that the specified version of the database is not supported.
     * @param version - The version of the database that is not supported.
     */
    migrateFromVersion(version: number): void {
        throw new Error(
            `Reached the end of the migration chain. Version ${version} is not supported.`,
        );
    }
}
