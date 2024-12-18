import Database from "better-sqlite3";
import { createUndoTriggers } from "../database.history";

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
     * Sets the "user_version" pragma of the database to the version of this class.
     * This is used to store the current version of the database.
     * @param db - The database instance to set the pragma on.
     */
    protected setPragmaToThisVersion(db: Database.Database) {
        db.pragma("user_version = " + this.version);
    }

    /**
     * Wraps the migration function with additional logic to handle the migration process.
     * This method should be implemented by concrete subclasses of `DatabaseMigrator`
     * to handle the migration of the database to the specific version.
     *
     * @param superVersion - The version of the database that the migration is being applied to. Call super.version()
     * @param func - The migration function to be executed.
     */
    protected abstract migrationWrapper(
        superVersion: number,
        func: () => void,
    ): void;

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
     * Checks if the current version of the database is the same as the version of this class.
     * @param db - An optional database instance to use for checking the version. If not provided, the default database connector will be used.
     * @returns `true` if the current database version matches the version of this class, `false` otherwise.
     * @throws {Error} If the database connection fails or the database version cannot be retrieved.
     */
    isThisVersion(db?: Database.Database): boolean {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");
        console.log(
            "\n==================== VERSION CHECK ====================",
        );
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
        console.log("================= END VERSION CHECK =================\n");

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
}
