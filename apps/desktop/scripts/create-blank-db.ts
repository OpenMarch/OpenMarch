#!/usr/bin/env node

import Database from "better-sqlite3";
import { join } from "path";
import * as fs from "fs";
import { getOrm } from "../electron/database/db";
import { DrizzleMigrationService } from "../electron/database/services/DrizzleMigrationService";

const DATABASE_PATH = join(
    __dirname,
    "../electron/database/migrations/_blank.dots",
);

async function createDatabase() {
    try {
        console.log(`Creating new database at: ${DATABASE_PATH}`);

        // Check if file already exists and delete it
        if (fs.existsSync(DATABASE_PATH)) {
            console.log(
                `⚠️  Database file already exists at ${DATABASE_PATH}, deleting it...`,
            );
            fs.unlinkSync(DATABASE_PATH);
        }

        // Create the database file
        const db = new Database(DATABASE_PATH);

        // Set user version to 7 (indicates Drizzle migration system)
        db.pragma("user_version = 7");

        const drizzleDb = getOrm(db);
        const migrator = new DrizzleMigrationService(drizzleDb, db);

        await migrator.applyPendingMigrations(
            join(__dirname, "../electron", "database", "migrations"),
        );
        await migrator.initializeDatabase(drizzleDb);

        db.close();
    } catch (error) {
        console.error("❌ Error creating database:", error);
        process.exit(1);
    }

    console.log("✅ Database created and migrated successfully!");
}

// Run the script
void createDatabase();
