import Database from "better-sqlite3";
import { createUndoTriggers } from "../database.history";
import Constants from "../../../src/global/Constants";

export default abstract class DatabaseMigrator {
    /**
     * Gets the version of the database.
     * @returns The version of the database, or -1 if the version is not set.
     */
    get version(): number {
        return -1;
    }

    /**
     * A function that returns a database connection.
     * @returns {Database.Database} The database connection.
     */
    databaseConnector: () => Database.Database;

    constructor(databaseConnector: () => Database.Database) {
        this.databaseConnector = databaseConnector;
    }

    /**
     * Creates the necessary database tables for this version of the database.
     * This method should be implemented by concrete subclasses of `DatabaseMigrator`
     * to handle the creation of tables specific to that database version.
     */
    abstract createTables(version?: number): void;

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
     * Wraps the migration function with additional logic to handle the migration process.
     * This method is responsible for:
     * - Creating a new instance of the parent `DatabaseMigrator` class
     * - Retrieving the current database version
     * - Logging the migration process
     * - Checking if the database version is not the immediate previous version, and if so, recursively migrating to the previous version
     * - Executing the provided migration function
     * - Setting the database version pragma to the current version
     * - Logging the successful migration
     *
     * @param func - The migration function to be executed.
     */
    migrationWrapper(func: () => void, clearHistory: boolean = true) {
        const superMigrator = new (Object.getPrototypeOf(this.constructor))(
            this.databaseConnector,
        );
        const db = this.databaseConnector();
        const isThisVersion = this.isThisVersion(db);
        if (isThisVersion) {
            console.log(
                `Database version is up-to-date (v${this.version}). Not migrating`,
            );
        } else {
            const currentVersion = db.pragma("user_version", {
                simple: true,
            }) as number;
            console.log(
                `\n================ BEGIN MIGRATION: ${currentVersion} -> ${this.version} ================`,
            );
            console.log("Migrating database to newer version...");
            console.log(
                `currentVersion: ${currentVersion}, this.version: ${this.version}, superMigrator.version: ${superMigrator.version}`,
            );
            if (
                currentVersion !== superMigrator.version &&
                !(currentVersion === 0 && this.version === 2) // This is a special case for the initial migration
            ) {
                console.log(
                    `DATABASE MIGRATOR V-${this.version}: The database's version is not the immediate previous one, which would be ${superMigrator.version}. Continuing down the migration chain...`,
                    `Database version: ${currentVersion}`,
                );
                superMigrator.migrateToThisVersion(db);
            }
            func();
            this.setPragmaToThisVersion(db);

            if (clearHistory) {
                console.log("Clearing history...");
                this.clearHistory(db);
            }

            console.log(
                `Database migrated from version ${superMigrator.version} to ${this.version} successfully.`,
            );
            console.log(
                `================= END MIGRATION: ${currentVersion} -> ${this.version} ================\n`,
            );
        }
    }

    /**
     * Sets the "user_version" pragma of the database to the version of this class.
     * This is used to store the current version of the database.
     * @param db - The database instance to set the pragma on.
     */
    protected setPragmaToThisVersion(db: Database.Database) {
        db.pragma("user_version = " + this.version);
    }
    /**
     * Retrieves the version of the database.
     * @param database - The database instance to retrieve the version from.
     * @returns The version of the database.
     * @throws {Error} If the version of the database could not be retrieved.
     */
    static getVersion(database: Database.Database): number {
        const response = database.prepare("PRAGMA user_version").get() as {
            user_version: number;
        };
        if (response === undefined) {
            throw new Error("Failed to get the version of the database.");
        }
        return response.user_version;
    }

    /**
     * Checks if the current version of the database is the same as the version of this class.
     * @param db - An optional database instance to use for checking the version. If not provided, the default database connector will be used.
     * @returns `true` if the current database version matches the version of this class, `false` otherwise.
     * @throws {Error} If the database connection fails or the database version cannot be retrieved.
     */
    isThisVersion(db?: Database.Database): boolean {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");
        console.log("------> VERSION CHECK <------");
        const currentVersion = DatabaseMigrator.getVersion(dbToUse);

        console.log(
            `CHECKING DATABASE VERSION:\n\tcurrent -> ${currentVersion}\n\ttarget -> ${this.version}`,
        );

        if (currentVersion === undefined) {
            throw new Error("Failed to get the version of the database.");
        }

        if (currentVersion > this.version) {
            throw new Error(
                `Database version is higher than the version of this class. Make sure that you are using the highest database version. The database .dots file version is ${currentVersion}, the app thinks the highest version is ${this.version}`,
            );
        }
        console.log("------> END VERSION CHECK <------");

        return currentVersion === this.version;
    }

    /**
     * Migrates the database from the previous version to the current version.
     * This method should be implemented by concrete subclasses of `DatabaseMigrator`
     * to handle any necessary database schema changes or data migrations.
     *
     * This checks if the current version of the database is the same as the version of this class.
     */
    migrateToThisVersion(db?: Database.Database): void {
        throw new Error(
            `Reached the end of the migration chain, cannot migrate. Database version is ${this.version}`,
        );
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

    /**
     * Clears the undo and redo history tables in the database.
     * @param db - An optional Database instance to use. If not provided, the method will use the database connector provided by the class.
     * @throws {Error} If the database connection fails.
     */
    clearHistory(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");
        dbToUse.prepare(`DELETE FROM ${Constants.UndoHistoryTableName}`).run();
        dbToUse.prepare(`DELETE FROM ${Constants.RedoHistoryTableName}`).run();
    }
}
