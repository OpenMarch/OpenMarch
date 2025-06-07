import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getOrm } from "./db";
import v6 from "./versions/v6";
import * as DatabaseServices from "../database/database.services";
import { join } from "path";
import * as fs from "fs";
import Database from "better-sqlite3";

export const migrateDb = async (
    db: Database.Database,
    path: string,
    backupDir: string,
) => {
    const currentVersion = db.pragma("user_version", {
        simple: true,
    }) as number;
    if (currentVersion < 7) {
        const migrator = new v6(DatabaseServices.connect);
        console.log("Checking database version to see if migration is needed");
        // Create backup before migration
        if (currentVersion !== migrator.version) {
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir);
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const originalName = path.split(/[\\/]/).pop();
            const backupPath = join(
                backupDir,
                `backup_${timestamp}_${originalName}`,
            );
            console.log("Creating backup of database in " + backupPath);
            fs.copyFileSync(path, backupPath);

            console.log("Deleting backups older than 30 days");
            // Delete backups older than 30 days
            const files = fs.readdirSync(backupDir);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            files.forEach((file) => {
                const filePath = join(backupDir, file);
                const stats = fs.statSync(filePath);
                if (stats.birthtime < thirtyDaysAgo) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        migrator.migrateToThisVersion();
    } else if (currentVersion === 6) {
        console.log("Migrating database from version 6 to 7 using Drizzle...");
        const orm = getOrm(db);
        migrate(orm, {
            migrationsFolder: join(__dirname, "../database/schema/migrations"),
        });
        db.pragma("user_version = 7");
        console.log("Database migrated to version 8.");
    }

    if (currentVersion >= 7) {
        console.log("Checking for new Drizzle migrations...");
        const orm = getOrm(db);
        migrate(orm, {
            migrationsFolder: join(__dirname, "../database/schema/migrations"),
        });
        console.log("Drizzle migrations check complete.");
    }
};
