import Database from "better-sqlite3";
import CurrentDatabase from "../../../database/versions/CurrentDatabase";

export const initTestDatabase = (): Database.Database => {
    const db = new Database(":memory:");
    const dbBuilder = new CurrentDatabase(() => db);

    dbBuilder.createTables(".");
    // create 16 beats

    for (let x = 0; x < 16; x++) {
        db.prepare(
            `INSERT INTO beats ("duration", "position") VALUES (0.5, ${x + 1})`,
        ).run();
    }
    return db;
};
