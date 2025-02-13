import Database from "better-sqlite3";
import CurrentDatabase from "../../../database/versions/CurrentDatabase";

export const initTestDatabase = (): Database.Database => {
    const db = new Database(":memory:");
    const dbBuilder = new CurrentDatabase(() => db);
    dbBuilder.createTables();
    return db;
};
