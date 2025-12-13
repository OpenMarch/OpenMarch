import { DbConnection } from "../tables/__test__/testUtils";
import { DB } from "../db";
import { sql } from "drizzle-orm";
import Database from "better-sqlite3";

const triggers = {
    prevent_first_beat_modification: `CREATE TRIGGER IF NOT EXISTS prevent_first_beat_modification
BEFORE UPDATE ON beats
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
END;`,
    prevent_first_beat_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_first_beat_deletion
BEFORE DELETE ON beats
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
END;`,
    prevent_first_page_modification: `CREATE TRIGGER IF NOT EXISTS prevent_first_page_modification
BEFORE UPDATE ON pages
FOR EACH ROW
WHEN OLD.id = 0 AND (
    NEW.is_subset != OLD.is_subset OR
    NEW.start_beat != OLD.start_beat
)
BEGIN
    SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
END;`,
    prevent_first_page_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_first_page_deletion
BEFORE DELETE ON pages
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
END;`,
    prevent_utility_deletion: `CREATE TRIGGER IF NOT EXISTS prevent_utility_deletion
BEFORE DELETE ON utility
FOR EACH ROW
WHEN OLD.id = 0
BEGIN
    SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
END;`,
};

/**
 * Drops all triggers from the database.
 * @param db - The database instance to drop triggers from (Drizzle ORM connection)
 * @param rawDb - Optional raw database connection (better-sqlite3). If provided, uses exec() directly to avoid semicolon stripping.
 */
export const dropAllTriggers = async (
    db: DbConnection | DB,
    rawDb?: Database.Database,
) => {
    for (const [name] of Object.entries(triggers)) {
        if (!name || name.trim() === "") {
            console.warn("Skipping empty trigger name");
            continue;
        }
        try {
            const query = `DROP TRIGGER IF EXISTS ${name}`;
            if (!query || query.trim() === "") {
                console.warn(`Skipping empty query for trigger ${name}`);
                continue;
            }
            // Use rawDb if available to avoid SQL proxy issues
            if (rawDb) {
                rawDb.exec(query);
            } else {
                await db.run(sql.raw(query));
            }
        } catch (error) {
            // Ignore errors - triggers might not exist (e.g., new database)
            // This is safe because we're using IF EXISTS
            console.debug(
                `Could not drop trigger ${name} (may not exist):`,
                error,
            );
        }
    }
};

/**
 * Creates all triggers in the database.
 * @param db - The database instance to create triggers in (Drizzle ORM connection)
 * @param rawDb - Optional raw database connection (better-sqlite3). If provided, uses exec() directly to avoid semicolon stripping.
 */
export const createAllTriggers = async (
    db: DbConnection | DB,
    rawDb?: Database.Database,
) => {
    for (const [name, trigger] of Object.entries(triggers)) {
        if (!name || name.trim() === "" || !trigger || trigger.trim() === "") {
            console.warn(
                `Skipping invalid trigger: name="${name}", trigger empty=${!trigger}`,
            );
            continue;
        }
        try {
            const dropQuery = `DROP TRIGGER IF EXISTS ${name}`;
            // Drop trigger first if it exists
            try {
                if (rawDb) {
                    rawDb.exec(dropQuery);
                } else {
                    await db.run(sql.raw(dropQuery));
                }
            } catch (dropError) {
                // Ignore drop errors - trigger might not exist
            }

            // Create the trigger
            // Use rawDb.exec() if available to avoid semicolon stripping in SQL proxy
            const createQuery = trigger.trim();
            if (!createQuery || createQuery === "") {
                console.error(`Trigger SQL is empty for ${name}`);
                continue;
            }
            if (rawDb) {
                rawDb.exec(createQuery);
            } else {
                await db.run(sql.raw(createQuery));
            }
        } catch (error) {
            console.error(`Error creating trigger ${name}:`, error);
            throw error;
        }
    }
};
