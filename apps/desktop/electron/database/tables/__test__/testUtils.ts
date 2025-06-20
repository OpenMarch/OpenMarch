import Database from "better-sqlite3";
import { getOrm, schema } from "electron/database/db";
import { DrizzleMigrationService } from "electron/database/services/DrizzleMigrationService";

export const initTestDatabase = async (): Promise<Database.Database> => {
    const db = new Database(":memory:");
    const orm = getOrm(db);
    const migrator = new DrizzleMigrationService(orm, db);
    await migrator.applyPendingMigrations();
    await migrator.initializeDatabase(db);

    // create 16 beats
    const beatValues = Array.from({ length: 16 }, (_, i) => ({
        duration: 0.5,
        position: i + 1,
    }));
    orm.insert(schema.beats).values(beatValues).run();
    return db;
};
